// The sticker album's own counters (shared/achievements.ts, fonte "propria") as the server keeps them: a real
// Session over stub sockets on a fake clock for the events (streaks, combos, revenge, dances, buffs, dying on
// your own, the gun game), and a real server for the rest of the way (the "figurinha" message as a finish goes
// up, written in achievement_progress and read back in GET /api/perfil).
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { ServerWebSocket } from 'bun';
import { defaultAppearance } from '@shared/appearance';
import { HUMILIATION } from '@shared/constants';
import { FINAL_STEP } from '@shared/gunGame';
import { modeMaps, type GameModeId } from '@shared/modes';
import { DEFAULT_CHOICE, PROG_WEAPONS, type ProgWeapon } from '@shared/progression';
import type { Award, ClientMsg, KillKind, ServerMsg } from '@shared/protocol';
import type { GameServer } from '../app';
import { emptyTotals } from '../accounts';
import { liveAccount, liveOwn, type LiveAccount } from '../progress';
import { Session, type Conn, type SPlayer } from '../session';
import { Browser, Player, sleep, startTestServer } from './helpers';

let accountSeq = 1;
/** A signed-in account as the server keeps it (`xp`: account XP, for its level). */
function account(xp = 0): LiveAccount {
  const n = accountSeq++;
  const weapons = Object.fromEntries(PROG_WEAPONS.map((w) => [w, { xp: 0 }])) as Record<ProgWeapon, { xp: number }>;
  return liveAccount({ accountId: `conta-${n}`, profileId: `perfil-${n}`, tag: `Album${n}#0001`, sex: 'm', appearance: defaultAppearance('m'), xp, weapons, arsenal: DEFAULT_CHOICE, totals: emptyTotals(), album: {} });
}

interface Stub {
  conn: Conn;
  inbox: ServerMsg[];
}

/** What the tests reach inside the Session. */
interface Internals {
  kill(victim: SPlayer, attacker: SPlayer | null, kind: KillKind, bonus: Award[], weapon: ProgWeapon | null): void;
  tick(): void;
}

class Room {
  /** Fake server clock (ms). */
  t = 1_000_000;
  readonly stubs: Stub[] = [];
  readonly session: Session;

  constructor(mode: GameModeId) {
    this.session = new Session(`album-${mode}`, 'Album', modeMaps(mode)[0], mode, false, () => this.t, () => {}, (_topic, data) => this.deliver(data));
  }

  private deliver(data: string, except?: Stub) {
    const msg = JSON.parse(data) as ServerMsg;
    for (const s of this.stubs) if (s !== except) s.inbox.push(msg);
  }

  /** Joins and spawns at the origin (everyone stands at the same spot: dances are always in reach). */
  join(acct = account()): Stub {
    const stub = { inbox: [] } as unknown as Stub;
    const ws = { readyState: WebSocket.OPEN, subscribe() {}, unsubscribe() {}, publish: (_topic: string, data: string) => this.deliver(data, stub) };
    stub.conn = { ws: ws as unknown as ServerWebSocket<unknown>, id: this.stubs.length + 1, name: acct.profile.tag, sex: 'm', session: null, account: acct, send: (m) => stub.inbox.push(m) };
    this.stubs.push(stub);
    this.session.join(stub.conn);
    this.spawn(stub);
    return stub;
  }

  spawn(s: Stub) {
    this.send(s, { t: 'respawn', p: [0, 0, 0], yaw: 0 });
  }

  send(s: Stub, msg: object) {
    this.session.handle(s.conn, msg as ClientMsg);
  }

  p(s: Stub) {
    return this.session.players.get(s.conn.id)!;
  }

  own(s: Stub) {
    return liveOwn(s.conn.account);
  }

  /** `a` kills `b` (as a validated hit would); returns the body's id. */
  kill(a: Stub | null, b: Stub, kind: KillKind = 'head', weapon: ProgWeapon | null = 'rifle'): number {
    (this.session as unknown as Internals).kill(this.p(b), a ? this.p(a) : null, kind, [], a ? weapon : null);
    const k = b.inbox.filter((m) => m.t === 'kill').at(-1) as Extract<ServerMsg, { t: 'kill' }>;
    return k.corpse.id;
  }

  /** A full dance on a body. */
  dance(s: Stub, corpse: number) {
    this.send(s, { t: 'taunt', corpse });
    this.t += HUMILIATION.duration * 1000;
    this.send(s, { t: 'tauntEnd', corpse, done: true });
  }

