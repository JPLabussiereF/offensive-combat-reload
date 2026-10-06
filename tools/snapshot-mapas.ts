#!/usr/bin/env bun
// Golden snapshots of the official maps (shared/data/mapas/<slug>.golden.json): every map built headless, the
// way the browser builds it, and summed up in what a player can tell apart: the colliders (shape, place, size,
// physics material, sound occluder, whether a shot sets a gag off), the PropBus gags, the holes in the walls,
// the sound's rooms, the spawns and training dummies, killY, the shadow's reach and the sky, the static
// batches (per material and cell: triangle count and a hash of every triangle) and every other object in the
// scene (lights, animated props, the glow mesh, signs).
//
// The summary doesn't depend on the order things were built in: colliders, batches and objects are sorted,
// and a mesh's hash is the hash of its sorted triangles. The order can change (the map data's pieces, the
// shared systems finishing at the end) without changing the map. Math.random is seeded while a map builds
// (clouds, stars and fruit are drawn from it).
//
//   bun tools/snapshot-mapas.ts            writes the golden of the 4 maps
//   bun tools/snapshot-mapas.ts rua        just one
//
// The golden was written from the maps as they were built in code, before they became data (PF-6), and
// client/tests/mapConversion.test.ts checks the map data's loader against it.
import { join } from 'node:path';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { fakeRenderer, installCanvasStandIn, loadClient, ROOT, servePublicFromDisk, silentSfx, withSeededRandom } from './headless';

export const OFFICIAL = ['rua', 'jardim', 'halloween', 'cemiterio'] as const;
export type OfficialMap = (typeof OFFICIAL)[number];

export const MAPS_DIR = join(ROOT, 'shared', 'data', 'mapas');
export const goldenPath = (slug: string) => join(MAPS_DIR, `${slug}.golden.json`);

/** Seed of Math.random while a map builds. */
const RANDOM_SEED = 20261006;

type Num3 = [number, number, number];

export interface ColliderSnap {
  forma: string;
  corpo: string;
  t: Num3;
  r: [number, number, number, number];
  meia?: Num3;
  raio?: number;
  meiaAltura?: number;
  /** Convex hulls and triangle meshes: vertex count and a hash of the sorted vertices. */
  vertices?: { n: number; hash: string };
  grupos: number;
  ativo: boolean;
  material?: string;
  oclusor?: string;
  onShot: boolean;
}

export interface MeshSnap {
  tipo: string;
  nome: string;
  material: string;
  sombra: boolean;
  /** Triangles (points for Points) and the hash of the sorted triangles in world space. */
  n: number;
  hash: string;
}

export interface MapSnapshot {
  mapa: string;
  stats: { pieces: number; colliders: number; meshes: number; triangles: number };
  killY: number;
  shadowExtent: number | null;
  ceu: unknown;
  spawns: { a: number[][]; b: number[][]; ffa: number[][] };
  bonecos: unknown[];
  vaos: unknown[];
  salas: unknown[];
  props: string[];
  luzes: unknown[];
  objetos: { coletaveis: unknown[]; pocao: unknown; ratos: boolean; peixes: boolean; bichos: boolean; recompensas: boolean; cachorro: unknown };
  colisores: ColliderSnap[];
  lotes: MeshSnap[];
  cena: MeshSnap[];
}

const q = (v: number, step = 1e-4) => {
  const r = Math.round(v / step);
  return r === 0 ? 0 : r; // no "-0"
};
const r6 = (v: number) => Math.round(v * 1e6) / 1e6 || 0;
const r6a = <T extends number[]>(a: T) => a.map(r6) as T;
const hashOf = (parts: string[]) => Bun.hash(parts.sort().join(';')).toString(16);

function materialSig(m: THREE.Material | THREE.Material[]): string {
  const one = (x: THREE.Material) => {
    const a = x as THREE.Material & { color?: THREE.Color; map?: unknown; emissive?: THREE.Color; vertexColors?: boolean };
    return [x.type, x.name, a.color ? a.color.getHexString() : '-', a.emissive ? a.emissive.getHexString() : '-', a.map ? 'tex' : '-', a.vertexColors ? 'vc' : '-', x.transparent ? `t${r6(x.opacity)}` : '-', x.side, x.depthWrite ? 'dw' : '-', x.blending].join(',');
  };
  return Array.isArray(m) ? m.map(one).join('+') : one(m);
}

