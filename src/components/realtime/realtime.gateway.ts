import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import * as jwt from 'jsonwebtoken';
import type { Server, Socket } from 'socket.io';

/** Sala da empresa: todas as abas/usuários da transportadora recebem o evento. */
export const companyRoom = (companyId: string) => `company:${companyId}`;

function tokenFrom(client: Socket): string | null {
  const fromAuth = client.handshake.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth) return fromAuth.replace(/^Bearer\s+/i, '');
  const header = client.handshake.headers?.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/**
 * Tempo real do portal da transportadora (Socket.IO em /socket.io).
 * O cliente conecta com o mesmo token da API; sem token válido a conexão cai.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const token = tokenFrom(client);
    try {
      if (!token) throw new Error('sem token');
      const payload = jwt.verify(token, process.env.JWT_SECRET ?? '') as { sub?: string };
      if (!payload?.sub) throw new Error('token sem empresa');
      client.data.companyId = payload.sub;
      client.join(companyRoom(payload.sub));
    } catch {
      client.emit('auth:error', { message: 'Sessão expirada. Entre novamente.' });
      client.disconnect(true);
    }
  }

  emitToCompany(companyId: string, event: string, data: unknown) {
    if (!this.server || !companyId) return;
    this.server.to(companyRoom(companyId)).emit(event, data);
  }
}
