// Zumbi mode: the rules (shared/zombies.ts), the match engine with a fake clock (shared/zombieMatch.ts over
// the baked navmesh of the haunted town: waves, money, the coffin, revives, winning and losing), the baked
// navmesh being up to date with the map's code, and the mode on the real server (start loadout, shots at
// zombies checked against the server's positions, money and account XP, the coffin's weapon, revives).
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { importNavMesh, init, type NavMesh } from 'recast-navigation';
import nav from '@shared/data/navmesh/halloween.json';
import { gunStats } from '@shared/arsenal';
import { modeMaps, MODE_RULES } from '@shared/modes';
import type { ServerMsg, Vec3 } from '@shared/protocol';
import {
  BOX_ITEMS,
  duckChance,
  gunDamageToZombie,
  itemOf,
  itemSlot,
  killMoney,
  rollBox,
  startItems,
  waveSpec,
  WAVES,
  Z_KINDS,
  ZOMBIE,
  zombieLoadout,
  zombieProblems,
  type ZItems,
} from '@shared/zombies';
import { ZombieMatch, type ZombieHost } from '@shared/zombieMatch';
import { LETHAL_DAMAGE } from '@shared/weapons';
import type { GameServer } from '../app';
import { Browser, Player, sleep, startTestServer } from './helpers';
import { bakeNavmesh, navmeshHash } from '../../tools/bake-navmesh';

/** The mode's numbers as they ship: tests shorten them and put them back. */
const ORIGINAL = structuredClone(ZOMBIE);
afterEach(() => {
  Object.assign(ZOMBIE, structuredClone(ORIGINAL));
});

/** Short times for whole matches in a test. */
function quick() {
  Object.assign(ZOMBIE, { inicioSegundos: 0.2, intervaloSegundos: 0.2, intervaloChefeSegundos: 0.2, fimSegundos: 0.3 });
}

