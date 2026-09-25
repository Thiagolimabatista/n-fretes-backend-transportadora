import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índices da tela "Meus motoristas" (rede de motoristas da empresa):
 * - company-users-contacts ("companyId", "isActive"): lista paginada da rede;
 *   a tabela só tinha a chave primária;
 * - company-users-contacts ("userId", "companyId"): "já está na sua rede" e o
 *   reaproveitamento do contato ao adicionar de novo;
 * - users_drive por CPF só com dígitos: o CPF está gravado ora com pontuação,
 *   ora sem; a busca compara os dígitos e usa este índice de expressão;
 * - driver-documents e contact-group ativos por empresa.
 *
 * Tudo com `IF [NOT] EXISTS`: o mesmo banco é usado por mais de uma frente.
 */
export class DriverNetworkIndexes1790013000000 implements MigrationInterface {
  name = 'DriverNetworkIndexes1790013000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_company_users_contacts_company_active" ON "company-users-contacts" ("companyId", "isActive")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_company_users_contacts_user_company" ON "company-users-contacts" ("userId", "companyId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_drive_cpf_digits" ON "users_drive" ((regexp_replace("cpf", '\\D', '', 'g')))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_driver_documents_company_user" ON "driver-documents" ("companyId", "userId") WHERE "isActive" = true`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_contact_group_company" ON "contact-group" ("companyId") WHERE "isActive" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_contact_group_company"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_driver_documents_company_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_drive_cpf_digits"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_company_users_contacts_user_company"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_company_users_contacts_company_active"`);
  }
}
