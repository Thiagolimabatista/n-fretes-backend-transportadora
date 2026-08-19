import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFreightDocumentsAndTags1773800000000
  implements MigrationInterface
{
  name = 'CreateFreightDocumentsAndTags1773800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "freight"
      ADD COLUMN IF NOT EXISTS "tags" text
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "freight-documents" (
        "id"            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "companyId"     varchar        NOT NULL,
        "freightId"     varchar        NOT NULL,
        "fileName"      varchar        NOT NULL,
        "fileKey"       varchar        NOT NULL,
        "fileUrl"       varchar        NOT NULL,
        "mimeType"      varchar        NOT NULL,
        "fileSizeBytes" integer        NOT NULL,
        "description"   text,
        "tags"          text,
        "isActive"      boolean        NOT NULL DEFAULT true,
        "createdAt"     timestamptz    NOT NULL DEFAULT now(),
        "updatedAt"     timestamptz    NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_freight_documents_company_freight"
      ON "freight-documents" ("companyId", "freightId")
    `);

    await queryRunner.query(`
      ALTER TABLE "freight-documents"
      ADD CONSTRAINT "FK_freight_documents_company"
      FOREIGN KEY ("companyId") REFERENCES "company"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "freight-documents"
      ADD CONSTRAINT "FK_freight_documents_freight"
      FOREIGN KEY ("freightId") REFERENCES "freight"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "freight-documents"
      DROP CONSTRAINT IF EXISTS "FK_freight_documents_freight"
    `);

    await queryRunner.query(`
      ALTER TABLE "freight-documents"
      DROP CONSTRAINT IF EXISTS "FK_freight_documents_company"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_freight_documents_company_freight"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "freight-documents"
    `);

    await queryRunner.query(`
      ALTER TABLE "freight"
      DROP COLUMN IF EXISTS "tags"
    `);
  }
}
