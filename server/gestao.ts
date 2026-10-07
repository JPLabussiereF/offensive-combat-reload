// The Management API (/api/gestao, PF-6): admins and moderators find accounts, punish them (ban, chat mute),
// change their name, body, look and progress, and hand out or take away staff roles. Every request reads the
// staff member's roles from the database again (server/roles.ts) and checks the rules of shared/roles.ts:
// a moderator never acts on an admin's account nor makes anyone an admin, nobody punishes themselves, and the
// last admin stays. Every change is in the audit trail with the staff member as its actor.
//
// A change to someone who is playing reaches their running match: a ban closes the game connection
// (REVOCATION_CHANNEL), a mute reloads the chat mute (MUTE_CHANNEL), and name, look and progress reload the
// profile (PROFILE_CHANNEL: the new progress is sent at once; name and look show from the next session).
import { cleanName, TIPOS_SANCAO, validName, type ContaGestao, type ContaResumo, type SancaoInfo, type TipoSancao } from '@shared/account';
import { accountLevel } from '@shared/accountLevel';
import { asSex } from '@shared/protocol';
import { PROG_WEAPONS, type ProgWeapon } from '@shared/progression';
import { isPapel, PAPEIS, podeAgirSobre, podeConceder, podePromover, podePunir, podeRebaixar, type Conta, type Papel } from '@shared/roles';
import { audit, changeName, fullProfile, getAccount, profileOf, setAppearance, setSex, type SanctionType } from './accounts';
import { transaction } from './db';
import { HttpError, readJson } from './http';
import { ban, ModerationError, mute, parseDuration, sanctions, setRole, unban, unmute } from './moderacao';
import { PROFILE_CHANNEL } from './redis';
import { adminCount, requireRole, rolesOf } from './roles';
import { info, reply, type Ctx, type Handler } from './route';

