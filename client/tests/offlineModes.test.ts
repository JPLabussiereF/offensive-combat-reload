// Offline play with the weapon progression. The training range and the matches against bots arm the player with
// the account's Arsenal through Progress (client/gameplay/progress.ts: levels from the profile, the choice cleaned
// against them, toggles and the secondary saved to the account; level 1 and nothing saved without an account);
// the bots draw guns without upgrades or take corrida armada's ladder; the solo zombie game (client/zombies/local.ts)
// runs the shared match engine and damage rules with the starting rifle and the coffin's weapons, and no XP.
// What needs the browser (BotManager and Bot build meshes, physics and canvas nameplates; main.ts picks the
// starting loadout inside its DOM closure) isn't run here: these are the pure pieces they call.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { importNavMesh, init, type NavMesh } from 'recast-navigation';
import nav from '@shared/data/navmesh/cemiterio.json';
import type { ProfileResponse } from '@shared/account';
import { DEFAULT_LOADOUT, grenadeStats, gunStats, meleeStats, resolveLoadout, slotStats, type GunStats, type Loadout } from '@shared/arsenal';
import { FINAL_STEP, killCounts, LADDER, ladderLoadout } from '@shared/gunGame';
import {
  DEFAULT_SECONDARY,
  GUN_IDS,
  levelCount,
  PROG_WEAPONS,
  PROGRESSION,
  SECONDARIES,
  upgradeOf,
  xpForLevel,
  type ProgWeapon,
} from '@shared/progression';
import type { ServerMsg } from '@shared/protocol';
import { computeDamage, explosionDamage, HIT_REGIONS } from '@shared/weapons';
import { gunDamageToZombie, grenadeDamageToZombie, itemOf, itemSlot, knifeDamageToZombie, rarityMul, startItems, withItem, ZOMBIE, zombieGunData, zombieLoadout } from '@shared/zombies';
import { Progress } from '../gameplay/progress';
import { LocalZombies } from '../zombies/local';

/** Every stat the weapon code reads is a finite, positive number, and so is every hit it can land. */
function gunOk(g: GunStats) {
  const nums = [g.dano.max, g.dano.min, g.cadencia, g.pente, g.recarga.tatica, g.recarga.vazia, g.ads.tempo, g.ads.zoom, g.movimento, g.troca, g.alcanceMaximo];
  return nums.every((n) => Number.isFinite(n) && n > 0) && HIT_REGIONS.every((r) => [1, 15, 40, 120].every((d) => computeDamage(g, d, r) > 0));
}

/** What the game puts in the player's hands from a loadout (main.ts applyLoadout): each slot's gun, the knife, the grenade. */
function armedOk(lo: Loadout) {
  const guns = (['primaria', 'secundaria'] as const).map((s) => slotStats(lo, s)).filter((g): g is GunStats => !!g);
  const knife = meleeStats(lo.ativas.faca);
  const nade = grenadeStats(lo.ativas.granada);
  return guns.length > 0 && guns.every(gunOk) && knife.alcance > 0 && knife.intervalo > 0 && nade.quantidade > 0 && explosionDamage(nade.explosao, 0) > 0;
}

const optionals = (w: ProgWeapon) => PROGRESSION[w].melhorias.filter((u) => u.opcional);
const profileAt = (xp: Partial<Record<ProgWeapon, number>>, arsenal: unknown) =>
  ({ armas: Object.fromEntries(PROG_WEAPONS.map((w) => [w, { xp: xp[w] ?? 0, nivel: 1 }])), arsenal }) as unknown as ProfileResponse;

