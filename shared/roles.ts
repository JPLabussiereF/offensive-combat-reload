// Staff roles (PF-6): who may act on whose account and which roles each one may hand out. Pure rules, the
// same for the server (checked on every request, with the roles read from the database right then) and for
// the client (the Management screen hides what would be refused).
//
// - admin: everything.
// - moderador: everything an admin can, except acting on an admin's account (edit, punish, demote) and making
//   anyone an admin.
// - Any other account (a player, "user") has no staff power.
// - Nobody punishes themselves, and the last admin can't be removed.

export type Papel = 'admin' | 'moderador';
export const PAPEIS: readonly Papel[] = ['admin', 'moderador'];
export const isPapel = (v: unknown): v is Papel => PAPEIS.includes(v as Papel);

/** An account as the rules see it: its id and its staff roles (empty: a player). */
export interface Conta {
  id: string;
  papeis: readonly Papel[];
}

export const isAdmin = (c: Pick<Conta, 'papeis'>) => c.papeis.includes('admin');
/** Admin or moderator: the staff, who see the Management screen and keep the official maps. */
export const isEquipe = (c: Pick<Conta, 'papeis'>) => c.papeis.some(isPapel);

/** Whether `ator` may act on `alvo`'s account at all (edit it, punish it, change its roles). */
export function podeAgirSobre(ator: Conta, alvo: Conta): boolean {
  if (!isEquipe(ator)) return false;
  if (isAdmin(ator)) return true;
  // A moderator never touches an admin's account.
  return !isAdmin(alvo);
}

/** Whether `ator` may punish (ban, mute) `alvo`: acting on them, and never on themselves. */
export const podePunir = (ator: Conta, alvo: Conta) => ator.id !== alvo.id && podeAgirSobre(ator, alvo);

/** Whether `ator` may give (or take away) role `papel`: an admin any role, a moderator any but admin. */
export function podeConceder(ator: Pick<Conta, 'papeis'>, papel: Papel): boolean {
  if (isAdmin(ator)) return true;
  return isEquipe(ator) && papel !== 'admin';
}

/** Whether `ator` may give `alvo` role `papel`. */
export const podePromover = (ator: Conta, alvo: Conta, papel: Papel) => podeAgirSobre(ator, alvo) && podeConceder(ator, papel);

/**
 * Whether `ator` may take role `papel` away from `alvo`; `admins` is how many accounts are admins now (the last
 * one stays: someone must be able to manage the roles).
 */
export function podeRebaixar(ator: Conta, alvo: Conta, papel: Papel, admins: number): boolean {
  if (!podeAgirSobre(ator, alvo) || !podeConceder(ator, papel)) return false;
  return !(papel === 'admin' && alvo.papeis.includes('admin') && admins <= 1);
}
