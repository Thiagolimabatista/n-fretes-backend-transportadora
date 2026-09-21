import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Revisão da plataforma (set/2026):
 * - `company.onboardingCompletedAt`: controla o convite de primeiro frete.
 *   Empresas que já publicaram fretes são marcadas como concluídas para
 *   não verem o convite.
 * - Fretes passam a ser sempre nacionais e públicos (não existe mais
 *   tipo de envio nem compartilhamento restrito).
 *
 * As tabelas de assinatura/planos/Asaas NÃO são removidas: o backend
 * admin ainda as lê. Elas apenas deixam de ser usadas pela plataforma.
 */
export class PlatformReview20261790008000000 implements MigrationInterface {
  name = 'PlatformReview20261790008000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `UPDATE "company" c SET "onboardingCompletedAt" = now()
        WHERE c."onboardingCompletedAt" IS NULL
          AND EXISTS (SELECT 1 FROM "freight" f WHERE f."companyId" = c."id")`,
    );
    await queryRunner.query(
      `UPDATE "freight" SET "shippingLocation" = 'Nacional'
        WHERE "shippingLocation" IS DISTINCT FROM 'Nacional'`,
    );
    await queryRunner.query(
      `UPDATE "freight" SET "isPublic" = true WHERE "isPublic" IS DISTINCT FROM true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "company" DROP COLUMN IF EXISTS "onboardingCompletedAt"`,
    );
  }
}
