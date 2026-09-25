import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Freight } from '@entities/freight.entity';
import {
  formatSaoPauloDate,
  lastSaoPauloDays,
  saoPauloDaySql,
  startOfSaoPauloDay,
  SAO_PAULO_TZ,
} from '@components/utils/formatTime-SP';
import { occupyingRouteCondition } from '@components/freight-route/driver-on-route';

/**
 * Solicitações em aberto da empresa: PENDING em fretes dela ainda não
 * excluídos. O dono é o do frete (o `companyId` da solicitação vem do app).
 * Mesma regra no card do painel, no resumo semanal e na lista de pendentes.
 */
const PENDING_SOLICITATIONS_FROM = `
  FROM freight_requests freq
  INNER JOIN freight f ON f.id = freq."freightId"
  WHERE f."companyId" = $1
    AND f."isExclude" = false
    AND freq.status = 'PENDING'`;

/** Sem resposta há este tempo, a solicitação é urgente (alerta e prioridade ALTA). */
const URGENT_WAIT_MINUTES = 60;
/** A partir deste tempo sem resposta, prioridade MEDIA. */
const ATTENTION_WAIT_MINUTES = 30;
/** O lead time considera os fretes publicados nesta janela. */
const LEAD_TIME_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Rota PROGUESS cuja entrega o motorista já informou: falta a transportadora
 * confirmar. `alias` é o alias de `freight_routes` na consulta.
 */
function deliveryInformedCondition(alias: string): string {
  return `EXISTS (
    SELECT 1
      FROM freight_requests informed
     WHERE informed."freightId" = ${alias}."freightId"
       AND informed."userDriveId" = ${alias}."userDriveId"
       AND informed.status = 'DRIVER_CONFIRMED_DELIVERY'
  )`;
}

/** Data (dia de São Paulo) de uma coluna timestamp gravada em UTC. */
function saoPauloDateSql(column: string): string {
  return `((${column} AT TIME ZONE 'UTC') AT TIME ZONE '${SAO_PAULO_TZ}')::date`;
}