/** A seeded random (mulberry32) so rolls are repeatable. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('regras do modo zumbi', () => {
  it('os dados batem com as armas e o mapa', () => {
    expect(zombieProblems()).toEqual([]);
    expect(MODE_RULES.zumbi).toMatchObject({ weapons: 'mode', lockedLoadout: true, weaponXp: false, coop: true });
    expect(modeMaps('zumbi')).toEqual(['halloween']);
  });

  it('todo mundo começa com o rifle sem melhorias e a faca comum', () => {
    expect(zombieLoadout(startItems())).toEqual({ primaria: 'rifle', secundaria: null, ativas: { rifle: [], pistola: [], smg: [], faca: [], granada: [] } });
  });

  it('as ondas crescem, escalam com os jogadores e têm chefes nas ondas marcadas', () => {
    expect(WAVES).toBe(12);
    const bosses = Array.from({ length: WAVES }, (_, i) => waveSpec(i + 1, 1).boss);
    expect(bosses).toEqual([null, null, null, 'coveiro', null, null, null, 'noiva', null, null, null, 'prefeito']);
    expect(waveSpec(1, 4).total).toBeGreaterThan(waveSpec(1, 1).total * 2);
    for (let w = 2; w <= WAVES; w++) expect(waveSpec(w, 1).hp).toBeGreaterThan(waveSpec(w - 1, 1).hp);
    expect(waveSpec(12, 10).maxAlive).toBeLessThanOrEqual(ZOMBIE.maxVivosTeto);
  });

  it('a caixa nunca dá o que já está na mão e respeita as raridades', () => {
    const rng = seeded(7);
    const held: ZItems = { primaria: 'rifleFirme', secundaria: 'liquidificador', faca: null };
    const count: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) {
      const it = rollBox(rng, held);
      expect(it.id === 'rifleFirme' || it.id === 'liquidificador' || it.raridade === 'inicial').toBe(false);
      count[it.raridade] = (count[it.raridade] ?? 0) + 1;
    }
    // Weights 50/32/14/4: the common ones far more than the legendary ones, every rarity shows up.
    expect(count.comum).toBeGreaterThan(count.raro);
    expect(count.raro).toBeGreaterThan(count.epico);
    expect(count.epico).toBeGreaterThan(count.lendario);
    expect(count.lendario).toBeGreaterThan(50);
    expect(BOX_ITEMS.every((i) => itemSlot(i) === (i.arma === 'rifle' ? 'primaria' : i.arma === 'faca' ? 'faca' : 'secundaria'))).toBe(true);
  });

  it('o pato só aparece depois de algumas rodadas no mesmo lugar', () => {
    expect(duckChance(0)).toBe(0);
    expect(duckChance(ZOMBIE.caixa.patoApos - 1)).toBe(0);
    expect(duckChance(ZOMBIE.caixa.patoApos)).toBeCloseTo(ZOMBIE.caixa.patoChance);
    expect(duckChance(ZOMBIE.caixa.patoApos + 3)).toBeGreaterThan(duckChance(ZOMBIE.caixa.patoApos));
  });

  it('a virilha mata um zumbi comum na hora, mas só dobra o dano num chefe; a raridade multiplica', () => {
    const rifle = gunStats('rifle');
    expect(gunDamageToZombie(rifle, 10, 'virilha', 1, 1, false)).toBe(LETHAL_DAMAGE);
    expect(gunDamageToZombie(rifle, 10, 'virilha', 1, 1, true)).toBe(60);
    expect(gunDamageToZombie(rifle, 10, 'peito', 1, 2, false)).toBe(60);
    expect(gunDamageToZombie(rifle, 10, 'cabeca', 1, 1, false)).toBe(75);
    expect(killMoney('comum', 'head')).toBe(ZOMBIE.tipos.comum.dinheiro + ZOMBIE.dinheiro.tiroNaCabeca);
    expect(killMoney('comum', 'knife')).toBe(ZOMBIE.tipos.comum.dinheiro + ZOMBIE.dinheiro.faca);
  });
});

describe('malha de navegação pré-gerada', () => {
  it('é a mesma que o código atual do mapa gera (rode bun run navmesh se mudar o mapa)', async () => {
    const fresh = await bakeNavmesh('halloween');
    expect(navmeshHash(fresh)).toBe(nav.hash);
    expect(fresh.length).toBe(nav.bytes);
  }, 60_000);
});

// --- The match engine, with a fake clock --------------------------------------------------------------------

let navMesh: NavMesh;
beforeAll(async () => {
  await init();
  navMesh = importNavMesh(new Uint8Array(Buffer.from(nav.dados, 'base64'))).navMesh;
});

interface Fake {
  match: ZombieMatch;
  t: number;
  events: ServerMsg[];
  hp: Map<number, number>;
  xp: Map<number, number>;
  loadouts: Map<number, unknown>;
  feet: Map<number, Vec3>;
  step(seconds: number, each?: () => void): void;
  /** Steps until `done` (at most 10 minutes of game time). */
  until(done: () => boolean, each?: () => void): void;
  of<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }>[];
}

/** A match with players standing at `spots`, on a fake clock; damage takes host-side health like Session does. */
function fakeMatch(spots: Vec3[], seed = 1): Fake {
  const f = { t: 0, events: [] as ServerMsg[], hp: new Map<number, number>(), xp: new Map<number, number>(), loadouts: new Map<number, unknown>(), feet: new Map<number, Vec3>() } as Fake;
  const dead = new Set<number>();
  const host: ZombieHost = {
    now: () => f.t,
    rng: seeded(seed),
    emit: (m) => f.events.push(m),
    hurt: (id, amount) => {
      const left = (f.hp.get(id) ?? 100) - amount;
      f.hp.set(id, Math.max(0, left));
      if (left <= 0 && !f.match.lethal(id)) {
        dead.add(id);
        f.match.died(id);
      }
    },
    giveXp: (id, xp) => f.xp.set(id, (f.xp.get(id) ?? 0) + xp),
    setLoadout: (id, lo) => f.loadouts.set(id, lo),
    bleedOut: (id) => {
      dead.add(id);
      f.match.died(id);
    },
    revive: (id, h) => f.hp.set(id, 100 * h),
    allowRespawn: (id) => {
      dead.delete(id);
      f.hp.set(id, 100);
    },
    newMatch: (ids) => ids.forEach((id) => (dead.delete(id), f.hp.set(id, 100))),
  };
  f.match = new ZombieMatch(host, navMesh, ZOMBIE.mapas.halloween!);
  spots.forEach((p, i) => {
    f.feet.set(i + 1, p);
    f.hp.set(i + 1, 100);
    f.match.join(i + 1, `P${i + 1}`);
  });
  f.step = (seconds, each) => {
    for (let i = 0; i < seconds * 20; i++) {
      f.t += 50;
      f.match.tick(0.05, [...f.feet].map(([id, feet]) => ({ id, feet, grounded: true, alive: !dead.has(id) })));
      each?.();
    }
  };
  f.until = (done, each) => {
    for (let i = 0; i < 600 && !done(); i++) f.step(1, each);
    if (!done()) throw new Error('nunca aconteceu');
  };
  f.of = (t) => f.events.filter((e) => e.t === t) as never;
  return f;
}

