import { MigrationInterface, QueryRunner } from "typeorm";

export class  $npmConfigName1772636857333 implements MigrationInterface {
    name = ' $npmConfigName1772636857333'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "freight" ADD "isPublic" boolean NOT NULL DEFAULT true`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "freight" DROP COLUMN "isPublic"`);
    }

}
