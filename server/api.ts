// The API under /api: accounts (here), maps (mapRoutes.ts), management (gestao.ts) and remote deploy (deploy.ts).
// JSON in and out unless a route says otherwise; every state-changing request must come from this site (Origin
// check) and carries the session cookie, except the deploy routes, which scripts call with a key instead.
// Errors are { erro: code }.
//
// Routes are "METHOD /path"; a segment ":name" matches any one segment and reaches the handler in ctx.params.
// An exact route wins over one with parameters.
import { cleanName, validName } from '@shared/account';
import { asSex } from '@shared/protocol';
import { audit, cancelDeletion, changeName, fullProfile, getAccount, me, requestDeletion, setAppearance, setArsenal, setPet, setSex, setShowcase } from './accounts';
import { discordAvailable, discordCallback, startDiscord, unlinkDiscord } from './auth/discord';
import { login, register, requestReset, resetPassword } from './auth/password';
import { authenticate, clearSessionCookie, revokeSession, type Deps } from './auth/sessions';
import { deployRoutes, isDeployPath } from './deploy';
import { gestaoRoutes } from './gestao';
import { HttpError, json, originAllowed, randomToken, readJson, sha256hex } from './http';
import { mapRoutes } from './mapRoutes';
import { REVOCATION_CHANNEL } from './redis';
import { rolesOf } from './roles';
import { info, reply, requireSession, type Ctx, type Handler } from './route';

/** WebSocket tickets: single use, short-lived. */
export const TICKET_TTL_SECONDS = 30;
export const ticketKey = (ticket: string) => `ws:ticket:${sha256hex(ticket)}`;

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

const accountRoutes: Record<string, Handler> = {
  // Health with the running version (the image's APP_VERSION): the deploy program checks it after each swap.
  'GET /api/saude': async (ctx) => reply(ctx, 200, { status: 'ok', version: process.env.APP_VERSION ?? 'dev' }),

  'GET /api/me': async (ctx) => {
    const s = await requireSession(ctx);
    const [mine, papeis] = await Promise.all([me(ctx.deps.db, s.accountId), rolesOf(ctx.deps.db, s.accountId)]);
    return reply(ctx, 200, { ...mine, papeis });
  },

  'GET /api/auth/provedores': async (ctx) => reply(ctx, 200, { discord: discordAvailable(ctx.req) }),

  'POST /api/auth/cadastro': async (ctx) => {
    const setCookie = await register(ctx.deps, ctx.req, await readJson(ctx.req));
    return reply(ctx, 201, undefined, [setCookie]);
  },

  'POST /api/auth/entrar': async (ctx) => {
    const setCookie = await login(ctx.deps, ctx.req, await readJson(ctx.req));
    return reply(ctx, 204, undefined, [setCookie]);
  },

  'GET /api/auth/discord': async (ctx) => startDiscord(ctx.deps, ctx.req, ctx.url),
  'GET /api/auth/discord/retorno': async (ctx) => discordCallback(ctx.deps, ctx.req, ctx.url),

  'POST /api/auth/sair': async (ctx) => {
    const s = await authenticate(ctx.deps.db, ctx.req);
    if (s) {
      await revokeSession(ctx.deps, s);
      void audit(ctx.deps.db, s.accountId, 'logout', info(ctx.req));
    }
    return reply(ctx, 204, undefined, [clearSessionCookie(ctx.req)]);
  },

  'POST /api/auth/recuperar': async (ctx) => {
    await requestReset(ctx.deps, ctx.req, await readJson(ctx.req));
    return reply(ctx, 204);
  },

  'POST /api/auth/redefinir': async (ctx) => {
    await resetPassword(ctx.deps, ctx.req, await readJson(ctx.req));
    return reply(ctx, 204, undefined, [clearSessionCookie(ctx.req)]);
  },

  'DELETE /api/auth/identidade/discord': async (ctx) => {
    const s = await requireSession(ctx);
    await unlinkDiscord(ctx.deps, ctx.req, s.accountId);
    return reply(ctx, 204);
  },

  'GET /api/perfil': async (ctx) => {
    const s = await requireSession(ctx);
    return reply(ctx, 200, await fullProfile(ctx.deps.db, s.accountId));
  },

  'PATCH /api/perfil': async (ctx) => {
    const s = await requireSession(ctx);
    const body = await readJson(ctx.req);
    if (body.nome !== undefined) {
      const nome = cleanName(body.nome);
      if (!validName(nome)) throw new HttpError(400, 'nome_invalido');
      await changeName(ctx.deps.db, s.accountId, nome, info(ctx.req));
    }
    if (body.sexo !== undefined) await setSex(ctx.deps.db, s.accountId, asSex(body.sexo));
    if (body.aparencia !== undefined) await setAppearance(ctx.deps.db, s.accountId, body.aparencia);
    if (body.arsenal !== undefined) await setArsenal(ctx.deps.db, s.accountId, body.arsenal);
    if (body.destaque !== undefined || body.titulo !== undefined) await setShowcase(ctx.deps.db, s.accountId, body.destaque, body.titulo);
    // The pet (shared/pets.ts: sanitizePet; a pet that does not exist is 400 pet_invalido); every pet is free for now.
    if (body.pet !== undefined) await setPet(ctx.deps.db, s.accountId, body.pet);
    return reply(ctx, 200, await fullProfile(ctx.deps.db, s.accountId));
  },

  'POST /api/ws-ticket': async (ctx) => {
    const s = await requireSession(ctx);
    const account = await getAccount(ctx.deps.db, s.accountId);
    if (account?.status === 'pending_deletion') throw new HttpError(403, 'conta_em_exclusao');
    const ticket = randomToken();
    await ctx.deps.redis.set(ticketKey(ticket), s.accountId, 'EX', TICKET_TTL_SECONDS);
    return reply(ctx, 200, { ticket });
  },

  'DELETE /api/conta': async (ctx) => {
    const s = await requireSession(ctx);
    await requestDeletion(ctx.deps.db, s.accountId);
    void audit(ctx.deps.db, s.accountId, 'delete_request', info(ctx.req));
    // Other devices are signed out; this one stays signed in so the player sees the date and can cancel.
    await ctx.deps.db.query('UPDATE session SET revoked_at = now() WHERE account_id = $1 AND id <> $2 AND revoked_at IS NULL', [s.accountId, s.sessionId]);
    // Live game connections close too: online play is blocked while the deletion is pending.
    await ctx.deps.redis.publish(REVOCATION_CHANNEL, s.accountId);
    return reply(ctx, 204);
  },

  'POST /api/conta/cancelar-exclusao': async (ctx) => {
    const s = await requireSession(ctx);
    await cancelDeletion(ctx.deps.db, s.accountId);
    void audit(ctx.deps.db, s.accountId, 'delete_cancel', info(ctx.req));
    return reply(ctx, 204);
  },
};