/** The account API, recorded instead of called (Progress saves the Arsenal choice with PATCH /api/perfil). */
let saved: { method: string; url: string; body: unknown }[] = [];
const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    saved.push({ method: init?.method ?? 'GET', url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

describe('treino e contra bots: o Arsenal da conta (Progress)', () => {
  it('sem conta: rifle e pistola sem melhorias, nada liga, e a secundária escolhida vale só para a partida', () => {
    saved = [];
    const pr = new Progress(null);
    expect(pr.signedIn).toBe(false);
    expect(pr.loadout).toEqual(DEFAULT_LOADOUT);
    for (const w of PROG_WEAPONS) for (const u of optionals(w)) expect(pr.toggle(w, u.id, true)).toBe(false);
    for (const g of SECONDARIES) {
      pr.setSecondary(g);
      expect(pr.loadout).toEqual({ ...DEFAULT_LOADOUT, secundaria: g });
      expect(armedOk(pr.loadout)).toBe(true);
    }
    expect(saved).toEqual([]);
  });

  it('com conta: cada arma em cada nível dá o equipamento da conta, e só liga o que o nível liberou', () => {
    for (const w of PROG_WEAPONS) {
      for (let lvl = 1; lvl <= levelCount(w); lvl++) {
        saved = [];
        // The profile asks for every optional upgrade of the weapon (the database may hold a stale choice).
        const pr = new Progress(profileAt({ [w]: xpForLevel(w, lvl) }, { secundaria: SECONDARIES.includes(w as never) ? w : DEFAULT_SECONDARY, ligadas: { [w]: optionals(w).map((u) => u.id) } }));
        const label = `${w} nível ${lvl}`;
        expect({ label, level: pr.level(w) }).toEqual({ label, level: lvl });
        // Only what the level unlocked is on, one per group.
        const groups = new Set<string>();
        for (const id of pr.choice.ligadas[w] ?? []) {
          const u = upgradeOf(w, id)!;
          expect({ label, id, unlocked: u.nivel <= lvl }).toEqual({ label, id, unlocked: true });
          if (u.grupo) expect(groups.has(u.grupo)).toBe(false);
          if (u.grupo) groups.add(u.grupo);
        }
        expect(pr.loadout).toEqual(resolveLoadout(pr.choice, pr.levels));
        expect({ label, ok: armedOk(pr.loadout) }).toEqual({ label, ok: true });
        // Turning each optional upgrade on: only the unlocked ones, the group's other one goes off, and the
        // weapons in hand change with it (the training range applies it at once); every change is saved.
        for (const u of optionals(w)) {
          for (const on of [false, true]) {
            const before = pr.isOn(w, u.id);
            const changed = pr.toggle(w, u.id, on);
            if (u.nivel > lvl) {
              expect({ label, id: u.id, changed }).toEqual({ label, id: u.id, changed: false });
              continue;
            }
            expect(changed).toBe(before !== on);
            expect(pr.isOn(w, u.id)).toBe(on);
            expect(pr.loadout.ativas[w].includes(u.id)).toBe(on);
            if (on && u.grupo) for (const o of optionals(w)) if (o !== u && o.grupo === u.grupo) expect(pr.isOn(w, o.id)).toBe(false);
            expect(armedOk(pr.loadout)).toBe(true);
          }
        }
        for (const g of SECONDARIES) {
          pr.setSecondary(g);
          expect(pr.loadout.secundaria).toBe(g);
          expect(armedOk(pr.loadout)).toBe(true);
        }
        expect(saved.length).toBeGreaterThan(0);
        for (const s of saved) expect(s).toMatchObject({ method: 'PATCH', url: '/api/perfil' });
        expect(saved.at(-1)!.body).toEqual({ arsenal: pr.choice });
      }
    }
  });

  it('o progresso que chega do servidor é limpo contra os níveis novos', () => {
    const pr = new Progress(profileAt({}, { secundaria: 'pistola', ligadas: {} }));
    let heard = 0;
    pr.onChange(() => heard++);
    const armas = Object.fromEntries(PROG_WEAPONS.map((w) => [w, { xp: 0, nivel: 1 }])) as Extract<ServerMsg, { t: 'progresso' }>['armas'];
    armas.rifle = { xp: xpForLevel('rifle', levelCount('rifle')), nivel: levelCount('rifle') };
    pr.applyServer({ armas, escolha: { secundaria: 'smg', ligadas: { rifle: ['silenciador'], faca: ['sabre'] } } });
    expect(heard).toBe(1);
    // The rifle's silencer is unlocked now; the knife is still at level 1 (no saber).
    expect(pr.choice).toEqual({ secundaria: 'smg', ligadas: { rifle: ['silenciador'] } });
    expect(pr.loadout.ativas.rifle).toContain('silenciador');
    expect(pr.loadout.ativas.faca).toEqual([]);
    expect(armedOk(pr.loadout)).toBe(true);
  });
});

describe('contra bots: as armas dos bots e da escada', () => {
  it('toda arma que um bot sorteia (sem melhorias) e todo degrau da escada armam bots e jogador com atributos válidos', () => {
    // Mata-mata: a bot draws any gun, with no upgrades (client/ai/bot.ts), and holds the plain knife.
    for (const g of GUN_IDS) expect({ g, ok: gunOk(gunStats(g, [])) }).toEqual({ g, ok: true });
    expect(meleeStats([]).letal).toBe(true);
    // Corrida armada: each step's weapons, as a bot takes them (the primary with its upgrades, the step's knife)
    // and as the player gets them (BotManager hooks.playerLoadout → applyLoadout).
    LADDER.forEach((step, i) => {
      const lo = ladderLoadout(i);
      expect({ step: step.id, ok: armedOk(lo) }).toEqual({ step: step.id, ok: true });
      expect(gunOk(gunStats(lo.primaria, lo.ativas[lo.primaria]))).toBe(true);
      const knife = meleeStats(lo.ativas.faca);
      if (i === FINAL_STEP) {
        expect(lo.soFaca).toBe(true);
        expect(knife.forma).toBe('sabre');
        expect(killCounts(i, 'knife', 'faca')).toBe(true);
      } else {
        expect(knife.forma).toBe('faca');
        // A kill with the step's gun (what the bot or the player holds) counts on the ladder.
        expect(killCounts(i, 'gun', lo.primaria)).toBe(true);
      }
    });
  });
});

// --- The solo zombie game ------------------------------------------------------------------------------------------

const ORIGINAL = structuredClone(ZOMBIE);
afterEach(() => {
  Object.assign(ZOMBIE, structuredClone(ORIGINAL));
});

let navMesh: NavMesh;
beforeAll(async () => {
  await init();
  navMesh = importNavMesh(new Uint8Array(Buffer.from(nav.dados, 'base64'))).navMesh;
});

describe('zumbi sozinho (LocalZombies)', () => {
  it('o mesmo motor e as mesmas regras de dano do servidor: rifle inicial, faca, granada e a arma do caixão com as melhorias dela', () => {
    // Wave 1: only the gravedigger, standing still and harmless; a cheap, quick coffin whose first weapon comes
    // intact (the damaged roll comes after).
    Object.assign(ZOMBIE, { inicioSegundos: 0.2 });
    Object.assign(ZOMBIE.ondas[0], { zumbis: 0, chefe: 'coveiro' });
    Object.assign(ZOMBIE.chefes.coveiro, { andar: 0.01, dano: 0 });
    Object.assign(ZOMBIE.chefes.coveiro.pancada!, { dano: 0 });
    Object.assign(ZOMBIE.chefes.coveiro.invocar!, { zumbis: 0 });
    Object.assign(ZOMBIE.caixa, { custo: 100, girarSegundos: 0.2 });
    const chance = ZOMBIE.caixa.danificada.chance;
    for (const r of Object.keys(chance) as (keyof typeof chance)[]) chance[r] = 0;
    const hurt: number[] = [];
    const handed: Loadout[] = [];
    const heard: Loadout[] = [];
    const solo = new LocalZombies(navMesh, ZOMBIE.mapas.cemiterio!, { me: 1, name: 'Sozinho', hurt: (n) => hurt.push(n), setLoadout: (lo) => handed.push(lo), newMatch: () => {} });
    solo.on('playerLoadout', (m) => heard.push(m.lo));
    // Whatever the account has, the solo game starts with the plain rifle.
    expect(solo.loadout).toEqual(zombieLoadout(startItems()));

    let feet: [number, number, number] = [0, 0.1, -17];
    const step = (seconds: number) => {
      for (let i = 0; i < seconds * 20; i++) solo.step(0.05, feet, true, true);
    };
    step(1);
    const boss = [...solo.match.zombies.values()].find((z) => z.kind === 'coveiro')!;
    expect(boss).toBeDefined();
    const lost = (msg: Parameters<LocalZombies['send']>[0]) => {
      const before = boss.hp;
      solo.send(msg);
      return before - boss.hp;
    };
    expect(lost({ t: 'zhit', z: boss.id, region: 'peito', dist: 10, w: 'rifle' })).toBe(gunDamageToZombie(gunStats('rifle'), 10, 'peito', 1, 1, true));
    expect(lost({ t: 'zstab', z: boss.id })).toBe(knifeDamageToZombie(1));
    expect(lost({ t: 'boom', id: 1, p: [0, 0.1, -25], hits: [], zs: [{ z: boss.id, dist: 2 }] })).toBe(grenadeDamageToZombie(explosionDamage(grenadeStats([]).explosao, 2), solo.match.wave));

    // The coffin: pay, take the weapon; it goes into our hands (and to the zombie HUD) with its own upgrades.
    const [x, y, z] = ZOMBIE.mapas.cemiterio!.caixa;
    feet = [x - 1, y + 0.1, z];
    step(0.2);
    solo.send({ t: 'box' });
    step(ZOMBIE.caixa.girarSegundos + 0.2);
    const offer = itemOf(solo.match.sync().box.item)!;
    expect(offer).toBeDefined();
    solo.send({ t: 'box' });
    const lo = zombieLoadout({ ...startItems(), [itemSlot(offer)]: offer.id });
    expect(handed.at(-1)).toEqual(lo);
    expect(heard.at(-1)).toEqual(lo);
    expect(solo.loadout).toEqual(lo);
    expect(lo.ativas[offer.arma]).toEqual(offer.melhorias);
    // Its damage: that weapon with those upgrades, times its rarity.
    if (offer.arma === 'faca') expect(lost({ t: 'zstab', z: boss.id })).toBe(knifeDamageToZombie(rarityMul(offer.raridade)));
    else expect(lost({ t: 'zhit', z: boss.id, region: 'peito', dist: 10, w: offer.arma })).toBe(gunDamageToZombie(gunStats(offer.arma, offer.melhorias), 10, 'peito', 1, rarityMul(offer.raridade), true));
    expect(hurt).toEqual([]);

    // A damaged roll (both flaws): the same rules as the server's, less damage and, in our hands, fewer rounds.
    for (const r of Object.keys(chance) as (keyof typeof chance)[]) chance[r] = 1;
    ZOMBIE.caixa.danificada.tipos = { municao: 0, dano: 0, ambos: 1 };
    const held = solo.match.itemsOf(1);
    solo.send({ t: 'box' });
    step(ZOMBIE.caixa.girarSegundos + 0.2);
    const broken = solo.match.sync().box;
    const bit = itemOf(broken.item)!;
    expect(broken.flaw).toBe(bit.arma === 'faca' ? 'dano' : 'ambos');
    solo.send({ t: 'box' });
    const blo = zombieLoadout(withItem(held, bit, broken.flaw));
    expect(solo.loadout).toEqual(blo);
    expect(handed.at(-1)).toEqual(blo);
    expect(blo.danificadas?.[bit.arma]).toBe(broken.flaw!);
    const mul = rarityMul(bit.raridade) * ZOMBIE.caixa.danificada.dano;
    if (bit.arma === 'faca') expect(lost({ t: 'zstab', z: boss.id })).toBe(knifeDamageToZombie(mul));
    else {
      expect(lost({ t: 'zhit', z: boss.id, region: 'peito', dist: 10, w: bit.arma })).toBe(gunDamageToZombie(gunStats(bit.arma, bit.melhorias), 10, 'peito', 1, mul, true));
      const full = gunStats(bit.arma, bit.melhorias);
      const ours = zombieGunData(full, blo.danificadas![bit.arma]);
      expect(ours.pente).toBe(Math.max(1, Math.round(full.pente * ZOMBIE.caixa.danificada.pente)));
      expect(ours.reserva).toBe(Math.max(1, Math.round(full.reserva * ZOMBIE.armas.municaoReserva * ZOMBIE.caixa.danificada.reserva)));
    }

    // A barricade alone: the same price and boards as online (the $300 left after two rolls of $100).
    const gaps = ZOMBIE.mapas.cemiterio!.barricadas;
    const west = gaps.findIndex((g) => g.id === 'oeste');
    feet = [gaps[west].centro[0] + 1.4, 0.1, gaps[west].centro[2]];
    step(0.2);
    expect(solo.match.info(1)!.money).toBe(ZOMBIE.barricadas.custo);
    solo.send({ t: 'barricade', i: west, on: true });
    step(ZOMBIE.barricadas.erguerSegundos + 0.2);
    expect(solo.match.sync().bars[west]).toEqual({ built: true, boards: ZOMBIE.barricadas.tabuas, hp: ZOMBIE.barricadas.vidaTabua });
    expect(solo.match.info(1)!.money).toBe(0);

    // Alone, going down is the end of the run.
    const ends: Extract<ServerMsg, { t: 'zend' }>[] = [];
    solo.on('zend', (m) => ends.push(m));
    solo.died();
    expect(ends).toHaveLength(1);
    expect(ends[0].won).toBe(false);
    solo.dispose();
  });
});
