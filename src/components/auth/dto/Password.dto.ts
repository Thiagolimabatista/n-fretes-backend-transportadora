import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ChangePasswordDto {
  @IsNotEmpty()
  @IsString()
  oldPassword: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  newPassword: string;
}

export class ResetPasswordDto {
  @IsNotEmpty()
  @IsString()
  email: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  newPassword: string;
}

export class PhoneNumberDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^\+?[\d\s().-]{10,20}$/, {
    message: 'phoneNumber deve ser um telefone válido',
  })
  phoneNumber: string;
}

export class RecoveryCodeDto extends PhoneNumberDto {
  @Type(() => Number)
  @IsInt()
  @Min(100000)
  @Max(999999)
  code: number;
}

export class ResetPasswordByRecoveryCodeDto extends RecoveryCodeDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  newPassword: string;
}
