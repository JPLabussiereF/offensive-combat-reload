// A pet's body (PF-29): vertex-colored parts (client/render/materials.ts mergeColoredParts, like the Amora of the
// map and the props) on a small skeleton, merged into one skinned mesh with rigid weights (each part follows one
// bone), so a pet is one draw call however it moves. Every pet has two meshes on the same skeleton: the full one
// (at most PET_MAX_TRIS triangles) and a light one for far away (about a third). The collar's ring is tinted with
// the owner's color by rewriting its vertex colors; the props of the gestures (the rope toy, the potion, the
// hammer, the stones) are small meshes of their own on a bone, hidden until a gesture shows them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PetId } from '@shared/pets';
import { mergeColoredParts, toonGradient, type ColoredPart } from '../render/materials';

export type P3 = [number, number, number];

/** The most triangles a pet's full mesh may have (the plan's budget, PF-35). */
export const PET_MAX_TRIS = 2000;
/** From this far (m) the light mesh is drawn. */
export const PET_LIGHT_FROM = 14;

/** A bone of a pet's skeleton: where it is in its parent's space when the pet stands still. */
export interface BoneSpec {
  name: string;
  parent: string | null;
  at: P3;
}

/** What a species builds: its skeleton, the parts on each bone (full and light), the collar's ring and the props. */
export interface PetBuild {
  bones: BoneSpec[];
  parts: Record<string, ColoredPart[]>;
  light: Record<string, ColoredPart[]>;
  /** The ring tinted with the collar's color (the pendant is an ordinary part, always bright). */
  collar: { bone: string; parts: ColoredPart[]; light: ColoredPart[] };
  /** Gesture props, by name: built once, on a bone, hidden. */
  props?: Record<string, { bone: string; object: THREE.Object3D }>;
  /** Standing height (top of the head) and body length, for spots and the overview's framing. */
  height: number;
  length: number;
}

export type PetLook = 'galpao' | 'match';

/**
 * The material: in the Galpão the characters' (flat-shaded standard, rough, lit by the scene's lights); in a match
 * the map's three-tone toon. Each pet has its own (it fades near the camera).
 */
export function petMaterial(look: PetLook): THREE.MeshStandardMaterial | THREE.MeshToonMaterial {
  return look === 'galpao'
    ? new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0 })
    : new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
}

/** The parts of each bone merged into one geometry in the pet's rest space, with rigid skin weights. */
function skinGeometry(byBone: Map<number, ColoredPart[]>, rest: THREE.Matrix4[], collar: { bone: number; parts: ColoredPart[] }) {
  const geos: THREE.BufferGeometry[] = [];
  let ring: [number, number] = [0, 0];
  let offset = 0;
  const add = (bone: number, parts: ColoredPart[], isRing = false) => {
    if (!parts.length) return;
    const g = mergeColoredParts(parts);
    g.applyMatrix4(rest[bone]);
    const n = g.getAttribute('position').count;
    const idx = new Uint16Array(n * 4);
    const w = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      idx[i * 4] = bone;
      w[i * 4] = 1;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w, 4));
    if (isRing) ring = [offset, n];
    offset += n;
    geos.push(g);
  };
  for (const [bone, parts] of byBone) add(bone, parts);
  add(collar.bone, collar.parts, true);
  const merged = mergeGeometries(geos, false)!;
  for (const g of geos) g.dispose();
  return { geo: merged, ring };
}

export const trisOf = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

