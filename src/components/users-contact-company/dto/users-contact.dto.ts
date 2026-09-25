import { ArrayMaxSize, IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Adicionar motorista à rede da empresa. A empresa vem do token; status e
 * datas são do servidor.
 */
export class CompanyUsersContactsDto {
  /** Ignorado (clientes antigos ainda enviam): a empresa é a do token. */
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  /** Sem grupos, o motorista entra no grupo padrão "Todos os motoristas". */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  groupIds?: string[];
}
