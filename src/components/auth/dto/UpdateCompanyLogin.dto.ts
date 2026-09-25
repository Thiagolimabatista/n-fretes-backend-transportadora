import { IsNotEmpty, IsString, IsEmail, Length, IsUUID } from 'class-validator';

export class UpdateCompanyLoginDto {
  @IsNotEmpty({ message: 'CPF é obrigatório' })
  cpf: string;

  @IsNotEmpty({ message: 'Senha é obrigatória' })
  @IsString({ message: 'Senha deve ser uma string' })
  @Length(6, 50, { message: 'Senha deve ter entre 6 e 50 caracteres' })
  password: string;

  @IsNotEmpty({ message: 'CNPJ é obrigatório' })
  @IsString({ message: 'CNPJ deve ser uma string' })
  cnpj: string;

  @IsNotEmpty({ message: 'Email é obrigatório' })
  @IsEmail({}, { message: 'Email deve ter um formato válido' })
  email: string;

  @IsNotEmpty({ message: 'Contact ID é obrigatório' })
  @IsString({ message: 'Contact ID deve ser uma string' })
  contactId: string;
}
