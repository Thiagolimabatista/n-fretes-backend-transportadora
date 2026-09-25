import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { SQSService } from '@components/sqs/sqs.service';
import {
  DriverMessage,
  OPEN_REQUEST_STATUSES,
  REQUEST_TTL_HOURS,
  rejectOpenRequests,
  sendDriverMessages,
} from '@components/freight-request/driver-notices';

/** Lote por execução: o restante fica para a próxima (a cada 5 minutos). */
const BATCH = 200;

/**
 * Prazos do frete:
 * - solicitação pendente sem resposta vence em `expiresAt` (ou 48 h depois de
 *   criada, nas antigas sem prazo) e vira recusada, com aviso ao motorista;
 * - frete publicado vence em `expiresAt` (fim do dia da coleta): sai da busca
 *   dos motoristas e as solicitações abertas são encerradas.
 * `FOR UPDATE SKIP LOCKED`: várias instâncias podem rodar ao mesmo tempo.
 */
@Injectable()
export class FreightRequestCronService {
  private readonly logger = new Logger(FreightRequestCronService.name);
  private readonly backgroundJobsEnabled =
    (process.env.BACKGROUND_JOBS_ENABLED ?? 'true').toLowerCase() !== 'false';

  constructor(
    private readonly dataSource: DataSource,
    private readonly sqsService: SQSService,
  ) {}

  @Cron('0 */5 * * * *')
  async run() {
    if (!this.backgroundJobsEnabled) return;
    try {
      const expired = await this.expireOpenRequests();
      const closed = await this.closeExpiredFreights();
      if (expired || closed) {
        this.logger.log(`Prazos: ${expired} solicitação(ões) expirada(s), ${closed} frete(s) vencido(s) fechado(s).`);
      }
    } catch (error) {
      this.logger.error(`Falha ao aplicar prazos de fretes e solicitações: ${(error as Error).message}`);
    }
  }

  /** Solicitações pendentes vencidas -> recusadas (motivo: expirada). */
  async expireOpenRequests(now = new Date()): Promise<number> {
    const messages: DriverMessage[] = await this.dataSource.transaction(async (manager) => {
      const due: Array<{ id: string }> = await manager.query(
        `SELECT r."id"
           FROM "freight_requests" r
          WHERE r."status" = ANY($1::freight_requests_status_enum[])
            AND COALESCE(r."expiresAt", r."createdAt" + make_interval(hours => $2)) < $3
          ORDER BY r."createdAt"
          LIMIT ${BATCH}
          FOR UPDATE SKIP LOCKED`,
        [OPEN_REQUEST_STATUSES, REQUEST_TTL_HOURS, now],
      );
      if (!due.length) return [];
      return rejectOpenRequests(manager, { requestIds: due.map((r) => r.id) }, 'expired', now);
    });
    await sendDriverMessages(this.sqsService, this.logger, messages);
    return messages.length;
  }

  /** Fretes abertos com o prazo vencido e sem viagem em andamento -> fechados. */
  async closeExpiredFreights(now = new Date()): Promise<number> {
    const { count, messages } = await this.dataSource.transaction(async (manager) => {
      const due: Array<{ id: string }> = await manager.query(
        `SELECT f."id"
           FROM "freight" f
          WHERE f."isActive" = true AND f."isExclude" = false
            AND f."expiresAt" IS NOT NULL AND f."expiresAt" < $1
            AND NOT EXISTS (
              SELECT 1 FROM "freight_routes" r
               WHERE r."freightId" = f."id" AND r."status" = 'PROGUESS' AND r."isActive" = true)
          LIMIT ${BATCH}
          FOR UPDATE SKIP LOCKED`,
        [now],
      );
      if (!due.length) return { count: 0, messages: [] as DriverMessage[] };
      const ids = due.map((f) => f.id);
      await manager.query(
        `UPDATE "freight" SET "isActive" = false, "openSolicitations" = false, "updatedAt" = $2
          WHERE "id" = ANY($1::varchar[])`,
        [ids, now],
      );
      const notices = await rejectOpenRequests(manager, { freightIds: ids }, 'freight_closed', now);
      return { count: ids.length, messages: notices };
    });
    await sendDriverMessages(this.sqsService, this.logger, messages);
    return count;
  }
}
