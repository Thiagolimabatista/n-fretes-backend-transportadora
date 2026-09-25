import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateExcludeDto {
  @IsOptional()
  @IsString()
  cpf?: string;

  @IsOptional()
  @IsString()
  cnpj?: string;

  @IsNotEmpty({ message: 'motivo é obrigatório' })
  @IsString()
  reason: string;
}
