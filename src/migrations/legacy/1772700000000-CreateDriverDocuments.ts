import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDriverDocuments1772700000000 implements MigrationInterface {
  name = 'CreateDriverDocuments1772700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "driver-documents" (
        "id"            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "companyId"     varchar        NOT NULL,
        "userId"        varchar        NOT NULL,
        "fileName"      varchar        NOT NULL,
        "fileKey"       varchar        NOT NULL,
        "fileUrl"       varchar        NOT NULL,
        "mimeType"      varchar        NOT NULL,
        "fileSizeBytes" integer        NOT NULL,
        "description"   text,
        "isActive"      boolean        NOT NULL DEFAULT true,
        "createdAt"     timestamptz    NOT NULL DEFAULT now(),
        "updatedAt"     timestamptz    NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_driver_documents_company_user"
        ON "driver-documents" ("companyId", "userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_driver_documents_company_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "driver-documents"`);
  }
}
