// New pieces from the palette: a kind's params copied from its first piece in the official maps (every kind
// they use has a sensible example there), or the catalog's defaults for the few they don't; its own id, seed
// and gag id; and the server's places it needs (a giant rat's, the witch's). A 'livre' piece stands where it was
// dropped; any other is placed there by its pose (the editor measures where its example built first).
import type { MapData, Peca, Vec3 } from '@shared/mapData';
import { MAP_CATALOG, type Param } from '@shared/mapCatalog';
import { clone, newObjectId, newPieceId, newPropId, type Rest } from './document';

/** Defaults by a param's name where the type alone says too little (a rectangle's corners, a run's ends). */
const NAMED: Record<string, number> = { x0: -2, z0: -2, x1: 2, z1: 2, de: -2, ate: 2 };

/** A value for a param from its schema alone (its default, or something small and buildable). */
export function defaultValue(p: Param, name = ''): unknown {
  switch (p.tipo) {
    case 'numero':
    case 'inteiro':
      if (p.padrao !== undefined) return p.padrao;
      if (name in NAMED) return NAMED[name];
      return p.min !== undefined && p.min >= 0 ? Math.max(p.min, 1) : 0;
    case 'booleano':
      return p.padrao ?? false;
    case 'texto':
      return p.padrao ?? '';
    case 'cor':
      return p.padrao ?? 0xcccccc;
    case 'superficie':
      return p.padrao ?? 'concreto';
    case 'opcao':
      return p.padrao ?? p.opcoes[0];
    case 'vec2':
    case 'vec3':
    case 'vec4':
      return p.padrao ? [...p.padrao] : new Array(p.tipo === 'vec2' ? 2 : p.tipo === 'vec3' ? 3 : 4).fill(0);
    case 'lista':
      return [];
    case 'objeto':
      return defaultParams(p.campos);
    case 'json':
      return {};
  }
}

/** Every required param of a schema with its default (optional ones are left out: the adapter's default). */
export function defaultParams(campos: Record<string, Param>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, p] of Object.entries(campos)) if (!p.opcional) out[k] = defaultValue(p, k);
  return out;
}

/** The first piece of each kind in these maps: the examples new pieces copy. */
export function templatesFrom(maps: MapData[]): Map<string, Peca> {
  const out = new Map<string, Peca>();
  for (const m of maps) for (const p of m.pecas) if (!out.has(p.tipo)) out.set(p.tipo, p);
  return out;
}

export interface NewPiece {
  peca: Peca;
  /** The server's places it comes with. */
  rest?: (r: Rest) => void;
  /** Placed by its pose: the editor builds it once to find its middle, then poses it to the drop point. */
  byPose: boolean;
}

/** A new piece of `tipo` dropped at `at` (null: the map has as many as the kind allows). */
export function newPiece(data: MapData, tipo: string, at: Vec3, template?: Peca, rand = Math.random): NewPiece | null {
  const k = MAP_CATALOG[tipo];
  if (!k) return null;
  const peca: Peca = { id: newPieceId(data, tipo), tipo, params: template ? clone(template.params) : defaultParams(k.params) };
  const free = k.transformacao === 'livre' && !!k.usa?.p;
  if (free) {
    peca.p = [...at];
    if (k.usa?.yaw && template?.yaw !== undefined) peca.yaw = template.yaw;
    if (k.usa?.escala && template?.escala !== undefined) peca.escala = template.escala;
  }
  if (k.semente) peca.semente = template?.semente ?? Math.floor(rand() * 1e6);
  if (k.prop) {
    const id = newPropId(data, tipo, template?.prop);
    if (!id) return null;
    peca.prop = id;
  }
  let rest: NewPiece['rest'];
  if (tipo === 'ratoGigante') {
    const id = newObjectId(data, 'rato');
    peca.params.id = id;
    rest = (r) => r.objetos.ratos.push({ id, p: [...at] });
  } else if (tipo === 'bruxa') {
    if (data.objetos.bruxa) return null;
    rest = (r) => (r.objetos.bruxa = [...at]);
  }
  return { peca, rest, byPose: !free };
}

/** What deleting pieces takes with them: the witch's spot with the witch, a rat's place with the last piece of it. */
export function removalRest(data: MapData, ids: string[]): ((r: Rest) => void) | undefined {
  const gone = data.pecas.filter((p) => ids.includes(p.id));
  const left = data.pecas.filter((p) => !ids.includes(p.id));
  const witch = gone.some((p) => p.tipo === 'bruxa') && !left.some((p) => p.tipo === 'bruxa');
  const rats = gone.filter((p) => p.tipo === 'ratoGigante').map((p) => p.params.id as string).filter((id) => !left.some((p) => p.tipo === 'ratoGigante' && p.params.id === id));
  if (!witch && !rats.length) return undefined;
  return (r) => {
    if (witch) r.objetos.bruxa = null;
    if (rats.length) r.objetos.ratos = r.objetos.ratos.filter((x) => !rats.includes(x.id));
  };
}

/** A copy of a piece beside it (its own id, gag id and seed; the collectible stays with the original). */
export function duplicatePiece(data: MapData, src: Peca, offset: Vec3 = [1, 0, 1]): NewPiece | null {
  const made = newPiece(data, src.tipo, src.p ? [src.p[0] + offset[0], src.p[1] + offset[1], src.p[2] + offset[2]] : [0, 0, 0], src);
  if (!made) return null;
  const { peca } = made;
  if (src.yaw !== undefined) peca.yaw = src.yaw;
  if (src.escala !== undefined) peca.escala = src.escala;
  if (src.semente !== undefined) peca.semente = src.semente;
  const pose = src.pose ?? { p: [0, 0, 0], r: [0, 0, 0] };
  if (!src.p) peca.pose = { p: [pose.p[0] + offset[0], pose.p[1] + offset[1], pose.p[2] + offset[2]], r: [...pose.r] };
  else if (src.pose) peca.pose = clone(src.pose);
  return { ...made, byPose: false };
}
