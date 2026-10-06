// What a player carries into a fight and the stats each weapon really has: the base JSON of the weapon
// (shared/weapons.ts) with its active upgrades applied (shared/progression.ts). Client and server call the
// same functions, so the damage, fire rate and reach the server validates are the ones the shooter used.
//
// Public API (for game modes and anything that hands out weapons):
// - resolveLoadout(choice, levels): the account's Arsenal choice + weapon levels → Loadout.
// - gunStats(gun, upgrades) / meleeStats(upgrades) / grenadeStats(upgrades): effective stats for a list of
//   upgrade ids (any list: a mode can give a weapon with no upgrades, or with all of them).
// - Loadout.secundaria may be null (a mode where players start with the primary only).
import { GRENADES, grenadeLevel, MELEE, WEAPONS, type GrenadeData, type GrenadeLevel, type MeleeData, type WeaponData } from './weapons';
import {
  activeUpgrades,
  DEFAULT_CHOICE,
  GUN_DATA_ID,
  isGun,
  PROG_WEAPONS,
  PROGRESSION,
  START_LEVELS,
  upgradeOf,
  type ArsenalChoice,
  type Efeitos,
  type GrenadeKind,
  type GunId,
  type GunLook,
  type KnifeForm,
  type Levels,
  type ProgWeapon,
  type Sight,
} from './progression';

/** The two gun slots a player switches between. */
export type GunSlot = 'primaria' | 'secundaria';

/**
 * What a player has in hand in a match: the gun in each slot and the upgrades in effect on every weapon (ids
 * in level order). The server resolves it from the account and sends it to everyone, so other players draw
 * the right models and the server validates hits with it.
 */
export interface Loadout {
  primaria: GunId;
  /** Null: nothing in the secondary slot. */
  secundaria: GunId | null;
  ativas: Record<ProgWeapon, string[]>;
}

const noUpgrades = (): Record<ProgWeapon, string[]> => ({ rifle: [], pistola: [], smg: [], faca: [], granada: [] });

/** The starting kit: rifle and pistol, no upgrades (players without an account, bots). */
export const DEFAULT_LOADOUT: Loadout = { primaria: 'rifle', secundaria: DEFAULT_CHOICE.secundaria, ativas: noUpgrades() };

/** The account's choice at its weapon levels, as the loadout it plays with. */
export function resolveLoadout(choice: ArsenalChoice, levels: Levels = START_LEVELS): Loadout {
  const ativas = noUpgrades();
  for (const w of PROG_WEAPONS) ativas[w] = activeUpgrades(w, levels[w], choice.ligadas[w] ?? []);
  return { primaria: 'rifle', secundaria: choice.secundaria, ativas };
}

/** The gun in a slot (null when the slot is empty). */
export const gunIn = (lo: Loadout, slot: GunSlot): GunId | null => (slot === 'primaria' ? lo.primaria : lo.secundaria);

/** A loadout received from the network, made safe to use (unknown ids dropped; never trusted for rules). */
export function sanitizeLoadout(raw: unknown): Loadout {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Loadout, unknown>>;
  const src = (o.ativas && typeof o.ativas === 'object' ? o.ativas : {}) as Partial<Record<ProgWeapon, unknown>>;
  const ativas = noUpgrades();
  for (const w of PROG_WEAPONS) {
    const list = src[w];
    if (Array.isArray(list)) ativas[w] = list.filter((id): id is string => typeof id === 'string' && !!upgradeOf(w, id));
  }
  return {
    primaria: isGun(o.primaria) ? o.primaria : DEFAULT_LOADOUT.primaria,
    secundaria: o.secundaria === null ? null : isGun(o.secundaria) ? o.secundaria : DEFAULT_LOADOUT.secundaria,
    ativas,
  };
}

/** The upgrades' effects in level order (later levels win the "replace" fields). */
function effectsOf(w: ProgWeapon, upgrades: readonly string[]): Efeitos[] {
  return PROGRESSION[w].melhorias.filter((u) => upgrades.includes(u.id)).map((u) => u.efeitos);
}
const product = (list: Efeitos[], k: keyof Efeitos) => list.reduce((m, e) => m * ((e[k] as number | undefined) ?? 1), 1);
const sum = (list: Efeitos[], k: keyof Efeitos) => list.reduce((m, e) => m + ((e[k] as number | undefined) ?? 0), 0);
function last<K extends keyof Efeitos>(list: Efeitos[], k: K): Efeitos[K] | undefined {
  let v: Efeitos[K] | undefined;
  for (const e of list) if (e[k] !== undefined) v = e[k];
  return v;
}

