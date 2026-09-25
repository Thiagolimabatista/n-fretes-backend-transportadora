import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsNumber,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TollDataDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  concessionaria: string;

  @IsString()
  @IsNotEmpty()
  rodovia: string;

  @IsNumber()
  price: number;

  @IsString()
  km: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;
}

export class TollPointDto {
  @IsString()
  name: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsNumber()
  toll_price: number;
}

export class CoordinateDto {
  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;
}

export class RouteCoordinatesDto {
  @ValidateNested()
  @Type(() => CoordinateDto)
  origin: CoordinateDto;

  @ValidateNested()
  @Type(() => CoordinateDto)
  destination: CoordinateDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TollPointDto)
  tollPoints: TollPointDto[];
}

export class CreateUpdateRouteCacheDto {
  @IsString()
  @IsNotEmpty()
  originCity: string;

  @IsString()
  @IsNotEmpty()
  destinationCity: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TollDataDto)
  tolls: TollDataDto[];

  @IsNumber()
  totalToll: number;

  @IsNumber()
  distance: number;

  @IsString()
  distanceText: string;

  @IsString()
  duration: string;

  @IsNumber()
  fuelConsumption: number;

  @IsObject()
  @ValidateNested()
  @Type(() => RouteCoordinatesDto)
  coordinates: RouteCoordinatesDto;
}
