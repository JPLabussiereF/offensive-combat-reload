// The game server as a function (index.ts starts it; tests start their own on a free port): one Bun.serve
// with the API, static files from dist/, and the WebSocket with the lobby and the game sessions (each with one
// saved version of its map and a game mode).
//
// Sessions open on demand (PF-6): 'play' joins a session of the map's current version with room or opens one,
// 'create' opens a named one, and any session closes once nobody is in it. A session keeps the version it opened
// with to the end; players who come after a save get the new one.
import type { Server } from 'bun';
import { join, normalize } from 'node:path';
import { CLOSE, NET, sanitizeName, type ClientMsg, type ServerMsg } from '@shared/protocol';
import { isMapId } from '@shared/maps';
import { DEFAULT_GAME_MODE, isGameModeId, type GameModeId } from '@shared/modes';
import { PROG_WEAPONS } from '@shared/progression';
import { activeBan, chatMutedUntil, emptyDelta, flushProgress, getAccount, loadGameProfile, openParticipation } from './accounts';
import { handleApi, ticketKey } from './api';
import type { Deps } from './auth/sessions';
import { bootstrapAdmin, type AdminBootstrap } from './bootstrapAdmin';
import { CONFIG } from './config';
import { createDb, migrate } from './db';
import { originAllowed, setPeer } from './http';
import { scheduleJobs } from './jobs';
import { deltaIsEmpty, equip, liveAccount, mergeDelta, progressMsg, type LiveAccount } from './progress';
import { allows, defaultMapFor, mapBuilder, mapRow, MapStore, playable, seedOfficialMaps, type MapRow, type MapRuntime } from './maps';
import { createRedis, MUTE_CHANNEL, PROFILE_CHANNEL, REVOCATION_CHANNEL } from './redis';
import { Session, type Conn } from './session';

// Resolves to <repo>/dist both from server/app.ts (dev) and from build/server.js (production).
const DIST = join(import.meta.dir, '..', 'dist');
const MAX_MSGS_PER_SEC = 150;
/** Progress is written at least this often while playing. */
const FLUSH_EVERY_MS = 60_000;
const now = () => performance.now();

/** Why a 'play', 'create' or 'join' was refused, for the player. */
class EnterError extends Error {}

/** What Bun keeps on each game socket (ws.data), from the handshake on. */
interface Peer {
  /** The account whose ticket opened the socket. */
  account: LiveAccount;
  /** Set when the socket opens. */
  conn: Conn | null;
  /** Token bucket against message floods. */
  bucket: number;
  bucketAt: number;
  /** A 'play', 'create' or 'join' is being answered (they need the database): others wait for it. */
  entering: boolean;
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
  /** The first admin while there is none (CONFIG.adminBootstrap by default); false skips it (tests). */
  adminBootstrap?: AdminBootstrap | false;
}

