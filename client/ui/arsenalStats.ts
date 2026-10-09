// What the Arsenal's numbers say, as pure data (no DOM): a gun's and a knife's stats as bars, a knife's passive
// named and described with its own numbers, and what an upgrade changes as effect chips. client/ui/arsenal.ts (which
// re-exports all of it) and the home's canvas (client/ui/arsenalCanvas.ts) draw them; client/tests/
// arsenalKnifeStats.test.ts and arsenalText.test.ts check them.
import { gunStats, meleeStats } from '@shared/arsenal';
import { SCORE } from '@shared/constants';
import { isGun, isKnife, type Efeitos, type GunId, type KnifeId, type WeaponId } from '@shared/progression';
import { MELEE } from '@shared/weapons';
import { SPATIAL_KINDS } from '../audio/spatial';
import { locale, t, type StringKey } from './strings';

// Texts keyed by ids (client/tests/arsenalText.test.ts checks they all exist).
const str = (key: string, params?: Record<string, string | number>) => t(key as StringKey, params);

export const num = (n: number, digits = 1) => n.toLocaleString(locale(), { maximumFractionDigits: digits });

/** A stat as a bar's fill: never empty (something always shows), never past full. */
const fill = (x: number) => Math.max(0.06, Math.min(1, x));

/** A gun's stats with the upgrades in effect, each 0.06 to 1 for a bar, and its "magazine / reserve" line. */
export function gunStatBars(w: GunId, active: readonly string[]): { bars: [StringKey, number][]; mag: string } {
  const g = gunStats(w, [...active]);
  const bars: [StringKey, number][] = [
    ['statDamage', g.dano.max / 40],
    ['statRate', g.cadencia / 1100],
    ['statAccuracy', 1 - g.dispersao.parado / 1.6 - g.dispersao.mirando],
    ['statRange', g.dano.distMin / 60],
    ['statMobility', (g.movimento - 0.85) / 0.3],
  ];
  return { bars: bars.map(([k, v]) => [k, fill(v)]), mag: t('statMag', { mag: g.pente, reserve: g.reserva }) };
}

/**
 * How far a knife's swing is heard, in meters: the kitchen knife's (its passive, Discreta, in every mode) only as far
 * as footsteps, every other knife as far as any knife (the spatial sound kinds of client/audio/spatial.ts).
 */
export const knifeHeardAt = (k: KnifeId): number => (MELEE[k].passiva.id === 'discreta' ? SPATIAL_KINDS.step.max : SPATIAL_KINDS.normal.max);

/**
 * A knife's stats with the knife tree's upgrades in effect, each 0.06 to 1 for a bar. The scales fit the seven
 * knives with and without every upgrade, so they read apart and each upgrade moves its bar: the swing's reach
 * (1.4 m empty, 2.9 m full), the lunge's (2.2 m to 5 m), speed (the time between swings plus the swing itself:
 * 1.35 s empty, 0.75 s full) and stealth (how far the swing is heard: 88 m empty, 28 m full).
 */
export function knifeStatBars(k: KnifeId, active: readonly string[]): { bars: [StringKey, number][] } {
  const m = meleeStats(k, active);
  const bars: [StringKey, number][] = [
    ['statSwingReach', (m.alcance - 1.4) / 1.5],
    ['statLunge', (m.alcanceInvestida - 2.2) / 2.8],
    ['statSwingSpeed', (1.35 - m.intervalo - m.duracao) / 0.6],
    ['statStealth', (88 - knifeHeardAt(k)) / 60],
  ];
  return { bars: bars.map(([key, v]) => [key, fill(v)]) };
}

/** The bars of a weapon's card (a gun's with its magazine line, a knife's; none for the grenade). */
export function weaponStatBars(w: WeaponId, active: readonly string[]): { bars: [StringKey, number][]; mag?: string } | null {
  return isGun(w) ? gunStatBars(w, active) : isKnife(w) ? knifeStatBars(w, active) : null;
}

/** A knife's passive (its JSON's `passiva`), named and described with its own numbers. */
export function passiveText(k: KnifeId): { name: string; desc: string } {
  const p = MELEE[k].passiva;
  const params: Record<string, string | number> =
    p.id === 'coloDeVo'
      ? { vida: num(p.vida, 0) }
      : p.id === 'fugaEscandalosa'
        ? { pct: Math.round((p.velocidade - 1) * 100), s: num(p.segundos) }
        : p.id === 'tapaGelado'
          ? { pts: num(p.costas, 0), base: num(SCORE.backstab, 0) }
          : {};
  return { name: str(`passiva_${p.id}`), desc: str(`passivaDesc_${p.id}`, params) };
}

/** Effects where a lower number is the better one. */
const LOWER_IS_BETTER = new Set<keyof Efeitos>(['recarga', 'dispersao', 'mirando', 'recuo', 'adsTempo', 'troca', 'intervalo', 'duracao', 'recargaGranada']);
const ADDED = new Set<keyof Efeitos>(['pente', 'golpe', 'investida', 'granadas']);

/** What an upgrade changes, as short labeled chips (good in green, the price in red). */
export function effectChips(fx: Efeitos): { text: string; good: boolean }[] {
  const out: { text: string; good: boolean }[] = [];
  for (const [k, v] of Object.entries(fx) as [keyof Efeitos, Efeitos[keyof Efeitos]][]) {
    if (k === 'mira') continue;
    if (k === 'silenciador') out.push({ text: t('fx_silenciador'), good: true });
    else if (k === 'tipo') out.push({ text: str(`fx_tipo_${v}`), good: true });
    else if (k === 'zoom') out.push({ text: t('fx_zoom', { v: num(1 / (v as number)) }), good: true });
    else if (ADDED.has(k)) out.push({ text: str(`fx_${k}`, { v: `+${num(v as number)}` }), good: true });
    else {
      const pct = Math.round(((v as number) - 1) * 100);
      if (!pct) continue;
      out.push({ text: str(`fx_${k}`, { v: `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%` }), good: pct > 0 !== LOWER_IS_BETTER.has(k) });
    }
  }
  return out;
}
