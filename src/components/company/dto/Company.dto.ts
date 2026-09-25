import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export const BRAZIL_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
] as const;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class companyUpdateDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'O nome da empresa deve ter pelo menos 2 caracteres' })
  @MaxLength(150)
  nameFantasy?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(BRAZIL_UFS, { message: 'Selecione um estado válido' })
  state?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  street?: string;

  @IsOptional()
  @Transform(trim)
  @Matches(/^\d{5}-?\d{3}$/, { message: 'Informe um CEP válido' })
  zipcode?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsString()
  userPhotoURL?: string;
}
