import { beforeAll, describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GROUP, groups } from '@shared/constants';
import { createPhysics, WORLD_GROUPS, type Physics, type SurfaceMaterial } from '../world/physics';
import { IMPACT_AFTER, remoteImpact, type ImpactCast } from '../weapons/remoteImpact';

/** Same filter and query as the online shot handler in main.ts. */
const WORLD_ONLY = groups(GROUP.BULLET, GROUP.WORLD);
const HITBOX_GROUPS = groups(GROUP.HITBOX, GROUP.BULLET);

/** A wall 20 cm thick whose front face is at x = 9.9 (it spans y 0..4, z −5..5). */
const WALL_FACE = 9.9;
const EYE = 1.5;

let physics: Physics;
let cast: ImpactCast;

function wall(x: number, material: SurfaceMaterial) {
  const desc = RAPIER.ColliderDesc.cuboid(0.1, 2, 5).setTranslation(x + 0.1, 2, 0).setCollisionGroups(WORLD_GROUPS);
  const col = physics.world.createCollider(desc, physics.staticBody);
  physics.surfaces.set(col.handle, { material, onShot: () => {} });
}

/** A player's hitbox part (a ball, like a rig part) of radius r centered at x. */
function hitbox(x: number, z: number, r: number) {
  const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, EYE, z));
  physics.world.createCollider(RAPIER.ColliderDesc.ball(r).setCollisionGroups(HITBOX_GROUPS), body);
}

beforeAll(async () => {
  physics = await createPhysics();
  wall(WALL_FACE, 'concrete');
  // A wooden wall further along z, for the material check.
  const wood = RAPIER.ColliderDesc.cuboid(0.1, 2, 2).setTranslation(WALL_FACE + 0.1, 2, 20).setCollisionGroups(WORLD_GROUPS);
  physics.surfaces.set(physics.world.createCollider(wood, physics.staticBody).handle, { material: 'wood' });
  // Players leaning on the concrete wall: a chest (front at x = 9.3, 60 cm from the wall) and an elbow
  // (front at x = 9.84, 6 cm from the wall). The shots end on those fronts.
  hitbox(WALL_FACE - 0.3, -2, 0.3);
  hitbox(WALL_FACE - 0.04, 2, 0.02);
  physics.world.step(); // builds the query pipeline before the first ray
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  cast = (from, dir, max) => {
    ray.origin = from;
    ray.dir = dir;
    const hit = physics.world.castRayAndGetNormal(ray, max, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, WORLD_ONLY);
    if (!hit) return null;
    return { distance: hit.timeOfImpact, normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z), surface: physics.surfaces.get(hit.collider.handle) };
  };
});

/** The end point as it arrives on the wire (rounded to the millimeter). */
const wire = (x: number, y: number, z: number) => new THREE.Vector3(+x.toFixed(3), +y.toFixed(3), +z.toFixed(3));

describe('remote shot impact', () => {
  it('a shot that ended on a wall gives the point, the wall normal and its material', () => {
    const o = new THREE.Vector3(0, EYE, 0.4);
    const impact = remoteImpact(o, wire(WALL_FACE, EYE, 0.1), cast);
    expect(impact).not.toBeNull();
    expect(impact!.point.distanceTo(new THREE.Vector3(WALL_FACE, EYE, 0.1))).toBeLessThan(0.002);
    expect(impact!.normal.x).toBeCloseTo(-1, 3);
    expect(impact!.surface?.material).toBe('concrete');
  });

  it('a slanted shot still lands on the wall face, and a wooden wall reports wood', () => {
    const o = new THREE.Vector3(2, 3.2, 14);
    const end = new THREE.Vector3(WALL_FACE, 1.1, 19.5);
    const impact = remoteImpact(o, wire(end.x, end.y, end.z), cast);
    expect(impact).not.toBeNull();
    expect(impact!.point.x).toBeCloseTo(WALL_FACE, 2);
    expect(impact!.point.distanceTo(end)).toBeLessThan(0.003);
    expect(impact!.surface?.material).toBe('wood');
  });

  it('a shot into the sky gives nothing', () => {
    const o = new THREE.Vector3(0, EYE, 0);
    const dir = new THREE.Vector3(0.3, 1, 0.2).normalize();
    expect(remoteImpact(o, o.clone().addScaledVector(dir, 120), cast)).toBeNull();
  });

  it('a shot that ended on a player more than 5 cm from the wall does not mark the wall', () => {
    // The chest is inside the ray window: it gives nothing because the ray only sees the map.
    expect(remoteImpact(new THREE.Vector3(0, EYE, -2), wire(WALL_FACE - 0.6, EYE, -2), cast)).toBeNull();
    // The elbow 6 cm from the wall: the ray stops 1 cm short of it.
    expect(remoteImpact(new THREE.Vector3(0, EYE, 2), wire(WALL_FACE - 0.06, EYE, 2), cast)).toBeNull();
  });

  it('a shot that ended within 5 cm of the wall still marks it', () => {
    expect(remoteImpact(new THREE.Vector3(0, EYE, 0), wire(WALL_FACE - IMPACT_AFTER + 0.01, EYE, 0), cast)?.surface?.material).toBe('concrete');
  });

  it('a shot with no length gives nothing', () => {
    const p = new THREE.Vector3(WALL_FACE, EYE, 0);
    expect(remoteImpact(p, p.clone(), cast)).toBeNull();
  });
});
