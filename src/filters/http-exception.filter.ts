import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

type ErrorResponseBody = {
  code?: unknown;
  errorCode?: unknown;
  error?: unknown;
  message?: unknown;
};

type ErrorMapping = {
  errorCode: string;
  message: string;
  status?: number;
};

const DEFAULT_ERRORS: Record<number, ErrorMapping> = {
  [HttpStatus.BAD_REQUEST]: {
    errorCode: 'VALIDATION_ERROR',
    message: 'Revise os dados informados e tente novamente.',
  },
  [HttpStatus.UNAUTHORIZED]: {
    errorCode: 'AUTHENTICATION_REQUIRED',
    message: 'Sua sessão expirou. Entre novamente para continuar.',
  },
  [HttpStatus.FORBIDDEN]: {
    errorCode: 'ACCESS_DENIED',
    message: 'Você não tem permissão para realizar esta ação.',
  },
  [HttpStatus.NOT_FOUND]: {
    errorCode: 'RESOURCE_NOT_FOUND',
    message: 'Não encontramos o registro solicitado.',
  },
  [HttpStatus.CONFLICT]: {
    errorCode: 'RESOURCE_CONFLICT',
    message: 'Este registro já existe ou está sendo utilizado.',
  },
  [HttpStatus.PAYLOAD_TOO_LARGE]: {
    errorCode: 'PAYLOAD_TOO_LARGE',
    message: 'O arquivo ou conteúdo enviado excede o tamanho permitido.',
  },
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: {
    errorCode: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'Este tipo de arquivo ou conteúdo não é permitido.',
  },
  [HttpStatus.UNPROCESSABLE_ENTITY]: {
    errorCode: 'VALIDATION_ERROR',
    message: 'Alguns dados informados são inválidos.',
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    errorCode: 'RATE_LIMITED',
    message:
      'Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.',
  },
  [HttpStatus.BAD_GATEWAY]: {
    errorCode: 'EXTERNAL_SERVICE_ERROR',
    message:
      'Um serviço parceiro está indisponível no momento. Tente novamente em instantes.',
  },
  [HttpStatus.SERVICE_UNAVAILABLE]: {
    errorCode: 'SERVICE_UNAVAILABLE',
    message:
      'O serviço está temporariamente indisponível. Tente novamente em instantes.',
  },
  [HttpStatus.GATEWAY_TIMEOUT]: {
    errorCode: 'EXTERNAL_SERVICE_TIMEOUT',
    message:
      'Um serviço parceiro demorou para responder. Tente novamente em instantes.',
  },
  [HttpStatus.INTERNAL_SERVER_ERROR]: {
    errorCode: 'INTERNAL_ERROR',
    message:
      'Não foi possível concluir a operação agora. Tente novamente em instantes.',
  },
};

