// Zumbi (co-op zombie waves): the mode's numbers (data/zumbi.json) and its pure rules, used by the match
// engine (shared/zombieMatch.ts) that runs on the server online and in the browser for the solo game:
// - the waves: how many zombies of which kinds, their health, speed and how fast they come, with more
//   zombies for more players and a boss on the milestone waves;
// - the economy: money per kill (more for a headshot or a knife), assists and revives; the Mystery Coffin
//   (Caixão Misterioso) rolls a random weapon (gun + fixed upgrades, of a rarity that multiplies its damage
//   against zombies) for the coffin's price, and now and then hands it out damaged (fewer rounds, less damage
//   or both; even a legendary one can come broken);
// - what everyone starts with: the Rifle Padrão with no upgrades and the plain knife, whatever the account
//   has unlocked (the coffin is this mode's progression).
// The barricades' rules (shared/barricades.ts) use the numbers here too. Each zumbi map's layout (the wall, where
// the horde rises, the gaps, the coffin) lives in the map's own data (shared/data/mapas/<map>.json, "zumbi").
import data from './data/zumbi.json';
import cemiterio from './data/mapas/cemiterio.json';
import { isGun, isKnife, PRIMARIES, progOf, upgradeOf, type GunId, type KnifeId, type ProgWeapon, type WeaponId } from './progression';
import { damageAtDistance, LETHAL_DAMAGE, type HitRegion, type WeaponData } from './weapons';
import { WEAPON_FLAWS, type GunStats, type Loadout, type WeaponFlaw } from './arsenal';
import type { MapId } from './maps';
import type { Vec3 } from './protocol';

export type ZType = 'comum' | 'corredor' | 'inchado' | 'brutamontes' | 'cuspidor';
export type BossId = 'coveiro' | 'noiva' | 'prefeito';
/** Anything that walks: a zombie kind or a boss. Its index in Z_KINDS is what the network carries. */
export type ZKind = ZType | BossId;
export const Z_TYPES: ZType[] = ['comum', 'corredor', 'inchado', 'brutamontes', 'cuspidor'];
export const BOSS_IDS: BossId[] = ['coveiro', 'noiva', 'prefeito'];
export const Z_KINDS: ZKind[] = [...Z_TYPES, ...BOSS_IDS];
export const isBoss = (k: ZKind): k is BossId => BOSS_IDS.includes(k as BossId);

export type Rarity = 'inicial' | 'comum' | 'raro' | 'epico' | 'lendario';
export const RARITIES: Rarity[] = ['inicial', 'comum', 'raro', 'epico', 'lendario'];

/** A weapon the coffin hands out: a gun (or the knife) with fixed upgrades and a rarity. */
export interface ZItem {
  id: string;
  arma: GunId | 'faca';
  /** A knife item: which knife (the saber). */
  faca?: KnifeId;
  melhorias: string[];
  raridade: Rarity;
}

/** The slot an item goes into: the rifle is the primary, the pistol and the SMG the secondary, the saber the knife. */
export type ZSlot = 'primaria' | 'secundaria' | 'faca';

interface TypeData {
  vida: number;
  andar: [number, number];
  correr: [number, number];
  dano: number;
  alcance: number;
  preparo: number;
  recarga: number;
  dinheiro: number;
  xp: number;
  escala: number;
  explosao?: { raio: number; dano: number; danoZumbi: number };
  cuspe?: { dano: number; alcance: number; minimo: number; velocidade: number; raio: number; recarga: number; preparo: number };
}

interface BossData {
  vida: number;
  andar: number;
  dano: number;
  alcance: number;
  preparo: number;
  recarga: number;
  escala: number;
  dinheiro: number;
  dinheiroTime: number;
  xp: number;
  xpTime: number;
  pancada?: { raio: number; dano: number; preparo: number; recarga: number; distancia: number };
  invocar?: { zumbis: number; preparo: number; recarga: number; primeira: number };
  grito?: { raio: number; dano: number; lentidao: number; duracao: number; preparo: number; recarga: number };
  sumir?: { preparo: number; recarga: number; distancia: number };
  investida?: { dano: number; velocidade: number; maximo: number; minimo: number; largura: number; preparo: number; recarga: number; empurrao: number };
  tremor?: { raio: number; velocidade: number; dano: number; espessura: number; preparo: number; recarga: number };
  furia?: { vida: number; velocidade: number; recargas: number; corredores: number; intervalo: number };
}

