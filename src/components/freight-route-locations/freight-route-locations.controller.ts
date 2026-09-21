import { Controller, Post, Body, Get, Param, UseGuards } from '@nestjs/common';
import { FreightRouteLocationsService } from './freight-route-locations.service';
import { CreateRouteLocationDto } from './dto/create-route-location.dto';
import { FreightRouteLocations } from '../../entities/freight-route-locations.entity';
import { JwtAuthGuard } from '../../guards/jwt-auth-guard';
import { GetUserId } from '../../decorators/get-user-decorator';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('freight-route-locations')
@Controller('freight-route-locations')
@UseGuards(JwtAuthGuard)
export class FreightRouteLocationsController {
  constructor(
    private readonly routeLocationsService: FreightRouteLocationsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new route location' })
  @ApiResponse({
    status: 201,
    description: 'The location has been successfully created.',
  })
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
  @ApiOperation({ summary: 'Get all locations for a specific route' })
  @ApiResponse({
    status: 200,
    description: 'Return all locations for the route.',
  })
  async findByRouteId(
    @GetUserId() companyId: string,
    @Param('routeId') routeId: string,
  ): Promise<FreightRouteLocations[]> {
    return await this.routeLocationsService.findByRouteId(companyId, routeId);
  }

  @Get('route/:routeId/latest')
  @ApiOperation({ summary: 'Get the latest location for a specific route' })
  @ApiResponse({
    status: 200,
    description: 'Return the latest location for the route.',
  })
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