interface Route {
  method: string;
  parts: string[];
  handler: Handler;
}

/** The routes with ":name" segments, apart from the exact ones (looked up first). */
function compile(all: Record<string, Handler>) {
  const exact = new Map<string, Handler>();
  const patterns: Route[] = [];
  for (const [key, handler] of Object.entries(all)) {
    if (!key.includes('/:')) exact.set(key, handler);
    else {
      const [method, path] = key.split(' ');
      patterns.push({ method, parts: path.split('/'), handler });
    }
  }
  return { exact, patterns };
}

const ROUTES = compile({ ...accountRoutes, ...mapRoutes, ...gestaoRoutes, ...deployRoutes });

/** The handler of a request and its parameters, or null. */
function route(method: string, path: string): { handler: Handler; params: Record<string, string> } | null {
  const exact = ROUTES.exact.get(`${method} ${path}`);
  if (exact) return { handler: exact, params: {} };
  const parts = path.split('/');
  for (const r of ROUTES.patterns) {
    if (r.method !== method || r.parts.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < parts.length && ok; i++) {
      const want = r.parts[i];
      if (want.startsWith(':')) {
        try {
          params[want.slice(1)] = decodeURIComponent(parts[i]);
        } catch {
          ok = false;
        }
        ok &&= parts[i] !== '';
      } else ok = want === parts[i];
    }
    if (ok) return { handler: r.handler, params };
  }
  return null;
}

/** Answers /api/* requests; returns null for anything else. */
export async function handleApi(deps: Deps, req: Request, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith('/api/')) return null;
  const ctx: Ctx = { deps, req, url, params: {}, cookies: [], session: null };
  try {
    const found = route(req.method, url.pathname);
    if (!found) throw new HttpError(404, 'nao_encontrado');
    // The Origin check guards the session cookie against other sites (CSRF). The deploy routes don't use the
    // cookie: they authenticate with X-Deploy-Key, and their callers (CI, curl) send no Origin at all.
    if (MUTATING.has(req.method) && !isDeployPath(url.pathname) && !originAllowed(req)) throw new HttpError(403, 'origem_invalida');
    ctx.params = found.params;
    return await found.handler(ctx);
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { erro: err.code, ...err.extra }, ctx.cookies.length ? { 'set-cookie': ctx.cookies } : {});
    // Never log the request itself: it may carry cookies or passwords.
    console.error(`[api] ${req.method} ${url.pathname}:`, (err as Error).message);
    return json(500, { erro: 'erro_interno' });
  }
}