const TECHNICAL_ERROR_PATTERNS = [
  /queryfailederror/i,
  /duplicate key value violates/i,
  /violates .* constraint/i,
  /constraint ["'`]/i,
  /relation ["'`].+["'`] does not exist/i,
  /column ["'`].+["'`] (?:does not exist|of relation)/i,
  /syntax error at or near/i,
  /sqlstate/i,
  /\b(?:select|insert into|update|delete from|alter table|create table)\b[\s\S]+\b(?:from|values|set|where|table)\b/i,
  /\b(?:econnrefused|econnreset|enotfound|etimedout)\b/i,
  /axioserror|typeorm|postgres(?:ql)?|node_modules/i,
  /\bat .+\(.+\.ts:\d+:\d+\)/i,
  /\b(?:password|authorization|bearer|secret|api[_-]?key)\b\s*[:=]/i,
];

const BUSINESS_ERROR_MAPPINGS: Array<{
  pattern: RegExp;
  mapping: ErrorMapping;
}> = [
  {
    pattern: /cnpj j[aá] cadastrado/i,
    mapping: {
      errorCode: 'COMPANY_ALREADY_EXISTS',
      message:
        'Este CNPJ já possui cadastro. Tente entrar ou recuperar sua senha.',
      status: HttpStatus.CONFLICT,
    },
  },
  {
    pattern: /e-?mail j[aá] cadastrado/i,
    mapping: {
      errorCode: 'EMAIL_ALREADY_EXISTS',
      message:
        'Este e-mail já está cadastrado. Use outro e-mail ou recupere sua senha.',
      status: HttpStatus.CONFLICT,
    },
  },
  {
    pattern: /contato j[aá] cadastrado/i,
    mapping: {
      errorCode: 'CONTACT_ALREADY_EXISTS',
      message: 'Este contato já está cadastrado para a empresa.',
      status: HttpStatus.CONFLICT,
    },
  },
  {
    pattern:
      /c[oó]digo (?:expirado ou inv[aá]lido|inv[aá]lido|n[aã]o corresponde)/i,
    mapping: {
      errorCode: 'RECOVERY_CODE_INVALID',
      message:
        'O código informado é inválido ou expirou. Solicite um novo código.',
      status: HttpStatus.BAD_REQUEST,
    },
  },
  {
    pattern: /cnpj inv[aá]lido ou n[aã]o encontrado/i,
    mapping: {
      errorCode: 'CNPJ_INVALID',
      message: 'Não encontramos este CNPJ. Confira os números informados.',
      status: HttpStatus.BAD_REQUEST,
    },
  },
  {
    pattern: /cnpj n[aã]o est[aá] ativo/i,
    mapping: {
      errorCode: 'CNPJ_INACTIVE',
      message: 'Este CNPJ não está ativo na Receita Federal.',
      status: HttpStatus.BAD_REQUEST,
    },
  },
  {
    pattern: /nenhum plano padr[aã]o ativo foi configurado/i,
    mapping: {
      errorCode: 'DEFAULT_PLAN_NOT_CONFIGURED',
      message:
        'Não foi possível concluir o cadastro agora. Tente novamente em instantes.',
      status: HttpStatus.SERVICE_UNAVAILABLE,
    },
  },
  {
    pattern: /credenciais inv[aá]lidas|dados inv[aá]lidos/i,
    mapping: {
      errorCode: 'INVALID_CREDENTIALS',
      message: 'CNPJ, e-mail ou senha inválidos.',
      status: HttpStatus.UNAUTHORIZED,
    },
  },
];

function asRecord(value: unknown): ErrorResponseBody | undefined {
  return value !== null && typeof value === 'object'
    ? (value as ErrorResponseBody)
    : undefined;
}

function extractMessages(
  response: unknown,
  exception: HttpException,
): string[] {
  if (typeof response === 'string') return [response];

  const body = asRecord(response);
  const message = body?.message ?? body?.error;

  if (Array.isArray(message)) {
    return message.filter((item): item is string => typeof item === 'string');
  }

  if (typeof message === 'string') return [message];
  return typeof exception.message === 'string' ? [exception.message] : [];
}

function isTechnicalMessage(message: string): boolean {
  return (
    message.length > 300 ||
    message.includes('\n') ||
    TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(message))
  );
}

function translateValidationMessage(message: string): string {
  return message
    .replace(/ must be an email$/i, ' deve ser um e-mail válido')
    .replace(/ should not be empty$/i, ' é obrigatório')
    .replace(/ must be a string$/i, ' deve ser um texto válido')
    .replace(
      / must be a number conforming to the specified constraints$/i,
      ' deve ser um número válido',
    )
    .replace(
      / must be longer than or equal to (\d+) characters$/i,
      ' deve ter pelo menos $1 caracteres',
    )
    .replace(
      / must be shorter than or equal to (\d+) characters$/i,
      ' deve ter no máximo $1 caracteres',
    );
}

function safeRequestId(value: unknown): string {
  if (
    typeof value === 'string' &&
    value.length <= 100 &&
    /^[a-zA-Z0-9._:-]+$/.test(value)
  ) {
    return value;
  }

  return randomUUID();
}

function databaseErrorCode(exception: unknown): string | undefined {
  const error = asRecord(exception) as
    | (ErrorResponseBody & { driverError?: unknown })
    | undefined;
  const driverError = asRecord(error?.driverError);
  const code = error?.code ?? driverError?.code;
  return typeof code === 'string' ? code : undefined;
}

function redactLogDetails(value: string): string {
  return value
    .replace(
      /(authorization|bearer|password|secret|api[_-]?key)(\s*[:=]\s*)[^\s,;]+/gi,
      '$1$2[REDACTED]',
    )
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[REDACTED_EMAIL]')
    .slice(0, 4000);
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const requestId = safeRequestId(request.headers['x-request-id']);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let mapping = DEFAULT_ERRORS[status];
    let details: string[] | undefined;
    let technicalIncident = !(exception instanceof HttpException);

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      mapping =
        DEFAULT_ERRORS[status] ??
        DEFAULT_ERRORS[HttpStatus.INTERNAL_SERVER_ERROR];

      const exceptionResponse = exception.getResponse();
      const responseBody = asRecord(exceptionResponse);
      const suppliedErrorCode =
        typeof responseBody?.errorCode === 'string' &&
        /^[A-Z][A-Z0-9_]{2,63}$/.test(responseBody.errorCode)
          ? responseBody.errorCode
          : undefined;
      const messages = extractMessages(exceptionResponse, exception);
      const firstMessage = messages[0];
      technicalIncident = Boolean(
        firstMessage && isTechnicalMessage(firstMessage),
      );
      const businessMapping = firstMessage
        ? BUSINESS_ERROR_MAPPINGS.find(({ pattern }) =>
            pattern.test(firstMessage),
          )?.mapping
        : undefined;

      if (businessMapping) {
        mapping = businessMapping;
        status = businessMapping.status ?? status;
      } else if (suppliedErrorCode) {
        mapping = {
          ...mapping,
          errorCode: suppliedErrorCode,
          ...(firstMessage && !isTechnicalMessage(firstMessage)
            ? { message: firstMessage }
            : {}),
        };
      } else if (
        firstMessage &&
        messages.length === 1 &&
        status < HttpStatus.INTERNAL_SERVER_ERROR &&
        !isTechnicalMessage(firstMessage)
      ) {
        mapping = { ...mapping, message: firstMessage };
      }

      if (
        messages.length > 1 &&
        (status === HttpStatus.BAD_REQUEST ||
          status === HttpStatus.UNPROCESSABLE_ENTITY)
      ) {
        const safeDetails = messages
          .filter((message) => !isTechnicalMessage(message))
          .map(translateValidationMessage)
          .slice(0, 20);
        details = safeDetails.length ? safeDetails : undefined;
      }
    } else {
      const postgresCode = databaseErrorCode(exception);
      if (postgresCode === '23505') {
        status = HttpStatus.CONFLICT;
        mapping = {
          errorCode: 'RESOURCE_ALREADY_EXISTS',
          message: 'Já existe um registro com estes dados.',
        };
      } else if (postgresCode === '23503') {
        status = HttpStatus.CONFLICT;
        mapping = {
          errorCode: 'RESOURCE_IN_USE',
          message:
            'Este registro está relacionado a outros dados e não pode ser alterado agora.',
        };
      } else if (postgresCode === '23502' || postgresCode === '22P02') {
        status = HttpStatus.BAD_REQUEST;
        mapping = DEFAULT_ERRORS[HttpStatus.BAD_REQUEST];
      } else if (postgresCode === '42P01' || postgresCode === '42703') {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        mapping = {
          errorCode: 'SERVICE_NOT_READY',
          message:
            'O serviço está sendo preparado. Tente novamente em instantes.',
        };
      } else if (postgresCode?.startsWith('08') || postgresCode === '57P01') {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        mapping = {
          errorCode: 'DATABASE_UNAVAILABLE',
          message:
            'O serviço está temporariamente indisponível. Tente novamente em instantes.',
        };
      } else if (postgresCode === '40P01' || postgresCode === '40001') {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        mapping = {
          errorCode: 'TEMPORARY_CONFLICT',
          message:
            'A operação encontrou um conflito temporário. Tente novamente.',
        };
      }
    }

    if (
      request.url === '/auth/login' &&
      status < HttpStatus.INTERNAL_SERVER_ERROR
    ) {
      status = HttpStatus.UNAUTHORIZED;
      mapping = {
        errorCode: 'INVALID_CREDENTIALS',
        message: 'CNPJ, e-mail ou senha inválidos.',
      };
    }

    const diagnostic =
      exception instanceof Error
        ? exception.stack || `${exception.name}: ${exception.message}`
        : String(exception);
    const logMessage = `[${requestId}] ${request.method} ${request.originalUrl || request.url} -> ${status}`;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(logMessage, redactLogDetails(diagnostic));
    } else if (technicalIncident) {
      this.logger.warn(
        `${logMessage} (detalhes técnicos omitidos da resposta)`,
      );
    }

    if (response.headersSent) return;

    response.setHeader('X-Request-Id', requestId);
    response.status(status).json({
      code: status,
      statusCode: status,
      errorCode: mapping.errorCode,
      error: mapping.message,
      message: mapping.message,
      ...(details ? { details } : {}),
      requestId,
      timestamp: new Date().toISOString(),
      path: request.originalUrl || request.url,
    });
  }
}
