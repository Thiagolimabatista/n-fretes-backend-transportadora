import { MigrationInterface, QueryRunner } from "typeorm";

export class  $npmConfigName1772638460120 implements MigrationInterface {
    name = ' $npmConfigName1772638460120'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "freight" ADD "contactGroupIds" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "freight" DROP COLUMN "contactGroupIds"`);
    }

}
