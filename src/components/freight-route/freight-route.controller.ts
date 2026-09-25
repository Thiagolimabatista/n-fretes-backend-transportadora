import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/guards/jwt-auth-guard';
import { GetUserId } from 'src/decorators/get-user-decorator';
import { Actor, GetActor } from 'src/decorators/get-actor.decorator';
import { FreightRouteService } from './freight-route.service';
import { ParamsFreightRoute } from './interface/IFreightRoute';
import { RouteStatus } from '@entities/freight-routes.entity';

@Controller('freight-route')
export class FreightRouteController {
  constructor(private readonly freightRouteService: FreightRouteService) {}

  @Post('create')
  @UseGuards(JwtAuthGuard)
  async createRouteInProgress(
    @GetActor() actor: Actor,
    @Body('freightId') freightId: string,
    @Body('userDriveId') userDriveId: string,
  ) {
    return this.freightRouteService.createRouteInProgress(
      actor.companyId,
      freightId,
      userDriveId,
      actor,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@GetUserId() userId: string, @Query() params: ParamsFreightRoute) {
    return this.freightRouteService.findAll(userId, params);
  }

  @Get('overdue')
  @UseGuards(JwtAuthGuard)
  findAllOverdue(
    @GetUserId() userId: string,
    @Query() params: ParamsFreightRoute,
  ) {
    return this.freightRouteService.findAllOverdue(userId, params);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  async updateStatus(
    @GetActor() actor: Actor,
    @Param('id') routeId: string,
    @Body('status') status: RouteStatus,
  ) {
    return this.freightRouteService.updateStatus(actor.companyId, routeId, status, actor);
  }

  /** Cancelar viagem em andamento (o motorista é avisado; o histórico fica). */
  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard)
  async cancelRoute(@GetActor() actor: Actor, @Param('id') routeId: string) {
    return this.freightRouteService.cancelRouteByCompany(routeId, actor);
  }

  /** Linha do tempo da rota: eventos, pontos do rastreamento e resumo. */
  @Get(':id/timeline')
  @UseGuards(JwtAuthGuard)
  async getTimeline(
    @GetUserId() companyId: string,
    @Param('id') routeId: string,
  ) {
    return this.freightRouteService.getTimeline(companyId, routeId);
  }

  @Delete(':id/hard-delete')
  @UseGuards(JwtAuthGuard)
  async hardDeleteRoute(@Param('id') routeId: string, @GetActor() actor: Actor) {
    return this.freightRouteService.hardDeleteRoute(routeId, actor.companyId, actor);
  }

  @Get(':userId/statics')
  async getStatics(@Param('userId') userId: string) {
    return this.freightRouteService.getStaticsUserRoute(userId);
  }

  @Get('avaliations')
  @UseGuards(JwtAuthGuard)
  async getAvalatiation(
    @GetUserId() userId: string,
    @Query() params: ParamsFreightRoute,
  ) {
    return this.freightRouteService.getAvalatiation(userId, params);
  }
}
