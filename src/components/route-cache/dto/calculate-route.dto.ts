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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
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
