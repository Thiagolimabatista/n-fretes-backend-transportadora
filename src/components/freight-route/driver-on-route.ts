import { EntityManager } from 'typeorm';

/**
 * Condição SQL de "rota que ocupa o motorista": PROGUESS, ativa e sem a
 * entrega já informada por ele (DRIVER_CONFIRMED_DELIVERY) ou concluída.
 * Depois de entregar, a rota só fecha quando a transportadora confirma (ou
 * pelo cron de 3 dias) — nesse intervalo o motorista já pode pegar outro
 * frete. `alias` é o alias de `freight_routes` na consulta.
 */
export function occupyingRouteCondition(alias: string): string {
  return `${alias}."status" = 'PROGUESS'
    AND ${alias}."isActive" = true
    AND NOT EXISTS (
      SELECT 1
        FROM "freight_requests" delivered
       WHERE delivered."freightId" = ${alias}."freightId"
         AND delivered."userDriveId" = ${alias}."userDriveId"
         AND delivered."status" IN ('DRIVER_CONFIRMED_DELIVERY', 'DELIVERY_COMPLETED')
    )`;
}

/** Id da rota que ocupa o motorista agora, ou `null`. */
export async function findOccupyingRouteId(
  manager: EntityManager,
  userDriveId: string,
): Promise<string | null> {
  const [row] = await manager.query(
    `SELECT r."id"
       FROM "freight_routes" r
      WHERE r."userDriveId" = $1
        AND ${occupyingRouteCondition('r')}
      LIMIT 1`,
    [userDriveId],
  );
  return row?.id ?? null;
}

/**
 * Recalcula `users_drive.isOnRoute` a partir das rotas que de fato ocupam o
 * motorista. O campo é só um espelho para as telas: quem decide se o
 * motorista está em rota é a tabela `freight_routes`.
 */
export async function syncDriverOnRoute(
  manager: EntityManager,
  userDriveId: string,
): Promise<void> {
  await manager.query(
    `UPDATE "users_drive"
        SET "isOnRoute" = EXISTS (
              SELECT 1
                FROM "freight_routes" r
               WHERE r."userDriveId" = $1
                 AND ${occupyingRouteCondition('r')}
            )
      WHERE "id" = $1`,
    [userDriveId],
  );
}