interface WaveData {
  zumbis: number;
  vida: number;
  intervalo: number;
  corrida: number;
  tipos: Partial<Record<ZType, number>>;
  chefe?: BossId;
}

/**
 * A gap in the cemetery wall where a barricade can be built: the axis the wall runs along there ('x': a wall
 * along X, crossed along Z), the middle of the gap (on the wall's center line) and its clear width.
 */
export interface BarricadeSpot {
  id: string;
  eixo: 'x' | 'z';
  centro: Vec3;
  largura: number;
}

export interface ZombieMapData {
  /** The wall's center line around the yard (x0, z0, x1, z1): inside it, the players' side; the gaps are the only way in. */
  dentro: [number, number, number, number];
  /** Where zombies come out (they rise from the ground): the grave field outside the wall, never inside. */
  surgir: Vec3[];
  /** Where the coffin stands (always): x, y, z and its yaw. */
  caixa: [number, number, number, number];
  /** Where each boss rises. */
  chefe: Record<BossId, Vec3>;
  /** The gaps in the wall, in the order the barricades are numbered (network, navmesh flags). */
  barricadas: BarricadeSpot[];
  /** The hedge around the grave field, its center line (x0, z0, x1, z1): thorny, like the wall's bars. */
  sebe?: [number, number, number, number];
  /** The chapel's totem, on the altar (x, y, z): E there turns on the no-break vigil (ZOMBIE.totem). */
  totem?: Vec3;
}

/**
 * Every number of the mode. A plain object loaded from the JSON (and the zumbi maps' layouts from their data):
 * the server tests shorten its times and prices to play a whole match in seconds.
 */
export const ZOMBIE = { ...data, mapas: { cemiterio: cemiterio.zumbi } } as unknown as {
  inicioSegundos: number;
  intervaloSegundos: number;
  intervaloChefeSegundos: number;
  fimSegundos: number;
  dinheiroInicial: number;
  jogadoresFator: number;
  chefeVidaFator: number;
  maxVivosBase: number;
  maxVivosPorJogador: number;
  maxVivosTeto: number;
  danoPorOnda: number;
  ondas: WaveData[];
  tipos: Record<ZType, TypeData>;
  chefes: Record<BossId, BossData>;
  dinheiro: { tiroNaCabeca: number; faca: number; assistencia: number; assistenciaMinima: number; reanimar: number; onda: number };
  xp: { onda: number; vitoria: number; reanimar: number };
  jogador: { caidoSegundos: number; reanimarSegundos: number; reanimarVida: number; reanimarAlcance: number };
  armas: { faca: number; granadaPorOnda: number; municaoReserva: number };
  caixa: {
    custo: number;
    girarSegundos: number;
    ofertaSegundos: number;
    alcance: number;
    /**
     * Damaged rolls: the chance by rarity, how likely each flaw is once damaged, and the penalties (fraction
     * of the magazine and of the reserve kept, damage multiplier).
     */
    danificada: { chance: Record<Rarity, number>; tipos: Record<ZFlaw, number>; pente: number; reserva: number; dano: number };
  };
  barricadas: {
    tabuas: number;
    vidaTabua: number;
    custo: number;
    erguerSegundos: number;
    repararSegundos: number;
    reparoDinheiro: number;
    reparoTetoOnda: number;
    alcance: number;
    /** What one blow takes from the boards: each kind's swipe, a boss's, a bloater's burst ('explosao'). */
    dano: Record<ZType | 'chefe' | 'explosao', number>;
  };
  /**
   * The chapel's totem: paying `custo` there turns on the Vigília Sem Trégua for the rest of the match (it can't
   * be turned off): the break between waves lasts `intervaloSegundos`, and every money and XP gain is multiplied.
   */
  totem: { custo: number; alcance: number; intervaloSegundos: number; dinheiro: number; xp: number };
  /** The wall's bars and the hedge hurt whoever climbs them, and leave them bleeding. */
  espinhos: {
    dano: number;
    intervaloSegundos: number;
    sangraSegundos: number;
    sangraDano: number;
    sangraTiqueSegundos: number;
    /** Feet this high or more (m) count as climbing: on the ground nobody's centre gets that close to the line. */
    alturaMinima: number;
    /** How close to the wall's / hedge's centre line (m) the feet must be. */
    faixaMuro: number;
    faixaSebe: number;
  };
  raridades: Record<Rarity, { peso: number; dano: number }>;
  inicial: string;
  itens: ZItem[];
  mapas: Partial<Record<MapId, ZombieMapData>>;
};

