import { MigrationInterface, QueryRunner } from "typeorm";

export class  $npmConfigName1774269367406 implements MigrationInterface {
    name = ' $npmConfigName1774269367406'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // NOTE: "freight-documents" table and "freight.tags" column are created by migration 1773800000000.
        // This migration only handles the driver-documents timestamp type fix and index drop.
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_driver_documents_company_user"`);
        await queryRunner.query(`ALTER TABLE "driver-documents" DROP COLUMN IF EXISTS "createdAt"`);
        await queryRunner.query(`ALTER TABLE "driver-documents" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "driver-documents" DROP COLUMN IF EXISTS "updatedAt"`);
        await queryRunner.query(`ALTER TABLE "driver-documents" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "driver-documents" DROP COLUMN "updatedAt"`);
        await queryRunner.query(`ALTER TABLE "driver-documents" ADD "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "driver-documents" DROP COLUMN "createdAt"`);
        await queryRunner.query(`ALTER TABLE "driver-documents" ADD "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`CREATE INDEX "IDX_driver_documents_company_user" ON "driver-documents" ("companyId", "userId") `);
    }

}
