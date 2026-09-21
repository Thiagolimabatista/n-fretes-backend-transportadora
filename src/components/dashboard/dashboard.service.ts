import { HttpException, HttpStatus, Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { FreightRoutes, RouteStatus } from '@entities/freight-routes.entity';
import { UsersDrive } from '@entities/users-drive.entity';
import { CompanyUsersContacts } from '@entities/company-users-contacts.entity';
import { ReviewUserDrive } from '@entities/review-users-drive.entity';
import { Freight } from '@entities/freight.entity';
import {
  FreightRequest,
  FreightRequestStatus,
} from '@entities/freight-requests.entity';
import { Vehicle } from '@entities/vehicles.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(FreightRoutes)
    private readonly freightRoutesRepository: Repository<FreightRoutes>,
    @InjectRepository(CompanyUsersContacts)
    private usersContactCompanyRepository: Repository<CompanyUsersContacts>,
    @InjectRepository(ReviewUserDrive)
    private reviewRepository: Repository<ReviewUserDrive>,
    @InjectRepository(Freight)
    private freightRepository: Repository<Freight>,
    @InjectRepository(FreightRequest)
    private freightRequestRepository: Repository<FreightRequest>,
    @InjectRepository(Vehicle)
    private vehicleRepository: Repository<Vehicle>,
  ) {}

  async getCompanyDashboard(userId: string) {
    try {
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1;

      const firstDayOfMonth = new Date(currentYear, currentDate.getMonth(), 1);
      const lastDayOfMonth = new Date(
        currentYear,
        currentDate.getMonth() + 1,
        0,
      );
      const yearStart = new Date(`${currentYear}-01-01`);
      const yearEnd = new Date(`${currentYear}-12-31`);

      const [
        activeFreights,
        allYearFreights,
        reviews,
        driversCount,
        freightRoutes,
        allFreights,
      ] = await Promise.all([
        this.freightRepository.find({
          where: {
            companyId: userId,
            openSolicitations: true,
            isActive: true,
          },
          select: ['id', 'Valuefreight'], // só buscar campos necessários
        }),

        this.freightRepository.find({
          where: {
            companyId: userId,
            createdAt: Between(yearStart, yearEnd),
          },
          select: ['id', 'createdAt'], // só buscar campos necessários
        }),

        this.reviewRepository.find({
          where: { companyId: userId, isUserReviewingCompany: true },
          relations: ['userDrive'],
          order: { createdAt: 'DESC' },
        }),

        this.usersContactCompanyRepository.count({
          where: {
            companyId: userId,
            isActive: true,
            createdAt: Between(firstDayOfMonth, lastDayOfMonth),
          },
        }),

        // Fretes em andamento
        this.freightRoutesRepository.find({
          where: { companyId: userId, status: RouteStatus.IN_PROGRESS },
          relations: ['userDrive', 'freight'],
          select: {
            id: true,
            userDrive: { name: true },
            freight: { originCity: true, destinyCity: true },
          },
        }),

        // Todos os fretes para análise de destinos
        this.freightRepository.find({
          where: { companyId: userId },
          select: ['destinyCity'],
        }),
      ]);

      // Processamento dos fretes
      const freightCount = activeFreights.length;
      const averageFreightValue =
        freightCount > 0
          ? activeFreights.reduce(
              (sum, freight) => sum + freight.Valuefreight,
              0,
            ) / freightCount
          : 0;

      const yearlyTotal = allYearFreights.length;
      const monthlyAverage = yearlyTotal / currentMonth;

      // Processamento mensal
      const freightsByMonth = Array(currentMonth).fill(0);
      allYearFreights.forEach((freight) => {
        const month = new Date(freight.createdAt).getMonth();
        if (month < currentMonth) {
          freightsByMonth[month]++;
        }
      });

      const monthlyFreightsData = freightsByMonth.map((count, index) => ({
        month: index + 1,
        monthName: new Date(2000, index, 1).toLocaleString('pt-BR', {
          month: 'long',
        }),
        count,
      }));

      // Processamento das avaliações
      const latestReviews = reviews.slice(0, 2).map((review) => ({
        rating: review.rating,
        comment: review.comment || 'Sem comentário',
        userName: review.userDrive?.name || 'Anônimo',
        date: review.createdAt.toISOString().split('T')[0],
        photoUrl: review.userDrive?.photoFaceURL,
      }));

      const uniqueReviews = reviews.reduce((acc, review) => {
        if (
          review.userDriveId &&
          !acc.some((r) => r.userDriveId === review.userDriveId)
        ) {
          acc.push(review);
        }
        return acc;
      }, []);

      const averageRating =
        uniqueReviews.length > 0
          ? uniqueReviews.reduce((sum, review) => sum + review.rating, 0) /
            uniqueReviews.length
          : 0;

      // Nova funcionalidade: Distribuição de ratings
      const ratingDistribution = {
        5: 0,
        4: 0,
        3: 0,
        2: 0,
        1: 0,
      };

      uniqueReviews.forEach((review) => {
        const rating = Math.floor(review.rating); // Garante que seja um número inteiro
        if (rating >= 1 && rating <= 5) {
          ratingDistribution[rating]++;
        }
      });

      const destinationCounts = allFreights.reduce(
        (acc, freight) => {
          if (freight.destinyCity) {
            acc[freight.destinyCity] = (acc[freight.destinyCity] || 0) + 1;
          }
          return acc;
        },
        {} as Record<string, number>,
      );

      const topDestinations = Object.entries(destinationCounts)
        .filter(([_, count]) => count >= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([city, count]) => ({ city, count }));

      return {
        freightStatistics: {
          activeCount: freightCount,
          averageValue: averageFreightValue,
          monthlyAverage,
          yearlyTotal,
          monthlyFreights: monthlyFreightsData,
          topDestinations,
        },
        ratingStatistics: {
          averageRating,
          totalRatings: uniqueReviews.length,
          latestReviews,
          ratingDistribution,
        },
        freightProguess: freightRoutes,
        driversCount,
      };
    } catch (error) {
      console.error('Dashboard Error:', error);
      throw new HttpException(
        'Failed to fetch dashboard data',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getQuickStats(userId: string) {
    try {
      const [
        activeFreightsCount,
        totalFreightsCount,
        openSolicitations,
        pendingReviews,
        driversInProgress,
      ] = await Promise.all([
        this.freightRepository.count({
          where: {
            companyId: userId,
            openSolicitations: true,
            isActive: true,
          },
        }),

        this.freightRepository.count({
          where: {
            companyId: userId,
          },
        }),

        this.freightRequestRepository
          .createQueryBuilder('freightRequest')
          .leftJoin('freightRequest.freight', 'freight')
          .where('freightRequest.companyId = :userId', { userId })
          .andWhere('freightRequest.status = :status', {
            status: FreightRequestStatus.PENDING,
          })
          .andWhere('freight.isActive = :isActive', { isActive: true })
          .andWhere('freight.openSolicitations = :openSolicitations', {
            openSolicitations: true,
          })
          .getCount(),

        this.freightRoutesRepository
          .createQueryBuilder('route')
          .leftJoin(
            'route.reviewUserDrive',
            'review',
            'review.routeId = route.id AND review.isCompanyReviewingUser = true',
          )
          .where('route.companyId = :userId', { userId })
          .andWhere('route.status = :status', { status: 'COMPLETED' })
          .andWhere('review.id IS NULL')
          .getCount(),

        this.freightRoutesRepository.count({
          where: {
            companyId: userId,
            status: RouteStatus.IN_PROGRESS,
          },
        }),
      ]);

      return {
        activeFreights: activeFreightsCount,
        totalFreights: totalFreightsCount,
        openSolicitations: openSolicitations,
        pendingReviews: pendingReviews,
        driversInProgress: driversInProgress,
      };
    } catch (error) {
      console.error('Quick Stats Error:', error);
      throw new HttpException(
        'Failed to fetch quick stats',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getFreightsByMonth(userId: string) {
    try {
      const currentYear = new Date().getFullYear();

      const freights = await this.freightRepository
        .createQueryBuilder('freight')
        .select('EXTRACT(MONTH FROM freight.createdAt)', 'month')
        .addSelect('COUNT(*)', 'count')
        .where('freight.companyId = :userId', { userId })
        .andWhere('EXTRACT(YEAR FROM freight.createdAt) = :year', {
          year: currentYear,
        })
        .groupBy('EXTRACT(MONTH FROM freight.createdAt)')
        .orderBy('EXTRACT(MONTH FROM freight.createdAt)', 'ASC')
        .getRawMany();

      const monthlyData = freights.map((item) => {
        const monthNumber = parseInt(item.month);
        const monthName = new Date(
          currentYear,
          monthNumber - 1,
          1,
        ).toLocaleString('pt-BR', {
          month: 'long',
        });

        return {
          monthName: monthName.charAt(0).toUpperCase() + monthName.slice(1),
          count: parseInt(item.count),
        };
      });

      return monthlyData;
    } catch (error) {
      console.error('Freights by Month Error:', error);
      throw new HttpException(
        'Failed to fetch freights by month',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getFreightsByRegion(userId: string) {
    try {
      const stateToRegion = {
        AC: 'Norte',
        AP: 'Norte',
        AM: 'Norte',
        PA: 'Norte',
        RO: 'Norte',
        RR: 'Norte',
        TO: 'Norte',
        AL: 'Nordeste',
        BA: 'Nordeste',
        CE: 'Nordeste',
        MA: 'Nordeste',
        PB: 'Nordeste',
        PE: 'Nordeste',
        PI: 'Nordeste',
        RN: 'Nordeste',
        SE: 'Nordeste',
        GO: 'Centro-Oeste',
        MT: 'Centro-Oeste',
        MS: 'Centro-Oeste',
        DF: 'Centro-Oeste',
        ES: 'Sudeste',
        MG: 'Sudeste',
        RJ: 'Sudeste',
        SP: 'Sudeste',
        PR: 'Sul',
        RS: 'Sul',
        SC: 'Sul',
      };

      const freights = await this.freightRepository.find({
        where: { companyId: userId },
        select: ['originState'],
      });

      const regionCounts = {};
      let totalFreights = 0;

      freights.forEach((freight) => {
        if (freight.originState) {
          const uf = freight.originState.trim().toUpperCase();
          const region = stateToRegion[uf] || 'Outros';
          regionCounts[region] = (regionCounts[region] || 0) + 1;
          totalFreights++;
        }
      });

      const regionData = Object.entries(regionCounts)
        .map(([region, count]) => ({
          region,
          count: count as number,
          percentage: Math.round(((count as number) / totalFreights) * 100),
        }))
        .sort((a, b) => b.percentage - a.percentage);

      return regionData;
    } catch (error) {
      console.error('Freights by Region Error:', error);
      throw new HttpException(
        'Failed to fetch freights by region',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getMetricsDashboard(userId: string) {
    try {
      const currentDate = new Date();
      

      const last7DaysStart = new Date(currentDate);
      last7DaysStart.setDate(currentDate.getDate() - 7);
      last7DaysStart.setHours(0, 0, 0, 0);
      
      const previous7DaysStart = new Date(currentDate);
      previous7DaysStart.setDate(currentDate.getDate() - 14);
      previous7DaysStart.setHours(0, 0, 0, 0);
      
      const previous7DaysEnd = new Date(last7DaysStart);
      previous7DaysEnd.setHours(23, 59, 59, 999);

      const [
        totalFreights, 
        last7DaysFreights, 
        previous7DaysFreights,
        activeFreights,
        freightsInProgress,
        pendingRequests
      ] = await Promise.all([
        this.freightRepository.count({
          where: { companyId: userId },
        }),
        
        this.freightRepository.count({
          where: {
            companyId: userId,
            createdAt: Between(last7DaysStart, currentDate),
          },
        }),
        
        this.freightRepository.count({
          where: {
            companyId: userId,
            createdAt: Between(previous7DaysStart, previous7DaysEnd),
          },
        }),
        
      
        this.freightRepository.count({
          where: {
            companyId: userId,
            isActive: true,
            openSolicitations: true,
          },
        }),

        // Fretes em progresso (em rota)
        this.freightRoutesRepository.count({
          where: {
            companyId: userId,
            status: RouteStatus.IN_PROGRESS,
          },
        }),

        // Solicitações de frete pendentes
        this.freightRequestRepository.count({
          where: {
            companyId: userId,
            status: FreightRequestStatus.PENDING,
          },
        }),
      ]);

   
      let percentageChange = 0;
      if (previous7DaysFreights > 0) {
        percentageChange = ((last7DaysFreights - previous7DaysFreights) / previous7DaysFreights) * 100;
      } else if (last7DaysFreights > 0) {
        percentageChange = 100;
      }

      return {
        totalFreights,
        activeFreights,
        freightsInProgress,
        pendingRequests,
        last7Days: {
          count: last7DaysFreights,
          percentageChange: Math.round(percentageChange * 100) / 100, 
          comparison: percentageChange > 0 ? 'increase' : percentageChange < 0 ? 'decrease' : 'stable',
          previousWeekCount: previous7DaysFreights,
        },
      };
    } catch (error) {
      console.error('Metrics Dashboard Error:', error);
      throw new HttpException(
        'Failed to fetch metrics dashboard data',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getWeeklySummary(companyId: string) {
    try {
      const now = new Date();
      const end = new Date(now);
      end.setUTCHours(23, 59, 59, 999);
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      start.setUTCHours(0, 0, 0, 0);

      const [
        totalPublished,
        totalActive,
        totalInRoute,
        totalPendingRequests,
        totalDriversInRoute,
        leadTimeResult,
      ] = await Promise.all([
        // Total de fretes publicados nos últimos 7 dias
        this.freightRepository.count({
          where: {
            companyId,
            isExclude: false,
            createdAt: Between(start, end),
          },
        }),

        // Fretes ainda ativos (abertos para solicitação)
        this.freightRepository.count({
          where: {
            companyId,
            isExclude: false,
            isActive: true,
            openSolicitations: true,
          },
        }),

        // Fretes em rota (PROGUESS)
        this.freightRoutesRepository.count({
          where: {
            companyId,
            status: RouteStatus.IN_PROGRESS,
          },
        }),

        // Solicitações em aberto (PENDING) nos últimos 7 dias
        this.freightRequestRepository.count({
          where: {
            companyId,
            status: FreightRequestStatus.PENDING,
            createdAt: Between(start, end),
          },
        }),

        // Motoristas distintos em rota agora
        this.freightRoutesRepository
          .createQueryBuilder('fr')
          .select('COUNT(DISTINCT fr.userDriveId)', 'total')
          .where('fr.companyId = :companyId', { companyId })
          .andWhere('fr.status = :status', { status: RouteStatus.IN_PROGRESS })
          .andWhere('fr.userDriveId IS NOT NULL')
          .getRawOne(),

        // Lead time: tempo médio entre publicação do frete e 1ª solicitação recebida
        this.freightRepository.manager.query(
          `
          SELECT
            AVG(
              EXTRACT(EPOCH FROM (first_req.first_request_at - f."createdAt")) / 60
            ) AS avg_minutes,
            MIN(
              EXTRACT(EPOCH FROM (first_req.first_request_at - f."createdAt")) / 60
            ) AS min_minutes,
            MAX(
              EXTRACT(EPOCH FROM (first_req.first_request_at - f."createdAt")) / 60
            ) AS max_minutes
          FROM freight f
          INNER JOIN (
            SELECT "freightId", MIN("createdAt") AS first_request_at
            FROM freight_requests
            WHERE "companyId" = $1
            GROUP BY "freightId"
          ) first_req ON first_req."freightId" = f.id
          WHERE f."companyId" = $1
            AND f."isExclude" = false
            AND f."createdAt" BETWEEN $2 AND $3
          `,
          [companyId, start, end],
        ),
      ]);

      const avgMin = Number(Number(leadTimeResult[0]?.avg_minutes ?? 0).toFixed(2));
      const minMin = Number(Number(leadTimeResult[0]?.min_minutes ?? 0).toFixed(2));
      const maxMin = Number(Number(leadTimeResult[0]?.max_minutes ?? 0).toFixed(2));

      return {
        period: {
          startDate: start.toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
          endDate: end.toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
          days: 7,
        },
        freights: {
          publishedLast7Days: totalPublished,
          currentlyActive: totalActive,
          currentlyInRoute: totalInRoute,
        },
        solicitations: {
          pendingLast7Days: totalPendingRequests,
        },
        drivers: {
          currentlyInRoute: Number(totalDriversInRoute?.total ?? 0),
        },
        leadTime: {
          description: 'Tempo entre publicação do frete e 1ª solicitação recebida',
          avgMinutes: avgMin,
          avgHours: Number((avgMin / 60).toFixed(2)),
          minMinutes: minMin,
          maxMinutes: maxMin,
        },
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
      const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const [delayRiskRoutes, urgentSolicitations] = await Promise.all([
        // Rotas em progresso com data de entrega já passada ou dentro de 24h
        this.freightRepository.manager.query(
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
            AND fr.status = 'PROGUESS'
            AND f."dateReceiver" IS NOT NULL
            AND f."dateReceiver" <= $2
          ORDER BY f."dateReceiver" ASC
          `,
          [companyId, next24h, now],
        ),

        // Solicitações pendentes sem resposta criadas há mais de 1h
        this.freightRepository.manager.query(
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
          WHERE freq."companyId" = $1
            AND freq.status = 'PENDING'
            AND freq."createdAt" <= ($2 - INTERVAL '1 hour')
          ORDER BY freq."createdAt" ASC
          `,
          [companyId, now],
        ),
      ]);

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
          lateRoutes: lateRoutes.map((r: any) => ({
            routeId: r.route_id,
            freightId: r.freight_id,
            driverId: r.driver_id,
            driverName: r.driver_name,
            route: `${r.origin_city}/${r.origin_state} → ${r.destiny_city}/${r.destiny_state}`,
            expectedDelivery: r.expected_delivery,
            startedAt: r.started_at,
            overdueHours: Number(r.overdue_hours),
          })),
          atRiskRoutes: atRiskRoutes.map((r: any) => ({
            routeId: r.route_id,
            freightId: r.freight_id,
            driverId: r.driver_id,
            driverName: r.driver_name,
            route: `${r.origin_city}/${r.origin_state} → ${r.destiny_city}/${r.destiny_state}`,
            expectedDelivery: r.expected_delivery,
            startedAt: r.started_at,
            overdueHours: Number(r.overdue_hours),
          })),
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
      const end = new Date(now);
      end.setUTCHours(23, 59, 59, 999);
      const start = new Date(now);
      start.setDate(start.getDate() - (period - 1));
      start.setUTCHours(0, 0, 0, 0);

      const DAY_NAMES: Record<string, string> = {
        '0': 'Dom', '1': 'Seg', '2': 'Ter',
        '3': 'Qua', '4': 'Qui', '5': 'Sex', '6': 'Sáb',
      };

      const [publicationsRows, deliveriesRows, driversRows] = await Promise.all([
        // Publicações por dia
        this.freightRepository.manager.query(
          `
          SELECT
            TO_CHAR(f."createdAt", 'DD/MM')                         AS day_label,
            TO_CHAR(f."createdAt", 'YYYY-MM-DD')                    AS day_key,
            EXTRACT(DOW FROM f."createdAt")::text                   AS dow,
            COUNT(f.id)                                              AS total
          FROM freight f
          WHERE f."companyId" = $1
            AND f."isExclude" = false
            AND f."createdAt" BETWEEN $2 AND $3
          GROUP BY day_label, day_key, dow
          ORDER BY day_key ASC
          `,
          [companyId, start, end],
        ),

        // Entregas concluídas por dia
        this.freightRepository.manager.query(
          `
          SELECT
            TO_CHAR(fr."completedAt", 'DD/MM')                      AS day_label,
            TO_CHAR(fr."completedAt", 'YYYY-MM-DD')                 AS day_key,
            COUNT(fr.id)                                             AS total
          FROM freight_routes fr
          WHERE fr."companyId" = $1
            AND fr.status = 'COMPLETED'
            AND fr."completedAt" BETWEEN $2 AND $3
          GROUP BY day_label, day_key
          ORDER BY day_key ASC
          `,
          [companyId, start, end],
        ),

        // Motoristas em rota por dia (contagem de rotas iniciadas naquele dia)
        this.freightRepository.manager.query(
          `
          SELECT
            TO_CHAR(fr."startedAt", 'DD/MM')                        AS day_label,
            TO_CHAR(fr."startedAt", 'YYYY-MM-DD')                   AS day_key,
            COUNT(DISTINCT fr."userDriveId")                         AS total
          FROM freight_routes fr
          WHERE fr."companyId" = $1
            AND fr."userDriveId" IS NOT NULL
            AND fr."startedAt" BETWEEN $2 AND $3
          GROUP BY day_label, day_key
          ORDER BY day_key ASC
          `,
          [companyId, start, end],
        ),
      ]);

      // Gera todos os dias do período
      const days: string[] = [];
      const dayKeys: string[] = [];
      const dayLabels: string[] = [];
      const cursor = new Date(start);
      while (cursor <= end) {
        const key = cursor.toISOString().slice(0, 10);
        const label = cursor.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
        const dow = String(cursor.getUTCDay());
        days.push(period === 7 ? DAY_NAMES[dow] : label);
        dayKeys.push(key);
        dayLabels.push(label);
        cursor.setDate(cursor.getDate() + 1);
      }

      const toMap = (rows: any[]) =>
        Object.fromEntries(rows.map((r) => [r.day_key, Number(r.total)]));

      const pubMap = toMap(publicationsRows);
      const delMap = toMap(deliveriesRows);
      const drvMap = toMap(driversRows);

      const publications = dayKeys.map((k) => pubMap[k] ?? 0);
      const deliveries   = dayKeys.map((k) => delMap[k] ?? 0);
      const driversInRoute = dayKeys.map((k) => drvMap[k] ?? 0);

      const totalPublications = publications.reduce((a, b) => a + b, 0);
      const totalDeliveries   = deliveries.reduce((a, b) => a + b, 0);
      const conversionRate =
        totalPublications > 0
          ? Number(((totalDeliveries / totalPublications) * 100).toFixed(1))
          : 0;

      // Pico: dia com mais publicações
      const peakIndex = publications.indexOf(Math.max(...publications));
      const peakDay = days[peakIndex] ?? null;

      return {
        period: {
          days: period,
          startDate: start.toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
          endDate: end.toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
        },
        chart: {
          labels: days,
          series: {
            publications,
            deliveries,
            driversInRoute,
          },
        },
        summary: {
          totalPublications,
          totalDeliveries,
          conversionRate,
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

  async getActiveRoutes(
    companyId: string,
    page = 1,
    limit = 20,
  ) {
    try {
      const now = new Date();
      const offset = (page - 1) * limit;

      const [rows, countResult] = await Promise.all([
        this.freightRepository.manager.query(
          `
          SELECT
            fr.id                                   AS route_id,
            fr."freightId"                          AS freight_id,
            fr."userDriveId"                        AS driver_id,
            fr."startedAt"                          AS started_at,
            ud.name                                 AS driver_name,
            ud."photoFaceURL"                       AS driver_photo,
            f."originCity"                          AS origin_city,
            f."originState"                         AS origin_state,
            f."destinyCity"                         AS destiny_city,
            f."destinyState"                        AS destiny_state,
            f."dateReceiver"                        AS expected_delivery,
            v."vehicleType"                         AS vehicle_type,
            v."bodyType"                            AS body_type,
            v."plateNumber"                         AS plate_number,
            CASE
              WHEN f."dateReceiver" IS NOT NULL AND f."dateReceiver" < $2
                THEN 'ATRASADA'
              WHEN f."dateReceiver" IS NOT NULL AND f."dateReceiver" <= ($2 + INTERVAL '24 hours')
                THEN 'RISCO_DE_ATRASO'
              ELSE 'EM_ROTA'
            END                                     AS status,
            CASE
              WHEN f."dateReceiver" IS NOT NULL AND f."dateReceiver" < $2
                THEN ROUND(EXTRACT(EPOCH FROM ($2 - f."dateReceiver")) / 3600, 2)
              ELSE NULL
            END                                     AS overdue_hours
          FROM freight_routes fr
          INNER JOIN freight f      ON f.id = fr."freightId"
          LEFT  JOIN users_drive ud ON ud.id = fr."userDriveId"
          LEFT  JOIN vehicles v     ON v."userId" = fr."userDriveId"
                                   AND v."isMainVehicle" = true
          WHERE fr."companyId" = $1
            AND fr.status = 'PROGUESS'
          ORDER BY
            CASE
              WHEN f."dateReceiver" IS NOT NULL AND f."dateReceiver" < $2       THEN 1
              WHEN f."dateReceiver" IS NOT NULL AND f."dateReceiver" <= ($2 + INTERVAL '24 hours') THEN 2
              ELSE 3
            END ASC,
            fr."startedAt" DESC
          LIMIT $3 OFFSET $4
          `,
          [companyId, now, limit, offset],
        ),

        this.freightRepository.manager.query(
          `
          SELECT COUNT(fr.id) AS total
          FROM freight_routes fr
          WHERE fr."companyId" = $1
            AND fr.status = 'PROGUESS'
          `,
          [companyId],
        ),
      ]);

      const total = Number(countResult[0]?.total ?? 0);
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

  async getPendingSolicitations(
    companyId: string,
    page = 1,
    limit = 20,
  ) {
    try {
      const now = new Date();
      const offset = (page - 1) * limit;

      const [rows, countResult] = await Promise.all([
        this.freightRepository.manager.query(
          `
          SELECT
            freq.id                                       AS solicitation_id,
            freq."freightId"                             AS freight_id,
            freq."createdAt"                             AS requested_at,

            -- Frete
            f."originCity"                               AS origin_city,
            f."originState"                              AS origin_state,
            f."destinyCity"                              AS destiny_city,
            f."destinyState"                             AS destiny_state,
            f."dateOrigin"                               AS date_origin,

            -- Contato/vendedor vinculado ao frete
            cc.id                                        AS contact_id,
            cc.name                                      AS contact_name,
            cc."phoneNumber"                             AS contact_phone,

            -- Motorista
            ud.id                                        AS driver_id,
            ud.name                                      AS driver_name,
            ud."photoFaceURL"                            AS driver_photo,

            -- Ve\u00edculo principal do motorista
            v."vehicleType"                              AS vehicle_type,
            v."bodyType"                                 AS body_type,
            v."plateNumber"                              AS plate_number,

            -- Tempo de espera em minutos
            ROUND(
              EXTRACT(EPOCH FROM ($2 - freq."createdAt")) / 60, 2
            )                                            AS waiting_minutes,

            -- Prioridade baseada no tempo de espera
            CASE
              WHEN EXTRACT(EPOCH FROM ($2 - freq."createdAt")) / 60 >= 120 THEN 'ALTA'
              WHEN EXTRACT(EPOCH FROM ($2 - freq."createdAt")) / 60 >= 30  THEN 'MEDIA'
              ELSE 'BAIXA'
            END                                          AS priority

          FROM freight_requests freq
          INNER JOIN freight f      ON f.id = freq."freightId"
          LEFT  JOIN "contact-company" cc ON cc.id = f."contactCompanyId"
          LEFT  JOIN users_drive ud ON ud.id = freq."userDriveId"
          LEFT  JOIN vehicles v     ON v."userId" = freq."userDriveId"
                                   AND v."isMainVehicle" = true
          WHERE freq."companyId" = $1
            AND freq.status = 'PENDING'
          ORDER BY
            CASE
              WHEN EXTRACT(EPOCH FROM ($2 - freq."createdAt")) / 60 >= 120 THEN 1
              WHEN EXTRACT(EPOCH FROM ($2 - freq."createdAt")) / 60 >= 30  THEN 2
              ELSE 3
            END ASC,
            freq."createdAt" ASC
          LIMIT $3 OFFSET $4
          `,
          [companyId, now, limit, offset],
        ),

        this.freightRepository.manager.query(
          `
          SELECT
            COUNT(freq.id)                               AS total,
            COUNT(CASE
              WHEN EXTRACT(EPOCH FROM ($2 - freq."createdAt")) / 60 < 30
              THEN 1 END)                                AS immediate_response
          FROM freight_requests freq
          WHERE freq."companyId" = $1
            AND freq.status = 'PENDING'
          `,
          [companyId, now],
        ),
      ]);

      const total = Number(countResult[0]?.total ?? 0);
      const immediateResponse = Number(countResult[0]?.immediate_response ?? 0);
      const totalPages = Math.ceil(total / limit);

      return {
        summary: {
          total,
          immediateResponse,
        },
        pagination: {
          page,
          limit,
          total,
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
            ? {
                id: r.contact_id,
                name: r.contact_name,
                phone: r.contact_phone ?? null,
              }
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

}
