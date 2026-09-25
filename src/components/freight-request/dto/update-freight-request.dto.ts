import { PartialType } from '@nestjs/mapped-types';
import { CreateFreightRequestDto } from './create-freight-request.dto';

export class UpdateFreightRequestDto extends PartialType(
  CreateFreightRequestDto,
) {}
