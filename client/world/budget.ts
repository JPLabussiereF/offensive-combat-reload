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
  /** The worst camera pass (without the shadow): the most draw calls and the most triangles, and where each was seen. */
  camera: BudgetSample & { piorChamadas: BudgetView; piorTriangulos: BudgetView };
  /** The sun's shadow pass (the same every frame: the sun doesn't move). */
  sombra: BudgetSample;
  /** How many cameras were tried. */
  amostras: number;
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
      out.push({ obj: o, ...cost, castShadow: o.castShadow, culled: o.frustumCulled, sphere });
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
    triangulos += d.triangles;
  }
  return { drawCalls, triangulos };
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
  const worst: BudgetReport['camera'] = { drawCalls: 0, triangulos: 0, piorChamadas: { onde: [0, 0, 0], yaw: 0 }, piorTriangulos: { onde: [0, 0, 0], yaw: 0 } };
  let samples = 0;
  for (const p of spots) {
    for (let k = 0; k < YAWS; k++) {
      const yaw = (k / YAWS) * Math.PI * 2;
      cam.position.set(...p);
      cam.rotation.set(0, yaw, 0);
      cam.updateMatrixWorld(true);
      frustum.setFromProjectionMatrix(m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      const s = pass(list, frustum, false);
      samples++;
      if (s.drawCalls > worst.drawCalls) [worst.drawCalls, worst.piorChamadas] = [s.drawCalls, { onde: [...p], yaw }];
      if (s.triangulos > worst.triangulos) [worst.triangulos, worst.piorTriangulos] = [s.triangulos, { onde: [...p], yaw }];
    }
  }
  const drawCalls = worst.drawCalls + sombra.drawCalls;
  const triangulos = Math.round(worst.triangulos + sombra.triangulos);
  const excedeu: BudgetReport['excedeu'] = [];
  if (drawCalls > MAP_BUDGET.drawCalls) excedeu.push('drawCalls');
  if (triangulos > MAP_BUDGET.triangulos) excedeu.push('triangulos');
  return { drawCalls, triangulos, camera: { ...worst, triangulos: Math.round(worst.triangulos) }, sombra: { ...sombra, triangulos: Math.round(sombra.triangulos) }, amostras: samples, excedeu };
}

/** A built map's budget, with its data's spawns, sun and shadow. */
export function measureMapBudget(scene: THREE.Object3D, data: MapData): BudgetReport {
  const { a, b, ffa } = data.spawns;
  return measureBudget(scene, { spawns: [...a, ...b, ...ffa].map((s) => s.p), sun: data.ambiente.ceu.atmosfera?.sol.de, shadowExtent: data.ambiente.sombra });
}