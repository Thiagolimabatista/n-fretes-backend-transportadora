import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FreightRoutes, RouteStatus } from '@entities/freight-routes.entity';
import { ParamsFreightRoute } from './interface/IFreightRoute';
import { UsersDrive } from '@entities/users-drive.entity';
import { UsersLocation } from '@entities/users-location.entity';
import { Freight } from '@entities/freight.entity';
import { FreightRequest, FreightRequestStatus } from '@entities/freight-requests.entity';
import { FreightRequestService } from '@components/freight-request/freight-request.service';
import {
  DriverMessage,
  OPEN_REQUEST_STATUSES,
  sendDriverMessages,
} from '@components/freight-request/driver-notices';
import { SQSService } from '@components/sqs/sqs.service';
import { Actor, actorName } from 'src/decorators/get-actor.decorator';
import { freightExpiry, isPickupPast } from 'src/utils/freight-dates';
import {
  EntityType,
  IconStyles,
  Notification,
  NotificationCategory,
  NotificationStatus,
} from '@entities/notifications.entity';
import { syncDriverOnRoute } from './driver-on-route';
import {
  LastLocation,
  RouteTimeline,
  TimelineCity,
  TimelineEvent,
  TimelinePoint,
  TimelineProgress,
} from './interface/IRouteTracking';
import { distanceKm as distanceKmBetween, nearestCity } from 'src/utils/nearest-city';
import { toDayKey } from 'src/utils/freight-dates';

/** Estrada é mais longa que a linha reta: fator médio usado na previsão. */
const ROAD_FACTOR = 1.2;
/** Velocidade média considerada na previsão (limites e padrão), em km/h. */
const MIN_SPEED = 35;
const MAX_SPEED = 75;
const DEFAULT_SPEED = 55;

/**
 * Cidades por onde o motorista passou: cada ponto vira a sede de município
 * mais próxima (até 25 km); pontos seguidos na mesma cidade viram uma
 * passagem com hora de chegada e de saída.
 */
function citiesAlong(points: TimelinePoint[]): TimelineCity[] {
  const cities: TimelineCity[] = [];
  for (const point of points) {
    const city = nearestCity(point.latitude, point.longitude);
    if (!city) continue;
    const last = cities[cities.length - 1];
    if (last && last.name === city.name && last.state === city.state) {
      last.leftAt = point.recordedAt;
    } else {
      cities.push({
        name: city.name,
        state: city.state,
        arrivedAt: point.recordedAt,
        leftAt: point.recordedAt,
        current: false,
      });
    }
  }
  const lastPoint = points[points.length - 1];
  const lastCity = lastPoint ? nearestCity(lastPoint.latitude, lastPoint.longitude) : null;
  if (lastCity && cities.length) {
    const tail = cities[cities.length - 1];
    tail.current = tail.name === lastCity.name && tail.state === lastCity.state;
  }
  return cities;
}

/** Máximo de pontos devolvidos na linha do tempo (amostragem uniforme). */
const TIMELINE_MAX_POINTS = 500;

/** Status de quem ficou com o frete: preferidos ao ligar rota e solicitação. */
const ROUTE_REQUEST_STATUSES = [
  FreightRequestStatus.ACCEPTED,
  FreightRequestStatus.DRIVER_CONFIRMED_DELIVERY,
  FreightRequestStatus.NOT_CONFIRMED_DELIVERY,
  FreightRequestStatus.DELIVERY_COMPLETED,
  FreightRequestStatus.CANCELED_BY_DRIVER,
];

/** Data opcional vinda da query string; 400 se não for uma data válida. */
function parseOptionalDate(
  value: string | undefined,
  field: string,
): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpException(
      `Data inválida em ${field}. Use o formato ISO (ex.: 2026-09-14T00:00:00.000Z).`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return date;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Distância em km entre dois pontos (fórmula de haversine). */
function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Até `max` itens distribuídos por igual, sempre com o primeiro e o último. */
function sampleEvenly<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = (items.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => items[Math.round(i * step)]);
}

@Injectable()
export class FreightRouteService {
  private readonly logger = new Logger(FreightRouteService.name);

  constructor(
    @InjectRepository(FreightRoutes)
    private readonly freightRoutesRepository: Repository<FreightRoutes>,
    @InjectRepository(UsersDrive)
    private readonly userDriveRepository: Repository<UsersDrive>,
    @InjectRepository(Freight)
    private readonly freightRepository: Repository<Freight>,
    private readonly freightRequestService: FreightRequestService,
    private readonly sqsService: SQSService,
  ) {}

