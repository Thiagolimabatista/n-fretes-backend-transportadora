import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { GetUserId } from 'src/decorators/get-user-decorator';
import { JwtAuthGuard } from 'src/guards/jwt-auth-guard';

/** Página a partir de 1 e no máximo 50 itens, com fallback para valores inválidos. */
function pagination(page?: string, limit?: string) {
  const p = Math.floor(Number(page));
  const l = Math.floor(Number(limit));
  return {
    page: Number.isFinite(p) && p >= 1 ? p : 1,
    limit: Number.isFinite(l) && l >= 1 ? Math.min(l, 50) : 20,
  };
}

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('weekly-summary')
  async getWeeklySummary(@GetUserId() userId: string) {
    return this.dashboardService.getWeeklySummary(userId);
  }

  @Get('daily-alerts')
  async getDailyAlerts(@GetUserId() userId: string) {
    return this.dashboardService.getDailyAlerts(userId);
  }

  @Get('freight-volume')
  async getFreightVolume(
    @GetUserId() userId: string,
    @Query('period') period?: string,
  ) {
    const p = Number(period);
    const validPeriod = ([7, 30, 90] as const).includes(p as any)
      ? (p as 7 | 30 | 90)
      : 7;
    return this.dashboardService.getFreightVolume(userId, validPeriod);
  }

  @Get('active-routes')
  async getActiveRoutes(
    @GetUserId() userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = pagination(page, limit);
    return this.dashboardService.getActiveRoutes(userId, p.page, p.limit);
  }

  @Get('pending-solicitations')
  async getPendingSolicitations(
    @GetUserId() userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = pagination(page, limit);
    return this.dashboardService.getPendingSolicitations(userId, p.page, p.limit);
  }
}