/** Veículo principal do motorista (no máximo um por linha). */
function mainVehicleJoin(driverColumn: string): string {
  return `LEFT JOIN LATERAL (
    SELECT mv."vehicleType", mv."bodyType", mv."plateNumber"
      FROM vehicles mv
     WHERE mv."userId" = ${driverColumn}
       AND mv."isMainVehicle" = true
     ORDER BY mv."createdAt" DESC
     LIMIT 1
  ) v ON true`;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : null;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Freight)
    private freightRepository: Repository<Freight>,
  ) {}

  private get db() {
    return this.freightRepository.manager;
  }

  async getWeeklySummary(companyId: string) {
    try {
      const now = new Date();
      const start = startOfSaoPauloDay(lastSaoPauloDays(7, now)[0]);
      const leadStart = startOfSaoPauloDay(
        lastSaoPauloDays(LEAD_TIME_WINDOW_DAYS, now)[0],
      );

      const [published, active, [routes], pending, [leadTime]] =
        await Promise.all([
          // Publicados nos últimos 7 dias (dias de São Paulo)
          this.freightRepository.count({
            where: { companyId, isExclude: false, createdAt: Between(start, now) },
          }),

          // Abertos: ativos e recebendo solicitações
          this.freightRepository.count({
            where: {
              companyId,
              isExclude: false,
              isActive: true,
              openSolicitations: true,
            },
          }),

          // Rotas: em viagem (regra oficial de motorista ocupado) e entregas
          // já informadas pelo motorista, esperando a confirmação da empresa.
          this.db.query(
            `
            SELECT
              COUNT(*)                                                  AS in_progress,
              COUNT(*) FILTER (WHERE ${occupyingRouteCondition('fr')})  AS in_transit,
              COUNT(DISTINCT fr."userDriveId")
                FILTER (WHERE ${occupyingRouteCondition('fr')})         AS drivers_in_transit,
              COUNT(*) FILTER (
                WHERE fr."isActive" = true AND ${deliveryInformedCondition('fr')}
              )                                                         AS awaiting_confirmation
            FROM freight_routes fr
            WHERE fr."companyId" = $1
              AND fr.status = 'PROGUESS'
            `,
            [companyId],
          ),

          this.countPendingSolicitations(companyId, now),

          // Lead time: publicação do frete -> 1ª solicitação de motorista.
          // LATERAL busca a 1ª solicitação só dos fretes da empresa (usa o
          // índice por freightId) em vez de agregar a tabela inteira.
          this.db.query(
            `
            SELECT
              COUNT(*)                                                  AS sample_size,
              AVG(lead_minutes)                                         AS avg_minutes,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY lead_minutes) AS median_minutes,
              MIN(lead_minutes)                                         AS min_minutes,
              MAX(lead_minutes)                                         AS max_minutes
            FROM (
              SELECT GREATEST(
                       0,
                       EXTRACT(EPOCH FROM (first_req.at - f."createdAt")) / 60
                     ) AS lead_minutes
              FROM freight f
              CROSS JOIN LATERAL (
                SELECT MIN(r."createdAt") AS at
                  FROM freight_requests r
                 WHERE r."freightId" = f.id
              ) first_req
              WHERE f."companyId" = $1
                AND f."isExclude" = false
                AND f."createdAt" BETWEEN $2 AND $3
                AND first_req.at IS NOT NULL
            ) samples
            `,
            [companyId, leadStart, now],
          ),
        ]);

      const sampleSize = Number(leadTime?.sample_size ?? 0);
      const minutes = (value: unknown) =>
        sampleSize > 0 ? toNumberOrNull(value) : null;
      const avgMinutes = minutes(leadTime?.avg_minutes);

      return {
        period: {
          startDate: formatSaoPauloDate(start),
          endDate: formatSaoPauloDate(now),
          days: 7,
        },
        freights: {
          publishedLast7Days: published,
          currentlyActive: active,
          /** Todas as rotas PROGUESS (em viagem + entrega a confirmar). */
          currentlyInRoute: Number(routes?.in_progress ?? 0),
        },
        routes: {
          inTransit: Number(routes?.in_transit ?? 0),
          awaitingConfirmation: Number(routes?.awaiting_confirmation ?? 0),
        },
        solicitations: {
          pending: pending.total,
          /** Mantido por compatibilidade: são todas as PENDING da empresa. */
          pendingLast7Days: pending.total,
          urgent: pending.urgent,
          urgentAfterMinutes: URGENT_WAIT_MINUTES,
        },
        drivers: {
          currentlyInRoute: Number(routes?.drivers_in_transit ?? 0),
        },
        leadTime: {
          description:
            'Tempo entre a publicação do frete e a 1ª solicitação de motorista',
          windowDays: LEAD_TIME_WINDOW_DAYS,
          medianMinutes: minutes(leadTime?.median_minutes),
          avgMinutes,
          avgHours: avgMinutes === null ? null : Number((avgMinutes / 60).toFixed(2)),
          minMinutes: minutes(leadTime?.min_minutes),
          maxMinutes: minutes(leadTime?.max_minutes),
          sampleSize,
        },
        leadTimeSampleSize: sampleSize,
      };
    } catch (error) {
      throw new HttpException(
        error?.message || 'Erro ao buscar resumo semanal',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getDailyAlerts(companyId: string) {
    try {
      const now = new Date();
      // Janela de risco: rotas que vencem nas próximas 24h ou já atrasadas
      const next24h = new Date(now.getTime() + DAY_MS);

      const [delayRiskRoutes, urgentSolicitations] = await Promise.all([
        // Só rotas que ainda ocupam o motorista: se ele já informou a
        // entrega, não é atraso, é confirmação pendente.
        this.db.query(
          `
          SELECT
            fr.id                   AS route_id,
            fr."freightId"          AS freight_id,
            fr."userDriveId"        AS driver_id,
            ud.name                 AS driver_name,
            f."originCity"          AS origin_city,
            f."originState"         AS origin_state,
            f."destinyCity"         AS destiny_city,
            f."destinyState"        AS destiny_state,
            f."dateReceiver"        AS expected_delivery,
            fr."startedAt"          AS started_at,
            CASE
              WHEN f."dateReceiver" < $3 THEN 'ATRASADA'
              ELSE 'RISCO_DE_ATRASO'
            END                     AS alert_type,
            ROUND(
              EXTRACT(EPOCH FROM ($3 - f."dateReceiver")) / 3600, 2
            )                       AS overdue_hours
          FROM freight_routes fr
          INNER JOIN freight f ON f.id = fr."freightId"
          LEFT  JOIN users_drive ud ON ud.id = fr."userDriveId"
          WHERE fr."companyId" = $1
            AND ${occupyingRouteCondition('fr')}
            AND f."dateReceiver" IS NOT NULL
            AND f."dateReceiver" <= $2
          ORDER BY f."dateReceiver" ASC
          `,
          [companyId, next24h, now],
        ),

        // Solicitações pendentes sem resposta há URGENT_WAIT_MINUTES ou mais
        this.db.query(
          `
          SELECT
            freq.id                 AS solicitation_id,
            freq."freightId"        AS freight_id,
            freq."userDriveId"      AS driver_id,
            ud.name                 AS driver_name,
            f."originCity"          AS origin_city,
            f."originState"         AS origin_state,
            f."destinyCity"         AS destiny_city,
            f."destinyState"        AS destiny_state,
            freq."createdAt"        AS requested_at,
            ROUND(
              EXTRACT(EPOCH FROM ($2 - freq."createdAt")) / 60, 2
            )                       AS waiting_minutes
          FROM freight_requests freq
          INNER JOIN freight f ON f.id = freq."freightId"
          LEFT  JOIN users_drive ud ON ud.id = freq."userDriveId"
          WHERE f."companyId" = $1
            AND f."isExclude" = false
            AND freq.status = 'PENDING'
            AND freq."createdAt" <= $3
          ORDER BY freq."createdAt" ASC
          `,
          [companyId, now, new Date(now.getTime() - URGENT_WAIT_MINUTES * 60000)],
        ),
      ]);

      const route = (r: any) => ({
        routeId: r.route_id,
        freightId: r.freight_id,
        driverId: r.driver_id,
        driverName: r.driver_name,
        route: `${r.origin_city}/${r.origin_state} → ${r.destiny_city}/${r.destiny_state}`,
        expectedDelivery: r.expected_delivery,
        startedAt: r.started_at,
        overdueHours: Number(r.overdue_hours),
      });
      const lateRoutes = delayRiskRoutes.filter(
        (r: any) => r.alert_type === 'ATRASADA',
      );
      const atRiskRoutes = delayRiskRoutes.filter(
        (r: any) => r.alert_type === 'RISCO_DE_ATRASO',
      );

      return {
        generatedAt: now.toISOString(),
        summary: {
          lateRoutes: lateRoutes.length,
          atRiskRoutes: atRiskRoutes.length,
          urgentSolicitations: urgentSolicitations.length,
          total: delayRiskRoutes.length + urgentSolicitations.length,
        },
        alerts: {
          lateRoutes: lateRoutes.map(route),
          atRiskRoutes: atRiskRoutes.map(route),
          urgentSolicitations: urgentSolicitations.map((r: any) => ({
            solicitationId: r.solicitation_id,
            freightId: r.freight_id,
            driverId: r.driver_id,
            driverName: r.driver_name,
            route: `${r.origin_city}/${r.origin_state} → ${r.destiny_city}/${r.destiny_state}`,
            requestedAt: r.requested_at,
            waitingMinutes: Number(r.waiting_minutes),
          })),
        },
      };
    } catch (error) {
      throw new HttpException(
        error?.message || 'Erro ao buscar alertas diários',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getFreightVolume(companyId: string, period: 7 | 30 | 90 = 7) {
    try {
      const now = new Date();
      const dayKeys = lastSaoPauloDays(period, now);
      const start = startOfSaoPauloDay(dayKeys[0]);

      const DAY_NAMES: Record<string, string> = {
        '0': 'Dom', '1': 'Seg', '2': 'Ter',
        '3': 'Qua', '4': 'Qui', '5': 'Sex', '6': 'Sáb',
      };

      const [publicationsRows, deliveriesRows, driversRows, [cohort], [history]] =
        await Promise.all([
          // Publicações por dia
          this.db.query(
            `
            SELECT ${saoPauloDaySql('f."createdAt"')} AS day_key, COUNT(f.id) AS total
            FROM freight f
            WHERE f."companyId" = $1
              AND f."isExclude" = false
              AND f."createdAt" BETWEEN $2 AND $3
            GROUP BY day_key
            `,
            [companyId, start, now],
          ),

          // Entregas concluídas por dia
          this.db.query(
            `
            SELECT ${saoPauloDaySql('fr."completedAt"')} AS day_key, COUNT(fr.id) AS total
            FROM freight_routes fr
            WHERE fr."companyId" = $1
              AND fr.status = 'COMPLETED'
              AND fr."completedAt" BETWEEN $2 AND $3
            GROUP BY day_key
            `,
            [companyId, start, now],
          ),

          // Motoristas em rota em cada dia: rota iniciada até o dia e ainda
          // em andamento, ou concluída naquele dia ou depois. Rotas
          // canceladas ficam de fora (não guardam a data do cancelamento).
          this.db.query(
            `
            SELECT TO_CHAR(d.day, 'YYYY-MM-DD') AS day_key,
                   COUNT(DISTINCT fr."userDriveId") AS total
            FROM generate_series($2::date, $3::date, INTERVAL '1 day') AS d(day)
            INNER JOIN freight_routes fr
               ON fr."companyId" = $1
              AND fr."userDriveId" IS NOT NULL
              AND fr.status IN ('PROGUESS', 'COMPLETED')
              AND ${saoPauloDateSql('fr."startedAt"')} <= d.day
              AND (
                fr.status = 'PROGUESS'
                OR ${saoPauloDateSql('fr."completedAt"')} >= d.day
              )
            GROUP BY d.day
            `,
            [companyId, dayKeys[0], dayKeys[dayKeys.length - 1]],
          ),

          // Conversão: dos fretes publicados no período, quantos já foram entregues
          this.db.query(
            `
            SELECT
              COUNT(f.id) AS published,
              COUNT(f.id) FILTER (
                WHERE EXISTS (
                  SELECT 1
                  FROM freight_routes fr
                  WHERE fr."freightId" = f.id
                    AND fr.status = 'COMPLETED'
                )
              ) AS delivered
            FROM freight f
            WHERE f."companyId" = $1
              AND f."isExclude" = false
              AND f."createdAt" BETWEEN $2 AND $3
            `,
            [companyId, start, now],
          ),

          // Histórico da empresa: define quais períodos têm dados de verdade
          this.db.query(
            `
            SELECT MIN(f."createdAt") AS first_at, COUNT(f.id) AS total
            FROM freight f
            WHERE f."companyId" = $1
              AND f."isExclude" = false
            `,
            [companyId],
          ),
        ]);

      const labels = dayKeys.map((key) => {
        const [year, month, day] = key.split('-').map(Number);
        const dow = String(new Date(Date.UTC(year, month - 1, day)).getUTCDay());
        return period === 7 ? DAY_NAMES[dow] : `${key.slice(8, 10)}/${key.slice(5, 7)}`;
      });

      const toMap = (rows: any[]) =>
        Object.fromEntries(rows.map((r) => [r.day_key, Number(r.total)]));
      const pubMap = toMap(publicationsRows);
      const delMap = toMap(deliveriesRows);
      const drvMap = toMap(driversRows);

      const publications = dayKeys.map((k) => pubMap[k] ?? 0);
      const deliveries = dayKeys.map((k) => delMap[k] ?? 0);
      const driversInRoute = dayKeys.map((k) => drvMap[k] ?? 0);

      const totalPublications = publications.reduce((a, b) => a + b, 0);
      const totalDeliveries = deliveries.reduce((a, b) => a + b, 0);
      const cohortPublished = Number(cohort?.published ?? 0);
      const deliveredFromPublished = Number(cohort?.delivered ?? 0);
      const conversionRate =
        cohortPublished > 0
          ? Number(((deliveredFromPublished / cohortPublished) * 100).toFixed(1))
          : 0;

      const peakValue = Math.max(...publications);
      const peakDay = peakValue > 0 ? labels[publications.indexOf(peakValue)] : null;

      // Períodos maiores só aparecem quando existe publicação antiga o
      // bastante para eles: numa conta nova, 30d e 90d repetiriam os 7d.
      const firstAt: Date | null = history?.first_at ? new Date(history.first_at) : null;
      const hasData = Number(history?.total ?? 0) > 0;
      const activityDays = firstAt
        ? Math.floor((now.getTime() - firstAt.getTime()) / DAY_MS)
        : 0;
      const availablePeriods = hasData
        ? [7, ...(activityDays >= 7 ? [30] : []), ...(activityDays >= 30 ? [90] : [])]
        : [];

      return {
        period: {
          days: period,
          startDate: formatSaoPauloDate(start),
          endDate: formatSaoPauloDate(now),
        },
        history: {
          hasData,
          firstPublicationAt: firstAt ? firstAt.toISOString() : null,
          availablePeriods,
        },
        chart: {
          labels,
          series: { publications, deliveries, driversInRoute },
        },
        summary: {
          totalPublications,
          totalDeliveries,
          avgPublicationsPerDay: Number((totalPublications / period).toFixed(1)),
          /** Entregues entre os publicados no período (nunca passa de 100%). */
          conversionRate,
          deliveredFromPublished,
          peakDay,
        },
      };
    } catch (error) {
      throw new HttpException(
        error?.message || 'Erro ao buscar volume de fretes',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getActiveRoutes(companyId: string, page = 1, limit = 20) {
    try {
      const now = new Date();
      const offset = (page - 1) * limit;
      const informed = deliveryInformedCondition('fr');
      const lateOrRisk = `f."dateReceiver" IS NOT NULL AND f."dateReceiver"`;

      const [rows, [count]] = await Promise.all([
        this.db.query(
          `
          SELECT
            fr.id                  AS route_id,
            fr."freightId"         AS freight_id,
            fr."userDriveId"       AS driver_id,
            fr."startedAt"         AS started_at,
            ud.name                AS driver_name,
            ud."photoFaceURL"      AS driver_photo,
            f."originCity"         AS origin_city,
            f."originState"        AS origin_state,
            f."destinyCity"        AS destiny_city,
            f."destinyState"       AS destiny_state,
            f."dateReceiver"       AS expected_delivery,
            v."vehicleType"        AS vehicle_type,
            v."bodyType"           AS body_type,
            v."plateNumber"        AS plate_number,
            CASE
              WHEN ${informed}                        THEN 'ENTREGA_INFORMADA'
              WHEN ${lateOrRisk} < $2                 THEN 'ATRASADA'
              WHEN ${lateOrRisk} <= ($2 + INTERVAL '24 hours') THEN 'RISCO_DE_ATRASO'
              ELSE 'EM_ROTA'
            END                    AS status,
            CASE
              WHEN NOT ${informed} AND ${lateOrRisk} < $2
                THEN ROUND(EXTRACT(EPOCH FROM ($2 - f."dateReceiver")) / 3600, 2)
              ELSE NULL
            END                    AS overdue_hours
          FROM freight_routes fr
          INNER JOIN freight f      ON f.id = fr."freightId"
          LEFT  JOIN users_drive ud ON ud.id = fr."userDriveId"
          ${mainVehicleJoin('fr."userDriveId"')}
          WHERE fr."companyId" = $1
            AND fr.status = 'PROGUESS'
            AND fr."isActive" = true
          ORDER BY
            CASE
              WHEN NOT ${informed} AND ${lateOrRisk} < $2 THEN 1
              WHEN ${informed}                            THEN 2
              WHEN ${lateOrRisk} <= ($2 + INTERVAL '24 hours') THEN 3
              ELSE 4
            END ASC,
            fr."startedAt" DESC
          LIMIT $3 OFFSET $4
          `,
          [companyId, now, limit, offset],
        ),

        this.db.query(
          `
          SELECT COUNT(fr.id) AS total
          FROM freight_routes fr
          WHERE fr."companyId" = $1
            AND fr.status = 'PROGUESS'
            AND fr."isActive" = true
          `,
          [companyId],
        ),
      ]);

      const total = Number(count?.total ?? 0);
      const totalPages = Math.ceil(total / limit);

      return {
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
        data: rows.map((r: any) => ({
          routeId: r.route_id,
          freightId: r.freight_id,
          status: r.status,
          overdueHours: r.overdue_hours !== null ? Number(r.overdue_hours) : null,
          startedAt: r.started_at,
          expectedDelivery: r.expected_delivery ?? null,
          driver: {
            id: r.driver_id,
            name: r.driver_name,
            photo: r.driver_photo ?? null,
          },
          route: {
            originCity: r.origin_city,
            originState: r.origin_state,
            destinyCity: r.destiny_city,
            destinyState: r.destiny_state,
            label: `${r.origin_city}/${r.origin_state} → ${r.destiny_city}/${r.destiny_state}`,
          },
          vehicle: r.vehicle_type
            ? {
                vehicleType: r.vehicle_type,
                bodyType: r.body_type,
                plateNumber: r.plate_number,
              }
            : null,
        })),
      };
    } catch (error) {
      throw new HttpException(
        error?.message || 'Erro ao buscar rotas ativas',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getPendingSolicitations(companyId: string, page = 1, limit = 20) {
    try {
      const now = new Date();
      const offset = (page - 1) * limit;
      const waiting = `EXTRACT(EPOCH FROM ($2 - freq."createdAt")) / 60`;

      const [rows, pending] = await Promise.all([
        this.db.query(
          `
          SELECT
            freq.id                AS solicitation_id,
            freq."freightId"       AS freight_id,
            freq."createdAt"       AS requested_at,
            f."originCity"         AS origin_city,
            f."originState"        AS origin_state,
            f."destinyCity"        AS destiny_city,
            f."destinyState"       AS destiny_state,
            f."dateOrigin"         AS date_origin,
            cc.id                  AS contact_id,
            cc.name                AS contact_name,
            cc."phoneNumber"       AS contact_phone,
            ud.id                  AS driver_id,
            ud.name                AS driver_name,
            ud."photoFaceURL"      AS driver_photo,
            v."vehicleType"        AS vehicle_type,
            v."bodyType"           AS body_type,
            v."plateNumber"        AS plate_number,
            ROUND(${waiting}, 2)   AS waiting_minutes,
            CASE
              WHEN ${waiting} >= ${URGENT_WAIT_MINUTES}    THEN 'ALTA'
              WHEN ${waiting} >= ${ATTENTION_WAIT_MINUTES} THEN 'MEDIA'
              ELSE 'BAIXA'
            END                    AS priority
          FROM freight_requests freq
          INNER JOIN freight f      ON f.id = freq."freightId"
          LEFT  JOIN "contact-company" cc ON cc.id = f."contactCompanyId"
          LEFT  JOIN users_drive ud ON ud.id = freq."userDriveId"
          ${mainVehicleJoin('freq."userDriveId"')}
          WHERE f."companyId" = $1
            AND f."isExclude" = false
            AND freq.status = 'PENDING'
          ORDER BY freq."createdAt" ASC
          LIMIT $3 OFFSET $4
          `,
          [companyId, now, limit, offset],
        ),
        this.countPendingSolicitations(companyId, now),
      ]);

      const totalPages = Math.ceil(pending.total / limit);

      return {
        summary: {
          total: pending.total,
          urgent: pending.urgent,
          /** Chegaram há menos de ATTENTION_WAIT_MINUTES. */
          immediateResponse: pending.recent,
        },
        pagination: {
          page,
          limit,
          total: pending.total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
        data: rows.map((r: any) => ({
          solicitationId: r.solicitation_id,
          freightId: r.freight_id,
          requestedAt: r.requested_at,
          waitingMinutes: Number(r.waiting_minutes),
          priority: r.priority,
          seller: r.contact_id
            ? { id: r.contact_id, name: r.contact_name, phone: r.contact_phone ?? null }
            : null,
          route: {
            originCity: r.origin_city,
            originState: r.origin_state,
            destinyCity: r.destiny_city,
            destinyState: r.destiny_state,
            label: `${r.origin_city}/${r.origin_state} → ${r.destiny_city}/${r.destiny_state}`,
            dateOrigin: r.date_origin ?? null,
          },
          driver: {
            id: r.driver_id,
            name: r.driver_name,
            photo: r.driver_photo ?? null,
          },
          vehicle: r.vehicle_type
            ? {
                vehicleType: r.vehicle_type,
                bodyType: r.body_type,
                plateNumber: r.plate_number,
              }
            : null,
        })),
      };
    } catch (error) {
      throw new HttpException(
        error?.message || 'Erro ao buscar solicitações pendentes',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Solicitações em aberto da empresa (ver PENDING_SOLICITATIONS_FROM):
   * total, urgentes (sem resposta há URGENT_WAIT_MINUTES) e recentes.
   */
  private async countPendingSolicitations(companyId: string, now: Date) {
    const [row] = await this.db.query(
      `SELECT
         COUNT(freq.id) AS total,
         COUNT(freq.id) FILTER (WHERE freq."createdAt" <= $2) AS urgent,
         COUNT(freq.id) FILTER (WHERE freq."createdAt" > $3)  AS recent
       ${PENDING_SOLICITATIONS_FROM}`,
      [
        companyId,
        new Date(now.getTime() - URGENT_WAIT_MINUTES * 60000),
        new Date(now.getTime() - ATTENTION_WAIT_MINUTES * 60000),
      ],
    );
    return {
      total: Number(row?.total ?? 0),
      urgent: Number(row?.urgent ?? 0),
      recent: Number(row?.recent ?? 0),
    };
  }
}
