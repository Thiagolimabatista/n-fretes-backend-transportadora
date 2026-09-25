import { Controller, Post, Body, Get, Param, UseGuards } from '@nestjs/common';
import { FreightRouteLocationsService } from './freight-route-locations.service';
import { CreateRouteLocationDto } from './dto/create-route-location.dto';
import { FreightRouteLocations } from '../../entities/freight-route-locations.entity';
import { JwtAuthGuard } from '../../guards/jwt-auth-guard';
import { GetUserId } from '../../decorators/get-user-decorator';

@Controller('freight-route-locations')
@UseGuards(JwtAuthGuard)
export class FreightRouteLocationsController {
  constructor(
    private readonly routeLocationsService: FreightRouteLocationsService,
  ) {}

  @Post()
  async create(
    @GetUserId() companyId: string,
    @Body() createLocationDto: CreateRouteLocationDto,
  ): Promise<FreightRouteLocations> {
    return await this.routeLocationsService.create(
      companyId,
      createLocationDto,
    );
  }

  @Get('route/:routeId')
  async findByRouteId(
    @GetUserId() companyId: string,
    @Param('routeId') routeId: string,
  ): Promise<FreightRouteLocations[]> {
    return await this.routeLocationsService.findByRouteId(companyId, routeId);
  }

  @Get('route/:routeId/latest')
  async getLatestLocation(
    @GetUserId() companyId: string,
    @Param('routeId') routeId: string,
  ): Promise<FreightRouteLocations> {
    return await this.routeLocationsService.getLatestLocation(
      companyId,
      routeId,
    );
  }
}
