import { IsNotEmpty, IsString, IsArray, IsOptional } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateContactGroupDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @IsOptional()
  contactIds?: string[];
}

export class UpdateContactGroupDto extends PartialType(CreateContactGroupDto) {}

export class AddContactsToGroupDto {
  @IsArray()
  @IsNotEmpty()
  contactIds: string[];
}

export class RemoveContactsFromGroupDto {
  @IsArray()
  @IsNotEmpty()
  contactIds: string[];
}

export class MoveContactsToGroupDto {
  @IsArray()
  @IsNotEmpty()
  contactIds: string[];

  @IsString()
  @IsNotEmpty()
  targetGroupId: string;
}
