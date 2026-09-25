import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  IsNotEmpty,
  IsOptional,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  nameFantasy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  responsibleName?: string;

  @IsNotEmpty()
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/, {
    message: 'cnpj deve ser válido',
  })
  cnpj: string;

  @IsOptional()
  @IsString()
  @Matches(/^(?:\d{3}\.?\d{3}\.?\d{3}-?\d{2})?$/, {
    message: 'cpf deve ser válido',
  })
  cpf?: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\+?[\d\s().-]{10,20}$/, {
    message: 'phoneNumber deve ser um telefone válido',
  })
  phoneNumber: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password: string;
}

export class UpdateUserDto extends PartialType(RegisterDto) {}
