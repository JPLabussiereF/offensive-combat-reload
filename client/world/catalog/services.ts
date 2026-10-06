// The map's shared systems: what many pieces add to and the map finishes once (one glow mesh, one instanced
// mesh for every pumpkin, one pool of real lights...). Each is created the first time a piece asks for it;
// finish() closes them in a fixed order once every piece is built. In the editor every piece gets its own
// collections (finished into its group with it), while the particles and the light pool stay shared.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonGradient } from '../../render/materials';
import { Debris, Glow, LampPosts, LightPool, Puffs, Pumpkins, Scarecrows } from '../halloween';
import { Lanterns, type Rect } from '../oriental';
import { WaterDrops } from '../hydrant';
import { StallFruit } from '../jardim/frutas';
import type { Market } from '../jardim/lanternas';
import type { MapBuilder } from '../mapBuilder';
import type { PropBus } from '../props';
import type { MapFrame, MapSfx } from '../gameMap';
import type { MapOutputs } from './types';

export interface ServiceHost {
  readonly scene: THREE.Scene;
  readonly b: MapBuilder;
  readonly props: PropBus;
  readonly sfx: MapSfx;
  readonly out: MapOutputs;
  /** How many real lights the pool turns on (MapData.servicos.luzes). */
  readonly lightCount: number;
  animate(f: (dt: number, frame: MapFrame) => void): void;
}

/** Collections a piece adds to and that are finished into one target (the scene, or the piece's group). */
export class Collections {
  private _glow?: Glow;
  private _gardenGlow?: THREE.BufferGeometry[];
  private _lamps?: LampPosts;
  private _pumpkins?: Pumpkins;
  private _scarecrows?: Scarecrows;
  private _lanterns?: Lanterns;
  private _streetLamps?: THREE.BufferGeometry[];
  private _market?: Market;
  /** Centers of the garden glow's cores (stone lanterns, crypt lamps): the night's fixed lights. */
  cores: THREE.Vector3[] = [];

  constructor(private readonly host: ServiceHost, private readonly shared: Services) {}

  /** Unlit glowing pieces of the haunted maps (candles, windows, faces): one mesh. */
  get glow() {
    return (this._glow ??= new Glow());
  }
  /** Glowing cores of the garden (stone lanterns, lamps): one mesh, and their lights. */
  get gardenGlow() {
    return (this._gardenGlow ??= []);
  }
  get lamps() {
    return (this._lamps ??= new LampPosts());
  }
  get pumpkins() {
    return (this._pumpkins ??= new Pumpkins());
  }
  get scarecrows() {
    return (this._scarecrows ??= new Scarecrows());
  }
  /** The garden's paper lanterns. */
  get lanterns() {
    return (this._lanterns ??= new Lanterns());
  }
  /** The street's lamp heads: one glowing mesh. */
  get streetLamps() {
    return (this._streetLamps ??= []);
  }
  /** The garden market's fruit on its stalls' counters: cut in half when hit (one StallFruit). */
  get market() {
    return (this._market ??= { fruit: [], counters: [] });
  }
  get hasLanterns() {
    return !!this._lanterns;
  }

