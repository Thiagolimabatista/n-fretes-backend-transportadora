import { MigrationInterface, QueryRunner } from "typeorm";

export class  $npmConfigName1772645857296 implements MigrationInterface {
    name = ' $npmConfigName1772645857296'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "freight" ADD "anttLoadType" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "freight" DROP COLUMN "anttLoadType"`);
    }

}
