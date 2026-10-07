// The zumbi mode's own map and its two new rules, on the match engine (shared/zombieMatch.ts) with a fake clock
// over the baked navmesh of the cemetery:
// - the map is the mode's and nobody else's (shared/maps.ts, shared/modes.ts), and each gap of its wall is baked
//   as polygons of its own carrying its own flag (shared/barricades.ts);
// - barricades: building one (paid, every board at once), nailing boards back (free, a capped reward), zombies
//   going around shut gaps to the open one, tearing at the boards when every gap is shut, the bruiser tearing
//   through a shut gap even with others open, barricades lasting between waves and gone in a new match;
// - the coffin's damaged weapons: the odds by rarity (never zero), the flaws by their weights, the penalties, and a
//   damaged copy that can come back whole.
// Their server side (the real server's damage checks with a damaged weapon, a joiner's sync) is in zombies.test.ts.
import { afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { importNavMesh, init, NavMeshQuery, QueryFilter, type NavMesh } from 'recast-navigation';
import nav from '@shared/data/navmesh/cemiterio.json';
import { gunStats, sanitizeLoadout } from '@shared/arsenal';
import { OFFICIAL_MAPS } from '@shared/maps';
import { GAME_MODE_IDS, modeAllowsMap, MODE_RULES } from '@shared/modes';
import type { MapData } from '@shared/mapData';
import { officialRuntime } from '../maps';
import type { ServerMsg, Vec3 } from '@shared/protocol';
import { gateFlag, insideWall, thornsAt, WALK_FLAG } from '@shared/barricades';
import {
  BOX_ITEMS,
  flawChance,
  itemOf,
  itemSlot,
  rarityMul,
  RARITIES,
  rollBox,
  rollFlaw,
  startItems,
  weaponMul,
  withItem,
  ZOMBIE,
  zombieGunData,
  zombieLoadout,
  type ZItems,
} from '@shared/zombies';
import { ZombieMatch, type ZombieHost, type ZStat } from '@shared/zombieMatch';

const ORIGINAL = structuredClone(ZOMBIE);
afterEach(() => {
  Object.assign(ZOMBIE, structuredClone(ORIGINAL));
});

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

let navMesh: NavMesh;
beforeAll(async () => {
  await init();
  navMesh = importNavMesh(new Uint8Array(Buffer.from(nav.dados, 'base64'))).navMesh;
});

const MAP = () => ZOMBIE.mapas.cemiterio!;
const gap = (id: string) => MAP().barricadas.findIndex((g) => g.id === id);
/** Inside the yard, 1.4 m from gap `i`'s middle: in reach to work on it. */
function byGap(i: number): Vec3 {
  const [cx, , cz] = MAP().barricadas[i].centro;
  return MAP().barricadas[i].eixo === 'x' ? [cx, 0.1, cz - Math.sign(cz) * 1.4] : [cx - Math.sign(cx) * 1.4, 0.1, cz];
}

interface Fake {
  match: ZombieMatch;
  t: number;
  events: ServerMsg[];
  /** When each event was sent (match clock, ms). */
  times: number[];
  feet: Map<number, Vec3>;
  /** Where each zombie came into the yard (the gap it was nearest to), in order. */
  crossings: { id: number; gap: string; t: number }[];
  step(seconds: number, each?: () => void): void;
  of<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }>[];
}

/** A match with players at `spots` who take no damage (`hurt` only watches), tracking where zombies come into the yard. */
function fake(spots: Vec3[], seed = 3, hurt: ZombieHost['hurt'] = () => {}): Fake {
  const f = { t: 0, events: [] as ServerMsg[], times: [] as number[], feet: new Map<number, Vec3>(), crossings: [] } as unknown as Fake;
  const host: ZombieHost = {
    now: () => f.t,
    rng: seeded(seed),
    emit: (m) => {
      f.events.push(m);
      f.times.push(f.t);
    },
    hurt,
    giveXp: () => {},
    setLoadout: () => {},
    bleedOut: () => {},
    revive: () => {},
    allowRespawn: () => {},
    newMatch: () => {},
  };
  f.match = new ZombieMatch(host, navMesh, MAP());
  spots.forEach((p, i) => {
    f.feet.set(i + 1, p);
    f.match.join(i + 1, `P${i + 1}`);
  });
  const inside = new Map<number, boolean>();
  f.step = (seconds, each) => {
    for (let i = 0; i < seconds * 20; i++) {
      f.t += 50;
      f.match.tick(0.05, [...f.feet].map(([id, feet]) => ({ id, feet, grounded: true, alive: true })));
      for (const z of f.match.zombies.values()) {
        const now = insideWall(MAP(), z.pos);
        if (now && inside.get(z.id) === false) {
          const near = MAP().barricadas.reduce((a, g) => (Math.hypot(g.centro[0] - z.pos[0], g.centro[2] - z.pos[2]) < Math.hypot(a.centro[0] - z.pos[0], a.centro[2] - z.pos[2]) ? g : a));
          f.crossings.push({ id: z.id, gap: near.id, t: f.t });
        }
        inside.set(z.id, now);
      }
      each?.();
    }
  };
  f.of = (t) => f.events.filter((e) => e.t === t) as never;
  return f;
}

