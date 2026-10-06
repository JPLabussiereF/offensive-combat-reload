// Where another player's shot hit the map, for its mark, sparks, dust and impact sound on our screen.
// The `shot` message only carries the muzzle and the end point (the impact point when the bullet hit
// something), so we cast a short ray around that end against the map alone: from 25 cm before it to 5 cm
// past it. That short window keeps the wall behind a player who was hit from getting a mark.
import * as THREE from 'three';
import type { SurfaceInfo } from '../world/physics';

/** How far before the end point the ray starts (the end is rounded to the millimeter on the wire). */
export const IMPACT_BEFORE = 0.25;
/** How far past the end point the ray still looks for the map. */
export const IMPACT_AFTER = 0.05;

/** A ray cast against the map only (WORLD_ONLY: no players, no hitboxes): the first hit within `max`, or null. */
export type ImpactCast = (from: THREE.Vector3, dir: THREE.Vector3, max: number) => { distance: number; normal: THREE.Vector3; surface?: SurfaceInfo } | null;

export interface RemoteImpact {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  /** The material and gag of what was hit, if it was registered (the mark shows either way). */
  surface?: SurfaceInfo;
}

/** The map surface a remote shot from `o` that ended at `e` hit, or null (sky, a player in the open). */
export function remoteImpact(o: THREE.Vector3, e: THREE.Vector3, cast: ImpactCast): RemoteImpact | null {
  const dir = e.clone().sub(o);
  if (dir.lengthSq() < 1e-8) return null;
  dir.normalize();
  const from = e.clone().addScaledVector(dir, -IMPACT_BEFORE);
  const hit = cast(from, dir, IMPACT_BEFORE + IMPACT_AFTER);
  if (!hit) return null;
  return { point: from.addScaledVector(dir, hit.distance), normal: hit.normal, surface: hit.surface };
}
