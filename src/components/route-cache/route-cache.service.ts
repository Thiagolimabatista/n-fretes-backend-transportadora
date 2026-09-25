import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RouteCache } from '@entities/route-cache.entity';
import { RouteCacheResponseDto } from './dto/route-cache-response.dto';
import { QualpService, CalculateTollResult } from './qualp.service';
import { CalculateRouteDto } from './dto/calculate-route.dto';

/** Tarifas de pedágio mudam pouco: a rota é recalculada depois de 20 dias. */
const CACHE_VALIDITY_MS = 20 * 24 * 60 * 60 * 1000;
const DEFAULT_AXIS = 2;

/** "  Rio  Verde, GO " -> "Rio Verde, GO": mesma chave para o mesmo texto. */
const normalizePlace = (value: string) => value.trim().replace(/\s+/g, ' ');

@Injectable()
export class RouteCacheService {
  private readonly logger = new Logger(RouteCacheService.name);

  constructor(
    @InjectRepository(RouteCache)
    private readonly routeCacheRepository: Repository<RouteCache>,
    private readonly qualpService: QualpService,
  ) {}

  /** Rota em cache e ainda válida (null se não houver ou se venceu). */
  async getRouteCache(
    originCity: string,
    destinationCity: string,
    axis = DEFAULT_AXIS,
  ): Promise<RouteCacheResponseDto | null> {
    const cached = await this.routeCacheRepository.findOne({
      where: {
        originCity: normalizePlace(originCity),
        destinationCity: normalizePlace(destinationCity),
        axis,
      },
    });
    if (!cached || Date.now() - new Date(cached.updatedAt).getTime() > CACHE_VALIDITY_MS) {
      return null;
    }
    return this.toResponse(cached);
  }

  /** Cache válido ou cálculo no QualP (grava o resultado para os próximos). */
  async calculateOrGetCached(dto: CalculateRouteDto): Promise<RouteCacheResponseDto> {
    const originCity = normalizePlace(dto.originCity);
    const destinationCity = normalizePlace(dto.destinationCity);
    const axis = dto.axis ?? DEFAULT_AXIS;

    const cached = await this.getRouteCache(originCity, destinationCity, axis);
    if (cached) return cached;

    this.logger.log(`Calculando no QualP: ${originCity} -> ${destinationCity} (${axis} eixos)`);
    const result = await this.qualpService.calculateToll({
      locations: [originCity, destinationCity],
      axis,
      fuelPrice: dto.fuelPrice,
      kmPerLiter: dto.kmPerLiter,
      routeType: dto.routeType,
    });

    const saved = await this.save(originCity, destinationCity, axis, result);
    return this.toResponse(saved);
  }

  /** Grava ou atualiza a linha da rota (upsert pela chave origem + destino + eixos). */
  private async save(
    originCity: string,
    destinationCity: string,
    axis: number,
    result: CalculateTollResult,
  ): Promise<RouteCache> {
    const fields = {
      tolls: result.tolls.map((t) => ({ ...t, km: String(t.km) })),
      totalToll: result.totalToll,
      distance: Math.round(result.distance),
      distanceText: result.distanceText,
      duration: result.duration,
      fuelConsumption: result.fuelConsumption,
      coordinates: result.coordinates as RouteCache['coordinates'],
      isValid: true,
      updatedAt: new Date(),
    };
    await this.routeCacheRepository
      .createQueryBuilder()
      .insert()
      .into(RouteCache)
      .values({ originCity, destinationCity, axis, ...fields })
      .orUpdate(Object.keys(fields), ['originCity', 'destinationCity', 'axis'])
      .execute();
    return this.routeCacheRepository.findOneOrFail({ where: { originCity, destinationCity, axis } });
  }

  private toResponse(route: RouteCache): RouteCacheResponseDto {
    return {
      id: route.id,
      success: true,
      axis: route.axis,
      tolls: route.tolls,
      totalToll: Number(route.totalToll),
      distance: route.distance,
      distanceText: route.distanceText,
      duration: route.duration,
      fuelConsumption: Number(route.fuelConsumption),
      coordinates: route.coordinates,
      cachedAt: route.updatedAt,
      isValid: true,
    };
  }
}