  /**
   * Transportadora escolhe o motorista direto no monitoramento. Passa pelo
   * mesmo aceite do fluxo normal: usa a solicitação aberta do motorista (ou
   * cria uma), trava frete e motorista, cria a viagem, fecha o frete, recusa
   * os demais e avisa todo mundo. Assim a entrega pode ser confirmada depois.
   */
  async createRouteInProgress(companyId: string, freightId: string, userDriveId: string, actor?: Actor) {
    if (!freightId || !userDriveId) {
      throw new HttpException('Escolha o frete e o motorista.', HttpStatus.BAD_REQUEST);
    }
    const freight = await this.freightRepository.findOne({
      where: { id: freightId, companyId, isExclude: false },
      select: ['id', 'companyId'],
    });
    if (!freight) {
      throw new HttpException('Frete não encontrado', HttpStatus.NOT_FOUND);
    }
    const driver = await this.userDriveRepository.findOne({ where: { id: userDriveId }, select: ['id'] });
    if (!driver) {
      throw new HttpException('Motorista não encontrado', HttpStatus.NOT_FOUND);
    }

    const requests = this.freightRepository.manager.getRepository(FreightRequest);
    let request = await requests.findOne({
      where: { freightId, userDriveId, status: In(OPEN_REQUEST_STATUSES) },
      select: ['id'],
    });
    let createdHere = false;
    if (!request) {
      request = await requests.save(
        requests.create({ freightId, userDriveId, companyId, status: FreightRequestStatus.PENDING }),
      );
      createdHere = true;
    }

    try {
      const accepted = await this.freightRequestService.acceptFreightRequest(
        companyId,
        request.id,
        actor ?? { companyId, contactId: null },
      );
      const route = await this.freightRoutesRepository.findOne({ where: { id: accepted.routeId } });
      return { success: true, message: 'Motorista escolhido. Ele foi avisado para iniciar a rota.', route };
    } catch (error) {
      // Aceite recusado (frete fechado, motorista em outra viagem...): não deixa
      // a solicitação criada aqui pendurada.
      if (createdHere) await requests.delete({ id: request.id }).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Rotas da empresa (monitoramento, kanban). Cada rota traz `lastLocation`
   * (última posição conhecida), `freightRequestId` e `requestStatus` (a
   * solicitação do motorista nesse frete). `userDrive.locations` fica como
   * `[lastLocation]` por compatibilidade com o portal.
   *
   * `completedSince` (ISO) filtra rotas concluídas a partir da data, para a
   * coluna "Entrega confirmada" do kanban.
   */
  async findAll(userId: string, params: ParamsFreightRoute = {}) {
    const completedSince = parseOptionalDate(
      params.completedSince,
      'completedSince',
    );

    try {
      const take = params.take ?? 10;
      const page = params.page ?? 1;

      const queryBuilder = this.freightRoutesRepository
        .createQueryBuilder('freight_routes')
        .leftJoinAndSelect('freight_routes.freight', 'freight')
        .leftJoin('freight.contactCompany', 'contact_company')
        .leftJoin('freight_routes.userDrive', 'users_drive')
        .leftJoin('users_drive.vehicles', 'vehicle')
        .leftJoinAndSelect('users_drive.reviewUserDrive', 'reviewUserDrive')
        .leftJoin('users_drive.CompanyUsersContacts', 'CompanyUsersContacts')
        .loadRelationCountAndMap(
          'freight_routes.reviewCount',
          'users_drive.reviewUserDrive',
        )
        .addSelect([
          'contact_company.name',
          'contact_company.phoneNumber',
          'users_drive.name',
          'users_drive.cnh',
          'users_drive.antt',
          'users_drive.city',
          'users_drive.cpf',
          'users_drive.similiary',
          'users_drive.photoFaceURL',
          'users_drive.phoneNumber',
          'users_drive.isOnRoute',
          'users_drive.id',
          'users_drive.street',
          'users_drive.number',
          'users_drive.state',
          'users_drive.zipcode',
          'vehicle.vehicleType',
          'vehicle.bodyType',
          'vehicle.plateState',
          'vehicle.isPlateValid',
          'vehicle.isRenavamValid',
          'vehicle.tracker',
          'vehicle.locator',
          'vehicle.plateNumber',
          'CompanyUsersContacts.isActive',
        ])
        .where('freight_routes.companyId = :companyId', { companyId: userId });

      const filters: Record<string, any> = {
        'freight_routes.id': params.id,
        'freight_routes.userDriveId': params.userDriveId,
        'freight_routes.freightId': params.freightId,
        'freight_routes.status': params.status,
        'freight_routes.isActive': params.isActive,
        'freight_routes.avalationUserDrive': params.avalationUserDrive,
      };

      Object.entries(filters).forEach(([key, value]) => {
        if (value) queryBuilder.andWhere(`${key} = :${key}`, { [key]: value });
      });

      if (params.name) {
        queryBuilder.andWhere(
          '(unaccent(LOWER(users_drive.name)) ILIKE unaccent(LOWER(:name)))',
          { name: `%${params.name}%` },
        );
      }

      if (completedSince) {
        queryBuilder.andWhere('freight_routes.completedAt >= :completedSince', {
          completedSince,
        });
      }

      const sortColumn =
        params.status === RouteStatus.COMPLETED || completedSince
          ? 'freight_routes.completedAt'
          : 'freight_routes.startedAt';

      const [result, total] = await queryBuilder
        .orderBy(sortColumn, 'DESC', 'NULLS LAST')
        .skip((page - 1) * take)
        .take(take)
        .getManyAndCount();

      await this.attachRouteState(result);

      return { data: result, count: total };
    } catch (error) {
      console.error('Erro no findAllRoutes:', error);
      throw new HttpException(
        'Erro ao buscar as rotas.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findAllOverdue(userId: string, params: ParamsFreightRoute = {}) {
    try {
      const take = params.take ?? 10;
      const page = params.page ?? 1;

      const queryBuilder = this.freightRoutesRepository
        .createQueryBuilder('freight_routes')
        .leftJoinAndSelect('freight_routes.freight', 'freight')
        .leftJoin('freight.contactCompany', 'contact_company')
        .leftJoin('freight_routes.userDrive', 'users_drive')
        .leftJoin('users_drive.vehicles', 'vehicle')
        .leftJoinAndSelect('users_drive.reviewUserDrive', 'reviewUserDrive')
        .leftJoin('users_drive.CompanyUsersContacts', 'CompanyUsersContacts')
        .loadRelationCountAndMap(
          'freight_routes.reviewCount',
          'users_drive.reviewUserDrive',
        )
        .addSelect([
          'contact_company.name',
          'contact_company.phoneNumber',
          'users_drive.name',
          'users_drive.cnh',
          'users_drive.antt',
          'users_drive.city',
          'users_drive.cpf',
          'users_drive.similiary',
          'users_drive.photoFaceURL',
          'users_drive.phoneNumber',
          'users_drive.isOnRoute',
          'users_drive.id',
          'users_drive.street',
          'users_drive.number',
          'users_drive.state',
          'users_drive.zipcode',
          'vehicle.vehicleType',
          'vehicle.bodyType',
          'vehicle.plateState',
          'vehicle.isPlateValid',
          'vehicle.isRenavamValid',
          'vehicle.tracker',
          'vehicle.locator',
          'vehicle.plateNumber',
          'CompanyUsersContacts.isActive',
        ])
        .where('freight_routes.companyId = :companyId', { companyId: userId })
        .andWhere('freight_routes.isActive = :isActive', { isActive: true })
        .andWhere('freight_routes.status = :status', {
          status: RouteStatus.IN_PROGRESS,
        })
        .andWhere('freight.dateReceiver IS NOT NULL')
        .andWhere('freight.dateReceiver < NOW()');

      if (params.name) {
        queryBuilder.andWhere(
          '(unaccent(LOWER(users_drive.name)) ILIKE unaccent(LOWER(:name)))',
          { name: `%${params.name}%` },
        );
      }

      if (params.freightId) {
        queryBuilder.andWhere('freight_routes.freightId = :freightId', {
          freightId: params.freightId,
        });
      }

      if (params.userDriveId) {
        queryBuilder.andWhere('freight_routes.userDriveId = :userDriveId', {
          userDriveId: params.userDriveId,
        });
      }

      const [result, total] = await queryBuilder
        .orderBy('freight.dateReceiver', 'ASC')
        .skip((page - 1) * take)
        .take(take)
        .getManyAndCount();

      await this.attachRouteState(result);

      return { data: result, count: total };
    } catch (error) {
      console.error('Erro no findAllOverdueRoutes:', error);
      throw new HttpException(error, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Encerra a rota da empresa: COMPLETED grava `completedAt`; CANCEL deixa
   * `completedAt` nulo (a coluna só vale para rota concluída).
   */
  /**
   * Conclusão ou cancelamento pela transportadora (PATCH :id/status).
   * Concluir usa a mesma confirmação de entrega do fluxo normal (solicitação,
   * viagem e aviso ao motorista). Cancelar é o mesmo que "Cancelar viagem".
   */
  async updateStatus(companyId: string, routeId: string, status: RouteStatus, actor?: Actor) {
    if (![RouteStatus.CANCELED, RouteStatus.COMPLETED].includes(status)) {
      throw new HttpException('Status inválido.', HttpStatus.BAD_REQUEST);
    }
    const who: Actor = actor ?? { companyId, contactId: null };
    if (status === RouteStatus.CANCELED) {
      return this.cancelRouteByCompany(routeId, who);
    }

    const route = await this.freightRoutesRepository.findOne({
      where: { id: routeId, companyId },
      select: ['id', 'freightId', 'userDriveId', 'status'],
    });
    if (!route) {
      throw new HttpException('Rota não encontrada.', HttpStatus.NOT_FOUND);
    }
    const request = await this.freightRoutesRepository.manager.getRepository(FreightRequest).findOne({
      where: {
        freightId: route.freightId,
        userDriveId: route.userDriveId,
        status: In([
          FreightRequestStatus.ACCEPTED,
          FreightRequestStatus.DRIVER_CONFIRMED_DELIVERY,
          FreightRequestStatus.NOT_CONFIRMED_DELIVERY,
        ]),
      },
      select: ['id'],
    });
    if (request) {
      await this.freightRequestService.confirmedFreightRequest(companyId, request.id, who);
      return { message: 'Rota concluída com sucesso!', result: true };
    }

    // Rota sem solicitação (dados antigos): conclui só a viagem.
    await this.freightRoutesRepository.manager.transaction(async (manager) => {
      const byName = await actorName(manager, who);
      await manager.getRepository(FreightRoutes).update(
        { id: route.id, companyId },
        { status: RouteStatus.COMPLETED, isActive: false, completedAt: new Date(), completedByName: byName },
      );
      if (route.userDriveId) await syncDriverOnRoute(manager, route.userDriveId);
    });
    return { message: 'Rota concluída com sucesso!', result: true };
  }

  /**
   * "Cancelar viagem" pela transportadora: a viagem fica registrada como
   * cancelada (o histórico não some), a solicitação do motorista é encerrada,
   * o motorista é avisado e o frete volta a ser publicado se a coleta ainda
   * não passou. Viagem concluída não pode ser cancelada.
   */
  async cancelRouteByCompany(routeId: string, actor: Actor) {
    const now = new Date();
    const outcome = await this.freightRoutesRepository.manager.transaction(async (manager) => {
      const [route] = await manager.query(
        `SELECT "id", "freightId", "userDriveId", "status" FROM "freight_routes"
          WHERE "id" = $1 AND "companyId" = $2 FOR UPDATE`,
        [routeId, actor.companyId],
      );
      if (!route) {
        throw new HttpException('Rota não encontrada.', HttpStatus.NOT_FOUND);
      }
      if (route.status !== RouteStatus.IN_PROGRESS) {
        throw new HttpException(
          {
            message: 'Só dá para cancelar viagem em andamento. Viagem concluída fica no histórico.',
            errorCode: 'ROUTE_NOT_IN_PROGRESS',
          },
          HttpStatus.CONFLICT,
        );
      }
      const [freight] = await manager.query(
        `SELECT "id", "dateOrigin", "isExclude",
                COALESCE(NULLIF("originCityName", ''), "originCity") AS "origin", "originState",
                COALESCE(NULLIF("destinyCityName", ''), "destinyCity") AS "destiny", "destinyState"
           FROM "freight" WHERE "id" = $1 FOR UPDATE`,
        [route.freightId],
      );
      const byName = await actorName(manager, actor);

      await manager.query(
        `UPDATE "freight_routes"
            SET "status" = 'CANCEL', "isActive" = false, "completedAt" = $2, "completedByName" = $3
          WHERE "id" = $1`,
        [route.id, now, byName],
      );
      const [requests] = await manager.query(
        `UPDATE "freight_requests"
            SET "status" = 'REJECTED', "respondedAt" = $3, "respondedByName" = $4, "updatedAt" = $3, "expiresAt" = NULL
          WHERE "freightId" = $1 AND "userDriveId" = $2
            AND "status" IN ('ACCEPTED', 'DRIVER_CONFIRMED_DELIVERY', 'NOT_CONFIRMED_DELIVERY')
        RETURNING "id"`,
        [route.freightId, route.userDriveId, now, byName],
      );

      const reopen = !!freight && !freight.isExclude && !isPickupPast(freight.dateOrigin, now);
      if (reopen) {
        await manager.query(
          `UPDATE "freight" SET "isActive" = true, "openSolicitations" = true, "expiresAt" = $2, "updatedAt" = $3
            WHERE "id" = $1`,
          [freight.id, freightExpiry(freight.dateOrigin, now), now],
        );
      }
      if (route.userDriveId) await syncDriverOnRoute(manager, route.userDriveId);

      const where = freight
        ? `de ${freight.origin}/${freight.originState} para ${freight.destiny}/${freight.destinyState}`
        : '';
      const [company] = await manager.query(
        `SELECT COALESCE(NULLIF("nameFantasy", ''), "name") AS "name" FROM "company" WHERE "id" = $1`,
        [actor.companyId],
      );
      const title = 'Viagem cancelada pela transportadora';
      const body = `A transportadora ${company?.name ?? ''} cancelou a viagem ${where}.`.replace(/\s+\./, '.');
      if (route.userDriveId) {
        const notifications = manager.getRepository(Notification);
        await notifications.insert(
          notifications.create({
            title,
            message: body,
            senderType: EntityType.COMPANY,
            senderId: actor.companyId,
            recipientType: EntityType.USER,
            recipientId: route.userDriveId,
            category: NotificationCategory.FREIGHT,
            status: NotificationStatus.UNREAD,
            payload: { freightId: route.freightId, routeId: route.id, reason: 'route_canceled' },
            iconStyle: IconStyles.FREIGHT_RECUSED,
            createdAt: now,
          }),
        );
      }
      const messages: DriverMessage[] = route.userDriveId
        ? [
            {
              freightRequestId: requests?.[0]?.id ?? '',
              driverId: route.userDriveId,
              freightId: route.freightId,
              status: FreightRequestStatus.REJECTED,
              expiresAt: '',
              routeId: route.id,
              title,
              body,
              screen: 'MyFreights',
            },
          ]
        : [];
      return { reopen, messages };
    });

    await sendDriverMessages(this.sqsService, this.logger, outcome.messages);
    return {
      success: true,
      message: outcome.reopen
        ? 'Viagem cancelada. O motorista foi avisado e o frete voltou a ser publicado.'
        : 'Viagem cancelada. O motorista foi avisado.',
    };
  }

  /** Mantido por compatibilidade (portal antigo): agora cancela a viagem, não apaga. */
  async hardDeleteRoute(routeId: string, companyId: string, actor?: Actor) {
    return this.cancelRouteByCompany(routeId, actor ?? { companyId, contactId: null });
  }

  async getStaticsUserRoute(userId: string) {
    try {
      const freightRoutes = await this.freightRoutesRepository.find({
        where: { userDriveId: userId },
        relations: ['freight', 'freight.company'],
      });

      const values = freightRoutes
        .map((route) => Number(route.freight?.Valuefreight) || 0)
        .filter((value) => value > 0);

      const distinctCompanies = new Set(
        freightRoutes
          .map((route) => route.freight?.company?.id)
          .filter(Boolean),
      ).size;

      const count = values.length;
      const mediaFreights = count
        ? (values.reduce((sum, v) => sum + v, 0) / count).toFixed(2)
        : '0.00';
      const maiorFreight = count ? Math.max(...values).toFixed(2) : '0.00';

      const destinationCount: Record<string, number> = {};
      freightRoutes.forEach((route) => {
        const destination = route.freight?.destinyCity;
        if (destination) {
          destinationCount[destination] =
            (destinationCount[destination] || 0) + 1;
        }
      });

      const principalRoute = Object.entries(destinationCount).reduce(
        (max, entry) => (entry[1] > max[1] ? entry : max),
        ['', 0],
      )[0];

      return {
        count,
        distinctCompanies,
        mediaFreights,
        maiorFreight,
        principalRoute,
      };
    } catch (error) {
      console.error('Erro no getStaticsUserRoute:', error);
      throw new HttpException(error, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getAvalatiation(userId: string, params: ParamsFreightRoute = {}) {
    try {
      const take = params.take ?? 10;
      const page = params.page ?? 1;

      const queryBuilder = this.freightRoutesRepository
        .createQueryBuilder('freight_routes')
        .leftJoinAndSelect('freight_routes.freight', 'freight')
        .leftJoinAndSelect('freight_routes.userDrive', 'userDrive')
        .leftJoinAndSelect(
          'freight_routes.reviewUserDrive',
          'reviewUserDrive',
          'reviewUserDrive.routeId = freight_routes.id',
        )
        .leftJoin('freight.freightRequest', 'freightRequest')
        .leftJoin('freight.company', 'company')
        .addSelect([
          'company.id',
          'company.name',
          'company.photoUrl',
          'company.phoneNumber',
          'company.createdAt',
          'company.city',
          'freightRequest.status',
          'freightRequest.id',
        ])

        .where('freight_routes.companyId = :companyId', {
          companyId: userId,
        })
        .andWhere('freight_routes.avalationUserDrive = :avalationUserDrive', {
          avalationUserDrive: false,
        });
      const [result, total] = await queryBuilder
        .skip((page - 1) * take)
        .take(take)
        .getManyAndCount();
      const nextPageExists = total > page * take;

      return { data: result, count: total, next: nextPageExists };
    } catch (error) {
      console.error('Erro no findAllRoutes:', error);
      throw new HttpException(error, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Linha do tempo da rota (painel de detalhe do monitoramento): eventos do
   * frete, da solicitação e da rota; pontos do rastreamento em ordem
   * crescente (no máximo 500, amostrados por igual); resumo com o total de
   * pontos, a última posição e a distância (soma haversine de todos os
   * pontos, não só dos amostrados).
   */
  async getTimeline(
    companyId: string,
    routeId: string,
  ): Promise<RouteTimeline> {
    try {
      const [route] = await this.freightRoutesRepository.query(
        `SELECT r."id", r."status", r."startedAt", r."completedAt",
                r."freightId", r."userDriveId",
                f."createdAt" AS "freightCreatedAt", f."createdByName",
                f."dateReceiver", f."destinyLatitude", f."destinyLongitude",
                r."completedByName",
                COALESCE(f."originCityName", f."originCity") AS "originCity",
                f."originState",
                COALESCE(f."destinyCityName", f."destinyCity") AS "destinyCity",
                f."destinyState",
                d."id" AS "driverId", d."name" AS "driverName",
                d."phoneNumber" AS "driverPhone"
           FROM "freight_routes" r
           LEFT JOIN "freight" f ON f."id" = r."freightId"
           LEFT JOIN "users_drive" d ON d."id" = r."userDriveId"
          WHERE r."id" = $1
            AND r."companyId" = $2`,
        [routeId, companyId],
      );

      if (!route) {
        throw new HttpException('Rota não encontrada.', HttpStatus.NOT_FOUND);
      }

      const [requests, rows]: [
        Array<{
          status: FreightRequestStatus;
          createdAt: Date;
          updatedAt: Date;
          respondedAt: Date | null;
          deliveryInformedAt: Date | null;
          respondedByName: string | null;
        }>,
        Array<Record<string, unknown>>,
      ] = await Promise.all([
        route.freightId && route.userDriveId
          ? this.freightRoutesRepository.query(
              `SELECT "status", "createdAt", "updatedAt", "respondedAt", "deliveryInformedAt", "respondedByName"
                 FROM "freight_requests"
                WHERE "freightId" = $1
                  AND "userDriveId" = $2
                ORDER BY "createdAt" ASC`,
              [route.freightId, route.userDriveId],
            )
          : Promise.resolve([]),
        this.freightRoutesRepository.query(
          `SELECT "latitude", "longitude", "timestamp" AS "recordedAt",
                  "speed", "city"
             FROM "freight_route_locations"
            WHERE "routeId" = $1
            ORDER BY "timestamp" ASC`,
          [routeId],
        ),
      ]);

      const events: TimelineEvent[] = [];
      const addEvent = (
        type: TimelineEvent['type'],
        label: string,
        at: unknown,
        by: string | null = null,
      ) => {
        const iso = toIso(at);
        if (iso) events.push({ type, label, at: iso, by });
      };
      const requestIn = (status: FreightRequestStatus) =>
        requests.find((request) => request.status === status);

      addEvent('PUBLISHED', 'Frete publicado', route.freightCreatedAt, route.createdByName ?? null);
      addEvent(
        'REQUESTED',
        'Motorista solicitou o frete',
        requests[0]?.createdAt,
        route.driverName ?? null,
      );
      // Datas gravadas (respondedAt/deliveryInformedAt) valem mesmo depois que o
      // status muda; antes o evento sumia quando a entrega era confirmada.
      const accepted = requests.find((request) =>
        ROUTE_REQUEST_STATUSES.includes(request.status) &&
        request.status !== FreightRequestStatus.CANCELED_BY_DRIVER,
      );
      addEvent(
        'ACCEPTED',
        'Transportadora aceitou o motorista',
        accepted?.respondedAt ?? route.startedAt,
        accepted?.respondedByName ?? null,
      );
      addEvent(
        'STARTED',
        'Rota iniciada',
        rows.length ? rows[0].recordedAt : route.startedAt,
        route.driverName ?? null,
      );
      const informedAt = requests
        .map((request) => request.deliveryInformedAt)
        .filter(Boolean)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
      addEvent(
        'DRIVER_CONFIRMED',
        'Motorista informou a entrega',
        informedAt ?? requestIn(FreightRequestStatus.DRIVER_CONFIRMED_DELIVERY)?.updatedAt,
        route.driverName ?? null,
      );

      if (route.status === RouteStatus.COMPLETED) {
        addEvent('COMPLETED', 'Entrega confirmada', route.completedAt, route.completedByName ?? null);
      }

      if (route.status === RouteStatus.CANCELED) {
        const canceledByDriver = requestIn(
          FreightRequestStatus.CANCELED_BY_DRIVER,
        );
        addEvent(
          'CANCELED',
          canceledByDriver ? 'Motorista desistiu do frete' : 'Viagem cancelada pela transportadora',
          canceledByDriver?.updatedAt ?? route.completedAt,
          canceledByDriver ? route.driverName ?? null : route.completedByName ?? null,
        );
      }

      const allPoints: TimelinePoint[] = rows.map((row) => ({
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        recordedAt: toIso(row.recordedAt),
        speed: toNumberOrNull(row.speed),
        city: (row.city as string | null) ?? null,
      }));

      let distanceKm: number | null = null;
      if (allPoints.length >= 2) {
        let total = 0;
        for (let i = 1; i < allPoints.length; i++) {
          total += haversineKm(allPoints[i - 1], allPoints[i]);
        }
        distanceKm = Math.round(total * 100) / 100;
      }

      const cities = citiesAlong(allPoints);

      let progress: TimelineProgress | null = null;
      const destination = {
        latitude: Number(route.destinyLatitude),
        longitude: Number(route.destinyLongitude),
      };
      const lastPoint = allPoints[allPoints.length - 1];
      if (
        route.status === RouteStatus.IN_PROGRESS &&
        lastPoint &&
        Number.isFinite(destination.latitude) &&
        Number.isFinite(destination.longitude) &&
        route.destinyLatitude !== null
      ) {
        const traveledKm = distanceKm ?? 0;
        const remainingKm = Math.round(distanceKmBetween(lastPoint, destination) * ROAD_FACTOR);
        const firstAt = new Date(allPoints[0].recordedAt ?? 0).getTime();
        const lastAt = new Date(lastPoint.recordedAt ?? 0).getTime();
        const hours = (lastAt - firstAt) / 3_600_000;
        const measured = hours >= 1 && traveledKm >= 20 ? traveledKm / hours : DEFAULT_SPEED;
        const avgSpeedKmh = Math.round(Math.min(MAX_SPEED, Math.max(MIN_SPEED, measured)));
        // Sem sinal há mais de 30 min, a previsão conta a partir de agora
        // (senão mostraria um horário que já passou).
        const travelMs = (remainingKm / avgSpeedKmh) * 3_600_000;
        const stale = Date.now() - lastAt > 30 * 60_000;
        const etaAt = lastAt ? new Date((stale ? Date.now() : lastAt) + travelMs) : null;
        const dueDay = toDayKey(route.dateReceiver);
        const dueAt = dueDay ? new Date(`${dueDay}T23:59:59.999-03:00`) : null;
        progress = {
          traveledKm: Math.round(traveledKm),
          remainingKm,
          progressPercent:
            traveledKm + remainingKm > 0
              ? Math.round((traveledKm / (traveledKm + remainingKm)) * 100)
              : null,
          avgSpeedKmh,
          etaAt: etaAt ? etaAt.toISOString() : null,
          dueAt: dueAt ? dueAt.toISOString() : null,
          late: !!(etaAt && dueAt && etaAt > dueAt),
          lastSeenMinutesAgo: lastAt ? Math.max(0, Math.round((Date.now() - lastAt) / 60_000)) : null,
        };
      }

      return {
        route: {
          id: route.id,
          status: route.status,
          startedAt: toIso(route.startedAt),
          completedAt: toIso(route.completedAt),
          freightId: route.freightId,
          originCity: route.originCity ?? null,
          originState: route.originState ?? null,
          destinyCity: route.destinyCity ?? null,
          destinyState: route.destinyState ?? null,
          driver: route.driverId
            ? {
                id: route.driverId,
                name: route.driverName ?? null,
                phone: route.driverPhone ?? null,
              }
            : null,
        },
        events,
        points: sampleEvenly(allPoints, TIMELINE_MAX_POINTS),
        cities,
        progress,
        summary: {
          pointsCount: allPoints.length,
          lastSeenAt: allPoints.length
            ? allPoints[allPoints.length - 1].recordedAt
            : null,
          distanceKm,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;

      console.error('Erro ao montar a linha do tempo da rota:', error);
      throw new HttpException(
        'Erro ao buscar a linha do tempo da rota.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Completa as rotas da listagem com a última posição e a solicitação do
   * motorista, numa única consulta (subconsultas LATERAL por rota).
   *
   * `lastLocation`: ponto mais recente de `freight_route_locations` da rota;
   * se a rota em andamento ainda não tiver pontos, a última posição do
   * motorista em `users_location`.
   */
  private async attachRouteState(routes: FreightRoutes[]): Promise<void> {
    if (!routes.length) return;

    const rows: Array<Record<string, unknown>> =
      await this.freightRoutesRepository.query(
        `SELECT r."id" AS "routeId",
                COALESCE(rl."latitude", ul."latitude") AS "latitude",
                COALESCE(rl."longitude", ul."longitude") AS "longitude",
                CASE WHEN rl."recordedAt" IS NOT NULL THEN rl."city" ELSE ul."city" END AS "city",
                COALESCE(rl."recordedAt", ul."recordedAt") AS "recordedAt",
                rq."id" AS "freightRequestId",
                rq."status" AS "requestStatus"
           FROM "freight_routes" r
           LEFT JOIN LATERAL (
                SELECT l."latitude", l."longitude", l."city",
                       l."timestamp" AS "recordedAt"
                  FROM "freight_route_locations" l
                 WHERE l."routeId" = r."id"
                 ORDER BY l."timestamp" DESC
                 LIMIT 1
           ) rl ON true
           LEFT JOIN LATERAL (
                SELECT u."latitude", u."longitude", u."city",
                       COALESCE(u."lastUpdatedAt", u."updatedAt", u."createdAt") AS "recordedAt"
                  FROM "users_location" u
                 WHERE u."userId" = r."userDriveId"
                 ORDER BY u."createdAt" DESC
                 LIMIT 1
           ) ul ON rl."recordedAt" IS NULL AND r."status" = 'PROGUESS'
           LEFT JOIN LATERAL (
                SELECT q."id", q."status"
                  FROM "freight_requests" q
                 WHERE q."freightId" = r."freightId"
                   AND q."userDriveId" = r."userDriveId"
                 ORDER BY (q."status"::text = ANY($2)) DESC, q."updatedAt" DESC
                 LIMIT 1
           ) rq ON true
          WHERE r."id" = ANY($1)`,
        [routes.map((route) => route.id), ROUTE_REQUEST_STATUSES],
      );

    const byRoute = new Map(rows.map((row) => [row.routeId as string, row]));

    for (const route of routes) {
      const row = byRoute.get(route.id);
      const latitude = toNumberOrNull(row?.latitude);
      const longitude = toNumberOrNull(row?.longitude);
      const lastLocation: LastLocation | null =
        latitude !== null && longitude !== null
          ? {
              latitude,
              longitude,
              city: (row?.city as string | null) ?? null,
              recordedAt: toIso(row?.recordedAt),
            }
          : null;

      Object.assign(route, {
        lastLocation,
        freightRequestId: (row?.freightRequestId as string | null) ?? null,
        requestStatus: (row?.requestStatus as FreightRequestStatus | null) ?? null,
      });

      if (route.userDrive) {
        route.userDrive.locations = (
          lastLocation
            ? [
                {
                  latitude: lastLocation.latitude,
                  longitude: lastLocation.longitude,
                  city: lastLocation.city,
                },
              ]
            : []
        ) as UsersLocation[];
      }
    }
  }
}
