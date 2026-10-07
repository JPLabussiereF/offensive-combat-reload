// What a piece builds through, when the loader needs to see or carry what it makes: a piece with a pose
// (Peca.pose, P32) and every piece in the editor (to take it away again).
//
// A posed piece builds in its own frame, as if it had no pose: its objects go into a group the pose carries,
// its collections (pumpkins, lamp posts, lanterns...) are its own and finish into that group, and everything
// it hands the map's shared systems crosses the frame here: the light spots and particles it adds, the sounds
// it plays, the players' feet and ears its gags watch, who shot it, and what it gives the game (collectibles,
// the potion, the dog, what a shot or a knife hits), the holes its ponds cut in the ground and its paper
// lanterns' light (P42: the map-wide lists stay in the world). The static geometry (MapBuilder.pose), the
// colliders, the rooms and the walls' holes are carried by the loader (client/world/pose.ts).
import * as THREE from 'three';
import type { Vec3 } from '@shared/mapData';
import type { LightPool, LightSpot } from '../halloween';
import type { PropBus, PropTrigger } from '../props';
import type { MapFrame, MapSfx } from '../gameMap';
import type { ChowChow } from '../dog';
import { PoseMap } from '../pose';
import type { Rect } from '../oriental';
import { Collections, type LanternSource, type Services } from './services';
import type { BuildCtx, CritterSource, FruitSource, MapOutputs } from './types';

/** What a piece added to the map's shared lists: the editor takes it away when the piece is rebuilt. */
export interface PieceTrace {
  updates: ((dt: number, frame: MapFrame) => void)[];
  lights: LightSpot[];
  /** Its paper lanterns, in the map's list of lantern sources. */
  lanterns?: LanternSource;
}

/** A rectangle on the ground (a pond's hole) carried by a pose: the box around its four corners. */
export function worldRect(map: PoseMap, r: Rect): Rect {
  const xs: number[] = [];
  const zs: number[] = [];
  for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) {
    const w = map.toWorld({ x, y: 0, z });
    xs.push(w.x);
    zs.push(w.z);
  }
  return { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) };
}

export interface PieceView {
  ctx: BuildCtx;
  /** The piece's own collections (finished into its group). */
  collections: Collections;
  trace: PieceTrace;
  /** After the piece and its collections are built: what it gave the game, carried into the world. */
  settle(): void;
}

type V = { x: number; y: number; z: number };

/**
 * The context one piece builds with: `root` is where its objects and collections go (a group the pose
 * carries, or its editor group), `m` its pose (null: none, only traced).
 */
