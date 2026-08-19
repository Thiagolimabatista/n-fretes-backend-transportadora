import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

function createHttpHost(url = '/test') {
  const response = {
    headersSent: false,
    setHeader: jest.fn(),
    status: jest.fn(),
    json: jest.fn(),
  };
  response.status.mockReturnValue(response);

  const request = {
    headers: { 'x-request-id': 'req-test-123' },
    method: 'POST',
    url,
    originalUrl: url,
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  return { host, response };
}

describe('HttpExceptionFilter', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('never exposes database details wrapped in an HttpException', () => {
    const { host, response } = createHttpHost('/auth/register');
    const filter = new HttpExceptionFilter();

    filter.catch(
      new HttpException(
        'relation "public.company" does not exist',
        HttpStatus.INTERNAL_SERVER_ERROR,
      ),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'INTERNAL_ERROR',
        error:
          'Não foi possível concluir a operação agora. Tente novamente em instantes.',
        requestId: 'req-test-123',
      }),
    );
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain(
      'public.company',
    );
  });

  it('maps PostgreSQL duplicate errors to a safe conflict', () => {
    const { host, response } = createHttpHost();
    const filter = new HttpExceptionFilter();

    filter.catch({ code: '23505', detail: 'private constraint details' }, host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'RESOURCE_ALREADY_EXISTS',
        message: 'Já existe um registro com estes dados.',
      }),
    );
  });

  it('maps known business conflicts without relying on database text', () => {
    const { host, response } = createHttpHost('/auth/register');
    const filter = new HttpExceptionFilter();

    filter.catch(new BadRequestException('CNPJ já cadastrado'), host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'COMPANY_ALREADY_EXISTS',
        message:
          'Este CNPJ já possui cadastro. Tente entrar ou recuperar sua senha.',
      }),
    );
  });

  it('keeps only safe, translated validation details', () => {
    const { host, response } = createHttpHost('/auth/register');
    const filter = new HttpExceptionFilter();

    filter.catch(
      new BadRequestException({
        message: ['email must be an email', 'name should not be empty'],
      }),
      host,
    );

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'VALIDATION_ERROR',
        details: ['email deve ser um e-mail válido', 'name é obrigatório'],
      }),
    );
  });

  it('normalizes every login failure to avoid account enumeration', () => {
    const { host, response } = createHttpHost('/auth/login');
    const filter = new HttpExceptionFilter();

    filter.catch(new BadRequestException('Usuário não encontrado'), host);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'INVALID_CREDENTIALS',
        message: 'CNPJ, e-mail ou senha inválidos.',
      }),
    );
  });
});