  /** A second of server ticks (the album's check runs once a second). */
  second() {
    for (let i = 0; i < 20; i++) {
      this.t += 50;
      (this.session as unknown as Internals).tick();
    }
  }

  take<T extends ServerMsg['t']>(s: Stub, t: T): Extract<ServerMsg, { t: T }>[] {
    const out = s.inbox.filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[];
    s.inbox = s.inbox.filter((m) => m.t !== t);
    return out;
  }

  dispose() {
    this.session.dispose();
  }
}

describe('figurinhas próprias numa sessão (relógio falso)', () => {
  it('sequência e combo guardam o recorde; vingança e quem quebra a sequência contam; o aviso sai uma vez', () => {
    const room = new Room('mata-mata');
    const A = room.join();
    const B = room.join();
    for (let i = 0; i < 5; i++) {
      room.kill(A, B);
      room.t += 1000;
    }
    expect(room.own(A)).toMatchObject({ embalado: 5, combo: 5 });
    // B kills A: payback for the last time A got them, and A's spree of 5 is over.
    room.kill(B, A);
    expect(room.own(B)).toMatchObject({ vinganca: 1, 'estraga-sequencia': 1, embalado: 1 });
    // A kills B again, much later: a new streak and combo, the records stay; A's revenge on B.
    room.t += 10_000;
    room.kill(A, B);
    expect(room.own(A)).toMatchObject({ embalado: 5, combo: 5, vinganca: 1 });
    // Within a second the owner hears the finishes that went up, and only once.
    room.second();
    const ups = room.take(A, 'figurinha');
    expect(ups).toContainEqual({ t: 'figurinha', id: 'embalado', nivel: 2 });
    expect(ups).toContainEqual({ t: 'figurinha', id: 'combo', nivel: 4 });
    room.second();
    expect(room.take(A, 'figurinha')).toEqual([]);
    room.dispose();
  });

  it('opressão: oprimido, oportunista, pé de valsa, troco, cachorro morto, no último segundo, Davi contra Golias', () => {
    const room = new Room('mata-mata');
    const A = room.join();
    const B = room.join();
    const C = room.join();
    // B is 10 kills ahead of A in the match: a Goliath.
    room.p(B).kills = 10;
    // C kills B; A dances on the body: someone else's kill, on this map; B was humiliated by A.
    room.dance(A, room.kill(C, B));
    expect(room.own(A)).toMatchObject({ oportunista: 1, [`pe-de-valsa:${room.session.map}`]: 1, 'davi-contra-golias': 1 });
    expect(room.own(B)).toMatchObject({ oprimido: 1 });
    // B pays it back: kills A and dances on them.
    room.t += 6000;
    room.spawn(B);
    room.dance(B, room.kill(B, A));
    expect(room.own(B)).toMatchObject({ troco: 1 });
    expect(room.own(A)).toMatchObject({ oprimido: 1 });
    // C falls to their death: a body nobody made. B dances on it, starting with under a second left.
    room.send(C, { t: 'selfDamage', amount: 9999, cause: 'fall' });
    expect(room.own(C)).toMatchObject({ gravidade: 1 });
    const body = (C.inbox.filter((m) => m.t === 'kill').at(-1) as Extract<ServerMsg, { t: 'kill' }>).corpse.id;
    room.t += HUMILIATION.window * 1000 - 800;
    room.dance(B, body);
    expect(room.own(B)).toMatchObject({ 'chutando-cachorro-morto': 1, 'no-ultimo-segundo': 1 });
    expect(room.own(B).oportunista).toBeUndefined();
    room.dispose();
  });

  it('matar no meio da dancinha, e com cada buff: humanidade, cereja, bêbado, e o biscoito uma vez só', () => {
    const room = new Room('mata-mata');
    const A = room.join();
    const B = room.join();
    const C = room.join();
    // B dances on C's body; A kills B mid-dance.
    const body = room.kill(B, C);
    room.send(B, { t: 'taunt', corpse: body });
    room.kill(A, B);
    expect(room.own(A)).toMatchObject({ 'estraga-prazer': 1 });
    const a = room.p(A);
    Object.assign(a, { humanity: true, boostUntil: room.t + 30_000, potion: { kind: 'bebado', until: room.t + 60_000 }, biscuitAt: room.t, biscuitLow: true });
    room.t += 6000;
    room.spawn(B);
    room.kill(A, B);
    room.t += 6000;
    room.spawn(B);
    room.kill(A, B);
    expect(room.own(A)).toMatchObject({ 'humanidade-restaurada': 2, 'cereja-do-bolo': 2, 'saude-hic': 2, 'scooby-dooby-doo': 1 });
    room.dispose();
  });

  it('proezas com granada: explodiu na mão, levou dois e morreu junto (Abraço de Urso, Strike!, Kamikaze)', () => {
    const room = new Room('mata-mata');
    const A = room.join();
    const B = room.join();
    const C = room.join();
    for (const s of [A, B, C]) room.p(s).health = 50;
    // Cooked too long: no fuse left, never thrown. It goes off at A's chest, everyone at the same spot.
    room.send(A, { t: 'grenade', id: 1, p: [0, 1, 0], v: [0, 0, 0], fuse: 0 });
    const at = [0, room.p(A).state.p[1] + 1.2, 0];
    const dist = (s: Stub) => Math.hypot(at[1] - (room.p(s).state.p[1] + 1.2));
    room.send(A, { t: 'boom', id: 1, p: at, hits: [B, C, A].map((s) => ({ target: s.conn.id, dist: dist(s) })) });
    expect([B, C, A].map((s) => room.p(s).alive)).toEqual([false, false, false]);
    expect(room.own(A)).toMatchObject({ 'abraco-de-urso': 1, strike: 2, kamikaze: 1, 'tiro-no-pe': 1 });
    room.dispose();
  });

  it('empurrãozinho (até 5 s), com um pé na cova e R.I.P. LAG', () => {
    const room = new Room('mata-mata');
    const A = room.join();
    const B = room.join();
    const hurt = (from: Stub, to: Stub) => (room.session as unknown as { damage: Function }).damage(room.p(to), room.p(from), 10, 'gun', null, [], 'rifle');
    // A shoots B, B falls to their death 2 s later: A's push.
    hurt(A, B);
    room.t += 2000;
    room.send(B, { t: 'selfDamage', amount: 9999, cause: 'fall' });
    expect(room.own(A)).toMatchObject({ empurraozinho: 1 });
    // Too late (6 s): just a fall.
    room.t += 6000;
    room.spawn(B);
    hurt(A, B);
    room.t += 6000;
    room.send(B, { t: 'selfDamage', amount: 9999, cause: 'void' });
    expect(room.own(A).empurraozinho).toBe(1);
    // A kills with 5 health left; B dies with 300 ms of ping.
    room.t += 6000;
    room.spawn(B);
    Object.assign(room.p(A), { health: 5 });
    Object.assign(room.p(B), { ping: 300 });
    room.kill(A, B);
    expect(room.own(A)).toMatchObject({ 'com-um-pe-na-cova': 1 });
    expect(room.own(B)).toMatchObject({ 'rip-lag': 1 });
    room.dispose();
  });

  it('corrida armada: rebaixar na faca, vencer, e vencer sem morrer', () => {
    const room = new Room('corrida-armada');
    const A = room.join();
    const B = room.join();
    const C = room.join();
    // A climbs a step with the first rung's gun; B stabs them back down.
    for (let i = 0; i < 3; i++) room.kill(A, B, 'head', 'rifle');
    room.kill(B, A, 'knife', 'faca');
    expect(room.own(B)).toMatchObject({ esfaqueador: 1 });
    // B wins from the last rung, having died this round; C does it never killed.
    const ladder = (room.session.mode as unknown as { ladder: Map<number, { step: number; kills: number }> }).ladder;
    ladder.set(B.conn.id, { step: FINAL_STEP, kills: 0 });
    room.t += 6000;
    room.spawn(A);
    room.kill(B, A, 'knife', 'faca');
    expect(room.take(B, 'roundEnd')).toHaveLength(1);
    expect(room.own(B)).toMatchObject({ corredor: 1 });
    expect(room.own(B)['volta-olimpica']).toBeUndefined();
    // The next round: C on the last rung, alive all along.
    room.t += 7000;
    room.second();
    for (const s of [A, B, C]) room.spawn(s);
    ladder.set(C.conn.id, { step: FINAL_STEP, kills: 0 });
    room.kill(C, A, 'knife', 'faca');
    expect(room.own(C)).toMatchObject({ corredor: 1, 'volta-olimpica': 1 });
    room.dispose();
  });
});

