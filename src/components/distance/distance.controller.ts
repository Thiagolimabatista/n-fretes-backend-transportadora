import { Controller, Get, Query } from '@nestjs/common';
import { DistanceService } from './distance.service';

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
