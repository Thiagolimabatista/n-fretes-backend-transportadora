import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
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
  @ApiProperty({ description: 'Nome do usuário', example: 'João da Silva' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ description: 'Nome fantasia da empresa' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nameFantasy?: string;

  @ApiProperty({ description: 'Email do usuário', example: 'email@gmail.com' })
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @ApiProperty({
    description: 'Cnpj da empresa',
    example: '45.896.154/0001-41',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/, {
    message: 'cnpj deve ser válido',
  })
  cnpj: string;

  @ApiPropertyOptional({
    description: 'CPF de contato',
    example: '130.422.146-64',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(?:\d{3}\.?\d{3}\.?\d{3}-?\d{2})?$/, {
    message: 'cpf deve ser válido',
  })
  cpf?: string;

  @ApiProperty({
    description: 'Número de telefone do usuário',
    example: '(00) 00000-0000',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\+?[\d\s().-]{10,20}$/, {
    message: 'phoneNumber deve ser um telefone válido',
  })
  phoneNumber: string;

  @ApiProperty({ description: 'Senha do usuário', example: 'senha123' })
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password: string;
}

export class UpdateUserDto extends PartialType(RegisterDto) {}