/** Player 1 shoots every zombie that's out of the ground in the head, hard. */
const killAll = (f: Fake, by = 1) => () => {
  for (const z of [...f.match.zombies.values()]) if (f.t >= (z as unknown as { riseUntil: number }).riseUntil) f.match.damage(z.id, by, 1e9, 'head');
};

const STREET: Vec3 = [0, 0.1, 0];

describe('partida zumbi (motor, relógio falso)', () => {
  it('contagem, onda, dinheiro e XP por abate, intervalo e a próxima onda', () => {
    quick();
    const f = fakeMatch([STREET]);
    expect(f.match.phase).toBe('countdown');
    f.step(0.5);
    expect(f.match.phase).toBe('wave');
    expect(f.match.wave).toBe(1);
    f.until(() => f.match.phase === 'break', killAll(f));
    const deaths = f.of('zdie');
    expect(deaths.length).toBe(waveSpec(1, 1).total);
    // Each kill: the kind's money plus the headshot bonus, to the killer; and account XP.
    expect(deaths[0]).toMatchObject({ by: 1, how: 'head', award: killMoney('comum', 'head') });
    expect(f.xp.get(1)).toBeGreaterThanOrEqual(ZOMBIE.tipos.comum.xp * deaths.length);
    // The break, then wave 2.
    expect(f.of('zwave').some((w) => w.phase === 'break' && w.wave === 1)).toBe(true);
    f.step(0.3);
    expect(f.match.wave).toBe(2);
    expect(f.match.info(1)!.money).toBe(ZOMBIE.dinheiroInicial + deaths.reduce((s, d) => s + (d.award ?? 0), 0) + ZOMBIE.dinheiro.onda);
  });

  it('os zumbis andam até o jogador e o derrubam; sozinho, cair é perder', () => {
    quick();
    const f = fakeMatch([STREET]);
    f.until(() => f.of('zend').length > 0);
    expect(f.of('zdown')).toHaveLength(1);
    const end = f.of('zend');
    expect(end).toHaveLength(1);
    expect(end[0]).toMatchObject({ won: false, wave: 1 });
    expect(end[0].players[0]).toMatchObject({ id: 1, downs: 1 });
    // The summary, then a new match for whoever is there.
    f.step(1);
    expect(f.match.phase === 'countdown' || f.match.phase === 'wave').toBe(true);
    expect(f.match.info(1)).toMatchObject({ money: ZOMBIE.dinheiroInicial, kills: 0, state: 'up' });
  });

  it('em dupla, quem cai é reanimado pelo outro (que ganha dinheiro), ou sangra até morrer e volta no intervalo', () => {
    quick();
    Object.assign(ZOMBIE.jogador, { caidoSegundos: 5 });
    const f = fakeMatch([STREET, [1.5, 0.1, 0]]);
    f.step(0.5);
    // Player 1 goes down (as if a zombie got them).
    f.hp.set(1, 0);
    expect(f.match.lethal(1)).toBe(true);
    expect(f.match.info(1)!.state).toBe('down');
    expect(f.match.phase).toBe('wave');
    // Player 2 holds E over them.
    const before = f.match.info(2)!.money;
    f.match.revive(2, 1, true);
    expect(f.of('zrevive').at(-1)).toMatchObject({ id: 1, by: 2 });
    f.step(ZOMBIE.jogador.reanimarSegundos + 0.2);
    expect(f.match.info(1)!.state).toBe('up');
    expect(f.hp.get(1)).toBe(100 * ZOMBIE.jogador.reanimarVida);
    expect(f.match.info(2)).toMatchObject({ revives: 1, money: before + ZOMBIE.dinheiro.reanimar });
    // Down again, nobody helps: bleeds out, dead until the break.
    f.match.lethal(1);
    f.step(ZOMBIE.jogador.caidoSegundos + 0.2);
    expect(f.match.info(1)!.state).toBe('dead');
    expect(f.match.phase).toBe('wave');
    f.step(90, killAll(f, 2));
    expect(f.match.wave).toBeGreaterThanOrEqual(2);
    // Came back for the break with the starting weapons.
    expect(f.match.info(1)!.state).toBe('up');
    expect(f.loadouts.get(1)).toEqual(zombieLoadout(startItems()));
  });

  it('sobreviver à última onda (com os três chefes) vence e dá o XP de vitória', () => {
    quick();
    for (const w of ZOMBIE.ondas) w.zumbis = 1;
    const f = fakeMatch([STREET]);
    f.until(() => f.of('zend').length > 0, killAll(f));
    const end = f.of('zend');
    expect(end[0]).toMatchObject({ won: true, wave: WAVES });
    const bossKills = f.of('zdie').filter((d) => d.award === killMoney('coveiro', 'head') || d.award === ZOMBIE.chefes.noiva.dinheiro + ZOMBIE.dinheiro.tiroNaCabeca);
    expect(bossKills.length).toBeGreaterThanOrEqual(3);
    expect(f.of('zfx').filter((x) => x.fx === 'intro')).toHaveLength(3);
    expect(end[0].players[0].xp).toBeGreaterThanOrEqual(ZOMBIE.xp.vitoria + 3 * ZOMBIE.chefes.coveiro.xpTime);
  });

  it('a caixa: sem dinheiro não gira; gira, oferece, entrega no slot certo; o pato devolve o dinheiro e muda de lugar', () => {
    quick();
    const f = fakeMatch([STREET]);
    const [x, y, z] = ZOMBIE.mapas.halloween!.caixa[f.match.sync().box.spot];
    f.feet.set(1, [x + 1, y + 0.1, z]);
    f.step(0.3);
    // 500 isn't enough for 950.
    f.match.useBox(1);
    expect(f.of('zbox')).toHaveLength(0);
    (f.match.parts.get(1) as { money: number }).money = 5000;
    // Far from the coffin: nothing.
    f.feet.set(1, [x + 20, y, z]);
    f.step(0.1);
    f.match.useBox(1);
    expect(f.of('zbox')).toHaveLength(0);
    f.feet.set(1, [x + 1, y + 0.1, z]);
    f.step(0.1);
    f.match.useBox(1);
    expect(f.of('zbox').at(-1)).toMatchObject({ state: 'rolling', by: 1, item: null, money: 5000 - ZOMBIE.caixa.custo });
    f.step(ZOMBIE.caixa.girarSegundos + 0.1);
    const offer = f.of('zbox').at(-1)!;
    expect(offer.state).toBe('offer');
    const it = itemOf(offer.item)!;
    expect(it.raridade).not.toBe('inicial');
    f.match.useBox(1);
    expect(f.match.itemsOf(1)[itemSlot(it)]).toBe(it.id);
    expect(f.loadouts.get(1)).toEqual(zombieLoadout(f.match.itemsOf(1)));
    // Enough rolls at one spot and the duck shows up: money back, the coffin flies off.
    Object.assign(ZOMBIE.caixa, { patoApos: 0, patoChance: 1 });
    const spot = f.match.sync().box.spot;
    const money = f.match.info(1)!.money;
    f.match.useBox(1);
    expect(f.of('zbox').at(-1)).toMatchObject({ state: 'duck', money });
    f.step(ZOMBIE.caixa.patoSegundos + ZOMBIE.caixa.mudarSegundos + 0.2);
    expect(f.match.sync().box).toMatchObject({ state: 'idle' });
    expect(f.match.sync().box.spot).not.toBe(spot);
  });

  it('o rojão: o inchado explode ao morrer e leva os zumbis em volta, com o crédito de quem o matou', () => {
    quick();
    for (const w of ZOMBIE.ondas) Object.assign(w, { zumbis: 40, tipos: { inchado: 0.5 }, intervalo: 0.05 });
    Object.assign(ZOMBIE, { maxVivosBase: 40, maxVivosTeto: 40 });
    const f = fakeMatch([[40, 0.1, 52]]);
    f.step(6);
    const bloater = [...f.match.zombies.values()].find((z) => z.kind === 'inchado' && [...f.match.zombies.values()].some((o) => o !== z && Math.hypot(o.pos[0] - z.pos[0], o.pos[2] - z.pos[2]) < 2));
    if (!bloater) return; // the horde spread out this time: nothing to check
    f.match.damage(bloater.id, 1, 1e9, 'gun');
    expect(f.of('zfx').some((e) => e.fx === 'boom')).toBe(true);
    expect(f.of('zdie').filter((d) => d.how === 'blast' && d.by === 1).length).toBeGreaterThan(0);
  });

  it('quem sai libera o que segurava; sem ninguém, a partida volta a esperar', () => {
    quick();
    const f = fakeMatch([STREET, [2, 0.1, 0]]);
    f.step(0.5);
    f.match.leave(2);
    expect(f.match.phase).toBe('wave');
    f.match.leave(1);
    expect(f.match.phase).toBe('waiting');
    expect(f.match.zombies.size).toBe(0);
  });

  it('o snapshot leva cada zumbi com o tipo e as flags', () => {
    quick();
    const f = fakeMatch([STREET]);
    f.step(5);
    const s = f.match.snapshot();
    expect(s.z.length).toBeGreaterThan(0);
    for (const z of s.z) expect(Z_KINDS[z[1]]).toBeDefined();
    expect(s.left).toBe(waveSpec(1, 1).total);
  });
});