/** Triangles (or points) of a drawable in world space, as sorted strings: position, color, uv. */
function geometrySig(obj: THREE.Mesh | THREE.Points | THREE.Line | THREE.Sprite, instance?: THREE.Matrix4): { n: number; parts: string[] } {
  const geo = obj.geometry as THREE.BufferGeometry;
  const pos = geo.getAttribute('position');
  if (!pos) return { n: 0, parts: [] };
  const col = geo.getAttribute('color');
  const uv = geo.getAttribute('uv');
  const m = instance ? obj.matrixWorld.clone().multiply(instance) : obj.matrixWorld;
  const v = new THREE.Vector3();
  const vert = (i: number) => {
    v.fromBufferAttribute(pos, i).applyMatrix4(m);
    let s = `${q(v.x)},${q(v.y)},${q(v.z)}`;
    if (col) s += `|${q(col.getX(i), 1e-3)},${q(col.getY(i), 1e-3)},${q(col.getZ(i), 1e-3)}`;
    if (uv) s += `|${q(uv.getX(i), 1e-3)},${q(uv.getY(i), 1e-3)}`;
    return s;
  };
  const parts: string[] = [];
  if ((obj as THREE.Points).isPoints || (obj as THREE.Sprite).isSprite) {
    for (let i = 0; i < pos.count; i++) parts.push(vert(i));
    return { n: pos.count, parts };
  }
  const idx = geo.index;
  const count = idx ? idx.count : pos.count;
  const at = (k: number) => (idx ? idx.getX(k) : k);
  for (let k = 0; k + 2 < count; k += 3) parts.push(`${vert(at(k))}/${vert(at(k + 1))}/${vert(at(k + 2))}`);
  return { n: parts.length, parts };
}

function meshSnap(obj: THREE.Object3D): MeshSnap | null {
  const drawable = obj as THREE.Mesh;
  if ((obj as THREE.Light).isLight) {
    const l = obj as THREE.PointLight;
    const p = obj.getWorldPosition(new THREE.Vector3());
    return { tipo: obj.type, nome: obj.name, material: `${l.color.getHexString()},${r6(l.intensity)},${r6(l.distance ?? 0)},${r6(l.decay ?? 0)}`, sombra: obj.castShadow, n: 0, hash: `${q(p.x)},${q(p.y)},${q(p.z)}` };
  }
  if (!drawable.geometry || !drawable.material) return null;
  const inst = obj as THREE.InstancedMesh;
  let n = 0;
  const parts: string[] = [];
  if (inst.isInstancedMesh) {
    const m = new THREE.Matrix4();
    for (let i = 0; i < inst.count; i++) {
      inst.getMatrixAt(i, m);
      const g = geometrySig(inst, m);
      n += g.n;
      parts.push(hashOf(g.parts));
    }
  } else {
    const g = geometrySig(drawable);
    n = g.n;
    parts.push(...g.parts);
  }
  return { tipo: obj.type, nome: obj.name, material: materialSig(drawable.material), sombra: obj.castShadow, n, hash: hashOf(parts) };
}

function colliderSnap(c: RAPIER.Collider, physics: { surfaces: Map<number, { material: string; occluder?: string; onShot?: unknown }> }): ColliderSnap {
  const t = c.translation();
  const r = c.rotation();
  const type = c.shapeType();
  const body = c.parent();
  const s: ColliderSnap = {
    forma: RAPIER.ShapeType[type],
    corpo: body ? RAPIER.RigidBodyType[body.bodyType()] : 'nenhum',
    t: r6a([t.x, t.y, t.z]),
    r: r6a([r.x, r.y, r.z, r.w]),
    grupos: c.collisionGroups(),
    ativo: c.isEnabled(),
    onShot: false,
  };
  if (type === RAPIER.ShapeType.Cuboid) {
    const h = c.halfExtents()!;
    s.meia = r6a([h.x, h.y, h.z]);
  } else if (type === RAPIER.ShapeType.Ball) s.raio = r6(c.radius());
  else if (type === RAPIER.ShapeType.Cylinder || type === RAPIER.ShapeType.Capsule || type === RAPIER.ShapeType.Cone) {
    s.raio = r6(c.radius());
    s.meiaAltura = r6(c.halfHeight());
  } else if (type === RAPIER.ShapeType.ConvexPolyhedron || type === RAPIER.ShapeType.TriMesh) {
    const v = c.vertices();
    const parts: string[] = [];
    for (let i = 0; i < v.length; i += 3) parts.push(`${q(v[i])},${q(v[i + 1])},${q(v[i + 2])}`);
    s.vertices = { n: parts.length, hash: hashOf(parts) };
  }
  const info = physics.surfaces.get(c.handle);
  if (info) {
    s.material = info.material;
    if (info.occluder) s.oclusor = info.occluder;
    s.onShot = !!info.onShot;
  }
  return s;
}

