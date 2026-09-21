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
import { ApiProperty, PartialType } from '@nestjs/swagger';
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
  @ApiProperty({ description: 'Cidade de origem', required: false })
  @IsString()
  @IsOptional()
  originCity?: string;

  @ApiProperty({ description: 'Estado de origem', required: false })
  @IsString()
  @IsOptional()
  originState?: string;

  @ApiProperty({
    description: 'Data de origem',
    required: false,
    format: 'date-time',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (!value || value === '' || value === null || value === undefined) {
      return null;
    }
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  })
  dateOrigin?: Date;

  @ApiProperty({ description: 'Cidade de destino', required: false })
  @IsString()
  @IsOptional()
  destinyCity?: string;

  @ApiProperty({ description: 'Estado de destino', required: false })
  @IsString()
  @IsOptional()
  destinyState?: string;

  @ApiProperty({
    description: 'Data de recebimento',
    required: false,
    format: 'date-time',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (!value || value === '' || value === null || value === undefined) {
      return null;
    }
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  })
  dateReceiver?: Date;

  @ApiProperty({
    description: 'Tipo de carga',
    enum: TypeOfLoad,
    default: TypeOfLoad.COMPLETE,
  })
  @IsEnum(TypeOfLoad)
  @IsNotEmpty()
  typeOfLoad?: TypeOfLoad;

  @ApiProperty({ description: 'Possui lona', required: false, default: false })
  @IsBoolean()
  @IsNotEmpty()
  lona?: boolean;

  @ApiProperty({
    description: 'Possui rastreador',
    required: false,
    default: false,
  })
  @IsBoolean()
  @IsNotEmpty()
  tracker?: boolean;

  @ApiProperty({ description: 'Produto transportado', required: false })
  @IsString()
  @IsNotEmpty()
  product?: string;

  @ApiProperty({
    description: 'Espécie de carga',
    enum: SpecieOfLoad,
    required: false,
  })
  @IsEnum(SpecieOfLoad)
  @IsNotEmpty()
  specieOfLoad?: SpecieOfLoad;

  @ApiProperty({
    description: 'Tipo de carga ANTT (ex: Carga Geral, Granel sólido, Frigorificada ou Aquecida...)',
    required: false,
  })
  @Transform(emptySelectToUndefined)
  @IsString()
  @IsOptional()
  anttLoadType?: string;

  @ApiProperty({ description: 'Peso da carga', required: false })
  @IsString()
  @IsOptional()
  weightOfLoad?: string;

  @ApiProperty({ description: 'Comprimento da carga (m)', required: false })
  @IsString()
  @IsOptional()
  weightOfLoadLenght?: string;

  @ApiProperty({ description: 'Largura da carga (m)', required: false })
  @IsString()
  @IsOptional()
  weightOfLoadWidth?: string;

  @ApiProperty({ description: 'Altura da carga (m)', required: false })
  @IsString()
  @IsOptional()
  weightOfLoadHeight?: string;

  @ApiProperty({
    description: 'Unidade métrica',
    enum: UnityMetric,
    required: false,
  })
  @Transform(emptySelectToUndefined)
  @IsEnum(UnityMetric)
  @IsOptional()
  unityMetric?: UnityMetric;

  @ApiProperty({
    description: 'Unidade de medida',
    required: true,
  })
  @IsOptional()
  valueCall?: string;

  @ApiProperty({ description: 'Volume da carga', required: false })
  @IsString()
  @IsOptional()
  volume?: string;

  @ApiProperty({
    description: 'Longitude e Latitude da origem',
    required: false,
  })
  @IsString()
  @IsOptional()
  originLongitude?: string;

  @ApiProperty({
    description: 'Longitude e Latitude da origem',
    required: false,
  })
  @IsString()
  @IsOptional()
  originLatitude?: string;

  @ApiProperty({
    description: 'Longitude e Latitude do destino',
    required: false,
  })
  @IsString()
  @IsOptional()
  destinyLongitude?: string;

  @ApiProperty({
    description: 'Longitude e Latitude do destino',
    required: false,
  })
  @IsString()
  @IsOptional()
  destinyLatitude?: string;

  @ApiProperty({ description: 'Distancia total do percurso', required: false })
  @IsString()
  @IsOptional()
  distance?: string;

  @ApiProperty({ description: 'Possui seguro', required: false, default: true })
  @IsBoolean()
  @IsOptional()
  security?: boolean;

  @ApiProperty({
    description: 'Tipos de veículos permitidos',
    isArray: true,
    enum: VehicleType,
    required: false,
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'Selecione pelo menos um tipo de veículo' })
  @IsEnum(VehicleType, { each: true })
  vehicleTypes?: VehicleType[];

  @ApiProperty({
    description: 'Tipos de carroceria permitidos',
    isArray: true,
    enum: BodyType,
    required: false,
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'Selecione pelo menos um tipo de carroceria' })
  @IsEnum(BodyType, { each: true })
  bodyTypes?: BodyType[];

  @ApiProperty({
    description: 'Valor do frete',
    required: false,
    type: 'number',
    default: 0,
  })
  @IsNumber()
  @IsOptional()
  Valuefreight?: number;

  @ApiProperty({
    description: 'Método de cálculo do valor',
    enum: PaymentMethod,
    required: false,
  })
  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  calValue?: PaymentMethod;

  @ApiProperty({
    description: 'Cobrança de pedágio',
    enum: Toll,
    required: false,
  })
  @Transform(normalizeToll)
  @IsEnum(Toll)
  @IsNotEmpty()
  Toll?: Toll;

  @ApiProperty({ description: 'Método de pagamento', required: false })
  @IsString()
  @IsOptional()
  methodPayment?: string;

  @ApiProperty({
    description: 'Valor do adiantamento',
    required: false,
    type: 'number',
    default: 0,
  })
  @IsNumber()
  @IsOptional()
  valueAdvance?: number;

  @ApiProperty({
    description: 'Alias legado de valueAdvance',
    required: false,
    type: 'number',
    deprecated: true,
  })
  @IsNumber()
  @IsOptional()
  advance?: number;

  @ApiProperty({ description: 'Observações', required: false })
  @IsString()
  @IsOptional()
  observation?: string;

  @ApiProperty({ description: 'Está ativo?', required: false, default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({
    description: 'Solicitações abertas',
    required: false,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  openSolicitations?: boolean;

  @ApiProperty({
    description:
      'ID do responsável (contato da empresa). Opcional: empresas recém-criadas ainda não têm contatos.',
    required: false,
  })
  @Transform(emptySelectToUndefined)
  @IsString()
  @IsOptional()
  contactCompanyId?: string;

  @ApiProperty({
    description: 'Tags do frete',
    required: false,
    isArray: true,
    type: 'string',
    example: ['urgente', 'refrigerado'],
  })
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({
    description: 'IDs dos contatos da empresa',
    required: false,
    isArray: true,
    type: 'string',
  })
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  contactCompanyIds?: string[];

  @ApiProperty({ description: 'Rota de destino', required: false })
  @IsString()
  @IsOptional()
  routeCacheId?: string;
}

export class UpdateFreightDto extends PartialType(CreateFreightDto) {}