  /** Closes every collection into `target` (the maps' original order: lamps, pumpkins, scarecrows, the market, lanterns, glow). */
  finish(target: THREE.Object3D) {
    const { host } = this;
    const scene = target as THREE.Scene;
    const sfx = host.sfx;
    if (this._streetLamps?.length) {
      target.add(new THREE.Mesh(mergeGeometries(this._streetLamps, false)!, new THREE.MeshBasicMaterial({ color: 0xfff1b8 })));
      this._streetLamps.forEach((g) => g.dispose());
    }
    if (this._lamps) {
      const lamps = this._lamps;
      lamps.finish(scene, host.b, host.props, (at) => sfx.at(at, 'normal', (s) => s.bulbPop()));
      this.shared.lights.add(...lamps.lights());
      host.animate((dt) => lamps.update(dt));
    }
    if (this._pumpkins) {
      const pumpkins = this._pumpkins;
      pumpkins.finish(scene, host.b, host.props, this.shared.debris, (at) => sfx.at(at, 'normal', (s) => s.pumpkinSmash()));
      host.out.stabbable.push((eye, fwd, reach) => pumpkins.stab(eye, fwd, reach));
      host.animate((dt) => pumpkins.update(dt));
    }
    if (this._scarecrows) {
      const scarecrows = this._scarecrows;
      scarecrows.finish(scene, host.b, host.props, (at) => sfx.at(at, 'normal', (s) => s.strawThud()));
      host.animate((dt) => scarecrows.update(dt));
    }
    if (this._market?.fruit.length) {
      const fruit = new StallFruit(scene, this._market.fruit, this._market.counters, host.props, (at) => sfx.at(at, 'normal', (s) => s.fruitSplat()));
      host.animate((dt) => fruit.update(dt));
      host.out.fruit.push(fruit);
    }
    if (this._gardenGlow?.length) {
      // The glowing cores' centers (a lamp is two boxes): lights for the night.
      for (const g of this._gardenGlow) {
        g.computeBoundingBox();
        const p = g.boundingBox!.getCenter(new THREE.Vector3());
        if (!this.cores.some((q) => q.distanceTo(p) < 0.2)) this.cores.push(p);
      }
      target.add(new THREE.Mesh(mergeGeometries(this._gardenGlow, false)!, new THREE.MeshBasicMaterial({ color: 0xffe6a0 })));
      this._gardenGlow.forEach((g) => g.dispose());
    }
    if (this._lanterns) {
      const lanterns = this._lanterns;
      lanterns.finish(scene, host.b, host.props, (at) => sfx.at(at, 'normal', (s) => s.lanternTap()));
      host.animate((dt) => lanterns.update(dt));
    }
    this._glow?.finish(scene);
  }
}

/** Systems the whole map shares (particles, real lights, the garden's water). */
export class Services {
  private _lights?: LightPool;
  private _puffs?: Puffs;
  private _debris?: Debris;
  private _drops?: WaterDrops;
  private _water?: THREE.Material;
  /** Holes the garden's sectors cut in the ground (ponds, the lake, the stream). */
  readonly holes: Rect[] = [];
  /** The map-wide collections (the editor gives each piece its own: see `c`). */
  readonly all: Collections;
  /** The collections the piece being built adds to. */
  c: Collections;

  constructor(private readonly host: ServiceHost) {
    this.all = new Collections(host, this);
    this.c = this.all;
  }

  /** Real lights: the nearest light spots (candles, lamps, the fire) light the scene for real. */
  get lights() {
    if (!this._lights) {
      const lights = (this._lights = new LightPool(this.host.scene, this.host.lightCount));
      this.host.animate((dt, { listener }) => lights.update(dt, listener));
    }
    return this._lights;
  }
  /** Soft rising puffs (flames, steam, the ghost's poof). */
  get puffs() {
    if (!this._puffs) {
      const puffs = (this._puffs = new Puffs(this.host.scene));
      this.host.animate((dt) => puffs.update(dt));
    }
    return this._puffs;
  }
  /** Chunks of smashed props. */
  get debris() {
    if (!this._debris) {
      const debris = (this._debris = new Debris(this.host.scene));
      this.host.animate((dt) => debris.update(dt));
    }
    return this._debris;
  }
  /** Water droplets (hydrants, the fountains). */
  get drops() {
    if (!this._drops) {
      const drops = (this._drops = new WaterDrops(this.host.scene));
      this.host.animate((dt) => drops.update(dt));
    }
    return this._drops;
  }
  /** The garden's water (no depth writes: the koi are drawn after it and stay visible under it). */
  get water() {
    return (this._water ??= new THREE.MeshToonMaterial({ color: 0x3fa49c, transparent: true, opacity: 0.72, gradientMap: toonGradient(), depthWrite: false }));
  }
}
