// The Arsenal as a tree (pure data, no DOM): one row per slot (primary, secondary, knife, grenade) with its
// weapons in the order they unlock (a locked one says how many points its progression still needs), and under
// a weapon the upgrades of its progression in level order, each on, off or locked (with the points still
// missing). The old rifles share the rifle's points and upgrades, and every knife the knife's.
// client/ui/arsenal.ts draws it; client/tests/arsenalTree.test.ts checks it.
import { knifeOf, resolveLoadout } from '@shared/arsenal';
import {
  KNIVES,
  levelCount,
  levelsOfXp,
  lockOf,
  pointsToUnlock,
  PRIMARIES,
  progOf,
  PROGRESSION,
  SECONDARIES,
  weaponUnlocked,
  xpForLevel,
  type ArsenalChoice,
  type ProgWeapon,
  type WeaponId,
  type WeaponXp,
} from '@shared/progression';

export type RowId = 'primaria' | 'secundaria' | 'faca' | 'granada';

/** The rows, in order, and the weapons of each (the order a slot's weapons unlock in). */
export const TREE_ROWS: readonly { id: RowId; armas: readonly WeaponId[] }[] = [
  { id: 'primaria', armas: PRIMARIES },
  { id: 'secundaria', armas: SECONDARIES },
  { id: 'faca', armas: KNIVES },
  { id: 'granada', armas: ['granada'] },
];

export interface WeaponNode {
  arma: WeaponId;
  /** Where its points, level and upgrades are kept (an old rifle: the rifle's). */
  prog: ProgWeapon;
  nivel: number;
  max: number;
  xp: number;
  /** Points still needed for the next level (null at the last level). */
  faltamNivel: number | null;
  /** How far into the current level, 0 to 1 (1 at the last level). */
  progresso: number;
  liberada: boolean;
  /** The progression whose points unlock this one (null when it has no lock). */
  liberaCom: ProgWeapon | null;
  /** The points `liberaCom` needs (0 without a lock). */
  liberaPontos: number;
  /** Points still needed with `liberaCom` (0 when unlocked). */
  faltamLiberar: number;
  /** In the player's hands: the primary, the secondary, the knife and the grenade chosen. */
  equipada: boolean;
  /** The upgrades in effect on it (its progression's, level order). */
  ativas: string[];
}

export interface UpgradeNode {
  id: string;
  nivel: number;
  opcional: boolean;
  estado: 'ligada' | 'desligada' | 'trancada';
  /** Points still needed with this progression to unlock it (0 when unlocked). */
  faltam: number;
  /** The optional upgrade of its group that is on and replaces this common one (null otherwise). */
  substituidaPor: string | null;
}

export interface TreeRow {
  id: RowId;
  armas: WeaponNode[];
}

/** One weapon of the tree for a player with these points and this (sanitized) choice. */
export function weaponNode(w: WeaponId, xp: WeaponXp, choice: ArsenalChoice): WeaponNode {
  const prog = progOf(w);
  const levels = levelsOfXp(xp);
  const lo = resolveLoadout(choice, levels);
  const nivel = levels[prog];
  const max = levelCount(prog);
  const from = xpForLevel(prog, nivel);
  const next = nivel < max ? xpForLevel(prog, nivel + 1) : null;
  const lock = lockOf(w);
  return {
    arma: w,
    prog,
    nivel,
    max,
    xp: xp[prog],
    faltamNivel: next === null ? null : next - xp[prog],
    progresso: next === null ? 1 : Math.min(1, (xp[prog] - from) / (next - from)),
    liberada: weaponUnlocked(w, xp),
    liberaCom: lock?.arma ?? null,
    liberaPontos: lock?.pontos ?? 0,
    faltamLiberar: pointsToUnlock(w, xp),
    equipada: lo.primaria === w || lo.secundaria === w || knifeOf(lo) === w || w === 'granada',
    ativas: lo.ativas[prog],
  };
}

/** A weapon's upgrades (its progression's) in level order, each with its state. */
export function upgradeNodes(w: WeaponId, xp: WeaponXp, choice: ArsenalChoice): UpgradeNode[] {
  const { prog, nivel, ativas } = weaponNode(w, xp, choice);
  const melhorias = PROGRESSION[prog].melhorias;
  return melhorias.map((u) => {
    const estado = u.nivel > nivel ? 'trancada' : ativas.includes(u.id) ? 'ligada' : 'desligada';
    const by = !u.opcional && u.grupo ? melhorias.find((o) => o.opcional && o.grupo === u.grupo && ativas.includes(o.id)) : undefined;
    return { id: u.id, nivel: u.nivel, opcional: !!u.opcional, estado, faltam: Math.max(0, u.xp - xp[prog]), substituidaPor: by?.id ?? null };
  });
}

/** Every row of the tree. */
export function arsenalTree(xp: WeaponXp, choice: ArsenalChoice): TreeRow[] {
  return TREE_ROWS.map((r) => ({ id: r.id, armas: r.armas.map((w) => weaponNode(w, xp, choice)) }));
}