export async function startServer(opts: Options): Promise<GameServer> {
  const db = createDb(opts.databaseUrl ?? CONFIG.databaseUrl);
  const redis = createRedis(opts.redisUrl ?? CONFIG.redisUrl);
  const sub = createRedis(opts.redisUrl ?? CONFIG.redisUrl);
  const deps: Deps = { db, redis };
  await migrate(db);
  if (opts.adminBootstrap !== false) {
    const admin = await bootstrapAdmin(db, opts.adminBootstrap);
    if (admin) console.log(`[servidor] admin inicial: ${admin}`);
  }
  await seedOfficialMaps(db, mapBuilder);
  const maps = new MapStore(db);
  const stopJobs = opts.jobs === false ? () => {} : scheduleJobs(db);

  // --- Lobby ----------------------------------------------------------------------------------------
  const sessions = new Map<string, Session>();
  const conns = new Set<Conn>();
  /** One game connection per account: a new one replaces the old. */
  const byAccount = new Map<string, Conn>();
  /** Sessions being opened, by "map@version|mode": players asking at the same moment get the same one. */
  const opening = new Map<string, Promise<Session>>();
  /** The accounts each session already counted as a play of its map (play_count goes up once per account and session). */
  const counted = new WeakMap<Session, Set<string>>();
  let nextId = 1;

  const sessionList = () => [...sessions.values()].map((s) => s.info).sort((a, b) => b.players - a.players || a.name.localeCompare(b.name));

  let listDirty = false;
  function sessionsChanged() {
    // Coalesce bursts of joins/leaves into one lobby update.
    if (listDirty) return;
    listDirty = true;
    setTimeout(() => {
      listDirty = false;
      // Every session closes once nobody is in it.
      for (const s of [...sessions.values()]) {
        if (s.players.size > 0) continue;
        s.dispose();
        sessions.delete(s.id);
      }
      const list = sessionList();
      for (const c of conns) if (!c.session) c.send({ t: 'sessions', list });
    }, 100);
  }

  // Sessions broadcast through Bun's pub/sub; the server exists by the time anyone has joined one.
  const publish = (topic: string, data: string) => void server.publish(topic, data);

  function createSession(name: string, map: MapRuntime, mode: GameModeId): Session {
    let id: string;
    do id = Math.random().toString(36).slice(2, 8);
    while (sessions.has(id));
    const s = new Session(id, name, map, mode, now, sessionsChanged, publish);
    sessions.set(s.id, s);
    return s;
  }

  /** The map's name for its first session of a mode, then "Name 2", "Name 3"... */
  function nameFor(map: MapRuntime, mode: GameModeId) {
    const taken = new Set([...sessions.values()].filter((s) => s.map === map.id && s.mode.id === mode).map((s) => s.name));
    if (!taken.has(map.nome)) return map.nome;
    let n = 2;
    while (taken.has(`${map.nome} ${n}`)) n++;
    return `${map.nome} ${n}`;
  }

  /** A session of the map's current version and the mode with room, opened if there is none. */
  async function sessionFor(row: MapRow, mode: GameModeId): Promise<Session> {
    for (let tries = 0; tries < 5; tries++) {
      const room = [...sessions.values()].find((s) => s.map === row.id && s.mapa.versao === row.current_version && s.mode.id === mode && !s.full);
      if (room) return room;
      const key = `${row.id}@${row.current_version}|${mode}`;
      let p = opening.get(key);
      if (!p) {
        p = maps.runtime(row.id, row.current_version).then((map) => createSession(nameFor(map, mode), map, mode));
        opening.set(key, p);
        const done = () => opening.delete(key);
        p.then(done, done);
      }
      const s = await p;
      if (!s.full && sessions.has(s.id)) return s;
    }
    throw new EnterError('Sessão lotada.');
  }

  /** Answers 'play', 'create' and 'join': finds or opens the session, then puts the player in it. */
  async function enter(conn: Conn, msg: Extract<ClientMsg, { t: 'play' | 'create' | 'join' }>) {
    const { profile } = conn.account;
    let s: Session | undefined;
    if (msg.t === 'join') {
      s = sessions.get(String(msg.session));
      if (!s) throw new EnterError('Essa sessão não existe mais.');
    } else if (msg.t === 'play') {
      const mode = isGameModeId(msg.mode) ? msg.mode : DEFAULT_GAME_MODE;
      const row = isMapId(msg.map) ? await mapRow(db, msg.map) : null;
      // Hidden or deleted maps open no new session (the ones already playing go on).
      if (!playable(row)) throw new EnterError('Esse mapa não está disponível.');
      if (!allows(row, mode)) throw new EnterError('Esse modo não é jogado nesse mapa.');
      s = await sessionFor(row, mode);
    } else {
      const name = sanitizeName(msg.name, NET.sessionNameMax) || `Sala de ${profile.tag.split('#')[0]}`;
      const mode = isGameModeId(msg.mode) ? msg.mode : DEFAULT_GAME_MODE;
      // A map that isn't there, or where the mode isn't played, falls back to the mode's first official map.
      let row = isMapId(msg.map) ? await mapRow(db, msg.map) : null;
      if (!playable(row) || !allows(row, mode)) row = await defaultMapFor(db, mode);
      if (!row) throw new EnterError('Nenhum mapa disponível para esse modo.');
      s = createSession(name, await maps.runtime(row.id, row.current_version), mode);
    }
    // Gone while the database answered: an empty session it may have opened closes with the next check.
    if (conn.ws.readyState !== WebSocket.OPEN) return sessionsChanged();
    if (s.full) {
      sessionsChanged();
      throw new EnterError('Sessão lotada.');
    }
    void leaveSession(conn);
    s.join(conn);
    const account = conn.account;
    account.participation = openParticipation(db, profile.profileId, s.name, s.map).catch((err) => {
      console.error('[progresso] participação:', (err as Error).message);
      return null;
    });
    let seen = counted.get(s);
    if (!seen) counted.set(s, (seen = new Set()));
    if (!seen.has(profile.accountId)) {
      seen.add(profile.accountId);
      db.query('UPDATE map SET play_count = play_count + 1 WHERE id = $1', [s.map]).catch((err) => console.error('[mapas] jogadas:', (err as Error).message));
    }
  }

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
  // mute (or its removal) is reloaded on the live connection, so it takes effect in a running match; a staff
  // member's change of name, look or progress reloads the profile (progress at once, the rest next session) --
  await sub.subscribe(REVOCATION_CHANNEL, MUTE_CHANNEL, PROFILE_CHANNEL);
  sub.on('message', (channel, accountId) => {
    const c = byAccount.get(accountId);
    if (!c) return;
    if (channel === REVOCATION_CHANNEL) c.ws.close(CLOSE.revoked, 'sessao encerrada');
    else if (channel === MUTE_CHANNEL)
      chatMutedUntil(db, accountId)
        .then((until) => (c.account.chatMutedUntil = until))
        .catch((err) => console.error('[chat] silêncio:', (err as Error).message));
    else if (channel === PROFILE_CHANNEL)
      loadGameProfile(db, accountId)
        .then((fresh) => {
          const a = c.account;
          // What was earned here and not written yet is on top of what the database now says.
          fresh.xp += a.delta.accountXp;
          for (const w of PROG_WEAPONS) fresh.weapons[w].xp += a.delta.weaponXp[w];
          fresh.arsenal = a.profile.arsenal;
          a.profile = fresh;
          if (c.name) c.name = fresh.tag;
          c.sex = fresh.sex;
          c.send(progressMsg(a));
        })
        .catch((err) => console.error('[perfil] recarga:', (err as Error).message));
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
    const peer: Peer = { account: liveAccount(profile, mutedUntil), conn: null, bucket: MAX_MSGS_PER_SEC, bucketAt: now(), entering: false };
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
          case 'play':
          case 'create':
          case 'join': {
            if (!conn.name) return conn.send({ t: 'error', message: 'Diga olá primeiro.' });
            if (peer.entering) return;
            peer.entering = true;
            enter(conn, msg)
              .catch((err) => {
                if (!(err instanceof EnterError)) console.error('[sessões] entrada:', (err as Error).message);
                conn.send({ t: 'error', message: err instanceof EnterError ? err.message : 'Não deu para entrar agora.' });
              })
              .finally(() => (peer.entering = false));
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
