// The game server as a function (index.ts starts it; tests start their own on a free port): one Bun.serve
// with the account API, static files from dist/, and the WebSocket with the lobby and the game sessions (each
// with its map and game mode).
import type { Server } from 'bun';
import { join, normalize } from 'node:path';
import { CLOSE, NET, sanitizeName, type ClientMsg, type ServerMsg } from '@shared/protocol';
import { DEFAULT_MAP, isMapId, MAPS, type MapId } from '@shared/maps';
import { DEFAULT_GAME_MODE, GAME_MODE_IDS, isGameModeId, modeMaps, type GameModeId } from '@shared/modes';
import { activeBan, chatMutedUntil, emptyDelta, flushProgress, getAccount, loadGameProfile, openParticipation } from './accounts';
import { handleApi, ticketKey } from './api';
import type { Deps } from './auth/sessions';
import { CONFIG } from './config';
import { createDb, migrate } from './db';
import { originAllowed, setPeer } from './http';
import { scheduleJobs } from './jobs';
import { deltaIsEmpty, equip, liveAccount, mergeDelta, progressMsg, type LiveAccount } from './progress';
import { createRedis, MUTE_CHANNEL, REVOCATION_CHANNEL } from './redis';
import { Session, type Conn } from './session';

// Resolves to <repo>/dist both from server/app.ts (dev) and from build/server.js (production).
const DIST = join(import.meta.dir, '..', 'dist');
const MAX_MSGS_PER_SEC = 150;
/** Progress is written at least this often while playing. */
const FLUSH_EVERY_MS = 60_000;
const now = () => performance.now();

/**
 * Id of the permanent session of a map and mode. Mata-mata keeps the ids from before the modes ("principal" from
 * when there was only the street); the other modes are "<mode>-<map>".
 */
export const permanentSessionId = (mode: GameModeId, map: MapId) =>
  mode === 'mata-mata' ? (map === 'rua' ? 'principal' : map) : `${mode}-${map}`;

/** What Bun keeps on each game socket (ws.data), from the handshake on. */
interface Peer {
  /** The account whose ticket opened the socket. */
  account: LiveAccount;
  /** Set when the socket opens. */
  conn: Conn | null;
  /** Token bucket against message floods. */
  bucket: number;
  bucketAt: number;
}

export interface GameServer {
  port: number;
  deps: Deps;
  close(): Promise<void>;
}

interface Options {
  port: number;
  host: string;
  databaseUrl?: string;
  redisUrl?: string;
  /** Housekeeping jobs (partitions, anonymization); off in tests. */
  jobs?: boolean;
}

