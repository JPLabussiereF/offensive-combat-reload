// The sculpted props simplified on load with the light object detail (PF-35 L5): a closed list, approved by print
// (bruxa, dragões, leões, panda, flamingo, cachorro, caminhão de sorvete, trailer, roda-gigante). Tuning their
// parameters piece by piece doesn't pay off; meshoptimizer takes them down to what keeps the shape within 0.7%
// of their size (the flamingo: 1,900 → ~570 triangles, as in the plan's test). A prop's static geometry is
// simplified as one mesh per material (MapBuilder.gather), its own meshes (animated parts) one by one. Only what is
// drawn changes: every collider is built from the full geometry before this runs.
//
// Smooth surfaces (welded vertices share their normals) keep them and their seams of color and texture. Faceted
// ones (a normal per face, most of the toon art) are welded by position and color, simplified, and faceted again
// (flat normals, world UVs again where the surface is world-mapped).
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier, type Flags } from 'meshoptimizer';
import { worldUVs } from './mapBuilder';

/** How far a simplified mesh may stray from the full one, as a fraction of its size. */
const ERROR = 0.007;

/**
 * The pieces (kinds of MapData's pecas) simplified with the light detail, and the error each may take: the dog's
 * fur is lumpy noise all over, and under 2% nothing of it goes.
 */
export const SCULPTED_PROPS: ReadonlyMap<string, number> = new Map([
  ...['bruxa', 'dragaoDecorativo', 'fonteDragao', 'leaoPedra', 'panda', 'flamingo', 'caminhaoSorvete', 'trailerCirco', 'rodaGigante'].map((k) => [k, ERROR] as const),
  ['cachorro', 0.02],
]);
/** Meshes this small (triangles) aren't worth it. */
const MIN_TRIANGLES = 48;
const KEPT = new Set(['position', 'normal', 'uv', 'color']);

/** Resolves when the simplifier (WebAssembly) can run. */
export const simplifierReady = (): Promise<void> => MeshoptSimplifier.ready;

export interface SimplifyOptions {
  /** The error allowed, as a fraction of the size (default ERROR). */
  error?: number;
  /** The error is a fraction of this many meters (the whole prop's size); without it, of the mesh's own size. */
  size?: number;
  /** The UVs carry a texture of their own (car paint, a sign): kept as they are. Otherwise faceted surfaces get world UVs again. */
  ownUv?: boolean;
  /** The result needs an index (the static batches' geometry has one). */
  indexed?: boolean;
}

const positionsOf = (g: THREE.BufferGeometry): Float32Array => {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  if (pos.array instanceof Float32Array && pos.itemSize === 3 && !(pos as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return pos.array;
  return Float32Array.from({ length: pos.count * 3 }, (_, i) => pos.getComponent(Math.floor(i / 3), i % 3));
};

/** The triangles meshoptimizer keeps of a welded mesh, or null when it wouldn't drop at least 10% of them. */
function reduce(welded: THREE.BufferGeometry, triangles: number, o: SimplifyOptions): Uint32Array | null {
  const flags: Flags[] = o.size ? ['ErrorAbsolute'] : [];
  const error = o.error ?? ERROR;
  const [kept] = MeshoptSimplifier.simplify(new Uint32Array(welded.index!.array), positionsOf(welded), 3, 0, o.size ? error * o.size : error, flags);
  return kept.length && kept.length < triangles * 3 * 0.9 ? kept : null;
}

/**
 * A lighter version of `src` (see the header), or `src` itself when there's nothing to gain or it has attributes
 * the simplifier can't carry (skinning, morphs, per-instance data, material groups).
 */
export function simplifyGeometry(src: THREE.BufferGeometry, o: SimplifyOptions = {}): THREE.BufferGeometry {
  const corners = src.index ? src.index.count : (src.getAttribute('position')?.count ?? 0);
  if (corners / 3 < MIN_TRIANGLES || !Object.keys(src.attributes).every((k) => KEPT.has(k)) || Object.keys(src.morphAttributes).length || src.groups.length) return src;
  // Smooth: welding with the normals joins most corners.
  const welded = mergeVertices(src, 1e-4);
  if (welded.getAttribute('position').count <= corners * 0.55) {
    const kept = reduce(welded, corners / 3, o);
    if (!kept) return src;
    welded.setIndex(new THREE.BufferAttribute(kept, 1));
    return welded;
  }
  welded.dispose();
  // Faceted: welded by position, color (and its own UVs), faceted again afterwards.
  const hadUv = !!src.getAttribute('uv');
  const bare = src.clone();
  bare.deleteAttribute('normal');
  if (!o.ownUv && hadUv) bare.deleteAttribute('uv');
  const joined = mergeVertices(bare, 1e-4);
  bare.dispose();
  const kept = reduce(joined, corners / 3, o);
  if (!kept) {
    joined.dispose();
    return src;
  }
  joined.setIndex(new THREE.BufferAttribute(kept, 1));
  const out = joined.toNonIndexed();
  joined.dispose();
  out.computeVertexNormals();
  if (!o.ownUv && hadUv) worldUVs(out);
  if (o.indexed) out.setIndex(Array.from({ length: out.getAttribute('position').count }, (_, i) => i));
  return out;
}

/** Shared geometries are simplified once (a map's flamingos share theirs). */
const done = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

/** Simplifies the geometry of every mesh under `root` (not skinned ones, nor points, lines or sprites). */
export function simplifyObject(root: THREE.Object3D, error = ERROR) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (o as THREE.SkinnedMesh).isSkinnedMesh) return;
    let g = done.get(m.geometry);
    if (!g) {
      const ownUv = (Array.isArray(m.material) ? m.material : [m.material]).some((x) => !!(x as THREE.MeshStandardMaterial).map);
      g = simplifyGeometry(m.geometry, { ownUv, error });
      done.set(m.geometry, g);
    }
    m.geometry = g;
  });
}

/** The static geometry of a sculpted prop, gathered by MapBuilder (all of a material at once). */
export const simplifyGathered = (error: number) => (g: THREE.BufferGeometry, o: { material: THREE.Material; size: number }) => simplifyGeometry(g, { error, size: o.size, ownUv: o.material.name === 'MAT_lataria', indexed: true });
