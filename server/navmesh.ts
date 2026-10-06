// The walkable area of the maps where the server simulates enemies (the zumbi mode), baked from the client's
// map code by tools/bake-navmesh.ts into shared/data/navmesh/<map>.json and bundled with the server. Loaded
// once per process (Recast's WebAssembly starts on the first one) and shared by every session of the map:
// each session's crowd only reads it.
import { importNavMesh, init, type NavMesh } from 'recast-navigation';
import type { MapId } from '@shared/maps';
import halloween from '@shared/data/navmesh/halloween.json';

const BAKED: Partial<Record<MapId, { dados: string }>> = { halloween };

let ready: Promise<void> | null = null;
const loaded = new Map<MapId, Promise<NavMesh>>();

/** Whether a map has a baked navmesh. */
export const hasNavmesh = (map: MapId) => !!BAKED[map];

export function loadNavmesh(map: MapId): Promise<NavMesh> {
  let p = loaded.get(map);
  if (p) return p;
  p = (async () => {
    const baked = BAKED[map];
    if (!baked) throw new Error(`sem malha de navegação para o mapa ${map} (rode bun run navmesh)`);
    ready ??= init();
    await ready;
    const { navMesh } = importNavMesh(new Uint8Array(Buffer.from(baked.dados, 'base64')));
    if (!navMesh) throw new Error(`malha de navegação de ${map} inválida`);
    return navMesh;
  })();
  loaded.set(map, p);
  return p;
}
