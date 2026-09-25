import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { EntityManager, In, Not, Repository } from 'typeorm';
import {
  FreightRequest,
  FreightRequestStatus,
} from '@entities/freight-requests.entity';
import { CreateFreightRequestDto } from './dto/create-freight-request.dto';
import { ParamsFreightRequest } from './interface/IFreightRequest';
import { Freight } from '@entities/freight.entity';
import { FreightRoutes, RouteStatus } from '@entities/freight-routes.entity';
import { UsersDrive } from '@entities/users-drive.entity';
import { SQSService } from '@components/sqs/sqs.service';
import {
  findOccupyingRouteId,
  syncDriverOnRoute,
} from '@components/freight-route/driver-on-route';
import {
  EntityType,
  IconStyles,
  Notification,
  NotificationCategory,
  NotificationStatus,
} from '@entities/notifications.entity';
import {
  DriverMessage,
  OPEN_REQUEST_STATUSES,
  sendDriverMessages,
} from './driver-notices';
import { Actor, actorName } from 'src/decorators/get-actor.decorator';

/** Status aceitos no filtro da lista (o portal manda vários separados por vírgula). */
const REQUEST_STATUS_VALUES = new Set<string>(Object.values(FreightRequestStatus));

/** Solicitações de motorista que está com o frete (rota em andamento). */
const IN_ROUTE_REQUEST_STATUSES: FreightRequestStatus[] = [
  FreightRequestStatus.ACCEPTED,
  FreightRequestStatus.DRIVER_CONFIRMED_DELIVERY,
  FreightRequestStatus.NOT_CONFIRMED_DELIVERY,
];

/** Motivo do 409 quando a solicitação não pode mais ser aceita/recusada. */
const CLOSED_REQUEST_MESSAGES: Partial<Record<FreightRequestStatus, string>> = {
  [FreightRequestStatus.ACCEPTED]: 'Esta solicitação já foi aceita.',
  [FreightRequestStatus.DRIVER_CONFIRMED_DELIVERY]:
    'Esta solicitação já foi aceita e o motorista informou a entrega.',
  [FreightRequestStatus.NOT_CONFIRMED_DELIVERY]:
    'Esta solicitação já foi aceita.',
  [FreightRequestStatus.DELIVERY_COMPLETED]:
    'Esta solicitação já foi concluída.',
  [FreightRequestStatus.REJECTED]: 'Esta solicitação já foi recusada.',
  [FreightRequestStatus.CANCELED_BY_DRIVER]:
    'O motorista desistiu deste frete.',
};

/** Frete lido com `FOR UPDATE` dentro da transação do aceite. */
interface LockedFreight {
  id: string;
  companyId: string | null;
  isActive: boolean;
  openSolicitations: boolean;
  isExclude: boolean;
  originCity: string | null;
  originState: string | null;
  originCityName: string | null;
  destinyCity: string | null;
  destinyState: string | null;
  destinyCityName: string | null;
}

/** "Uberlândia/MG": cidade normalizada (coluna gerada) com a UF. */
function placeLabel(
  city: string | null,
  cityName: string | null,
  state: string | null,
): string {
  const name = cityName || city || 'origem não informada';
  return state ? `${name}/${state}` : name;
}

function originLabel(freight: LockedFreight): string {
  return placeLabel(
    freight.originCity,
    freight.originCityName,
    freight.originState,
  );
}

function destinyLabel(freight: LockedFreight): string {
  return placeLabel(
    freight.destinyCity,
    freight.destinyCityName,
    freight.destinyState,
  );
}

function notFound(message = 'Solicitação não encontrada.'): HttpException {
  return new HttpException(message, HttpStatus.NOT_FOUND);
}

function conflict(message: string, errorCode: string): HttpException {
  return new HttpException({ message, errorCode }, HttpStatus.CONFLICT);
}

@Injectable()
export class FreightRequestService {
  private readonly logger = new Logger(FreightRequestService.name);

