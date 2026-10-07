// The Arsenal as a tree (pure data, no DOM): one row per slot (primary, secondary, knife, grenade) with its
// weapons in order (a locked one says how many points the weapon before it still needs), and under a weapon
// its upgrades in level order, each on, off or locked (with the points still missing). client/ui/arsenal.ts
// draws it; client/tests/arsenalTree.test.ts checks it.
import { resolveLoadout } from '@shared/arsenal';
import {
  levelCount,
  levelsOfXp,
  pointsToUnlock,
  PRIMARIES,
  PROGRESSION,
  SECONDARIES,
  weaponUnlocked,
  xpForLevel,
  type ArsenalChoice,
  type ProgWeapon,
  type WeaponXp,
} from '@shared/progression';

export type RowId = 'primaria' | 'secundaria' | 'faca' | 'granada';

/** The rows, in order, and the weapons of each (the order a slot's weapons unlock in). */
export const TREE_ROWS: readonly { id: RowId; armas: readonly ProgWeapon[] }[] = [
  { id: 'primaria', armas: PRIMARIES },
  { id: 'secundaria', armas: SECONDARIES },
  { id: 'faca', armas: ['faca'] },
  { id: 'granada', armas: ['granada'] },
];

export interface WeaponNode {
  arma: ProgWeapon;
  nivel: number;
  max: number;
  xp: number;
  /** Points still needed for the next level (null at the last level). */
  faltamNivel: number | null;
  /** How far into the current level, 0 to 1 (1 at the last level). */
  progresso: number;
  liberada: boolean;
  /** The weapon whose level unlocks this one (null when it has no lock). */
  liberaCom: ProgWeapon | null;
  /** The level `liberaCom` needs (0 without a lock). */
  liberaNivel: number;
  /** Points still needed with `liberaCom` (0 when unlocked). */
  faltamLiberar: number;
  /** In the player's hands: the primary, the chosen secondary, the knife and the grenade. */
  equipada: boolean;
  /** Its upgrades in effect (level order). */
  ativas: string[];
}

export interface UpgradeNode {
  id: string;
  nivel: number;
  opcional: boolean;
  estado: 'ligada' | 'desligada' | 'trancada';
  /** Points still needed with this weapon to unlock it (0 when unlocked). */
  faltam: number;
  /** The optional upgrade of its group that is on and replaces this common one (null otherwise). */
  substituidaPor: string | null;
}

export interface TreeRow {
  id: RowId;
  armas: WeaponNode[];
}

/** One weapon of the tree for a player with these points and this (sanitized) choice. */
export function weaponNode(w: ProgWeapon, xp: WeaponXp, choice: ArsenalChoice): WeaponNode {
  const levels = levelsOfXp(xp);
  const lo = resolveLoadout(choice, levels);
  const nivel = levels[w];
  const max = levelCount(w);
  const from = xpForLevel(w, nivel);
  const next = nivel < max ? xpForLevel(w, nivel + 1) : null;
  const lock = PROGRESSION[w].libera;
  return {
    arma: w,
    nivel,
    max,
    xp: xp[w],
    faltamNivel: next === null ? null : next - xp[w],
    progresso: next === null ? 1 : Math.min(1, (xp[w] - from) / (next - from)),
    liberada: weaponUnlocked(w, xp),
    liberaCom: lock?.arma ?? null,
    liberaNivel: lock?.nivel ?? 0,
    faltamLiberar: pointsToUnlock(w, xp),
    equipada: lo.primaria === w || lo.secundaria === w || w === 'faca' || w === 'granada',
    ativas: lo.ativas[w],
  };
}

/** A weapon's upgrades in level order, each with its state. */
export function upgradeNodes(w: ProgWeapon, xp: WeaponXp, choice: ArsenalChoice): UpgradeNode[] {
  const { nivel, ativas } = weaponNode(w, xp, choice);
  const melhorias = PROGRESSION[w].melhorias;
  return melhorias.map((u) => {
    const estado = u.nivel > nivel ? 'trancada' : ativas.includes(u.id) ? 'ligada' : 'desligada';
    const by = !u.opcional && u.grupo ? melhorias.find((o) => o.opcional && o.grupo === u.grupo && ativas.includes(o.id)) : undefined;
    return { id: u.id, nivel: u.nivel, opcional: !!u.opcional, estado, faltam: Math.max(0, u.xp - xp[w]), substituidaPor: by?.id ?? null };
  });
}

/** Every row of the tree. */
export function arsenalTree(xp: WeaponXp, choice: ArsenalChoice): TreeRow[] {
  return TREE_ROWS.map((r) => ({ id: r.id, armas: r.armas.map((w) => weaponNode(w, xp, choice)) }));
}
