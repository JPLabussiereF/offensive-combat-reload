// The knives' passives on the real server (mata-mata, the account's own knife): the spoon gives health back on a
// kill, the frozen fish's stab in the back is worth more, the pool noodle ignores falls and the lightsaber's
// swing hits everyone in reach. The kitchen knife, for contrast, does none of it. Each test plays in a fresh
// session so no other test's players are around.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { FLAG, type Vec3 } from '@shared/protocol';
import { SCORE } from '@shared/constants';
import { meleeStats } from '@shared/arsenal';
import { MELEE } from '@shared/weapons';
import type { KnifeId } from '@shared/progression';
import type { GameServer } from '../app';
import { Browser, Player, setWeaponXp, sleep, startTestServer } from './helpers';

let game: GameServer;
beforeAll(async () => {
  game = await startTestServer();
});
afterAll(async () => {
  await game?.close();
});

/** A signed-in player holding `knife` (with the knife points that unlock it), in session `session` or a new one. */
async function withKnife(name: string, knife: KnifeId, session?: string) {
  const b = new Browser(game);
  await b.register(name);
  await setWeaponXp(b, { faca: 9000 });
  const p = await Player.connect(game, await b.ticket());
  p.send({ t: 'hello' });
  await p.next('welcome');
  p.send({ t: 'loadout', lo: { faca: knife, ligadas: {} } });
  p.send(session ? { t: 'join', session } : { t: 'create', name: 'Sala da faca', mode: 'mata-mata', map: 'jardim' });
  const joined = await p.next('joined');
  return { p, joined, id: joined.you, session: joined.session.id, lo: joined.players.find((x) => x.id === joined.you)!.lo };
}
type In = Awaited<ReturnType<typeof withKnife>>;

async function spawn(who: In, at: Vec3, watcher: In = who) {
  who.p.send({ t: 'respawn', p: at, yaw: 0 });
  await watcher.p.next('spawned', (m) => m.id === who.id);
  who.p.send({ t: 'state', s: { p: at, yaw: 0, pitch: 0, f: FLAG.grounded } });
}

/** A room: the one with the knife at the origin and the others 1.5 m in front of it. */
async function room(knife: KnifeId, others: number) {
  const a = await withKnife(`Faca ${knife}`, knife);
  const vs: In[] = [];
  for (let i = 0; i < others; i++) vs.push(await withKnife(`Alvo ${knife} ${i}`, 'faca', a.session));
  await spawn(a, [0, 0, 0]);
  for (const [i, v] of vs.entries()) await spawn(v, [i - (others - 1) / 2, 0, 1.5], a);
  await sleep(50);
  return { a, vs, close: () => [a, ...vs].forEach((x) => x.p.close()) };
}

describe('passivas das facas (online, mata-mata)', () => {
  it('cada faca da conta chega com a sua passiva', async () => {
    const a = await withKnife('Colecionadora', 'colher');
    expect(a.lo?.faca).toBe('colher');
    expect(MELEE.colher.passiva).toEqual({ id: 'coloDeVo', vida: 50 });
    a.p.close();
  });

  it('Colo de Vó: o abate com a colher devolve 50 de vida', async () => {
    const { a, vs, close } = await room('colher', 2);
    // The second target shoots the spoon's owner twice first.
    let health = 100;
    for (let i = 0; i < 2; i++) {
      const hurt = a.p.next('damage', (m) => m.target === a.id);
      vs[1].p.send({ t: 'hit', target: a.id, region: 'peito', dist: 2, w: 'rifle' });
      health = (await hurt).health;
      await sleep(80);
    }
    expect(health).toBeLessThan(100);
    // Only snapshots from now on: the health they carry must go up with the kill.
    for (let i = a.p.msgs.length - 1; i >= 0; i--) if (a.p.msgs[i].t === 'snap') a.p.msgs.splice(i, 1);
    const kill = a.p.next('kill', (m) => m.victim === vs[0].id);
    a.p.send({ t: 'stab', target: vs[0].id, behind: false });
    await kill;
    const snap = await a.p.next('snap', (m) => (m.players.find((x) => x.id === a.id)?.h ?? 0) > health);
    expect(snap.players.find((x) => x.id === a.id)!.h).toBe(Math.min(100, health + 50));
    close();
  });

  it('Tapa Gelado: pelas costas com o peixe vale +100; com a faca de cozinha, +50', async () => {
    const fish = await room('peixe', 1);
    const k1 = fish.a.p.next('kill', (m) => m.victim === fish.vs[0].id);
    fish.a.p.send({ t: 'stab', target: fish.vs[0].id, behind: true });
    expect((await k1).awards).toContainEqual({ label: 'backstab', value: 100 });
    fish.close();

    const plain = await room('faca', 1);
    const k2 = plain.a.p.next('kill', (m) => m.victim === plain.vs[0].id);
    plain.a.p.send({ t: 'stab', target: plain.vs[0].id, behind: true });
    expect((await k2).awards).toContainEqual({ label: 'backstab', value: SCORE.backstab });
    plain.close();
  });

  it('Boia: com o macarrão a queda não machuca; com a faca de cozinha, machuca', async () => {
    const noodle = await room('macarrao', 0);
    noodle.a.p.send({ t: 'selfDamage', amount: 40, cause: 'fall' });
    await expect(noodle.a.p.next('damage', (m) => m.target === noodle.a.id, 300)).rejects.toThrow();
    // Not a free pass for everything: the dog still bites.
    noodle.a.p.send({ t: 'selfDamage', amount: 10, cause: 'dog' });
    expect((await noodle.a.p.next('damage', (m) => m.target === noodle.a.id)).amount).toBe(10);
    noodle.close();

    const plain = await room('faca', 0);
    plain.a.p.send({ t: 'selfDamage', amount: 40, cause: 'fall' });
    expect((await plain.a.p.next('damage', (m) => m.target === plain.a.id)).amount).toBe(40);
    plain.close();
  });

  it('Vuuum: um golpe do sabre derruba todos no alcance; a faca de cozinha, só um', async () => {
    const saber = await room('sabre', 2);
    const kills = saber.vs.map((v) => saber.a.p.next('kill', (m) => m.victim === v.id));
    for (const v of saber.vs) saber.a.p.send({ t: 'stab', target: v.id, behind: false });
    for (const k of await Promise.all(kills)) expect(k.attacker).toBe(saber.a.id);
    saber.close();

    const plain = await room('faca', 2);
    const first = plain.a.p.next('kill', (m) => m.victim === plain.vs[0].id);
    for (const v of plain.vs) plain.a.p.send({ t: 'stab', target: v.id, behind: false });
    await first;
    await expect(plain.a.p.next('kill', (m) => m.victim === plain.vs[1].id, 300)).rejects.toThrow();
    // After the knife's interval, the next swing does land.
    await sleep(meleeStats('faca').intervalo * 1000);
    const second = plain.a.p.next('kill', (m) => m.victim === plain.vs[1].id);
    plain.a.p.send({ t: 'stab', target: plain.vs[1].id, behind: false });
    await second;
    plain.close();
  });

  it('a varredura do sabre é só do mesmo golpe: um golpe 300 ms depois ainda espera o intervalo', async () => {
    const { a, vs, close } = await room('sabre', 2);
    const kill = a.p.next('kill', (m) => m.victim === vs[0].id);
    a.p.send({ t: 'stab', target: vs[0].id, behind: false });
    await kill;
    await sleep(300);
    a.p.send({ t: 'stab', target: vs[1].id, behind: false });
    await expect(a.p.next('kill', (m) => m.victim === vs[1].id, 300)).rejects.toThrow();
    close();
  });
});
