import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import { RealtimeGateway } from './realtime.gateway';
import { WebPushService } from '@components/web-push/web-push.service';

/** Canal preenchido pelo gatilho da tabela notifications (migration FreightLifecycle). */
export const COMPANY_NOTIFICATION_CHANNEL = 'company_notification';
/** Mudanças de frete, solicitação, viagem e GPS (gatilhos da mesma migration). */
export const COMPANY_EVENT_CHANNEL = 'company_event';

export interface CompanyNotificationEvent {
  id: string;
  companyId: string;
  title: string;
  message: string;
  iconStyle: string | null;
  freightId: string | null;
  link: string | null;
  createdAt: string;
}

/**
 * Escuta o Postgres (LISTEN) e repassa ao portal cada notificação nova de
 * transportadora, venha ela deste backend ou do backend do motorista. Cada
 * instância tem a própria conexão, então funciona com várias tarefas no ECS.
 */
/** Caminho do portal aberto ao tocar no push (o link salvo pode ter outro domínio). */
function pushPath(event: CompanyNotificationEvent): string {
  if (event.link) {
    try {
      const url = new URL(event.link, 'https://nfretes.com.br');
      if (url.pathname && url.pathname !== '/') return `${url.pathname}${url.search}`;
    } catch {
      // link inválido: usa o frete
    }
  }
  return event.freightId ? `/fretes/${encodeURIComponent(event.freightId)}/solicitacoes` : '/notificacoes';
}

@Injectable()
export class RealtimeListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeListenerService.name);
  private client: Client | null = null;
  private stopped = false;
  private retryMs = 1000;

  constructor(
    private readonly config: ConfigService,
    private readonly gateway: RealtimeGateway,
    private readonly webPush: WebPushService,
  ) {}

  onModuleInit() {
    void this.connect();
  }

  async onModuleDestroy() {
    this.stopped = true;
    await this.client?.end().catch(() => undefined);
  }

  private async connect() {
    if (this.stopped) return;
    const db = this.config.get('typeorm');
    const client = new Client({
      host: db.host,
      port: db.port,
      user: db.username,
      password: db.password,
      database: db.database,
      ssl: db.ssl || undefined,
      options: db.extra?.options,
    });
    client.on('notification', (msg) => this.relay(msg.channel, msg.payload));
    client.on('error', (error) => {
      this.logger.warn(`Conexão de tempo real caiu: ${error.message}`);
      this.reconnect(client);
    });
    client.on('end', () => this.reconnect(client));

    try {
      await client.connect();
      await client.query(`LISTEN ${COMPANY_NOTIFICATION_CHANNEL}`);
      await client.query(`LISTEN ${COMPANY_EVENT_CHANNEL}`);
      this.client = client;
      this.retryMs = 1000;
      this.logger.log('Tempo real ligado (notificações e eventos de frete)');
    } catch (error) {
      this.logger.warn(`Não foi possível ligar o tempo real: ${(error as Error).message}`);
      this.reconnect(client);
    }
  }

  private reconnect(client: Client) {
    if (this.stopped || (this.client && this.client !== client)) return;
    this.client = null;
    client.removeAllListeners();
    client.end().catch(() => undefined);
    const wait = this.retryMs;
    this.retryMs = Math.min(this.retryMs * 2, 30000);
    setTimeout(() => void this.connect(), wait);
  }

  private relay(channel: string, payload?: string) {
    if (!payload) return;
    try {
      const event = JSON.parse(payload) as { companyId: string; entity?: string };
      if (channel === COMPANY_EVENT_CHANNEL) {
        // GPS muda só o mapa; o resto move cards do kanban e listas.
        const name = event.entity === 'freight_route_locations' ? 'route:location' : 'freight:changed';
        this.gateway.emitToCompany(event.companyId, name, event);
        return;
      }
      const notification = event as CompanyNotificationEvent;
      this.gateway.emitToCompany(notification.companyId, 'notification:new', notification);
      // Celular/computador com o PWA: mesmo aviso como notificação do sistema.
      void this.webPush
        .notifyCompany({
          notificationId: notification.id,
          companyId: notification.companyId,
          title: notification.title,
          body: notification.message,
          url: pushPath(notification),
        })
        .catch((error) => this.logger.warn(`Web Push falhou: ${(error as Error).message}`));
    } catch {
      this.logger.warn('Evento de tempo real inválido ignorado');
    }
  }
}
