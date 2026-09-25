import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as webpush from 'web-push';

export interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface CompanyPush {
  notificationId: string;
  companyId: string;
  title: string;
  body: string;
  /** Caminho do portal aberto ao tocar na notificação. */
  url: string | null;
}

/**
 * Notificação no celular/computador pelo PWA do portal (Web Push, VAPID).
 * Sem WEB_PUSH_PUBLIC_KEY/WEB_PUSH_PRIVATE_KEY o recurso fica desligado.
 */
@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  readonly publicKey = process.env.WEB_PUSH_PUBLIC_KEY ?? '';
  private readonly enabled: boolean;

  constructor(private readonly dataSource: DataSource) {
    const privateKey = process.env.WEB_PUSH_PRIVATE_KEY ?? '';
    this.enabled = !!(this.publicKey && privateKey);
    if (this.enabled) {
      webpush.setVapidDetails(process.env.WEB_PUSH_SUBJECT || 'https://nfretes.com.br', this.publicKey, privateKey);
    } else {
      this.logger.warn('Web Push desligado: faltam WEB_PUSH_PUBLIC_KEY/WEB_PUSH_PRIVATE_KEY');
    }
  }

  get isEnabled() {
    return this.enabled;
  }

  /** Guarda (ou atualiza) a inscrição do aparelho para a empresa/pessoa. */
  async subscribe(companyId: string, contactId: string | null, sub: BrowserSubscription, userAgent?: string) {
    await this.dataSource.query(
      `INSERT INTO "web_push_subscriptions" ("companyId", "contactId", "endpoint", "p256dh", "auth", "userAgent")
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ("endpoint") DO UPDATE
         SET "companyId" = EXCLUDED."companyId", "contactId" = EXCLUDED."contactId",
             "p256dh" = EXCLUDED."p256dh", "auth" = EXCLUDED."auth", "userAgent" = EXCLUDED."userAgent"`,
      [companyId, contactId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent?.slice(0, 250) ?? null],
    );
  }

  async unsubscribe(companyId: string, endpoint: string) {
    await this.dataSource.query(
      `DELETE FROM "web_push_subscriptions" WHERE "companyId" = $1 AND "endpoint" = $2`,
      [companyId, endpoint],
    );
  }

  async isSubscribed(companyId: string, endpoint: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM "web_push_subscriptions" WHERE "companyId" = $1 AND "endpoint" = $2`,
      [companyId, endpoint],
    );
    return rows.length > 0;
  }

  /**
   * Envia o push de uma notificação para os aparelhos da empresa. A tabela
   * web_push_deliveries garante um envio só, mesmo com várias instâncias.
   */
  async notifyCompany(push: CompanyPush): Promise<number> {
    if (!this.enabled || !push.companyId) return 0;
    const claimed = await this.dataSource.query(
      `INSERT INTO "web_push_deliveries" ("notificationId") VALUES ($1)
       ON CONFLICT DO NOTHING RETURNING "notificationId"`,
      [push.notificationId],
    );
    if (!claimed.length) return 0;

    const subs: Array<{ id: string; endpoint: string; p256dh: string; auth: string }> = await this.dataSource.query(
      `SELECT "id", "endpoint", "p256dh", "auth" FROM "web_push_subscriptions" WHERE "companyId" = $1`,
      [push.companyId],
    );
    if (!subs.length) return 0;

    const payload = JSON.stringify({
      title: push.title,
      body: push.body,
      url: push.url ?? '/notificacoes',
      tag: push.notificationId,
    });
    let sent = 0;
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: 60 * 60 * 24, urgency: 'high' },
          );
          sent++;
          await this.dataSource.query(`UPDATE "web_push_subscriptions" SET "lastUsedAt" = now() WHERE "id" = $1`, [sub.id]);
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          // Aparelho desinscrito ou inscrição vencida: remove.
          if (status === 404 || status === 410) {
            await this.dataSource.query(`DELETE FROM "web_push_subscriptions" WHERE "id" = $1`, [sub.id]);
          } else {
            this.logger.warn(`Web Push não enviado (${status ?? 'sem status'}): ${(error as Error).message}`);
          }
        }
      }),
    );
    return sent;
  }
}
