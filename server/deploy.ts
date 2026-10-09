// Remote deploy (/api/deploy): CI or an operator asks for a new version (or a rollback) of prd or hml. This route
// only checks and queues the request in Redis; the tray program on the Windows host (the one that runs the
// Docker stack) reads the queue every ~15 s through `redis-cli`, does the work (backup, build, swap) and writes
// the progress back. Nothing here talks to Docker or to the host.
//
// Auth is a per-project key in X-Deploy-Key (`ocdeploy_<64 hex>`): the server only knows its SHA-256
// (DEPLOY_KEY_HASH), and with no hash configured every route here answers 404, as if it didn't exist. Callers
// are scripts, not browsers: no session cookie, no Origin (server/api.ts skips its Origin check for this prefix).
// Neither the key nor the hash is ever logged.
import { timingSafeEqual } from 'node:crypto';
import { CONFIG } from './config';
import { clientIp, HttpError, readJson, sha256 } from './http';
import { hit } from './redis';
import { reply, type Ctx, type Handler } from './route';

export const DEPLOY_PREFIX = '/api/deploy';

/** The deploy routes skip the Origin check: they authenticate with the key, not with a cookie. */
export const isDeployPath = (path: string) => path === DEPLOY_PREFIX || path.startsWith(`${DEPLOY_PREFIX}/`);

/** Redis keys shared with the tray program (same names in the TryBest backend). */
export const DEPLOY_KEYS = {
  queue: 'deploy:fila',
  request: (id: string) => `deploy:pedido:${id}`,
  state: 'deploy:estado',
  failures: (ip: string) => `deploy:falhas:${ip}`,
};

/** Key failures per IP within the window; from this many on the IP gets 429, even with the right key. */
export const MAX_KEY_FAILURES = 10;
export const FAILURE_WINDOW_SECONDS = 15 * 60;
/** Requests waiting in the queue; one more gets 429. */
export const MAX_QUEUE = 20;
/** A request is kept for 30 days. */
export const REQUEST_TTL_SECONDS = 30 * 24 * 3600;

/** A release tag: "1.2.3", "alpha-1.2.3", "beta-1.2.3.rc.001"... (rc = release candidate, never on prd). */
const VERSION = /^(?:(alpha|beta)-)?\d{1,4}\.\d{1,4}\.\d{1,4}(?:\.rc\.\d{3})?$/;
const VERSION_MAX = 40;
const REQUEST_ID = /^[0-9a-f]{32}$/;
const ENVIRONMENTS = new Set(['prd', 'hml']);
const ACTIONS = new Set(['atualizar', 'voltar']);

/** The request as kept in Redis and answered; the tray program fills in status, mensagem, de, para and the times. */
export interface DeployRequest {
  id: string;
  ambiente: 'prd' | 'hml';
  acao: 'atualizar' | 'voltar';
  versao: string | null;
  status: 'pendente' | 'em_andamento' | 'concluido' | 'falhou' | 'revertido';
  criado_em: string;
  origem_ip: string;
  mensagem: string;
  de: string | null;
  para: string | null;
  iniciado_em: string | null;
  terminado_em: string | null;
}

/** Does the key's SHA-256 match the configured hash? Constant time over the two digests. */
function keyMatches(key: string, hashHex: string): boolean {
  const want = Buffer.from(hashHex.trim().toLowerCase(), 'hex');
  const got = new Uint8Array(sha256(key));
  // The hash's length isn't secret (a malformed DEPLOY_KEY_HASH just never matches).
  return want.length === got.length && timingSafeEqual(got, want);
}

/** 404 while the feature is off; 429 for an IP with too many key failures; 401 for a missing or wrong key. */
async function requireDeployKey(ctx: Ctx): Promise<void> {
  const hash = CONFIG.deployKeyHash;
  if (!hash) throw new HttpError(404, 'nao_encontrado');
  const failures = DEPLOY_KEYS.failures(clientIp(ctx.req));
  if (Number(await ctx.deps.redis.get(failures)) >= MAX_KEY_FAILURES) throw new HttpError(429, 'muitas_tentativas');
  const key = ctx.req.headers.get('x-deploy-key') ?? '';
  if (key && keyMatches(key, hash)) return;
  await hit(ctx.deps.redis, failures, FAILURE_WINDOW_SECONDS);
  throw new HttpError(401, 'nao_autorizado');
}

/**
 * The body's version: null when absent, else a valid tag that fits the environment. prd takes final versions
 * only; hml takes release candidates and, while there's no newer rc, final versions too (it then runs prd's).
 */
function versionFor(ambiente: string, versao: unknown): string | null {
  if (versao === undefined || versao === null) return null;
  if (typeof versao !== 'string' || versao.length > VERSION_MAX || !VERSION.test(versao)) throw new HttpError(422, 'versao_invalida');
  if (ambiente === 'prd' && versao.includes('.rc.')) throw new HttpError(422, 'versao_incompativel');
  return versao;
}

export const deployRoutes: Record<string, Handler> = {
  // Queues a request; 202 with it as it was saved.
  'POST /api/deploy': async (ctx) => {
    await requireDeployKey(ctx);
    const body = await readJson(ctx.req);
    const { ambiente, acao } = body;
    if (typeof ambiente !== 'string' || !ENVIRONMENTS.has(ambiente)) throw new HttpError(422, 'ambiente_invalido');
    if (typeof acao !== 'string' || !ACTIONS.has(acao)) throw new HttpError(422, 'acao_invalida');
    const versao = versionFor(ambiente, body.versao);
    // Checked, not reserved: two requests at the same moment may take the queue one past the limit.
    if ((await ctx.deps.redis.llen(DEPLOY_KEYS.queue)) >= MAX_QUEUE) throw new HttpError(429, 'fila_cheia');
    const pedido: DeployRequest = {
      id: crypto.randomUUID().replaceAll('-', ''),
      ambiente: ambiente as DeployRequest['ambiente'],
      acao: acao as DeployRequest['acao'],
      versao,
      status: 'pendente',
      criado_em: new Date().toISOString(),
      origem_ip: clientIp(ctx.req),
      mensagem: '',
      de: null,
      para: null,
      iniciado_em: null,
      terminado_em: null,
    };
    // The request exists before its id is in the queue (the tray program reads it right after LPOP).
    await ctx.deps.redis
      .multi()
      .set(DEPLOY_KEYS.request(pedido.id), JSON.stringify(pedido), 'EX', REQUEST_TTL_SECONDS)
      .rpush(DEPLOY_KEYS.queue, pedido.id)
      .exec();
    return reply(ctx, 202, pedido);
  },

  // The deploy state the tray program last wrote (environments on or off, versions, history), as it is.
  'GET /api/deploy': async (ctx) => {
    await requireDeployKey(ctx);
    const state = await ctx.deps.redis.get(DEPLOY_KEYS.state);
    return reply(ctx, 200, state === null ? { estado: null } : JSON.parse(state));
  },

  // One request, with the progress the tray program wrote into it.
  'GET /api/deploy/:id': async (ctx) => {
    await requireDeployKey(ctx);
    const id = ctx.params.id;
    if (!REQUEST_ID.test(id)) throw new HttpError(404, 'nao_encontrado');
    const pedido = await ctx.deps.redis.get(DEPLOY_KEYS.request(id));
    if (pedido === null) throw new HttpError(404, 'nao_encontrado');
    return reply(ctx, 200, JSON.parse(pedido));
  },
};
