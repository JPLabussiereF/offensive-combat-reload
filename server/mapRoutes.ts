// The maps API (/api/mapas, PF-6): the lists (official and community, with search and order), every saved
// version, saving (a new version each time), going back to an older version, hiding, deleting, duplicating, the
// offline plays count, and the GLB models maps use.
//
// Who may do what: anyone signed in creates community maps and duplicates any map they can see; a map's author
// edits, restores and deletes it; the staff (admin, moderator) does all of that to any map, creates and edits the
// official ones and hides maps. Roles are read again on every request (server/roles.ts).
//
// Saving checks the data (validateMapData), the models it names, and builds the map on the map builder thread
// (server/mapWorker.ts): over MAP_BUDGET it isn't saved and the reply says what passed the limit.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { MAP_BUDGET, MAP_FORMAT, validateMapData, type MapaResumo, type MapData, type TipoMapa, type VersaoMapa } from '@shared/mapData';
import { isEquipe, type Conta } from '@shared/roles';
import { audit } from './accounts';
import { CONFIG } from './config';
import { transaction, type Queryable } from './db';
import { checkGlb, GLB_LIMITS, GlbError } from './glb';
import { clientIp, HttpError, readBinary, readJson } from './http';
import { mapBuilder, mapRow, playable, type MapRow } from './maps';
import { hit } from './redis';
import { actor, rolesOf } from './roles';
import { info, optionalSession, reply, requireSession, type Ctx, type Handler } from './route';

const PAGE = 20;
/** A map's JSON (the largest official one is about 170 KB); nginx lets 2 MB through on /api/mapas/. */
const MAP_BODY_MAX = 2 * 1024 * 1024;
/** Uploads per account per hour, and the bytes of models an account may own (provisional values: the plan names the limits, not their numbers). */
export const GLB_UPLOADS_PER_HOUR = 30;
export const GLB_QUOTA_BYTES = 200 * 1024 * 1024;
/** Plays counted per account (or address) and map, in POST /api/mapas/:id/jogadas. */
const PLAY_WINDOW_SECONDS = 3600;

/** Where a map's models may come from: the game's own (public/models) or the ones uploaded here. */
const SHIPPED_MODEL = /^\/models\/[A-Za-z0-9_.-]{1,80}\.glb$/;
const UPLOADED_MODEL = /^\/api\/mapas\/arquivos\/([0-9a-f]{64})\.glb$/;
const ASSET_FILE = /^([0-9a-f]{64})\.glb$/;

const IMMUTABLE = { 'cache-control': 'public, max-age=31536000, immutable' };

// --- Who may do what ----------------------------------------------------------------------------------------

const isAuthor = (m: MapRow, me: Conta | null) => !!me && m.author_id === me.id;
const canSee = (m: MapRow, me: Conta | null) => !m.deleted_at && (!m.hidden_at || isAuthor(m, me) || (!!me && isEquipe(me)));
/** Saving, restoring and deleting: the staff any map, an author their community map. */
const canEdit = (m: MapRow, me: Conta | null) => !!me && !m.deleted_at && (isEquipe(me) || (m.kind === 'community' && isAuthor(m, me)));

/** The map a route names (:id), if the one asking can see it (404 otherwise). */
async function visible(ctx: Ctx, me: Conta | null): Promise<MapRow> {
  const m = await mapRow(ctx.deps.db, ctx.params.id);
  if (!m || m.deleted_at) throw new HttpError(404, 'nao_encontrado');
  if (!canSee(m, me)) throw new HttpError(404, 'mapa_oculto');
  return m;
}

/** The signed-in account with its roles, or null. */
async function viewer(ctx: Ctx): Promise<Conta | null> {
  const s = await optionalSession(ctx);
  return s ? { id: s.accountId, papeis: await rolesOf(ctx.deps.db, s.accountId) } : null;
}

// --- Lists ------------------------------------------------------------------------------------------------

interface SummaryRow extends MapRow {
  cartao: MapaResumo['cartao'] | null;
  display_name: string | null;
  discriminator: number | null;
}

