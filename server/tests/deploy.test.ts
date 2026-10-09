// Remote deploy (/api/deploy) and the health route (/api/saude): off (no DEPLOY_KEY_HASH) every deploy route is a
// 404; on, the key in X-Deploy-Key is checked against its hash, failures lock the IP out, the body is checked
// (prd takes only final versions, hml release candidates and finals) and a request is saved and queued in Redis for the
// tray program. Callers are scripts: no Origin header and no session, and the other routes still demand Origin.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import type { GameServer } from '../app';
import { CONFIG } from '../config';
import { DEPLOY_KEYS, FAILURE_WINDOW_SECONDS, MAX_KEY_FAILURES, MAX_QUEUE, REQUEST_TTL_SECONDS } from '../deploy';
import { sha256hex } from '../http';
import { startTestServer, uniqueIp } from './helpers';

const KEY = `ocdeploy_${'ab12'.repeat(16)}`;
const WRONG = `ocdeploy_${'cd34'.repeat(16)}`;

let game: GameServer;
const previousHash = CONFIG.deployKeyHash;
beforeAll(async () => {
  game = await startTestServer();
});
afterAll(async () => {
  CONFIG.deployKeyHash = previousHash;
  await game?.close();
});

beforeEach(async () => {
  CONFIG.deployKeyHash = sha256hex(KEY);
  // Only the deploy keys of the test Redis db (the preload already gave this run a fresh one).
  const r = game.deps.redis;
  const keys = [...(await r.keys('deploy:*'))];
  if (keys.length) await r.del(...keys);
});

interface Call {
  key?: string;
  body?: unknown;
  ip?: string;
  origin?: string;
}

