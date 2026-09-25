import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

import { FreightRequestStatus } from '@entities/freight-requests.entity';

export class CreateFreightRequestDto {
  @IsString()
  freightId: string;

  /** Ignorado: a empresa é a do token (dona do frete). */
  @IsString()
  @IsOptional()
  companyId?: string;

  @IsString()
  userDriveId: string;

  /** Ignorado: toda solicitação nasce PENDING. */
  @IsEnum(FreightRequestStatus)
  @IsOptional()
  status?: FreightRequestStatus;
}
