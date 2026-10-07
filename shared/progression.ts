// Weapon progression: each kill's points go to the weapon that made it, and each weapon levels up on its own.
// Every level after the first unlocks one upgrade (data/progression.json) that changes the weapon's real
// stats. Common upgrades are on as soon as they unlock; optional ones trade something for something else
// (a silencer: quieter, weaker) and start off. The player turns any unlocked upgrade on or off in the Arsenal.
// A weapon may also be locked until the one before it in its slot reaches a level (the SMG after the pistol).
// This module owns the levels, the upgrade trees, the weapon locks and the player's choice (ArsenalChoice);
// shared/arsenal.ts turns them into the stats the game (client and server) actually uses.
import data from './data/progression.json';
import { WEAPONS } from './weapons';
import type { KillKind } from './protocol';

/** Firearms: the primary slot (rifle) and the secondaries (pistol, SMG). */
export type GunId = 'rifle' | 'pistola' | 'smg';
export type ProgWeapon = GunId | 'faca' | 'granada';
export const GUN_IDS: GunId[] = ['rifle', 'pistola', 'smg'];
export const PROG_WEAPONS: ProgWeapon[] = ['rifle', 'pistola', 'smg', 'faca', 'granada'];
export const isGun = (w: unknown): w is GunId => GUN_IDS.includes(w as GunId);
/** Each gun's base data in WEAPONS (data/weapons/*.json). */
export const GUN_DATA_ID: Record<GunId, string> = { rifle: 'rifle_padrao', pistola: 'pistola', smg: 'smg' };
/** Guns a player may pick for each slot, from each gun's JSON `slot`. */
export const PRIMARIES: GunId[] = GUN_IDS.filter((g) => WEAPONS[GUN_DATA_ID[g]].slot === 'primaria');
export const SECONDARIES: GunId[] = GUN_IDS.filter((g) => WEAPONS[GUN_DATA_ID[g]].slot === 'secundaria');

export type Sight = 'ferro' | 'pontoVermelho' | 'holo' | 'luneta';
export type GunLook = 'padrao' | 'fita' | 'vovo';
export type KnifeForm = 'faca' | 'frango' | 'sabre';
export type GrenadeKind = 'granada' | 'mina' | 'dupla';

/**
 * What an upgrade changes. Numbers are multipliers over the base stats, except the ones marked "+" (added)
 * and the ones marked "=" (replace the base). Each weapon reads only its own kind of fields.
 */
export interface Efeitos {
  // Firearms.
  dano?: number;
  /** Damage falloff distances (distMax/distMin). */
  alcance?: number;
  cadencia?: number;
  /** + rounds per magazine (the reserve keeps its ratio to the magazine). */
  pente?: number;
  recarga?: number;
  /** Hip-fire spread (standing, walking, in the air, per shot). */
  dispersao?: number;
  /** Aimed spread. */
  mirando?: number;
  recuo?: number;
  adsTempo?: number;
  /** = ADS FOV multiplier (lower: more zoom). */
  zoom?: number;
  movimento?: number;
  /** Draw time when switching to it. */
  troca?: number;
  /** = sight model (a 'luneta' shows the scope overlay when fully aimed). */
  mira?: Sight;
  /** = paint job. */
  visual?: GunLook;
  /** Quieter shots (heard only nearby), no tracers for the others. */
  silenciador?: boolean;
  // Melee.
  /** + meters of hit reach. */
  golpe?: number;
  /** + meters of lunge reach. */
  investida?: number;
  /** Time between swings. */
  intervalo?: number;
  /** Lunge speed. */
  impulso?: number;
  /** = what is swung (and how it sounds, to everyone). */
  forma?: KnifeForm;
  // Grenade.
  /** + grenades carried. */
  granadas?: number;
  /** Seconds to get one back. */
  recargaGranada?: number;
  /** Blast radii. */
  raio?: number;
  /** Throw speed. */
  lancamento?: number;
  /** = what G does: plant a land mine, or throw two grenades for one charge. */
  tipo?: GrenadeKind;
}

export interface Upgrade {
  /** The weapon level that unlocks it (2 and up). */
  nivel: number;
  /** Points earned with this weapon needed for that level. */
  xp: number;
  /** Unique within its weapon; names and descriptions are client strings (upg_<weapon>_<id>). */
  id: string;
  icone: string;
  /** Has a trade-off: the player turns it on or off in the Arsenal (off when it unlocks). */
  opcional?: boolean;
  /**
   * Only one optional upgrade of a group is on at a time, and while it is on it replaces the common upgrades
   * of the same group (the scope replaces the red dot).
   */
  grupo?: string;
  efeitos: Efeitos;
}

