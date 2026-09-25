import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índices para o painel da transportadora e para a regra de motorista
 * ocupado. `freight_routes` não tinha índice nenhum além da chave primária:
 * - ("companyId", "status"): cards e listas do painel (rotas da empresa por
 *   status);
 * - ("freightId"): conversão do gráfico de volume e a checagem de entrega
 *   informada. Sem ele, o volume de 90 dias varria todas as rotas uma vez
 *   para cada frete publicado (medido com ~240 mil fretes: 8,4 s sem o
 *   índice, 75 ms com ele);
 * - ("userDriveId", "status"): rota que ocupa o motorista (aceite e app).
 * Em `vehicles`, o veículo principal de cada motorista, usado nas listas.
 *
 * Tudo com `IF [NOT] EXISTS`: o mesmo banco é usado por mais de uma frente.
 */
export class DashboardIndexes1790012000000 implements MigrationInterface {
  name = 'DashboardIndexes1790012000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_freight_routes_company_status" ON "freight_routes" ("companyId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_freight_routes_freight" ON "freight_routes" ("freightId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_freight_routes_driver_status" ON "freight_routes" ("userDriveId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_vehicles_user_main" ON "vehicles" ("userId") WHERE "isMainVehicle" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_vehicles_user_main"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_freight_routes_driver_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_freight_routes_freight"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_freight_routes_company_status"`);
  }
}