/** A gun as it is held: its weapon data with the upgrades applied, plus how it looks and sounds. */
export interface GunStats extends WeaponData {
  arma: GunId;
  /** The upgrades applied (ids, level order). */
  melhorias: string[];
  mira: Sight;
  visual: GunLook;
  /** Shots heard only nearby and without tracers for the others. */
  silenciador: boolean;
}

const gunCache = new Map<string, GunStats>();

/** A gun's effective stats with `upgrades` (ids of that gun; unknown ones are ignored). Cached and shared: don't mutate. */
export function gunStats(gun: GunId, upgrades: readonly string[] = []): GunStats {
  const key = `${gun}|${upgrades.join(',')}`;
  let d = gunCache.get(key);
  if (d) return d;
  const base = WEAPONS[GUN_DATA_ID[gun]];
  const fx = effectsOf(gun, upgrades);
  const dmg = product(fx, 'dano');
  const reach = product(fx, 'alcance');
  const hip = product(fx, 'dispersao');
  const kick = product(fx, 'recuo');
  const reload = product(fx, 'recarga');
  const pente = base.pente + sum(fx, 'pente');
  const sp = base.dispersao;
  d = {
    ...base,
    arma: gun,
    melhorias: PROGRESSION[gun].melhorias.filter((u) => upgrades.includes(u.id)).map((u) => u.id),
    dano: { max: Math.round(base.dano.max * dmg), min: Math.round(base.dano.min * dmg), distMax: base.dano.distMax * reach, distMin: base.dano.distMin * reach },
    cadencia: Math.round(base.cadencia * product(fx, 'cadencia')),
    pente,
    reserva: Math.round((base.reserva * pente) / base.pente),
    recarga: { tatica: base.recarga.tatica * reload, vazia: base.recarga.vazia * reload },
    dispersao: { ...sp, mirando: sp.mirando * product(fx, 'mirando'), parado: sp.parado * hip, andando: sp.andando * hip, noAr: sp.noAr * hip, porTiro: sp.porTiro * hip },
    recuo: { ...base.recuo, vertical: base.recuo.vertical * kick, horizontal: [base.recuo.horizontal[0] * kick, base.recuo.horizontal[1] * kick] },
    ads: { tempo: base.ads.tempo * product(fx, 'adsTempo'), zoom: last(fx, 'zoom') ?? base.ads.zoom },
    movimento: base.movimento * product(fx, 'movimento'),
    troca: base.troca * product(fx, 'troca'),
    mira: last(fx, 'mira') ?? 'ferro',
    visual: last(fx, 'visual') ?? 'padrao',
    silenciador: !!last(fx, 'silenciador'),
  };
  gunCache.set(key, d);
  return d;
}

/** The knife as it is held: reach and timing with the upgrades, and what is swung (and heard). */
export interface MeleeStats extends MeleeData {
  forma: KnifeForm;
}

/** The knife's effective stats with `upgrades` (e.g. ['sabre'] for the lightsaber). */
export function meleeStats(upgrades: readonly string[] = []): MeleeStats {
  const base = MELEE.faca;
  const fx = effectsOf('faca', upgrades);
  const interval = product(fx, 'intervalo');
  return {
    ...base,
    alcance: base.alcance + sum(fx, 'golpe'),
    alcanceInvestida: base.alcanceInvestida + sum(fx, 'investida'),
    intervalo: base.intervalo * interval,
    velocidadeInvestida: base.velocidadeInvestida * product(fx, 'impulso'),
    forma: last(fx, 'forma') ?? 'faca',
  };
}

/** The grenade as it is carried: how many, how they come back, how far they're thrown, what G does and the blast. */
export interface GrenadeStats extends GrenadeData {
  tipo: GrenadeKind;
  explosao: GrenadeLevel;
}

/** The grenade's effective stats with `upgrades` (e.g. ['mina'] for land mines). */
export function grenadeStats(upgrades: readonly string[] = []): GrenadeStats {
  const base = GRENADES.granada_frag;
  const fx = effectsOf('granada', upgrades);
  const blast = grenadeLevel(base, 1);
  const r = product(fx, 'raio');
  return {
    ...base,
    quantidade: base.quantidade + sum(fx, 'granadas'),
    recargaSegundos: base.recargaSegundos * product(fx, 'recargaGranada'),
    velocidadeLancamento: base.velocidadeLancamento * product(fx, 'lancamento'),
    tipo: last(fx, 'tipo') ?? 'granada',
    explosao: { ...blast, raioDano: blast.raioDano * r, raioDanoMaximo: blast.raioDanoMaximo * r },
  };
}

/** Effective stats of the gun a loadout has in `slot` (null when the slot is empty). */
export function slotStats(lo: Loadout, slot: GunSlot): GunStats | null {
  const g = gunIn(lo, slot);
  return g ? gunStats(g, lo.ativas[g]) : null;
}