export async function startServer(opts: Options): Promise<GameServer> {
  const db = createDb(opts.databaseUrl ?? CONFIG.databaseUrl);
  const redis = createRedis(opts.redisUrl ?? CONFIG.redisUrl);
  const sub = createRedis(opts.redisUrl ?? CONFIG.redisUrl);
  const deps: Deps = { db, redis };
  await migrate(db);
  const stopJobs = opts.jobs === false ? () => {} : scheduleJobs(db);

  // --- Lobby ----------------------------------------------------------------------------------------
  const sessions = new Map<string, Session>();
  const conns = new Set<Conn>();
  /** One game connection per account: a new one replaces the old. */
  const byAccount = new Map<string, Conn>();
  let nextId = 1;

  const sessionList = () =>
    [...sessions.values()].map((s) => s.info).sort((a, b) => Number(b.permanent) - Number(a.permanent) || b.players - a.players);
  /** Another session of the same map and mode with room (the one that keeps that pair playable). */
  const otherRoom = (s: Session) => [...sessions.values()].some((o) => o !== s && o.map === s.map && o.mode.id === s.mode.id && !o.full);

  let listDirty = false;
  function sessionsChanged() {
    // Coalesce bursts of joins/leaves into one lobby update.
    if (listDirty) return;
    listDirty = true;
    setTimeout(() => {
      listDirty = false;
      for (const s of [...sessions.values()]) {
        if (s.permanent || s.players.size > 0) continue;
        // An empty session closes, unless it is the room its map and mode have left (see keepRoom).
        if (!otherRoom(s)) continue;
        s.dispose();
        sessions.delete(s.id);
      }
      keepRoom();
      const list = sessionList();
      for (const c of conns) if (!c.session) c.send({ t: 'sessions', list });
    }, 100);
  }

  // Sessions broadcast through Bun's pub/sub; the server exists by the time anyone has joined one.
  const publish = (topic: string, data: string) => void server.publish(topic, data);

  function createSession(name: string, map: MapId, mode: GameModeId, permanentId?: string): Session {
    let id: string;
    do id = Math.random().toString(36).slice(2, 8);
    while (sessions.has(id));
    const s = new Session(permanentId ?? id, name, map, mode, permanentId !== undefined, now, sessionsChanged, publish);
    sessions.set(s.id, s);
    return s;
  }

  /**
   * Every map always has a session with room in every mode played there (modeMaps: zumbi only in its cemetery,
   * which no other mode gets): when
   * all of a map's sessions of a mode are full, another opens ("Nome 2", "Nome 3"…).
   */
  function keepRoom() {
    for (const mode of GAME_MODE_IDS) {
      for (const map of modeMaps(mode)) {
        const same = [...sessions.values()].filter((s) => s.map === map && s.mode.id === mode);
        if (same.some((s) => !s.full)) continue;
        let n = 2;
        while (same.some((s) => s.name === `${MAPS[map].nome} ${n}`)) n++;
        createSession(`${MAPS[map].nome} ${n}`, map, mode);
      }
    }
  }

  // One permanent session per map and mode, named after the map (the list shows the mode beside it).
  for (const mode of GAME_MODE_IDS) for (const map of modeMaps(mode)) createSession(MAPS[map].nome, map, mode, permanentSessionId(mode, map));

  // --- Progress persistence ---------------------------------------------------------------------------
  async function flush(a: LiveAccount, close: boolean) {
    const participation = a.participation;
    if (close) a.participation = null;
    if (deltaIsEmpty(a.delta) && !close) return;
    const d = a.delta;
    a.delta = emptyDelta();
    try {
      const pid = participation ? await participation : null;
      await flushProgress(db, a.profile.profileId, pid, d, close, a.profile.arsenal);
    } catch (err) {
      mergeDelta(a.delta, d);
      console.error('[progresso] gravação falhou, tento de novo no próximo ciclo:', (err as Error).message);
    }
  }

  const flushTimer = setInterval(() => {
    for (const c of conns) if (c.session) void flush(c.account, false);
  }, FLUSH_EVERY_MS);

  function leaveSession(conn: Conn) {
    if (!conn.session) return;
    conn.session.leave(conn);
    return flush(conn.account, true);
  }

  // --- Revocation: logout, password reset, ban or deletion closes the account's game connection; a chat
  // mute (or its removal) is reloaded on the live connection, so it takes effect in a running match ------
  await sub.subscribe(REVOCATION_CHANNEL, MUTE_CHANNEL);
  sub.on('message', (channel, accountId) => {
    const c = byAccount.get(accountId);
    if (!c) return;
    if (channel === REVOCATION_CHANNEL) c.ws.close(CLOSE.revoked, 'sessao encerrada');
    else if (channel === MUTE_CHANNEL)
      chatMutedUntil(db, accountId)
        .then((until) => (c.account.chatMutedUntil = until))
        .catch((err) => console.error('[chat] silêncio:', (err as Error).message));
  });

  // --- Static files from dist/ (production) -------------------------------------------------------------
  async function staticFile(url: URL): Promise<Response> {
    try {
      let path = normalize(decodeURIComponent(url.pathname)).replace(/^([\\/]\.\.)+/, '');
      if (path === '/' || path === '\\') path = '/index.html';
      const wanted = join(DIST, path);
      if (!wanted.startsWith(DIST)) throw new Error('outside');
      // Anything that isn't a file gets the page. Bun.file knows the content type from the extension; set
      // explicitly, it also goes out on HEAD.
      let file = Bun.file(wanted);
      if (!(await file.exists())) file = Bun.file(join(DIST, 'index.html'));
      if (!(await file.exists())) throw new Error('no build');
      return new Response(file, { headers: { 'content-type': file.type } });
    } catch {
      return new Response('Offensive Combat: rode "bun run build" para servir o jogo por aqui, ou use "bun run dev".', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  }

  // --- WebSocket handshake: only with a single-use ticket from POST /api/ws-ticket ----------------------
  const refuse = (status: number) => new Response(null, { status });

  async function upgrade(req: Request, url: URL, server: Server<Peer>): Promise<Response | undefined> {
    // Before the ticket, so a plain GET doesn't spend it.
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return refuse(426);
    if (!originAllowed(req)) return refuse(403);
    const ticket = url.searchParams.get('ticket');
    if (!ticket || ticket.length > 100) return refuse(401);
    // Atomic and single use: a ticket seen in a log is already spent.
    const accountId = await redis.getdel(ticketKey(ticket));
    if (!accountId) return refuse(401);
    const account = await getAccount(db, accountId);
    if (!account || account.status !== 'active' || (await activeBan(db, accountId))) return refuse(403);
    const [profile, mutedUntil] = await Promise.all([loadGameProfile(db, accountId), chatMutedUntil(db, accountId)]);
    const peer: Peer = { account: liveAccount(profile, mutedUntil), conn: null, bucket: MAX_MSGS_PER_SEC, bucketAt: now() };
    return server.upgrade(req, { data: peer }) ? undefined : refuse(400);
  }

  // --- HTTP and WebSocket on one port -------------------------------------------------------------------
  const server = Bun.serve({
    port: opts.port,
    hostname: opts.host,

    async fetch(req, server) {
      setPeer(req, server.requestIP(req)?.address ?? '');
      const url = new URL(req.url);
      if (url.pathname === NET.path) {
        return upgrade(req, url, server).catch((err) => {
          console.error('[ws] handshake:', (err as Error).message);
          return refuse(500);
        });
      }
      // The open sessions, without a game connection (the home shows them before anyone connects).
      if (req.method === 'GET' && url.pathname === '/api/sessoes') return Response.json(sessionList(), { headers: { 'Cache-Control': 'no-store' } });
      return (await handleApi(deps, req, url)) ?? staticFile(url);
    },

    websocket: {
      data: {} as Peer,
      maxPayloadLength: 16 * 1024,

      open(ws) {
        const { account } = ws.data;
        const { profile } = account;
        const conn: Conn = {
          ws,
          id: nextId++,
          name: '',
          sex: profile.sex,
          session: null,
          account,
          send(msg: ServerMsg) {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
          },
        };
        ws.data.conn = conn;
        const previous = byAccount.get(profile.accountId);
        if (previous) previous.ws.close(CLOSE.replaced, 'conta conectada em outro lugar');
        byAccount.set(profile.accountId, conn);
        conns.add(conn);
      },

      message(ws, raw) {
        const peer = ws.data;
        const conn = peer.conn!;
        const { account } = peer;
        const { profile } = account;

        // Token bucket: drop floods instead of processing them.
        const t = now();
        peer.bucket = Math.min(MAX_MSGS_PER_SEC, peer.bucket + ((t - peer.bucketAt) / 1000) * MAX_MSGS_PER_SEC);
        peer.bucketAt = t;
        if (peer.bucket < 1) return;
        peer.bucket--;

        let msg: ClientMsg;
        try {
          msg = JSON.parse(String(raw));
        } catch {
          return;
        }
        if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;

        switch (msg.t) {
          case 'hello': {
            // Name and body come from the account, never from the message.
            conn.name = profile.tag;
            conn.send({ t: 'welcome', id: conn.id, name: conn.name, sessions: sessionList() });
            conn.send(progressMsg(account));
            return;
          }
          case 'list':
            return conn.send({ t: 'sessions', list: sessionList() });
          case 'loadout':
            // The Arsenal is chosen in the lobby, before a match (sessions with a locked loadout refuse it).
            if (conn.session) break;
            equip(account, msg.lo);
            return conn.send(progressMsg(account));
          case 'create':
          case 'join': {
            if (!conn.name) return conn.send({ t: 'error', message: 'Diga olá primeiro.' });
            void leaveSession(conn);
            let s: Session | undefined;
            if (msg.t === 'create') {
              const name = sanitizeName(msg.name, NET.sessionNameMax) || `Sala de ${profile.tag.split('#')[0]}`;
              const mode = isGameModeId(msg.mode) ? msg.mode : DEFAULT_GAME_MODE;
              // A map the mode isn't played on falls back to the first one it is (zumbi: its cemetery; the others: never the cemetery).
              const maps = modeMaps(mode);
              const map = isMapId(msg.map) ? msg.map : DEFAULT_MAP;
              s = createSession(name, maps.includes(map) ? map : maps[0], mode);
            } else {
              s = sessions.get(String(msg.session));
              if (!s) return conn.send({ t: 'error', message: 'Essa sessão não existe mais.' });
              if (s.full) return conn.send({ t: 'error', message: 'Sessão lotada.' });
            }
            s.join(conn);
            account.participation = openParticipation(db, profile.profileId, s.name).catch((err) => {
              console.error('[progresso] participação:', (err as Error).message);
              return null;
            });
            return;
          }
          case 'leave':
            void leaveSession(conn);
            conn.send({ t: 'sessions', list: sessionList() });
            return;
          case 'ping':
            if (!conn.session) return conn.send({ t: 'pong', c: Number(msg.c) || 0, s: now() });
            break;
        }
        conn.session?.handle(conn, msg);
      },

      close(ws) {
        const conn = ws.data.conn;
        if (!conn) return;
        void leaveSession(conn);
        conns.delete(conn);
        if (byAccount.get(conn.account.profile.accountId) === conn) byAccount.delete(conn.account.profile.accountId);
      },
    },
  });

  return {
    port: server.port ?? opts.port,
    deps,
    async close() {
      clearInterval(flushTimer);
      stopJobs();
      // Progress of whoever is still playing is written before the process goes away. Leaving here also
      // keeps the close handlers from writing again once the pool is gone.
      await Promise.all([...conns].map(leaveSession));
      for (const c of conns) c.ws.close(1001, 'servidor reiniciando');
      for (const s of sessions.values()) s.dispose();
      await server.stop();
      sub.disconnect();
      redis.disconnect();
      await db.end();
    },
  };
}
