// What a piece's adapter gets to build itself (client/world/mapLoader.ts runs them): the static builder, the
// scene (or, in the editor, the piece's own group), its own seeded randomness and the map's shared systems,
// created the first time a piece asks for them and finished once every piece is built.
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { MapData, Peca, Vec3 } from '@shared/mapData';
import type { Superficie } from '@shared/mapCatalog';
import type { Physics, SurfaceMaterial, OccluderKind } from '../physics';
import type { MapBuilder, PieceOpts } from '../mapBuilder';
import type { PropBus } from '../props';
import type { Seeded } from '../oriental';
import type { SurfaceKey } from '../surfaces';
import type { ChowChow } from '../dog';
import type { MapFrame, MapPickup, MapRewards, MapSfx } from '../gameMap';
import type { Services } from './services';
import type { FishHit } from '../jardim/peixes';
import type { FruitHit } from '../jardim/frutas';

/** Something that can be shot or stabbed among the map's critters (the koi, fruit sets). */
export interface CritterSource<H> {
  shot(o: THREE.Vector3, dir: THREE.Vector3, dist: number): H | null;
  stab(eye: THREE.Vector3, fwd: THREE.Vector3, reach: number): H | null;
}

/** A fruit set: knocked down at once when it's the nearest hit (see mapLoader's critters). */
export interface FruitSource extends CritterSource<FruitHit> {
  hit(k: number, dir: THREE.Vector3): void;
}

/** What the pieces hand the game besides the scene and the colliders. */
export interface MapOutputs {
  dog: ChowChow | null;
  pickups: MapPickup[];
  potion: { at: THREE.Vector3; radius: number; drink(kind: import('@shared/constants').PotionKind): void } | null;
  rats: { id: string; kill(ready: number): void; set(ready: number): void }[];
  fish: (CritterSource<FishHit> & { kill(id: string, ready: number, golden: boolean): void; set(id: string, ready: number, golden: boolean): void; isAlive(id: string): boolean }) | null;
  fruit: FruitSource[];
  /** What a knife swing can hit without a character in reach (the rat, the cabinet, pumpkins). */
  stabbable: ((eye: THREE.Vector3, fwd: THREE.Vector3, reach: number) => THREE.Vector3 | null)[];
  /** Rewards (filled in by the game): created when a piece hands one out. */
  rewards: MapRewards | null;
}

export interface BuildCtx {
  readonly modo: 'jogo' | 'editor';
  readonly b: MapBuilder;
  /** Where the piece's own objects go: the scene, or the piece's group in the editor. */
  scene: THREE.Scene;
  readonly physics: Physics;
  readonly renderer: THREE.WebGLRenderer;
  readonly sfx: MapSfx;
  readonly props: PropBus;
  readonly data: MapData;
  /** The piece's own randomness (Peca.semente). */
  rand: Seeded;
  /** Per-frame update of an animated prop or a gag. */
  animate(f: (dt: number, frame: MapFrame) => void): void;
  /** Seconds since the map was built (gags with cooldowns). */
  readonly clock: { now: number };
  readonly s: Services;
  readonly out: MapOutputs;
  /** Rewards the pieces hand out, created on first use. */
  rewards(): MapRewards;
  /** A model the map uses (an id of MapData.arquivos). */
  loadGltf(file: string): Promise<GLTF>;
  /**
   * A world point of the map's data (MapData.objetos: a collectible, a fish's loop) in the piece's own frame:
   * a posed piece (Peca.pose) builds there, and its pose carries it back. The point itself without a pose.
   */
  local(v: Vec3): Vec3;
}

export type Adapter = (ctx: BuildCtx, p: Peca) => void | Promise<void>;

// --- Reading a piece --------------------------------------------------------------------------------------

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** The piece's position (origin when absent). */
export const at = (p: Peca): Vec3 => p.p ?? [0, 0, 0];
export const vec = (p: Peca) => V(...at(p));
export const yawOf = (p: Peca) => p.yaw ?? 0;
export const scaleOf = (p: Peca, fallback = 1) => p.escala ?? fallback;

type Params = Record<string, unknown>;
/** The piece's params, typed by the adapter (the catalog's schema checked them). */
export const P = <T = Params>(p: Peca) => p.params as T;

/** MapBuilder options from a piece's params (cor, colide, sombra, fisica, oclusor). */
export function pieceOpts(q: { cor?: number; colide?: boolean; sombra?: boolean; fisica?: SurfaceMaterial; oclusor?: OccluderKind }): PieceOpts {
  const o: PieceOpts = {};
  if (q.cor !== undefined) o.tint = q.cor;
  if (q.colide !== undefined) o.collide = q.colide;
  if (q.sombra !== undefined) o.castShadow = q.sombra;
  if (q.fisica !== undefined) o.physics = q.fisica;
  if (q.oclusor !== undefined) o.occluder = q.oclusor;
  return o;
}

export const surface = (s: Superficie | string | undefined, fallback: SurfaceKey): SurfaceKey => (s ?? fallback) as SurfaceKey;

/** A three.js geometry by name (the 'forma' and 'brilho' pieces), with its operations applied in order. */
export function geometryOf(geo: string, args: number[], ops: unknown[]): THREE.BufferGeometry {
  const G: Record<string, new (...a: any[]) => THREE.BufferGeometry> = {
    caixa: THREE.BoxGeometry,
    cilindro: THREE.CylinderGeometry,
    cone: THREE.ConeGeometry,
    esfera: THREE.SphereGeometry,
    icosaedro: THREE.IcosahedronGeometry,
    toro: THREE.TorusGeometry,
    plano: THREE.PlaneGeometry,
    circulo: THREE.CircleGeometry,
  };
  const Ctor = G[geo];
  if (!Ctor) throw new Error(`geometria desconhecida "${geo}"`);
  let g = new Ctor(...args);
  for (const op of ops as [string, ...number[]][]) {
    const [name, ...a] = op;
    if (name === 'translate') g = g.translate(a[0], a[1], a[2]);
    else if (name === 'scale') g = g.scale(a[0], a[1], a[2]);
    else if (name === 'rotateX') g = g.rotateX(a[0]);
    else if (name === 'rotateY') g = g.rotateY(a[0]);
    else if (name === 'rotateZ') g = g.rotateZ(a[0]);
    else throw new Error(`operação de geometria desconhecida "${name}"`);
  }
  return g;
}
