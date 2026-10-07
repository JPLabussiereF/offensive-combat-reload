// Weapon progression: each kill's points go to the weapon that made it, and each weapon levels up on its own.
// Every level after the first unlocks one upgrade (data/progression.json) that changes the weapon's real
// stats. Common upgrades are on as soon as they unlock; optional ones trade something for something else
// (a silencer: quieter, weaker) and start off. The player turns any unlocked upgrade on or off in the Arsenal.
// Progression lives in five places (rifle, pistol, SMG, knife, grenade); the old rifles of the first versions
// use the rifle's points, levels and upgrades, and every knife uses the knife's. A weapon may be locked until
// its progression has enough points (`libera` in its JSON: the old rifles and knives, the SMG after the pistol).
// This module owns the levels, the upgrade trees, the weapon locks and the player's choice (ArsenalChoice);
// shared/arsenal.ts turns them into the stats the game (client and server) actually uses.
import data from './data/progression.json';
import { MELEE, WEAPONS, type WeaponLock } from './weapons';
import type { KillKind } from './protocol';

/** Guns with a progression of their own (points, levels, upgrades). */
export type ProgGun = 'rifle' | 'pistola' | 'smg';
/** Every firearm: the rifles of the primary slot (the old ones use the rifle's progression) and the secondaries. */
export type GunId = ProgGun | 'rifleFita' | 'rifleTia' | 'rifleNatal' | 'rifleChama' | 'rifleVovo' | 'rifleOuro';
/** Every knife (all of them use the knife's progression). */
export type KnifeId = 'faca' | 'colher' | 'frango' | 'baguete' | 'peixe' | 'macarrao' | 'sabre';
/** Where points, levels and upgrades are kept. */
export type ProgWeapon = ProgGun | 'faca' | 'granada';
/** Anything with a place in the Arsenal. */
export type WeaponId = GunId | KnifeId | 'granada';
/** In the order each slot unlocks them. */
export const GUN_IDS: GunId[] = ['rifle', 'rifleFita', 'rifleTia', 'rifleNatal', 'rifleChama', 'rifleVovo', 'rifleOuro', 'pistola', 'smg'];
export const KNIVES: KnifeId[] = ['faca', 'colher', 'frango', 'baguete', 'peixe', 'macarrao', 'sabre'];
export const PROG_WEAPONS: ProgWeapon[] = ['rifle', 'pistola', 'smg', 'faca', 'granada'];
export const isGun = (w: unknown): w is GunId => GUN_IDS.includes(w as GunId);
export const isKnife = (w: unknown): w is KnifeId => KNIVES.includes(w as KnifeId);
/** Each gun's base data in WEAPONS (data/weapons/*.json). */
export const GUN_DATA_ID: Record<GunId, string> = {
  rifle: 'rifle_padrao',
  rifleFita: 'rifle_fita',
  rifleTia: 'rifle_tia',
  rifleNatal: 'rifle_natal',
  rifleChama: 'rifle_chama',
  rifleVovo: 'rifle_vovo',
  rifleOuro: 'rifle_ouro',
  pistola: 'pistola',
  smg: 'smg',
};
/** The progression each gun uses: the old rifles share the rifle's. */
const GUN_PROG: Record<GunId, ProgGun> = {
  rifle: 'rifle',
  rifleFita: 'rifle',
  rifleTia: 'rifle',
  rifleNatal: 'rifle',
  rifleChama: 'rifle',
  rifleVovo: 'rifle',
  rifleOuro: 'rifle',
  pistola: 'pistola',
  smg: 'smg',
};
/** Where a weapon's points, level and upgrades are kept. */
export function progOf(w: GunId): ProgGun;
export function progOf(w: WeaponId): ProgWeapon;
export function progOf(w: WeaponId): ProgWeapon {
  return isGun(w) ? GUN_PROG[w] : isKnife(w) ? 'faca' : 'granada';
}
/** Guns a player may pick for each slot, from each gun's JSON `slot` (in unlock order). */
export const PRIMARIES: GunId[] = GUN_IDS.filter((g) => WEAPONS[GUN_DATA_ID[g]].slot === 'primaria');
export const SECONDARIES: GunId[] = GUN_IDS.filter((g) => WEAPONS[GUN_DATA_ID[g]].slot === 'secundaria');
export const DEFAULT_PRIMARY: GunId = 'rifle';
export const DEFAULT_KNIFE: KnifeId = 'faca';

export type Sight = 'ferro' | 'pontoVermelho' | 'holo' | 'holoLupa' | 'luneta' | 'luneta2x' | 'luneta4x';
export type GunLook = 'padrao' | 'fita' | 'tia' | 'natal' | 'chamas' | 'vovo' | 'ouro';
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
  /** = sight model (any 'luneta…' shows the scope overlay when fully aimed). */
  mira?: Sight;
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

/** A weapon's lock (`libera` in its JSON), if it has one. */
export function lockOf(w: WeaponId): WeaponLock | undefined {
  if (isGun(w)) return WEAPONS[GUN_DATA_ID[w]].libera;
  if (isKnife(w)) return MELEE[w].libera;
  return undefined;
}

