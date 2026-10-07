// The secondaries of PF-10 (the HR Stapler, the sheriff's revolver, the Sunday drill, the cangaceiro's garrucha
// and the gym bro's hand cannon): the plan's value sheet, the balance rule (each one wins a narrow niche: with any
// mix of its progression's upgrades, none kills faster than the Standard Rifle from 15 m on, and a one-shot
// headshot only up close), whose points they take, and the server's hit limit for the garrucha's pellets (each
// pellet that lands is a hit of its own: the limit is eight times bigger for it, and no more).
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { gunStats, resolveLoadout, type GunStats } from '@shared/arsenal';
import { lockOf, progOf, PROGRESSION, START_LEVELS, weaponOfKill, type GunId } from '@shared/progression';
import { FLAG, type Vec3 } from '@shared/protocol';
import { computeDamage, hitsPerSecond, pelletsOf, WEAPONS } from '@shared/weapons';
import type { GameServer } from '../app';
import { Browser, Player, setWeaponXp, startTestServer } from './helpers';

const NEW = ['grampeador', 'revolver', 'furadeira', 'garrucha', 'pistolao'] as const;

/** Every mix of upgrades a gun's progression can have on (all of them on included). */
function upgradeMixes(gun: GunId): string[][] {
  return PROGRESSION[progOf(gun)].melhorias.reduce<string[][]>((acc, u) => acc.concat(acc.map((s) => [...s, u.id])), [[]]);
}

/** When the gun's `k`-th shot (0-based) leaves, holding or clicking as fast as it allows (a burst: its pause too). */
function shotTime(g: GunStats, k: number): number {
  const i = 60 / g.cadencia;
  if (g.modo === 'rajada' && g.rajada) {
    const n = g.rajada.tiros;
    return Math.floor(k / n) * ((n - 1) * i + Math.max(i, g.rajada.pausa)) + (k % n) * i;
  }
  return k * i;
}

/** Time to kill 100 HP with chest hits at `dist` (every pellet landing; no reload counted: the fastest it can be). */
function ttk(g: GunStats, dist: number): number {
  const perShot = computeDamage(g, dist, 'peito') * pelletsOf(g);
  return shotTime(g, Math.ceil(100 / perShot) - 1);
}

/** The fastest kill with any mix of the gun's upgrades. */
const bestTtk = (gun: GunId, dist: number) => Math.min(...upgradeMixes(gun).map((u) => ttk(gunStats(gun, u), dist)));
/** Whether one headshot kills at `dist` with some mix of the gun's upgrades. */
const oneShotHead = (gun: GunId, dist: number) => upgradeMixes(gun).some((u) => computeDamage(gunStats(gun, u), dist, 'cabeca') >= 100);

