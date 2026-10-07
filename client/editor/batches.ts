// The editor's batches (PF-6 Revisions 01, P46). The editor builds every piece in its own group (to select it
// and rebuild it alone: client/world/mapLoader.ts), which drew each piece's meshes apart: 1,700 to 2,700 draw
// calls in the Jardim against 310 in the game. Here the meshes of the pieces that are neither selected nor being
// edited are drawn from three.js BatchedMeshes, one per material and vertex layout (a draw call each, culled
// object by object), while their own meshes move to a layer no camera draws (they stay in the scene: the
// selection's ray still hits them, boxes still measure them). A piece selected comes out of its batch (its own
// meshes are drawn again and its copies hidden); deselected, it goes back.
//
// What a batch can't copy stays as it was: lines, points, sprites, meshes with several materials, custom
// shaders, skinned or morphing meshes, mirrored ones and the editor's own stand-ins. What moves, turns, hides or
// changes its vertices after it's built (lanterns that sway, a koi, a collection's instances) is followed: every
// frame the copies take their mesh's world matrix, visibility, instances and vertices when they changed.
import * as THREE from 'three';

/** The layer a batched piece's own meshes go to: no camera (and no shadow pass) draws it. */
export const HIDDEN_LAYER = 31;

type Drawn = THREE.Mesh | THREE.InstancedMesh;

/** One mesh of a piece copied into a batch. */
interface Source {
  piece: string;
  obj: Drawn;
  /** The piece's group (visibility is checked up to it). */
  top: THREE.Object3D;
  batch: Batch;
  /** Its copies in the batch (one per instance). */
  ids: number[];
  geo: THREE.BufferGeometry;
  /** Its material and what it drew like when batched. */
  mat: THREE.Material;
  matKey: string;
  mask: number;
  matrix: THREE.Matrix4;
  instVersion: number;
  colorVersion: number;
  geoVersion: number;
  count: number;
  visible: boolean;
}

interface Batch {
  key: string;
  material: THREE.Material;
  mesh: THREE.BatchedMesh | null;
  sources: Set<Source>;
  geoms: Map<THREE.BufferGeometry, { id: number; refs: number }>;
  /** Built again from its sources before the next frame. */
  dirty: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  renderOrder: number;
  colors: boolean;
}

const ids = new WeakMap<object, number>();
let nextId = 1;
/** A stable number per object (uuids repeat when tests fix Math.random). */
const idOf = (o: object) => ids.get(o) ?? (ids.set(o, nextId++), nextId - 1);

const SKIP = new Set(['uuid', 'id', 'name', 'version', 'userData', '_listeners', 'type']);

/**
 * What a material draws like: its kind and every setting (colors by value, textures by identity). Pieces make
 * their own materials (each paper lantern its own white, each stone lantern its own glow): materials that draw
 * alike share a batch.
 */