/** Sorted by a coarse key, so values that differ by a hair still pair up. */
const coarseKey = (c: ColliderSnap) =>
  JSON.stringify([c.forma, c.corpo, c.t.map((x) => Math.round(x * 1e3)), c.meia?.map((x) => Math.round(x * 1e3)), c.raio && Math.round(c.raio * 1e3), c.vertices?.hash, c.material, c.oclusor, c.onShot, c.grupos, c.r.map((x) => Math.round(Math.abs(x) * 1e3))]);
const byKey = <T>(key: (x: T) => string) => (a: T, b: T) => {
  const ka = key(a);
  const kb = key(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};
const sortJson = <T>(list: T[]) => [...list].sort(byKey((x) => JSON.stringify(x)));

const spawnRow = (s: { position: THREE.Vector3; yaw: number }) => r6a([s.position.x, s.position.y, s.position.z, s.yaw]);

export interface Built {
  map: any;
  scene: THREE.Scene;
  physics: any;
  lightSpots: unknown[];
}

/** Sums up a built map (see the header). */
export function summarize(slug: string, b: Built): MapSnapshot {
  const { map, scene, physics } = b;
  scene.updateMatrixWorld(true);
  const lotes: MeshSnap[] = [];
  const cena: MeshSnap[] = [];
  scene.traverse((o) => {
    const s = meshSnap(o);
    if (!s) return;
    (o.name.startsWith('static:') ? lotes : cena).push(s);
  });
  const colisores: ColliderSnap[] = [];
  physics.world.forEachCollider((c: RAPIER.Collider) => colisores.push(colliderSnap(c, physics)));
  const box = (r: { min: THREE.Vector3 | { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }) => r6a([r.min.x, r.min.y, r.min.z, r.max.x, r.max.y, r.max.z]);
  return {
    mapa: slug,
    stats: { ...map.stats },
    killY: map.killY,
    shadowExtent: map.shadowExtent ?? null,
    ceu: map.atmosphere ?? null,
    spawns: { a: map.spawnsA.map(spawnRow), b: map.spawnsB.map(spawnRow), ffa: map.spawnsFFA.map(spawnRow) },
    bonecos: map.dummies.map((d: any) => ({ p: spawnRow(d), patrol: d.patrol ?? null })),
    vaos: sortJson(map.openings.map((o: any) => ({ ...o, fixed: r6(o.fixed), thickness: r6(o.thickness), s0: r6(o.s0), s1: r6(o.s1), y0: r6(o.y0), y1: r6(o.y1) }))),
    salas: sortJson(map.rooms.map((r: any) => ({ box: box(r), fechamento: r.enclosure }))),
    props: [...((map.props as any).handlers as Map<string, unknown>).keys()].sort(),
    luzes: sortJson(b.lightSpots),
    objetos: {
      coletaveis: (map.pickups ?? []).map((p: any) => ({ id: p.id, p: r6a([p.position.x, p.position.y, p.position.z]) })),
      pocao: map.potion ? { at: r6a([map.potion.at.x, map.potion.at.y, map.potion.at.z]), raio: map.potion.radius } : null,
      ratos: !!map.rats,
      peixes: !!map.fish,
      bichos: !!map.critters,
      recompensas: !!map.rewards,
      cachorro: map.dog ? { zona: box(map.dog.zone) } : null,
    },
    colisores: [...colisores].sort(byKey(coarseKey)),
    lotes: [...lotes].sort(byKey((m) => `${m.nome}|${m.sombra}|${m.hash}`)),
    cena: [...cena].sort(byKey((m) => `${m.tipo}|${m.material}|${m.hash}`)),
  };
}

/**
 * Builds a map headless and records the LightPool's light spots on the way. `build` gets fresh physics and
 * scene; Math.random is seeded meanwhile.
 */
export async function buildHeadless(build: (physics: any, scene: THREE.Scene) => Promise<any>): Promise<Built> {
  const restore = installCanvasStandIn();
  try {
    await servePublicFromDisk();
    const { createPhysics } = await loadClient('client/world/physics.ts');
    const { LightPool } = await loadClient('client/world/halloween.ts');
    const lightSpots: unknown[] = [];
    const add = LightPool.prototype.add;
    LightPool.prototype.add = function (this: unknown, ...spots: any[]) {
      for (const s of spots) lightSpots.push({ at: r6a([s.at.x, s.at.y, s.at.z]), cor: s.color.getHexString(), intensidade: s.intensity, alcance: s.range, piscar: s.flicker ?? null, aceso: !!s.on });
      return add.apply(this, spots);
    };
    try {
      const physics = await createPhysics();
      const scene = new THREE.Scene();
      const map = await withSeededRandom(RANDOM_SEED, () => build(physics, scene));
      return { map, scene, physics, lightSpots };
    } finally {
      LightPool.prototype.add = add;
    }
  } finally {
    restore();
  }
}

/** The map builders in code (before the map data). */
const BUILDERS: Record<OfficialMap, [module: string, fn: string]> = {
  rua: ['client/world/blockoutMap.ts', 'buildBlockoutMap'],
  jardim: ['client/world/dragonGarden.ts', 'buildDragonGardenMap'],
  halloween: ['client/world/hauntedTown.ts', 'buildHauntedTownMap'],
  cemiterio: ['client/world/cemetery.ts', 'buildCemeteryMap'],
};

/** The map as the game builds it today. */
export async function buildOfficial(slug: OfficialMap): Promise<Built> {
  const [module, fn] = BUILDERS[slug];
  const build = (await loadClient(module))[fn];
  return buildHeadless((physics, scene) => (slug === 'rua' ? build(physics, scene, fakeRenderer, silentSfx) : build(physics, scene, silentSfx)));
}

/** Differences between a golden and a fresh snapshot (numbers within `tol`); empty when they match. */
export function compareSnapshots(golden: MapSnapshot, fresh: MapSnapshot, tol = 1e-6): string[] {
  const out: string[] = [];
  const walk = (a: unknown, b: unknown, path: string) => {
    if (out.length > 40) return;
    if (typeof a === 'number' && typeof b === 'number') {
      if (Math.abs(a - b) > tol) out.push(`${path}: ${a} != ${b}`);
      return;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) out.push(`${path}: ${a.length} itens != ${b.length}`);
      for (let i = 0; i < Math.min(a.length, b.length); i++) walk(a[i], b[i], `${path}[${i}]`);
      return;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
      return;
    }
    if (a !== b) out.push(`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  };
  walk(golden, fresh, golden.mapa);
  return out;
}

/** One entry per line: readable diffs. */
export function snapshotJson(s: MapSnapshot): string {
  const lines = Object.entries(s).map(([k, v]) => {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') return `  ${JSON.stringify(k)}: [\n${v.map((x) => `    ${JSON.stringify(x)}`).join(',\n')}\n  ]`;
    return `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`;
  });
  return `{\n${lines.join(',\n')}\n}\n`;
}

if (import.meta.main) {
  const only = process.argv.slice(2);
  for (const slug of OFFICIAL) {
    if (only.length && !only.includes(slug)) continue;
    const t0 = performance.now();
    const snap = summarize(slug, await buildOfficial(slug));
    await Bun.write(goldenPath(slug), snapshotJson(snap));
    console.log(`${slug}: ${snap.colisores.length} colisores, ${snap.lotes.length} lotes, ${snap.cena.length} objetos em ${(performance.now() - t0).toFixed(0)} ms`);
  }
  process.exit(0);
}
