// Spatial sound math, kept free of Web Audio and physics so it can be tested: how loud and how muffled a sound
// is from where the listener stands (distance, air, walls in between), and how enclosed a spot is (room echo).
import type { OccluderKind, SurfaceMaterial } from '../world/physics';

export interface Vec {
  x: number;
  y: number;
  z: number;
}

/** How a kind of sound carries: inverse-distance rolloff from `ref` meters, inaudible past `max`. */
export interface SpatialKind {
  ref: number;
  rolloff: number;
  max: number;
  /** Echo send in an enclosed spot (room) and in the open (short open-air tail, only loud sounds). */
  room: number;
  open: number;
  /** Dropped first when too many sounds play at once (0 lowest). */
  priority: number;
}

export const SPATIAL_KINDS = {
  /** Gunshots: heard across the map. */
  gun: { ref: 6, rolloff: 0.9, max: 220, room: 0.45, open: 0.16, priority: 3 },
  /** Explosions. */
  boom: { ref: 9, rolloff: 0.7, max: 260, room: 0.5, open: 0.225, priority: 3 },
  /** Footsteps and other quiet body sounds: a few rooms away at most. */
  step: { ref: 2.5, rolloff: 1.3, max: 34, room: 0.3, open: 0, priority: 1 },
  /** Reloads, knives, impacts, grenade bounces. */
  normal: { ref: 2.5, rolloff: 1.2, max: 70, room: 0.35, open: 0, priority: 2 },
  /** Loud props: gong, dragon roar, ice cream truck. */
  loud: { ref: 6, rolloff: 1, max: 140, room: 0.4, open: 0.1, priority: 2 },
  /** Birds in the sky: soft, far, no echo. */
  ambient: { ref: 18, rolloff: 1, max: 400, room: 0, open: 0, priority: 0 },
} satisfies Record<string, SpatialKind>;

export type SpatialKindName = keyof typeof SPATIAL_KINDS;

/** Web Audio's "inverse" distance model, used to scale the echo sends like the direct sound. */
export function distanceGain(d: number, k: SpatialKind): number {
  return k.ref / (k.ref + k.rolloff * (Math.max(d, k.ref) - k.ref));
}

/** How much each material in the way blocks a sound (1 = a solid wall). */
export const OCCLUSION_WEIGHT: Record<SurfaceMaterial, number> = {
  concrete: 1,
  tile: 1,
  metal: 1,
  grass: 1,
  wood: 0.7,
  glass: 0.35,
  paper: 0.25,
};

/** Cars and tree trunks collide as solid blocks, but sound wraps around them: they block much less than a wall. */
export const OCCLUDER_KIND_WEIGHT: Record<OccluderKind, number> = {
  solid: 1,
  vehicle: 0.4,
  trunk: 0.4,
};

/** Thickness (m) from which an obstacle blocks with its full weight; a thinner one (a fence) blocks less. */
export const FULL_THICKNESS = 0.3;

/**
 * How much one obstacle blocks a sound: its material, how much of it the sound goes through (`thickness`, null
 * when unknown: counted as full) and what kind of thing it is.
 */
export function occluderWeight(material: SurfaceMaterial, thickness: number | null, kind: OccluderKind = 'solid'): number {
  const through = thickness === null ? 1 : Math.min(1, Math.max(0, thickness) / FULL_THICKNESS);
  return OCCLUSION_WEIGHT[material] * through * OCCLUDER_KIND_WEIGHT[kind];
}

/** A ray hit against the static world: which collider and how far along the ray. */
export interface OcclusionHit {
  handle: number;
  toi: number;
}

/** How far before the sound the return ray starts (it must not start inside the sound's own surface). */
export const BACK_OFFSET = 0.25;

/**
 * Occlusion along a straight path of `len` meters, from two rays: `a` cast from the ears toward the sound and
 * `b` cast back from `BACK_OFFSET` before the sound toward the ears. The same collider both ways is one
 * obstacle, whose entry and exit give its thickness; two different ones are two obstacles (thickness unknown).
 */
