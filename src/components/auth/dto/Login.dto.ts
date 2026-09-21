import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { CNPJ_INPUT_REGEX } from 'src/utils/cnpj.util';

export class LoginDto {
  @ApiProperty({
    description: 'CNPJ da empresa, com ou sem máscara',
    example: '45.896.154/0001-41',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(CNPJ_INPUT_REGEX, { message: 'Informe um CNPJ válido' })
  cnpj: string;

  @ApiProperty({ description: 'Senha do usuário', example: 'senha123' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
