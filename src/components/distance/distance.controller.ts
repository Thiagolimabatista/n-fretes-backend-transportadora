import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/guards/jwt-auth-guard';
import { DistanceService } from './distance.service';

/** Só usuários logados: cada chamada consome a cota paga do Google. */
@UseGuards(JwtAuthGuard)
@Controller('distance')
export class DistanceController {
  constructor(private readonly distanceService: DistanceService) {}

  @Get('by-cities')
  async distanceByCities(
    @Query('originCity') originCity: string,
    @Query('destinationCity') destinationCity: string,
  ) {
    return this.distanceService.calculateDistanceByCities(originCity, destinationCity);
  }
}
