// What a map costs to draw, without a GPU: draw calls and triangles as three.js would count them in a frame
// (renderer.info, the F3 overlay), for the worst of a set of sample cameras (at every spawn and on a grid over
// the map, looking around), plus the sun's shadow pass. A map over MAP_BUDGET (shared/mapData.ts) can't be
// saved. Only three.js math: it runs in the browser (the editor's live bar) and on the server alike.
import * as THREE from 'three';
import { MAP_BUDGET, type MapData, type Vec3 } from '@shared/mapData';

export interface BudgetSample {
  drawCalls: number;
  triangulos: number;
}

/** A sample camera: where it stands (eye) and where it looks. */
export interface BudgetView {
  onde: Vec3;
  yaw: number;
}

export interface BudgetReport extends BudgetSample {
  /**
   * The worst camera pass (without the shadow): the most draw calls and the most triangles, and where each was
   * seen; and the median sample camera's (half the cameras see more, half see less).
   */
  camera: BudgetSample & { piorChamadas: BudgetView; piorTriangulos: BudgetView; mediana: BudgetSample };
  /** The sun's shadow pass (the same every frame: the sun doesn't move). */
  sombra: BudgetSample;
  /** How many cameras were tried. */
  amostras: number;
  /**
   * Instances at scale zero inside an InstancedMesh's count (a pool's empty slots): sent to the GPU every frame
   * for nothing, whatever the camera (pools aren't culled). Draw calls: the meshes with nothing but those.
   */
  fantasmas: BudgetSample & { instancias: number };
  /** What's over MAP_BUDGET (empty: it fits). */
  excedeu: ('drawCalls' | 'triangulos')[];
}

export interface BudgetOptions {
  /** Spawn points (feet): a camera at eye height on each. */
  spawns: Vec3[];
  /** Where the sun shines from (toward the origin): the default day's when absent. */
  sun?: Vec3;
  /** Half size of the sun's shadow (MapData.ambiente.sombra); default the renderer's 48 x 40 m. */
  shadowExtent?: number;
  /** Grid step (m) of the sample cameras over the map; default about 12 steps across. */
  step?: number;
}

/** The player's camera (client/render/renderer.ts) on a 16:9 screen. */
const FOV = 75;
const ASPECT = 16 / 9;
const NEAR = 0.05;
const FAR = 400;
const EYE = 1.6;
const YAWS = 8;
const DEFAULT_SUN: Vec3 = [-30, 45, 20];

interface Drawable {
  obj: THREE.Object3D;
  calls: number;
  triangles: number;
  /** What its shadow pass draws (a static batch with shadowless parts draws only the start of its index). */
  shadowTriangles: number;
  castShadow: boolean;
  culled: boolean;
  sphere: THREE.Sphere;
}

/** Draw calls and triangles of one drawable (a multi-material mesh draws once per group). */
function costOf(obj: THREE.Object3D): { calls: number; triangles: number } | null {
  const mesh = obj as THREE.Mesh;
  const geo = mesh.geometry as THREE.BufferGeometry | undefined;
  if (!geo || !mesh.material) return null;
  if ((obj as THREE.Points).isPoints || (obj as THREE.Line).isLine || (obj as THREE.Sprite).isSprite) return { calls: 1, triangles: (obj as THREE.Sprite).isSprite ? 2 : 0 };
  if (!mesh.isMesh) return null;
  const instances = (obj as THREE.InstancedMesh).isInstancedMesh ? (obj as THREE.InstancedMesh).count : 1;
  if (instances === 0) return { calls: 0, triangles: 0 };
  const total = geo.index ? geo.index.count : (geo.getAttribute('position')?.count ?? 0);
  if (Array.isArray(mesh.material) && geo.groups.length) {
    let calls = 0;
    let tris = 0;
    for (const g of geo.groups) {
      const m = mesh.material[g.materialIndex ?? 0];
      if (!m || !m.visible) continue;
      calls++;
      tris += Math.min(g.count, total - g.start) / 3;
    }
    return { calls, triangles: tris * instances };
  }
  if (!(mesh.material as THREE.Material).visible) return null;
  return { calls: 1, triangles: (total / 3) * instances };
}