export const ZITEMS = new Map(ZOMBIE.itens.map((i) => [i.id, i]));
export const itemOf = (id: string | null | undefined): ZItem | undefined => (id ? ZITEMS.get(id) : undefined);
export const itemSlot = (it: ZItem): ZSlot => (it.arma === 'faca' ? 'faca' : PRIMARIES.includes(it.arma) ? 'primaria' : 'secundaria');
/** How much harder a weapon of this rarity hits zombies. */
export const rarityMul = (r: Rarity) => ZOMBIE.raridades[r]?.dano ?? 1;

/** What's wrong with a damaged weapon: fewer rounds, less damage, or both. */
export type ZFlaw = WeaponFlaw;
export const Z_FLAWS = WEAPON_FLAWS;

/** What a player carries in this mode: an item per slot (null: empty secondary, plain knife), and which are damaged. */
export interface ZItems {
  primaria: string;
  secundaria: string | null;
  faca: string | null;
  /** The slots holding a damaged copy of their item, and its flaw (absent: everything intact). */
  danificadas?: Partial<Record<ZSlot, ZFlaw>>;
}

export const startItems = (): ZItems => ({ primaria: ZOMBIE.inicial, secundaria: null, faca: null });

/** Items with `it` (damaged with `flaw`, or intact) in its slot, in place of what was there. */
export function withItem(items: ZItems, it: ZItem, flaw: ZFlaw | null): ZItems {
  const slot = itemSlot(it);
  const { danificadas, ...rest } = items;
  const flaws: Partial<Record<ZSlot, ZFlaw>> = { ...danificadas };
  if (flaw) flaws[slot] = flaw;
  else delete flaws[slot];
  return { ...rest, [slot]: it.id, ...(Object.keys(flaws).length ? { danificadas: flaws } : {}) };
}

/** The loadout of a player's items: the guns with their fixed upgrades, the saber on the knife; no grenade upgrades. */
export function zombieLoadout(items: ZItems): Loadout {
  const ativas: Loadout['ativas'] = { rifle: [], pistola: [], smg: [], faca: [], granada: [] };
  const prim = itemOf(items.primaria) ?? itemOf(ZOMBIE.inicial)!;
  const sec = itemOf(items.secundaria);
  const knife = itemOf(items.faca);
  const primGun: GunId = isGun(prim.arma) ? prim.arma : 'rifle';
  ativas[progOf(primGun)] = [...prim.melhorias];
  const secGun: GunId | null = sec && isGun(sec.arma) ? sec.arma : null;
  if (sec && secGun) ativas[progOf(secGun)] = [...sec.melhorias];
  if (knife) ativas.faca = [...knife.melhorias];
  // A damaged item's flaw goes with its weapon (the client gives the gun fewer rounds).
  const danificadas: Partial<Record<ProgWeapon, ZFlaw>> = {};
  const flaws = items.danificadas ?? {};
  if (flaws.primaria) danificadas[progOf(primGun)] = flaws.primaria;
  if (flaws.secundaria && secGun) danificadas[progOf(secGun)] = flaws.secundaria;
  if (flaws.faca && knife) danificadas.faca = flaws.faca;
  const faca: KnifeId = knife && isKnife(knife.faca) ? knife.faca : 'faca';
  return { primaria: primGun, secundaria: secGun, faca, ativas, ...(Object.keys(danificadas).length ? { danificadas } : {}) };
}

