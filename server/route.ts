// What every API route gets (server/api.ts routes the request; the account, map and management routes live in
// api.ts, mapRoutes.ts and gestao.ts): the request, its URL and route parameters, the session once
// required, and the replies with the renewed session cookie.
import { activeBan } from './accounts';
import { authenticate, type AuthSession, type Deps } from './auth/sessions';
import { clientIp, HttpError, json, userAgent, type HeaderMap } from './http';

export interface Ctx {
  deps: Deps;
  req: Request;
  url: URL;
  /** Values of the route's ":name" segments (decoded). */
  params: Record<string, string>;
  /** Set-Cookie headers to add to the response (session renewal). */
  cookies: string[];
  session: AuthSession | null;
}

export type Handler = (ctx: Ctx) => Promise<Response>;

/** The signed-in, not banned, account behind the request (401 or 403 otherwise). */
export async function requireSession(ctx: Ctx): Promise<AuthSession> {
  if (ctx.session) return ctx.session;
  const s = await authenticate(ctx.deps.db, ctx.req);
  if (!s) throw new HttpError(401, 'nao_autorizado');
  if (s.renewed) ctx.cookies.push(s.renewed);
  const ban = await activeBan(ctx.deps.db, s.accountId);
  if (ban) throw new HttpError(403, 'conta_suspensa', { ate: ban.expires_at?.toISOString() ?? null });
  ctx.session = s;
  return s;
}

/** The session when there is one (public routes that answer more to the signed-in), never an error. */
export async function optionalSession(ctx: Ctx): Promise<AuthSession | null> {
  try {
    return await requireSession(ctx);
  } catch (err) {
    if (err instanceof HttpError) return null;
    throw err;
  }
}

export const reply = (ctx: Ctx, status: number, body?: unknown, extraCookies: string[] = [], headers: HeaderMap = {}) => {
  const cookies = [...ctx.cookies, ...extraCookies];
  return json(status, body, cookies.length ? { ...headers, 'set-cookie': cookies } : headers);
};

export const info = (req: Request) => ({ ip: clientIp(req), userAgent: userAgent(req) });