describe('ficha das secundárias novas', () => {
  it('os valores do plano (o resto igual à Pistola do Porteiro)', () => {
    const p = WEAPONS.pistola;
    const w = (id: string) => WEAPONS[id];
    expect(w('grampeador')).toMatchObject({ slot: 'secundaria', icone: '📎', modo: 'rajada', rajada: { tiros: 3, pausa: 0.2 }, cadencia: 1100, dano: { max: 24, min: 15, distMax: 10, distMin: 28 }, pente: 18, reserva: 72, recarga: { tatica: 1.5, vazia: 1.8 } });
    expect(w('grampeador').multiplicadores.cabeca).toBe(2.5);
    expect(w('grampeador').recuo.vertical).toBe(0.9);
    expect(w('grampeador').dispersao.porTiro).toBe(0.3);
    expect(w('revolver')).toMatchObject({ icone: '⭐', modo: 'semi', cadencia: 150, dano: { max: 50, min: 32, distMax: 10, distMin: 30 }, pente: 6, reserva: 36, recarga: { tatica: 2.4, vazia: 2.4 }, movimento: 1.04, troca: 0.4, coiceVisual: 1.6 });
    expect(w('revolver')).toMatchObject({ dispersao: { parado: 0.5, porTiro: 0.9 }, recuo: { vertical: 2.6 }, ads: { tempo: 0.18 } });
    expect(w('furadeira')).toMatchObject({ icone: '🔩', modo: 'auto', cadencia: 1200, dano: { max: 17, min: 9, distMax: 5, distMin: 16 }, pente: 20, reserva: 80, recarga: { tatica: 1.6, vazia: 1.9 }, movimento: 1.08, troca: 0.25, alcanceMaximo: 120 });
    expect(w('furadeira')).toMatchObject({ dispersao: { parado: 1.3, mirando: 0.4, porTiro: 0.35 }, recuo: { vertical: 0.45, horizontal: [-0.9, 0.9] }, ads: { tempo: 0.12, zoom: 0.95 } });
    expect(w('garrucha')).toMatchObject({ icone: '🌵', modo: 'semi', cadencia: 300, bagos: 8, cone: 4.5, dano: { max: 13, min: 4, distMax: 3, distMin: 12 }, pente: 2, reserva: 16, recarga: { tatica: 2.2, vazia: 2.2 }, alcanceMaximo: 40, coiceVisual: 2 });
    expect(w('garrucha').penetracao).toBeUndefined();
    expect(w('pistolao')).toMatchObject({ icone: '💪', modo: 'semi', cadencia: 170, dano: { max: 60, min: 40, distMax: 15, distMin: 40 }, pente: 7, reserva: 28, recarga: { tatica: 2.0, vazia: 2.5 }, movimento: 1.0, troca: 0.5, coiceVisual: 2.5 });
    expect(w('pistolao')).toMatchObject({ dispersao: { parado: 1.0, andando: 2.0, porTiro: 1.2 }, recuo: { vertical: 4.0 }, ads: { tempo: 0.2 } });
    expect([w('revolver'), w('garrucha'), w('pistolao')].map((x) => x.multiplicadores.cabeca)).toEqual([2, 1.5, 2]);
    expect(w('furadeira').multiplicadores.cabeca).toBe(1.8);
    // What the sheet doesn't list is the pistol's.
    for (const id of NEW) {
      const x = w(id);
      expect({ id, mult: { ...x.multiplicadores, cabeca: 0 } }).toEqual({ id, mult: { ...p.multiplicadores, cabeca: 0 } });
      expect({ id, noAr: x.dispersao.noAr, decaimento: x.dispersao.decaimento, retorno: x.recuo.retorno, tracante: x.tracanteACada }).toEqual({ id, noAr: p.dispersao.noAr, decaimento: p.dispersao.decaimento, retorno: p.recuo.retorno, tracante: p.tracanteACada });
      expect(x.libera).toEqual(lockOf(id));
      if (id !== 'garrucha') expect(x.penetracao).toEqual(p.penetracao);
    }
  });

  it('a furadeira usa a progressão da submetralhadora; as outras, a da pistola (e os pontos dos abates vão para ela)', () => {
    expect(NEW.map((g) => progOf(g))).toEqual(['pistola', 'pistola', 'smg', 'pistola', 'pistola']);
    for (const g of NEW) {
      expect(weaponOfKill('gun', g)).toBe(progOf(g));
      expect(weaponOfKill('head', g)).toBe(progOf(g));
    }
    // The revolver with the pistol's trigger upgrade fires faster; the drill with the SMG's motor.
    expect(gunStats('revolver', ['gatilho']).cadencia).toBe(Math.round(150 * 1.3));
    expect(gunStats('furadeira', ['motor']).cadencia).toBe(Math.round(1200 * 1.12));
  });
});

describe('regra de equilíbrio (P10)', () => {
  it('o Rifle Padrão mata (no peito) em 0,257 s até 30 m e em 0,343 s a 40 m', () => {
    for (const d of [15, 20, 25, 30]) expect(ttk(gunStats('rifle'), d)).toBeCloseTo(0.257, 3);
    expect(ttk(gunStats('rifle'), 40)).toBeCloseTo(0.343, 3);
  });

  it('com qualquer combinação de melhorias, nenhuma mata mais rápido que o rifle de 15 m em diante', () => {
    for (const g of NEW) {
      for (const d of [15, 20, 25, 30, 35, 40]) {
        const mine = bestTtk(g, d);
        const rifle = ttk(gunStats('rifle'), d);
        expect({ g, d, slower: mine >= rifle - 1e-9 }).toEqual({ g, d, slower: true });
      }
    }
  });

  it('cada uma ganha no seu nicho, de perto', () => {
    // The drill shreds point-blank, the garrucha settles it in one shot under 3 m, the hand cannon in two up to 25 m.
    expect(bestTtk('furadeira', 5)).toBeLessThan(ttk(gunStats('rifle'), 5));
    expect(computeDamage(gunStats('garrucha'), 3, 'peito') * 8).toBeGreaterThanOrEqual(100);
    expect(computeDamage(gunStats('pistolao'), 25, 'peito') * 2).toBeGreaterThanOrEqual(100);
  });

  it('tiro único na cabeça só de perto: o revólver até 10 m, o pistolão até ~27 m; as outras nunca', () => {
    expect(oneShotHead('revolver', 10)).toBe(true);
    expect(oneShotHead('revolver', 11)).toBe(false);
    expect(oneShotHead('pistolao', 27)).toBe(true);
    expect(oneShotHead('pistolao', 28)).toBe(false);
    for (let d = 0; d <= 60; d += 0.5) {
      if (oneShotHead('revolver', d)) expect(d).toBeLessThanOrEqual(10.3);
      if (oneShotHead('pistolao', d)) expect(d).toBeLessThanOrEqual(27.9);
      for (const g of ['grampeador', 'furadeira', 'garrucha'] as const) expect({ g, d, one: oneShotHead(g, d) }).toEqual({ g, d, one: false });
    }
    // The potato silencer (the pistol's optional upgrade) takes the revolver's one-shot away and shortens the hand cannon's.
    expect(computeDamage(gunStats('revolver', ['batata']), 0, 'cabeca')).toBeLessThan(100);
    expect(computeDamage(gunStats('pistolao', ['batata']), 25, 'cabeca')).toBeLessThan(100);
  });
});