export interface WeaponTree {
  icone: string;
  /** Locked until `arma` (the weapon before it in its slot) reaches `nivel`; no lock when absent. */
  libera?: { arma: ProgWeapon; nivel: number };
  /** In level order: melhorias[i] is unlocked at level i + 2. */
  melhorias: Upgrade[];
}

export const PROGRESSION = data as unknown as Record<ProgWeapon, WeaponTree>;

/** Levels of a weapon: level 1 (base) plus one per upgrade. */
export const levelCount = (w: ProgWeapon) => PROGRESSION[w].melhorias.length + 1;

/** Points needed for `level` (0 for level 1). */
export const xpForLevel = (w: ProgWeapon, level: number) => (level <= 1 ? 0 : (PROGRESSION[w].melhorias[Math.min(level, levelCount(w)) - 2]?.xp ?? 0));

/** Highest level unlocked with `xp` points. */
export function levelForXp(w: ProgWeapon, xp: number): number {
  let lvl = 1;
  for (const u of PROGRESSION[w].melhorias) if (xp >= u.xp) lvl = u.nivel;
  return lvl;
}

export const upgradeOf = (w: ProgWeapon, id: string): Upgrade | undefined => PROGRESSION[w].melhorias.find((u) => u.id === id);

/** The upgrade a level unlocks (null for level 1). */
export const upgradeAt = (w: ProgWeapon, level: number): Upgrade | null => PROGRESSION[w].melhorias.find((u) => u.nivel === level) ?? null;

export type Levels = Record<ProgWeapon, number>;
export const START_LEVELS: Levels = { rifle: 1, pistola: 1, smg: 1, faca: 1, granada: 1 };
/** Every level of every weapon (handy for modes that hand out fully upgraded weapons). */
export const MAX_LEVELS: Levels = Object.fromEntries(PROG_WEAPONS.map((w) => [w, levelCount(w)])) as Levels;

/** Points earned with each weapon (what levels and weapon locks are computed from). */
export type WeaponXp = Record<ProgWeapon, number>;
export const NO_XP: WeaponXp = { rifle: 0, pistola: 0, smg: 0, faca: 0, granada: 0 };

export const levelsOfXp = (xp: WeaponXp): Levels => Object.fromEntries(PROG_WEAPONS.map((w) => [w, levelForXp(w, xp[w])])) as Levels;

/**
 * Whether the player may carry `w`: a weapon without a lock always; a locked one once the weapon before it in
 * its slot reached the level, or if the player already scored with it (it stays theirs).
 */
export function weaponUnlocked(w: ProgWeapon, xp: WeaponXp): boolean {
  const lock = PROGRESSION[w].libera;
  return !lock || xp[w] > 0 || xp[lock.arma] >= xpForLevel(lock.arma, lock.nivel);
}

/** Points still needed with the weapon before `w` to unlock it (0 when it is unlocked). */
export function pointsToUnlock(w: ProgWeapon, xp: WeaponXp): number {
  const lock = PROGRESSION[w].libera;
  return !lock || weaponUnlocked(w, xp) ? 0 : xpForLevel(lock.arma, lock.nivel) - xp[lock.arma];
}

/**
 * What the player chose in the Arsenal, saved on the account: the gun in the secondary slot, the optional
 * upgrades turned on and the common ones turned off, per weapon. Always sanitized against the points before use.
 */
export interface ArsenalChoice {
  secundaria: GunId;
  ligadas: Partial<Record<ProgWeapon, string[]>>;
  /** Common upgrades turned off (absent from clients older than the Arsenal tree: none off). */
  desligadas?: Partial<Record<ProgWeapon, string[]>>;
}

export const DEFAULT_SECONDARY: GunId = 'pistola';
export const DEFAULT_CHOICE: ArsenalChoice = { secundaria: DEFAULT_SECONDARY, ligadas: {}, desligadas: {} };

/** The common upgrades turned off, cleaned: known, common, unlocked (when `level` is given), no repeats. */
function cleanOff(w: ProgWeapon, raw: unknown, level?: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const id of raw) {
    const u = typeof id === 'string' ? upgradeOf(w, id) : undefined;
    if (!u || u.opcional || (level !== undefined && u.nivel > level) || out.includes(u.id)) continue;
    out.push(u.id);
  }
  return out;
}

