#!/usr/bin/env bun
// Converts the official maps, once built in code, into map data: shared/data/mapas/<id>.json (PF-6).
//
// Each map's conversion script (client/world/conversao/<id>.ts: the old builder with every call recorded as
// a piece) runs headless; the recorded pieces and the map's meta are written as the map's JSON. On the way,
// both the recording build and a fresh build from the written JSON are checked against the map's golden
// (tools/snapshot-mapas.ts): the conversion must not change the map. The JSON is the source of truth from
// now on; this tool only reproduces the conversion.
//
//   bun tools/converter-mapas.ts            the 4 maps
//   bun tools/converter-mapas.ts cemiterio  just one
import { join } from 'node:path';
import { validateMapData, type MapData } from '@shared/mapData';
import { fakeRenderer, loadClient, silentSfx } from './headless';
import { buildHeadless, compareSnapshots, goldenPath, MAPS_DIR, OFFICIAL, summarize, type MapSnapshot } from './snapshot-mapas';

export const mapPath = (slug: string) => join(MAPS_DIR, `${slug}.json`);

/** One line per piece: readable diffs when a map changes. */
export function mapJson(data: MapData): string {
  const lines = Object.entries(data).map(([k, v]) => {
    if (k === 'pecas') return `  "pecas": [\n${(v as unknown[]).map((p) => `    ${JSON.stringify(p)}`).join(',\n')}\n  ]`;
    return `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`;
  });
  return `{\n${lines.join(',\n')}\n}\n`;
}

/** Runs a map's conversion script; returns its data and the snapshot of the recording build. */
export async function convert(slug: string): Promise<{ data: MapData; snap: MapSnapshot }> {
  const script = await loadClient(`client/world/conversao/${slug}.ts`);
  const { startBuild } = await loadClient('client/world/mapLoader.ts');
  const { Recorder } = await loadClient('client/world/conversao/recorder.ts');
  const { seeded } = await loadClient('client/world/oriental.ts');
  let data!: MapData;
  const built = await buildHeadless(async (physics, scene) => {
    data = { ...script.meta(), pecas: [] };
    const build = startBuild(data, { physics, scene, renderer: fakeRenderer, sfx: silentSfx, modo: 'jogo' });
    const rec = new Recorder(build.ctx, seeded(script.SEED ?? 0));
    await script.pieces(rec);
    data.pecas = rec.pecas;
    // Key order of the file: the meta first, the pieces before the spawns.
    const { formato, nome, exclusivo, cartao, ambiente, pecas: _, ...rest } = data;
    data = { formato, nome, ...(exclusivo ? { exclusivo } : {}), cartao, ambiente, pecas: rec.pecas, ...rest } as MapData;
    return build.finish();
  });
  return { data, snap: summarize(slug, built) };
}

/** A map built from its JSON, as the game builds it. */
export async function buildFromJson(slug: string, data: MapData): Promise<MapSnapshot> {
  const { buildMapFromData } = await loadClient('client/world/mapLoader.ts');
  return summarize(slug, await buildHeadless((physics, scene) => buildMapFromData(data, { physics, scene, renderer: fakeRenderer, sfx: silentSfx, modo: 'jogo' })));
}

if (import.meta.main) {
  const only = process.argv.slice(2);
  let failed = false;
  for (const slug of OFFICIAL) {
    if (only.length && !only.includes(slug)) continue;
    const t0 = performance.now();
    const golden = (await Bun.file(goldenPath(slug)).json()) as MapSnapshot;
    const { data, snap } = await convert(slug);
    const valid = validateMapData(data);
    if (!valid.ok) console.log(`${slug}: dados inválidos\n  ${valid.erros.slice(0, 20).join('\n  ')}`);
    const recDiff = compareSnapshots(golden, snap);
    if (recDiff.length) console.log(`${slug}: a gravação difere do golden\n  ${recDiff.slice(0, 25).join('\n  ')}`);
    await Bun.write(mapPath(slug), mapJson(data));
    const parsed = (await Bun.file(mapPath(slug)).json()) as MapData;
    const jsonDiff = compareSnapshots(golden, await buildFromJson(slug, parsed));
    if (jsonDiff.length) console.log(`${slug}: o JSON difere do golden\n  ${jsonDiff.slice(0, 25).join('\n  ')}`);
    failed ||= !valid.ok || recDiff.length > 0 || jsonDiff.length > 0;
    console.log(`${slug}: ${data.pecas.length} peças, ${(Bun.file(mapPath(slug)).size / 1024).toFixed(0)} KB em ${(performance.now() - t0).toFixed(0)} ms${!recDiff.length && !jsonDiff.length ? ', igual ao golden' : ''}`);
  }
  process.exit(failed ? 1 : 0);
}
