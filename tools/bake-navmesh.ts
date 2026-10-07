#!/usr/bin/env bun
// Bakes the walkable area of every official map where the server simulates enemies (the zumbi mode's maps:
// `exclusivo: "zumbi"` in their data) into shared/data/navmesh/<map>.json, which seeds version 1 of the map on the
// server (server/maps.ts seedOfficialMaps; server/navmesh.ts loads it). Maps saved through the editor get theirs
// from the map builder thread (server/mapWorker.ts), the same way.
//
// The map is built headless, here in Bun, from its data (shared/data/mapas/<map>.json) with the client's own
// loader (client/world/mapLoader.ts: the same colliders the browser has) and the bots' Recast settings
// (client/ai/navmesh.ts), so server zombies walk exactly where players and offline bots can. The build is
// deterministic (each piece's seeded randomness): the same map data always gives the same bytes, and a test
// (server/tests/zombies.test.ts) fails while a baked file is stale.
// The gaps of the cemetery wall (ZombieMapData.barricadas) are baked as polygons of their own, with an area id
// and a flag per gap (shared/barricades.ts gateAreas), so a match can shut a barricaded gap with a query filter;
// the browser's solo game builds the very same mesh (client/main.ts passes the same boxes).
//
//   bun run navmesh           bakes every official zumbi map
//
// The client code is imported through variable paths so the server's typecheck (no DOM types) doesn't
// follow it; canvas textures get a do-nothing stand-in (nothing is drawn, only the colliders matter): see
// tools/headless.ts.
import { join } from 'node:path';
import { OFFICIAL_MAPS, type MapId } from '@shared/maps';
import type { MapData } from '@shared/mapData';
import { gateAreas } from '@shared/barricades';
import { fakeRenderer, installCanvasStandIn, loadClient, servePublicFromDisk, silentSfx } from './headless';

export const NAVMESH_DIR = join(import.meta.dir, '..', 'shared', 'data', 'navmesh');

/** The baked file: the navmesh (recast-navigation's exportNavMesh) as base64, its size and a hash. */
export interface BakedNavmesh {
  _doc: string;
  mapa: MapId;
  bytes: number;
  hash: string;
  dados: string;
}

/** The navmesh of a map, built as the browser builds it for the bots. */
export async function bakeNavmesh(map: MapId): Promise<Uint8Array> {
  const restore = installCanvasStandIn();
  try {
    await servePublicFromDisk();
    const THREE = await import('three');
    const { createPhysics } = await loadClient('client/world/physics.ts');
    const { loadOfficialMap, buildMapFromData } = await loadClient('client/world/mapLoader.ts');
    const { NavMap } = await loadClient('client/ai/navmesh.ts');
    const { exportNavMesh } = await import('recast-navigation');
    const physics = await createPhysics();
    const data: MapData = await loadOfficialMap(map);
    await buildMapFromData(data, { physics, scene: new THREE.Scene(), renderer: fakeRenderer, sfx: silentSfx, modo: 'jogo' });
    const nav = await NavMap.build(physics, [], data.zumbi ? gateAreas(data.zumbi) : []);
    if (!nav) throw new Error(`a malha de navegação de ${map} não foi gerada`);
    return exportNavMesh(nav.navMesh);
  } finally {
    restore();
  }
}

export const navmeshHash = (data: Uint8Array) => Bun.hash(data).toString(16);

export function bakedFile(map: MapId, data: Uint8Array): BakedNavmesh {
  return {
    _doc: 'Gerado por tools/bake-navmesh.ts (bun run navmesh) a partir dos dados do mapa (shared/data/mapas); não edite. A malha de navegação (exportNavMesh do recast-navigation) em base64.',
    mapa: map,
    bytes: data.length,
    hash: navmeshHash(data),
    dados: Buffer.from(data).toString('base64'),
  };
}

if (import.meta.main) {
  const { loadOfficialMap } = await loadClient('client/world/mapLoader.ts');
  for (const map of OFFICIAL_MAPS) {
    if ((await loadOfficialMap(map)).exclusivo !== 'zumbi') continue;
    const t0 = performance.now();
    const data = await bakeNavmesh(map);
    await Bun.write(join(NAVMESH_DIR, `${map}.json`), JSON.stringify(bakedFile(map, data)) + '\n');
    console.log(`${map}: ${(data.length / 1024).toFixed(0)} KB em ${(performance.now() - t0).toFixed(0)} ms`);
  }
}