/** A pet on screen: its skeleton, the full and light meshes, the collar and the props. */
export class PetModel {
  readonly root = new THREE.Group();
  readonly bones = new Map<string, THREE.Bone>();
  /** Each bone's rest pose (the animator starts from it every frame). */
  readonly rest = new Map<THREE.Bone, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }>();
  readonly full: THREE.SkinnedMesh;
  readonly lite: THREE.SkinnedMesh;
  readonly material: THREE.MeshStandardMaterial | THREE.MeshToonMaterial;
  readonly props = new Map<string, THREE.Object3D>();
  readonly height: number;
  readonly length: number;
  private rings: { geo: THREE.BufferGeometry; range: [number, number] }[] = [];
  private light = false;

  constructor(
    readonly id: PetId,
    b: PetBuild,
    look: PetLook,
  ) {
    this.height = b.height;
    this.length = b.length;
    this.material = petMaterial(look);
    const list: THREE.Bone[] = [];
    for (const s of b.bones) {
      const bone = new THREE.Bone();
      bone.name = s.name;
      bone.position.set(...s.at);
      (s.parent ? this.bones.get(s.parent)! : this.root).add(bone);
      this.bones.set(s.name, bone);
      list.push(bone);
    }
    this.root.updateMatrixWorld(true);
    const rest = list.map((bone) => bone.matrixWorld.clone());
    const index = new Map(list.map((bone, i) => [bone.name, i]));
    const skeleton = new THREE.Skeleton(list);
    const make = (parts: Record<string, ColoredPart[]>, ring: ColoredPart[]) => {
      const byBone = new Map<number, ColoredPart[]>();
      for (const [name, ps] of Object.entries(parts)) byBone.set(index.get(name)!, ps);
      const { geo, ring: range } = skinGeometry(byBone, rest, { bone: index.get(b.collar.bone)!, parts: ring });
      const mesh = new THREE.SkinnedMesh(geo, this.material);
      mesh.castShadow = true;
      // Poses reach out of the rest pose's bounds (sitting up, paws on a table): never culled (a pet is small).
      mesh.frustumCulled = false;
      this.root.add(mesh);
      mesh.bind(skeleton);
      this.rings.push({ geo, range });
      return mesh;
    };
    this.full = make(b.parts, b.collar.parts);
    this.lite = make(b.light, b.collar.light);
    this.lite.visible = false;
    for (const s of list) this.rest.set(s, { p: s.position.clone(), q: s.quaternion.clone(), s: s.scale.clone() });
    for (const [name, p] of Object.entries(b.props ?? {})) {
      p.object.visible = false;
      p.object.traverse((o) => {
        if (o instanceof THREE.Mesh) o.castShadow = true;
      });
      this.bones.get(p.bone)!.add(p.object);
      this.props.set(name, p.object);
    }
  }

  bone(name: string): THREE.Bone {
    return this.bones.get(name)!;
  }

  /** Back to the rest pose (the animator poses it from there every frame). */
  resetPose() {
    for (const [b, r] of this.rest) {
      b.position.copy(r.p);
      b.quaternion.copy(r.q);
      b.scale.copy(r.s);
    }
  }

  /** The collar's color (any CSS-like hex). */
  setCollar(color: THREE.ColorRepresentation) {
    const c = new THREE.Color(color);
    for (const r of this.rings) {
      const a = r.geo.getAttribute('color') as THREE.BufferAttribute;
      for (let i = r.range[0]; i < r.range[0] + r.range[1]; i++) a.setXYZ(i, c.r, c.g, c.b);
      a.needsUpdate = true;
    }
  }

  /** The light mesh (far away) instead of the full one. */
  setLight(on: boolean) {
    if (on === this.light) return;
    this.light = on;
    this.full.visible = !on;
    this.lite.visible = on;
  }

  /** Fades the whole pet (near the camera); 1: opaque. */
  setOpacity(a: number) {
    const m = this.material;
    const fade = a < 0.999;
    if (m.transparent !== fade) {
      m.transparent = fade;
      m.depthWrite = !fade;
      m.needsUpdate = true;
    }
    m.opacity = a;
  }

  get triangles() {
    return { full: trisOf(this.full.geometry), light: trisOf(this.lite.geometry) };
  }

  dispose() {
    this.root.removeFromParent();
    this.full.geometry.dispose();
    this.lite.geometry.dispose();
    this.material.dispose();
    for (const p of this.props.values())
      p.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
  }
}