/**
 * Whether the player may carry `w`: a weapon without a lock always; a locked one once its progression has the
 * points, or if the player already scored with that very weapon (the SMG of an older account: it stays theirs).
 */
export function weaponUnlocked(w: WeaponId, xp: WeaponXp): boolean {
  const lock = lockOf(w);
  const own = (xp as Partial<Record<WeaponId, number>>)[w] ?? 0;
  return !lock || own > 0 || xp[lock.arma] >= lock.pontos;
}

/** Points still needed with `w`'s progression to unlock it (0 when it is unlocked). */
export function pointsToUnlock(w: WeaponId, xp: WeaponXp): number {
  const lock = lockOf(w);
  return !lock || weaponUnlocked(w, xp) ? 0 : lock.pontos - xp[lock.arma];
}

/**
 * What the player chose in the Arsenal, saved on the account: the gun in each slot, the knife, the optional
 * upgrades turned on and the common ones turned off, per progression. Always sanitized against the points before
 * use. The primary and the knife are absent from older clients and saved choices: the Standard Rifle and the
 * Kitchen Knife.
 */
export interface ArsenalChoice {
  primaria?: GunId;
  secundaria: GunId;
  faca?: KnifeId;
  ligadas: Partial<Record<ProgWeapon, string[]>>;
  /** Common upgrades turned off (absent from clients older than the Arsenal tree: none off). */
  desligadas?: Partial<Record<ProgWeapon, string[]>>;
}

export const DEFAULT_SECONDARY: GunId = 'pistola';
export const DEFAULT_CHOICE: ArsenalChoice = { primaria: DEFAULT_PRIMARY, secundaria: DEFAULT_SECONDARY, faca: DEFAULT_KNIFE, ligadas: {}, desligadas: {} };

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

/** The knife a choice asks for: its `faca`, or (saved before the old knives came back) the chicken or saber form turned on. */
function askedKnife(faca: unknown, ligadasFaca: unknown): unknown {
  if (faca !== undefined) return faca;
  return Array.isArray(ligadasFaca) ? [...ligadasFaca].reverse().find((id) => id === 'frango' || id === 'sabre') : undefined;
}

/**
 * Whatever a client sent (or the database held) as a valid choice: a gun that belongs in each slot, a known
 * knife, known optional upgrades on (one per group) and known common ones off. With `xp` (the points of each
 * progression), locked weapons go back to the default ones and upgrades not unlocked yet are dropped too.
 */
export function sanitizeChoice(raw: unknown, xp?: WeaponXp): ArsenalChoice {
  const o = (raw && typeof raw === 'object' ? raw : {}) as { primaria?: unknown; secundaria?: unknown; faca?: unknown; ligadas?: unknown; desligadas?: unknown };
  const levels = xp && levelsOfXp(xp);
  const usable = <T extends WeaponId>(list: readonly T[], w: unknown): w is T => list.includes(w as T) && (!xp || weaponUnlocked(w as T, xp));
  const prim = usable(PRIMARIES, o.primaria) ? o.primaria : DEFAULT_PRIMARY;
  const sec = usable(SECONDARIES, o.secundaria) ? o.secundaria : DEFAULT_SECONDARY;
  const srcOn = (o.ligadas && typeof o.ligadas === 'object' ? o.ligadas : {}) as Partial<Record<ProgWeapon, unknown>>;
  const knife = askedKnife(o.faca, srcOn.faca);
  const faca = usable(KNIVES, knife) ? knife : DEFAULT_KNIFE;
  const srcOff = (o.desligadas && typeof o.desligadas === 'object' ? o.desligadas : {}) as Partial<Record<ProgWeapon, unknown>>;
  const ligadas: ArsenalChoice['ligadas'] = {};
  const desligadas: NonNullable<ArsenalChoice['desligadas']> = {};
  for (const w of PROG_WEAPONS) {
    const on = cleanToggles(w, srcOn[w], levels?.[w]);
    if (on.length) ligadas[w] = on;
    const off = cleanOff(w, srcOff[w], levels?.[w]);
    if (off.length) desligadas[w] = off;
  }
  return { primaria: prim, secundaria: sec, faca, ligadas, desligadas };
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
 * grenade level 2 the land mine and 3 the double. The old rifles and knives they equipped aren't brought back:
 * everyone starts with the Standard Rifle and the Kitchen Knife.
 */
export function legacyChoice(equipped: Partial<Record<'rifle' | 'faca' | 'granada', number>>): ArsenalChoice {
  const ligadas: ArsenalChoice['ligadas'] = {};
  if ((equipped.rifle ?? 1) >= 5) ligadas.rifle = ['luneta'];
  if (equipped.granada === 2) ligadas.granada = ['mina'];
  if (equipped.granada === 3) ligadas.granada = ['dupla'];
  return { ...DEFAULT_CHOICE, ligadas, desligadas: {} };
}

/** Which progression gets the points of a kill: `gun` is the firearm a shot came from (rifle when unknown). */
export function weaponOfKill(kind: KillKind, gun?: GunId | null): ProgWeapon | null {
  if (kind === 'gun' || kind === 'head' || kind === 'groin') return gun ? progOf(gun) : 'rifle';
  if (kind === 'knife') return 'faca';
  if (kind === 'grenade') return 'granada';
  return null;
}