// --- On the real server: the message, the database, the profile ---------------------------------------------------

let game: GameServer;
beforeAll(async () => {
  game = await startTestServer();
});
afterAll(async () => {
  await game?.close();
});

describe('figurinhas próprias no servidor', () => {
  it('cair do mapa avisa a figurinha na hora, grava e volta no perfil', async () => {
    const b = new Browser(game);
    await b.register('Despencado');
    const p = await Player.connect(game, await b.ticket());
    p.send({ t: 'hello' });
    await p.next('welcome');
    p.send({ t: 'join', session: 'principal' });
    const joined = await p.next('joined');
    p.send({ t: 'respawn', p: [0, 0, 0], yaw: 0 });
    await p.next('spawned', (m) => m.id === joined.you);
    p.send({ t: 'selfDamage', amount: 9999, cause: 'void' });
    expect(await p.next('figurinha', (m) => m.id === 'fora-do-mapa', 3000)).toMatchObject({ nivel: 1 });
    p.send({ t: 'leave' });
    await sleep(300);
    expect((await b.req('GET', '/api/perfil')).body.album).toMatchObject({ 'fora-do-mapa': 1 });
    p.close();
    await sleep(100);
    // A new connection starts from what was written: falling again adds up, and isn't news (still common).
    const q = await Player.connect(game, await b.ticket());
    q.send({ t: 'hello' });
    await q.next('welcome');
    q.send({ t: 'join', session: 'principal' });
    const again = await q.next('joined');
    q.send({ t: 'respawn', p: [0, 0, 0], yaw: 0 });
    await q.next('spawned', (m) => m.id === again.you);
    q.send({ t: 'selfDamage', amount: 9999, cause: 'void' });
    await expect(q.next('figurinha', () => true, 1500)).rejects.toThrow();
    q.send({ t: 'leave' });
    await sleep(300);
    expect((await b.req('GET', '/api/perfil')).body.album).toMatchObject({ 'fora-do-mapa': 2 });
    q.close();
    await sleep(100);
  }, 20_000);

  it('destaque e título: só o que a conta tem; os outros veem a figurinha com o acabamento dela', async () => {
    const b = new Browser(game);
    await b.register('Vitrine');
    // Nothing stuck in yet: refused.
    expect(await b.req('PATCH', '/api/perfil', { destaque: 'fora-do-mapa' })).toMatchObject({ status: 400, body: { erro: 'figurinha_bloqueada' } });
    // Falls off the map once (a gold sticker of a single target), and then shows it.
    const p = await Player.connect(game, await b.ticket());
    p.send({ t: 'hello' });
    await p.next('welcome');
    p.send({ t: 'join', session: 'principal' });
    const joined = await p.next('joined');
    p.send({ t: 'respawn', p: [0, 0, 0], yaw: 0 });
    await p.next('spawned', (m) => m.id === joined.you);
    p.send({ t: 'selfDamage', amount: 9999, cause: 'void' });
    await p.next('figurinha', (m) => m.id === 'fora-do-mapa', 3000);
    p.send({ t: 'leave' });
    await sleep(300);
    const ok = await b.req('PATCH', '/api/perfil', { destaque: 'fora-do-mapa' });
    expect(ok).toMatchObject({ status: 200, body: { destaque: 'fora-do-mapa', titulo: null } });
    // A sticker it doesn't have, or a title of a page not completed: refused, the choice stays.
    expect(await b.req('PATCH', '/api/perfil', { destaque: 'na-testa' })).toMatchObject({ status: 400 });
    expect(await b.req('PATCH', '/api/perfil', { titulo: 'vexames' })).toMatchObject({ status: 400, body: { erro: 'figurinha_bloqueada' } });
    expect((await b.req('GET', '/api/perfil')).body.destaque).toBe('fora-do-mapa');
    // Back in a match (a new connection reads the choice): everyone sees the sticker and its finish.
    p.close();
    await sleep(100);
    const q = await Player.connect(game, await b.ticket());
    q.send({ t: 'hello' });
    await q.next('welcome');
    q.send({ t: 'join', session: 'principal' });
    const again = await q.next('joined');
    const mine = again.players.find((x) => x.id === again.you)!;
    expect(mine.fig).toEqual(['fora-do-mapa', 1]);
    expect(mine.tit).toBeUndefined();
    q.close();
    // Taking it off.
    expect((await b.req('PATCH', '/api/perfil', { destaque: null })).body.destaque).toBeNull();
    await sleep(100);
  }, 20_000);
});
