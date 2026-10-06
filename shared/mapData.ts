// A map as data (PF-6): what the client builds (client/world/mapLoader.ts), the editor edits and the server
// checks and stores. The official maps ship as shared/data/mapas/<id>.json.
//
// The pieces (`pecas`) are the map: each one a kind from shared/mapCatalog.ts with its params, built in
// order. Their order matters (the static batches, the colliders and the navmesh are built in it), and each
// piece that draws random numbers keeps its own seed (`semente`), so a piece builds the same wherever it
// sits in the list. Gags keep their PropBus id (`prop`) explicitly: online, everyone in a session triggers
// the same one.
import { checkPieceParams, MAP_CATALOG } from './mapCatalog';
import { checkZombieMap, type ZombieMapData } from './zombies';
import type { PickupKind } from './maps';

/** Version of this format: a map from a newer format is refused, one from an older one is migrated. */
export const MAP_FORMAT = 1;

/** The most a map may cost to draw (client/world/budget.ts counts it); above it, it can't be saved. */
export const MAP_BUDGET = { drawCalls: 400, triangulos: 750_000 } as const;

export type Vec3 = [number, number, number];

export interface Peca {
  /** Unique within the map (the editor selects and rebuilds pieces by it). */
  id: string;
  /** A kind of shared/mapCatalog.ts. */
  tipo: string;
  /** Where it stands ('livre' kinds). */
  p?: Vec3;
  /** Turn around Y (radians; 'livre' kinds that turn). */
  yaw?: number;
  /** Uniform scale ('livre' kinds that scale). */
  escala?: number;
  params: Record<string, unknown>;
  /** Seed of its random numbers (kinds that draw them). */
  semente?: number;
  /** Its gag's PropBus id. */
  prop?: string;
  /** The collectible it holds (an id of MapData.objetos.coletaveis). */
  coletavel?: string;
}

/** A map's sky and light (the client's Atmosphere). */
export interface Atmosfera {
  fundo: number;
  neblina: { cor: number; perto: number; longe: number };
  hemisferio: { ceu: number; chao: number; intensidade: number };
  /** The sun (or the moon): color, strength and where it shines from (toward the origin). */
  sol: { cor: number; intensidade: number; de: Vec3 };
  /** The first-person weapon's own lights. */
  arma: { ceu: number; chao: number; hemisferio: number; sol: number; corSol: number };
}

/** What's drawn in the sky: drifting clouds (day), the full moon over a starry dome, or the garden's night with its floating lanterns. */
export type Cupula = { tipo: 'nuvens' } | { tipo: 'lua'; lua: Vec3 } | { tipo: 'oriental' };

/** An ambient sound now and then, somewhere in the sky around the listener: the first after `primeiro` s, then every [min, max] s. */
export interface SomAmbiente {
  som: 'passaro' | 'corvo' | 'uivo';
  primeiro: number;
  intervalo: [number, number];
}

export interface Spawn {
  p: Vec3;
  yaw: number;
}

export interface Boneco {
  p: Vec3;
  yaw: number;
  patrulha?: { eixo: 'x' | 'z'; amplitude: number; velocidade: number };
}

/** What the server tracks on a map: collectibles, the witch, giant rats and fish (their ids are the network's). */
export interface ObjetosMapa {
  coletaveis: { id: string; tipo: PickupKind; p: Vec3 }[];
  /** Where the witch stands (feet), whose potions can be drunk near her; null: no witch. */
  bruxa: Vec3 | null;
  ratos: { id: string; p: Vec3 }[];
  /** Each fish swims a loop (center x, z and radius; an ellipse 0.7 as deep along Z) at depth `y`, in pond `lago`. */
  peixes: { id: string; lago: string; volta: Vec3; y: number }[];
}

/** A file the map uses (a GLB model): pieces name it by `id`. */
export interface ArquivoMapa {
  id: string;
  url: string;
  sha256?: string;
  bytes?: number;
}