/** The optional upgrades turned on, cleaned: known, optional, unlocked (when `level` is given), one per group (the last one wins). */
function cleanToggles(w: ProgWeapon, raw: unknown, level?: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: Upgrade[] = [];
  for (const id of raw) {
    const u = typeof id === 'string' ? upgradeOf(w, id) : undefined;
    if (!u?.opcional || (level !== undefined && u.nivel > level) || out.includes(u)) continue;
    const same = u.grupo ? out.findIndex((x) => x.grupo === u.grupo) : -1;
    if (same >= 0) out.splice(same, 1);
    out.push(u);
  }
  return out.map((u) => u.id);
}

/**
 * Whatever a client sent (or the database held) as a valid choice: a secondary that belongs in that slot,
 * known optional upgrades on (one per group) and known common ones off. With `xp` (the points of each weapon),
 * a locked secondary goes back to the default one and upgrades not unlocked yet are dropped too.
 */
export function sanitizeChoice(raw: unknown, xp?: WeaponXp): ArsenalChoice {
  const o = (raw && typeof raw === 'object' ? raw : {}) as { secundaria?: unknown; ligadas?: unknown; desligadas?: unknown };
  const levels = xp && levelsOfXp(xp);
  const asked = o.secundaria as GunId;
  const sec = SECONDARIES.includes(asked) && (!xp || weaponUnlocked(asked, xp)) ? asked : DEFAULT_SECONDARY;
  const srcOn = (o.ligadas && typeof o.ligadas === 'object' ? o.ligadas : {}) as Partial<Record<ProgWeapon, unknown>>;
  const srcOff = (o.desligadas && typeof o.desligadas === 'object' ? o.desligadas : {}) as Partial<Record<ProgWeapon, unknown>>;
  const ligadas: ArsenalChoice['ligadas'] = {};
  const desligadas: NonNullable<ArsenalChoice['desligadas']> = {};
  for (const w of PROG_WEAPONS) {
    const on = cleanToggles(w, srcOn[w], levels?.[w]);
    if (on.length) ligadas[w] = on;
    const off = cleanOff(w, srcOff[w], levels?.[w]);
    if (off.length) desligadas[w] = off;
  }
  return { secundaria: sec, ligadas, desligadas };
}

/**
 * The upgrades in effect on a weapon at `level`: every common one unlocked and not turned off, plus the
 * optional ones turned on (and unlocked); an optional one that is on replaces the common upgrades of its
 * group. In level order.
 */
export function activeUpgrades(w: ProgWeapon, level: number, toggled: readonly string[] = [], off: readonly string[] = []): string[] {
  const unlocked = PROGRESSION[w].melhorias.filter((u) => u.nivel <= level);
  const on = unlocked.filter((u) => u.opcional && toggled.includes(u.id));
  const replaced = new Set(on.map((u) => u.grupo).filter(Boolean));
  return unlocked.filter((u) => (u.opcional ? on.includes(u) : !off.includes(u.id) && !(u.grupo && replaced.has(u.grupo)))).map((u) => u.id);
}

/**
 * Accounts from before the upgrades kept an "equipped level" per weapon instead of a choice; this is the
 * nearest choice (read once, while the account has no saved choice yet). Old rifle levels 5 to 7 had a scope,
 * knife level 3 was the rubber chicken and 7 the lightsaber, grenade level 2 the land mine and 3 the double.
 */
export function legacyChoice(equipped: Partial<Record<'rifle' | 'faca' | 'granada', number>>): ArsenalChoice {
  const ligadas: ArsenalChoice['ligadas'] = {};
  if ((equipped.rifle ?? 1) >= 5) ligadas.rifle = ['luneta'];
  if (equipped.faca === 3) ligadas.faca = ['frango'];
  if (equipped.faca === 7) ligadas.faca = ['sabre'];
  if (equipped.granada === 2) ligadas.granada = ['mina'];
  if (equipped.granada === 3) ligadas.granada = ['dupla'];
  return { secundaria: DEFAULT_SECONDARY, ligadas, desligadas: {} };
}

/** Which weapon gets the points of a kill: `gun` is the firearm a shot came from (rifle when unknown). */
export function weaponOfKill(kind: KillKind, gun?: GunId | null): ProgWeapon | null {
  if (kind === 'gun' || kind === 'head' || kind === 'groin') return gun ?? 'rifle';
  if (kind === 'knife') return 'faca';
  if (kind === 'grenade') return 'granada';
  return null;
}
