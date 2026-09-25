import { Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { FreightRequestStatus } from '@entities/freight-requests.entity';
import {
  EntityType,
  IconStyles,
  Notification,
  NotificationCategory,
  NotificationStatus,
} from '@entities/notifications.entity';
import { SQSService } from '@components/sqs/sqs.service';

/** Solicitação pendente vale 48 h (ou até o dia da coleta, se vier antes). */
export const REQUEST_TTL_HOURS = 48;

/** Solicitações que a transportadora ainda pode aceitar ou recusar. */
export const OPEN_REQUEST_STATUSES: FreightRequestStatus[] = [
  FreightRequestStatus.PENDING,
  FreightRequestStatus.AWAITING_USER_DRIVE_RESPONSE,
];

/** Aviso ao motorista via SQS (push pelo worker), enviado depois do commit. */
export interface DriverMessage {
  freightRequestId: string;
  driverId: string;
  freightId: string;
  status: string;
  expiresAt: string;
  routeId?: string;
  /** Texto pronto do push (o worker não precisa do frete, que pode ter sido apagado). */
  title?: string;
  body?: string;
  screen?: string;
}

/** Por que as solicitações abertas foram encerradas sem aceite. */
export type OpenRequestCloseReason = 'expired' | 'freight_closed' | 'freight_deleted';

const NOTICE: Record<
  OpenRequestCloseReason,
  { title: string; message: (route: string, company: string) => string; hint: string }
> = {
  expired: {
    title: 'Solicitação expirada',
    message: (route, company) =>
      `Sua solicitação do frete ${route} expirou sem resposta${company ? ` da transportadora ${company}` : ''}.`,
    hint: 'Continue buscando: novos fretes aparecem no app o tempo todo.',
  },
  freight_closed: {
    title: 'Frete encerrado',
    message: (route, company) =>
      `${company ? `A transportadora ${company}` : 'A transportadora'} encerrou o frete ${route}. Sua solicitação foi cancelada.`,
    hint: 'Continue buscando: novos fretes aparecem no app o tempo todo.',
  },
  freight_deleted: {
    title: 'Frete removido',
    message: (route, company) =>
      `${company ? `A transportadora ${company}` : 'A transportadora'} removeu o frete ${route}. Sua solicitação foi cancelada.`,
    hint: 'Continue buscando: novos fretes aparecem no app o tempo todo.',
  },
};

const place = (city: string | null, state: string | null) =>
  city ? (state ? `${city}/${state}` : city) : 'origem não informada';

/**
 * Recusa as solicitações abertas (PENDING/AWAITING) dos fretes ou ids
 * informados, grava a notificação de cada motorista e devolve as mensagens
 * de push para enviar depois do commit. Roda dentro da transação do chamador.
 */
export async function rejectOpenRequests(
  manager: EntityManager,
  target: { freightIds?: string[]; requestIds?: string[] },
  reason: OpenRequestCloseReason,
  now = new Date(),
  /** Quem encerrou (histórico). Padrão: "Sistema" (prazo vencido). */
  byName = 'Sistema',
): Promise<DriverMessage[]> {
  const freightIds = target.freightIds ?? [];
  const requestIds = target.requestIds ?? [];
  if (!freightIds.length && !requestIds.length) return [];

  const [rows] = await manager.query(
    `UPDATE "freight_requests" r
        SET "status" = $1, "respondedAt" = $2, "expiresAt" = NULL, "updatedAt" = $2, "respondedByName" = $6
       FROM "freight" f
      WHERE f."id" = r."freightId"
        AND r."status" = ANY($3::freight_requests_status_enum[])
        AND (r."freightId" = ANY($4::varchar[]) OR r."id" = ANY($5::varchar[]))
  RETURNING r."id", r."userDriveId", r."freightId", f."companyId",
            COALESCE(NULLIF(f."originCityName", ''), f."originCity") AS "originCity", f."originState",
            COALESCE(NULLIF(f."destinyCityName", ''), f."destinyCity") AS "destinyCity", f."destinyState"`,
    [FreightRequestStatus.REJECTED, now, OPEN_REQUEST_STATUSES, freightIds, requestIds, byName],
  );
  const closed: Array<Record<string, string | null>> = (rows ?? []).filter((r) => r.userDriveId);
  if (!closed.length) return [];

  const companyIds = [...new Set(closed.map((r) => r.companyId).filter(Boolean))];
  const companies: Array<{ id: string; name: string }> = await manager.query(
    `SELECT "id", COALESCE(NULLIF("nameFantasy", ''), "name") AS "name" FROM "company" WHERE "id" = ANY($1::varchar[])`,
    [companyIds],
  );
  const companyName = new Map(companies.map((c) => [c.id, c.name ?? '']));
  const notice = NOTICE[reason];

  const texts = new Map(
    closed.map((r) => {
      const route = `de ${place(r.originCity, r.originState)} para ${place(r.destinyCity, r.destinyState)}`;
      return [r.id, notice.message(route, companyName.get(r.companyId) ?? '')];
    }),
  );

  const notifications = manager.getRepository(Notification);
  await notifications.insert(
    closed.map((r) =>
      notifications.create({
        title: notice.title,
        message: texts.get(r.id),
        senderType: EntityType.COMPANY,
        senderId: r.companyId,
        recipientType: EntityType.USER,
        recipientId: r.userDriveId,
        category: NotificationCategory.FREIGHT,
        status: NotificationStatus.UNREAD,
        payload: { message: notice.hint, freightId: r.freightId, freightRequestId: r.id, reason },
        iconStyle: IconStyles.FREIGHT_RECUSED,
        createdAt: now,
      }),
    ),
  );

  return closed.map((r) => ({
    freightRequestId: r.id,
    driverId: r.userDriveId,
    freightId: r.freightId,
    status: FreightRequestStatus.REJECTED,
    expiresAt: '',
    title: notice.title,
    body: `${texts.get(r.id)} ${notice.hint}`,
    screen: 'MyFreights',
  }));
}

/** Envia os pushes; falha na fila só vai para o log (não desfaz a operação). */
export async function sendDriverMessages(
  sqs: SQSService,
  logger: Logger,
  messages: DriverMessage[],
): Promise<void> {
  await Promise.all(
    messages.map(async (message) => {
      try {
        await sqs.sendNotificationToDriver(message);
      } catch (error) {
        logger.warn(
          `Aviso SQS não enviado (solicitação ${message.freightRequestId}, status ${message.status}): ${error?.message ?? error}`,
        );
      }
    }),
  );
}
