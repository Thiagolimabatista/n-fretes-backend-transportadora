import {
  TollDataDto,
  RouteCoordinatesDto,
} from './create-update-route-cache.dto';

export class RouteCacheResponseDto {
  id: string;

  success: boolean;

  /** Eixos usados na tarifa. */
  axis: number;

  tolls: TollDataDto[];

  totalToll: number;

  distance: number;

  distanceText: string;

  duration: string;

  fuelConsumption: number;

  coordinates: RouteCoordinatesDto;

  cachedAt?: Date;

  isValid?: boolean;
}

export class SaveRouteCacheResponseDto {
  success: boolean;

  message: string;

  id: string;
}