/** The slot of the weapon a hit came from (the rifles are the primary, the pistol and the SMG the secondary). */
const slotOfGun = (gun: WeaponId): ZSlot => (isKnife(gun) ? 'faca' : isGun(gun) && PRIMARIES.includes(gun) ? 'primaria' : 'secundaria');

/** The item behind the gun a hit came from (by the gun: the rifles are the primary). */
export function itemOfGun(items: ZItems, gun: GunId | 'faca'): ZItem | undefined {
  const it = itemOf(items[slotOfGun(gun)]);
  return it?.arma === gun ? it : undefined;
}

/** The flaw of the weapon a hit came from, if it's a damaged one. */
export const flawOfGun = (items: ZItems, gun: GunId | 'faca'): ZFlaw | null => (itemOfGun(items, gun) ? (items.danificadas?.[slotOfGun(gun)] ?? null) : null);

/** A flaw's damage multiplier (less damage for 'dano' and 'ambos'). */
export const flawDamageMul = (flaw: ZFlaw | null | undefined) => (flaw === 'dano' || flaw === 'ambos' ? ZOMBIE.caixa.danificada.dano : 1);

/** A flaw's ammo: the fraction of the magazine and of the reserve kept (fewer rounds for 'municao' and 'ambos'). */
export function flawAmmo(flaw: ZFlaw | null | undefined): { pente: number; reserva: number } {
  const d = ZOMBIE.caixa.danificada;
  return flaw === 'municao' || flaw === 'ambos' ? { pente: d.pente, reserva: d.reserva } : { pente: 1, reserva: 1 };
}

/**
 * The damage multiplier of whatever made a hit: the item's rarity (the plain knife ×1), less for a damaged one.
 * The server's hit checks (and the solo game's) use it.
 */
export const weaponMul = (items: ZItems, gun: GunId | 'faca') => rarityMul(itemOfGun(items, gun)?.raridade ?? 'inicial') * flawDamageMul(flawOfGun(items, gun));

/** A gun as this mode hands it out: a bigger reserve for hordes, minus a damaged gun's missing rounds. */
export function zombieGunData(g: GunStats, flaw: ZFlaw | null | undefined): GunStats {
  const a = flawAmmo(flaw);
  return { ...g, pente: Math.max(1, Math.round(g.pente * a.pente)), reserva: Math.max(1, Math.round(g.reserva * ZOMBIE.armas.municaoReserva * a.reserva)) };
}

// --- Waves -------------------------------------------------------------------------------------------------

export const WAVES = ZOMBIE.ondas.length;

export interface WaveSpec {
  wave: number;
  /** Zombies of the wave (the boss and its summons not counted). */
  total: number;
  hp: number;
  /** Seconds between two zombies coming out. */
  interval: number;
  runFrac: number;
  types: Partial<Record<ZType, number>>;
  boss: BossId | null;
  /** At most this many walking at once (the rest wait their turn). */
  maxAlive: number;
}

/** More players, more zombies: × (1 + jogadoresFator × (players − 1)). */
export const playersFactor = (players: number) => 1 + ZOMBIE.jogadoresFator * (Math.max(1, players) - 1);

/** Wave `wave` (1-based) for `players` people. */
export function waveSpec(wave: number, players: number): WaveSpec {
  const w = ZOMBIE.ondas[Math.min(Math.max(1, wave), WAVES) - 1];
  const p = Math.max(1, players);
  return {
    wave,
    total: Math.round(w.zumbis * playersFactor(p)),
    hp: w.vida,
    interval: w.intervalo,
    runFrac: w.corrida,
    types: w.tipos,
    boss: w.chefe ?? null,
    maxAlive: Math.min(ZOMBIE.maxVivosTeto, ZOMBIE.maxVivosBase + ZOMBIE.maxVivosPorJogador * p + Math.floor(wave / 2)),
  };
}

