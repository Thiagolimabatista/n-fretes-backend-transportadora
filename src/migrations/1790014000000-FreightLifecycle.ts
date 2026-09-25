import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ciclo do frete entre transportadora e motorista:
 *
 * - Tempo real: gatilho em `notifications` que publica (pg_notify
 *   'company_notification') cada notificação nova de transportadora. O backend
 *   da transportadora escuta o canal e repassa ao portal por Socket.IO. Vale
 *   para notificações gravadas por qualquer serviço (inclusive o do motorista).
 * - Solicitações: `respondedAt` (aceite/recusa/expiração pela transportadora) e
 *   `deliveryInformedAt` (motorista informou a entrega), para a linha do tempo
 *   e o tempo de resposta. Antes só havia `updatedAt`, que muda a cada ajuste.
 * - Garantias no banco: um frete só tem uma viagem em andamento, e o motorista
 *   só tem uma solicitação aberta por frete (o código já trava; isto impede
 *   corrida entre serviços diferentes).
 * - Índices das rotinas de expiração (solicitações pendentes e fretes vencidos).
 * - Pedágio: o cache passa a ser por origem + destino + eixos (o valor muda
 *   com o número de eixos) e o frete deixa de travar a limpeza do cache.
 *
 * Tudo idempotente: o mesmo banco é usado por mais de uma frente.
 */
export class FreightLifecycle1790014000000 implements MigrationInterface {
  name = 'FreightLifecycle1790014000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------- tempo real ----------
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION notify_company_notification() RETURNS trigger AS $$
      DECLARE
        link text := NEW.payload ->> 'actions';
      BEGIN
        PERFORM pg_notify('company_notification', json_build_object(
          'id', NEW.id,
          'companyId', NEW."recipientId",
          'title', NEW.title,
          'message', left(btrim(NEW.message), 400),
          'iconStyle', NEW."iconStyle",
          'freightId', COALESCE(
            CASE WHEN NEW.related_entity_type = 'freight' THEN NEW.related_entity_id END,
            NEW.payload ->> 'freightId',
            NEW.payload -> 'metadata' ->> 'freightCode',
            substring(link from '/fretes/([^/?#]+)')
          ),
          'photoUrl', NEW.payload -> 'metadata' ->> 'driverPhotoUrl',
          'link', link,
          'createdAt', NEW.created_at
        )::text);
        RETURN NEW;
      END
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_notifications_company_realtime" ON "notifications"`);
    await queryRunner.query(`
      CREATE TRIGGER "trg_notifications_company_realtime"
      AFTER INSERT ON "notifications"
      FOR EACH ROW WHEN (NEW."recipientType" = 'company')
      EXECUTE FUNCTION notify_company_notification()
    `);