/** Builds the barricades of `ids` with player 1 (plenty of money; quick to build). */
function build(f: Fake, ids: string[]) {
  (f.match.parts.get(1) as { money: number }).money = 100_000;
  const home = f.feet.get(1)!;
  for (const id of ids) {
    f.feet.set(1, byGap(gap(id)));
    f.step(0.1);
    f.match.barricadeWork(1, gap(id), true);
    f.step(ZOMBIE.barricadas.erguerSegundos + 0.15);
    expect(f.match.barricade(gap(id))).toMatchObject({ built: true, boards: ZOMBIE.barricadas.tabuas });
  }
  f.feet.set(1, home);
}

/** A first wave of `n` zombies of one kind (all walking), with room for all of them at once. */
function waveOf(kind: 'comum' | 'brutamontes', n: number) {
  Object.assign(ZOMBIE, { inicioSegundos: 8, maxVivosBase: 40, maxVivosTeto: 40 });
  Object.assign(ZOMBIE.ondas[0], { zumbis: n, intervalo: 0.3, corrida: 0, tipos: kind === 'comum' ? {} : { brutamontes: 1 } });
  Object.assign(ZOMBIE.barricadas, { erguerSegundos: 0.2, repararSegundos: 0.1 });
}

describe('o mapa do modo zumbi', () => {
  it('o cemitério é só do modo zumbi, e o modo zumbi é só do cemitério', async () => {
    const data: Record<string, MapData> = {};
    for (const id of OFFICIAL_MAPS) data[id] = (await officialRuntime(id)).data;
    expect(data.cemiterio.exclusivo).toBe('zumbi');
    // A map made for one mode is played in that mode only; the other modes (and their bots) get every open map.
    for (const m of GAME_MODE_IDS) {
      const maps = OFFICIAL_MAPS.filter((id) => modeAllowsMap(m, data[id].exclusivo));
      expect({ m, maps }).toEqual({ m, maps: m === 'zumbi' ? ['cemiterio'] : OFFICIAL_MAPS.filter((id) => id !== 'cemiterio') });
    }
    // The mode has its data on every map it's played on; the haunted town's is gone.
    for (const id of OFFICIAL_MAPS) expect({ id, zumbi: !!data[id].zumbi }).toEqual({ id, zumbi: id === 'cemiterio' });
    expect(Object.keys(ZOMBIE.mapas)).toEqual(['cemiterio']);
    expect(MODE_RULES.zumbi.bots).toBe(true);
  });

  it('o muro cerca o pátio: os zumbis surgem só do lado de fora, o caixão e os chefes têm lugar limpo', () => {
    const q = new NavMeshQuery(navMesh);
    const HALF = { x: 2, y: 4, z: 2 };
    for (const p of MAP().surgir) {
      expect(insideWall(MAP(), p)).toBe(false);
      const c = q.findClosestPoint({ x: p[0], y: p[1], z: p[2] }, { halfExtents: HALF });
      expect({ p, off: Math.hypot(c.point.x - p[0], c.point.z - p[2]) < 0.3 }).toEqual({ p, off: true });
    }
    // Every boss rises on open ground: at least 3 m clear in every direction (the mayor charges east).
    for (const [boss, p] of Object.entries(MAP().chefe)) {
      const c = q.findClosestPoint({ x: p[0], y: p[1], z: p[2] }, { halfExtents: HALF });
      expect({ boss, snap: Math.hypot(c.point.x - p[0], c.point.z - p[2]) < 0.3 }).toEqual({ boss, snap: true });
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        const r = q.raycast(c.polyRef, c.point, { x: c.point.x + Math.sin(ang) * 20, y: c.point.y, z: c.point.z + Math.cos(ang) * 20 });
        expect({ boss, a, clear: Math.min(1, r.t) * 20 >= 3 }).toEqual({ boss, a, clear: true });
      }
    }
    const east = MAP().chefe.prefeito;
    const c = q.findClosestPoint({ x: east[0], y: east[1], z: east[2] }, { halfExtents: HALF });
    expect(Math.min(1, q.raycast(c.polyRef, c.point, { x: c.point.x + 20, y: c.point.y, z: c.point.z }).t) * 20).toBeGreaterThanOrEqual(ZOMBIE.chefes.prefeito.investida!.maximo);
    expect(insideWall(MAP(), MAP().caixa.slice(0, 3) as unknown as Vec3)).toBe(true);
    q.destroy();
  });

  it('cada brecha do muro é feita de polígonos próprios com a sua flag; tirar a flag do filtro fecha a brecha', () => {
    const tile = navMesh.getTile(0);
    const n = tile.header()!.polyCount();
    const byFlags = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      const fl = tile.polys(i).flags();
      byFlags.set(fl, (byFlags.get(fl) ?? 0) + 1);
      expect(fl & WALK_FLAG).toBe(WALK_FLAG);
    }
    MAP().barricadas.forEach((_, i) => expect({ i, polys: (byFlags.get(WALK_FLAG | gateFlag(i)) ?? 0) > 0 }).toEqual({ i, polys: true }));
    expect([...byFlags.keys()].sort((a, b) => a - b)).toEqual([WALK_FLAG, ...MAP().barricadas.map((_, i) => WALK_FLAG | gateFlag(i))]);
    // Paths into the yard from the north field: through the nearest gap; with it shut, through another; all shut, none.
    const q = new NavMeshQuery(navMesh);
    const route = (exclude: number) => {
      const filter = new QueryFilter();
      filter.includeFlags = 0xffff;
      filter.excludeFlags = exclude;
      const r = q.computePath({ x: -6, y: 0, z: -24.3 }, { x: 0, y: 0, z: 2 }, { filter, halfExtents: { x: 2, y: 4, z: 2 } });
      const end = r.path.at(-1)!;
      return { reached: Math.hypot(end.x, end.z - 2) < 1, gaps: MAP().barricadas.filter((g) => r.path.some((p) => Math.hypot(p.x - g.centro[0], p.z - g.centro[2]) < 2)).map((g) => g.id) };
    };
    expect(route(0)).toEqual({ reached: true, gaps: ['noroeste'] });
    expect(route(gateFlag(gap('noroeste'))).gaps).not.toContain('noroeste');
    const all = MAP().barricadas.reduce((m, _, i) => m | gateFlag(i), 0);
    expect(route(all).reached).toBe(false);
    expect(route(all & ~gateFlag(gap('portao')))).toEqual({ reached: true, gaps: ['portao'] });
    q.destroy();
  });
});

