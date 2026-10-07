// The knives in the Arsenal (client/ui/arsenalStats.ts): the bars each knife's card shows (swing reach, lunge, speed,
// stealth), on scales where the seven knives read apart and each upgrade of the knife tree moves its bar, the bars
// every card picks (a gun's, a knife's, none for the grenade) and the knife upgrades' effect chips.
import { beforeEach, describe, expect, it } from 'bun:test';
import { KNIVES, PROGRESSION, type KnifeId } from '@shared/progression';
import { SPATIAL_KINDS } from '../audio/spatial';
import { effectChips, knifeHeardAt, knifeStatBars, weaponStatBars } from '../ui/arsenalStats';
import { setLang } from '../ui/strings';

beforeEach(() => setLang('pt-BR'));

const LABELS = ['statSwingReach', 'statLunge', 'statSwingSpeed', 'statStealth'] as const;
const UPGRADES = PROGRESSION.faca.melhorias.map((u) => u.id);
/** Every set of the knife tree's upgrades (none, each one, each pair, all). */
const SUBSETS = Array.from({ length: 1 << UPGRADES.length }, (_, m) => UPGRADES.filter((_, i) => m & (1 << i)));

/** A knife's bars by label. */
function bars(k: KnifeId, active: readonly string[] = []) {
  return Object.fromEntries(knifeStatBars(k, active).bars) as Record<(typeof LABELS)[number], number>;
}

describe('Arsenal: barras das facas', () => {
  it('quatro barras na ordem, todas entre 0,06 e 1 com qualquer combinação de melhorias', () => {
    expect(UPGRADES).toEqual(['afiador', 'tenis', 'maoLeve']);
    for (const k of KNIVES) {
      for (const s of SUBSETS) {
        const list = knifeStatBars(k, s).bars;
        expect(list.map(([label]) => label)).toEqual([...LABELS]);
        for (const [label, v] of list) expect({ k, s, label, ok: v >= 0.06 && v <= 1 }).toEqual({ k, s, label, ok: true });
      }
    }
  });

  it('as facas se distinguem: nenhuma tem as mesmas barras de outra', () => {
    const seen = KNIVES.map((k) => knifeStatBars(k, []).bars.map(([, v]) => v.toFixed(2)).join(' '));
    expect(new Set(seen).size).toBe(KNIVES.length);
  });

  it('o sabre e o macarrão têm o maior alcance de golpe', () => {
    for (const s of SUBSETS) {
      const byReach = [...KNIVES].sort((a, b) => bars(b, s).statSwingReach - bars(a, s).statSwingReach);
      expect(byReach.slice(0, 2).sort()).toEqual(['macarrao', 'sabre']);
    }
  });

  it('a faca de cozinha é a mais discreta (ouvida só de perto); nenhuma melhoria muda a discrição', () => {
    expect(knifeHeardAt('faca')).toBe(SPATIAL_KINDS.step.max);
    for (const k of KNIVES.filter((x) => x !== 'faca')) {
      expect(knifeHeardAt(k)).toBe(SPATIAL_KINDS.normal.max);
      expect(bars('faca').statStealth).toBeGreaterThan(bars(k).statStealth + 0.4);
    }
    for (const k of KNIVES) for (const s of SUBSETS) expect(bars(k, s).statStealth).toBe(bars(k).statStealth);
  });

  it('cada melhoria sobe a barra dela: afiador alcance e rapidez, tênis investida, mão leve rapidez', () => {
    const RAISES: Record<string, (typeof LABELS)[number][]> = {
      afiador: ['statSwingReach', 'statSwingSpeed'],
      tenis: ['statLunge'],
      maoLeve: ['statSwingSpeed'],
    };
    for (const k of KNIVES) {
      for (const s of SUBSETS) {
        for (const id of UPGRADES.filter((u) => !s.includes(u))) {
          const before = bars(k, s);
          const after = bars(k, [...s, id]);
          for (const label of LABELS) {
            const delta = after[label] - before[label];
            // A clear step (over 0.1 of the bar) where it should move, none elsewhere; capped bars stay full.
            if (RAISES[id].includes(label)) expect({ k, s, id, label, up: before[label] === 1 || delta > 0.1 }).toEqual({ k, s, id, label, up: true });
            else expect({ k, s, id, label, delta }).toEqual({ k, s, id, label, delta: 0 });
          }
        }
      }
    }
  });

  it('cada cartão escolhe as suas barras: a arma com a linha do pente, a faca sem, a granada nenhuma', () => {
    const gun = weaponStatBars('rifle', []);
    expect(gun?.bars.length).toBe(5);
    expect(gun?.mag).toBeTruthy();
    const knife = weaponStatBars('sabre', ['afiador']);
    expect(knife).toEqual(knifeStatBars('sabre', ['afiador']));
    expect(knife?.mag).toBeUndefined();
    expect(weaponStatBars('granada', [])).toBeNull();
  });
});

describe('Arsenal: chips das melhorias da faca', () => {
  const chips = (id: string) => effectChips(PROGRESSION.faca.melhorias.find((u) => u.id === id)!.efeitos);

  it('afiador: golpes mais seguidos e mais alcance, os dois em verde', () => {
    expect(chips('afiador')).toEqual([
      { text: 'Intervalo entre golpes −20%', good: true },
      { text: 'Alcance do golpe +0,2 m', good: true },
    ]);
  });

  it('tênis: investida mais longa e mais rápida; mão leve: golpe mais curto (menos é melhor)', () => {
    expect(chips('tenis')).toEqual([
      { text: 'Investida +0,6 m', good: true },
      { text: 'Velocidade da investida +20%', good: true },
    ]);
    expect(chips('maoLeve')).toEqual([{ text: 'Duração do golpe −30%', good: true }]);
    setLang('en');
    expect(chips('maoLeve')).toEqual([{ text: 'Swing duration −30%', good: true }]);
  });
});
