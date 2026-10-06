// Staff actions on accounts: bans and chat mutes as sanction history, staff roles, and the audit trail. Run from
// the Management API (server/gestao.ts, with the rules of shared/roles.ts checked there) and from the console
// (tools/admin.ts, which finds the account by its tag). A ban also revokes the account's sessions and closes its
// game connection on every server; a mute reaches the account's running match through Redis (MUTE_CHANNEL).
//
// `by`: the staff member's account id (null: the console).
import { accountByTag, audit, type SanctionType } from './accounts';
import type { Deps } from './auth/sessions';
import { revokeAll } from './auth/sessions';
import { MUTE_CHANNEL } from './redis';

export class ModerationError extends Error {}

/** The account of a tag (Name#1234), for the console. */
export async function resolveTag(deps: Deps, tag: string): Promise<string> {
  const id = await accountByTag(deps.db, tag);
  if (!id) throw new ModerationError(`Conta não encontrada: ${tag}`);
  return id;
}

/** "7d", "12h", "30m" → milliseconds; "permanente" → null. */
export function parseDuration(s: string): number | null {
  if (/^perm/i.test(s)) return null;
  const m = /^(\d+)\s*([dhm])$/i.exec(s.trim());
  if (!m) throw new ModerationError(`Duração inválida: ${s} (use 7d, 12h, 30m ou permanente)`);
  const n = Number(m[1]);
  return n * { d: 86400_000, h: 3600_000, m: 60_000 }[m[2].toLowerCase() as 'd' | 'h' | 'm'];
}

/** Adds a sanction of `type` for `duration` ("7d", "permanente"...); returns when it ends (null: never). */
async function sanction(deps: Deps, accountId: string, type: SanctionType, reason: string, duration: string, by: string | null) {
  const ms = parseDuration(duration);
  const { rows } = await deps.db.query<{ expires_at: Date | null }>(
    `INSERT INTO sanction (account_id, type, reason, issued_by, expires_at)
     VALUES ($1, $2, $3, $4, CASE WHEN $5::bigint IS NULL THEN NULL ELSE now() + ($5::bigint * interval '1 millisecond') END)
     RETURNING expires_at`,
    [accountId, type, reason, by, ms],
  );
  return rows[0].expires_at;
}

/** Revokes the account's active sanctions of `type`; returns how many there were. */
async function lift(deps: Deps, accountId: string, type: SanctionType) {
  const { rowCount } = await deps.db.query(
    `UPDATE sanction SET revoked_at = now()
      WHERE account_id = $1 AND type = $2 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
    [accountId, type],
  );
  return rowCount ?? 0;
}

export async function ban(deps: Deps, accountId: string, reason: string, duration: string, by: string | null = null) {
  const until = await sanction(deps, accountId, 'ban', reason, duration, by);
  await revokeAll(deps, accountId);
  await audit(deps.db, accountId, 'ban', {}, `${reason} (${duration})`, by);
  return until;
}

export async function unban(deps: Deps, accountId: string, by: string | null = null) {
  const n = await lift(deps, accountId, 'ban');
  await audit(deps.db, accountId, 'unban', {}, null, by);
  return n;
}

/** Chat mute: the account keeps playing, its chat lines are dropped (in a running match too). */
export async function mute(deps: Deps, accountId: string, reason: string, duration: string, by: string | null = null) {
  const until = await sanction(deps, accountId, 'chat_mute', reason, duration, by);
  await deps.redis.publish(MUTE_CHANNEL, accountId);
  await audit(deps.db, accountId, 'chat_mute', {}, `${reason} (${duration})`, by);
  return until;
}

export async function unmute(deps: Deps, accountId: string, by: string | null = null) {
  const n = await lift(deps, accountId, 'chat_mute');
  await deps.redis.publish(MUTE_CHANNEL, accountId);
  await audit(deps.db, accountId, 'chat_unmute', {}, null, by);
  return n;
}

export async function setRole(deps: Deps, accountId: string, role: string, remove: boolean, by: string | null = null) {
  const known = await deps.db.query('SELECT 1 FROM role WHERE name = $1', [role]);
  if (!known.rowCount) throw new ModerationError(`Papel desconhecido: ${role} (admin ou moderador)`);
  if (remove) await deps.db.query('DELETE FROM account_role WHERE account_id = $1 AND role = $2', [accountId, role]);
  else await deps.db.query('INSERT INTO account_role (account_id, role, granted_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [accountId, role, by]);
  await audit(deps.db, accountId, remove ? 'role_revoke' : 'role_grant', {}, role, by);
}

export async function sanctions(deps: Deps, accountId: string) {
  const { rows } = await deps.db.query<{ type: string; reason: string; starts_at: Date; expires_at: Date | null; revoked_at: Date | null; issued_by: string | null }>(
    'SELECT type, reason, starts_at, expires_at, revoked_at, issued_by FROM sanction WHERE account_id = $1 ORDER BY starts_at DESC',
    [accountId],
  );
  const roles = await deps.db.query<{ role: string }>('SELECT role FROM account_role WHERE account_id = $1 ORDER BY role', [accountId]);
  return { sanctions: rows, roles: roles.rows.map((r) => r.role) };
}
