import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

import { FreightRequestStatus } from '@entities/freight-requests.entity';

export class CreateFreightRequestDto {
  @ApiProperty({
    description: 'ID do frete',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  freightId: string;

  /** Ignorado: a empresa é a do token (dona do frete). */
  @ApiProperty({
    description: 'Ignorado: a empresa é sempre a do token (dona do frete).',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsString()
  @IsOptional()
  companyId?: string;

  @ApiProperty({
    description: 'ID do motorista',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  userDriveId: string;

  /** Ignorado: toda solicitação nasce PENDING. */
  @ApiProperty({
    description: 'Ignorado: toda solicitação nasce PENDING.',
    required: false,
    enum: FreightRequestStatus,
    example: FreightRequestStatus.PENDING,
  })
  @IsEnum(FreightRequestStatus)
  @IsOptional()
  status?: FreightRequestStatus;
}
