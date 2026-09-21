import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FreightRoutes, RouteStatus } from '@entities/freight-routes.entity';
import { ParamsFreightRoute } from './interface/IFreightRoute';
import { UsersDrive } from '@entities/users-drive.entity';
import { UsersLocation } from '@entities/users-location.entity';
import { Freight } from '@entities/freight.entity';
import { FreightRequestStatus } from '@entities/freight-requests.entity';
import { syncDriverOnRoute } from './driver-on-route';
import {
  LastLocation,
  RouteTimeline,
  TimelineEvent,
  TimelinePoint,
} from './interface/IRouteTracking';

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
  constructor(
    @InjectRepository(FreightRoutes)
    private readonly freightRoutesRepository: Repository<FreightRoutes>,
    @InjectRepository(UsersDrive)
    private readonly userDriveRepository: Repository<UsersDrive>,
    @InjectRepository(Freight)
    private readonly freightRepository: Repository<Freight>,
  ) {}

  async createRouteInProgress(
    companyId: string,
    freightId: string,
    userDriveId: string,
  ) {
    try {
      if (!freightId || !userDriveId) {
        throw new HttpException(
          'freightId e userDriveId são obrigatórios',
          HttpStatus.BAD_REQUEST,
        );
      }

      const freight = await this.freightRepository.findOne({
        where: { id: freightId, companyId },
      });

      if (!freight) {
        throw new HttpException('Frete não encontrado', HttpStatus.NOT_FOUND);
      }

      const userDrive = await this.userDriveRepository.findOne({
        where: { id: userDriveId },
      });

      if (!userDrive) {
        throw new HttpException('Motorista não encontrado', HttpStatus.NOT_FOUND);
      }

      const routeForDriver = await this.freightRoutesRepository.findOne({
        where: {
          userDriveId,
          status: RouteStatus.IN_PROGRESS,
          isActive: true,
        },
      });

      if (routeForDriver) {
        throw new HttpException(
          'Motorista já possui rota em progresso',
          HttpStatus.BAD_REQUEST,
        );
      }

      const routeForFreight = await this.freightRoutesRepository.findOne({
        where: {
          freightId,
          status: RouteStatus.IN_PROGRESS,
          isActive: true,
        },
      });

      if (routeForFreight) {
        throw new HttpException(
          'Este frete já possui rota em progresso',
          HttpStatus.BAD_REQUEST,
        );
      }

      const newRoute = this.freightRoutesRepository.create({
        companyId,
        freightId,
        userDriveId,
        status: RouteStatus.IN_PROGRESS,
        isActive: true,
      });

      const savedRoute = await this.freightRoutesRepository.save(newRoute);

      userDrive.isOnRoute = true;
      await this.userDriveRepository.save(userDrive);

      freight.isActive = false;
      freight.openSolicitations = false;
      await this.freightRepository.save(freight);

      return {
        success: true,
        message: 'Rota criada com sucesso em progresso.',
        route: savedRoute,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      console.error('Erro ao criar rota em progresso:', error);
      throw new HttpException(
        'Erro ao criar rota em progresso',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
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
          'users_drive.pushToken',
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
          'users_drive.pushToken',
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
  async updateStatus(companyId: string, routeId: string, status: RouteStatus) {
    if (![RouteStatus.CANCELED, RouteStatus.COMPLETED].includes(status)) {
      throw new HttpException('Status inválido.', HttpStatus.BAD_REQUEST);
    }

    try {
      await this.freightRoutesRepository.manager.transaction(
        async (manager) => {
          const routeRepository = manager.getRepository(FreightRoutes);
          const freightRoute = await routeRepository.findOne({
            where: { id: routeId, companyId },
            select: ['id', 'userDriveId'],
            lock: { mode: 'pessimistic_write' },
          });

          if (!freightRoute) {
            throw new HttpException(
              'Rota não encontrada.',
              HttpStatus.NOT_FOUND,
            );
          }

          await routeRepository.update(
            { id: freightRoute.id },
            {
              status,
              isActive: false,
              completedAt:
                status === RouteStatus.COMPLETED ? new Date() : null,
            },
          );

          if (freightRoute.userDriveId) {
            await syncDriverOnRoute(manager, freightRoute.userDriveId);
          }
        },
      );

      return {
        message:
          status === RouteStatus.COMPLETED
            ? 'Rota concluída com sucesso!'
            : 'Rota cancelada com sucesso!',
        result: true,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;

      console.error('Erro ao atualizar status do frete:', error);
      throw new HttpException(
        'Erro ao atualizar status do frete',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async hardDeleteRoute(routeId: string, companyId: string) {
    try {
      const freightRoute = await this.freightRoutesRepository.findOne({
        where: { id: routeId, companyId },
      });

      if (!freightRoute) {
        throw new HttpException('Rota não encontrada', HttpStatus.NOT_FOUND);
      }

      await this.freightRoutesRepository.delete({ id: routeId, companyId });

      if (freightRoute.userDriveId) {
        await syncDriverOnRoute(
          this.freightRoutesRepository.manager,
          freightRoute.userDriveId,
        );
      }

      return {
        success: true,
        message: 'Rota excluída permanentemente com sucesso.',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      console.error('Erro ao excluir rota permanentemente:', error);
      throw new HttpException(
        'Erro ao excluir rota permanentemente',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
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
                f."createdAt" AS "freightCreatedAt",
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
        Array<{ status: FreightRequestStatus; createdAt: Date; updatedAt: Date }>,
        Array<Record<string, unknown>>,
      ] = await Promise.all([
        route.freightId && route.userDriveId
          ? this.freightRoutesRepository.query(
              `SELECT "status", "createdAt", "updatedAt"
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
      ) => {
        const iso = toIso(at);
        if (iso) events.push({ type, label, at: iso });
      };
      const requestIn = (status: FreightRequestStatus) =>
        requests.find((request) => request.status === status);

      addEvent('PUBLISHED', 'Frete publicado', route.freightCreatedAt);
      addEvent(
        'REQUESTED',
        'Motorista solicitou o frete',
        requests[0]?.createdAt,
      );
      addEvent(
        'ACCEPTED',
        'Transportadora aceitou o motorista',
        route.startedAt,
      );
      addEvent('STARTED', 'Rota iniciada', route.startedAt);
      addEvent(
        'DRIVER_CONFIRMED',
        'Motorista informou a entrega',
        requestIn(FreightRequestStatus.DRIVER_CONFIRMED_DELIVERY)?.updatedAt,
      );

      if (route.status === RouteStatus.COMPLETED) {
        addEvent('COMPLETED', 'Entrega confirmada', route.completedAt);
      }

      if (route.status === RouteStatus.CANCELED) {
        const canceledByDriver = requestIn(
          FreightRequestStatus.CANCELED_BY_DRIVER,
        );
        addEvent(
          'CANCELED',
          canceledByDriver ? 'Motorista desistiu do frete' : 'Rota cancelada',
          canceledByDriver?.updatedAt ?? route.completedAt,
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
