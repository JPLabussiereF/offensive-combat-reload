// The weapons other players see in a character's hands (third person): the same models as the first-person
// view, as the player's upgrades make them — each gun with its sight, magazine and silencer, the knife (or the
// rubber chicken, the lightsaber), the grenade — merged into one mesh each (vertex colors, one shared toon
// material: a draw call per weapon), cached per look and shared by every character.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { KnifeForm } from '@shared/progression';
import { toonGradient } from '../render/materials';
import { gunModelKey, gunParts, knifeModel, type GunLookKey } from '../render/weaponModels';
import { grenadeModel } from '../weapons/grenades';

/**
 * The first-person gun's origin is the receiver; the third-person rifle item's origin is the grip. Every gun has
 * its grip in the same place, so one offset fits them all.
 */
export const RIFLE_FROM_GRIP = new THREE.Vector3(0, 0.035, -0.09);

let material: THREE.MeshToonMaterial | null = null;
function sharedMaterial() {
  material ??= new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient() });
  return material;
}

/** Meshes (with their own colors) as one geometry with a color attribute, in `root`'s space. */
function mergeColored(root: THREE.Object3D): THREE.BufferGeometry {
  root.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshToonMaterial & THREE.MeshBasicMaterial;
    // Glows and see-through parts stay out (they are tiny from third person).
    if (mat.transparent || (mat as THREE.Material).type === 'MeshBasicMaterial') return;
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    const c = mat.color ?? new THREE.Color(0xffffff);
    const colors = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(g);
  });
  return mergeGeometries(parts) ?? new THREE.BufferGeometry();
}

const cache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.Object3D): THREE.BufferGeometry {
  let g = cache.get(key);
  if (!g) {
    g = mergeColored(make());
    cache.set(key, g);
  }
  return g;
}

/** A gun as its upgrades make it, origin at the grip (third-person item space). */
export function heldGun(g: GunLookKey): THREE.Mesh {
  const geo = cached(`gun|${gunModelKey(g)}`, () => {
    const parts = gunParts(g);
    const group = new THREE.Group();
    for (const m of [...parts.meshes, parts.mag]) group.add(m);
    return group;
  });
  const mesh = new THREE.Mesh(geo, sharedMaterial());
  mesh.position.copy(RIFLE_FROM_GRIP);
  mesh.castShadow = true;
  return mesh;
}

/** The knife in its form: blade out of the thumb side of the fist (hand socket space). */
export function heldKnife(form: KnifeForm): THREE.Mesh {
  const mesh = new THREE.Mesh(
    cached(`knife|${form}`, () => knifeModel(form)),
    sharedMaterial(),
  );
  mesh.castShadow = true;
  return mesh;
}

/** A grenade held in the palm (hand socket space). */
export function heldGrenade(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    cached('grenade', () => {
      const g = grenadeModel();
      g.scale.setScalar(0.8);
      return g;
    }),
    sharedMaterial(),
  );
  mesh.castShadow = true;
  return mesh;
}
