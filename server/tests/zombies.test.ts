// Zumbi mode: the rules (shared/zombies.ts), the match engine with a fake clock (shared/zombieMatch.ts over
// the baked navmesh of the mode's cemetery: waves, money, the coffin, revives, winning and losing), the baked
// navmesh being up to date with the map's code, and the mode on the real server (start loadout, shots at
// zombies checked against the server's positions, money and account XP, the coffin's weapon, revives), with the
// weapon progression around it (a maxed-out account still starts with the plain rifle, the coffin's weapons hit
// with their own upgrades, kills give account XP only), the bosses' moves against several players, joining in
// the middle of a wave and bleeding out until the break. The cemetery's barricades and the coffin's damaged
// weapons have their own file (zombieBarricades.test.ts).
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { importNavMesh, init, type NavMesh } from 'recast-navigation';
import nav from '@shared/data/navmesh/cemiterio.json';
import { gunStats, resolveLoadout } from '@shared/arsenal';
import { modeAllowsMap, MODE_RULES } from '@shared/modes';
import { MAX_LEVELS, progOf, PROG_WEAPONS, xpForLevel, type ArsenalChoice, type ProgWeapon } from '@shared/progression';
import { FLAG, type ServerMsg, type Vec3 } from '@shared/protocol';
import {
  BOX_ITEMS,
  gunDamageToZombie,
  itemOf,
  itemSlot,
  killMoney,
  killXp,
  kindScale,
  knifeDamageToZombie,
  rarityMul,
  rollBox,
  startItems,
  waveSpec,
  WAVES,
  withItem,
  Z_KINDS,
  ZOMBIE,
  zombieGunData,
  zombieLoadout,
  zombieProblems,
  type BossId,
  type ZFlaw,
  type ZItems,
  type ZKind,
} from '@shared/zombies';
import { ZombieMatch, type ZombieHost, type ZStat } from '@shared/zombieMatch';
import { emptyDelta } from '../accounts';
import { addZombieStat, deltaIsEmpty, mergeDelta, type LiveAccount } from '../progress';
import { LETHAL_DAMAGE } from '@shared/weapons';
import type { GameServer } from '../app';
import { Browser, Player, setWeaponXp, sleep, startTestServer } from './helpers';
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
    // Only on maps made for it (the cemetery's data says exclusivo: zumbi).
    expect([modeAllowsMap('zumbi', 'zumbi'), modeAllowsMap('zumbi', null)]).toEqual([true, false]);
  });

  it('todo mundo começa com o rifle sem melhorias e a faca comum', () => {
    expect(zombieLoadout(startItems())).toEqual({ primaria: 'rifle', secundaria: null, faca: 'faca', ativas: { rifle: [], pistola: [], smg: [], faca: [], granada: [] } });
    // The coffin's saber is the saber knife.
    expect(zombieLoadout({ ...startItems(), faca: 'sabre' })).toMatchObject({ faca: 'sabre', ativas: { faca: [] } });
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

  it('as secundárias novas no caixão, sem melhorias: grampeador e revólver comuns, furadeira e garrucha raras, pistolão épico', () => {
    const want = { grampeador: 'comum', revolver: 'comum', furadeira: 'raro', garrucha: 'raro', pistolao: 'epico' } as const;
    for (const [id, raridade] of Object.entries(want) as [keyof typeof want, (typeof want)[keyof typeof want]][]) {
      const it = itemOf(id)!;
      expect({ id, it }).toEqual({ id, it: { id, arma: id, melhorias: [], raridade } });
      expect(itemSlot(it)).toBe('secundaria');
      // In the hand: the secondary slot, the rifle kept as the primary.
      expect(zombieLoadout(withItem(startItems(), it, null))).toMatchObject({ primaria: 'rifle', secundaria: id });
    }
    // The coffin hands each of them out.
    const rng = seeded(11);
    const seen = new Set<string>();
    for (let i = 0; i < 6000; i++) seen.add(rollBox(rng, startItems()).id);
    for (const id of Object.keys(want)) expect({ id, seen: seen.has(id) }).toEqual({ id, seen: true });
    // A damaged garrucha with fewer rounds still has one shell in the barrels.
    expect(zombieGunData(gunStats('garrucha'), 'municao').pente).toBe(1);
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
    const fresh = await bakeNavmesh('cemiterio');
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
  /** What the match reported for each player's zumbi stats. */
  stats: Map<number, ZStat[]>;
  step(seconds: number, each?: () => void): void;
  /** Steps until `done` (at most 10 minutes of game time). */
  until(done: () => boolean, each?: () => void): void;
  of<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }>[];
}

/** A match with players standing at `spots`, on a fake clock; damage takes host-side health like Session does. */
function fakeMatch(spots: Vec3[], seed = 1): Fake {
  const f = { t: 0, events: [] as ServerMsg[], hp: new Map<number, number>(), xp: new Map<number, number>(), loadouts: new Map<number, unknown>(), feet: new Map<number, Vec3>(), stats: new Map<number, ZStat[]>() } as Fake;
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
    stat: (id, s) => f.stats.set(id, [...(f.stats.get(id) ?? []), s]),
  };
  f.match = new ZombieMatch(host, navMesh, ZOMBIE.mapas.cemiterio!);
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
    // Checked every tick: a short phase (a 0.2 s break) can't slip by between two checks.
    for (let i = 0; i < 600 * 20 && !done(); i++) f.step(0.05, each);
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

  it('as estatísticas de cada jogador: abates, onda sobrevivida, queda e o fim da partida', () => {
    quick();
    const f = fakeMatch([STREET]);
    f.until(() => f.match.phase === 'break', killAll(f));
    const mine = () => f.stats.get(1) ?? [];
    expect(mine().filter((s) => s.e === 'kill')).toHaveLength(waveSpec(1, 1).total);
    expect(mine()).toContainEqual({ e: 'kill', kind: 'comum', how: 'head' });
    expect(mine().filter((s) => s.e === 'wave')).toHaveLength(1);
    // Wave 2 with nobody shooting: down, and alone nobody revives them: a death, and the end.
    f.until(() => f.of('zend').length > 0);
    expect(mine().slice(-3)).toEqual([{ e: 'down' }, { e: 'death' }, { e: 'end', won: false, wave: 2, dead: false }]);
  });

  it('a conta soma os eventos: chefe pelo nome, abate pelo golpe e a melhor onda como máximo', () => {
    const a = { delta: emptyDelta() } as LiveAccount;
    const events: ZStat[] = [
      { e: 'kill', kind: 'comum', how: 'groin' },
      { e: 'kill', kind: 'noiva', how: 'knife' },
      { e: 'kill', kind: 'inchado', how: 'blast' },
      { e: 'revive' },
      { e: 'coffin' },
      { e: 'death' },
      { e: 'end', won: false, wave: 5, dead: false },
      { e: 'end', won: true, wave: 12, dead: false },
    ];
    for (const s of events) addZombieStat(a, s);
    expect(a.delta.zumbi).toMatchObject({ kills: 3, groinKills: 1, knifeKills: 1, headshots: 0, bosses: 1, noivaKills: 1, coveiroKills: 0, revives: 1, coffinRolls: 1, deaths: 1, matches: 2, wins: 1, bestWave: 12 });
    // Zombies aren't players: the player-vs-player numbers don't move.
    expect(a.delta.kills).toBe(0);
    // A write that failed comes back: the totals add up, the best wave stays the highest.
    const retry = emptyDelta();
    expect(deltaIsEmpty(retry)).toBe(true);
    addZombieStat({ delta: retry } as LiveAccount, { e: 'end', won: false, wave: 3, dead: false });
    expect(deltaIsEmpty(retry)).toBe(false);
    mergeDelta(a.delta, retry);
    expect(a.delta.zumbi).toMatchObject({ matches: 3, wins: 1, bestWave: 12 });
  });

  it('as figurinhas do zumbi: Voto Nulo, Divórcio, Churrasco Coletivo, Marceneiro e Vitória do Além', () => {
    const a = { delta: emptyDelta() } as LiveAccount;
    const events: ZStat[] = [
      { e: 'kill', kind: 'prefeito', how: 'groin' },
      { e: 'kill', kind: 'prefeito', how: 'head' },
      { e: 'kill', kind: 'noiva', how: 'knife' },
      { e: 'chain', kills: 6 },
      { e: 'chain', kills: 2 },
      { e: 'board' },
      { e: 'board' },
      { e: 'end', won: true, wave: 12, dead: true },
      { e: 'end', won: false, wave: 4, dead: true },
    ];
    for (const s of events) addZombieStat(a, s);
    expect(a.delta.album.add).toEqual({ 'voto-nulo': 1, divorcio: 1, marceneiro: 2, 'vitoria-do-alem': 1 });
    expect(a.delta.album.max).toEqual({ 'churrasco-coletivo': 6 });
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
    // Stats: two downs and a death for 1, a revive for 2.
    expect(f.stats.get(1)!.filter((s) => s.e === 'down')).toHaveLength(2);
    expect(f.stats.get(1)!.filter((s) => s.e === 'death')).toHaveLength(1);
    expect(f.stats.get(2)).toContainEqual({ e: 'revive' });
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

  it('a caixa: sem dinheiro não gira; gira, oferece, entrega no slot certo; nunca sai do lugar', () => {
    quick();
    for (const t of Object.values(ZOMBIE.tipos)) t.dano = 0;
    for (const r of Object.keys(ZOMBIE.caixa.danificada.chance)) ZOMBIE.caixa.danificada.chance[r as keyof typeof ZOMBIE.caixa.danificada.chance] = 0;
    const f = fakeMatch([STREET]);
    const [x, y, z] = ZOMBIE.mapas.cemiterio!.caixa;
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
    expect(f.of('zbox').at(-1)).toMatchObject({ state: 'rolling', by: 1, item: null, flaw: null, money: 5000 - ZOMBIE.caixa.custo });
    f.step(ZOMBIE.caixa.girarSegundos + 0.1);
    const offer = f.of('zbox').at(-1)!;
    expect(offer).toMatchObject({ state: 'offer', flaw: null });
    const it = itemOf(offer.item)!;
    expect(it.raridade).not.toBe('inicial');
    f.match.useBox(1);
    expect(f.match.itemsOf(1)[itemSlot(it)]).toBe(it.id);
    expect(f.match.itemsOf(1).danificadas).toBeUndefined();
    expect(f.loadouts.get(1)).toEqual(zombieLoadout(f.match.itemsOf(1)));
    // Roll after roll (each offer left to expire), it stays where it is: no duck, no flying off, no refund.
    (f.match.parts.get(1) as { money: number }).money = 50_000;
    for (let i = 0; i < 12; i++) {
      f.match.useBox(1);
      f.step(ZOMBIE.caixa.girarSegundos + ZOMBIE.caixa.ofertaSegundos + 0.2);
    }
    expect(new Set(f.of('zbox').map((m) => m.state))).toEqual(new Set(['rolling', 'offer', 'idle']));
    expect(f.of('zbox').every((m) => !('spot' in m))).toBe(true);
    expect(f.match.info(1)!.money).toBe(50_000 - 12 * ZOMBIE.caixa.custo);
  });

  it('o rojão: o inchado explode ao morrer e leva os zumbis em volta, com o crédito de quem o matou', () => {
    quick();
    for (const w of ZOMBIE.ondas) Object.assign(w, { zumbis: 40, tipos: { inchado: 0.5 }, intervalo: 0.05 });
    Object.assign(ZOMBIE, { maxVivosBase: 40, maxVivosTeto: 40 });
    const f = fakeMatch([[0, 0.1, 12]]);
    f.step(6);
    const bloater = [...f.match.zombies.values()].find((z) => z.kind === 'inchado' && [...f.match.zombies.values()].some((o) => o !== z && Math.hypot(o.pos[0] - z.pos[0], o.pos[2] - z.pos[2]) < 2));
    if (!bloater) return; // the horde spread out this time: nothing to check
    f.match.damage(bloater.id, 1, 1e9, 'gun');
    expect(f.of('zfx').some((e) => e.fx === 'boom')).toBe(true);
    const chained = f.of('zdie').filter((d) => d.how === 'blast' && d.by === 1).length;
    expect(chained).toBeGreaterThan(0);
    // The album hears how many the burst took, for whoever killed the uncle.
    expect(f.stats.get(1)).toContainEqual({ e: 'chain', kills: chained });
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

/** Where the zumbi mode is played: the cemetery (sessions open on demand: the one with room, or a new one). */
const CEMETERY = 'cemiterio';

/** Signs up, connects and plays the cemetery in the zumbi mode, or joins `session` (an id). */
async function enter(name: string, session = CEMETERY, lobby: object[] = []) {
  const b = new Browser(game);
  await b.register(name);
  const p = await Player.connect(game, await b.ticket());
  p.send({ t: 'hello' });
  await p.next('welcome');
  for (const m of lobby) p.send(m);
  p.send(session === CEMETERY ? { t: 'play', map: CEMETERY, mode: 'zumbi' } : { t: 'join', session });
  const joined = await p.next('joined');
  return { b, p, joined, id: joined.you };
}
type In = Omit<Awaited<ReturnType<typeof enter>>, 'b'>;

/** Respawns at `at` and keeps reporting that position (standing, on the ground). */
async function stand(who: In, at: Vec3) {
  who.p.send({ t: 'respawn', p: at, yaw: 0 });
  await who.p.next('spawned', (m) => m.id === who.id);
  who.p.send({ t: 'state', s: { p: at, yaw: 0, pitch: 0, f: 64 } });
}

const eyeDist = (feet: Vec3, z: Vec3, scale = 1) => Math.hypot(z[0] - feet[0], z[1] + 1.1 * scale - (feet[1] + 1.6), z[2] - feet[2]);

describe('modo zumbi no servidor', () => {
  it('só se joga no Cemitério da Capela, e o cemitério só no modo zumbi', async () => {
    const b = new Browser(game);
    await b.register('Coveiro');
    const p = await Player.connect(game, await b.ticket());
    p.send({ t: 'hello' });
    await p.next('welcome');
    p.send({ t: 'play', map: 'rua', mode: 'zumbi' });
    expect((await p.next('error')).message).toBe('Esse modo não é jogado nesse mapa.');
    p.send({ t: 'play', map: CEMETERY, mode: 'mata-mata' });
    expect((await p.next('error')).message).toBe('Esse modo não é jogado nesse mapa.');
    p.send({ t: 'play', map: CEMETERY, mode: 'zumbi' });
    expect((await p.next('joined')).session).toMatchObject({ map: CEMETERY, versao: 1, mapaNome: 'Cemitério da Capela', mode: 'zumbi' });
    p.close();
    await sleep(50);
  });

  it('criar uma sala zumbi em outro mapa cai no cemitério; criar outro modo no cemitério cai num mapa aberto', async () => {
    const b = new Browser(game);
    await b.register('Criador');
    const p = await Player.connect(game, await b.ticket());
    p.send({ t: 'hello' });
    await p.next('welcome');
    p.send({ t: 'create', name: 'Horda', map: 'rua', mode: 'zumbi' });
    expect((await p.next('joined')).session).toMatchObject({ name: 'Horda', map: 'cemiterio', mode: 'zumbi' });
    p.close();
    await sleep(50);
    for (const mode of ['mata-mata', 'corrida-armada'] as const) {
      const q = await Player.connect(game, await b.ticket());
      q.send({ t: 'hello' });
      await q.next('welcome');
      q.send({ t: 'create', name: 'Invasao', map: 'cemiterio', mode });
      const s = (await q.next('joined')).session;
      expect(s).toMatchObject({ name: 'Invasao', mode });
      expect(s.map).not.toBe('cemiterio');
      q.close();
      await sleep(50);
    }
  });

  it('começa com o rifle sem melhorias (não o Arsenal), mata zumbis validados, ganha dinheiro e XP da conta', async () => {
    quick();
    Object.assign(ZOMBIE.tipos.comum, { dano: 0 });
    const a = await enter('Caçador', CEMETERY, [{ t: 'loadout', lo: { secundaria: 'smg', ligadas: {} } }]);
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
    // Leaving writes the zumbi stats on the profile, apart from the player-vs-player ones.
    a.p.send({ t: 'leave' });
    await sleep(300);
    const profile = await a.b.req('GET', '/api/perfil');
    expect(profile.body.totais.zumbi).toMatchObject({ abates: 1, passaro: 1, cabeca: 0, chefes: 0 });
    expect(profile.body.totais.abates).toBe(0);
    a.p.close();
    await sleep(100);
  }, 40_000);

  it('a caixa gira no servidor e entrega a arma no slot dela', async () => {
    quick();
    Object.assign(ZOMBIE.tipos.comum, { dano: 0 });
    Object.assign(ZOMBIE.caixa, { custo: 100, girarSegundos: 0.2 });
    const s = await enter('Apostador', CEMETERY);
    expect(s.joined.zumbi!.box).toEqual({ state: 'idle', by: null, item: null, flaw: null, until: 0 });
    const [x, y, z] = ZOMBIE.mapas.cemiterio!.caixa;
    const at: Vec3 = [x - 1, y + 0.1, z];
    await stand(s, at);
    await sleep(100);
    s.p.send({ t: 'box' });
    expect(await s.p.next('zbox', (m) => m.state === 'rolling')).toMatchObject({ by: s.id, money: ZOMBIE.dinheiroInicial - 100 });
    const offer = await s.p.next('zbox', (m) => m.state === 'offer');
    const it = itemOf(offer.item)!;
    s.p.send({ t: 'box' });
    const lo = await s.p.next('playerLoadout', (m) => m.id === s.id);
    // Damaged or not (the server's roll), the loadout carries it.
    expect(lo.lo).toEqual(zombieLoadout(withItem(startItems(), it, offer.flaw)));
    s.p.close();
    await sleep(100);
  }, 30_000);


  it('os zumbis do servidor machucam quem está de pé', async () => {
    quick();
    Object.assign(ZOMBIE.tipos.comum, { dano: 5 });
    Object.assign(ZOMBIE.tipos.corredor, { dano: 5 });
    const a = await enter('Isca', CEMETERY);
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
    const a = await enter('Vitima', CEMETERY);
    const b = await enter('Medico', CEMETERY);
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
    // On the profiles: both were down when the match was lost, so each counts a death.
    a.p.send({ t: 'leave' });
    b.p.send({ t: 'leave' });
    await sleep(300);
    expect((await a.b.req('GET', '/api/perfil')).body.totais.zumbi).toMatchObject({ partidas: 1, vitorias: 0, quedas: 2, reanimacoes: 0, mortes: 1 });
    expect((await b.b.req('GET', '/api/perfil')).body.totais.zumbi).toMatchObject({ partidas: 1, quedas: 1, reanimacoes: 1, mortes: 1 });
    a.p.close();
    b.p.close();
    await sleep(100);
  }, 60_000);
});

// --- On the real server: weapon progression, bosses against several players, joining mid-wave --------------------

/** A signed-in account; `levels`: weapon levels it already earned (a veteran). */
async function account(name: string, levels: Partial<Record<ProgWeapon, number>> = {}) {
  const b = new Browser(game);
  await b.register(name);
  const xp = Object.fromEntries(Object.entries(levels).map(([w, lvl]) => [w, xpForLevel(w as ProgWeapon, lvl)]));
  if (Object.keys(xp).length) await setWeaponXp(b, xp);
  return b;
}

/** A game connection in the lobby (hello done), ready to join at the right moment. */
async function lobby(b: Browser) {
  const p = await Player.connect(game, await b.ticket());
  p.send({ t: 'hello' });
  await p.next('welcome');
  return p;
}

/** Sends the lobby messages, then plays the cemetery (CEMETERY), joins `session` (an id) or creates a new session of the zumbi mode ('nova'). */
async function joinWith(p: Player, session: string, before: object[] = []): Promise<In> {
  for (const m of before) p.send(m);
  p.send(session === 'nova' ? { t: 'create', name: 'Horda de teste', map: 'cemiterio', mode: 'zumbi' } : session === CEMETERY ? { t: 'play', map: CEMETERY, mode: 'zumbi' } : { t: 'join', session });
  const joined = await p.next('joined');
  return { p, joined, id: joined.you };
}

/** The next snapshot from now on (older ones dropped), matching `match`. */
function fresh(who: In, match: (m: Extract<ServerMsg, { t: 'zsnap' }>) => boolean = () => true, timeout = 5000) {
  who.p.msgs = who.p.msgs.filter((m) => m.t !== 'zsnap');
  return who.p.next('zsnap', match, timeout);
}

/** The boss of a snapshot: id, kind and where its feet are. */
function bossIn(s: Extract<ServerMsg, { t: 'zsnap' }>) {
  const z = s.z.find((x) => x[0] === s.boss![0])!;
  return { id: z[0], kind: Z_KINDS[z[1]], pos: [z[2], z[3], z[4]] as Vec3 };
}

/** Wave 1 is only `boss`; every boss stands still and its swipes do nothing (its special moves still hurt). */
function bossWave(boss: BossId) {
  quick();
  Object.assign(ZOMBIE.ondas[0], { zumbis: 0, chefe: boss });
  for (const b of Object.values(ZOMBIE.chefes)) Object.assign(b, { andar: 0.01, dano: 0 });
}

/** The coffin is cheap and quick, and its weapons come intact unless `flaw` says how they all come damaged. */
function cheapCoffin(flaw: ZFlaw | null = null) {
  Object.assign(ZOMBIE.caixa, { custo: 100, girarSegundos: 0.2 });
  const d = ZOMBIE.caixa.danificada;
  for (const r of Object.keys(d.chance) as (keyof typeof d.chance)[]) d.chance[r] = flaw ? 1 : 0;
  if (flaw) d.tipos = { municao: flaw === 'municao' ? 1 : 0, dano: flaw === 'dano' ? 1 : 0, ambos: flaw === 'ambos' ? 1 : 0 };
}

/** Stands by the coffin, pays, takes the weapon it offers: the item, its flaw and the loadout the server sent. */
async function buyFromCoffin(who: In) {
  const [x, y, z] = ZOMBIE.mapas.cemiterio!.caixa;
  who.p.send({ t: 'state', s: { p: [x - 1, y + 0.1, z], yaw: 0, pitch: 0, f: FLAG.grounded } });
  // The match reads positions on its tick.
  await sleep(120);
  who.p.send({ t: 'box' });
  const offer = await who.p.next('zbox', (m) => m.state === 'offer' && m.by === who.id);
  who.p.send({ t: 'box' });
  const lo = (await who.p.next('playerLoadout', (m) => m.id === who.id)).lo;
  return { item: itemOf(offer.item)!, flaw: offer.flaw, lo };
}

/**
 * Hits the boss once (`msg` builds the report from the boss's id and the distance to its chest) and returns how
 * much health it lost, from the boss bar of the snapshots.
 */
async function hurtBoss(who: In, at: Vec3, msg: (z: number, dist: number) => object) {
  const before = await fresh(who, (m) => !!m.boss);
  const boss = bossIn(before);
  const dist = eyeDist(at, boss.pos, kindScale(boss.kind));
  who.p.send(msg(boss.id, dist));
  const after = await who.p.next('zsnap', (m) => !!m.boss && m.boss[1] < before.boss![1]);
  return { lost: before.boss![1] - after.boss![1], dist };
}

/** Shoots every zombie in sight (groin: a plain zombie dies at once) until the wave's break; the kinds killed. */
async function clearWave(who: In, at: Vec3): Promise<ZKind[]> {
  const kinds = new Map<number, ZKind>();
  const shotAt = new Map<number, number>();
  const deadline = Date.now() + 20_000;
  const over = () => who.p.msgs.some((m) => m.t === 'zwave' && m.phase === 'break');
  while (!over() && Date.now() < deadline) {
    const snap = await fresh(who, () => true, 500).catch(() => null);
    for (const z of snap?.z ?? []) {
      kinds.set(z[0], Z_KINDS[z[1]]);
      // Once in a while each (a shot the fire rate refused is tried again).
      if (Date.now() - (shotAt.get(z[0]) ?? 0) < 400) continue;
      shotAt.set(z[0], Date.now());
      who.p.send({ t: 'zhit', z: z[0], region: 'virilha', dist: eyeDist(at, [z[2], z[3], z[4]], kindScale(Z_KINDS[z[1]])), w: 'rifle' });
    }
    await sleep(80);
  }
  await who.p.next('zwave', (m) => m.phase === 'break', 1000);
  return who.p.msgs.filter((m): m is Extract<ServerMsg, { t: 'zdie' }> => m.t === 'zdie' && m.by === who.id).map((m) => kinds.get(m.id)!);
}

describe('modo zumbi no servidor: progressão de armas, chefes e quem entra no meio', () => {
  it('a conta no máximo começa com o rifle simples; o caixão dá a arma com as melhorias dela, e o dano no chefe é o dessa arma', async () => {
    bossWave('coveiro');
    Object.assign(ZOMBIE.chefes.coveiro.pancada!, { dano: 0 });
    Object.assign(ZOMBIE.chefes.coveiro.invocar!, { zumbis: 0 });
    cheapCoffin();
    // Everything unlocked, the trade-off upgrades on (the silencer would make the rifle weaker, the saber the knife deadly).
    const choice: ArsenalChoice = { secundaria: 'smg', ligadas: { rifle: ['silenciador'], pistola: ['batata'], smg: ['tambor'], faca: ['sabre'], granada: ['mina'] } };
    const own = resolveLoadout(choice, MAX_LEVELS);
    const a = await joinWith(await lobby(await account('Veterano', MAX_LEVELS)), CEMETERY, [{ t: 'loadout', lo: choice }]);
    expect(a.joined.players.find((x) => x.id === a.id)!.lo).toEqual(zombieLoadout(startItems()));

    // The plain rifle's damage on the boss (the account's rifle would hit softer).
    const boss = bossIn(await fresh(a, (m) => !!m.boss, 10_000));
    expect(boss.kind).toBe('coveiro');
    const at: Vec3 = [boss.pos[0], 0.1, boss.pos[2] + 10];
    await stand(a, at);
    const shot = await hurtBoss(a, at, (z, dist) => ({ t: 'zhit', z, region: 'peito', dist, w: 'rifle' }));
    expect(shot.lost).toBe(gunDamageToZombie(gunStats('rifle'), shot.dist, 'peito', 1, 1, true));
    expect(shot.lost).not.toBe(gunDamageToZombie(gunStats('rifle', own.ativas.rifle), shot.dist, 'peito', 1, 1, true));
    // The plain knife, not the account's saber.
    const close: Vec3 = [boss.pos[0], 0.1, boss.pos[2] + 3];
    a.p.send({ t: 'state', s: { p: close, yaw: 0, pitch: 0, f: FLAG.grounded } });
    expect((await hurtBoss(a, close, (z) => ({ t: 'zstab', z }))).lost).toBe(knifeDamageToZombie(1));

    // The coffin's weapon: in its slot, with its own fixed upgrades, never the account's.
    const { item, lo } = await buyFromCoffin(a);
    expect(lo).toEqual(zombieLoadout({ ...startItems(), [itemSlot(item)]: item.id }));
    expect(lo.ativas[item.arma === 'faca' ? 'faca' : progOf(item.arma)]).toEqual(item.melhorias);
    expect(lo.ativas.granada).toEqual([]);
    // And its damage on the boss: that weapon with those upgrades, times its rarity.
    if (item.arma === 'faca') {
      a.p.send({ t: 'state', s: { p: close, yaw: 0, pitch: 0, f: FLAG.grounded } });
      await sleep(1000); // the saber swings slower
      expect((await hurtBoss(a, close, (z) => ({ t: 'zstab', z }))).lost).toBe(knifeDamageToZombie(rarityMul(item.raridade)));
    } else {
      a.p.send({ t: 'state', s: { p: at, yaw: 0, pitch: 0, f: FLAG.grounded | (itemSlot(item) === 'secundaria' ? FLAG.secondary : 0) } });
      const hit = await hurtBoss(a, at, (z, dist) => ({ t: 'zhit', z, region: 'peito', dist, w: item.arma }));
      expect(hit.lost).toBe(gunDamageToZombie(gunStats(item.arma, item.melhorias), hit.dist, 'peito', 1, rarityMul(item.raridade), true));
    }
    a.p.close();
    await sleep(100);
  }, 30_000);

  it('arma danificada: o servidor valida o dano com a penalidade (menos dano, os dois); a de menos munição bate igual', async () => {
    bossWave('coveiro');
    Object.assign(ZOMBIE.chefes.coveiro.pancada!, { dano: 0 });
    Object.assign(ZOMBIE.chefes.coveiro.invocar!, { zumbis: 0 });
    const a = await joinWith(await lobby(await account('Azarado')), 'nova');
    const boss = bossIn(await fresh(a, (m) => !!m.boss, 10_000));
    const at: Vec3 = [boss.pos[0], 0.1, boss.pos[2] + 10];
    const close: Vec3 = [boss.pos[0], 0.1, boss.pos[2] + 3];
    await stand(a, at);
    for (const flaw of ['dano', 'municao', 'ambos'] as const) {
      cheapCoffin(flaw);
      const { item, flaw: got, lo } = await buyFromCoffin(a);
      // A blade has no rounds to lose: its flaw is always less damage.
      expect(got).toBe(item.arma === 'faca' ? 'dano' : flaw);
      // (the loadout lists every damaged weapon in hand: an earlier roll's may still be there in its own slot)
      expect(lo.danificadas?.[item.arma === 'faca' ? 'faca' : progOf(item.arma)]).toBe(got!);
      const mul = rarityMul(item.raridade) * (got === 'municao' ? 1 : ZOMBIE.caixa.danificada.dano);
      if (item.arma === 'faca') {
        a.p.send({ t: 'state', s: { p: close, yaw: 0, pitch: 0, f: FLAG.grounded } });
        await sleep(1000); // the saber swings slower
        expect((await hurtBoss(a, close, (z) => ({ t: 'zstab', z }))).lost).toBe(knifeDamageToZombie(mul));
      } else {
        a.p.send({ t: 'state', s: { p: at, yaw: 0, pitch: 0, f: FLAG.grounded | (itemSlot(item) === 'secundaria' ? FLAG.secondary : 0) } });
        const hit = await hurtBoss(a, at, (z, dist) => ({ t: 'zhit', z, region: 'peito', dist, w: item.arma }));
        expect(hit.lost).toBe(gunDamageToZombie(gunStats(item.arma, item.melhorias), hit.dist, 'peito', 1, mul, true));
      }
      await sleep(300);
    }
    a.p.close();
    await sleep(100);
  }, 40_000);

  it('barricadas no servidor: ergue quem paga e segura E no alcance; longe ou sem dinheiro não; quem entra no meio da onda as recebe como estão', async () => {
    quick();
    for (const t of Object.values(ZOMBIE.tipos)) t.dano = 0;
    Object.assign(ZOMBIE.ondas[0], { zumbis: 30, intervalo: 0.5 });
    Object.assign(ZOMBIE.barricadas, { erguerSegundos: 0.3, repararSegundos: 0.2 });
    const [pa, pc] = await Promise.all([lobby(await account('Carpinteiro')), lobby(await account('Retardatario'))]);
    const a = await joinWith(pa, 'nova');
    const gaps = ZOMBIE.mapas.cemiterio!.barricadas;
    const west = gaps.findIndex((g) => g.id === 'oeste');
    const east = gaps.findIndex((g) => g.id === 'leste');
    // Out of reach, or a gap that doesn't exist: nothing.
    await stand(a, [0, 0.1, 0]);
    await sleep(120);
    a.p.send({ t: 'barricade', i: west, on: true });
    a.p.send({ t: 'barricade', i: 99, on: true });
    await expect(a.p.next('zbarwork', (m) => m.by === a.id, 400)).rejects.toThrow();
    // Inside, by the west gap: holding E builds it, paid when done, every board up.
    a.p.send({ t: 'state', s: { p: [gaps[west].centro[0] + 1.4, 0.1, gaps[west].centro[2]], yaw: 0, pitch: 0, f: FLAG.grounded } });
    await sleep(120);
    a.p.send({ t: 'barricade', i: west, on: true });
    expect(await a.p.next('zbarwork', (m) => m.by === a.id && m.until > 0)).toMatchObject({ i: west });
    const built = await a.p.next('zbar', (m) => m.i === west && m.fx === 'build', 3000);
    expect(built).toMatchObject({ built: true, boards: ZOMBIE.barricadas.tabuas, hp: ZOMBIE.barricadas.vidaTabua, by: a.id, money: ZOMBIE.dinheiroInicial - ZOMBIE.barricadas.custo });
    // Another one costs more than what's left.
    a.p.send({ t: 'barricade', i: west, on: false });
    a.p.send({ t: 'state', s: { p: [gaps[east].centro[0] - 1.4, 0.1, gaps[east].centro[2]], yaw: 0, pitch: 0, f: FLAG.grounded } });
    await sleep(120);
    a.p.send({ t: 'barricade', i: east, on: true });
    await expect(a.p.next('zbarwork', (m) => m.i === east, 500)).rejects.toThrow();
    // C joins in the middle of the wave and gets the barricades as they are.
    if (!a.p.msgs.some((m) => m.t === 'zwave' && m.phase === 'wave') && a.joined.zumbi?.phase !== 'wave') await a.p.next('zwave', (m) => m.phase === 'wave', 5000);
    const c = await joinWith(pc, a.joined.session.id);
    expect(c.joined.zumbi!.phase).toBe('wave');
    expect(c.joined.zumbi!.bars).toEqual(gaps.map((_, i) => (i === west ? { built: true, boards: ZOMBIE.barricadas.tabuas, hp: ZOMBIE.barricadas.vidaTabua } : { built: false, boards: 0, hp: 0 })));
    a.p.close();
    c.p.close();
    await sleep(150);
  }, 30_000);

  it('chefes contra vários jogadores: o grito da Noiva fere e deixa lento quem está perto; a investida do Prefeito acerta e arremessa todos no caminho', async () => {
    bossWave('noiva');
    Object.assign(ZOMBIE.chefes.noiva.grito!, { preparo: 0.3 });
    Object.assign(ZOMBIE.chefes.prefeito.investida!, { preparo: 0.3 });
    // The mayor rises at his own spot (the ring path south of the wall, with a long clear line east of him: no
    // override needed any more). Everyone in the lobby first: the bosses' first moves come a few seconds after they rise.
    const [p1, p2, p3, p4, p5] = await Promise.all(['Gritada', 'Arrepiada', 'Distante', 'Atropelado', 'Arremessado'].map(async (n) => lobby(await account(n))));
    // Everyone joins during the countdown: once a wave is on, newcomers wait for the break.
    ZOMBIE.inicioSegundos = 1.5;
    const bride = await joinWith(p1, 'nova');
    const bride2 = await joinWith(p2, bride.joined.session.id);
    const far = await joinWith(p3, bride.joined.session.id);
    await bride.p.next('zwave', (m) => m.phase === 'wave' && m.boss === 'noiva', 5000);
    // The next session's first wave gets the mayor.
    ZOMBIE.ondas[0].chefe = 'prefeito';
    const mayor = await joinWith(p4, 'nova');
    const mayor2 = await joinWith(p5, mayor.joined.session.id);
    await mayor.p.next('zwave', (m) => m.phase === 'wave' && m.boss === 'prefeito', 5000);
    const nb = bossIn(await fresh(bride, (m) => !!m.boss)).pos;
    const pm = bossIn(await fresh(mayor, (m) => !!m.boss)).pos;
    // Two players within the scream's reach and one well outside it.
    await stand(bride, [nb[0] - 4, 0.1, nb[2]]);
    await stand(bride2, [nb[0] - 7, 0.1, nb[2]]);
    await stand(far, [nb[0], 0.1, nb[2] + 25]);
    // Two players in a line over open ground east of the mayor, beyond the reach that makes him pound the ground.
    const reachPound = ZOMBIE.chefes.prefeito.tremor!.raio * 0.8;
    await stand(mayor, [pm[0] + reachPound + 0.6, 0.1, pm[2]]);
    await stand(mayor2, [pm[0] + reachPound + 2.6, 0.1, pm[2]]);

    const grito = ZOMBIE.chefes.noiva.grito!;
    const scream = await bride.p.next('zfx', (m) => m.fx === 'scream', 12_000);
    for (const x of [bride, bride2]) {
      const fx = await bride.p.next('zhitfx', (m) => m.fx === 'scream' && m.id === x.id, 4000);
      expect(fx.slow).toBe(grito.lentidao);
      expect(fx.until! - scream.t1).toBeGreaterThanOrEqual(grito.duracao * 1000);
      expect(fx.until! - scream.t1).toBeLessThan(grito.duracao * 1000 + 200);
      expect((await x.p.next('damage', (m) => m.target === x.id && m.attacker === null, 4000)).amount).toBe(grito.dano);
    }
    await expect(far.p.next('zhitfx', (m) => m.id === far.id, 300)).rejects.toThrow();
    expect(far.p.msgs.some((m) => m.t === 'damage' && m.target === far.id)).toBe(false);

    const investida = ZOMBIE.chefes.prefeito.investida!;
    const charge = await mayor.p.next('zfx', (m) => m.fx === 'charge', 12_000);
    expect(charge.to![0] - charge.at[0]).toBeGreaterThan(investida.minimo);
    for (const x of [mayor, mayor2]) {
      const fx = await mayor.p.next('zhitfx', (m) => m.fx === 'charge' && m.id === x.id, 4000);
      // Thrown along the charge (east), and up.
      expect(fx.v![0]).toBeCloseTo(investida.empurrao, 0);
      expect(fx.v![1]).toBe(6);
      expect(Math.abs(fx.v![2])).toBeLessThan(1);
      expect((await x.p.next('damage', (m) => m.target === x.id && m.attacker === null, 4000)).amount).toBe(investida.dano);
    }
    for (const x of [bride, bride2, far, mayor, mayor2]) x.p.close();
    await sleep(150);
  }, 40_000);

  it('quem entra no meio de uma onda recebe a onda, os zumbis, o dinheiro de cada um e quem está caído, e espera o intervalo para jogar', async () => {
    quick();
    Object.assign(ZOMBIE.ondas[0], { zumbis: 6, intervalo: 0.1 });
    for (const t of Object.values(ZOMBIE.tipos)) t.dano = 0;
    cheapCoffin();
    const [pa, pb, pc] = await Promise.all([lobby(await account('Anfitriao')), lobby(await account('Caido')), lobby(await account('Atrasado', MAX_LEVELS))]);
    const a = await joinWith(pa, CEMETERY);
    const b = await joinWith(pb, CEMETERY);
    await stand(a, [0, 0.1, 0]);
    await stand(b, [1.5, 0.1, 0]);
    const wave = await a.p.next('zwave', (m) => m.phase === 'wave', 5000);
    // A buys a weapon; B goes down (A is still up, so the wave goes on).
    const { item } = await buyFromCoffin(a);
    b.p.send({ t: 'selfDamage', amount: 9999, cause: 'fall' });
    const down = await a.p.next('zdown', (m) => m.id === b.id);
    const seen = await fresh(a, (m) => m.z.length >= 2, 10_000);

    // C (with a maxed-out account and another Arsenal choice) joins now.
    const c = await joinWith(pc, CEMETERY, [{ t: 'loadout', lo: { secundaria: 'smg', ligadas: { rifle: ['silenciador'] } } }]);
    expect(c.joined.zumbi).toMatchObject({ phase: 'wave', wave: 1, total: wave.total, box: { state: 'idle' } });
    expect(c.joined.zumbi!.down).toEqual([[b.id, down.until]]);
    const info = (id: number) => c.joined.players.find((p) => p.id === id)!;
    const aItems = { ...startItems(), [itemSlot(item)]: item.id };
    expect(info(a.id).zumbi).toMatchObject({ money: ZOMBIE.dinheiroInicial - ZOMBIE.caixa.custo, state: 'up', items: aItems });
    expect(info(a.id).lo).toEqual(zombieLoadout(aItems));
    expect(info(b.id).zumbi).toMatchObject({ money: ZOMBIE.dinheiroInicial, state: 'down' });
    // C came in during the wave: waiting (like the dead) until the break.
    expect(info(c.id).zumbi).toMatchObject({ money: ZOMBIE.dinheiroInicial, state: 'dead', items: startItems() });
    expect(info(c.id).lo).toEqual(zombieLoadout(startItems()));
    // The horde comes with the next snapshot: the zombies A was seeing.
    const first = await c.p.next('zsnap');
    const ids = new Set(first.z.map((z) => z[0]));
    expect(seen.z.filter((z) => !ids.has(z[0]))).toEqual([]);
    // And C doesn't play until the wave ends: the server refuses the respawn.
    c.p.send({ t: 'respawn', p: [0, 0.1, 2], yaw: 0 });
    await expect(c.p.next('spawned', (m) => m.id === c.id, 800)).rejects.toThrow();
    for (const x of [a, b, c]) x.p.close();
    await sleep(150);
  }, 30_000);

  it('quem sangra até morrer fica fora até o intervalo e volta com o rifle inicial e o seu dinheiro; abates dão só XP de conta', async () => {
    quick();
    Object.assign(ZOMBIE.ondas[0], { zumbis: 2, intervalo: 0.1 });
    for (const t of Object.values(ZOMBIE.tipos)) t.dano = 0;
    Object.assign(ZOMBIE.jogador, { caidoSegundos: 0.5 });
    cheapCoffin();
    const [pa, pb] = await Promise.all([lobby(await account('Limpador')), lobby(await account('Sangrador'))]);
    const a = await joinWith(pa, CEMETERY);
    const b = await joinWith(pb, CEMETERY);
    const atA: Vec3 = [0, 0.1, 0];
    await stand(a, atA);
    await stand(b, [1.5, 0.1, 0]);
    await a.p.next('zwave', (m) => m.phase === 'wave', 5000);
    // B buys a weapon ($100 out of $500), then goes down and nobody revives: bled out, dead until the break.
    const { lo } = await buyFromCoffin(b);
    expect(lo).not.toEqual(zombieLoadout(startItems()));
    b.p.send({ t: 'selfDamage', amount: 9999, cause: 'fall' });
    await a.p.next('zdown', (m) => m.id === b.id);
    expect(await a.p.next('kill', (m) => m.victim === b.id, 3000)).toMatchObject({ attacker: null, kind: 'zombie' });
    b.p.send({ t: 'respawn', p: [1.5, 0.1, 0], yaw: 0 });
    await expect(b.p.next('spawned', (m) => m.id === b.id, 400)).rejects.toThrow();

    // A clears the wave: each kill gives A its money and account XP from the server, and no weapon points.
    const killed = await clearWave(a, atA);
    expect(killed.length).toBeGreaterThan(0);
    const prog = a.p.msgs.filter((m): m is Extract<ServerMsg, { t: 'progresso' }> => m.t === 'progresso').at(-1)!;
    for (const w of PROG_WEAPONS) expect(prog.armas[w].xp).toBe(0);
    expect(prog.conta.xp).toBe(killed.reduce((s, k) => s + killXp(k), 0) + ZOMBIE.xp.onda);

    // The break: B gets the starting rifle back (the coffin's gun is lost) and may respawn, with the money B had.
    const back = await b.p.next('playerLoadout', (m) => m.id === b.id, 5000);
    expect(back.lo).toEqual(zombieLoadout(startItems()));
    await stand(b, [1.5, 0.1, 0]);
    // (the scoreboards from before the purchase still in the queue showed B alive with $500)
    a.p.msgs = a.p.msgs.filter((m) => m.t !== 'scores');
    const scores = await a.p.next('scores', (m) => m.players.some((p) => p.id === b.id && p.alive && p.zumbi?.state === 'up'), 4000);
    expect(scores.players.find((p) => p.id === b.id)!.zumbi).toMatchObject({ money: ZOMBIE.dinheiroInicial - ZOMBIE.caixa.custo, items: startItems() });
    a.p.close();
    b.p.close();
    await sleep(150);
  }, 40_000);
});
