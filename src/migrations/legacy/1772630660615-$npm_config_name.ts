import { MigrationInterface, QueryRunner } from "typeorm";

export class  $npmConfigName1772630660615 implements MigrationInterface {
    name = ' $npmConfigName1772630660615'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "freight" ADD "routeCacheId" character varying`);
        await queryRunner.query(`ALTER TABLE "freight" ADD CONSTRAINT "FK_3a3848aec7ec1757670c1d4f2fa" FOREIGN KEY ("routeCacheId") REFERENCES "route_cache"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "freight" DROP CONSTRAINT "FK_3a3848aec7ec1757670c1d4f2fa"`);
        await queryRunner.query(`ALTER TABLE "freight" DROP COLUMN "routeCacheId"`);
    }

}