describe('barricadas (motor, relógio falso)', () => {
  it('erguer custa, leva o tempo de segurar E e já vem com todas as tábuas; longe, sem dinheiro, inteira ou com gente no vão, não', () => {
    Object.assign(ZOMBIE, { inicioSegundos: 60 });
    const west = gap('oeste');
    const f = fake([byGap(west), [0, 0.1, 0]]);
    f.step(0.2);
    // Not a gap, or out of reach: nothing.
    for (const i of [-1, 99, 1.5]) f.match.barricadeWork(1, i, true);
    f.match.barricadeWork(2, west, true);
    expect(f.of('zbarwork')).toHaveLength(0);
    // Holding E: the work starts, and after erguerSegundos it's up and paid.
    f.match.barricadeWork(1, west, true);
    expect(f.of('zbarwork').at(-1)).toMatchObject({ i: west, by: 1, until: f.t + ZOMBIE.barricadas.erguerSegundos * 1000 });
    f.step(ZOMBIE.barricadas.erguerSegundos - 0.2);
    expect(f.match.barricade(west)!.built).toBe(false);
    f.step(0.3);
    expect(f.of('zbar').at(-1)).toMatchObject({ i: west, fx: 'build', by: 1, built: true, boards: ZOMBIE.barricadas.tabuas, hp: ZOMBIE.barricadas.vidaTabua, money: ZOMBIE.dinheiroInicial - ZOMBIE.barricadas.custo });
    expect(f.of('zbarwork').at(-1)).toMatchObject({ i: west, by: 1, until: 0 });
    expect(f.match.sync().bars[west]).toEqual({ built: true, boards: ZOMBIE.barricadas.tabuas, hp: ZOMBIE.barricadas.vidaTabua });
    // Whole: holding E there does nothing.
    const events = f.events.length;
    f.match.barricadeWork(1, west, true);
    expect(f.events.length).toBe(events);
    // $200 left: another one ($300) can't be paid for.
    const east = gap('leste');
    f.feet.set(1, byGap(east));
    f.step(0.1);
    f.match.barricadeWork(1, east, true);
    expect(f.events.length).toBe(events);
    // Letting go stops it; walking away stops it too.
    (f.match.parts.get(1) as { money: number }).money = 1000;
    f.match.barricadeWork(1, east, true);
    f.match.barricadeWork(1, east, false);
    expect(f.of('zbarwork').at(-1)).toMatchObject({ i: east, until: 0 });
    f.match.barricadeWork(1, east, true);
    f.feet.set(1, [0, 0.1, 0]);
    f.step(0.2);
    expect(f.of('zbarwork').at(-1)).toMatchObject({ i: east, until: 0 });
    expect(f.match.barricade(east)!.built).toBe(false);
    // Somebody standing in the gap: it waits (a gap never shuts on anyone).
    f.feet.set(1, byGap(east));
    f.feet.set(2, MAP().barricadas[east].centro);
    f.step(0.1);
    f.match.barricadeWork(1, east, true);
    f.step(ZOMBIE.barricadas.erguerSegundos + 0.5);
    expect(f.match.barricade(east)!.built).toBe(false);
    f.feet.set(2, [0, 0.1, 0]);
    f.step(0.2);
    expect(f.match.barricade(east)!.built).toBe(true);
  });

  it('com as outras brechas fechadas, os zumbis comuns contornam o muro e entram todos pelo portão (a zona de abate), sem bater nas tábuas', () => {
    waveOf('comum', 12);
    const f = fake([[0, 0.7, -8.5]]);
    build(f, ['oeste', 'leste', 'noroeste', 'nordeste']);
    for (let s = 0; s < 150 && f.crossings.length < 8; s++) f.step(1);
    expect(f.crossings.length).toBeGreaterThanOrEqual(8);
    expect(new Set(f.crossings.map((c) => c.gap))).toEqual(new Set(['portao']));
    // With a way open, nobody tears at the boards.
    expect(f.of('zbar').filter((m) => m.fx === 'hit' || m.fx === 'break')).toHaveLength(0);
  }, 30_000);

  it('com tudo fechado, os zumbis comuns atacam as tábuas até arrombar e só então entram (por ali)', () => {
    waveOf('comum', 10);
    Object.assign(ZOMBIE.barricadas, { vidaTabua: 20 });
    const f = fake([[0, 0.7, -8.5]]);
    build(f, ['portao', 'oeste', 'leste', 'noroeste', 'nordeste']);
    for (let s = 0; s < 150 && f.crossings.length < 3; s++) f.step(1);
    const hits = f.of('zbar').filter((m) => m.fx === 'hit');
    const breaks = f.of('zbar').filter((m) => m.fx === 'break');
    expect(hits.length).toBeGreaterThan(0);
    expect(breaks.length).toBeGreaterThan(0);
    expect(f.crossings.length).toBeGreaterThan(0);
    // Nobody got in before the first barricade fell, and they came in where one fell.
    const firstBreak = f.events.findIndex((m) => m.t === 'zbar' && m.fx === 'break');
    const brokenAt = new Set(breaks.map((b) => MAP().barricadas[b.i].id));
    expect(f.crossings[0].t).toBeGreaterThanOrEqual(f.times[firstBreak]);
    for (const c of f.crossings) expect(brokenAt.has(c.gap)).toBe(true);
    // Every blow took a plain zombie's damage off the boards (a hit never empties a barricade at once).
    for (const h of hits) expect(h.boards).toBeGreaterThan(0);
  }, 30_000);

  it('o Segurança arromba a brecha fechada no caminho mesmo com outras abertas; o zumbi comum, no mesmo lugar, dá a volta', () => {
    const west = gap('oeste');
    for (const kind of ['comum', 'brutamontes'] as const) {
      waveOf(kind, 3);
      Object.assign(ZOMBIE.barricadas, { vidaTabua: 40 });
      // Out of the ground right in front of the west gap, the player inside right behind it.
      MAP().surgir = [[-26, 0, 5]];
      const f = fake([[-10, 0.1, 5]]);
      build(f, ['oeste']);
      for (let s = 0; s < 120 && f.crossings.length < 1; s++) f.step(1);
      expect(f.crossings.length).toBeGreaterThan(0);
      const tore = f.of('zbar').filter((m) => m.i === west && (m.fx === 'hit' || m.fx === 'break'));
      if (kind === 'brutamontes') {
        expect(tore.some((m) => m.fx === 'break')).toBe(true);
        expect(f.crossings[0].gap).toBe('oeste');
      } else {
        expect(tore).toHaveLength(0);
        expect(f.crossings[0].gap).not.toBe('oeste');
      }
      f.match.dispose();
      Object.assign(ZOMBIE, structuredClone(ORIGINAL));
    }
  }, 40_000);

  it('repregar é de graça, paga pouco e tem teto por onda; a barricada dura entre ondas e some numa partida nova', () => {
    waveOf('brutamontes', 2);
    Object.assign(ZOMBIE, { intervaloSegundos: 4, fimSegundos: 0.3 });
    Object.assign(ZOMBIE.barricadas, { vidaTabua: 40, reparoDinheiro: 10, reparoTetoOnda: 25 });
    const west = gap('oeste');
    MAP().surgir = [[-26, 0, 5]];
    const f = fake([[-10, 0.1, 5]]);
    build(f, ['oeste']);
    // The bruisers tear it down; then they're shot, and the wave is over.
    for (let s = 0; s < 90 && !f.of('zbar').some((m) => m.fx === 'break'); s++) f.step(1);
    expect(f.match.barricade(west)).toEqual({ built: true, boards: 0, hp: 0 });
    for (let s = 0; s < 60 && f.match.phase === 'wave'; s++) f.step(1, () => {
      for (const z of [...f.match.zombies.values()]) if (f.t >= z.riseUntil) f.match.damage(z.id, 1, 1e9, 'head');
    });
    expect(f.match.phase).toBe('break');
    // Nailing them back during the break: free, $10 a board up to $25 this wave.
    const money = f.match.info(1)!.money;
    f.feet.set(1, byGap(west));
    f.step(0.1);
    f.match.barricadeWork(1, west, true);
    f.step(ZOMBIE.barricadas.repararSegundos * ZOMBIE.barricadas.tabuas + 0.5);
    const nails = f.of('zbar').filter((m) => m.fx === 'nail');
    expect(nails.map((m) => m.boards)).toEqual([1, 2, 3, 4, 5]);
    expect(nails.map((m) => m.award ?? 0)).toEqual([10, 10, 5, 0, 0]);
    expect(f.match.info(1)!.money).toBe(money + 25);
    expect(f.match.barricade(west)).toEqual({ built: true, boards: ZOMBIE.barricadas.tabuas, hp: ZOMBIE.barricadas.vidaTabua });
    // The next wave: still there.
    for (let s = 0; s < 10 && f.match.phase !== 'wave'; s++) f.step(1);
    expect(f.match.phase).toBe('wave');
    expect(f.match.barricade(west)!.boards).toBeGreaterThan(0);
    // Nobody standing: the match is over, and the next one starts with no barricades.
    f.match.died(1);
    f.step(1);
    expect(f.of('zbar').at(-1)).toMatchObject({ i: west, fx: 'reset', built: false, boards: 0 });
    expect(f.match.sync().bars.every((b) => !b.built && b.boards === 0)).toBe(true);
  }, 40_000);
});

