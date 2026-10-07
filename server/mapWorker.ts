// The map builder thread (a Bun Worker, so the 20 Hz session ticks never wait for it): every time a map is
// saved, it builds the map headless from its data with the client's own loader (client/world/mapLoader.ts,
// the way tools/headless.ts and tools/bake-navmesh.ts do), measures what it costs to draw
// (client/world/budget.ts: the same numbers the editor shows) and counts its colliders, and for a map of the
// zumbi mode bakes its navmesh (client/ai/navmesh.ts with the wall's gaps, as tools/bake-navmesh.ts does).
//
// Started by server/maps.ts (MapBuilderPool); one job at a time. Models load from disk: "/models/x.glb" from the
// game's public files, "/api/mapas/arquivos/<sha256>.glb" from MAPAS_DIR.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { MapData } from '@shared/mapData';
import { gateAreas } from '@shared/barricades';
import { fakeRenderer, installCanvasStandIn, loadClient, ROOT, silentSfx } from '../tools/headless';

declare const self: Worker;

/** What the server asks. */
export interface MapJob {
  id: number;
  data: MapData;
  /** Bake the navmesh (zumbi maps). */
  navmesh: boolean;
  /** Where the uploaded models are (CONFIG.mapAssetsDir). */
  assetsDir: string;
}

/** What it answers: the budget's numbers (budget.ts), the collider count and the navmesh, or what went wrong. */
export type MapJobResult =
  | { id: number; ok: true; drawCalls: number; triangulos: number; excedeu: ('drawCalls' | 'triangulos')[]; colliders: number; navmesh: Uint8Array | null }
  | { id: number; ok: false; erro: string };

const ASSET = /^\/api\/mapas\/arquivos\/([0-9a-f]{64}\.glb)$/;

let setup: Promise<{ THREE: typeof import('three'); client: Record<string, Record<string, any>> }> | null = null;
let assetsDir = '';

function prepare() {
  setup ??= (async () => {
    // This thread is only for this: the stand-ins stay for its whole life.
    installCanvasStandIn();
    const THREE = await import('three');
    // The game's public files: public/ in the repository, dist/ in a production image.
    const publicDir = existsSync(join(ROOT, 'public')) ? join(ROOT, 'public') : join(ROOT, 'dist');
    const file = (p: string) => 'file:///' + p.replace(/\\/g, '/');
    THREE.DefaultLoadingManager.setURLModifier((u: string) => {
      const asset = ASSET.exec(u);
      if (asset) return file(join(resolve(assetsDir), asset[1]));
      return u.startsWith('/') ? file(join(publicDir, u)) : u;
    });
    const client = {
      physics: await loadClient('client/world/physics.ts'),
      loader: await loadClient('client/world/mapLoader.ts'),
      budget: await loadClient('client/world/budget.ts'),
      navmesh: await loadClient('client/ai/navmesh.ts'),
    };
    return { THREE, client };
  })();
  return setup;
}

async function run(job: MapJob): Promise<MapJobResult> {
  assetsDir = job.assetsDir;
  const { THREE, client } = await prepare();
  const physics = await client.physics.createPhysics();
  try {
    const scene = new THREE.Scene();
    await client.loader.buildMapFromData(job.data, { physics, scene, renderer: fakeRenderer, sfx: silentSfx, modo: 'jogo' });
    const budget = client.budget.measureMapBudget(scene, job.data);
    const colliders: number = physics.world.colliders.len();
    let navmesh: Uint8Array | null = null;
    if (job.navmesh) {
      const { exportNavMesh } = await import('recast-navigation');
      const nav = await client.navmesh.NavMap.build(physics, [], job.data.zumbi ? gateAreas(job.data.zumbi) : []);
      if (!nav) throw new Error('a malha de navegação não foi gerada (o chão é alcançável?)');
      navmesh = exportNavMesh(nav.navMesh);
      nav.navMesh.destroy();
    }
    return { id: job.id, ok: true, drawCalls: budget.drawCalls, triangulos: budget.triangulos, excedeu: budget.excedeu, colliders, navmesh };
  } finally {
    physics.world.free();
  }
}

self.onmessage = (ev: MessageEvent<MapJob>) => {
  const job = ev.data;
  run(job)
    .catch((err): MapJobResult => ({ id: job.id, ok: false, erro: String((err as Error)?.message ?? err).slice(0, 300) }))
    .then((r) => self.postMessage(r));
};
