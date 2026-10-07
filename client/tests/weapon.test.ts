// The gun logic of client/weapons/weapon.ts with the secondaries of PF-10: the HR Stapler's burst (three shots a
// click at its fire rate, a pause before the next, holding the trigger doesn't fire another), the garrucha's
// pellets (eight rays inside its fixed cone, one shot), the on-screen kick of the heavy ones, and what makes each
// secondary look and sound like itself (its own model builder in the pistol's hand, its own gunshot voice), so
// none of them silently falls back to the rifle's.
import { describe, expect, it } from 'bun:test';
import { gunStats, type GunStats } from '@shared/arsenal';
import { PROGRESSION, progOf, SECONDARIES } from '@shared/progression';
import { SIM } from '@shared/constants';
import { pelletSpread, Weapon, type Pellet, type WeaponInput } from '../weapons/weapon';
import { GUN_MODELS, gunParts, holdOf } from '../render/weaponModels';
import { SHOT_VOICES, shotVoiceOf } from '../audio/gunVoices';

const DEG = Math.PI / 180;
const idle: WeaponInput = { fireHeld: false, firePressed: false, adsHeld: false, reloadPressed: false, sprinting: false, grounded: true, crouched: false, speed: 0 };

/** A gun on a test bench: every shot with its game time and pellets, ticked at the game's fixed step. */
function bench(g: GunStats) {
  const shots: { at: number; pellets: Pellet[] | null }[] = [];
  let time = 0;
  const w = new Weapon(g, { shoot: (_s, _i, pellets) => shots.push({ at: time, pellets }), dryFire: () => {}, reloadStart: () => {}, reloadEnd: () => {} });
  const tick = (input: Partial<WeaponInput> = {}) => {
    w.update(SIM.dt, { ...idle, ...input });
    time += SIM.dt;
  };
  /** Holds the trigger for `seconds` (pressed on the first tick), then lets go. */
  const hold = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / SIM.dt); i++) tick({ fireHeld: true, firePressed: i === 0 });
    tick();
  };
  const wait = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / SIM.dt); i++) tick();
  };
  return { w, shots, tick, hold, wait, now: () => time };
}

describe('rajada do Grampeador do RH', () => {
  const g = gunStats('grampeador');

  it('um clique, três grampos na cadência da rajada; segurar o gatilho não dispara outra', () => {
    expect(g).toMatchObject({ modo: 'rajada', rajada: { tiros: 3, pausa: 0.2 }, cadencia: 1100 });
    const b = bench(g);
    b.hold(1.5);
    expect(b.shots.length).toBe(3);
    expect(b.w.mag).toBe(g.pente - 3);
    // In the burst: one shot every 60/1100 s (to the tick).
    const gaps = b.shots.slice(1).map((s, i) => s.at - b.shots[i].at);
    for (const gap of gaps) expect(gap).toBeLessThanOrEqual(60 / g.cadencia + SIM.dt + 1e-9);
    expect(b.shots.at(-1)!.at - b.shots[0].at).toBeLessThan(0.15);
  });

  it('a rajada termina sozinha mesmo soltando o gatilho no primeiro instante', () => {
    const b = bench(g);
    b.tick({ fireHeld: false, firePressed: true }); // a tap shorter than a tick
    b.wait(0.5);
    expect(b.shots.length).toBe(3);
  });

  it('entre uma rajada e outra há pelo menos a pausa de 0,2 s, mesmo clicando sem parar', () => {
    const b = bench(g);
    // Clicks every other tick for 1.2 s.
    for (let i = 0; i < 72; i++) b.tick({ fireHeld: i % 2 === 0, firePressed: i % 2 === 0 });
    b.wait(0.5); // the last burst ends by itself
    expect(b.shots.length % 3).toBe(0);
    expect(b.shots.length).toBeGreaterThanOrEqual(9);
    for (let k = 3; k < b.shots.length; k += 3) expect(b.shots[k].at - b.shots[k - 1].at).toBeGreaterThanOrEqual(g.rajada!.pausa - 1e-9);
    // And the bursts never come faster than the pause allows.
    const cycle = 2 * (60 / g.cadencia) + g.rajada!.pausa;
    expect(b.shots.length / 3).toBeLessThanOrEqual(Math.floor(1.2 / cycle) + 1);
  });

  it('com dois grampos no pente a rajada sai com dois; guardar a arma corta a rajada', () => {
    const b = bench(g);
    b.w.mag = 2;
    b.hold(0.5);
    expect(b.shots.length).toBe(2);
    expect(b.w.mag).toBe(0);
    const c = bench(g);
    c.tick({ fireHeld: true, firePressed: true });
    c.w.holster();
    c.wait(0.5);
    expect(c.shots.length).toBeLessThan(3);
    // Hands busy (a knife swing): the rest of the burst is dropped.
    const d = bench(g);
    d.tick({ fireHeld: true, firePressed: true });
    d.tick({ holdFire: true });
    d.wait(0.5);
    expect(d.shots.length).toBeLessThan(3);
  });

  it('o gatilho que os bots puxam (solto a cada outro tick) também dispara em trincas', () => {
    const b = bench(g);
    let up = false;
    for (let i = 0; i < 60; i++) {
      up = !up;
      b.tick({ fireHeld: !up });
    }
    b.wait(0.5);
    expect(b.shots.length).toBeGreaterThanOrEqual(6);
    expect(b.shots.length % 3).toBe(0);
  });
});

