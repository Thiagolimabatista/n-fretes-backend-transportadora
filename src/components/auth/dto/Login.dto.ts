import { Transform } from 'class-transformer';
import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { CNPJ_INPUT_REGEX } from 'src/utils/cnpj.util';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(CNPJ_INPUT_REGEX, { message: 'Informe um CNPJ válido' })
  cnpj: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