    // Eventos do kanban/monitoramento: frete, solicitação e viagem que mudam
    // (por qualquer serviço ou pessoa da equipe) avisam o portal da empresa.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION notify_company_freight_event() RETURNS trigger AS $$
      DECLARE
        rec record;
        payload json;
      BEGIN
        IF TG_OP = 'DELETE' THEN rec := OLD; ELSE rec := NEW; END IF;
        IF rec."companyId" IS NULL THEN
          RETURN NULL;
        END IF;
        IF TG_TABLE_NAME = 'freight' THEN
          payload := json_build_object(
            'companyId', rec."companyId", 'entity', 'freight', 'op', TG_OP,
            'id', rec."id", 'freightId', rec."id");
        ELSE
          payload := json_build_object(
            'companyId', rec."companyId", 'entity', TG_TABLE_NAME, 'op', TG_OP,
            'id', rec."id", 'freightId', rec."freightId", 'status', rec."status"::text);
        END IF;
        PERFORM pg_notify('company_event', payload::text);
        RETURN NULL;
      END
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_freight_company_event" ON "freight"`);
    await queryRunner.query(`
      CREATE TRIGGER "trg_freight_company_event"
      AFTER INSERT OR DELETE OR UPDATE OF "isActive", "openSolicitations", "isExclude", "tags", "dateOrigin", "dateReceiver", "observation"
      ON "freight" FOR EACH ROW EXECUTE FUNCTION notify_company_freight_event()
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_freight_requests_company_event" ON "freight_requests"`);
    await queryRunner.query(`
      CREATE TRIGGER "trg_freight_requests_company_event"
      AFTER INSERT OR UPDATE OF "status" ON "freight_requests"
      FOR EACH ROW EXECUTE FUNCTION notify_company_freight_event()
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_freight_routes_company_event" ON "freight_routes"`);
    await queryRunner.query(`
      CREATE TRIGGER "trg_freight_routes_company_event"
      AFTER INSERT OR UPDATE OF "status", "isActive" ON "freight_routes"
      FOR EACH ROW EXECUTE FUNCTION notify_company_freight_event()
    `);
    // Posições de GPS: um aviso por lote gravado (não por ponto), por empresa.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION notify_company_route_locations() RETURNS trigger AS $$
      DECLARE
        item record;
      BEGIN
        FOR item IN
          SELECT r."companyId", array_agg(DISTINCT r."id") AS routes
            FROM new_points p
            JOIN "freight_routes" r ON r."id" = p."routeId"
           WHERE r."companyId" IS NOT NULL
           GROUP BY r."companyId"
        LOOP
          PERFORM pg_notify('company_event', json_build_object(
            'companyId', item."companyId",
            'entity', 'freight_route_locations',
            'op', 'INSERT',
            'routeIds', item.routes
          )::text);
        END LOOP;
        RETURN NULL;
      END
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_route_locations_company_event" ON "freight_route_locations"`);
    await queryRunner.query(`
      CREATE TRIGGER "trg_route_locations_company_event"
      AFTER INSERT ON "freight_route_locations"
      REFERENCING NEW TABLE AS new_points
      FOR EACH STATEMENT EXECUTE FUNCTION notify_company_route_locations()
    `);

