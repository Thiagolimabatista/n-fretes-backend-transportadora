import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export const BRAZIL_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
] as const;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class companyUpdateDto {
  @ApiProperty({
    description: 'Nome fantasia (exibido para os motoristas no app)',
    example: 'Transportes Horizonte',
    required: false,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'O nome da empresa deve ter pelo menos 2 caracteres' })
  @MaxLength(150)
  nameFantasy?: string;

  @ApiProperty({
    description: 'Número de telefone da transportadora',
    example: '(00) 00000-0000',
    required: false,
  })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiProperty({
    description: 'UF da transportadora',
    example: 'MG',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(BRAZIL_UFS, { message: 'Selecione um estado válido' })
  state?: string;

  @ApiProperty({
    description: 'Cidade da transportadora',
    example: 'Uberlândia',
    required: false,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiProperty({
    description: 'Endereço da transportadora',
    example: 'Av. Cesário Alvim, 3813 - Centro',
    required: false,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  street?: string;

  @ApiProperty({
    description: 'CEP da transportadora',
    example: '38400-696',
    required: false,
  })
  @IsOptional()
  @Transform(trim)
  @Matches(/^\d{5}-?\d{3}$/, { message: 'Informe um CEP válido' })
  zipcode?: string;

  @ApiProperty({
    description: 'Logo da transportadora (base64)',
    example: 'data:image/jpeg;base64,...',
    required: false,
  })
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiProperty({
    description: 'Foto do usuário da transportadora (base64)',
    example: 'data:image/jpeg;base64,...',
    required: false,
  })
  @IsOptional()
  @IsString()
  userPhotoURL?: string;
}
