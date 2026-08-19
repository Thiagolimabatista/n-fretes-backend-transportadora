import { MigrationInterface, QueryRunner } from "typeorm";

export class  $npmConfigName1772628949484 implements MigrationInterface {
    name = ' $npmConfigName1772628949484'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ── vehicleType ──────────────────────────────────────────────────────
        // 1. Drop column enum constraint by switching to TEXT
        await queryRunner.query(`ALTER TABLE "vehicles" ALTER COLUMN "vehicleType" TYPE TEXT`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."vehicles_vehicletype_enum_old"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."vehicles_vehicletype_enum"`);

        // 2. Migrate existing rows from old Portuguese values → new English values
        await queryRunner.query(`UPDATE "vehicles" SET "vehicleType" = 'Three Quarter' WHERE "vehicleType" = 'Três Quartos'`);
        await queryRunner.query(`UPDATE "vehicles" SET "vehicleType" = 'Bi Train'      WHERE "vehicleType" = 'Bitrem'`);
        await queryRunner.query(`UPDATE "vehicles" SET "vehicleType" = 'Bit Truck'     WHERE "vehicleType" = 'Bitruck'`);
        await queryRunner.query(`UPDATE "vehicles" SET "vehicleType" = 'Cart'          WHERE "vehicleType" = 'Carreta'`);
        await queryRunner.query(`UPDATE "vehicles" SET "vehicleType" = 'Cart LS'       WHERE "vehicleType" = 'Carreta LS'`);
        await queryRunner.query(`UPDATE "vehicles" SET "vehicleType" = 'Road Train'    WHERE "vehicleType" = 'Rodotrem'`);
        await queryRunner.query(`UPDATE "vehicles" SET "vehicleType" = 'toco'          WHERE "vehicleType" = 'Toco'`);
        await queryRunner.query(`UPDATE "vehicles" SET "vehicleType" = 'allLight'      WHERE "vehicleType" = 'Leve'`);
        await queryRunner.query(`UPDATE "vehicles" SET "vehicleType" = 'allAverage'    WHERE "vehicleType" = 'Médio'`);
        await queryRunner.query(`UPDATE "vehicles" SET "vehicleType" = 'allWeight'     WHERE "vehicleType" = 'Pesado'`);

        // 3. Create the new enum and restore the column type
        await queryRunner.query(`CREATE TYPE "public"."vehicles_vehicletype_enum" AS ENUM('Three Quarter', 'Fiorino', 'Stump', 'VCL', 'Bit Truck', 'Truck', 'Bi Train', 'Cart', 'Cart LS', 'Road Train', 'Vanderleia', 'allLight', 'threeFour', 'toco', 'allWeight', 'train wheel', 'allAverage')`);
        await queryRunner.query(`ALTER TABLE "vehicles" ALTER COLUMN "vehicleType" TYPE "public"."vehicles_vehicletype_enum" USING "vehicleType"::"public"."vehicles_vehicletype_enum"`);

        // ── bodyType ─────────────────────────────────────────────────────────
        // 1. Drop column enum constraint by switching to TEXT
        await queryRunner.query(`ALTER TABLE "vehicles" ALTER COLUMN "bodyType" TYPE TEXT`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."vehicles_bodytype_enum_old"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."vehicles_bodytype_enum"`);

        // 2. Migrate existing rows from old Portuguese values → new English values
        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Bucket'             WHERE "bodyType" = 'Basculante'`);
        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Board'              WHERE "bodyType" = 'Baú'`);
        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Fridge Chest'       WHERE "bodyType" = 'Baú Frigorífico'`);
        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Refrigerated Chest' WHERE "bodyType" = 'Baú Refrigerado'`);
        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Only Horse'         WHERE "bodyType" = 'Cavalo Mecânico'`);
        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Cage'               WHERE "bodyType" = 'Gaiola'`);
        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Low Grille'         WHERE "bodyType" = 'Grade Baixa'`);
        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Bulk Carrier'       WHERE "bodyType" = 'Graneleiro'`);
        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Munk'               WHERE "bodyType" = 'Munck'`);
        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Platform'           WHERE "bodyType" = 'Plataforma'`);
        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Prattle'            WHERE "bodyType" = 'Prancha'`);
        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Tank'               WHERE "bodyType" = 'Tanque'`);
        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Bucket'             WHERE "bodyType" = 'Caçamba'`);

