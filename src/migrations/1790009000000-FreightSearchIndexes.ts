import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nome da cidade normalizado a partir do texto gravado em `originCity` /
 * `destinyCity`, que chega em três formatos: "Uberlândia", "Uberlândia, MG"
 * e endereço completo do Google ("Av. X, 15 - Bairro, Uberlândia - MG,
 * 38411-145"). Só funções IMMUTABLE, para poder ser coluna gerada.
 */
const cityNameExpression = (column: string) => `NULLIF(btrim(
    CASE
      WHEN "${column}" ~ '[^,]+ - [A-Z]{2}(, *[0-9]{5}-?[0-9]{3})?(, *Brasil)? *$'
        THEN substring("${column}" from '([^,]+) - [A-Z]{2}(?:, *[0-9]{5}-?[0-9]{3})?(?:, *Brasil)? *$')
      ELSE regexp_replace("${column}", '(, *[A-Z]{2})?(, *Brasil)? *$', '')
    END
  ), '')`;

/** Fretes que aparecem na busca: ativos e não excluídos. */
const SEARCHABLE = `"isExclude" = false AND "isActive" = true`;

/**
 * Busca de fretes (origem, destino, veículo, carroceria):
 * - Colunas geradas `originCityName` / `destinyCityName` com a cidade
 *   normalizada — o filtro passa a ser por igualdade (cidade + UF) em vez de
 *   `ILIKE '%...%'`, que misturava "São Paulo" com "São Paulo de Olivença".
 *   Por serem geradas pelo banco, valem para qualquer serviço que grave
 *   fretes (transportadora, workers/Fretebras).
 * - Índices parciais só sobre os fretes pesquisáveis.
 * - GIN sobre as listas de veículos/carrocerias (`simple-array` gravado como
 *   "a,b,c") para o operador de interseção `&&`.
 */
export class FreightSearchIndexes1790009000000 implements MigrationInterface {
  name = 'FreightSearchIndexes1790009000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "freight" ADD COLUMN IF NOT EXISTS "originCityName" text GENERATED ALWAYS AS (${cityNameExpression('originCity')}) STORED`,
    );
    await queryRunner.query(
      `ALTER TABLE "freight" ADD COLUMN IF NOT EXISTS "destinyCityName" text GENERATED ALWAYS AS (${cityNameExpression('destinyCity')}) STORED`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_freight_search_recent" ON "freight" ("createdAt" DESC) WHERE ${SEARCHABLE}`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_freight_search_origin" ON "freight" ("originState", lower("originCityName")) WHERE ${SEARCHABLE}`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_freight_search_destiny" ON "freight" ("destinyState", lower("destinyCityName")) WHERE ${SEARCHABLE}`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_freight_search_vehicles" ON "freight" USING GIN (string_to_array("vehicleTypes", ',')) WHERE ${SEARCHABLE}`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_freight_search_bodies" ON "freight" USING GIN (string_to_array("bodyTypes", ',')) WHERE ${SEARCHABLE}`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_freight_company" ON "freight" ("companyId", "createdAt" DESC) WHERE "isExclude" = false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_freight_company"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_freight_search_bodies"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_freight_search_vehicles"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_freight_search_destiny"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_freight_search_origin"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_freight_search_recent"`);
    await queryRunner.query(
      `ALTER TABLE "freight" DROP COLUMN IF EXISTS "destinyCityName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "freight" DROP COLUMN IF EXISTS "originCityName"`,
    );
  }
}