const PAGE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Highest progress a staff member may set (sanity: the account's level is computed from it). */
const MAX_XP = 1_000_000_000;
const REASON_MAX = 200;

const SANCTION_OF: Record<TipoSancao, SanctionType> = { banimento: 'ban', silencio: 'chat_mute' };
const TIPO_OF: Record<string, TipoSancao> = { ban: 'banimento', chat_mute: 'silencio' };

/** The staff member asking (admin or moderator). */
const staff = (ctx: Ctx) => requireRole(ctx, 'admin', 'moderador');

/** The account a route names (:id), as the rules see it; 404 when there is none. */
async function target(ctx: Ctx): Promise<Conta> {
  const id = ctx.params.id;
  if (!UUID.test(id)) throw new HttpError(404, 'nao_encontrado');
  const account = await getAccount(ctx.deps.db, id);
  if (!account || account.status === 'deleted') throw new HttpError(404, 'nao_encontrado');
  return { id, papeis: await rolesOf(ctx.deps.db, id) };
}

const deny = (ok: boolean, extra: Record<string, unknown> = {}) => {
  if (!ok) throw new HttpError(403, 'sem_permissao', extra);
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

interface SummaryRow {
  id: string;
  status: ContaResumo['status'];
  created_at: Date;
  display_name: string;
  discriminator: number;
  xp: string | null;
  papeis: string[];
  banida: boolean;
  silenciada: boolean;
}

const SUMMARY_SQL = `
  SELECT a.id, a.status, a.created_at, p.display_name, p.discriminator, s.xp,
         COALESCE((SELECT array_agg(r.role ORDER BY r.role) FROM account_role r WHERE r.account_id = a.id), '{}') AS papeis,
         EXISTS (SELECT 1 FROM sanction x WHERE x.account_id = a.id AND x.type = 'ban' AND x.revoked_at IS NULL AND x.starts_at <= now() AND (x.expires_at IS NULL OR x.expires_at > now())) AS banida,
         EXISTS (SELECT 1 FROM sanction x WHERE x.account_id = a.id AND x.type = 'chat_mute' AND x.revoked_at IS NULL AND x.starts_at <= now() AND (x.expires_at IS NULL OR x.expires_at > now())) AS silenciada
    FROM account a
    JOIN LATERAL (SELECT id, display_name, discriminator FROM player_profile WHERE account_id = a.id ORDER BY created_at LIMIT 1) p ON true
    LEFT JOIN player_stats s ON s.profile_id = p.id`;

const summary = (r: SummaryRow): ContaResumo => ({
  id: r.id,
  tag: `${r.display_name}#${String(r.discriminator).padStart(4, '0')}`,
  nivel: accountLevel(Number(r.xp ?? 0)).level,
  papeis: r.papeis.filter(isPapel),
  banida: r.banida,
  silenciada: r.silenciada,
  status: r.status,
  criadaEm: r.created_at.toISOString(),
});

/** Tags of the staff members who gave sanctions. */
async function tagsOf(ctx: Ctx, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { rows } = await ctx.deps.db.query<{ account_id: string; display_name: string; discriminator: number }>(
    'SELECT DISTINCT ON (account_id) account_id, display_name, discriminator FROM player_profile WHERE account_id = ANY($1::uuid[]) ORDER BY account_id, created_at',
    [ids],
  );
  return new Map(rows.map((r) => [r.account_id, `${r.display_name}#${String(r.discriminator).padStart(4, '0')}`]));
}

/** Everything the Management screen shows of an account, and what the one asking may do to it. */
async function details(ctx: Ctx, me: Conta, alvo: Conta): Promise<ContaGestao> {
  const db = ctx.deps.db;
  const [{ rows }, profile, hist, admins] = await Promise.all([
    db.query<SummaryRow>(`${SUMMARY_SQL} WHERE a.id = $1`, [alvo.id]),
    fullProfile(db, alvo.id),
    sanctions(ctx.deps, alvo.id),
    adminCount(db),
  ]);
  const by = await tagsOf(ctx, [...new Set(hist.sanctions.flatMap((s) => (s.issued_by ? [s.issued_by] : [])))]);
  const sancoes: SancaoInfo[] = hist.sanctions.map((s) => ({
    tipo: TIPO_OF[s.type] ?? s.type,
    motivo: s.reason,
    inicio: s.starts_at.toISOString(),
    fim: s.expires_at?.toISOString() ?? null,
    revogadaEm: s.revoked_at?.toISOString() ?? null,
    por: s.issued_by ? (by.get(s.issued_by) ?? null) : null,
  }));
  return {
    ...summary(rows[0]),
    nome: profile.nome,
    sexo: profile.sexo,
    aparencia: profile.aparencia,
    xp: profile.xp,
    armas: profile.armas,
    sancoes,
    permissoes: {
      editar: podeAgirSobre(me, alvo),
      punir: podePunir(me, alvo),
      conceder: PAPEIS.filter((p) => !alvo.papeis.includes(p) && podePromover(me, alvo, p)),
      remover: alvo.papeis.filter((p) => podeRebaixar(me, alvo, p, admins)),
    },
  };
}

const int = (v: unknown, field: string) => {
  if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > MAX_XP) throw new HttpError(400, 'json_invalido', { campo: field });
  return v as number;
};

/** Sets the account's progress to the given points (absent: unchanged), in one transaction. */
async function setProgress(ctx: Ctx, accountId: string, xp: number | undefined, armas: Partial<Record<ProgWeapon, number>>) {
  const profile = await profileOf(ctx.deps.db, accountId);
  await transaction(ctx.deps.db, async (c) => {
    if (xp !== undefined) await c.query('UPDATE player_stats SET xp = $2, level = $3, updated_at = now() WHERE profile_id = $1', [profile.id, xp, accountLevel(xp).level]);
    for (const [w, points] of Object.entries(armas)) {
      await c.query(
        `INSERT INTO weapon_progress (profile_id, weapon, xp) VALUES ($1, $2, $3)
         ON CONFLICT (profile_id, weapon) DO UPDATE SET xp = EXCLUDED.xp`,
        [profile.id, w, points],
      );
    }
  });
}

export const gestaoRoutes: Record<string, Handler> = {
  /** Accounts by name or tag (Name#1234), a page at a time. */
  'GET /api/gestao/contas': async (ctx) => {
    await staff(ctx);
    const q = cleanName(ctx.url.searchParams.get('q') ?? '').slice(0, 40);
    const page = Math.max(0, Math.min(1000, Number(ctx.url.searchParams.get('pagina')) || 0));
    const tag = /^(.+)#(\d{1,4})$/.exec(q);
    const where = !q
      ? "a.status <> 'deleted'"
      : tag
        ? "a.status <> 'deleted' AND lower(p.display_name) = lower($1) AND p.discriminator = $2"
        : "a.status <> 'deleted' AND p.display_name ILIKE '%' || $1 || '%'";
    const args: unknown[] = !q ? [] : tag ? [tag[1], Number(tag[2])] : [escapeLike(q)];
    const { rows } = await ctx.deps.db.query<SummaryRow>(`${SUMMARY_SQL} WHERE ${where} ORDER BY lower(p.display_name), p.discriminator LIMIT ${PAGE + 1} OFFSET ${page * PAGE}`, args);
    return reply(ctx, 200, { contas: rows.slice(0, PAGE).map(summary), pagina: page, mais: rows.length > PAGE });
  },

  'GET /api/gestao/contas/:id': async (ctx) => {
    const me = await staff(ctx);
    return reply(ctx, 200, await details(ctx, me, await target(ctx)));
  },

  /** Name (without the waiting time between changes), body, look and progress (account XP and each weapon's points). */
  'PATCH /api/gestao/contas/:id': async (ctx) => {
    const me = await staff(ctx);
    const alvo = await target(ctx);
    deny(podeAgirSobre(me, alvo));
    const body = await readJson(ctx.req);
    const db = ctx.deps.db;
    const changed: string[] = [];
    // Checked before anything is written: a bad field changes nothing.
    let nome: string | undefined;
    if (body.nome !== undefined) {
      nome = cleanName(body.nome);
      if (!validName(nome)) throw new HttpError(400, 'nome_invalido');
    }
    const xp = body.xp === undefined ? undefined : int(body.xp, 'xp');
    const armas: Partial<Record<ProgWeapon, number>> = {};
    if (body.armas !== undefined) {
      if (!body.armas || typeof body.armas !== 'object' || Array.isArray(body.armas)) throw new HttpError(400, 'json_invalido', { campo: 'armas' });
      for (const [w, v] of Object.entries(body.armas)) {
        if (!PROG_WEAPONS.includes(w as ProgWeapon)) throw new HttpError(400, 'json_invalido', { campo: `armas.${w}` });
        armas[w as ProgWeapon] = int(v, `armas.${w}`);
      }
    }
    if (nome !== undefined) {
      await changeName(db, alvo.id, nome, info(ctx.req), me.id);
      changed.push('nome');
    }
    if (body.sexo !== undefined) {
      await setSex(db, alvo.id, asSex(body.sexo));
      changed.push('sexo');
    }
    if (body.aparencia !== undefined) {
      await setAppearance(db, alvo.id, body.aparencia);
      changed.push('aparencia');
    }
    if (xp !== undefined || Object.keys(armas).length) {
      await setProgress(ctx, alvo.id, xp, armas);
      changed.push(...(xp !== undefined ? ['xp'] : []), ...Object.keys(armas).map((w) => `armas.${w}`));
    }
    if (changed.length) {
      void audit(db, alvo.id, 'staff_edit', info(ctx.req), changed.join(', '), me.id);
      await ctx.deps.redis.publish(PROFILE_CHANNEL, alvo.id);
    }
    return reply(ctx, 200, await details(ctx, me, alvo));
  },

  /** { tipo: banimento | silencio, motivo, duracao: "7d" | "12h" | "30m" | "permanente" } */
  'POST /api/gestao/contas/:id/sancoes': async (ctx) => {
    const me = await staff(ctx);
    const alvo = await target(ctx);
    deny(podePunir(me, alvo));
    const body = await readJson(ctx.req);
    const tipo = body.tipo as TipoSancao;
    if (!TIPOS_SANCAO.includes(tipo)) throw new HttpError(400, 'json_invalido', { campo: 'tipo' });
    const motivo = String(body.motivo ?? '').trim().slice(0, REASON_MAX);
    if (!motivo) throw new HttpError(400, 'json_invalido', { campo: 'motivo' });
    const duracao = String(body.duracao ?? '');
    try {
      parseDuration(duracao);
    } catch (err) {
      if (err instanceof ModerationError) throw new HttpError(400, 'json_invalido', { campo: 'duracao' });
      throw err;
    }
    const until = tipo === 'banimento' ? await ban(ctx.deps, alvo.id, motivo, duracao, me.id) : await mute(ctx.deps, alvo.id, motivo, duracao, me.id);
    return reply(ctx, 201, { tipo, ate: until?.toISOString() ?? null });
  },

  'DELETE /api/gestao/contas/:id/sancoes/:tipo': async (ctx) => {
    const me = await staff(ctx);
    const alvo = await target(ctx);
    deny(podePunir(me, alvo));
    const tipo = ctx.params.tipo as TipoSancao;
    if (!TIPOS_SANCAO.includes(tipo)) throw new HttpError(404, 'nao_encontrado');
    const n = SANCTION_OF[tipo] === 'ban' ? await unban(ctx.deps, alvo.id, me.id) : await unmute(ctx.deps, alvo.id, me.id);
    return reply(ctx, 200, { revogadas: n });
  },

  'PUT /api/gestao/contas/:id/papeis/:papel': async (ctx) => {
    const me = await staff(ctx);
    const alvo = await target(ctx);
    const papel = ctx.params.papel;
    if (!isPapel(papel)) throw new HttpError(404, 'nao_encontrado');
    deny(podePromover(me, alvo, papel));
    if (!alvo.papeis.includes(papel)) await setRole(ctx.deps, alvo.id, papel, false, me.id);
    return reply(ctx, 200, { papeis: await rolesOf(ctx.deps.db, alvo.id) });
  },

  'DELETE /api/gestao/contas/:id/papeis/:papel': async (ctx) => {
    const me = await staff(ctx);
    const alvo = await target(ctx);
    const papel = ctx.params.papel as Papel;
    if (!isPapel(papel)) throw new HttpError(404, 'nao_encontrado');
    deny(podeAgirSobre(me, alvo) && podeConceder(me, papel));
    if (alvo.papeis.includes(papel)) {
      // The count and the removal under one lock: two admins removing each other can't both win.
      const removed = await transaction(ctx.deps.db, async (c) => {
        const { rows } = await c.query<{ account_id: string }>(
          "SELECT r.account_id FROM account_role r JOIN account a ON a.id = r.account_id WHERE r.role = 'admin' AND a.status <> 'deleted' FOR UPDATE OF r",
        );
        if (!podeRebaixar(me, alvo, papel, rows.length)) return false;
        await c.query('DELETE FROM account_role WHERE account_id = $1 AND role = $2', [alvo.id, papel]);
        return true;
      });
      deny(removed, { motivo: 'ultimo_admin' });
      void audit(ctx.deps.db, alvo.id, 'role_revoke', info(ctx.req), papel, me.id);
    }
    return reply(ctx, 200, { papeis: await rolesOf(ctx.deps.db, alvo.id) });
  },
};
