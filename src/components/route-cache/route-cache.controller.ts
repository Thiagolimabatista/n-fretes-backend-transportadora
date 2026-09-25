import { Controller, Get, Post, Put, Body, Query, HttpCode } from '@nestjs/common';
import { RouteCacheService } from './route-cache.service';
import { GetRouteCacheQueryDto } from './dto/get-route-cache.dto';
import { CreateUpdateRouteCacheDto } from './dto/create-update-route-cache.dto';
import { RouteCacheResponseDto, SaveRouteCacheResponseDto } from './dto/route-cache-response.dto';
import { CalculateRouteDto } from './dto/calculate-route.dto';

@Controller('route-cache')
export class RouteCacheController {
  constructor(private readonly routeCacheService: RouteCacheService) {}

  @Get()
  async getRouteCache(
    @Query() query: GetRouteCacheQueryDto,
  ): Promise<RouteCacheResponseDto> {
    const result = await this.routeCacheService.getRouteCache(
      query.originCity,
      query.destinationCity,
    );

    if (!result) {
      throw new Error(
        'Cache não encontrado ou expirado. Calcule novamente a rota.',
      );
    }

    return result;
  }

  @Post('calculate')
  @HttpCode(200)
  async calculateRoute(
    @Body() dto: CalculateRouteDto,
  ): Promise<RouteCacheResponseDto> {
    return this.routeCacheService.calculateOrGetCached(dto);
  }

  @Post()
  async createRouteCache(
    @Body() data: CreateUpdateRouteCacheDto,
  ): Promise<SaveRouteCacheResponseDto> {
    return this.routeCacheService.saveOrUpdateRouteCache(data);
  }

  @Put()
  async updateRouteCache(
    @Body() data: CreateUpdateRouteCacheDto,
  ): Promise<SaveRouteCacheResponseDto> {
    return this.routeCacheService.saveOrUpdateRouteCache(data);
  }
}
