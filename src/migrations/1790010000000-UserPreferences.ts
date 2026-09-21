import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Preferências de interface por usuário do portal (ex.: menu lateral ou no
 * topo). A empresa (login por CNPJ) e cada membro da equipe (login por
 * e-mail, tabela `contact-company`) têm as próprias preferências, que
 * acompanham a conta em qualquer navegador.
 */
export class UserPreferences1790010000000 implements MigrationInterface {
  name = 'UserPreferences1790010000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "preferences" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "contact-company" ADD COLUMN IF NOT EXISTS "preferences" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contact-company" DROP COLUMN IF EXISTS "preferences"`,
    );
    await queryRunner.query(
      `ALTER TABLE "company" DROP COLUMN IF EXISTS "preferences"`,
    );
  }
}