describe('bagos da Garrucha do Cangaceiro', () => {
  const g = gunStats('garrucha');

  it('um tiro, oito bagos, todos dentro do cone fixo de 4,5°', () => {
    expect(g).toMatchObject({ bagos: 8, cone: 4.5, pente: 2, modo: 'semi' });
    const b = bench(g);
    b.hold(0.5);
    expect(b.shots.length).toBe(1);
    const pellets = b.shots[0].pellets!;
    expect(pellets.length).toBe(8);
    for (const p of pellets) {
      expect(p.theta).toBeGreaterThanOrEqual(0);
      expect(p.theta).toBeLessThanOrEqual(4.5 * DEG + 1e-12);
      expect(p.phi).toBeGreaterThanOrEqual(0);
      expect(p.phi).toBeLessThan(Math.PI * 2);
    }
    // The cone doesn't open with movement: aiming, walking or in the air, the pellets stay inside it.
    const c = bench(g);
    c.tick({ fireHeld: true, firePressed: true, grounded: false, speed: 6 });
    expect(c.shots[0].pellets!.every((p) => p.theta <= 4.5 * DEG + 1e-12)).toBe(true);
  });

  it('o espalhamento cobre o cone (uniforme no disco) e não sai dele', () => {
    const cone = 4.5 * DEG;
    let n = 0;
    const seq = [0, 0.25, 0.5, 0.75, 0.999];
    const rand = () => seq[n++ % seq.length];
    const ps = pelletSpread(8, cone, rand);
    expect(ps.length).toBe(8);
    expect(Math.max(...ps.map((p) => p.theta))).toBeLessThanOrEqual(cone);
    expect(pelletSpread(1, cone, () => 1)[0].theta).toBeCloseTo(cone);
    expect(pelletSpread(1, cone, () => 0)[0].theta).toBe(0);
  });

  it('dois tiros e abre pra recarregar; as outras armas atiram uma bala só', () => {
    const b = bench(g);
    b.hold(0.1);
    b.wait(0.3);
    b.hold(0.1);
    expect(b.shots.length).toBe(2);
    expect(b.w.mag).toBe(0);
    for (const gun of SECONDARIES.filter((x) => x !== 'garrucha')) {
      const o = bench(gunStats(gun));
      o.hold(0.2);
      expect({ gun, pellets: o.shots[0].pellets }).toEqual({ gun, pellets: null });
    }
  });
});

describe('cada secundária com a sua cara e o seu som', () => {
  it('modelo próprio na mão da pistola (a submetralhadora segura como arma curta)', () => {
    const builders = SECONDARIES.map((g) => GUN_MODELS[g]);
    expect(builders.every((b) => typeof b === 'function')).toBe(true);
    expect(new Set(builders).size).toBe(SECONDARIES.length);
    for (const g of SECONDARIES) {
      const want = g === 'smg' ? 'curta' : 'pistola';
      expect({ g, hold: holdOf(g) }).toEqual({ g, hold: want });
      // With every upgrade of its progression (sight, silencer, drum…), the model still builds in the same hand.
      for (const ups of [[], PROGRESSION[progOf(g)].melhorias.map((u) => u.id)]) {
        const parts = gunParts(gunStats(g, ups));
        expect({ g, hold: parts.hold }).toEqual({ g, hold: want });
        expect(parts.meshes.length).toBeGreaterThan(5);
        expect(parts.muzzle.z).toBeLessThan(0);
      }
    }
  });

  it('voz de tiro própria, diferente de todas as outras', () => {
    for (const g of SECONDARIES) expect({ g, own: !!SHOT_VOICES[g] }).toEqual({ g, own: true });
    const voices = SECONDARIES.map((g) => JSON.stringify(shotVoiceOf(g)));
    expect(new Set([...voices, JSON.stringify(shotVoiceOf('rifle'))]).size).toBe(SECONDARIES.length + 1);
    // The hand cannon has the deepest voice of all.
    const deepest = Object.entries(SHOT_VOICES).sort((a, b) => a[1]!.pitch - b[1]!.pitch)[0][0];
    expect(deepest).toBe('pistolao');
  });

  it('o coice na tela: maior no revólver, na garrucha e no pistolão; as outras no normal', () => {
    expect(gunStats('revolver').coiceVisual).toBe(1.6);
    expect(gunStats('garrucha').coiceVisual).toBe(2);
    expect(gunStats('pistolao').coiceVisual).toBe(2.5);
    for (const g of ['pistola', 'grampeador', 'smg', 'furadeira'] as const) expect(gunStats(g).coiceVisual).toBeUndefined();
  });
});
