
export class AuthResponseDto {
  access_token: string;
}

export class CheckCnpjResponseDto {
  exists: boolean;

  status:
    | 'available'
    | 'registered'
    | 'invalid'
    | 'not_found'
    | 'inactive'
    | 'too_new'
    | 'unavailable';

  message?: string;

  razaoSocial?: string;

  nomeFantasia?: string;
}

export class AuthResponseRegisterDto {
  message: string;

  access_token?: string;
}