export interface MapData {
  formato: number;
  nome: string;
  /** Made for one mode only (the zumbi cemetery): played in that mode and nowhere else. */
  exclusivo?: 'zumbi';
  /** Its card on the map pickers. */
  cartao: { emoji: string; cor: string };
  ambiente: {
    /** Sky and light (absent: the sunny day) and what's drawn up there. */
    ceu: { atmosfera?: Atmosfera; cupula?: Cupula };
    /** Size (m) of the cells the static geometry is batched in. */
    celula: number;
    /** Half size (m) the sun's shadow must cover, when bigger than the default. */
    sombra?: number;
    /** Falling below it kills. */
    killY: number;
    sons?: SomAmbiente[];
  };
  pecas: Peca[];
  arquivos: ArquivoMapa[];
  spawns: { a: Spawn[]; b: Spawn[]; ffa: Spawn[] };
  /** Training range dummies. */
  bonecos: Boneco[];
  objetos: ObjetosMapa;
  /** The zumbi mode's layout (the wall, where the horde rises, the gaps, the coffin). */
  zumbi?: ZombieMapData;
  /** Shared systems' settings: how many real lights (the nearest light spots) the map turns on. */
  servicos?: { luzes?: number };
}

const MAX_PECAS = 30_000;
const PROP_ID = /^[a-z]{1,16}(:\d{1,3})?$/;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(isNum);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function checkAtmosfera(a: unknown, out: string[]) {
  if (!isObj(a)) return out.push('ambiente.ceu.atmosfera: deve ser um objeto');
  const n = (v: unknown, path: string) => isNum(v) || out.push(`ambiente.ceu.atmosfera.${path}: número`);
  n(a.fundo, 'fundo');
  const f = isObj(a.neblina) ? a.neblina : {};
  n(f.cor, 'neblina.cor');
  n(f.perto, 'neblina.perto');
  n(f.longe, 'neblina.longe');
  const h = isObj(a.hemisferio) ? a.hemisferio : {};
  n(h.ceu, 'hemisferio.ceu');
  n(h.chao, 'hemisferio.chao');
  n(h.intensidade, 'hemisferio.intensidade');
  const s = isObj(a.sol) ? a.sol : {};
  n(s.cor, 'sol.cor');
  n(s.intensidade, 'sol.intensidade');
  if (!isVec3(s.de)) out.push('ambiente.ceu.atmosfera.sol.de: 3 números');
  const w = isObj(a.arma) ? a.arma : {};
  for (const k of ['ceu', 'chao', 'hemisferio', 'sol', 'corSol']) n(w[k], `arma.${k}`);
}

function checkSpawns(list: unknown, path: string, out: string[], min: number) {
  if (!Array.isArray(list)) return out.push(`${path}: deve ser uma lista`);
  if (list.length < min) out.push(`${path}: pelo menos ${min}`);
  if (list.length > 64) out.push(`${path}: no máximo 64`);
  list.forEach((s, i) => {
    if (!isObj(s) || !isVec3(s.p) || !isNum(s.yaw)) out.push(`${path}[${i}]: { p: [x, y, z], yaw }`);
  });
}

/**
 * Checks a map's data from anywhere (a file, the editor, a request): its shape, every piece against the
 * catalog, the per-map limits, the objects the server tracks and the zumbi layout. Pure: no side effects.
 */