function drawables(scene: THREE.Object3D): Drawable[] {
  scene.updateMatrixWorld(true);
  const out: Drawable[] = [];
  const visit = (o: THREE.Object3D) => {
    if (!o.visible) return;
    const cost = costOf(o);
    if (cost && cost.calls > 0) {
      let sphere: THREE.Sphere;
      const inst = o as THREE.InstancedMesh;
      if (inst.isInstancedMesh) {
        if (!inst.boundingSphere) inst.computeBoundingSphere();
        sphere = inst.boundingSphere!.clone();
      } else {
        const geo = (o as THREE.Mesh).geometry;
        if (!geo.boundingSphere) geo.computeBoundingSphere();
        sphere = geo.boundingSphere!.clone();
      }
      sphere.applyMatrix4(o.matrixWorld);
      const shadowIndices = o.userData.sombraIndices as number | undefined;
      out.push({ obj: o, ...cost, shadowTriangles: shadowIndices === undefined ? cost.triangles : shadowIndices / 3, castShadow: o.castShadow, culled: o.frustumCulled, sphere });
    }
    for (const c of o.children) visit(c);
  };
  visit(scene);
  return out;
}

function pass(list: Drawable[], frustum: THREE.Frustum, shadow: boolean): BudgetSample {
  let drawCalls = 0;
  let triangulos = 0;
  for (const d of list) {
    if (shadow && !d.castShadow) continue;
    // Sprites face the camera and don't cast shadows; points and lines don't either.
    if (shadow && ((d.obj as THREE.Sprite).isSprite || (d.obj as THREE.Points).isPoints || (d.obj as THREE.Line).isLine)) continue;
    if (d.culled && !frustum.intersectsSphere(d.sphere)) continue;
    drawCalls += d.calls;
    triangulos += shadow ? d.shadowTriangles : d.triangles;
  }
  return { drawCalls, triangulos };
}

/** What `camera` draws of `scene` in one pass (no shadows), as three.js counts it: the home's warehouse is held to this (PF-35, P14). */
export function cameraPass(scene: THREE.Object3D, camera: THREE.Camera): BudgetSample {
  camera.updateMatrixWorld(true);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const s = pass(drawables(scene), frustum, false);
  return { drawCalls: s.drawCalls, triangulos: Math.round(s.triangulos) };
}

/** The sun's shadow camera as the renderer sets it up (client/render/renderer.ts and main.ts). */
function shadowFrustum(sun: Vec3, extent?: number): THREE.Frustum {
  const cam = extent ? new THREE.OrthographicCamera(-extent, extent, extent, -extent, 5, 150) : new THREE.OrthographicCamera(-48, 48, 40, -40, 5, 120);
  cam.position.set(...sun);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  return new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
}

/** The map's ground extent: the static batches' bounds (the sky and the like are left out). */
function mapBounds(scene: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  scene.traverse((o) => {
    if (!o.name.startsWith('static:')) return;
    const geo = (o as THREE.Mesh).geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    box.union(geo.boundingBox!.clone().applyMatrix4(o.matrixWorld));
  });
  return box;
}

/**
 * Measures a built map's scene: the worst sample camera's draw calls and triangles plus the shadow pass, and
 * whether it fits MAP_BUDGET.
 */
export function measureBudget(scene: THREE.Object3D, o: BudgetOptions): BudgetReport {
  const list = drawables(scene);
  const sombra = pass(list, shadowFrustum(o.sun ?? DEFAULT_SUN, o.shadowExtent), true);

  const spots: Vec3[] = o.spawns.map(([x, y, z]) => [x, y + EYE, z]);
  const bounds = mapBounds(scene);
  if (!bounds.isEmpty()) {
    const size = bounds.getSize(new THREE.Vector3());
    const step = o.step ?? Math.max(4, Math.max(size.x, size.z) / 12);
    for (let x = bounds.min.x + step / 2; x < bounds.max.x; x += step) {
      for (let z = bounds.min.z + step / 2; z < bounds.max.z; z += step) spots.push([x, EYE, z]);
    }
  }

  const cam = new THREE.PerspectiveCamera(FOV, ASPECT, NEAR, FAR);
  cam.rotation.order = 'YXZ';
  const frustum = new THREE.Frustum();
  const m = new THREE.Matrix4();
  const worst: BudgetReport['camera'] = { drawCalls: 0, triangulos: 0, piorChamadas: { onde: [0, 0, 0], yaw: 0 }, piorTriangulos: { onde: [0, 0, 0], yaw: 0 }, mediana: { drawCalls: 0, triangulos: 0 } };
  const seen: BudgetSample[] = [];
  for (const p of spots) {
    for (let k = 0; k < YAWS; k++) {
      const yaw = (k / YAWS) * Math.PI * 2;
      cam.position.set(...p);
      cam.rotation.set(0, yaw, 0);
      cam.updateMatrixWorld(true);
      frustum.setFromProjectionMatrix(m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      const s = pass(list, frustum, false);
      seen.push(s);
      if (s.drawCalls > worst.drawCalls) [worst.drawCalls, worst.piorChamadas] = [s.drawCalls, { onde: [...p], yaw }];
      if (s.triangulos > worst.triangulos) [worst.triangulos, worst.piorTriangulos] = [s.triangulos, { onde: [...p], yaw }];
    }
  }
  worst.mediana = { drawCalls: median(seen.map((s) => s.drawCalls)), triangulos: median(seen.map((s) => s.triangulos)) };
  const { malhas: _, ...fantasmas } = ghostInstances(scene);
  const drawCalls = worst.drawCalls + sombra.drawCalls;
  const triangulos = Math.round(worst.triangulos + sombra.triangulos);
  const excedeu: BudgetReport['excedeu'] = [];
  if (drawCalls > MAP_BUDGET.drawCalls) excedeu.push('drawCalls');
  if (triangulos > MAP_BUDGET.triangulos) excedeu.push('triangulos');
  return { drawCalls, triangulos, camera: { ...worst, triangulos: Math.round(worst.triangulos) }, sombra: { ...sombra, triangulos: Math.round(sombra.triangulos) }, amostras: seen.length, fantasmas, excedeu };
}

/** The middle value (the mean of the two middle ones for an even count), rounded; 0 for none. */
function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const h = sorted.length >> 1;
  return Math.round(sorted.length % 2 ? sorted[h] : (sorted[h - 1] + sorted[h]) / 2);
}

