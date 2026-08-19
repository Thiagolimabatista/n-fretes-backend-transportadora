import { MigrationInterface, QueryRunner } from "typeorm";

export class  $npmConfigName1773687175577 implements MigrationInterface {
    name = ' $npmConfigName1773687175577'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Tabela já criada pela migration manual 1772700000000, apenas adiciona as FKs
        await queryRunner.query(`ALTER TABLE "driver-documents" ADD CONSTRAINT "FK_aae626cb81d3d9dacb9dd8e1ca0" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "driver-documents" ADD CONSTRAINT "FK_7f2c32301f4562627ffae70d461" FOREIGN KEY ("userId") REFERENCES "users_drive"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "driver-documents" DROP CONSTRAINT "FK_7f2c32301f4562627ffae70d461"`);
        await queryRunner.query(`ALTER TABLE "driver-documents" DROP CONSTRAINT "FK_aae626cb81d3d9dacb9dd8e1ca0"`);
        await queryRunner.query(`DROP TABLE "driver-documents"`);
    }

}