/** The kind of the next zombie: each variant by its chance, the rest plain ones. */
export function pickType(spec: WaveSpec, rng: () => number): ZType {
  let r = rng();
  for (const t of Z_TYPES) {
    const c = spec.types[t] ?? 0;
    if (r < c) return t;
    r -= c;
  }
  return 'comum';
}

export const bossHp = (b: BossId, players: number) => Math.round(ZOMBIE.chefes[b].vida * (1 + ZOMBIE.chefeVidaFator * (Math.max(1, players) - 1)));

/** Health of a zombie of a kind in a wave (bosses: by the players). */
export const zombieHp = (kind: ZKind, spec: WaveSpec, players: number) => (isBoss(kind) ? bossHp(kind, players) : Math.round(spec.hp * ZOMBIE.tipos[kind].vida));

/** What a zombie's hit takes from a player: the kind's damage, a little more every wave. */
export function zombieHit(kind: ZKind, wave: number): number {
  const base = isBoss(kind) ? ZOMBIE.chefes[kind].dano : ZOMBIE.tipos[kind].dano;
  return Math.round(base * (1 + ZOMBIE.danoPorOnda * (Math.max(1, wave) - 1)));
}

/** Body scale of a kind (hitboxes and model). */
export const kindScale = (k: ZKind) => (isBoss(k) ? ZOMBIE.chefes[k].escala : ZOMBIE.tipos[k].escala);

// --- Damage to zombies ---------------------------------------------------------------------------------------

/**
 * A bullet's damage to a zombie: the gun's at that distance and body region, times its rarity. The groin is
 * an instant kill on a plain zombie ("No pássaro!") and a double hit on a boss (bosses never die in one shot).
 */
export function gunDamageToZombie(gun: WeaponData, dist: number, region: HitRegion, keep: number, mul: number, boss: boolean): number {
  const base = damageAtDistance(gun, dist) * keep * mul;
  if (region === 'virilha') return boss ? Math.round(base * 2) : LETHAL_DAMAGE;
  return Math.max(1, Math.round(base * gun.multiplicadores[region]));
}

/** A knife's damage to a zombie (never lethal on its own: the saber's rarity makes it deadly). */
export const knifeDamageToZombie = (mul: number) => Math.round(ZOMBIE.armas.faca * mul);

/** A grenade's damage to a zombie: the blast's, stronger every wave so grenades stay useful. */
export const grenadeDamageToZombie = (raw: number, wave: number) => Math.round(raw * (1 + ZOMBIE.armas.granadaPorOnda * (Math.max(1, wave) - 1)));

// --- Economy -------------------------------------------------------------------------------------------------

export type KillHow = 'gun' | 'head' | 'groin' | 'knife' | 'grenade' | 'blast';

/** Money for a kill: the kind's, plus a headshot's or a knife's bonus. Bosses pay the killer their own. */
export function killMoney(kind: ZKind, how: KillHow): number {
  const base = isBoss(kind) ? ZOMBIE.chefes[kind].dinheiro : ZOMBIE.tipos[kind].dinheiro;
  return base + (how === 'head' ? ZOMBIE.dinheiro.tiroNaCabeca : how === 'knife' ? ZOMBIE.dinheiro.faca : 0);
}

/** Account XP for a kill (online only: the server grants it). */
export const killXp = (kind: ZKind) => (isBoss(kind) ? ZOMBIE.chefes[kind].xp : ZOMBIE.tipos[kind].xp);

/** What the coffin can give: everything but the starting rifle. */
export const BOX_ITEMS = ZOMBIE.itens.filter((i) => i.raridade !== 'inicial');

/**
 * A coffin roll: a rarity by its weight, then one of its items, never one already in hand intact (the coffin
 * always gives something new; a damaged copy can come back whole: luck is the only repair). Random numbers
 * from `rng` (the server's online).
 */
