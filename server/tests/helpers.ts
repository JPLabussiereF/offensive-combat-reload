// Test helpers: a real game server on a free port, and a tiny browser (cookie jar + Origin header +
// its own IP through X-Forwarded-For, so per-IP limits don't leak between tests).
import { MAP_FORMAT, type MapData } from '@shared/mapData';
import type { GameModeId } from '@shared/modes';
import type { ProgWeapon } from '@shared/progression';
import type { ServerMsg } from '@shared/protocol';
import type { Papel } from '@shared/roles';
import { accountByTag } from '../accounts';
import { startServer, type GameServer } from '../app';
import { TEST_DATABASE_URL, TEST_REDIS_URL } from './env';

const wsUrl = (game: GameServer, ticket: string) => `ws://127.0.0.1:${game.port}/ws?ticket=${encodeURIComponent(ticket)}`;

export const startTestServer = () => startServer({ port: 0, host: '127.0.0.1', databaseUrl: TEST_DATABASE_URL, redisUrl: TEST_REDIS_URL, jobs: false, adminBootstrap: false });

let ipCounter = 1;
let emailCounter = 1;
export const uniqueEmail = () => `jogador${Date.now()}_${emailCounter++}@teste.com`;
export const uniqueIp = () => `10.9.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

export class Browser {
  cookies = new Map<string, string>();
  ip = uniqueIp();
  origin: string;

  constructor(
    readonly game: GameServer,
    origin?: string,
  ) {
    this.origin = origin ?? `http://127.0.0.1:${game.port}`;
  }

  get base() {
    return `http://127.0.0.1:${this.game.port}`;
  }

  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(this.base + path, {
      method,
      redirect: 'manual',
      headers: {
        origin: this.origin,
        'x-forwarded-for': this.ip,
        ...(this.cookies.size ? { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (!value || /Max-Age=0/.test(c)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  }

  async register(name = 'Testador', password = 'senha-boa-123') {
    const email = uniqueEmail();
    const r = await this.req('POST', '/api/auth/cadastro', { email, senha: password, nome: name });
    if (r.status !== 201) throw new Error(`cadastro falhou: ${r.status} ${JSON.stringify(r.body)}`);
    return { email, password };
  }

  async ticket(): Promise<string> {
    const r = await this.req('POST', '/api/ws-ticket');
    if (r.status !== 200) throw new Error(`ticket falhou: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.ticket;
  }
}

/** A game connection that records every message. */
export class Player {
  msgs: ServerMsg[] = [];
  closed: { code: number } | null = null;
  private waiters: { match: (m: ServerMsg) => boolean; claim: () => void; resolve: (m: ServerMsg) => void }[] = [];

  private constructor(readonly ws: WebSocket) {
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(String(ev.data)) as ServerMsg;
      // One message answers one waiter (the oldest that wants it); taken now, so no other waiter gets it.
      const w = this.waiters.find((x) => x.match(m));
      if (!w) {
        this.msgs.push(m);
        return;
      }
      this.waiters.splice(this.waiters.indexOf(w), 1);
      w.claim();
      // Delivered on the next task, out of this message event: Bun's client WebSocket garbles its frames
      // when a test sends from inside the event while snapshots keep arriving (the server closes it, 1002).
      setTimeout(() => w.resolve(m), 0);
    });
    ws.addEventListener('close', (ev) => (this.closed = { code: ev.code }));
  }

  static connect(game: GameServer, ticket: string, origin = `http://127.0.0.1:${game.port}`): Promise<Player> {
    return new Promise((resolve, reject) => {
      // Bun's WebSocket takes extra handshake headers; a browser sends Origin by itself.
      const ws = new WebSocket(wsUrl(game, ticket), { headers: { origin } });
      const p = new Player(ws);
      ws.addEventListener('open', () => resolve(p), { once: true });
      ws.addEventListener('close', (ev) => reject(new Error(`recusado: ${ev.code} ${ev.reason}`)), { once: true });
    });
  }

  /**
   * HTTP status of a handshake the server refuses. A WebSocket never sees it (it only reports close code
   * 1002), so this sends the upgrade request itself.
   */
  static async refusal(game: GameServer, ticket: string, origin = `http://127.0.0.1:${game.port}`): Promise<number> {
    const res = await fetch(wsUrl(game, ticket).replace(/^ws:/, 'http:'), {
      headers: { origin, connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': btoa('offensive-combat') },
    });
    return res.status;
  }

  send(msg: object) {
    this.ws.send(JSON.stringify(msg));
  }

  next<T extends ServerMsg['t']>(t: T, match: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true, timeout = 5000): Promise<Extract<ServerMsg, { t: T }>> {
    const found = this.msgs.find((m) => m.t === t && match(m as Extract<ServerMsg, { t: T }>));
    if (found) {
      this.msgs.splice(this.msgs.indexOf(found), 1);
      return Promise.resolve(found as Extract<ServerMsg, { t: T }>);
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        match: (m: ServerMsg) => m.t === t && match(m as Extract<ServerMsg, { t: T }>),
        claim: () => clearTimeout(timer),
        resolve: (m: ServerMsg) => resolve(m as Extract<ServerMsg, { t: T }>),
      };
      // A waiter that timed out goes away: it must not take a later message from the ones still waiting.
      const timer = setTimeout(() => {
        const i = this.waiters.indexOf(waiter);
        if (i >= 0) this.waiters.splice(i, 1);
        // What did come meanwhile (the last few types): tells a slow server from a message that never comes.
        const seen = this.msgs.slice(-8).map((m) => m.t).join(', ') || 'nenhuma';
        reject(new Error(`sem mensagem ${t} em ${timeout} ms (últimas: ${seen})`));
      }, timeout);
      this.waiters.push(waiter);
    });
  }

  waitClose(timeout = 5000): Promise<number> {
    if (this.closed) return Promise.resolve(this.closed.code);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('conexão não fechou')), timeout);
      this.ws.addEventListener(
        'close',
        (ev) => {
          clearTimeout(timer);
          resolve(ev.code);
        },
        { once: true },
      );
    });
  }

  close() {
    this.ws.close();
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Weapon points written straight into a signed-in account's progress (a veteran, as if earned before). The game
 * server reads them on the next game connection.
 */
export async function setWeaponXp(b: Browser, xp: Partial<Record<ProgWeapon, number>>) {
  const tag = (await b.req('GET', '/api/perfil')).body.tag as string;
  const [name, disc] = tag.split('#');
  for (const [weapon, points] of Object.entries(xp)) {
    await b.game.deps.db.query(
      `UPDATE weapon_progress SET xp = $3 WHERE weapon = $4 AND profile_id = (SELECT id FROM player_profile WHERE display_name = $1 AND discriminator = $2)`,
      [name, Number(disc), points, weapon],
    );
  }
}

/**
 * Plays `map` in `mode` (sessions open on demand: a session of the map with room, or a new one) and waits until
 * the player is in.
 */
export async function enterMap(p: Player, map: string, mode: GameModeId = 'mata-mata') {
  p.send({ t: 'play', map, mode });
  return p.next('joined');
}

/** The account id behind a signed-in browser. */
export async function accountOf(b: Browser): Promise<string> {
  const tag = (await b.req('GET', '/api/perfil')).body.tag as string;
  return (await accountByTag(b.game.deps.db, tag))!;
}

/** Gives a signed-in account a staff role straight in the database (as the console would: the first admin comes from there). */
export async function promote(b: Browser, papel: Papel) {
  await b.game.deps.db.query('INSERT INTO account_role (account_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING', [await accountOf(b), papel]);
}

/** A small valid map (a floor and a car, the three spawn lists) for the map tests to change. */
export function tinyMap(nome = 'Mapa de teste'): MapData {
  return {
    formato: MAP_FORMAT,
    nome,
    cartao: { emoji: '🧪', cor: '#aabbcc' },
    ambiente: { ceu: {}, celula: 40, killY: -20 },
    pecas: [
      { id: 'chao', tipo: 'caixa', p: [0, -0.5, 0], params: { tamanho: [40, 1, 40], superficie: 'grama' } },
      { id: 'carro', tipo: 'carro', p: [2, 0, 3], yaw: 0.5, params: { cor: 0xd8342a } },
    ],
    arquivos: [],
    spawns: { a: [{ p: [-10, 0.2, 0], yaw: 0 }], b: [{ p: [10, 0.2, 0], yaw: 0 }], ffa: [{ p: [0, 0.2, 10], yaw: 0 }] },
    bonecos: [],
    objetos: { coletaveis: [], bruxa: null, ratos: [], peixes: [] },
  };
}
