import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { EntityManager } from 'typeorm';

/** Quem está agindo no portal: a empresa do token e, se for da equipe, o membro. */
export interface Actor {
  companyId: string;
  /** Membro da equipe (login de contato); null quando é a conta principal. */
  contactId: string | null;
}

export const GetActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
  const user = ctx.switchToHttp().getRequest().user ?? {};
  return { companyId: user.sub, contactId: user.contactId ?? null };
});

/**
 * Nome para o histórico: o do membro da equipe ou o da empresa (conta
 * principal). Nunca falha: sem nome, "Equipe".
 */
export async function actorName(manager: EntityManager, actor: Actor): Promise<string> {
  if (actor.contactId) {
    const [contact] = await manager.query(
      `SELECT "name" FROM "contact-company" WHERE "id" = $1 AND "companyId" = $2`,
      [actor.contactId, actor.companyId],
    );
    if (contact?.name) return contact.name;
  }
  const [company] = await manager.query(
    `SELECT COALESCE(NULLIF("nameFantasy", ''), "name") AS "name" FROM "company" WHERE "id" = $1`,
    [actor.companyId],
  );
  return company?.name || 'Equipe';
}
