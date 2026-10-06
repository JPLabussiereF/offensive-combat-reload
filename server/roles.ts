// Staff roles on the server: read from the database on every request that needs them (a role taken away
// counts at once, with no cache to wait for), and the gate for the staff-only routes. The rules of who may act
// on whom are shared/roles.ts.
import { isPapel, type Conta, type Papel } from '@shared/roles';
import type { Queryable } from './db';
import { HttpError } from './http';
import { requireSession, type Ctx } from './route';

/** An account's staff roles (empty: a player). */
export async function rolesOf(db: Queryable, accountId: string): Promise<Papel[]> {
  const { rows } = await db.query<{ role: string }>('SELECT role FROM account_role WHERE account_id = $1 ORDER BY role', [accountId]);
  return rows.map((r) => r.role).filter(isPapel);
}

/** How many accounts are admins (the last one can't be removed). */
export async function adminCount(db: Queryable): Promise<number> {
  const { rows } = await db.query<{ n: string }>("SELECT count(*) AS n FROM account_role r JOIN account a ON a.id = r.account_id WHERE r.role = 'admin' AND a.status <> 'deleted'");
  return Number(rows[0]?.n ?? 0);
}

/** The signed-in account and its roles, as shared/roles.ts takes them. */
export async function actor(ctx: Ctx): Promise<Conta> {
  const s = await requireSession(ctx);
  return { id: s.accountId, papeis: await rolesOf(ctx.deps.db, s.accountId) };
}

/** The signed-in account, when it has one of `papeis` (403 sem_permissao otherwise). */
export async function requireRole(ctx: Ctx, ...papeis: Papel[]): Promise<Conta> {
  const me = await actor(ctx);
  if (!me.papeis.some((p) => papeis.includes(p))) throw new HttpError(403, 'sem_permissao');
  return me;
}
