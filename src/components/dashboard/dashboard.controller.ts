import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { GetUserId } from 'src/decorators/get-user-decorator';
import { JwtAuthGuard } from 'src/guards/jwt-auth-guard';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getDashboard(@GetUserId() userId: string) {
    return this.dashboardService.getCompanyDashboard(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('quick-stats')
  async getQuickStats(@GetUserId() userId: string) {
    return this.dashboardService.getQuickStats(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('freights-by-month')
  async getFreightsByMonth(@GetUserId() userId: string) {
    return this.dashboardService.getFreightsByMonth(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('freights-by-region')
  async getFreightsByRegion(@GetUserId() userId: string) {
    return this.dashboardService.getFreightsByRegion(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('metrics-dashboard')
  async getMetricsDashboard(@GetUserId() userId: string) {
    return this.dashboardService.getMetricsDashboard(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('weekly-summary')
  async getWeeklySummary(@GetUserId() userId: string) {
    return this.dashboardService.getWeeklySummary(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('daily-alerts')
  async getDailyAlerts(@GetUserId() userId: string) {
    return this.dashboardService.getDailyAlerts(userId);
  }

  @UseGuards(JwtAuthGuard)
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

  @UseGuards(JwtAuthGuard)
  @Get('active-routes')
  async getActiveRoutes(
    @GetUserId() userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.dashboardService.getActiveRoutes(
      userId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('pending-solicitations')
  async getPendingSolicitations(
    @GetUserId() userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.dashboardService.getPendingSolicitations(
      userId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }
}
