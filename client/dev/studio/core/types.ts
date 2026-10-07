// Sticker studio, the contract between the core (client/dev/studio/core) and the six domain files
// (client/dev/studio/<domain>.ts): a domain default-exports defineDomain('<domain>', [...subjects]); each
// subject builds its scene with the kit (kit.ts) and returns the two shots the core renders, die-cuts and bakes
// (render.ts, dieCut.ts). The domains own their ids (shared/data/figurinhas/dominios.json); the core owns the
// rest. The manual for domain authors is core-api.md (kept next to the plan, not in the repo).
import type * as THREE from 'three';
import type { Kit } from './kit';

export const DOMAINS = ['personagens', 'armas', 'rua', 'jardim', 'vila', 'zumbi'] as const;
export type DomainName = (typeof DOMAINS)[number];

/** A point or direction: a Vector3 or [x, y, z]. */
export type V3 = THREE.Vector3 | readonly [number, number, number];

/** A camera for one of the two pictures. Characters face -Z, so a camera on -Z sees their face. */
export interface Shot {
  /** Camera position (world, meters). */
  pos: V3;
  /** What it looks at; the light rig aims at it too. */
  target: V3;
  /** Vertical field of view in degrees (default 30; the plan uses 24-40). */
  fov?: number;
  /** Camera up (default +Y). A straight-down shot needs another, e.g. [0, 0, -1]. */
  up?: V3;
  /** Clip planes (default 0.01 and 300 m). */
  near?: number;
  far?: number;
  /** Objects hidden in this shot only (e.g. the speech bubble in the mini). */
  hide?: THREE.Object3D[];
  /**
   * Runs right before this shot renders (the card renders first, then the mini): move things for it. Math.random
   * is seeded here too (its own key per shot), so stepping an effect or rolling dice in it repeats; the card's
   * texts are sized after its before().
   */
  before?(): void;
}

/** What a subject's build returns. */
export interface Built {
  /** The album card: rendered at 800 x 600, baked at 400 x 300. */
  card: Shot;
  /** The badge (scoreboard, death card, profile): rendered at 256 x 256, baked at 128 x 128. */
  mini: Shot;
  /** 'editor' (default): the character editor's rig, aimed at each shot. 'viewmodel': the first-person view's light (facada). */
  light?: 'editor' | 'viewmodel';
  /** Rim light intensity (default 0.8); 1.2 lifts a subject whose colors sit close to the page color. */
  rim?: number;
  /**
   * Keep the scene's own lights (props', the effects' flash and boom lights). Off by default: stickers are lit by
   * the rig alone, in daylight, and a prop's light tints its neighbors (unlit glows stay vivid either way).
   */
  propLights?: boolean;
  /**
   * The die-cut may run off the canvas edge (and into the card's 6% margin) without a warning: in both pictures
   * (facada's forearm) or one.
   */
  allowEdge?: boolean | 'card' | 'mini';
}

export interface Subject {
  /** The sticker's id in shared/data/conquistas.json. */
  id: string;
  build(k: Kit): Built | Promise<Built>;
}

export interface Domain {
  name: DomainName;
  subjects: Subject[];
}

/** A domain file's default export: `export default defineDomain('zumbi', [{ id: 'caca-chefes', build(k) {...} }])`. */
export function defineDomain(name: DomainName, subjects: Subject[]): Domain {
  return { name, subjects };
}