    // ---------- notificação no celular (Web Push do portal/PWA) ----------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "web_push_subscriptions" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "companyId" varchar NOT NULL,
        "contactId" varchar,
        "endpoint" text NOT NULL,
        "p256dh" text NOT NULL,
        "auth" text NOT NULL,
        "userAgent" varchar,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "lastUsedAt" TIMESTAMP
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_web_push_subscriptions_endpoint" ON "web_push_subscriptions" ("endpoint")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_web_push_subscriptions_company" ON "web_push_subscriptions" ("companyId")`,
    );
    // Cada notificação vira no máximo um push, mesmo com várias instâncias ouvindo.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "web_push_deliveries" (
        "notificationId" varchar PRIMARY KEY,
        "sentAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    // ---------- solicitações ----------
    await queryRunner.query(`ALTER TABLE "freight_requests" ADD COLUMN IF NOT EXISTS "respondedAt" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "freight_requests" ADD COLUMN IF NOT EXISTS "deliveryInformedAt" TIMESTAMP`);
    // Histórico: aceite = início da viagem; recusa = última alteração.
    await queryRunner.query(`
      UPDATE "freight_requests" req
         SET "respondedAt" = COALESCE(
               (SELECT min(r."startedAt") FROM "freight_routes" r
                 WHERE r."freightId" = req."freightId" AND r."userDriveId" = req."userDriveId"),
               req."updatedAt")
       WHERE req."respondedAt" IS NULL
         AND req.status IN ('ACCEPTED', 'REJECTED', 'DRIVER_CONFIRMED_DELIVERY', 'DELIVERY_COMPLETED', 'NOT_CONFIRMED_DELIVERY')
    `);
    await queryRunner.query(`
      UPDATE "freight_requests"
         SET "deliveryInformedAt" = "updatedAt"
       WHERE "deliveryInformedAt" IS NULL
         AND status IN ('DRIVER_CONFIRMED_DELIVERY', 'DELIVERY_COMPLETED')
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_freight_requests_open_per_driver"
          ON "freight_requests" ("freightId", "userDriveId")
       WHERE status IN ('PENDING', 'AWAITING_USER_DRIVE_RESPONSE', 'ACCEPTED', 'DRIVER_CONFIRMED_DELIVERY')
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_freight_requests_open_created"
          ON "freight_requests" ("createdAt")
       WHERE status IN ('PENDING', 'AWAITING_USER_DRIVE_RESPONSE')
    `);

    // ---------- quem fez (histórico do card) ----------
    // Nome gravado no momento da ação: o histórico continua certo mesmo se a
    // pessoa sair da equipe ou mudar de nome.
    await queryRunner.query(`ALTER TABLE "freight" ADD COLUMN IF NOT EXISTS "createdByContactId" VARCHAR`);
    await queryRunner.query(`ALTER TABLE "freight" ADD COLUMN IF NOT EXISTS "createdByName" VARCHAR`);
    await queryRunner.query(`ALTER TABLE "freight_requests" ADD COLUMN IF NOT EXISTS "respondedByName" VARCHAR`);
    await queryRunner.query(`ALTER TABLE "freight_routes" ADD COLUMN IF NOT EXISTS "completedByName" VARCHAR`);

    // ---------- viagens ----------
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_freight_routes_one_active"
          ON "freight_routes" ("freightId")
       WHERE status = 'PROGUESS' AND "isActive" = true
    `);

    // ---------- fretes vencidos ----------
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_freight_expires_open"
          ON "freight" ("expiresAt")
       WHERE "isActive" = true AND "isExclude" = false AND "expiresAt" IS NOT NULL
    `);

    // ---------- pedágio ----------
    await queryRunner.query(`ALTER TABLE "route_cache" ADD COLUMN IF NOT EXISTS "axis" INTEGER NOT NULL DEFAULT 2`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cc4c1b97fd5c5e50b427c58c42"`);
    await queryRunner.query(`
      DELETE FROM "route_cache" a
       USING "route_cache" b
       WHERE a."originCity" = b."originCity" AND a."destinationCity" = b."destinationCity"
         AND a."axis" = b."axis" AND a."updatedAt" < b."updatedAt"
         AND NOT EXISTS (SELECT 1 FROM "freight" f WHERE f."routeCacheId" = a.id)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_route_cache_route_axis"
          ON "route_cache" ("originCity", "destinationCity", "axis")
    `);
    await queryRunner.query(`ALTER TABLE "freight" DROP CONSTRAINT IF EXISTS "FK_3a3848aec7ec1757670c1d4f2fa"`);
    await queryRunner.query(`
      ALTER TABLE "freight"
        ADD CONSTRAINT "FK_3a3848aec7ec1757670c1d4f2fa" FOREIGN KEY ("routeCacheId")
        REFERENCES "route_cache"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "freight" DROP CONSTRAINT IF EXISTS "FK_3a3848aec7ec1757670c1d4f2fa"`);
    await queryRunner.query(`
      ALTER TABLE "freight"
        ADD CONSTRAINT "FK_3a3848aec7ec1757670c1d4f2fa" FOREIGN KEY ("routeCacheId")
        REFERENCES "route_cache"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_route_cache_route_axis"`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cc4c1b97fd5c5e50b427c58c42" ON "route_cache" ("originCity", "destinationCity")`,
    );
    await queryRunner.query(`ALTER TABLE "route_cache" DROP COLUMN IF EXISTS "axis"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_freight_expires_open"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_freight_routes_one_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_freight_requests_open_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_freight_requests_open_per_driver"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "web_push_deliveries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "web_push_subscriptions"`);
    await queryRunner.query(`ALTER TABLE "freight_routes" DROP COLUMN IF EXISTS "completedByName"`);
    await queryRunner.query(`ALTER TABLE "freight_requests" DROP COLUMN IF EXISTS "respondedByName"`);
    await queryRunner.query(`ALTER TABLE "freight" DROP COLUMN IF EXISTS "createdByName"`);
    await queryRunner.query(`ALTER TABLE "freight" DROP COLUMN IF EXISTS "createdByContactId"`);
    await queryRunner.query(`ALTER TABLE "freight_requests" DROP COLUMN IF EXISTS "deliveryInformedAt"`);
    await queryRunner.query(`ALTER TABLE "freight_requests" DROP COLUMN IF EXISTS "respondedAt"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_route_locations_company_event" ON "freight_route_locations"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS notify_company_route_locations()`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_freight_routes_company_event" ON "freight_routes"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_freight_requests_company_event" ON "freight_requests"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_freight_company_event" ON "freight"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS notify_company_freight_event()`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "trg_notifications_company_realtime" ON "notifications"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS notify_company_notification()`);
  }
}
