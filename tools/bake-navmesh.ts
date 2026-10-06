#!/usr/bin/env bun
// Bakes the walkable area of every map where the server simulates enemies (the zumbi mode's maps, see
// MODE_RULES in shared/modes.ts) into shared/data/navmesh/<map>.json, which the server loads (server/navmesh.ts).
//
// The map is built headless, here in Bun, with the client's own code (client/world: the same colliders the
// browser has) and the bots' Recast settings (client/ai/navmesh.ts), so server zombies walk exactly where
// players and offline bots can. The build is deterministic (seeded randomness): the same map code always
// gives the same bytes, and a test (server/tests/zombies.test.ts) fails while a baked file is stale.
// The gaps of the cemetery wall (ZombieMapData.barricadas) are baked as polygons of their own, with an area id
// and a flag per gap (shared/barricades.ts gateAreas), so a match can shut a barricaded gap with a query filter;
// the browser's solo game builds the very same mesh (client/main.ts passes the same boxes).
//
//   bun run navmesh           bakes every zumbi map
//
// The client code is imported through variable paths so the server's typecheck (no DOM types) doesn't
// follow it; canvas textures get a do-nothing stand-in (nothing is drawn, only the colliders matter).
import { join } from 'node:path';
import type { MapId } from '@shared/maps';
import { modeMaps } from '@shared/modes';
import { gateAreas } from '@shared/barricades';
import { ZOMBIE } from '@shared/zombies';

export const NAVMESH_DIR = join(import.meta.dir, '..', 'shared', 'data', 'navmesh');

/** The baked file: the navmesh (recast-navigation's exportNavMesh) as base64, its size and a hash. */
export interface BakedNavmesh {
  _doc: string;
  mapa: MapId;
  bytes: number;
  hash: string;
  dados: string;
}

/** What canvas code gets while baking: every call works and draws nothing. */
function installCanvasStandIn(): () => void {
  const g = globalThis as Record<string, unknown>;
  const had = { document: 'document' in g, window: 'window' in g };
  const anything: unknown = new Proxy(function () {}, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : anything),
    apply: () => anything,
    set: () => true,
  });
  const ctx2d = new Proxy(
    {},
    {
      get: (_t, k) => {
        if (k === 'getImageData' || k === 'createImageData') return (_x: number, _y: number, w = 1, h = 1) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(4, w * h * 4)) });
        if (k === 'measureText') return (s: string) => ({ width: String(s).length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
        if (k === 'canvas') return { width: 64, height: 64 };
        return typeof k === 'string' && /^[a-z]/.test(k) ? anything : undefined;
      },
      set: () => true,
    },
  );
  if (!had.document) g.document = { createElement: () => ({ width: 64, height: 64, style: {}, getContext: () => ctx2d, toDataURL: () => '' }) };
  if (!had.window) g.window = globalThis;
  return () => {
    if (!had.document) delete g.document;
    if (!had.window) delete g.window;
  };
}

/** Client modules, untyped on purpose (see the header). */
const load = (path: string): Promise<Record<string, any>> => import(join(import.meta.dir, '..', path));

const BUILDERS: Partial<Record<MapId, [module: string, fn: string]>> = {
  cemiterio: ['client/world/cemetery.ts', 'buildCemeteryMap'],
};

/** The navmesh of a map, built as the browser builds it for the bots. */
export async function bakeNavmesh(map: MapId): Promise<Uint8Array> {
  const builder = BUILDERS[map];
  if (!builder) throw new Error(`sem construtor headless para o mapa ${map}`);
  const restore = installCanvasStandIn();
  try {
    const THREE = await import('three');
    const { createPhysics } = await load('client/world/physics.ts');
    const build = (await load(builder[0]))[builder[1]];
    const { NavMap } = await load('client/ai/navmesh.ts');
    const { exportNavMesh } = await import('recast-navigation');
    const physics = await createPhysics();
    const silent = new Proxy({}, { get: () => () => {} });
    await build(physics, new THREE.Scene(), silent);
    const zmap = ZOMBIE.mapas[map];
    const nav = await NavMap.build(physics, [], zmap ? gateAreas(zmap) : []);
    if (!nav) throw new Error(`a malha de navegação de ${map} não foi gerada`);
    return exportNavMesh(nav.navMesh);
  } finally {
    restore();
  }
}

export const navmeshHash = (data: Uint8Array) => Bun.hash(data).toString(16);

export function bakedFile(map: MapId, data: Uint8Array): BakedNavmesh {
  return {
    _doc: 'Gerado por tools/bake-navmesh.ts (bun run navmesh) a partir do código do mapa; não edite. A malha de navegação (exportNavMesh do recast-navigation) em base64.',
    mapa: map,
    bytes: data.length,
    hash: navmeshHash(data),
    dados: Buffer.from(data).toString('base64'),
  };
}

if (import.meta.main) {
  for (const map of modeMaps('zumbi')) {
    const t0 = performance.now();
    const data = await bakeNavmesh(map);
    await Bun.write(join(NAVMESH_DIR, `${map}.json`), JSON.stringify(bakedFile(map, data)) + '\n');
    console.log(`${map}: ${(data.length / 1024).toFixed(0)} KB em ${(performance.now() - t0).toFixed(0)} ms`);
  }
}