export function pathOcclusion(len: number, a: OcclusionHit | null, b: OcclusionHit | null, weight: (handle: number, thickness: number | null) => number): number {
  if (!a) return 0;
  if (!b) return weight(a.handle, null);
  if (b.handle === a.handle) return weight(a.handle, Math.max(0, len - BACK_OFFSET - b.toi - a.toi));
  return weight(a.handle, null) + weight(b.handle, null);
}

/**
 * Gain and low-pass cutoff of a sound `d` meters away behind `occlusion` worth of walls (0 = line of sight,
 * 1 = one wall, 2 = two or a thick one). Air dulls far sounds; a wall muffles and lowers them, but never
 * silences them: you still hear the fight in the next room.
 */
export function voiceParams(d: number, occlusion: number): { gain: number; cutoff: number } {
  const air = Math.max(2500, 20000 * Math.exp(-d / 70));
  if (occlusion <= 0.01) return { gain: 1, cutoff: air };
  const occ = Math.min(occlusion, 2);
  return {
    gain: Math.max(0.2, 1 - 0.42 * occ),
    cutoff: Math.min(air, Math.max(450, 1700 / occ)),
  };
}

/**
 * Inside, sound is a little muffled: a low-pass from 20 kHz in the open (`enc` 0) down to 6 kHz in a closed
 * room (`enc` 1), in proportion to how enclosed the spot is.
 */
export function enclosureCutoff(enc: number): number {
  return 20000 - 14000 * Math.min(1, Math.max(0, enc));
}

/** Echo sends of a sound `d` meters away from a spot `enc` enclosed: room reverb inside, open-air tail outside. */
export function echoSends(kind: SpatialKindName, enc: number, d: number): { room: number; open: number } {
  const k: SpatialKind = SPATIAL_KINDS[kind];
  const far = Math.sqrt(distanceGain(d, k));
  return { room: k.room * enc * far * 0.7, open: k.open * (1 - enc) * far };
}

/** Echo sends of the player's own sounds, from how enclosed the spot they stand in is. */
export function selfSends(enc: number): { room: number; open: number } {
  return { room: 0.22 * enc, open: 0.05 * (1 - enc) };
}

/** A ray cast against the static world: distance to the first hit within `max`, or null. */
export type CastFn = (origin: Vec, dir: Vec, max: number) => number | null;

const H = Math.SQRT1_2;
const AROUND: Vec[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
  { x: H, y: 0, z: H },
  { x: -H, y: 0, z: -H },
];

/** A hand-placed box (b.room in map code, ROOM_ boxes in glTF maps) and how enclosed it is: 1 a room, less a porch. */
export interface RoomVolume {
  min: Vec;
  max: Vec;
  enclosure: number;
}

/** The map's marked rooms: a point inside takes the most enclosed volume containing it. */
export class RoomVolumes {
  constructor(private readonly rooms: readonly RoomVolume[]) {}

  /** How enclosed `p` is from the marked volumes, or null outside all of them. */
  at(p: Vec): number | null {
    let best: number | null = null;
    for (const r of this.rooms) {
      if (p.x < r.min.x || p.x > r.max.x || p.y < r.min.y || p.y > r.max.y || p.z < r.min.z || p.z > r.max.z) continue;
      if (best === null || r.enclosure > best) best = r.enclosure;
    }
    return best;
  }
}

/** A roof counts only this close overhead (a high eave or a tree far above is not a ceiling). */
const ROOF_MAX = 8;
/** ... and only with walls in at least this many of the 6 directions around. */
const ROOF_WALLS = 3;

/** A hit at distance 0 means the ray started inside a collider (a wall or prop at the spot): not a wall around. */
const valid = (hit: number | null) => (hit !== null && hit > 1e-3 ? hit : null);

/**
 * How enclosed a spot is, 0 (open field) to 1 (small room). Marked rooms (RoomVolumes) decide first; elsewhere
 * it is measured with rays: a roof overhead counts most (only a close one, with walls around), walls around add
 * the rest; closer walls make it more enclosed. Measured at the first point seen in each 2 m cell and cached
 * since the map doesn't move.
 */
export class Enclosure {
  private cache = new Map<string, number>();
  private rooms: RoomVolumes;

  constructor(
    private cast: CastFn,
    rooms: readonly RoomVolume[] = [],
  ) {
    this.rooms = new RoomVolumes(rooms);
  }