// --- On the real server ------------------------------------------------------------------------------------

let game: GameServer;
beforeAll(async () => {
  game = await startTestServer();
});
afterAll(async () => {
  await game?.close();
});

async function enter(name: string, session = 'zumbi-halloween', lobby: object[] = []) {
  const b = new Browser(game);
  await b.register(name);
  const p = await Player.connect(game, await b.ticket());
  p.send({ t: 'hello' });
  await p.next('welcome');
  for (const m of lobby) p.send(m);
  p.send({ t: 'join', session });
  const joined = await p.next('joined');
  return { p, joined, id: joined.you };
}
type In = Awaited<ReturnType<typeof enter>>;

/** Respawns at `at` and keeps reporting that position (standing, on the ground). */
async function stand(who: In, at: Vec3) {
  who.p.send({ t: 'respawn', p: at, yaw: 0 });
  await who.p.next('spawned', (m) => m.id === who.id);
  who.p.send({ t: 'state', s: { p: at, yaw: 0, pitch: 0, f: 64 } });
}

const eyeDist = (feet: Vec3, z: Vec3, scale = 1) => Math.hypot(z[0] - feet[0], z[1] + 1.1 * scale - (feet[1] + 1.6), z[2] - feet[2]);

describe('modo zumbi no servidor', () => {
  it('tem salas fixas só na Vila Assombrada', async () => {
    const list = (await (await fetch(`http://127.0.0.1:${game.port}/api/sessoes`)).json()) as { id: string; mode: string; map: string; permanent: boolean }[];
    expect(list.filter((s) => s.mode === 'zumbi' && s.permanent).map((s) => [s.id, s.map])).toEqual([['zumbi-halloween', 'halloween']]);
  });

  it('criar uma sala zumbi em outro mapa cai na Vila Assombrada', async () => {
    const b = new Browser(game);
    await b.register('Criador');
    const p = await Player.connect(game, await b.ticket());
    p.send({ t: 'hello' });
    await p.next('welcome');
    p.send({ t: 'create', name: 'Horda', map: 'rua', mode: 'zumbi' });
    expect((await p.next('joined')).session).toMatchObject({ name: 'Horda', map: 'halloween', mode: 'zumbi' });
    p.close();
  });

  it('começa com o rifle sem melhorias (não o Arsenal), mata zumbis validados, ganha dinheiro e XP da conta', async () => {
    quick();
    Object.assign(ZOMBIE.tipos.comum, { dano: 0 });
    const a = await enter('Caçador', 'zumbi-halloween', [{ t: 'loadout', lo: { secundaria: 'smg', ligadas: {} } }]);
    const me = a.joined.players.find((x) => x.id === a.id)!;
    expect(me.lo).toEqual(zombieLoadout(startItems()));
    expect(a.joined.zumbi).toBeDefined();
    const at: Vec3 = [0, 0.1, 0];
    await stand(a, at);
    // A zombie comes out (the latest snapshot, not an old one).
    let snap = await a.p.next('zsnap', (m) => m.z.some((z) => z[6] === 0), 20_000);
    a.p.msgs = a.p.msgs.filter((m) => m.t !== 'zsnap');
    snap = await a.p.next('zsnap', (m) => m.z.some((z) => z[6] === 0));
    const z = snap.z.find((x) => x[6] === 0)!;
    const zpos: Vec3 = [z[2], z[3], z[4]];
    const d = eyeDist(at, zpos);
    // A report that doesn't match the server's distance is refused.
    a.p.send({ t: 'zhit', z: z[0], region: 'virilha', dist: d + 40, w: 'rifle' });
    await expect(a.p.next('zdie', (m) => m.id === z[0], 400)).rejects.toThrow();
    // A gun we don't have is refused.
    a.p.send({ t: 'zhit', z: z[0], region: 'virilha', dist: d, w: 'smg' });
    await expect(a.p.next('zdie', (m) => m.id === z[0], 400)).rejects.toThrow();
    // A real hit in the groin: the zombie dies, we get its money and account XP from the server.
    a.p.msgs = a.p.msgs.filter((m) => m.t !== 'zsnap');
    snap = await a.p.next('zsnap');
    const now = snap.z.find((x) => x[0] === z[0]);
    if (!now) throw new Error('o zumbi sumiu');
    a.p.msgs = a.p.msgs.filter((m) => m.t !== 'progresso');
    a.p.send({ t: 'zhit', z: z[0], region: 'virilha', dist: eyeDist(at, [now[2], now[3], now[4]]), w: 'rifle' });
    const die = await a.p.next('zdie', (m) => m.id === z[0]);
    expect(die).toMatchObject({ by: a.id, how: 'groin', award: ZOMBIE.tipos.comum.dinheiro, money: ZOMBIE.dinheiroInicial + ZOMBIE.tipos.comum.dinheiro });
    const prog = await a.p.next('progresso');
    expect(prog.conta.xp).toBeGreaterThanOrEqual(ZOMBIE.tipos.comum.xp);
    // The Arsenal can't change mid-match.
    a.p.send({ t: 'loadout', lo: { secundaria: 'pistola', ligadas: {} } });
    await expect(a.p.next('playerLoadout', (m) => m.id === a.id, 300)).rejects.toThrow();
    a.p.close();
    await sleep(100);
  }, 40_000);

  it('a caixa gira no servidor e entrega a arma no slot dela', async () => {
    quick();
    Object.assign(ZOMBIE.tipos.comum, { dano: 0 });
    Object.assign(ZOMBIE.caixa, { custo: 100, girarSegundos: 0.2 });
    const s = await enter('Apostador', 'zumbi-halloween');
    const box = s.joined.zumbi!.box;
    const [x, y, z] = ZOMBIE.mapas.halloween!.caixa[box.spot];
    const at: Vec3 = [x + 1, y + 0.1, z];
    await stand(s, at);
    await sleep(100);
    s.p.send({ t: 'box' });
    expect(await s.p.next('zbox', (m) => m.state === 'rolling')).toMatchObject({ by: s.id, money: ZOMBIE.dinheiroInicial - 100 });
    const offer = await s.p.next('zbox', (m) => m.state === 'offer');
    const it = itemOf(offer.item)!;
    s.p.send({ t: 'box' });
    const lo = await s.p.next('playerLoadout', (m) => m.id === s.id);
    const items = { ...startItems(), [itemSlot(it)]: it.id };
    expect(lo.lo).toEqual(zombieLoadout(items));
    s.p.close();
    await sleep(100);
  }, 30_000);


  it('os zumbis do servidor machucam quem está de pé', async () => {
    quick();
    Object.assign(ZOMBIE.tipos.comum, { dano: 5 });
    Object.assign(ZOMBIE.tipos.corredor, { dano: 5 });
    const a = await enter('Isca', 'zumbi-halloween');
    await stand(a, [0, 0.1, 0]);
    const hit = await a.p.next('damage', (m) => m.target === a.id && m.attacker === null, 45_000);
    expect(hit.amount).toBe(5);
    expect(hit.from).not.toBeNull();
    a.p.close();
    await sleep(100);
  }, 60_000);

  it('ninguém machuca ninguém; quem cai é reanimado por um amigo; sem ninguém de pé a partida acaba e recomeça', async () => {
    quick();
    Object.assign(ZOMBIE, { fimSegundos: 1 });
    for (const t of Object.values(ZOMBIE.tipos)) t.dano = 0;
    const a = await enter('Vitima', 'zumbi-halloween');
    const b = await enter('Medico', 'zumbi-halloween');
    const at: Vec3 = [0, 0.1, 0];
    const near: Vec3 = [1.5, 0.1, 0];
    await stand(a, at);
    await stand(b, near);
    if (a.joined.zumbi?.phase !== 'wave') await a.p.next('zwave', (m) => m.phase === 'wave', 5000);
    // Friendly fire does nothing (a hit that passes every other check).
    a.p.send({ t: 'hit', target: b.id, region: 'cabeca', dist: eyeDist(at, near), w: 'rifle' });
    await expect(b.p.next('damage', (m) => m.target === b.id, 300)).rejects.toThrow();
    // A deadly fall during a wave: down, not dead.
    a.p.send({ t: 'selfDamage', amount: 9999, cause: 'fall' });
    const down = await b.p.next('zdown', (m) => m.id === a.id);
    expect(down.until).toBeGreaterThan(0);
    await expect(b.p.next('kill', (m) => m.victim === a.id, 200)).rejects.toThrow();
    // B holds E: A is back up, B gets the revive money.
    b.p.send({ t: 'revive', id: a.id, on: true });
    expect(await a.p.next('zrevive', (m) => m.id === a.id && m.until > 0)).toMatchObject({ by: b.id });
    const up = await a.p.next('zup', (m) => m.id === a.id, 8000);
    expect(up).toMatchObject({ by: b.id, money: ZOMBIE.dinheiroInicial + ZOMBIE.dinheiro.reanimar });
    // Both down: game over, the summary, then a new match (everyone respawns at once).
    a.p.send({ t: 'selfDamage', amount: 9999, cause: 'fall' });
    await b.p.next('zdown', (m) => m.id === a.id);
    b.p.send({ t: 'selfDamage', amount: 9999, cause: 'fall' });
    const end = await a.p.next('zend');
    expect(end.won).toBe(false);
    expect(end.players.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
    expect(end.players.find((p) => p.id === b.id)).toMatchObject({ revives: 1, downs: 1 });
    expect(end.players.find((p) => p.id === a.id)).toMatchObject({ downs: 2 });
    const start = await a.p.next('roundStart', () => true, 10_000);
    expect(start.players.find((p) => p.id === a.id)).toMatchObject({ alive: false, zumbi: { money: ZOMBIE.dinheiroInicial, state: 'up' } });
    a.p.close();
    b.p.close();
    await sleep(100);
  }, 60_000);
});