export function rollBox(rng: () => number, held: ZItems): ZItem {
  const flaws = held.danificadas ?? {};
  const has = new Set((['primaria', 'secundaria', 'faca'] as const).filter((s) => !flaws[s]).map((s) => held[s]));
  const pool = BOX_ITEMS.filter((i) => !has.has(i.id));
  const weights = RARITIES.map((r) => (pool.some((i) => i.raridade === r) ? ZOMBIE.raridades[r].peso : 0));
  const sum = weights.reduce((a, b) => a + b, 0);
  let x = rng() * sum;
  let rarity: Rarity = 'comum';
  for (let i = 0; i < RARITIES.length; i++) {
    if (x < weights[i]) {
      rarity = RARITIES[i];
      break;
    }
    x -= weights[i];
  }
  const options = pool.filter((i) => i.raridade === rarity);
  return options[Math.min(options.length - 1, Math.floor(rng() * options.length))] ?? pool[0];
}

/** The chance that a roll of this item comes damaged (by its rarity: rarer is sturdier, never flawless). */
export const flawChance = (it: ZItem) => ZOMBIE.caixa.danificada.chance[it.raridade] ?? 0;

/**
 * Whether the coffin's roll of `it` comes damaged, and how (null: intact): its rarity's chance, then a flaw by
 * its weight. A blade has no rounds to lose: its flaw is always less damage.
 */
export function rollFlaw(rng: () => number, it: ZItem): ZFlaw | null {
  if (rng() >= flawChance(it)) return null;
  const w = ZOMBIE.caixa.danificada.tipos;
  const sum = Z_FLAWS.reduce((s, f) => s + (w[f] ?? 0), 0);
  let x = rng() * sum;
  let flaw: ZFlaw = 'dano';
  for (const f of Z_FLAWS) {
    if (x < (w[f] ?? 0)) {
      flaw = f;
      break;
    }
    x -= w[f] ?? 0;
  }
  return it.arma === 'faca' ? 'dano' : flaw;
}

// --- Network -----------------------------------------------------------------------------------------------

/** What a zombie is doing, for its animation (bit flags of a ZNet). */
export const ZF = {
  /** Coming out of the ground (can't move or hit yet). */
  rising: 1,
  /** Winding up a swipe. */
  attack: 2,
  /** A bloater swelling up before it bursts. */
  fuse: 4,
  /** A spitter winding up its spit. */
  spit: 8,
  /** A boss winding up its special move (which one: the 'zfx' event). */
  special: 16,
  /** Vanished (the bride between her blinks): no hitbox. */
  hidden: 32,
  /** Running gait. */
  run: 64,
  /** A boss past half health: angrier. */
  enraged: 128,
} as const;

/** One zombie in a snapshot: id, kind index (Z_KINDS), feet x y z, yaw, flags (ZF). */
export type ZNet = [id: number, kind: number, x: number, y: number, z: number, yaw: number, f: number];

/** The data and the weapons agree (checked by the tests): known upgrades, every rarity rollable, map data present. */
export function zombieProblems(): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const it of ZOMBIE.itens) {
    if (ids.has(it.id)) out.push(`item repetido ${it.id}`);
    ids.add(it.id);
    if (it.arma !== 'faca' && !isGun(it.arma)) out.push(`${it.id}: arma desconhecida`);
    if (it.faca !== undefined && !isKnife(it.faca)) out.push(`${it.id}: faca desconhecida`);
    const prog = it.arma === 'faca' ? 'faca' : isGun(it.arma) ? progOf(it.arma) : null;
    if (prog) for (const u of it.melhorias) if (!upgradeOf(prog, u)) out.push(`${it.id}: melhoria desconhecida ${u}`);
    if (!RARITIES.includes(it.raridade)) out.push(`${it.id}: raridade desconhecida`);
  }
  const start = itemOf(ZOMBIE.inicial);
  if (!start || start.arma !== 'rifle' || start.melhorias.length) out.push('a arma inicial deve ser o rifle sem melhorias');
  for (const r of RARITIES) if (r !== 'inicial' && !BOX_ITEMS.some((i) => i.raridade === r)) out.push(`nenhum item ${r} na caixa`);
  ZOMBIE.ondas.forEach((w, i) => {
    const chance = Object.values(w.tipos).reduce((a, b) => a + (b ?? 0), 0);
    if (chance > 1) out.push(`onda ${i + 1}: chances somam mais de 1`);
    if (w.chefe && !BOSS_IDS.includes(w.chefe)) out.push(`onda ${i + 1}: chefe desconhecido`);
  });
  if (!ZOMBIE.ondas[WAVES - 1]?.chefe) out.push('a última onda precisa de um chefe');
  const d = ZOMBIE.caixa.danificada;
  for (const r of RARITIES) if (r !== 'inicial' && !(d.chance[r] > 0 && d.chance[r] < 1)) out.push(`raridade ${r}: chance de vir danificada fora de (0, 1)`);
  for (let i = 2; i < RARITIES.length; i++) if (d.chance[RARITIES[i]] > d.chance[RARITIES[i - 1]]) out.push(`${RARITIES[i]} quebra mais que ${RARITIES[i - 1]}`);
  if (!Z_FLAWS.every((f) => d.tipos[f] > 0)) out.push('todo defeito precisa de um peso');
  if (!(d.pente > 0 && d.pente < 1 && d.reserva > 0 && d.reserva < 1 && d.dano > 0 && d.dano < 1)) out.push('as penalidades de arma danificada devem ficar entre 0 e 1');
  for (const [map, m] of Object.entries(ZOMBIE.mapas)) if (m) out.push(...checkZombieMap(map, m));
  return out;
}