describe('armas danificadas do caixão', () => {
  it('a chance de vir danificada cai com a raridade e nunca zera; o defeito segue os pesos; a faca só perde dano', () => {
    const rng = seeded(11);
    const d = ZOMBIE.caixa.danificada;
    const rates: number[] = [];
    for (const r of RARITIES.filter((x) => x !== 'inicial')) {
      const gun = BOX_ITEMS.find((i) => i.raridade === r && i.arma !== 'faca') ?? BOX_ITEMS.find((i) => i.raridade === r)!;
      const counts = { none: 0, municao: 0, dano: 0, ambos: 0 };
      const N = 20_000;
      for (let k = 0; k < N; k++) counts[rollFlaw(rng, gun) ?? 'none']++;
      const rate = 1 - counts.none / N;
      rates.push(rate);
      expect(flawChance(gun)).toBe(d.chance[r]);
      expect(Math.abs(rate - d.chance[r])).toBeLessThan(0.015);
      if (gun.arma !== 'faca') {
        const broken = N - counts.none;
        for (const flaw of ['municao', 'dano', 'ambos'] as const) expect(Math.abs(counts[flaw] / broken - d.tipos[flaw])).toBeLessThan(0.04);
      }
    }
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeLessThan(rates[i - 1]);
    expect(rates.at(-1)!).toBeGreaterThan(0.02);
    // The legendary saber: damaged sometimes, and then always with less damage.
    const sabre = itemOf('sabre')!;
    const seen = new Set<string>();
    for (let k = 0; k < 5000; k++) seen.add(rollFlaw(rng, sabre) ?? 'none');
    expect(seen).toEqual(new Set(['none', 'dano']));
  });

  it('penalidades: menos dano (e os dois) no multiplicador que o servidor usa; menos munição no pente e na reserva; nada de conserto', () => {
    const d = ZOMBIE.caixa.danificada;
    const rifle = itemOf('rifleCompleto')!;
    const intact: ZItems = withItem(startItems(), rifle, null);
    expect(weaponMul(intact, 'rifle')).toBe(rarityMul('lendario'));
    expect(weaponMul(withItem(startItems(), rifle, 'dano'), 'rifle')).toBeCloseTo(rarityMul('lendario') * d.dano);
    expect(weaponMul(withItem(startItems(), rifle, 'ambos'), 'rifle')).toBeCloseTo(rarityMul('lendario') * d.dano);
    expect(weaponMul(withItem(startItems(), rifle, 'municao'), 'rifle')).toBe(rarityMul('lendario'));
    // The secondary's flaw doesn't touch the primary.
    expect(weaponMul(withItem(intact, itemOf('liquidificador')!, 'dano'), 'rifle')).toBe(rarityMul('lendario'));
    const saber = withItem(startItems(), itemOf('sabre')!, 'dano');
    expect(weaponMul(saber, 'faca')).toBeCloseTo(rarityMul('lendario') * d.dano);
    // Fewer rounds: the magazine and the mode's bigger reserve, cut by the flaw.
    const g = gunStats('rifle', rifle.melhorias);
    const full = zombieGunData(g, null);
    for (const flaw of ['municao', 'ambos'] as const) {
      const held = zombieGunData(g, flaw);
      expect(held.pente).toBe(Math.max(1, Math.round(g.pente * d.pente)));
      expect(held.reserva).toBe(Math.max(1, Math.round(g.reserva * ZOMBIE.armas.municaoReserva * d.reserva)));
      expect(held.pente).toBeLessThan(full.pente);
    }
    expect(zombieGunData(g, 'dano')).toEqual(full);
    // The flaw goes with the weapon in the loadout and survives the network.
    const lo = zombieLoadout(withItem(saber, rifle, 'municao'));
    expect(lo.danificadas).toEqual({ rifle: 'municao', faca: 'dano' });
    expect(sanitizeLoadout(JSON.parse(JSON.stringify(lo)))).toEqual(lo);
    expect(zombieLoadout(startItems()).danificadas).toBeUndefined();
    // Another weapon in the slot clears its flaw; a damaged copy in hand can come out of the coffin again (whole,
    // with luck), an intact one never.
    expect(withItem(withItem(startItems(), rifle, 'dano'), itemOf('rifleFirme')!, null).danificadas).toBeUndefined();
    const rng = seeded(5);
    const damagedHeld = withItem(startItems(), rifle, 'dano');
    let again = 0;
    for (let k = 0; k < 4000; k++) {
      if (rollBox(rng, damagedHeld).id === 'rifleCompleto') again++;
      expect(rollBox(rng, intact).id).not.toBe('rifleCompleto');
    }
    expect(again).toBeGreaterThan(0);
  });

  it('o caixão entrega a arma danificada no slot dela, com o defeito, e uma rodada inteira depois tira o defeito', () => {
    Object.assign(ZOMBIE, { inicioSegundos: 1000 });
    Object.assign(ZOMBIE.caixa, { custo: 100, girarSegundos: 0.2, ofertaSegundos: 0.1 });
    const d = ZOMBIE.caixa.danificada;
    for (const r of Object.keys(d.chance) as (keyof typeof d.chance)[]) d.chance[r] = 1;
    d.tipos = { municao: 1, dano: 0, ambos: 0 };
    const [x, y, z] = MAP().caixa;
    const f = fake([[x - 1, y + 0.1, z]]);
    f.step(0.2);
    f.match.useBox(1);
    f.step(0.25);
    const offer = f.of('zbox').at(-1)!;
    const it = itemOf(offer.item)!;
    expect(offer).toMatchObject({ state: 'offer', flaw: it.arma === 'faca' ? 'dano' : 'municao' });
    f.match.useBox(1);
    const items = f.match.itemsOf(1);
    expect(items.danificadas).toEqual({ [itemSlot(it)]: offer.flaw });
    expect(f.match.info(1)!.items).toEqual(items);
    expect(f.match.sync().box).toEqual({ state: 'idle', by: null, item: null, flaw: null, until: 0 });
    // Intact rolls from now on, until that slot gets a new weapon (the flaw goes with the old one).
    for (const r of Object.keys(d.chance) as (keyof typeof d.chance)[]) d.chance[r] = 0;
    (f.match.parts.get(1) as { money: number }).money = 100_000;
    for (let k = 0; k < 400 && f.match.itemsOf(1).danificadas; k++) {
      f.match.useBox(1);
      f.step(0.25);
      const o = f.of('zbox').at(-1)!;
      expect(o).toMatchObject({ state: 'offer', flaw: null });
      if (itemSlot(itemOf(o.item)!) === itemSlot(it)) f.match.useBox(1);
      else f.step(0.2);
    }
    expect(f.match.itemsOf(1).danificadas).toBeUndefined();
  });
});

