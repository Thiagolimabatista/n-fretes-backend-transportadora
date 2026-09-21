import { MigrationInterface, QueryRunner } from 'typeorm';

/** Valores do enum de solicitação antes desta migration (usado no `down`). */
const LEGACY_REQUEST_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'AWAITING_USER_DRIVE_RESPONSE',
  'DRIVER_CONFIRMED_DELIVERY',
  'DELIVERY_COMPLETED',
  'NOT_CONFIRMED_DELIVERY',
];

/**
 * Aceite em 1 passo e rastreamento da rota:
 * - `CANCELED_BY_DRIVER` no status da solicitação (motorista desistiu do
 *   frete depois de aceito). O valor novo não é usado nesta transação, o que
 *   permite o `ADD VALUE` dentro dela no PG14.
 * - `freight_routes."completedAt"` deixa de ser "data da última alteração"
 *   (@UpdateDateColumn) e passa a ser preenchida só quando a rota é concluída.
 * - `freight_route_locations` ganha motorista, precisão, velocidade, direção
 *   e a hora em que o servidor recebeu o ponto (`timestamp` continua sendo a
 *   hora registrada pelo aparelho). Pontos repetidos da mesma rota no mesmo
 *   instante são descartados e passam a ser barrados por índice único, para o
 *   envio em lote do app poder repetir sem duplicar.
 * - `users_location."city"` opcional (a geocodificação pode falhar).
 * - Índices para as consultas de solicitação por frete/motorista e da última
 *   posição do motorista.
 *
 * Tudo com `IF [NOT] EXISTS`: o mesmo banco é usado por mais de uma frente.
 */
export class AcceptFlowAndTracking1790011000000 implements MigrationInterface {
  name = 'AcceptFlowAndTracking1790011000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "freight_requests_status_enum" ADD VALUE IF NOT EXISTS 'CANCELED_BY_DRIVER'`,
    );

    await queryRunner.query(
      `ALTER TABLE "freight_routes" ALTER COLUMN "completedAt" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "freight_routes" ALTER COLUMN "completedAt" DROP NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "freight_routes" SET "completedAt" = NULL WHERE "status" <> 'COMPLETED' AND "completedAt" IS NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "freight_route_locations" ADD COLUMN IF NOT EXISTS "userDriveId" varchar NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "freight_route_locations" ADD COLUMN IF NOT EXISTS "accuracy" double precision NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "freight_route_locations" ADD COLUMN IF NOT EXISTS "speed" double precision NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "freight_route_locations" ADD COLUMN IF NOT EXISTS "heading" double precision NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "freight_route_locations" ADD COLUMN IF NOT EXISTS "receivedAt" timestamp NOT NULL DEFAULT now()`,
    );
    // Pontos antigos (sem motorista): recebidos na hora em que foram gravados.
    await queryRunner.query(
      `UPDATE "freight_route_locations" SET "receivedAt" = "timestamp" WHERE "userDriveId" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "freight_route_locations" l
          SET "userDriveId" = r."userDriveId"
         FROM "freight_routes" r
        WHERE r."id" = l."routeId"
          AND l."userDriveId" IS NULL
          AND r."userDriveId" IS NOT NULL`,
    );
    await queryRunner.query(
      `DELETE FROM "freight_route_locations" a
        USING "freight_route_locations" b
        WHERE a."routeId" = b."routeId"
          AND a."timestamp" = b."timestamp"
          AND a."id" > b."id"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_route_locations_route_time" ON "freight_route_locations" ("routeId", "timestamp")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_route_locations_driver_time" ON "freight_route_locations" ("userDriveId", "timestamp" DESC)`,
    );

    await queryRunner.query(
      `ALTER TABLE "users_location" ALTER COLUMN "city" DROP NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_location_user_time" ON "users_location" ("userId", "createdAt" DESC)`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_freight_requests_freight_status" ON "freight_requests" ("freightId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_freight_requests_driver_status" ON "freight_requests" ("userDriveId", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_freight_requests_driver_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_freight_requests_freight_status"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_users_location_user_time"`,
    );
    await queryRunner.query(
      `UPDATE "users_location" SET "city" = '' WHERE "city" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users_location" ALTER COLUMN "city" SET NOT NULL`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_route_locations_driver_time"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_route_locations_route_time"`,
    );
    await queryRunner.query(
      `ALTER TABLE "freight_route_locations" DROP COLUMN IF EXISTS "receivedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "freight_route_locations" DROP COLUMN IF EXISTS "heading"`,
    );
    await queryRunner.query(
      `ALTER TABLE "freight_route_locations" DROP COLUMN IF EXISTS "speed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "freight_route_locations" DROP COLUMN IF EXISTS "accuracy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "freight_route_locations" DROP COLUMN IF EXISTS "userDriveId"`,
    );

    await queryRunner.query(
      `UPDATE "freight_routes" SET "completedAt" = COALESCE("completedAt", "startedAt", now()) WHERE "completedAt" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "freight_routes" ALTER COLUMN "completedAt" SET DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "freight_routes" ALTER COLUMN "completedAt" SET NOT NULL`,
    );

    // O Postgres não remove valor de enum: recria o tipo sem CANCELED_BY_DRIVER.
    const legacyValues = LEGACY_REQUEST_STATUSES.map((v) => `'${v}'`).join(
      ', ',
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
            FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
           WHERE t.typname = 'freight_requests_status_enum'
             AND e.enumlabel = 'CANCELED_BY_DRIVER'
        ) THEN
          UPDATE "freight_requests" SET "status" = 'REJECTED' WHERE "status"::text = 'CANCELED_BY_DRIVER';
          ALTER TYPE "freight_requests_status_enum" RENAME TO "freight_requests_status_enum_old";
          CREATE TYPE "freight_requests_status_enum" AS ENUM (${legacyValues});
          ALTER TABLE "freight_requests" ALTER COLUMN "status" DROP DEFAULT;
          ALTER TABLE "freight_requests"
            ALTER COLUMN "status" TYPE "freight_requests_status_enum"
            USING "status"::text::"freight_requests_status_enum";
          ALTER TABLE "freight_requests" ALTER COLUMN "status" SET DEFAULT 'PENDING';
          DROP TYPE "freight_requests_status_enum_old";
        END IF;
      END
      $$;
    `);
  }
}
