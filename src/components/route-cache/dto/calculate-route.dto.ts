import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsNumberString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CalculateRouteDto {
  @IsString()
  @IsNotEmpty()
  originCity: string;

  @IsString()
  @IsNotEmpty()
  destinationCity: string;

  /** Eixos do veículo (2 a 9); padrão 2. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(9)
  axis?: number;

  @IsOptional()
  @IsNumberString()
  fuelPrice?: string;

  @IsOptional()
  @IsNumberString()
  kmPerLiter?: string;

  @IsOptional()
  @IsString()
  routeType?: string;
}