describe('espinhos na grade do muro e na sebe', () => {
  it('só conta quem subiu: a beirada e as barras do muro (fora das brechas) e a sebe', () => {
    const m = MAP();
    // On the ground the capsule (radius 0.35) never gets this close to the lines.
    expect(thornsAt(m, [5, 0, 18.6])).toBeNull();
    expect(thornsAt(m, [5, 0.6, 18.3])).toBe('muro');
    expect(thornsAt(m, [-20.3, 1.4, -6])).toBe('muro');
    // The gate's gap is open: standing there (on a barricade's step) isn't the wall.
    expect(thornsAt(m, [0, 0.6, 18])).toBeNull();
    expect(thornsAt(m, [0, 2.6, 30])).toBe('sebe');
    expect(thornsAt(m, [32.2, 1.2, 4])).toBe('sebe');
    // Up on a grave in the field, far from both: not thorns.
    expect(thornsAt(m, [0, 1.1, 24])).toBeNull();
  });

  it('sobe na beirada: leva o dano de espinho a cada segundo lá e sangra por 10 s, 2 por segundo', () => {
    const hits: [id: number, amount: number, kind?: string][] = [];
    const f = fake([[0, 0, 0]], 3, (id, amount, _from, kind) => hits.push([id, amount, kind]));
    const t = ZOMBIE.espinhos;
    f.feet.set(1, [5, 0.6, 18.3]);
    f.step(2.5);
    // 0 s, 1 s, 2 s on the ledge: three thorn hits, the bleeding already ticking.
    expect(hits.filter(([, a]) => a === t.dano)).toHaveLength(3);
    expect(f.of('zbleed').at(-1)).toMatchObject({ id: 1 });
    f.feet.set(1, [5, 0, 15]);
    hits.length = 0;
    f.step(t.sangraSegundos + 1);
    // Back on the ground: only the bleeding, until 10 s after the last thorn hit.
    expect(hits.every(([id, a, k]) => id === 1 && a === t.sangraDano && k === 'thorns')).toBe(true);
    const ticks = hits.length;
    expect(ticks).toBeGreaterThanOrEqual(t.sangraSegundos - 3);
    expect(ticks).toBeLessThanOrEqual(t.sangraSegundos);
    hits.length = 0;
    f.step(3);
    expect(hits).toHaveLength(0);
  });

  it('encostar de novo renova o sangramento, sem somar', () => {
    const hits: number[] = [];
    const f = fake([[0, 0, 0]], 3, (_id, amount) => hits.push(amount));
    const t = ZOMBIE.espinhos;
    const ledge: Vec3 = [5, 0.6, 18.3];
    f.feet.set(1, ledge);
    f.step(0.1);
    f.feet.set(1, [5, 0, 15]);
    f.step(5);
    f.feet.set(1, ledge);
    f.step(0.1);
    f.feet.set(1, [5, 0, 15]);
    hits.length = 0;
    f.step(t.sangraSegundos + 2);
    // One bleed a second (not two) for the renewed 10 s, then nothing.
    expect(hits.every((a) => a === t.sangraDano)).toBe(true);
    expect(hits.length).toBeGreaterThanOrEqual(t.sangraSegundos - 1);
    expect(hits.length).toBeLessThanOrEqual(t.sangraSegundos);
  });
});

