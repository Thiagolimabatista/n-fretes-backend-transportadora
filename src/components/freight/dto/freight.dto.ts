import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  IsNumber,
  ArrayNotEmpty,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  PaymentMethod,
  SpecieOfLoad,
  Toll,
  TypeOfLoad,
  UnityMetric,
} from 'src/enum/freight';
import { BodyType, VehicleType } from 'src/enum/vehicle';

/** Placeholders de select ("" / "DEFAULT") significam "não informado". */
const emptySelectToUndefined = ({ value }: { value: unknown }) =>
  value === '' || value === 'DEFAULT' || value === null ? undefined : value;

/** Aceita a grafia com crase enviada por versões antigas do front. */
const normalizeToll = ({ value }: { value: unknown }) =>
  value === 'Pago à parte' ? Toll.PAYMENTPARTY : value;

export class CreateFreightDto {
  @IsString()
  @IsOptional()
  originCity?: string;

  @IsString()
  @IsOptional()
  originState?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (!value || value === '' || value === null || value === undefined) {
      return null;
    }
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  })
  dateOrigin?: Date;

  @IsString()
  @IsOptional()
  destinyCity?: string;

  @IsString()
  @IsOptional()
  destinyState?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (!value || value === '' || value === null || value === undefined) {
      return null;
    }
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  })
  dateReceiver?: Date;

  @IsEnum(TypeOfLoad)
  @IsNotEmpty()
  typeOfLoad?: TypeOfLoad;

  @IsBoolean()
  @IsNotEmpty()
  lona?: boolean;

  @IsBoolean()
  @IsNotEmpty()
  tracker?: boolean;

  @IsString()
  @IsNotEmpty()
  product?: string;

  @IsEnum(SpecieOfLoad)
  @IsNotEmpty()
  specieOfLoad?: SpecieOfLoad;

  @Transform(emptySelectToUndefined)
  @IsString()
  @IsOptional()
  anttLoadType?: string;

  @IsString()
  @IsOptional()
  weightOfLoad?: string;

  @IsString()
  @IsOptional()
  weightOfLoadLenght?: string;

  @IsString()
  @IsOptional()
  weightOfLoadWidth?: string;

  @IsString()
  @IsOptional()
  weightOfLoadHeight?: string;

  @Transform(emptySelectToUndefined)
  @IsEnum(UnityMetric)
  @IsOptional()
  unityMetric?: UnityMetric;

  @IsOptional()
  valueCall?: string;

  @IsString()
  @IsOptional()
  volume?: string;

  @IsString()
  @IsOptional()
  originLongitude?: string;

  @IsString()
  @IsOptional()
  originLatitude?: string;

  @IsString()
  @IsOptional()
  destinyLongitude?: string;

  @IsString()
  @IsOptional()
  destinyLatitude?: string;

  @IsString()
  @IsOptional()
  distance?: string;

  @IsBoolean()
  @IsOptional()
  security?: boolean;

  @IsArray()
  @ArrayNotEmpty({ message: 'Selecione pelo menos um tipo de veículo' })
  @IsEnum(VehicleType, { each: true })
  vehicleTypes?: VehicleType[];

  @IsArray()
  @ArrayNotEmpty({ message: 'Selecione pelo menos um tipo de carroceria' })
  @IsEnum(BodyType, { each: true })
  bodyTypes?: BodyType[];

  @IsNumber()
  @IsOptional()
  Valuefreight?: number;

  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  calValue?: PaymentMethod;

  @Transform(normalizeToll)
  @IsEnum(Toll)
  @IsNotEmpty()
  Toll?: Toll;

  @IsString()
  @IsOptional()
  methodPayment?: string;

  @IsNumber()
  @IsOptional()
  valueAdvance?: number;

  @IsNumber()
  @IsOptional()
  advance?: number;

  @IsString()
  @IsOptional()
  observation?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  openSolicitations?: boolean;

  @Transform(emptySelectToUndefined)
  @IsString()
  @IsOptional()
  contactCompanyId?: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  tags?: string[];

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  contactCompanyIds?: string[];

  @IsString()
  @IsOptional()
  routeCacheId?: string;
}

export class UpdateFreightDto extends PartialType(CreateFreightDto) {}