/** Instances at scale zero within each InstancedMesh's count (BudgetReport.fantasmas), with the meshes they're in. */
export function ghostInstances(scene: THREE.Object3D): BudgetReport['fantasmas'] & { malhas: { nome: string; instancias: number; triangulos: number }[] } {
  const out = { drawCalls: 0, triangulos: 0, instancias: 0, malhas: [] as { nome: string; instancias: number; triangulos: number }[] };
  const m = new THREE.Matrix4();
  scene.traverseVisible((o) => {
    const inst = o as THREE.InstancedMesh;
    if (!inst.isInstancedMesh || inst.count === 0) return;
    const cost = costOf(inst);
    if (!cost || !cost.triangles) return;
    let zero = 0;
    for (let i = 0; i < inst.count; i++) {
      inst.getMatrixAt(i, m);
      if (Math.abs(m.determinant()) < 1e-12) zero++;
    }
    if (!zero) return;
    const tris = (cost.triangles / inst.count) * zero;
    out.instancias += zero;
    out.triangulos += tris;
    if (zero === inst.count) out.drawCalls += cost.calls;
    out.malhas.push({ nome: inst.name || `${(inst.geometry as THREE.BufferGeometry).type} ${(inst.material as THREE.MeshBasicMaterial).color?.getHexString() ?? ''}`, instancias: zero, triangulos: Math.round(tris) });
  });
  out.triangulos = Math.round(out.triangulos);
  return out;
}

/**
 * What a map should cost at each object detail (PF-35): triangles at the worst sample camera, the median one and
 * the sun's shadow, and draw calls (worst camera plus shadow). The official maps are held to it
 * (client/tests/polyBudget.test.ts, with 5% of slack); the map editor only warns over the light one. MAP_BUDGET
 * stays the hard ceiling of every map.
 */
export const DETAIL_BUDGET = {
  normal: { pior: 400_000, mediana: 300_000, sombra: 220_000, chamadas: 320 },
  leve: { pior: 300_000, mediana: 220_000, sombra: 220_000, chamadas: 250 },
} as const;

export type DetailBudgetKey = keyof (typeof DETAIL_BUDGET)['leve'];

/** What of a measured map is over DETAIL_BUDGET at `detail`, with the value and the limit. */
export function overDetailBudget(r: BudgetReport, detail: keyof typeof DETAIL_BUDGET): { key: DetailBudgetKey; value: number; max: number }[] {
  const b = DETAIL_BUDGET[detail];
  const got: Record<DetailBudgetKey, number> = { pior: r.camera.triangulos, mediana: r.camera.mediana.triangulos, sombra: r.sombra.triangulos, chamadas: r.drawCalls };
  return (Object.keys(b) as DetailBudgetKey[]).filter((k) => got[k] > b[k]).map((key) => ({ key, value: got[key], max: b[key] }));
}

/** A built map's budget, with its data's spawns, sun and shadow. */
export function measureMapBudget(scene: THREE.Object3D, data: MapData): BudgetReport {
  const { a, b, ffa } = data.spawns;
  return measureBudget(scene, { spawns: [...a, ...b, ...ffa].map((s) => s.p), sun: data.ambiente.ceu.atmosfera?.sol.de, shadowExtent: data.ambiente.sombra });
}