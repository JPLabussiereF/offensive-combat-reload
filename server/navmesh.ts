// The walkable area of the maps where the server simulates enemies (the zumbi mode's maps). Each saved version of
// such a map carries its navmesh, baked when it was saved (server/mapWorker.ts; the official cemetery's comes
// from shared/data/navmesh/cemiterio.json, baked by tools/bake-navmesh.ts from the same data). Each gap of the
// wall is baked as polygons of their own with a flag per gap (shared/barricades.ts), so a match can shut a gap
// for its zombies with a query filter. Loaded once per process and version (Recast's WebAssembly starts on the
// first one) and shared by every session of that version: each session's crowd only reads it (the filters that
// shut gaps belong to the session's crowd and queries, never to the navmesh).
import { importNavMesh, init, type NavMesh } from 'recast-navigation';
import type { MapRuntime } from './maps';

let ready: Promise<void> | null = null;
const loaded = new Map<string, Promise<NavMesh>>();

export function loadNavmesh(map: MapRuntime): Promise<NavMesh> {
  const key = `${map.id}@${map.versao}`;
  let p = loaded.get(key);
  if (p) return p;
  p = (async () => {
    if (!map.navmesh) throw new Error(`o mapa ${key} não tem malha de navegação`);
    ready ??= init();
    await ready;
    const { navMesh } = importNavMesh(map.navmesh);
    if (!navMesh) throw new Error(`malha de navegação de ${key} inválida`);
    return navMesh;
  })();
  loaded.set(key, p);
  return p;
}