describe('quem entra com a onda em andamento', () => {
  /** A match on a fake clock whose host remembers who may come back and the stats. */
  function waitMatch() {
    const w = { t: 0, allowed: [] as number[], stats: [] as [number, ZStat][], xp: new Map<number, number>() };
    const host: ZombieHost = {
      now: () => w.t,
      rng: seeded(5),
      emit: () => {},
      hurt: () => {},
      giveXp: (id, xp) => w.xp.set(id, (w.xp.get(id) ?? 0) + xp),
      setLoadout: () => {},
      bleedOut: () => {},
      revive: () => {},
      allowRespawn: (id) => w.allowed.push(id),
      newMatch: () => {},
      stat: (id, s) => w.stats.push([id, s]),
    };
    const match = new ZombieMatch(host, navMesh, MAP());
    const tick = (seconds: number, alive: Record<number, boolean>) => {
      for (let i = 0; i < seconds * 20; i++) {
        w.t += 50;
        match.tick(0.05, Object.entries(alive).map(([id, a]) => ({ id: Number(id), feet: [Number(id) * 1.5, 0.1, 0] as Vec3, grounded: true, alive: a })));
      }
    };
    return { w, match, tick };
  }

  it('fica de fora até o intervalo, como quem morreu, e volta nele', () => {
    const { w, match, tick } = waitMatch();
    match.join(1, 'P1');
    tick(ZOMBIE.inicioSegundos + 1, { 1: true });
    expect(match.phase).toBe('wave');
    match.join(2, 'P2');
    expect(match.parts.get(2)).toMatchObject({ state: 'dead', waiting: true });
    // During the wave the host keeps them out: still waiting.
    tick(2, { 1: true, 2: false });
    expect(match.parts.get(2)).toMatchObject({ state: 'dead', waiting: true });
    expect(w.allowed).not.toContain(2);
    // The wave ends: they may come in now, and once in they play.
    (match as unknown as { endWave(): void }).endWave();
    expect(match.phase).toBe('break');
    expect(w.allowed).toContain(2);
    tick(0.1, { 1: true, 2: true });
    expect(match.parts.get(2)).toMatchObject({ state: 'up', waiting: false });
  });

  it('antes da primeira onda (e no intervalo) entra na hora', () => {
    const { match } = waitMatch();
    match.join(1, 'P1');
    match.join(2, 'P2');
    expect(match.phase).toBe('countdown');
    expect(match.parts.get(2)).toMatchObject({ state: 'up', waiting: false });
  });

  it('quem ainda espera quando a partida acaba não ganha a vitória nem conta a partida', () => {
    const { w, match, tick } = waitMatch();
    match.join(1, 'P1');
    tick(ZOMBIE.inicioSegundos + 1, { 1: true });
    match.join(2, 'P2');
    (match as unknown as { finish(won: boolean): void }).finish(true);
    expect(w.xp.get(1)).toBeGreaterThanOrEqual(ZOMBIE.xp.vitoria);
    expect(w.xp.get(2) ?? 0).toBe(0);
    expect(w.stats.filter(([id]) => id === 2)).toEqual([]);
    expect(w.stats.some(([id, s]) => id === 1 && s.e === 'end')).toBe(true);
  });
});