export function materialKey(m: THREE.Material): string {
  const parts: string[] = [m.type];
  const rec = m as unknown as Record<string, unknown>;
  for (const k of Object.keys(rec).sort()) {
    if (SKIP.has(k)) continue;
    const v = rec[k] as { isColor?: boolean; isTexture?: boolean; toArray?: () => number[]; r?: number; g?: number; b?: number } | null | undefined;
    if (v === null || v === undefined || typeof v === 'function') continue;
    if (typeof v !== 'object') parts.push(`${k}=${String(v)}`);
    else if (v.isColor) parts.push(`${k}=${v.r},${v.g},${v.b}`);
    else if (v.isTexture) parts.push(`${k}=#${idOf(v)}`);
    else if (Array.isArray(v)) parts.push(`${k}=${v.length ? `#${idOf(v)}` : '[]'}`);
    else if (typeof v.toArray === 'function') parts.push(`${k}=${v.toArray().join(',')}`);
    else parts.push(`${k}=${JSON.stringify(v)}`);
  }
  return parts.join(';');
}

/** Materials seen changing after they were batched (a flicker, a fade): their meshes are drawn on their own. */
const changing = new WeakSet<THREE.Material>();

/** Whether a mesh can be copied into a batch, and the batch it goes to. */
export function batchKey(o: THREE.Object3D): string | null {
  const m = o as Drawn;
  if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || (m as unknown as THREE.BatchedMesh).isBatchedMesh) return null;
  if (o.userData.ajuda) return null;
  const mat = m.material;
  if (!mat || Array.isArray(mat) || (mat as THREE.ShaderMaterial).isShaderMaterial || changing.has(mat)) return null;
  if (mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile || m.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return null;
  const g = m.geometry;
  if (!g?.getAttribute('position') || Object.keys(g.morphAttributes).length) return null;
  if (m.matrixWorld.determinant() < 0) return null;
  const attrs = Object.keys(g.attributes)
    .sort()
    .map((k) => {
      const a = g.getAttribute(k) as THREE.BufferAttribute;
      if ((a as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return null;
      return `${k}:${a.itemSize}:${a.normalized ? 1 : 0}:${a.array.constructor.name}`;
    });
  if (attrs.includes(null)) return null;
  return `${materialKey(mat)}|${attrs.join(',')}|${g.index ? 'i' : 'n'}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${m.renderOrder}`;
}

const geoVersion = (g: THREE.BufferGeometry) => {
  let v = g.index?.version ?? 0;
  for (const k in g.attributes) v += (g.attributes[k] as THREE.BufferAttribute).version ?? 0;
  return v;
};

/** Whether an object and its parents up to `top` are visible. */
function shown(o: THREE.Object3D, top: THREE.Object3D) {
  for (let x: THREE.Object3D | null = o; x; x = x.parent) {
    if (!x.visible) return false;
    if (x === top) break;
  }
  return !Array.isArray((o as THREE.Mesh).material) && ((o as THREE.Mesh).material as THREE.Material).visible !== false;
}

const tmp = new THREE.Matrix4();
const col = new THREE.Color();

export class EditorBatches {
  readonly root = new THREE.Group();
  private pieces = new Map<string, Source[]>();
  private batches = new Map<string, Batch>();
  /** Pieces drawn by their own meshes (selected or being edited). */
  private out = new Set<string>();

  constructor(parent: THREE.Object3D) {
    this.root.name = 'lotes';
    parent.add(this.root);
  }

  /** A piece built (or built again): its meshes that can be go to the batches. */
  add(id: string, group: THREE.Object3D) {
    this.remove(id);
    group.updateMatrixWorld(true);
    const list: Source[] = [];
    group.traverse((o) => {
      const key = batchKey(o);
      if (!key) return;
      const m = o as Drawn;
      let b = this.batches.get(key);
      if (!b) {
        // Its own copy of the material: the pieces' materials may change later (then they leave the batch).
        b = { key, material: (m.material as THREE.Material).clone(), mesh: null, sources: new Set(), geoms: new Map(), dirty: true, castShadow: m.castShadow, receiveShadow: m.receiveShadow, renderOrder: m.renderOrder, colors: false };
        this.batches.set(key, b);
      }
      const inst = m as THREE.InstancedMesh;
      const src: Source = {
        piece: id,
        obj: m,
        top: group,
        batch: b,
        ids: [],
        geo: m.geometry,
        mat: m.material as THREE.Material,
        matKey: materialKey(m.material as THREE.Material),
        mask: m.layers.mask,
        matrix: m.matrixWorld.clone(),
        instVersion: inst.isInstancedMesh ? inst.instanceMatrix.version : 0,
        colorVersion: inst.instanceColor?.version ?? 0,
        geoVersion: geoVersion(m.geometry),
        count: inst.isInstancedMesh ? inst.count : 1,
        visible: true,
      };
      b.sources.add(src);
      // Into the batch already drawn, while it has room (else it's built again before the next frame).
      if (b.mesh && !b.dirty) {
        b.colors ||= !!inst.instanceColor;
        this.fill(src);
      } else b.dirty = true;
      list.push(src);
    });
    if (list.length) this.pieces.set(id, list);
  }

  /** A piece taken away (to build it again, or deleted): its copies go, its meshes get their layers back. */
  remove(id: string) {
    const list = this.pieces.get(id);
    if (!list) return;
    for (const s of list) {
      s.obj.layers.mask = s.mask;
      s.batch.sources.delete(s);
      this.drop(s);
    }
    this.pieces.delete(id);
  }

  /** The pieces drawn on their own from now on (the selection and what's being edited); the rest is batched. */
  setOut(ids: Iterable<string>) {
    const next = new Set(ids);
    const changed = new Set<string>();
    for (const id of this.out) if (!next.has(id)) changed.add(id);
    for (const id of next) if (!this.out.has(id)) changed.add(id);
    this.out = next;
    for (const id of changed) for (const s of this.pieces.get(id) ?? []) this.place(s);
  }

  /** Whether a piece is drawn from the batches now. */
  batched(id: string) {
    return this.pieces.has(id) && !this.out.has(id);
  }

  /** Per frame, before drawing: builds the batches that changed, and the copies follow their meshes. */
  update() {
    this.watchMaterials();
    for (const b of this.batches.values()) if (b.dirty) this.rebuild(b);
    for (const list of this.pieces.values()) for (const s of list) this.sync(s);
  }

  /** A material that changed since it was batched (it's animated) takes its meshes out of the batches for good. */
  private watchMaterials() {
    const checked = new Map<THREE.Material, boolean>();
    for (const [id, list] of this.pieces) {
      const keep = list.filter((s) => {
        let same = checked.get(s.mat);
        if (same === undefined) {
          same = materialKey(s.mat) === s.matKey;
          checked.set(s.mat, same);
          if (!same) changing.add(s.mat);
        }
        if (same) return true;
        s.obj.layers.mask = s.mask;
        s.batch.sources.delete(s);
        this.drop(s);
        return false;
      });
      if (keep.length !== list.length) {
        if (keep.length) this.pieces.set(id, keep);
        else this.pieces.delete(id);
      }
    }
  }

  /** How many batches there are and how many meshes they draw. */
  stats() {
    let meshes = 0;
    let batches = 0;
    for (const b of this.batches.values()) {
      if (!b.mesh) continue;
      batches++;
      meshes += b.sources.size;
    }
    return { batches, meshes };
  }

  dispose() {
    for (const id of [...this.pieces.keys()]) this.remove(id);
    for (const b of this.batches.values()) {
      b.mesh?.dispose();
      b.material.dispose();
    }
    this.batches.clear();
    this.root.removeFromParent();
  }

  // --- Inside ------------------------------------------------------------------------------------------------

  /** A mesh drawn from its batch or on its own, as its piece is. */
  private place(s: Source) {
    const own = this.out.has(s.piece) || !s.batch.mesh;
    s.obj.layers.mask = own ? s.mask : 1 << HIDDEN_LAYER;
    const mesh = s.batch.mesh;
    if (!mesh) return;
    for (const i of s.ids) mesh.setVisibleAt(i, !own && s.visible);
  }

  /** A mesh's copies taken out of its batch (the geometry goes when no copy uses it). */
  private drop(s: Source) {
    const b = s.batch;
    const mesh = b.mesh;
    if (mesh) {
      for (const i of s.ids) mesh.deleteInstance(i);
      const g = b.geoms.get(s.geo);
      if (g && --g.refs <= 0) {
        mesh.deleteGeometry(g.id);
        b.geoms.delete(s.geo);
      }
    }
    s.ids = [];
    if (!b.sources.size) {
      b.mesh?.removeFromParent();
      b.mesh?.dispose();
      b.mesh = null;
      this.batches.delete(b.key);
    }
  }

  /** A batch made again from its meshes, with room to grow. */
  private rebuild(b: Batch) {
    b.dirty = false;
    b.mesh?.removeFromParent();
    b.mesh?.dispose();
    b.mesh = null;
    b.geoms.clear();
    let vertices = 0;
    let indices = 0;
    let instances = 0;
    const seen = new Set<THREE.BufferGeometry>();
    for (const s of b.sources) {
      instances += s.count;
      b.colors ||= !!(s.obj as THREE.InstancedMesh).instanceColor;
      if (seen.has(s.geo)) continue;
      seen.add(s.geo);
      vertices += s.geo.getAttribute('position').count;
      indices += s.geo.index?.count ?? 0;
    }
    if (!instances || !vertices) {
      for (const s of b.sources) this.place(s);
      return;
    }
    const grow = (n: number) => Math.ceil(n * 1.25) + 64;
    const mesh = new THREE.BatchedMesh(grow(instances), grow(vertices), indices ? grow(indices) : 0, b.material);
    mesh.name = 'lote';
    mesh.castShadow = b.castShadow;
    mesh.receiveShadow = b.receiveShadow;
    mesh.renderOrder = b.renderOrder;
    // Culled copy by copy (the batch spans the map).
    mesh.frustumCulled = false;
    // Picking hits the pieces' own meshes, never the copies.
    mesh.raycast = () => {};
    b.mesh = mesh;
    this.root.add(mesh);
    for (const s of b.sources) {
      s.ids = [];
      this.fill(s);
    }
  }

  /** A mesh's copies put in its batch (rebuilt bigger when it has no room left). */
  private fill(s: Source) {
    const b = s.batch;
    const mesh = b.mesh!;
    try {
      let g = b.geoms.get(s.geo);
      if (!g) {
        g = { id: mesh.addGeometry(s.geo), refs: 0 };
        b.geoms.set(s.geo, g);
      }
      g.refs++;
      for (let k = 0; k < s.count; k++) s.ids.push(mesh.addInstance(g.id));
    } catch {
      b.dirty = true;
      return;
    }
    this.write(s);
    this.place(s);
  }

  /** A mesh's world matrix (and its instances', and their colors) into its copies. */
  private write(s: Source) {
    const mesh = s.batch.mesh;
    if (!mesh) return;
    const inst = s.obj as THREE.InstancedMesh;
    if (inst.isInstancedMesh) {
      s.ids.forEach((id, k) => {
        inst.getMatrixAt(k, tmp);
        mesh.setMatrixAt(id, tmp.premultiply(s.obj.matrixWorld));
        if (inst.instanceColor) {
          inst.getColorAt(k, col);
          mesh.setColorAt(id, col);
        } else if (s.batch.colors) mesh.setColorAt(id, col.setRGB(1, 1, 1));
      });
    } else
      for (const id of s.ids) {
        mesh.setMatrixAt(id, s.obj.matrixWorld);
        if (s.batch.colors) mesh.setColorAt(id, col.setRGB(1, 1, 1));
      }
  }

  /** The copies follow what changed since the last frame. */
  private sync(s: Source) {
    const mesh = s.batch.mesh;
    if (!mesh || !s.ids.length) return;
    const o = s.obj;
    const inst = o as THREE.InstancedMesh;
    if (inst.isInstancedMesh && inst.count !== s.count) {
      // More or fewer instances: its copies are made again.
      s.batch.sources.delete(s);
      this.drop(s);
      s.count = inst.count;
      s.batch.sources.add(s);
      if (!this.batches.has(s.batch.key)) this.batches.set(s.batch.key, s.batch);
      s.batch.dirty = true;
      return;
    }
    const gv = geoVersion(s.geo);
    if (gv !== s.geoVersion) {
      s.geoVersion = gv;
      const g = s.batch.geoms.get(s.geo);
      try {
        if (g) mesh.setGeometryAt(g.id, s.geo);
      } catch {
        s.batch.dirty = true;
        return;
      }
    }
    let moved = !o.matrixWorld.equals(s.matrix);
    if (inst.isInstancedMesh && (inst.instanceMatrix.version !== s.instVersion || (inst.instanceColor?.version ?? 0) !== s.colorVersion)) {
      s.instVersion = inst.instanceMatrix.version;
      s.colorVersion = inst.instanceColor?.version ?? 0;
      moved = true;
    }
    if (moved) {
      s.matrix.copy(o.matrixWorld);
      this.write(s);
    }
    const vis = shown(o, s.top);
    if (vis !== s.visible) {
      s.visible = vis;
      this.place(s);
    }
  }
}

/**
 * What a scene costs to draw with nothing culled (a count for tests): one call per batch, per mesh drawn on its
 * own (one per group of a mesh with several materials), per line, points or sprite; the layer no camera draws
 * is left out.
 */
export function drawCount(root: THREE.Object3D, layers = new THREE.Layers()): number {
  let n = 0;
  const visit = (o: THREE.Object3D) => {
    if (!o.visible) return;
    const m = o as THREE.Mesh;
    if ((m.isMesh || (o as THREE.Line).isLine || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite) && o.layers.test(layers)) {
      const b = o as unknown as THREE.BatchedMesh;
      if (b.isBatchedMesh) n += b.instanceCount > 0 ? 1 : 0;
      else if (Array.isArray(m.material)) n += m.geometry.groups.length || 1;
      else if (!(o as THREE.InstancedMesh).isInstancedMesh || (o as THREE.InstancedMesh).count > 0) n += 1;
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  return n;
}