export function validateMapData(raw: unknown): { ok: boolean; erros: string[] } {
  const out: string[] = [];
  if (!isObj(raw)) return { ok: false, erros: ['o mapa deve ser um objeto'] };
  const d = raw;
  if (d.formato !== MAP_FORMAT) out.push(`formato: deve ser ${MAP_FORMAT}`);
  if (typeof d.nome !== 'string' || !d.nome.trim() || d.nome.length > 60) out.push('nome: de 1 a 60 caracteres');
  if (d.exclusivo !== undefined && d.exclusivo !== 'zumbi') out.push('exclusivo: só "zumbi"');
  if (!isObj(d.cartao) || typeof d.cartao.emoji !== 'string' || !d.cartao.emoji || d.cartao.emoji.length > 16 || typeof d.cartao.cor !== 'string' || !/^#[0-9a-f]{6}$/i.test(d.cartao.cor)) out.push('cartao: { emoji, cor: "#rrggbb" }');

  // Ambience.
  const amb = isObj(d.ambiente) ? d.ambiente : null;
  if (!amb) out.push('ambiente: deve ser um objeto');
  else {
    if (!isNum(amb.celula) || amb.celula < 5 || amb.celula > 200) out.push('ambiente.celula: de 5 a 200');
    if (!isNum(amb.killY) || amb.killY < -200 || amb.killY > 50) out.push('ambiente.killY: de -200 a 50');
    if (amb.sombra !== undefined && (!isNum(amb.sombra) || amb.sombra <= 0 || amb.sombra > 400)) out.push('ambiente.sombra: de 0 a 400');
    const ceu = isObj(amb.ceu) ? amb.ceu : null;
    if (!ceu) out.push('ambiente.ceu: deve ser um objeto');
    else {
      if (ceu.atmosfera !== undefined) checkAtmosfera(ceu.atmosfera, out);
      const c = ceu.cupula;
      if (c !== undefined && !(isObj(c) && (c.tipo === 'nuvens' || c.tipo === 'oriental' || (c.tipo === 'lua' && isVec3(c.lua))))) out.push('ambiente.ceu.cupula: nuvens, lua (com a direção) ou oriental');
    }
    if (amb.sons !== undefined) {
      if (!Array.isArray(amb.sons) || amb.sons.length > 8) out.push('ambiente.sons: lista de até 8');
      else
        amb.sons.forEach((s, i) => {
          if (!isObj(s) || !['passaro', 'corvo', 'uivo'].includes(s.som as string) || !isNum(s.primeiro) || !Array.isArray(s.intervalo) || s.intervalo.length !== 2 || !s.intervalo.every(isNum) || (s.intervalo[0] as number) <= 0 || (s.intervalo[1] as number) < (s.intervalo[0] as number))
            out.push(`ambiente.sons[${i}]: { som, primeiro, intervalo: [min, max] }`);
        });
    }
  }

  // Files.
  const files = new Set<string>();
  if (!Array.isArray(d.arquivos)) out.push('arquivos: deve ser uma lista');
  else
    d.arquivos.forEach((f, i) => {
      if (!isObj(f) || typeof f.id !== 'string' || !f.id || typeof f.url !== 'string' || !f.url) out.push(`arquivos[${i}]: { id, url }`);
      else if (files.has(f.id)) out.push(`arquivos[${i}]: id repetido "${f.id}"`);
      else files.add(f.id);
    });

  // Objects the server tracks.
  const objs = isObj(d.objetos) ? d.objetos : null;
  const pickups = new Set<string>();
  const rats = new Set<string>();
  if (!objs) out.push('objetos: deve ser um objeto');
  else {
    const ids = new Set<string>();
    const unique = (id: unknown, path: string) => {
      if (typeof id !== 'string' || !PROP_ID.test(id)) return out.push(`${path}: id em minúsculas (como os do PropBus)`), false;
      if (ids.has(id)) return out.push(`${path}: id repetido "${id}"`), false;
      ids.add(id);
      return true;
    };
    if (!Array.isArray(objs.coletaveis)) out.push('objetos.coletaveis: deve ser uma lista');
    else
      objs.coletaveis.forEach((c, i) => {
        if (!isObj(c) || !isVec3(c.p) || (c.tipo !== 'cereja' && c.tipo !== 'biscoito')) out.push(`objetos.coletaveis[${i}]: { id, tipo: cereja | biscoito, p }`);
        else if (unique(c.id, `objetos.coletaveis[${i}].id`)) pickups.add(c.id as string);
      });
    if (objs.bruxa !== null && !isVec3(objs.bruxa)) out.push('objetos.bruxa: [x, y, z] ou null');
    if (!Array.isArray(objs.ratos)) out.push('objetos.ratos: deve ser uma lista');
    else
      objs.ratos.forEach((r, i) => {
        if (!isObj(r) || !isVec3(r.p)) out.push(`objetos.ratos[${i}]: { id, p }`);
        else if (unique(r.id, `objetos.ratos[${i}].id`)) rats.add(r.id as string);
      });
    if (!Array.isArray(objs.peixes)) out.push('objetos.peixes: deve ser uma lista');
    else
      objs.peixes.forEach((f, i) => {
        if (!isObj(f) || typeof f.id !== 'string' || !/^[a-z]{1,16}:\d{1,3}$/.test(f.id) || typeof f.lago !== 'string' || !isVec3(f.volta) || !isNum(f.y)) out.push(`objetos.peixes[${i}]: { id: "nome:N", lago, volta: [x, z, raio], y }`);
        else if (ids.has(f.id)) out.push(`objetos.peixes[${i}]: id repetido "${f.id}"`);
        else ids.add(f.id);
      });
  }

  // Pieces.
  const counts = new Map<string, number>();
  const props = new Set<string>();
  let witches = 0;
  if (!Array.isArray(d.pecas)) out.push('pecas: deve ser uma lista');
  else {
    if (d.pecas.length > MAX_PECAS) out.push(`pecas: no máximo ${MAX_PECAS}`);
    const seen = new Set<string>();
    d.pecas.forEach((p, i) => {
      const at = `pecas[${i}]`;
      if (out.length > 200) return;
      if (!isObj(p)) return out.push(`${at}: deve ser um objeto`);
      if (typeof p.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(p.id)) out.push(`${at}.id: de 1 a 40 letras, números, _ ou -`);
      else if (seen.has(p.id)) out.push(`${at}.id: repetido "${p.id}"`);
      else seen.add(p.id);
      const t = typeof p.tipo === 'string' ? MAP_CATALOG[p.tipo] : undefined;
      if (!t) return out.push(`${at}.tipo: desconhecido "${String(p.tipo)}"`);
      counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
      if (p.p !== undefined && !isVec3(p.p)) out.push(`${at}.p: [x, y, z]`);
      if (p.yaw !== undefined && !isNum(p.yaw)) out.push(`${at}.yaw: número`);
      if (p.escala !== undefined && (!isNum(p.escala) || p.escala <= 0 || p.escala > 100)) out.push(`${at}.escala: de 0 a 100`);
      if (p.semente !== undefined && !Number.isInteger(p.semente)) out.push(`${at}.semente: inteiro`);
      if (p.prop !== undefined) {
        if (typeof p.prop !== 'string' || !PROP_ID.test(p.prop)) out.push(`${at}.prop: id do PropBus (minúsculas, ":N" opcional)`);
        else if (props.has(p.prop)) out.push(`${at}.prop: repetido "${p.prop}"`);
        else props.add(p.prop);
      }
      if (p.coletavel !== undefined && !(t.coletavel && typeof p.coletavel === 'string' && pickups.has(p.coletavel))) out.push(`${at}.coletavel: um id de objetos.coletaveis, numa peça que guarda coletável`);
      if (t.id === 'bruxa') witches++;
      if (t.id === 'ratoGigante' && isObj(p.params) && !rats.has(p.params.id as string)) out.push(`${at}.params.id: um id de objetos.ratos`);
      if (t.id === 'glb' && isObj(p.params) && !files.has(p.params.arquivo as string)) out.push(`${at}.params.arquivo: um id de arquivos`);
      out.push(...checkPieceParams(t.id, p.params, `${at}.params`));
    });
  }
  for (const [id, n] of counts) {
    const lim = MAP_CATALOG[id].limite;
    if (lim !== undefined && n > lim) out.push(`pecas: no máximo ${lim} de "${id}"`);
  }
  if (objs && (objs.bruxa !== null) !== witches > 0) out.push('objetos.bruxa: a posição existe se, e só se, houver a peça bruxa');

  // Spawns and dummies.
  const sp = isObj(d.spawns) ? d.spawns : null;
  if (!sp) out.push('spawns: { a, b, ffa }');
  else {
    checkSpawns(sp.a, 'spawns.a', out, 1);
    checkSpawns(sp.b, 'spawns.b', out, 1);
    checkSpawns(sp.ffa, 'spawns.ffa', out, 1);
  }
  if (!Array.isArray(d.bonecos) || d.bonecos.length > 64) out.push('bonecos: lista de até 64');
  else
    d.bonecos.forEach((b, i) => {
      if (!isObj(b) || !isVec3(b.p) || !isNum(b.yaw)) return out.push(`bonecos[${i}]: { p, yaw, patrulha? }`);
      const pt = b.patrulha;
      if (pt !== undefined && !(isObj(pt) && (pt.eixo === 'x' || pt.eixo === 'z') && isNum(pt.amplitude) && isNum(pt.velocidade))) out.push(`bonecos[${i}].patrulha: { eixo, amplitude, velocidade }`);
    });

  // The zumbi layout: needed by (and only by) maps made for that mode.
  if (d.exclusivo === 'zumbi' && d.zumbi === undefined) out.push('zumbi: obrigatório num mapa exclusivo do modo zumbi');
  if (d.zumbi !== undefined) {
    if (!isObj(d.zumbi)) out.push('zumbi: deve ser um objeto');
    else out.push(...checkZombieMap('zumbi', d.zumbi as unknown as ZombieMapData));
  }
  if (d.servicos !== undefined && !(isObj(d.servicos) && (d.servicos.luzes === undefined || (Number.isInteger(d.servicos.luzes) && (d.servicos.luzes as number) >= 0 && (d.servicos.luzes as number) <= 16)))) out.push('servicos.luzes: de 0 a 16');
  return { ok: out.length === 0, erros: out };
}
