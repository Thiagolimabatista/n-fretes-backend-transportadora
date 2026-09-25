import { Body, Controller, Get, HttpCode, NotFoundException, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/guards/jwt-auth-guard';
import { RouteCacheService } from './route-cache.service';
import { GetRouteCacheQueryDto } from './dto/get-route-cache.dto';
import { RouteCacheResponseDto } from './dto/route-cache-response.dto';
import { CalculateRouteDto } from './dto/calculate-route.dto';

/**
 * Rota e pedágio (QualP) com cache. Só usuários logados: cada cálculo
 * consome a cota paga do QualP. O cache só é gravado pelo próprio cálculo.
 */
@UseGuards(JwtAuthGuard)
@Controller('route-cache')
export class RouteCacheController {
  constructor(private readonly routeCacheService: RouteCacheService) {}

  @Get()
  async getRouteCache(@Query() query: GetRouteCacheQueryDto): Promise<RouteCacheResponseDto> {
    const result = await this.routeCacheService.getRouteCache(
      query.originCity,
      query.destinationCity,
      query.axis,
    );
    if (!result) {
      throw new NotFoundException('Rota não calculada ainda. Calcule o pedágio novamente.');
    }
    return result;
  }

  @Post('calculate')
  @HttpCode(200)
  async calculateRoute(@Body() dto: CalculateRouteDto): Promise<RouteCacheResponseDto> {
    return this.routeCacheService.calculateOrGetCached(dto);
  }
}
