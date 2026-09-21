import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min, Max, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class SdrCompanyListQueryDto {
  @ApiProperty({
    description: 'Número da página para paginação',
    example: 1,
    default: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    description: 'Quantidade de registros por página (máximo 100)',
    example: 10,
    default: 10,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiProperty({
    description: 'Data inicial para filtrar empresas por data de cadastro (formato: YYYY-MM-DD)',
    example: '2025-01-01',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    description: 'Data final para filtrar empresas por data de cadastro (formato: YYYY-MM-DD)',
    example: '2025-12-31',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class SdrContactDto {
  @ApiProperty({
    description: 'Identificador único do contato',
    example: 'a1b2c3d4-e5f6-7890-1234-56789abcdef0',
  })
  id: string;

  @ApiProperty({
    description: 'Nome do contato',
    example: 'João Silva',
    nullable: true,
  })
  name: string;

  @ApiProperty({
    description: 'Número de telefone do contato',
    example: '+55 11 99999-9999',
    nullable: true,
  })
  phoneNumber: string;

  @ApiProperty({
    description: 'Indica se o contato está ativo',
    example: true,
  })
  isActive: boolean;
}

export class SdrCompanyDto {
  @ApiProperty({
    description: 'Identificador único da empresa',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Nome da empresa (razão social)',
    example: 'Transportadora ABC Ltda',
    nullable: true,
  })
  name: string;

  @ApiProperty({
    description: 'Nome fantasia da empresa',
    example: 'ABC Transportes',
    nullable: true,
  })
  nameFantasy: string;

  @ApiProperty({
    description: 'CNPJ da empresa',
    example: '12.345.678/0001-90',
    nullable: true,
  })
  cnpj: string;

  @ApiProperty({
    description: 'Telefone principal da empresa',
    example: '+55 11 3456-7890',
    nullable: true,
  })
  phoneNumber: string;

  @ApiProperty({
    description: 'Lista de contatos adicionais da empresa',
    type: [SdrContactDto],
  })
  contacts: SdrContactDto[];


  @ApiProperty({
    description: 'Data de cadastro da empresa',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Indica se a empresa está ativa no sistema',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Indica se a empresa completou o cadastro',
    example: true,
  })
  isCompleted: boolean;
}

export class SdrCompanyListResponseDto {
  @ApiProperty({
    description: 'Lista de empresas encontradas',
    type: [SdrCompanyDto],
  })
  data: SdrCompanyDto[];

  @ApiProperty({
    description: 'Total de empresas encontradas',
    example: 150,
  })
  total: number;

  @ApiProperty({
    description: 'Página atual',
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Quantidade de registros por página',
    example: 10,
  })
  limit: number;

  @ApiProperty({
    description: 'Total de páginas disponíveis',
    example: 15,
  })
  totalPages: number;
}
