// The first admin, from the environment (ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD). It runs on every
// start but only acts while there is no admin at all: once someone is admin it never touches accounts again,
// so a changed password or a removed role stays as the staff left it. If the e-mail already has an account,
// that account gets the role and keeps its own password.
import { audit, createAccount, findAccountByEmail } from './accounts';
import { ADMIN_BOOTSTRAP_DEFAULTS, CONFIG } from './config';
import type { Db } from './db';
import { adminCount } from './roles';

export interface AdminBootstrap {
  email: string;
  password: string;
}

const NAME = 'Admin';

const hash = (password: string) => Bun.password.hash(password, { algorithm: 'argon2id', memoryCost: 19456, timeCost: 2 });

/** Makes the bootstrap admin when there is none. Returns the e-mail it made admin, or null if nothing changed. */
export async function bootstrapAdmin(db: Db, opts: AdminBootstrap = CONFIG.adminBootstrap): Promise<string | null> {
  const email = opts.email.trim().toLowerCase();
  if (!email || !opts.password || (await adminCount(db)) > 0) return null;
  const existing = await findAccountByEmail(db, email);
  if (existing?.status === 'deleted') return null;
  const accountId = existing?.id ?? (await createAccount(db, { email, passwordHash: await hash(opts.password), name: NAME, sex: 'm' }));
  await db.query("INSERT INTO account_role (account_id, role) VALUES ($1, 'admin') ON CONFLICT DO NOTHING", [accountId]);
  await audit(db, accountId, 'role_grant', {}, 'admin (bootstrap)');
  if (CONFIG.production && !existing && opts.password === ADMIN_BOOTSTRAP_DEFAULTS.password) {
    console.warn('[servidor] admin inicial criado com a senha padrão: troque a senha ou defina ADMIN_BOOTSTRAP_PASSWORD');
  }
  return email;
}
