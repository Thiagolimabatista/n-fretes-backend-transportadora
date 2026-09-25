import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateFormDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsNotEmpty({ message: 'nome é obrigatório' })
  @IsString()
  nome: string;

  @IsNotEmpty({ message: 'whatsapp é obrigatório' })
  @IsString()
  whatsapp: string;

  @IsNotEmpty({ message: 'cnpj é obrigatório' })
  @IsString()
  cnpj: string;
}
