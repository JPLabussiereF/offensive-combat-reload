// Zumbi (co-op zombie waves): the mode's numbers (data/zumbi.json) and its pure rules, used by the match
// engine (shared/zombieMatch.ts) that runs on the server online and in the browser for the solo game:
// - the waves: how many zombies of which kinds, their health, speed and how fast they come, with more
//   zombies for more players and a boss on the milestone waves;
// - the economy: money per kill (more for a headshot or a knife), assists and revives; the Mystery Coffin
//   (Caixão Misterioso) rolls a random weapon (gun + fixed upgrades, of a rarity that multiplies its damage
//   against zombies) for the coffin's price;
// - what everyone starts with: the Rifle Padrão with no upgrades and the plain knife, whatever the account
//   has unlocked (the coffin is this mode's progression).
import data from './data/zumbi.json';
import { isGun, upgradeOf, type GunId, type ProgWeapon } from './progression';
import { damageAtDistance, LETHAL_DAMAGE, type HitRegion, type WeaponData } from './weapons';
import type { Loadout } from './arsenal';
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

export interface ZombieMapData {
  /** Where zombies come out (they rise from the ground): graves, the forest, the road, the sewer... */
  surgir: Vec3[];
  /** Where the coffin can be: x, y, z and its yaw. */
  caixa: [number, number, number, number][];
  /** Where each boss rises. */
  chefe: Record<BossId, Vec3>;
}

/**
 * Every number of the mode. A plain object loaded from the JSON: the server tests shorten its times and
 * prices to play a whole match in seconds.
 */
export const ZOMBIE = data as unknown as {
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
  caixa: { custo: number; girarSegundos: number; ofertaSegundos: number; patoApos: number; patoChance: number; patoAumento: number; patoSegundos: number; mudarSegundos: number; alcance: number };
  raridades: Record<Rarity, { peso: number; dano: number }>;
  inicial: string;
  itens: ZItem[];
  mapas: Partial<Record<MapId, ZombieMapData>>;
};

export const ZITEMS = new Map(ZOMBIE.itens.map((i) => [i.id, i]));
export const itemOf = (id: string | null | undefined): ZItem | undefined => (id ? ZITEMS.get(id) : undefined);
export const itemSlot = (it: ZItem): ZSlot => (it.arma === 'faca' ? 'faca' : it.arma === 'rifle' ? 'primaria' : 'secundaria');
/** How much harder a weapon of this rarity hits zombies. */
export const rarityMul = (r: Rarity) => ZOMBIE.raridades[r]?.dano ?? 1;

/** What a player carries in this mode: an item per slot (null: empty secondary, plain knife). */
export interface ZItems {
  primaria: string;
  secundaria: string | null;
  faca: string | null;
}

export const startItems = (): ZItems => ({ primaria: ZOMBIE.inicial, secundaria: null, faca: null });

/** The loadout of a player's items: the guns with their fixed upgrades, the saber on the knife; no grenade upgrades. */
export function zombieLoadout(items: ZItems): Loadout {
  const ativas: Loadout['ativas'] = { rifle: [], pistola: [], smg: [], faca: [], granada: [] };
  const prim = itemOf(items.primaria) ?? itemOf(ZOMBIE.inicial)!;
  const sec = itemOf(items.secundaria);
  const knife = itemOf(items.faca);
  const primGun: GunId = isGun(prim.arma) ? prim.arma : 'rifle';
  ativas[primGun] = [...prim.melhorias];
  const secGun: GunId | null = sec && isGun(sec.arma) ? sec.arma : null;
  if (sec && secGun) ativas[secGun] = [...sec.melhorias];
  if (knife) ativas.faca = [...knife.melhorias];
  return { primaria: primGun, secundaria: secGun, ativas };
}

/** The item behind the gun a hit came from (by the gun: the rifle is always the primary). */
export function itemOfGun(items: ZItems, gun: ProgWeapon): ZItem | undefined {
  if (gun === 'faca') return itemOf(items.faca);
  const prim = itemOf(items.primaria);
  if (prim?.arma === gun) return prim;
  const sec = itemOf(items.secundaria);
  return sec?.arma === gun ? sec : undefined;
}

/** The damage multiplier of whatever made a hit (guns and the knife by their item; the plain knife ×1). */
export const weaponMul = (items: ZItems, gun: ProgWeapon) => rarityMul(itemOfGun(items, gun)?.raridade ?? 'inicial');

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
 * A coffin roll: a rarity by its weight, then one of its items, never the one already in that slot (the
 * coffin always gives something new). Random numbers from `rng` (the server's online).
 */
export function rollBox(rng: () => number, held: ZItems): ZItem {
  const has = new Set([held.primaria, held.secundaria, held.faca]);
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

/** Chance that a roll is the rubber duck (the coffin then flies off somewhere else), after `rolls` at this spot. */
export function duckChance(rolls: number): number {
  const c = ZOMBIE.caixa;
  return rolls < c.patoApos ? 0 : Math.min(0.9, c.patoChance + c.patoAumento * (rolls - c.patoApos));
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
    for (const u of it.melhorias) if (!upgradeOf(it.arma, u)) out.push(`${it.id}: melhoria desconhecida ${u}`);
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
  for (const [map, m] of Object.entries(ZOMBIE.mapas)) {
    if (!m || m.surgir.length < 6) out.push(`${map}: poucos pontos de surgimento`);
    if (!m || m.caixa.length < 2) out.push(`${map}: o caixão precisa de ao menos 2 lugares`);
    for (const b of BOSS_IDS) if (!m?.chefe[b]) out.push(`${map}: sem lugar para ${b}`);
  }
  return out;
}