  constructor(
    @InjectRepository(FreightRequest)
    private readonly freightRequestRepository: Repository<FreightRequest>,
    @InjectRepository(Freight)
    private readonly freightRepository: Repository<Freight>,
    @InjectRepository(FreightRoutes)
    private readonly freightRoutesRepository: Repository<FreightRoutes>,
    @InjectRepository(UsersDrive)
    private readonly userDriveRepository: Repository<UsersDrive>,
    private readonly sqsService: SQSService,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  /**
   * Solicitação criada pela própria transportadora: o frete precisa ser dela,
   * o `companyId` vem do token e o status começa sempre em PENDING.
   */
  async create(
    companyId: string,
    createFreightRequestDto: CreateFreightRequestDto,
  ): Promise<FreightRequest> {
    const freight = await this.freightRepository.findOne({
      where: { id: createFreightRequestDto.freightId, companyId },
      select: ['id', 'companyId'],
    });

    if (!freight) {
      throw notFound('Frete não encontrado.');
    }

    try {
      const newRequest = this.freightRequestRepository.create({
        freightId: freight.id,
        userDriveId: createFreightRequestDto.userDriveId,
        companyId: freight.companyId,
        status: FreightRequestStatus.PENDING,
      });
      return await this.freightRequestRepository.save(newRequest);
    } catch (error) {
      this.logger.error('Erro ao criar solicitação de frete', error);
      throw new HttpException(
        'Não foi possível registrar a solicitação.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Solicitações dos fretes da empresa. O dono é o do frete: o `companyId`
   * gravado na solicitação vem do app do motorista.
   */
  async findAll(userId: string, params: ParamsFreightRequest = {}) {
    try {
      const take = params.take ?? 10;
      const page = params.page ?? 1;

      const queryBuilder = this.freightRequestRepository
        .createQueryBuilder('freight_requests')
        .where('freight.companyId = :companyId', {
          companyId: userId,
        });

      const filters: Record<string, any> = {
        'freight_requests.id': params.id,
        'freight_requests.userDriveId': params.userDriveId,
        'freight_requests.freightId': params.freightId,
      };

      Object.entries(filters).forEach(([key, value]) => {
        if (value) queryBuilder.andWhere(`${key} = :${key}`, { [key]: value });
      });

      const statuses = String(params.status ?? '')
        .split(',')
        .map((status) => status.trim())
        .filter((status) => REQUEST_STATUS_VALUES.has(status));
      if (statuses.length) {
        queryBuilder.andWhere('freight_requests.status IN (:...statuses)', { statuses });
      }

      // Busca do portal: nome do motorista, ou CPF/telefone pelos dígitos.
      const term = String(params.name ?? params.q ?? '').trim();
      if (term) {
        const digits = term.replace(/\D/g, '');
        const byName = 'unaccent(lower(users_drive.name)) LIKE unaccent(lower(:term))';
        queryBuilder.andWhere(
          digits.length >= 3
            ? `(${byName}
                OR regexp_replace(coalesce(users_drive.cpf, ''), '\\D', '', 'g') LIKE :digits
                OR regexp_replace(coalesce(users_drive."phoneNumber", ''), '\\D', '', 'g') LIKE :digits)`
            : byName,
          { term: `%${term}%`, digits: `%${digits}%` },
        );
      }

      const [result, total] = await queryBuilder
        .select([
          'freight_requests.id',
          'freight_requests.freightId',
          'freight_requests.userDriveId',
          'freight_requests.companyId',
          'freight_requests.status',
          'freight_requests.solicitationsOrder',
          'freight_requests.expiresAt',
          'freight_requests.respondedAt',
          'freight_requests.deliveryInformedAt',
          'freight_requests.createdAt',
          'freight_requests.updatedAt',
        ])
        .leftJoinAndSelect('freight_requests.freight', 'freight')
        .leftJoin('freight.contactCompany', 'contact_company')
        .leftJoin('freight_requests.userDrive', 'users_drive')
        .leftJoin('users_drive.vehicles', 'vehicle')
        .leftJoin('users_drive.locations', 'location')
        .leftJoinAndSelect('users_drive.reviewUserDrive', 'reviewUserDrive')
        .addSelect([
          'contact_company.name',
          'contact_company.phoneNumber',
          'users_drive.name',
          'users_drive.cnh',
          'users_drive.antt',
          'users_drive.city',
          'users_drive.cpf',
          'users_drive.zipcode',
          'users_drive.photoFaceURL',
          'users_drive.phoneNumber',
          'users_drive.id',
          'vehicle.vehicleType',
          'vehicle.bodyType',
          'location.city',
          'location.latitude',
          'location.longitude',
        ])

        .orderBy('freight_requests.solicitationsOrder', 'ASC')
        .addOrderBy('freight_requests.createdAt', 'DESC')
        .skip((page - 1) * take)
        .take(take)
        .getManyAndCount();

      return { data: result, count: total };
    } catch (error) {
      this.logger.error('Erro ao listar solicitações de frete', error);
      throw new HttpException(
        'Erro ao buscar as solicitações de frete.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Aceite em 1 passo: a transportadora escolhe o motorista e a rota começa.
   *
   * Numa transação, com o frete e o motorista travados (`FOR UPDATE`):
   * solicitação -> ACCEPTED; cria a rota PROGUESS; fecha o frete; marca o
   * motorista em rota; recusa as demais solicitações abertas do frete e
   * grava as notificações. Os avisos SQS saem depois do commit.
   */
  async acceptFreightRequest(companyId: string, freightRequestId: string, actor?: Actor) {
    const now = new Date();

    try {
      const outcome = await this.freightRequestRepository.manager.transaction(
        async (manager) => {
          const requestRepository = manager.getRepository(FreightRequest);
          const { request, freight } = await this.lockOwnedRequest(
            manager,
            companyId,
            freightRequestId,
          );

          if (IN_ROUTE_REQUEST_STATUSES.includes(request.status)) {
            throw conflict(
              CLOSED_REQUEST_MESSAGES[request.status],
              'FREIGHT_REQUEST_ALREADY_ACCEPTED',
            );
          }

          if (freight.isExclude) {
            throw conflict('Este frete foi excluído.', 'FREIGHT_EXCLUDED');
          }

          if (!freight.isActive || !freight.openSolicitations) {
            throw conflict(
              'Este frete já foi fechado e não recebe mais solicitações.',
              'FREIGHT_CLOSED',
            );
          }

          if (!OPEN_REQUEST_STATUSES.includes(request.status)) {
            throw conflict(
              CLOSED_REQUEST_MESSAGES[request.status] ??
                'Esta solicitação não está mais aguardando resposta.',
              'FREIGHT_REQUEST_NOT_OPEN',
            );
          }

          if (!request.userDriveId) {
            throw conflict(
              'Solicitação sem motorista vinculado.',
              'FREIGHT_REQUEST_WITHOUT_DRIVER',
            );
          }

          const [driver] = await manager.query(
            `SELECT "id", "name" FROM "users_drive" WHERE "id" = $1 FOR UPDATE`,
            [request.userDriveId],
          );

          if (!driver) {
            throw notFound('Motorista não encontrado.');
          }

          const routeRepository = manager.getRepository(FreightRoutes);

          const freightRoute = await routeRepository.findOne({
            where: {
              freightId: freight.id,
              status: RouteStatus.IN_PROGRESS,
              isActive: true,
            },
            select: ['id'],
          });

          if (freightRoute) {
            throw conflict(
              'Este frete já tem um motorista em rota.',
              'FREIGHT_ALREADY_IN_ROUTE',
            );
          }

          // Não usa `users_drive.isOnRoute`: o campo fica desatualizado (o cron
          // de conclusão automática não o zera). Vale a rota que ainda ocupa o
          // motorista (entrega não informada por ele).
          const driverRouteId = await findOccupyingRouteId(
            manager,
            request.userDriveId,
          );

          if (driverRouteId) {
            throw conflict(
              'Este motorista já está em outra rota em andamento.',
              'DRIVER_ALREADY_IN_ROUTE',
            );
          }

          const routeId = randomUUID();
          const byName = actor ? await actorName(manager, actor) : null;

          await requestRepository.update(
            { id: request.id },
            { status: FreightRequestStatus.ACCEPTED, expiresAt: null, respondedAt: now, respondedByName: byName },
          );

          await routeRepository.insert({
            id: routeId,
            freightId: freight.id,
            userDriveId: request.userDriveId,
            companyId: freight.companyId,
            status: RouteStatus.IN_PROGRESS,
            isActive: true,
            startedAt: now,
            completedAt: null,
          });

          await manager
            .getRepository(Freight)
            .update(
              { id: freight.id },
              { isActive: false, openSolicitations: false },
            );

          await manager
            .getRepository(UsersDrive)
            .update({ id: request.userDriveId }, { isOnRoute: true });

          const others = await requestRepository.find({
            where: {
              freightId: freight.id,
              id: Not(request.id),
              status: In(OPEN_REQUEST_STATUSES),
            },
            select: ['id', 'userDriveId'],
          });

          if (others.length) {
            await requestRepository.update(
              { id: In(others.map((other) => other.id)) },
              { status: FreightRequestStatus.REJECTED, expiresAt: null, respondedAt: now, respondedByName: byName },
            );
          }

          const companyName = await this.getCompanyName(manager, companyId);
          const origin = originLabel(freight);
          const destiny = destinyLabel(freight);

          const notifications = [
            this.notificationRepository.create({
              title: 'Frete aceito',
              message: `Frete aceito! Pode iniciar a rota de ${origin} para ${destiny}.`,
              senderType: EntityType.COMPANY,
              senderId: companyId,
              recipientType: EntityType.USER,
              recipientId: request.userDriveId,
              category: NotificationCategory.FREIGHT,
              status: NotificationStatus.UNREAD,
              payload: {
                message: `A transportadora ${companyName} aceitou você neste frete. Abra o app e boa viagem!`,
                freightId: freight.id,
                freightRequestId: request.id,
                routeId,
              },
              iconStyle: IconStyles.FREIGHT_ACCEPTED,
              createdAt: now,
            }),
            ...others
              .filter((other) => other.userDriveId)
              .map((other) =>
                this.notificationRepository.create({
                  title: 'Solicitação não aceita',
                  message: `A transportadora ${companyName} não pôde aceitar sua solicitação do frete de ${origin} para ${destiny}.`,
                  senderType: EntityType.COMPANY,
                  senderId: companyId,
                  recipientType: EntityType.USER,
                  recipientId: other.userDriveId,
                  category: NotificationCategory.FREIGHT,
                  status: NotificationStatus.UNREAD,
                  payload: {
                    message:
                      'O frete foi fechado com outro motorista. Continue buscando: novos fretes aparecem no app o tempo todo.',
                    freightId: freight.id,
                    freightRequestId: other.id,
                  },
                  iconStyle: IconStyles.FREIGHT_RECUSED,
                  createdAt: now,
                }),
              ),
          ];

          await manager.getRepository(Notification).insert(notifications);

          const messages: DriverMessage[] = [
            {
              freightRequestId: request.id,
              driverId: request.userDriveId,
              freightId: freight.id,
              status: FreightRequestStatus.ACCEPTED,
              expiresAt: '',
              routeId,
            },
            ...others
              .filter((other) => other.userDriveId)
              .map((other) => ({
                freightRequestId: other.id,
                driverId: other.userDriveId,
                freightId: freight.id,
                status: FreightRequestStatus.REJECTED,
                expiresAt: '',
              })),
          ];

          return { routeId, freightRequestId: request.id, messages };
        },
      );

      await this.notifyDrivers(outcome.messages);

      return {
        success: true,
        message: 'Motorista aceito. Ele foi avisado para iniciar a rota.',
        routeId: outcome.routeId,
        freightRequestId: outcome.freightRequestId,
        status: FreightRequestStatus.ACCEPTED,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;

      this.logger.error('Erro ao aceitar solicitação de frete', error);
      throw new HttpException(
        'Não foi possível aceitar a solicitação agora. Tente novamente.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Transportadora confirma a entrega: rota -> COMPLETED (com `completedAt`),
   * solicitação -> DELIVERY_COMPLETED e motorista fora de rota. Aceita a
   * solicitação aceita (confirmação direto do monitoramento) ou com a
   * entrega já informada pelo motorista.
   */
  async confirmedFreightRequest(companyId: string, freightRequestId: string, actor?: Actor) {
    const now = new Date();

    try {
      const outcome = await this.freightRequestRepository.manager.transaction(
        async (manager) => {
          const { request, freight } = await this.lockOwnedRequest(
            manager,
            companyId,
            freightRequestId,
          );

          if (request.status === FreightRequestStatus.DELIVERY_COMPLETED) {
            throw conflict(
              'Esta entrega já foi confirmada.',
              'DELIVERY_ALREADY_CONFIRMED',
            );
          }

          if (!IN_ROUTE_REQUEST_STATUSES.includes(request.status)) {
            throw conflict(
              'Esta solicitação não tem entrega em andamento.',
              'FREIGHT_REQUEST_NOT_IN_ROUTE',
            );
          }

          const routeRepository = manager.getRepository(FreightRoutes);
          const activeRoute = await routeRepository.findOne({
            where: {
              userDriveId: request.userDriveId,
              freightId: freight.id,
              status: RouteStatus.IN_PROGRESS,
            },
            select: ['id'],
            lock: { mode: 'pessimistic_write' },
          });

          const byName = actor ? await actorName(manager, actor) : null;
          let routeId = activeRoute?.id ?? null;
          if (activeRoute) {
            await routeRepository.update(
              { id: activeRoute.id },
              {
                status: RouteStatus.COMPLETED,
                isActive: false,
                completedAt: now,
                completedByName: byName,
              },
            );
          } else if (request.userDriveId) {
            // Aceite antigo sem viagem registrada: grava a viagem concluída para
            // a entrega contar no painel e no histórico do motorista.
            routeId = randomUUID();
            await routeRepository.insert({
              id: routeId,
              freightId: freight.id,
              userDriveId: request.userDriveId,
              companyId: freight.companyId,
              status: RouteStatus.COMPLETED,
              isActive: false,
              startedAt: request.respondedAt ?? request.updatedAt ?? now,
              completedAt: now,
              completedByName: byName,
            });
          }

          await manager.getRepository(FreightRequest).update(
            { id: request.id },
            {
              status: FreightRequestStatus.DELIVERY_COMPLETED,
              expiresAt: now,
            },
          );

          if (request.userDriveId) {
            await syncDriverOnRoute(manager, request.userDriveId);
          }

          const companyName = await this.getCompanyName(manager, companyId);

          await manager.getRepository(Notification).insert(
            this.notificationRepository.create({
              title: 'Entrega confirmada',
              message: `A transportadora ${companyName} confirmou a entrega do frete de ${originLabel(freight)} para ${destinyLabel(freight)}.`,
              senderType: EntityType.COMPANY,
              senderId: companyId,
              recipientType: EntityType.USER,
              recipientId: request.userDriveId,
              category: NotificationCategory.FREIGHT,
              status: NotificationStatus.UNREAD,
              payload: {
                message:
                  'Entrega confirmada. Não esqueça de avaliar este frete.',
                freightId: freight.id,
                freightRequestId: request.id,
                routeId,
              },
              iconStyle: IconStyles.FREIGHT_ACCEPTED,
              createdAt: now,
            }),
          );

          const messages: DriverMessage[] = request.userDriveId
            ? [
                {
                  freightRequestId: request.id,
                  driverId: request.userDriveId,
                  freightId: freight.id,
                  status: FreightRequestStatus.DELIVERY_COMPLETED,
                  expiresAt: now.toISOString(),
                  ...(routeId ? { routeId } : {}),
                },
              ]
            : [];

          return { routeId, messages };
        },
      );

      await this.notifyDrivers(outcome.messages);

      return {
        success: true,
        message: 'Entrega confirmada.',
        accepted: true,
        status: FreightRequestStatus.DELIVERY_COMPLETED,
        freightRequestId,
        routeId: outcome.routeId,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;

      this.logger.error('Erro ao confirmar entrega', error);
      throw new HttpException(
        'Não foi possível confirmar a entrega agora. Tente novamente.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Recusa pela transportadora. Dois casos:
   * - solicitação aberta (PENDING/AWAITING): vira REJECTED e o motorista é
   *   avisado de que a transportadora não pôde aceitar a solicitação;
   * - entrega informada pelo motorista (DRIVER_CONFIRMED_DELIVERY): a entrega
   *   não é confirmada, a solicitação volta para ACCEPTED (rota segue em
   *   andamento) e o motorista recebe o aviso de entrega não confirmada.
   */
  async rejectFreightRequest(companyId: string, freightRequestId: string, actor?: Actor) {
    const now = new Date();

    try {
      const outcome = await this.freightRequestRepository.manager.transaction(
        async (manager) => {
          const { request, freight } = await this.lockOwnedRequest(
            manager,
            companyId,
            freightRequestId,
          );
          const requestRepository = manager.getRepository(FreightRequest);
          const companyName = await this.getCompanyName(manager, companyId);
          const origin = originLabel(freight);
          const destiny = destinyLabel(freight);

          if (OPEN_REQUEST_STATUSES.includes(request.status)) {
            await requestRepository.update(
              { id: request.id },
              {
                status: FreightRequestStatus.REJECTED,
                expiresAt: null,
                respondedAt: now,
                respondedByName: actor ? await actorName(manager, actor) : null,
              },
            );

            if (request.userDriveId) {
              await manager.getRepository(Notification).insert(
                this.notificationRepository.create({
                  title: 'Solicitação não aceita',
                  message: `A transportadora ${companyName} não pôde aceitar sua solicitação do frete de ${origin} para ${destiny}.`,
                  senderType: EntityType.COMPANY,
                  senderId: companyId,
                  recipientType: EntityType.USER,
                  recipientId: request.userDriveId,
                  category: NotificationCategory.FREIGHT,
                  status: NotificationStatus.UNREAD,
                  payload: {
                    message:
                      'A transportadora não pôde aceitar sua solicitação. Continue buscando: novos fretes aparecem no app o tempo todo.',
                    freightId: freight.id,
                    freightRequestId: request.id,
                  },
                  iconStyle: IconStyles.FREIGHT_RECUSED,
                  createdAt: now,
                }),
              );
            }

            return {
              status: FreightRequestStatus.REJECTED,
              message: 'Solicitação recusada. O motorista foi avisado.',
              messages: request.userDriveId
                ? [
                    {
                      freightRequestId: request.id,
                      driverId: request.userDriveId,
                      freightId: freight.id,
                      status: FreightRequestStatus.REJECTED,
                      expiresAt: '',
                    },
                  ]
                : [],
            };
          }

          if (
            request.status === FreightRequestStatus.DRIVER_CONFIRMED_DELIVERY
          ) {
            const activeRoute = await manager
              .getRepository(FreightRoutes)
              .findOne({
                where: {
                  userDriveId: request.userDriveId,
                  freightId: freight.id,
                  status: RouteStatus.IN_PROGRESS,
                },
                select: ['id'],
              });

            if (!activeRoute) {
              throw conflict(
                'A rota deste frete já foi encerrada. Não é possível recusar a entrega.',
                'ROUTE_ALREADY_CLOSED',
              );
            }

            await requestRepository.update(
              { id: request.id },
              { status: FreightRequestStatus.ACCEPTED, expiresAt: null },
            );
            await manager
              .getRepository(UsersDrive)
              .update({ id: request.userDriveId }, { isOnRoute: true });

            await manager.getRepository(Notification).insert(
              this.notificationRepository.create({
                title: 'Não pudemos confirmar sua entrega',
                message: `A transportadora ${companyName} não confirmou a entrega do frete de ${origin} para ${destiny}.`,
                senderType: EntityType.COMPANY,
                senderId: companyId,
                recipientType: EntityType.USER,
                recipientId: request.userDriveId,
                category: NotificationCategory.FREIGHT,
                status: NotificationStatus.UNREAD,
                payload: {
                  message:
                    'A transportadora informou que o frete ainda não foi entregue. Se precisar de ajuda, fale com nosso suporte: (34) 99733-6677.',
                  freightId: freight.id,
                  freightRequestId: request.id,
                  routeId: activeRoute.id,
                },
                iconStyle: IconStyles.FREIGHT_RECUSED,
                createdAt: now,
              }),
            );

            return {
              status: FreightRequestStatus.ACCEPTED,
              message: 'Entrega não confirmada. O motorista foi avisado.',
              messages: [
                {
                  freightRequestId: request.id,
                  driverId: request.userDriveId,
                  freightId: freight.id,
                  status: FreightRequestStatus.NOT_CONFIRMED_DELIVERY,
                  expiresAt: now.toISOString(),
                  routeId: activeRoute.id,
                },
              ],
            };
          }

          throw conflict(
            CLOSED_REQUEST_MESSAGES[request.status] ??
              'Esta solicitação não pode ser recusada.',
            'FREIGHT_REQUEST_NOT_REJECTABLE',
          );
        },
      );

      await this.notifyDrivers(outcome.messages);

      return {
        success: true,
        message: outcome.message,
        status: outcome.status,
        freightRequestId,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;

      this.logger.error('Erro ao recusar solicitação de frete', error);
      throw new HttpException(
        'Não foi possível recusar a solicitação agora. Tente novamente.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** Frete travado para a transação (inclui as cidades normalizadas). */
  private async lockFreight(
    manager: EntityManager,
    freightId: string,
  ): Promise<LockedFreight | null> {
    const [freight] = await manager.query(
      `SELECT "id", "companyId", "isActive", "openSolicitations", "isExclude",
              "originCity", "originState", "originCityName",
              "destinyCity", "destinyState", "destinyCityName"
         FROM "freight"
        WHERE "id" = $1
        FOR UPDATE`,
      [freightId],
    );
    return freight ?? null;
  }

  /**
   * Frete e solicitação travados, nessa ordem (a mesma em todos os fluxos,
   * para não haver deadlock entre aceite, recusa e confirmação), desde que o
   * frete seja da empresa do token. 404 caso contrário, sem revelar que o
   * registro existe.
   */
  private async lockOwnedRequest(
    manager: EntityManager,
    companyId: string,
    freightRequestId: string,
  ): Promise<{ request: FreightRequest; freight: LockedFreight }> {
    const requestRepository = manager.getRepository(FreightRequest);

    const preview = await requestRepository.findOne({
      where: { id: freightRequestId },
      select: ['id', 'freightId'],
    });

    if (!preview?.freightId) {
      throw notFound();
    }

    const freight = await this.lockFreight(manager, preview.freightId);

    if (!freight || freight.companyId !== companyId) {
      throw notFound();
    }

    const request = await requestRepository.findOne({
      where: { id: freightRequestId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!request || request.freightId !== freight.id) {
      throw notFound();
    }

    return { request, freight };
  }

  private async getCompanyName(
    manager: EntityManager,
    companyId: string,
  ): Promise<string> {
    const [company] = await manager.query(
      `SELECT COALESCE(NULLIF("nameFantasy", ''), "name") AS "name" FROM "company" WHERE "id" = $1`,
      [companyId],
    );
    return company?.name ?? '';
  }

  /**
   * Avisos ao motorista (push via worker). Rodam depois do commit: uma falha
   * na fila não desfaz o aceite, só fica registrada no log.
   */
  private async notifyDrivers(messages: DriverMessage[]): Promise<void> {
    await sendDriverMessages(this.sqsService, this.logger, messages);
  }
}