const isNums = (v: unknown, n: number) => Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'number' && Number.isFinite(x));

/**
 * What's wrong with a map's zumbi layout (`map` names it in the messages): its shape (it may come from a map's
 * data), the spawn spots outside the wall, the coffin inside it, a spot for every boss and the gaps on the wall.
 */
export function checkZombieMap(map: string, m: ZombieMapData): string[] {
  const out: string[] = [];
  const chefe = (m?.chefe ?? {}) as Record<string, unknown>;
  if (!isNums(m?.dentro, 4) || !Array.isArray(m.surgir) || !m.surgir.every((p) => isNums(p, 3)) || !isNums(m.caixa, 4) || !Array.isArray(m.barricadas) || !Object.values(chefe).every((p) => isNums(p, 3)))
    return [`${map}: { dentro: [x0, z0, x1, z1], surgir: [[x, y, z]], caixa: [x, y, z, giro], chefe, barricadas }`];
  for (const g of m.barricadas) if (!g || typeof g.id !== 'string' || (g.eixo !== 'x' && g.eixo !== 'z') || !isNums(g.centro, 3) || typeof g.largura !== 'number') return [`${map}: brecha { id, eixo, centro, largura }`];
  if (m.sebe !== undefined && !isNums(m.sebe, 4)) out.push(`${map}: sebe: [x0, z0, x1, z1]`);
  const [x0, z0, x1, z1] = m.dentro;
  const inside = (p: Vec3) => p[0] > x0 && p[0] < x1 && p[2] > z0 && p[2] < z1;
  if (m.surgir.length < 6) out.push(`${map}: poucos pontos de surgimento`);
  // The horde comes from outside the wall, through the gaps: never from inside.
  for (const p of m.surgir) if (inside(p)) out.push(`${map}: ponto de surgimento dentro do muro ${p.join(',')}`);
  if (!inside(m.caixa as unknown as Vec3)) out.push(`${map}: o caixão fica dentro do muro`);
  for (const b of BOSS_IDS) if (!m.chefe[b]) out.push(`${map}: sem lugar para ${b}`);
  if (m.barricadas.length < 2 || m.barricadas.length > 15) out.push(`${map}: de 2 a 15 brechas no muro`);
  for (const g of m.barricadas) {
    const [gx, , gz] = g.centro;
    // On the wall's line: a wall along X sits on z0 or z1, one along Z on x0 or x1.
    const onWall = g.eixo === 'x' ? (gz === z0 || gz === z1) && gx > x0 && gx < x1 : (gx === x0 || gx === x1) && gz > z0 && gz < z1;
    if (!onWall) out.push(`${map}: a brecha ${g.id} não está no muro`);
    if (!(g.largura >= 1.8 && g.largura <= 4)) out.push(`${map}: a brecha ${g.id} deve ter de 1,8 a 4 m`);
  }
  return out;
}