        // 3. Create the new enum and restore the column type
        await queryRunner.query(`CREATE TYPE "public"."vehicles_bodytype_enum" AS ENUM('Chest', 'Fridge Chest', 'Refrigerated Chest', 'Sider', 'Bucket', 'Low Grille', 'Bulk Carrier', 'Platform', 'Board', 'Only Horse', 'Bug Container Door', 'Prattle', 'Blinker', 'Cavaqueira', 'Cage', 'Container', 'Hopper', 'Munk', 'Silo', 'Tank')`);
        await queryRunner.query(`ALTER TABLE "vehicles" ALTER COLUMN "bodyType" TYPE "public"."vehicles_bodytype_enum" USING "bodyType"::"public"."vehicles_bodytype_enum"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // ── bodyType ─────────────────────────────────────────────────────────
        await queryRunner.query(`ALTER TABLE "vehicles" ALTER COLUMN "bodyType" TYPE TEXT`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."vehicles_bodytype_enum"`);

        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Basculante'      WHERE "bodyType" = 'Bucket'`);
        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Baú'             WHERE "bodyType" = 'Board'`);
        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Baú Frigorífico' WHERE "bodyType" = 'Fridge Chest'`);
        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Baú Refrigerado' WHERE "bodyType" = 'Refrigerated Chest'`);
        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Cavalo Mecânico' WHERE "bodyType" = 'Only Horse'`);
        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Gaiola'          WHERE "bodyType" = 'Cage'`);
        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Grade Baixa'     WHERE "bodyType" = 'Low Grille'`);
        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Graneleiro'      WHERE "bodyType" = 'Bulk Carrier'`);
        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Munck'           WHERE "bodyType" = 'Munk'`);
        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Plataforma'      WHERE "bodyType" = 'Platform'`);
        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Prancha'         WHERE "bodyType" = 'Prattle'`);
        await queryRunner.query(`UPDATE "vehicles" SET "bodyType" = 'Tanque'          WHERE "bodyType" = 'Tank'`);

        await queryRunner.query(`CREATE TYPE "public"."vehicles_bodytype_enum" AS ENUM('Basculante', 'Baú', 'Baú Frigorífico', 'Baú Refrigerado', 'Cavalo Mecânico', 'Cavaqueira', 'Caçamba', 'Container', 'Gaiola', 'Grade Baixa', 'Graneleiro', 'Hopper', 'Munck', 'Plataforma', 'Prancha', 'Sider', 'Silo', 'Tanque')`);
        await queryRunner.query(`ALTER TABLE "vehicles" ALTER COLUMN "bodyType" TYPE "public"."vehicles_bodytype_enum" USING "bodyType"::"public"."vehicles_bodytype_enum"`);

        // ── vehicleType ──────────────────────────────────────────────────────
        await queryRunner.query(`ALTER TABLE "vehicles" ALTER COLUMN "vehicleType" TYPE TEXT`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."vehicles_vehicletype_enum"`);

        await queryRunner.query(`UPDATE "vehicles" SET "vehicleType" = 'Três Quartos' WHERE "vehicleType" = 'Three Quarter'`);
        await queryRunner.query(`UPDATE "vehicles" SET "vehicleType" = 'Bitrem'       WHERE "vehicleType" = 'Bi Train'`);
        await queryRunner.query(`UPDATE "vehicles" SET "vehicleType" = 'Bitruck'      WHERE "vehicleType" = 'Bit Truck'`);
        await queryRunner.query(`UPDATE "vehicles" SET "vehicleType" = 'Carreta'      WHERE "vehicleType" = 'Cart'`);
        await queryRunner.query(`UPDATE "vehicles" SET "vehicleType" = 'Carreta LS'   WHERE "vehicleType" = 'Cart LS'`);
        await queryRunner.query(`UPDATE "vehicles" SET "vehicleType" = 'Rodotrem'     WHERE "vehicleType" = 'Road Train'`);
        await queryRunner.query(`UPDATE "vehicles" SET "vehicleType" = 'Toco'         WHERE "vehicleType" = 'toco'`);
        await queryRunner.query(`UPDATE "vehicles" SET "vehicleType" = 'Leve'         WHERE "vehicleType" = 'allLight'`);
        await queryRunner.query(`UPDATE "vehicles" SET "vehicleType" = 'Médio'        WHERE "vehicleType" = 'allAverage'`);
        await queryRunner.query(`UPDATE "vehicles" SET "vehicleType" = 'Pesado'       WHERE "vehicleType" = 'allWeight'`);

        await queryRunner.query(`CREATE TYPE "public"."vehicles_vehicletype_enum" AS ENUM('Bitrem', 'Bitruck', 'Carreta', 'Carreta LS', 'Fiorino', 'Leve', 'Médio', 'Pesado', 'Rodotrem', 'Toco', 'Truck', 'Três Quartos', 'VCL', 'Vanderleia')`);
        await queryRunner.query(`ALTER TABLE "vehicles" ALTER COLUMN "vehicleType" TYPE "public"."vehicles_vehicletype_enum" USING "vehicleType"::"public"."vehicles_vehicletype_enum"`);
    }

}