  at(p: Vec): number {
    const marked = this.rooms.at(p);
    if (marked !== null) return marked;
    const key = `${Math.floor(p.x / 2)},${Math.floor(p.y / 2)},${Math.floor(p.z / 2)}`;
    let v = this.cache.get(key);
    if (v === undefined) {
      v = this.measure({ x: p.x, y: p.y + 0.5, z: p.z });
      if (this.cache.size > 4000) this.cache.clear();
      this.cache.set(key, v);
    }
    return v;
  }

  clear() {
    this.cache.clear();
  }

  private measure(o: Vec): number {
    let walls = 0;
    let sides = 0;
    for (const d of AROUND) {
      const hit = valid(this.cast(o, d, 12));
      if (hit === null) continue;
      sides++;
      walls += hit < 5 ? 1 : 0.6;
    }
    const roof = sides >= ROOF_WALLS ? valid(this.cast(o, { x: 0, y: 1, z: 0 }, ROOF_MAX)) : null;
    const roofK = roof === null ? 0 : roof < 5 ? 1 : 0.6;
    return Math.min(1, roofK * 0.6 + (walls / AROUND.length) * 0.4);
  }
}

/** Footstep, jump/landing, slide and reload sounds of someone else, from what their body is doing. */
export interface Walker {
  feet: Vec;
  alive: boolean;
  grounded: boolean;
  sprint: boolean;
  crouch: boolean;
  slide: boolean;
  reload: boolean;
}

export type BodySound = { kind: 'step'; loud: number } | { kind: 'land'; hard: boolean } | { kind: 'slide' } | { kind: 'reload' };

interface WalkState {
  x: number;
  z: number;
  speed: number;
  stride: number;
  air: number;
  grounded: boolean;
  slide: boolean;
  reload: boolean;
}

/** Same stride rules as the local player (entities/localPlayer.ts): crouch-walking is silent. */
export class BodySounds {
  private state = new Map<number, WalkState>();

  update(id: number, w: Walker, dt: number): BodySound[] {
    const out: BodySound[] = [];
    let s = this.state.get(id);
    if (!w.alive || dt <= 0) {
      if (!w.alive) this.state.delete(id);
      return out;
    }
    if (!s) {
      s = { x: w.feet.x, z: w.feet.z, speed: 0, stride: 0, air: 0, grounded: w.grounded, slide: w.slide, reload: w.reload };
      this.state.set(id, s);
      return out;
    }
    const moved = Math.hypot(w.feet.x - s.x, w.feet.z - s.z);
    s.x = w.feet.x;
    s.z = w.feet.z;
    // A teleport (respawn) is not a step.
    if (moved > 4) {
      s.stride = 0;
      s.speed = 0;
      return out;
    }
    s.speed = s.speed * 0.7 + (moved / dt) * 0.3;
    if (w.grounded && !s.grounded && s.air > 0.35) out.push({ kind: 'land', hard: s.air > 0.9 });
    s.air = w.grounded ? 0 : s.air + dt;
    s.grounded = w.grounded;
    if (w.slide && !s.slide) out.push({ kind: 'slide' });
    s.slide = w.slide;
    if (w.reload && !s.reload) out.push({ kind: 'reload' });
    s.reload = w.reload;
    if (w.grounded && !w.slide && s.speed > 1) {
      s.stride += moved;
      if (s.stride >= (w.sprint ? 2.6 : 2.0)) {
        s.stride = 0;
        if (!w.crouch) out.push({ kind: 'step', loud: w.sprint ? 1.3 : 0.8 });
      }
    }
    return out;
  }

  forget(id: number) {
    this.state.delete(id);
  }
}

/** What the map and its props need to play a sound from a point (implemented by audio/sfx.ts). */
export interface SpatialSfx {
  at(pos: Vec, kind: SpatialKindName, play: (s: this) => void): void;
}

/** A spot in the sky around the listener, for birds: above, 20-35 m out in a random direction. */
export function skySpot(listener: Vec): Vec {
  const a = Math.random() * Math.PI * 2;
  const r = 20 + Math.random() * 15;
  return { x: listener.x + Math.cos(a) * r, y: listener.y + 10 + Math.random() * 12, z: listener.z + Math.sin(a) * r };
}