export function pieceView(base: BuildCtx, root: THREE.Object3D, m: THREE.Matrix4 | null): PieceView {
  const map = m ? new PoseMap(m) : null;
  const trace: PieceTrace = { updates: [], lights: [] };
  const W = (v: V) => (map ? map.toWorld(v) : new THREE.Vector3(v.x, v.y, v.z));
  const L = (v: V) => (map ? map.toLocal(v) : new THREE.Vector3(v.x, v.y, v.z));
  const Ld = (v: V) => (map ? map.dirToLocal(v) : new THREE.Vector3(v.x, v.y, v.z));
  /** The world height of a floor at `y` under a local point (particles stop on it). */
  const floorW = (at: V, y: number) => (map ? map.toWorld({ x: at.x, y, z: at.z }).y : y);

  // Per-frame updates see the players in the piece's frame; a throw goes back out to the world.
  const feet = new THREE.Vector3();
  const listener = new THREE.Vector3();
  const animate = (f: (dt: number, frame: MapFrame) => void) => {
    const g = map
      ? (dt: number, frame: MapFrame) =>
          f(dt, {
            feet: map.toLocal(frame.feet, feet),
            listener: map.toLocal(frame.listener, listener),
            launch: (vx, vy, vz) => {
              const v = map.dirToWorld({ x: vx, y: vy, z: vz });
              frame.launch(v.x, v.y, v.z);
            },
            get time() {
              return frame.time;
            },
          })
      : f;
    trace.updates.push(g);
    base.animate(g);
  };

  const sfx: MapSfx = map ? Object.create(base.sfx, { at: { value: (pos: V, kind: never, play: never) => base.sfx.at(W(pos), kind, play) } }) : base.sfx;
  const props: PropBus = map
    ? Object.create(base.props, {
        register: {
          value: (id: string, fn: (t: PropTrigger) => void) => base.props.register(id, (t) => fn({ local: t.local, from: t.from ? L(t.from) : null })),
        },
      })
    : base.props;

  // The shared systems: light spots and particles cross the frame (and the editor keeps the spots to remove).
  const s = base.s;
  const lights = {
    add: (...spots: LightSpot[]) => {
      const placed = map ? spots.map((sp) => ({ ...sp, at: W(sp.at) })) : spots;
      trace.lights.push(...placed);
      s.lights.add(...placed);
    },
  } as unknown as LightPool;
  const R = (vx: number, vy: number, vz: number) => (map ? map.dirToWorld({ x: vx, y: vy, z: vz }) : new THREE.Vector3(vx, vy, vz));
  const puffs = {
    emit: (at: V, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, color: THREE.ColorRepresentation) => {
      const v = R(vx, vy, vz);
      s.puffs.emit(W(at), v.x, v.y, v.z, life, s0, s1, color);
    },
  };
  const debris = {
    burst: (at: V, color: THREE.ColorRepresentation, n: number, speed: number, size: number, floor: number) => s.debris.burst(W(at), color, n, speed, size, floorW(at, floor)),
  };
  const drops = {
    get mesh() {
      return s.drops.mesh;
    },
    spawn: (at: V, up: number, spread: number, floor = 0.1) => s.drops.spawn(W(at), up, spread, floorW(at, floor)),
    emit: (at: V, vx: number, vy: number, vz: number, floor = 0.1) => {
      const v = R(vx, vy, vz);
      s.drops.emit(W(at), v.x, v.y, v.z, floorW(at, floor));
    },
  };
  // The holes a pond cuts in the ground go to the map's list in the world (P42): a posed rectangle becomes the
  // box around it, the ground's cut covering the whole pond.
  const holes = {
    push: (...rects: Rect[]) => s.holes.push(...rects.map((r) => (map ? worldRect(map, r) : r))),
  } as unknown as Rect[];
  const services: Services = Object.create(s, {
    lights: { get: () => lights },
    puffs: { get: () => (map ? puffs : s.puffs) },
    debris: { get: () => (map ? debris : s.debris) },
    drops: { get: () => (map ? drops : s.drops) },
    water: { get: () => s.water },
    holes: { get: () => (map ? holes : s.holes) },
    c: { value: null, writable: true },
  });

  const out = base.out;
  const ctx: BuildCtx = Object.create(base, {
    scene: { value: root as THREE.Scene, writable: true },
    sfx: { value: sfx },
    props: { value: props },
    animate: { value: animate },
    s: { value: services },
    rand: { value: base.rand, writable: true },
    local: { value: (v: Vec3): Vec3 => (map ? map.toLocal({ x: v[0], y: v[1], z: v[2] }).toArray() : v) },
  });
  const collections = new Collections({ scene: root as THREE.Scene, b: base.b, props, sfx, out, lightCount: 0, animate }, services);
  services.c = collections;

  const before = { pickups: out.pickups.length, stabbable: out.stabbable.length, fruit: out.fruit.length, potion: out.potion, fish: out.fish, dog: out.dog };
  const settle = () => {
    // The glowing cores light the garden's night (LanternLights reads the map's list), and so do the piece's
    // paper lanterns, wherever its pose takes them (P42).
    for (const p of collections.cores) s.all.cores.push(W(p));
    if (collections.hasLanterns) {
      const source = { lanterns: collections.lanterns, pose: map?.m ?? null };
      s.lanternSources.push(source);
      trace.lanterns = source;
    }
    if (!map) return;
    for (let i = before.pickups; i < out.pickups.length; i++) {
      const inner = out.pickups[i];
      out.pickups[i] = {
        id: inner.id,
        position: W(inner.position),
        get available() {
          return inner.available;
        },
        take: () => inner.take(),
        restore: () => inner.restore(),
      };
    }
    for (let i = before.stabbable; i < out.stabbable.length; i++) {
      const f = out.stabbable[i];
      out.stabbable[i] = (eye, fwd, reach) => {
        const p = f(L(eye), Ld(fwd), reach);
        return p && W(p);
      };
    }
    const critters = <H extends { point: THREE.Vector3 }>(src: CritterSource<H>): CritterSource<H> => ({
      shot: (o, dir, dist) => {
        const h = src.shot(L(o), Ld(dir), dist);
        return h && { ...h, point: W(h.point) };
      },
      stab: (eye, fwd, reach) => {
        const h = src.stab(L(eye), Ld(fwd), reach);
        return h && { ...h, point: W(h.point) };
      },
    });
    for (let i = before.fruit; i < out.fruit.length; i++) {
      const inner = out.fruit[i];
      out.fruit[i] = { ...critters(inner), hit: (k, dir) => inner.hit(k, Ld(dir)) } as FruitSource;
    }
    if (out.potion && out.potion !== before.potion) out.potion = { ...out.potion, at: W(out.potion.at) };
    if (out.fish && out.fish !== before.fish) {
      const inner = out.fish;
      out.fish = { ...critters(inner), kill: (id, ready, golden) => inner.kill(id, ready, golden), set: (id, ready, golden) => inner.set(id, ready, golden), isAlive: (id) => inner.isAlive(id) } as MapOutputs['fish'];
    }
    if (out.dog && out.dog !== before.dog) {
      const dog = out.dog;
      const zone = dog.zone.clone().applyMatrix4(map.m);
      out.dog = Object.create(dog, {
        zone: { get: () => zone },
        contains: { value: (f: THREE.Vector3) => dog.contains(L(f)) },
        bite: { value: (at: THREE.Vector3) => dog.bite(L(at)) },
        update: { value: (dt: number, nearby: THREE.Vector3[]) => dog.update(dt, nearby.map(L)) },
      }) as ChowChow;
    }
  };

  return { ctx, collections, trace, settle };
}