/** A request as CI sends it: no Origin, no cookie; its own IP through X-Forwarded-For. */
async function call(method: string, path: string, { key, body, ip = uniqueIp(), origin }: Call = {}) {
  const res = await fetch(`http://127.0.0.1:${game.port}${path}`, {
    method,
    headers: {
      'x-forwarded-for': ip,
      ...(key === undefined ? {} : { 'x-deploy-key': key }),
      ...(origin === undefined ? {} : { origin }),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

const post = (body: unknown, opts: Call = {}) => call('POST', '/api/deploy', { key: KEY, body, ...opts });

describe('deploy desligado', () => {
  it('sem DEPLOY_KEY_HASH as três rotas respondem 404, mesmo com chave', async () => {
    CONFIG.deployKeyHash = '';
    for (const [method, path] of [
      ['POST', '/api/deploy'],
      ['GET', '/api/deploy'],
      ['GET', `/api/deploy/${'a'.repeat(32)}`],
    ]) {
      const r = await call(method, path, { key: KEY, body: method === 'POST' ? { ambiente: 'prd', acao: 'atualizar' } : undefined });
      expect(r.status).toBe(404);
      expect(r.body).toEqual({ erro: 'nao_encontrado' });
    }
    expect(await game.deps.redis.llen(DEPLOY_KEYS.queue)).toBe(0);
  });
});

describe('chave do deploy', () => {
  it('sem chave ou com a chave errada: 401 genérico', async () => {
    const ip = uniqueIp();
    expect(await call('GET', '/api/deploy', { ip })).toMatchObject({ status: 401, body: { erro: 'nao_autorizado' } });
    expect(await call('GET', '/api/deploy', { ip, key: WRONG })).toMatchObject({ status: 401, body: { erro: 'nao_autorizado' } });
    expect(await post({ ambiente: 'prd', acao: 'atualizar' }, { ip, key: '' })).toMatchObject({ status: 401 });
    // The hash isn't the key.
    expect(await call('GET', '/api/deploy', { ip, key: CONFIG.deployKeyHash })).toMatchObject({ status: 401 });
    expect(Number(await game.deps.redis.get(DEPLOY_KEYS.failures(ip)))).toBe(4);
    expect(await game.deps.redis.llen(DEPLOY_KEYS.queue)).toBe(0);
  });

  it('10 falhas na janela bloqueiam o IP (429, mesmo com a chave certa); outro IP segue', async () => {
    const ip = uniqueIp();
    for (let i = 0; i < MAX_KEY_FAILURES; i++) expect((await call('GET', '/api/deploy', { ip, key: WRONG })).status).toBe(401);
    expect(await call('GET', '/api/deploy', { ip, key: KEY })).toMatchObject({ status: 429, body: { erro: 'muitas_tentativas' } });
    expect((await post({ ambiente: 'prd', acao: 'atualizar' }, { ip })).status).toBe(429);
    const ttl = await game.deps.redis.ttl(DEPLOY_KEYS.failures(ip));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(FAILURE_WINDOW_SECONDS);
    expect((await call('GET', '/api/deploy', { key: KEY })).status).toBe(200);
  });
});

describe('POST /api/deploy', () => {
  it('cria o pedido (202) com o JSON do contrato, guarda por 30 dias e põe o id no fim da fila', async () => {
    const ip = uniqueIp();
    await game.deps.redis.rpush(DEPLOY_KEYS.queue, 'f'.repeat(32));
    const r = await post({ ambiente: 'prd', acao: 'atualizar', versao: 'beta-1.4.0' }, { ip });
    expect(r.status).toBe(202);
    expect(Object.keys(r.body)).toEqual(['id', 'ambiente', 'acao', 'versao', 'status', 'criado_em', 'origem_ip', 'mensagem', 'de', 'para', 'iniciado_em', 'terminado_em']);
    expect(r.body).toMatchObject({ ambiente: 'prd', acao: 'atualizar', versao: 'beta-1.4.0', status: 'pendente', origem_ip: ip, mensagem: '', de: null, para: null, iniciado_em: null, terminado_em: null });
    expect(r.body.id).toMatch(/^[0-9a-f]{32}$/);
    expect(new Date(r.body.criado_em).toISOString()).toBe(r.body.criado_em);
    expect(r.headers.get('cache-control')).toBe('no-store');

    const saved = await game.deps.redis.get(DEPLOY_KEYS.request(r.body.id));
    expect(JSON.parse(saved!)).toEqual(r.body);
    const ttl = await game.deps.redis.ttl(DEPLOY_KEYS.request(r.body.id));
    expect(ttl).toBeGreaterThan(REQUEST_TTL_SECONDS - 60);
    expect(ttl).toBeLessThanOrEqual(REQUEST_TTL_SECONDS);
    expect(await game.deps.redis.lrange(DEPLOY_KEYS.queue, 0, -1)).toEqual(['f'.repeat(32), r.body.id]);
  });

  it('sem versão (ou null) vale para atualizar e voltar; hml aceita rc e final', async () => {
    const a = await post({ ambiente: 'hml', acao: 'voltar' });
    expect(a).toMatchObject({ status: 202, body: { ambiente: 'hml', acao: 'voltar', versao: null } });
    const b = await post({ ambiente: 'prd', acao: 'atualizar', versao: null });
    expect(b).toMatchObject({ status: 202, body: { versao: null } });
    const c = await post({ ambiente: 'hml', acao: 'atualizar', versao: 'alpha-0.12.3.rc.004' });
    expect(c).toMatchObject({ status: 202, body: { versao: 'alpha-0.12.3.rc.004' } });
    // Sem rc mais nova, a homologação roda a versão final da produção.
    const d = await post({ ambiente: 'hml', acao: 'atualizar', versao: '1.2.3' });
    expect(d).toMatchObject({ status: 202, body: { versao: '1.2.3' } });
    expect(await game.deps.redis.llen(DEPLOY_KEYS.queue)).toBe(4);
  });

  it('sem Origin passa, e com Origin de outro site também (a chave autentica, não o cookie)', async () => {
    expect((await post({ ambiente: 'prd', acao: 'atualizar' })).status).toBe(202);
    expect((await post({ ambiente: 'prd', acao: 'atualizar' }, { origin: 'https://evil.example' })).status).toBe(202);
  });

  it('prd só aceita versão final: rc é 422', async () => {
    expect(await post({ ambiente: 'prd', acao: 'atualizar', versao: '1.2.3.rc.001' })).toMatchObject({ status: 422, body: { erro: 'versao_incompativel' } });
    expect(await game.deps.redis.llen(DEPLOY_KEYS.queue)).toBe(0);
  });

  it('versão fora do formato: 422', async () => {
    for (const versao of ['v1.2.3', '1.2', '1.2.3.4', 'gamma-1.2.3', '12345.0.0', '1.2.3.rc.1', '1.2.3-rc.001', '', '1'.repeat(41), 123, true, {}])
      expect(await post({ ambiente: 'prd', acao: 'atualizar', versao })).toMatchObject({ status: 422, body: { erro: 'versao_invalida' } });
    expect(await game.deps.redis.llen(DEPLOY_KEYS.queue)).toBe(0);
  });

  it('ambiente ou ação desconhecidos: 422; corpo que não é JSON: 400', async () => {
    expect(await post({ ambiente: 'dev', acao: 'atualizar' })).toMatchObject({ status: 422, body: { erro: 'ambiente_invalido' } });
    expect(await post({ acao: 'atualizar' })).toMatchObject({ status: 422, body: { erro: 'ambiente_invalido' } });
    expect(await post({ ambiente: 'prd', acao: 'apagar' })).toMatchObject({ status: 422, body: { erro: 'acao_invalida' } });
    const res = await fetch(`http://127.0.0.1:${game.port}/api/deploy`, { method: 'POST', headers: { 'x-deploy-key': KEY, 'x-forwarded-for': uniqueIp() }, body: '{nope' });
    expect(res.status).toBe(400);
  });

  it(`fila com ${MAX_QUEUE} pedidos: 429 e nada é criado`, async () => {
    await game.deps.redis.rpush(DEPLOY_KEYS.queue, ...Array.from({ length: MAX_QUEUE }, (_, i) => i.toString(16).padStart(32, '0')));
    expect(await post({ ambiente: 'prd', acao: 'atualizar' })).toMatchObject({ status: 429, body: { erro: 'fila_cheia' } });
    expect(await game.deps.redis.llen(DEPLOY_KEYS.queue)).toBe(MAX_QUEUE);
    expect(await game.deps.redis.keys('deploy:pedido:*')).toEqual([]);
  });
});

describe('GET /api/deploy/:id', () => {
  it('devolve o pedido como está no Redis, com o andamento que o programa da bandeja escreveu', async () => {
    const { body: pedido } = await post({ ambiente: 'prd', acao: 'atualizar', versao: '1.4.0' });
    expect(await call('GET', `/api/deploy/${pedido.id}`, { key: KEY })).toMatchObject({ status: 200, body: pedido });

    // What the tray program does: LPOP, then SET ... KEEPTTL with the progress.
    const r = game.deps.redis;
    expect(await r.lpop(DEPLOY_KEYS.queue)).toBe(pedido.id);
    const running = { ...pedido, status: 'em_andamento', de: '1.3.2', para: '1.4.0', iniciado_em: new Date().toISOString() };
    await r.set(DEPLOY_KEYS.request(pedido.id), JSON.stringify(running), 'KEEPTTL');
    const got = await call('GET', `/api/deploy/${pedido.id}`, { key: KEY });
    expect(got).toMatchObject({ status: 200, body: running });
    expect(got.headers.get('cache-control')).toBe('no-store');
  });

  it('id desconhecido ou fora do formato: 404; sem chave: 401', async () => {
    expect((await call('GET', `/api/deploy/${'0'.repeat(32)}`, { key: KEY })).status).toBe(404);
    expect((await call('GET', `/api/deploy/${'A'.repeat(32)}`, { key: KEY })).status).toBe(404);
    expect((await call('GET', '/api/deploy/123', { key: KEY })).status).toBe(404);
    expect((await call('GET', `/api/deploy/${'0'.repeat(32)}`)).status).toBe(401);
  });
});

describe('GET /api/deploy', () => {
  it('sem deploy:estado: { estado: null }', async () => {
    expect(await call('GET', '/api/deploy', { key: KEY })).toMatchObject({ status: 200, body: { estado: null } });
  });

  it('com deploy:estado: o JSON escrito pelo programa da bandeja, sem mexer', async () => {
    const estado = {
      atualizado_em: '2026-10-08T12:00:00Z',
      operacao: null,
      prd: { ligada: true, versao: '1.3.2', disponivel: '1.4.0', historico: ['1.3.1', '1.3.2'] },
      hml: { ligada: false, versao: null, disponivel: '1.4.0.rc.002', historico: [] },
    };
    await game.deps.redis.set(DEPLOY_KEYS.state, JSON.stringify(estado));
    expect(await call('GET', '/api/deploy', { key: KEY })).toMatchObject({ status: 200, body: estado });
  });
});

describe('isenção de Origin', () => {
  it('só vale para /api/deploy: as outras rotas que mudam estado seguem exigindo Origin', async () => {
    expect(await call('POST', '/api/auth/sair')).toMatchObject({ status: 403, body: { erro: 'origem_invalida' } });
    expect(await call('POST', '/api/auth/sair', { key: KEY })).toMatchObject({ status: 403, body: { erro: 'origem_invalida' } });
  });
});

describe('GET /api/saude', () => {
  it('responde sem autenticação, com a versão e sem cache (ligado ou não o deploy)', async () => {
    for (const hash of [sha256hex(KEY), '']) {
      CONFIG.deployKeyHash = hash;
      const r = await call('GET', '/api/saude');
      expect(r).toMatchObject({ status: 200, body: { status: 'ok', version: process.env.APP_VERSION ?? 'dev' } });
      expect(r.headers.get('cache-control')).toBe('no-store');
    }
  });
});
