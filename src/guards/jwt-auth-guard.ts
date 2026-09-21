import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';

interface JwtPayload {
  username: string;
  sub: string;
  role: string;
  /** Presente quando quem entrou foi um membro da equipe. */
  contactId?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const token = this.extractJwtFromHeaders(request.headers);

    if (!token) {
      throw new HttpException('Token não fornecido', HttpStatus.UNAUTHORIZED);
    }

    try {
      const secret = this.configService.get<string>('JWT_SECRET');
      const payload = jwt.verify(token, secret) as JwtPayload;
      request.user = payload;
      const requiredRole = this.reflector.get<string>(
        'role',
        context.getHandler(),
      );

      if (requiredRole && requiredRole !== payload.role) {
        throw new UnauthorizedException(
          'Acesso negado, você não tem permissão para esta rota',
        );
      }
      return true;
    } catch (e) {
      throw new HttpException(
        'Token inválido ou expirado',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  private extractJwtFromHeaders(headers: any): string | null {
    const authorization = headers['authorization'];

    if (!authorization) {
      return null;
    }

    const parts = authorization.split(' ');

    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      return null;
    }

    return parts[1];
  }
}
