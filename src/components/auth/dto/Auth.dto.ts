import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty({
    description: 'Token de acesso',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  })
  access_token: string;
}

export class CheckCnpjResponseDto {
  @ApiProperty({ description: 'Já existe cadastro com este CNPJ' })
  exists: boolean;

  @ApiProperty({
    description: 'Resultado da validação para cadastro',
    enum: [
      'available',
      'registered',
      'invalid',
      'not_found',
      'inactive',
      'too_new',
      'unavailable',
    ],
  })
  status:
    | 'available'
    | 'registered'
    | 'invalid'
    | 'not_found'
    | 'inactive'
    | 'too_new'
    | 'unavailable';

  @ApiPropertyOptional({ description: 'Motivo, quando o CNPJ não pode ser usado' })
  message?: string;

  @ApiPropertyOptional({ description: 'Razão social na Receita Federal' })
  razaoSocial?: string;

  @ApiPropertyOptional({ description: 'Nome fantasia na Receita Federal' })
  nomeFantasia?: string;
}

export class AuthResponseRegisterDto {
  @ApiProperty({
    description: 'Resposta',
    example: 'Conta criada com sucesso',
  })
  message: string;

  @ApiPropertyOptional({
    description: 'Token de acesso — a conta já sai criada e autenticada',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  })
  access_token?: string;
}