const SUMMARY_SQL = `
  SELECT m.*, v.data->'cartao' AS cartao, p.display_name, p.discriminator
    FROM map m
    JOIN map_version v ON v.map_id = m.id AND v.version = m.current_version
    LEFT JOIN LATERAL (SELECT display_name, discriminator FROM player_profile WHERE account_id = m.author_id ORDER BY created_at LIMIT 1) p ON true`;

const tag = (name: string | null, disc: number | null) => (name === null || disc === null ? null : `${name}#${String(disc).padStart(4, '0')}`);
const tipoOf = (kind: MapRow['kind']): TipoMapa => (kind === 'official' ? 'oficial' : 'comunidade');

function summary(r: SummaryRow, me: Conta | null): MapaResumo {
  return {
    id: r.id,
    tipo: tipoOf(r.kind),
    nome: r.name,
    // The official maps the game ships have no author.
    autor: tag(r.display_name, r.discriminator),
    versao: r.current_version,
    exclusivo: r.exclusive_mode === 'zumbi' ? 'zumbi' : null,
    cartao: r.cartao ?? { emoji: '🗺️', cor: '#dddddd' },
    jogadas: Number(r.play_count),
    copiaDe: r.forked_from,
    criadoEm: r.created_at.toISOString(),
    atualizadoEm: r.updated_at.toISOString(),
    oculto: r.hidden_at ? { em: r.hidden_at.toISOString(), motivo: r.hidden_reason } : null,
    pode: { editar: canEdit(r, me), apagar: canEdit(r, me), ocultar: !!me && isEquipe(me), duplicar: !!me && canSee(r, me) },
  };
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const text = (v: string | null, max: number) => (v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// --- Saving -----------------------------------------------------------------------------------------------

interface Prepared {
  data: MapData;
  drawCalls: number;
  triangulos: number;
  colliders: number;
  navmesh: Uint8Array | null;
  /** The uploaded models it uses. */
  assets: string[];
}

/** Checks a map's data and builds it (the budget, the colliders and a zumbi map's navmesh), or refuses it. */
async function prepare(ctx: Ctx, raw: unknown): Promise<Prepared> {
  const check = validateMapData(raw);
  if (!check.ok) throw new HttpError(400, 'mapa_invalido', { erros: check.erros.slice(0, 50) });
  const data = raw as MapData;
  const erros: string[] = [];
  const assets = new Set<string>();
  data.arquivos.forEach((f, i) => {
    const up = UPLOADED_MODEL.exec(f.url);
    if (up) {
      if (f.sha256 !== undefined && f.sha256 !== up[1]) erros.push(`arquivos[${i}].sha256: não confere com a url`);
      assets.add(up[1]);
    } else if (!SHIPPED_MODEL.test(f.url)) erros.push(`arquivos[${i}].url: um modelo enviado (/api/mapas/arquivos/<sha256>.glb) ou do jogo (/models/...)`);
  });
  if (assets.size) {
    const { rows } = await ctx.deps.db.query<{ sha256: string }>('SELECT sha256 FROM map_asset WHERE sha256 = ANY($1)', [[...assets]]);
    const known = new Set(rows.map((r) => r.sha256));
    for (const a of assets) if (!known.has(a)) erros.push(`arquivos: o modelo ${a.slice(0, 12)}… não foi enviado`);
  }
  if (erros.length) throw new HttpError(400, 'mapa_invalido', { erros });

  const zumbi = data.exclusivo === 'zumbi';
  const built = await mapBuilder.build(data, zumbi);
  if (!built.ok) throw new HttpError(400, 'mapa_invalido', { erros: [`não deu para montar o mapa: ${built.erro}`] });
  if (built.excedeu.length) {
    throw new HttpError(400, 'orcamento_excedido', { drawCalls: built.drawCalls, triangulos: built.triangulos, limite: MAP_BUDGET, excedeu: built.excedeu });
  }
  if (zumbi && !built.navmesh) throw new HttpError(400, 'mapa_invalido', { erros: ['a malha de navegação do modo zumbi não foi gerada'] });
  return { data, drawCalls: built.drawCalls, triangulos: built.triangulos, colliders: built.colliders, navmesh: built.navmesh, assets: [...assets] };
}

async function insertVersion(c: Queryable, id: string, version: number, p: Prepared, by: string) {
  await c.query(
    `INSERT INTO map_version (map_id, version, data, format, draw_calls, triangles, colliders, navmesh, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, version, JSON.stringify(p.data), MAP_FORMAT, p.drawCalls, p.triangulos, p.colliders, p.navmesh ? Buffer.from(p.navmesh) : null, by],
  );
  for (const sha of p.assets) await c.query('INSERT INTO map_version_asset (map_id, version, sha256) VALUES ($1, $2, $3)', [id, version, sha]);
}

/** A new map's id: 10 random lowercase letters and digits. */
const newMapId = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');

/** Writes a new map with its first version; the id is drawn again on the (unlikely) clash. */
async function createMap(ctx: Ctx, kind: MapRow['kind'], p: Prepared, by: string, forkedFrom: string | null = null): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = newMapId();
    const ok = await transaction(ctx.deps.db, async (c) => {
      const ins = await c.query(
        `INSERT INTO map (id, kind, name, author_id, current_version, exclusive_mode, forked_from) VALUES ($1, $2, $3, $4, 1, $5, $6) ON CONFLICT (id) DO NOTHING`,
        [id, kind, p.data.nome, by, p.data.exclusivo ?? null, forkedFrom],
      );
      if (!ins.rowCount) return false;
      await insertVersion(c, id, 1, p, by);
      return true;
    });
    if (ok) return id;
  }
  throw new Error('não achei um id livre para o mapa');
}

const versionParam = (ctx: Ctx) => {
  const v = Number(ctx.params.v);
  if (!Number.isInteger(v) || v < 1 || v > 1_000_000) throw new HttpError(404, 'nao_encontrado');
  return v;
};

export const mapRoutes: Record<string, Handler> = {
  /** ?tipo=oficial|comunidade &q= (name) &autor= (name or tag) &ordem=jogados|recentes &pagina= */
  'GET /api/mapas': async (ctx) => {
    const me = await viewer(ctx);
    const sp = ctx.url.searchParams;
    const where = ['m.deleted_at IS NULL', 'm.hidden_at IS NULL'];
    const args: unknown[] = [];
    const tipo = sp.get('tipo');
    if (tipo === 'oficial' || tipo === 'comunidade') {
      args.push(tipo === 'oficial' ? 'official' : 'community');
      where.push(`m.kind = $${args.length}`);
    }
    const q = text(sp.get('q'), 60);
    if (q) {
      args.push(escapeLike(q));
      where.push(`m.name ILIKE '%' || $${args.length} || '%'`);
    }
    const autor = text(sp.get('autor'), 40);
    if (autor) {
      const t = /^(.+)#(\d{1,4})$/.exec(autor);
      if (t) {
        args.push(t[1], Number(t[2]));
        where.push(`lower(p.display_name) = lower($${args.length - 1}) AND p.discriminator = $${args.length}`);
      } else {
        args.push(escapeLike(autor));
        where.push(`p.display_name ILIKE '%' || $${args.length} || '%'`);
      }
    }
    const order = sp.get('ordem') === 'jogados' ? 'm.play_count DESC, m.updated_at DESC' : 'm.updated_at DESC';
    const page = Math.max(0, Math.min(1000, Number(sp.get('pagina')) || 0));
    const { rows } = await ctx.deps.db.query<SummaryRow>(`${SUMMARY_SQL} WHERE ${where.join(' AND ')} ORDER BY ${order}, m.id LIMIT ${PAGE + 1} OFFSET ${page * PAGE}`, args);
    return reply(ctx, 200, { mapas: rows.slice(0, PAGE).map((r) => summary(r, me)), pagina: page, mais: rows.length > PAGE });
  },

  'GET /api/mapas/:id': async (ctx) => {
    const me = await viewer(ctx);
    const m = await visible(ctx, me);
    const { rows } = await ctx.deps.db.query<SummaryRow>(`${SUMMARY_SQL} WHERE m.id = $1`, [m.id]);
    return reply(ctx, 200, summary(rows[0], me));
  },

  'GET /api/mapas/:id/versoes': async (ctx) => {
    const me = await viewer(ctx);
    const m = await visible(ctx, me);
    const { rows } = await ctx.deps.db.query<{ version: number; created_at: Date; draw_calls: number | null; triangles: number | null; display_name: string | null; discriminator: number | null }>(
      `SELECT v.version, v.created_at, v.draw_calls, v.triangles, p.display_name, p.discriminator
         FROM map_version v
         LEFT JOIN LATERAL (SELECT display_name, discriminator FROM player_profile WHERE account_id = v.created_by ORDER BY created_at LIMIT 1) p ON true
        WHERE v.map_id = $1 ORDER BY v.version DESC`,
      [m.id],
    );
    const versoes: VersaoMapa[] = rows.map((r) => ({
      versao: r.version,
      criadoEm: r.created_at.toISOString(),
      autor: tag(r.display_name, r.discriminator),
      drawCalls: r.draw_calls,
      triangulos: r.triangles,
      atual: r.version === m.current_version,
    }));
    return reply(ctx, 200, { versoes });
  },

  /**
   * A version's data: never changes, so it's cached for good. Any saved version can be fetched (a session
   * still playing a version of a map hidden or deleted since needs it).
   */
  'GET /api/mapas/:id/versoes/:v': async (ctx) => {
    const v = versionParam(ctx);
    const { rows } = await ctx.deps.db.query<{ data: string }>('SELECT data::text AS data FROM map_version WHERE map_id = $1 AND version = $2', [ctx.params.id, v]);
    if (!rows[0]) throw new HttpError(404, 'nao_encontrado');
    return new Response(rows[0].data, { headers: { 'content-type': 'application/json; charset=utf-8', ...IMMUTABLE } });
  },

  /** { tipo: oficial | comunidade, dados }: a new map, its version 1. Official maps only by the staff. */
  'POST /api/mapas': async (ctx) => {
    const me = await actor(ctx);
    const body = await readJson(ctx.req, MAP_BODY_MAX);
    const tipo = body.tipo === 'oficial' ? 'oficial' : body.tipo === 'comunidade' || body.tipo === undefined ? 'comunidade' : null;
    if (!tipo) throw new HttpError(400, 'json_invalido', { campo: 'tipo' });
    if (tipo === 'oficial' && !isEquipe(me)) throw new HttpError(403, 'sem_permissao');
    const p = await prepare(ctx, body.dados);
    const id = await createMap(ctx, tipo === 'oficial' ? 'official' : 'community', p, me.id);
    return reply(ctx, 201, { id, versao: 1, drawCalls: p.drawCalls, triangulos: p.triangulos });
  },

  /** { dados, baseVersao }: a new version, when baseVersao is still the current one (409 otherwise: someone saved meanwhile). */
  'PUT /api/mapas/:id': async (ctx) => {
    const me = await actor(ctx);
    const m = await mapRow(ctx.deps.db, ctx.params.id);
    if (!m || m.deleted_at) throw new HttpError(404, 'nao_encontrado');
    if (!canEdit(m, me)) throw new HttpError(403, 'sem_permissao');
    const body = await readJson(ctx.req, MAP_BODY_MAX);
    const stale = () => new HttpError(409, 'versao_desatualizada', { atual: m.current_version });
    if (body.baseVersao !== m.current_version) throw stale();
    const p = await prepare(ctx, body.dados);
    const versao = await transaction(ctx.deps.db, async (c) => {
      const { rows } = await c.query<{ current_version: number; next: number }>(
        'SELECT current_version, (SELECT max(version) + 1 FROM map_version WHERE map_id = $1) AS next FROM map WHERE id = $1 FOR UPDATE',
        [m.id],
      );
      // Saved by someone else while this one was being built.
      if (rows[0].current_version !== body.baseVersao) throw stale();
      const next = rows[0].next;
      await insertVersion(c, m.id, next, p, me.id);
      await c.query('UPDATE map SET current_version = $2, name = $3, exclusive_mode = $4, updated_at = now() WHERE id = $1', [m.id, next, p.data.nome, p.data.exclusivo ?? null]);
      return next;
    });
    return reply(ctx, 200, { id: m.id, versao, drawCalls: p.drawCalls, triangulos: p.triangulos });
  },

  /** { versao }: plays an older version again (the versions stay as they are; only which one is current changes). */
  'POST /api/mapas/:id/restaurar': async (ctx) => {
    const me = await actor(ctx);
    const m = await mapRow(ctx.deps.db, ctx.params.id);
    if (!m || m.deleted_at) throw new HttpError(404, 'nao_encontrado');
    if (!canEdit(m, me)) throw new HttpError(403, 'sem_permissao');
    const body = await readJson(ctx.req);
    const v = Number(body.versao);
    const { rowCount } = await ctx.deps.db.query(
      `UPDATE map SET current_version = v.version, name = v.data->>'nome', exclusive_mode = v.data->>'exclusivo', updated_at = now()
         FROM map_version v WHERE map.id = $1 AND v.map_id = map.id AND v.version = $2`,
      [m.id, Number.isInteger(v) ? v : -1],
    );
    if (!rowCount) throw new HttpError(404, 'nao_encontrado');
    return reply(ctx, 200, { id: m.id, versao: v });
  },

  /** { motivo? }: off the lists and no new sessions (its author and the staff still see it). */
  'POST /api/mapas/:id/ocultar': async (ctx) => {
    const me = await actor(ctx);
    if (!isEquipe(me)) throw new HttpError(403, 'sem_permissao');
    const m = await mapRow(ctx.deps.db, ctx.params.id);
    if (!m || m.deleted_at) throw new HttpError(404, 'nao_encontrado');
    const body = await readJson(ctx.req);
    const motivo = text(typeof body.motivo === 'string' ? body.motivo : null, 200) || null;
    await ctx.deps.db.query('UPDATE map SET hidden_at = now(), hidden_by = $2, hidden_reason = $3 WHERE id = $1', [m.id, me.id, motivo]);
    void audit(ctx.deps.db, m.author_id, 'map_hide', info(ctx.req), `${m.id}${motivo ? `: ${motivo}` : ''}`, me.id);
    return reply(ctx, 204);
  },

  'DELETE /api/mapas/:id/ocultar': async (ctx) => {
    const me = await actor(ctx);
    if (!isEquipe(me)) throw new HttpError(403, 'sem_permissao');
    const m = await mapRow(ctx.deps.db, ctx.params.id);
    if (!m || m.deleted_at) throw new HttpError(404, 'nao_encontrado');
    await ctx.deps.db.query('UPDATE map SET hidden_at = NULL, hidden_by = NULL, hidden_reason = NULL WHERE id = $1', [m.id]);
    void audit(ctx.deps.db, m.author_id, 'map_unhide', info(ctx.req), m.id, me.id);
    return reply(ctx, 204);
  },

  /** Deleted for good from the lists and from play (the versions stay in the database). */
  'DELETE /api/mapas/:id': async (ctx) => {
    const me = await actor(ctx);
    const m = await mapRow(ctx.deps.db, ctx.params.id);
    if (!m || m.deleted_at) throw new HttpError(404, 'nao_encontrado');
    if (!canEdit(m, me)) throw new HttpError(403, 'sem_permissao');
    await ctx.deps.db.query('UPDATE map SET deleted_at = now() WHERE id = $1', [m.id]);
    if (!isAuthor(m, me)) void audit(ctx.deps.db, m.author_id, 'map_delete', info(ctx.req), m.id, me.id);
    return reply(ctx, 204);
  },

  /** A community copy of the current version, the one asking as its author. */
  'POST /api/mapas/:id/duplicar': async (ctx) => {
    const me = await actor(ctx);
    const m = await visible(ctx, me);
    const { rows } = await ctx.deps.db.query<{ data: MapData; draw_calls: number | null; triangles: number | null; colliders: number | null; navmesh: Buffer | null }>(
      'SELECT data, draw_calls, triangles, colliders, navmesh FROM map_version WHERE map_id = $1 AND version = $2',
      [m.id, m.current_version],
    );
    const v = rows[0];
    const assets = await ctx.deps.db.query<{ sha256: string }>('SELECT sha256 FROM map_version_asset WHERE map_id = $1 AND version = $2', [m.id, m.current_version]);
    const p: Prepared = {
      data: v.data,
      drawCalls: v.draw_calls ?? 0,
      triangulos: v.triangles ?? 0,
      colliders: v.colliders ?? 0,
      navmesh: v.navmesh ? new Uint8Array(v.navmesh) : null,
      assets: assets.rows.map((r) => r.sha256),
    };
    const id = await createMap(ctx, 'community', p, me.id, m.id);
    return reply(ctx, 201, { id, versao: 1 });
  },

  /** A match played offline (training, bots): counted once per account (or address) and map an hour. */
  'POST /api/mapas/:id/jogadas': async (ctx) => {
    const m = await mapRow(ctx.deps.db, ctx.params.id);
    if (!playable(m)) throw new HttpError(404, 'nao_encontrado');
    const s = await optionalSession(ctx);
    const who = s ? `c:${s.accountId}` : `ip:${clientIp(ctx.req)}`;
    const first = await ctx.deps.redis.set(`mapa:jogada:${m.id}:${who}`, '1', 'EX', PLAY_WINDOW_SECONDS, 'NX');
    if (first === 'OK') await ctx.deps.db.query('UPDATE map SET play_count = play_count + 1 WHERE id = $1', [m.id]);
    return reply(ctx, 204);
  },

  /**
   * A GLB model for a map (body: the file, Content-Type model/gltf-binary; ?nome= the original file name).
   * Checked (server/glb.ts) and kept by its SHA-256: the same file sent twice is stored once.
   */
  'POST /api/mapas/arquivos': async (ctx) => {
    const s = await requireSession(ctx);
    if ((ctx.req.headers.get('content-type') ?? '').split(';')[0].trim() !== 'model/gltf-binary') throw new HttpError(400, 'glb_invalido', { motivo: 'envie como model/gltf-binary' });
    if ((await hit(ctx.deps.redis, `mapa:envios:${s.accountId}`, 3600)) > GLB_UPLOADS_PER_HOUR) throw new HttpError(429, 'muitas_tentativas');
    let body: Uint8Array;
    try {
      body = await readBinary(ctx.req, GLB_LIMITS.bytes);
    } catch (err) {
      if (err instanceof HttpError && err.code === 'corpo_grande_demais') throw new HttpError(413, 'arquivo_grande_demais', { limite: GLB_LIMITS.bytes });
      throw err;
    }
    let glb;
    try {
      glb = await checkGlb(body);
    } catch (err) {
      if (err instanceof GlbError) throw new HttpError(400, 'glb_invalido', { motivo: err.message });
      throw err;
    }
    const db = ctx.deps.db;
    const known = await db.query('SELECT 1 FROM map_asset WHERE sha256 = $1', [glb.sha256]);
    if (!known.rowCount) {
      const { rows } = await db.query<{ total: string }>('SELECT COALESCE(sum(bytes), 0) AS total FROM map_asset WHERE owner_id = $1', [s.accountId]);
      if (Number(rows[0].total) + glb.bytes > GLB_QUOTA_BYTES) throw new HttpError(413, 'cota_excedida', { limite: GLB_QUOTA_BYTES });
      await mkdir(CONFIG.mapAssetsDir, { recursive: true });
      const file = Bun.file(join(CONFIG.mapAssetsDir, `${glb.sha256}.glb`));
      if (!(await file.exists())) await Bun.write(file, body);
      const name = text(ctx.url.searchParams.get('nome'), 120) || null;
      await db.query(
        'INSERT INTO map_asset (sha256, owner_id, original_name, bytes, triangles, primitives) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (sha256) DO NOTHING',
        [glb.sha256, s.accountId, name, glb.bytes, glb.triangulos, glb.primitivas],
      );
    }
    return reply(ctx, 201, { sha256: glb.sha256, url: `/api/mapas/arquivos/${glb.sha256}.glb`, bytes: glb.bytes, triangulos: glb.triangulos, primitivas: glb.primitivas });
  },

  /** An uploaded model, by its SHA-256 (never changes: cached for good). */
  'GET /api/mapas/arquivos/:arquivo': async (ctx) => {
    const m = ASSET_FILE.exec(ctx.params.arquivo);
    if (!m) throw new HttpError(404, 'nao_encontrado');
    const known = await ctx.deps.db.query('SELECT 1 FROM map_asset WHERE sha256 = $1', [m[1]]);
    const file = Bun.file(join(CONFIG.mapAssetsDir, `${m[1]}.glb`));
    if (!known.rowCount || !(await file.exists())) throw new HttpError(404, 'nao_encontrado');
    return new Response(file, { headers: { 'content-type': 'model/gltf-binary', 'x-content-type-options': 'nosniff', ...IMMUTABLE } });
  },
};