// --- The garrucha's pellets on the real server ---------------------------------------------------------------

let game: GameServer;
beforeAll(async () => {
  game = await startTestServer();
});
afterAll(async () => {
  await game?.close();
});

async function enter(b: Browser, session: string | { mode: string; map: string }, lobby: object[] = []) {
  const p = await Player.connect(game, await b.ticket());
  p.send({ t: 'hello' });
  await p.next('welcome');
  for (const m of lobby) p.send(m);
  p.send(typeof session === 'string' ? { t: 'join', session } : { t: 'create', name: 'Sala dos bagos', ...session });
  const joined = await p.next('joined');
  return { p, joined, id: joined.you, me: joined.players.find((x) => x.id === joined.you)! };
}
type In = Awaited<ReturnType<typeof enter>>;

async function spawn(who: In, at: Vec3, watcher: In = who) {
  who.p.send({ t: 'respawn', p: at, yaw: 0 });
  await watcher.p.next('spawned', (m) => m.id === who.id);
}

async function signedIn(name: string) {
  const b = new Browser(game);
  await b.register(name);
  return b;
}

describe('limite de acertos da garrucha (online)', () => {
  it('aceita os 8 bagos de cada tiro, até 8× o limite de uma bala por segundo, e recusa o bago seguinte', async () => {
    // 7.000 pistol points: the garrucha unlocked; the trigger upgrade turned off, so it fires at its own 300/min.
    const b = await signedIn('Cangaceira');
    await setWeaponXp(b, { pistola: 7000 });
    const choice = { secundaria: 'garrucha' as const, ligadas: {}, desligadas: { pistola: ['gatilho'] } };
    const a = await enter(b, { mode: 'mata-mata', map: 'rua' }, [{ t: 'loadout', lo: choice }]);
    const lo = resolveLoadout(choice, { ...START_LEVELS, pistola: 5 });
    expect(a.me.lo).toMatchObject({ secundaria: 'garrucha', ativas: { pistola: lo.ativas.pistola } });
    const gun = gunStats('garrucha', lo.ativas.pistola);
    expect(gun.cadencia).toBe(300);
    // One bullet a shot would allow ceil(300/60) + 2 = 7 hits a second: not even one discharge's 8 pellets.
    const single = Math.ceil(gun.cadencia / 60) + 2;
    expect(single).toBeLessThan(8);
    const allowed = hitsPerSecond(gun);
    expect(allowed).toBe(single * 8);

    const v1 = await enter(await signedIn('Alvo Norte'), a.joined.session.id);
    const v2 = await enter(await signedIn('Alvo Leste'), a.joined.session.id);
    await spawn(a, [0, 0, 0], v1);
    await spawn(v1, [0, 0, 30], a);
    await spawn(v2, [30, 0, 0], a);
    a.p.send({ t: 'state', s: { p: [0, 0, 0], yaw: 0, pitch: 0, f: FLAG.grounded | FLAG.secondary } });
    // Hand hits from 30 m (2 damage a pellet), split between the two: nobody dies.
    const dmg = computeDamage(gun, 30, 'maos');
    expect(Math.ceil(allowed / 2) * dmg).toBeLessThan(100);
    for (let i = 0; i <= allowed; i++) a.p.send({ t: 'hit', target: i % 2 ? v2.id : v1.id, region: 'maos', dist: 30, w: 'garrucha' });
    for (let i = 0; i < allowed; i++) expect((await a.p.next('damage', (m) => m.attacker === a.id)).amount).toBe(dmg);
    await expect(a.p.next('damage', (m) => m.attacker === a.id, 300)).rejects.toThrow();
    for (const x of [a, v1, v2]) x.p.close();
  });
});
