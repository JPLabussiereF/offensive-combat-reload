// The official maps as data build the same map they built in code (PF-6): each map's JSON, through the loader
// (client/world/mapLoader.ts), against its golden (shared/data/mapas/<id>.golden.json, written from the maps
// in code before the conversion by tools/snapshot-mapas.ts). Colliders, gags, holes in the walls, rooms,
// spawns, dummies, killY, shadow, sky, static batches and the scene's objects; numbers within 1e-6.
// The editor's mode builds the same pieces, each in its own group.
import { describe, expect, it } from 'bun:test';
import type { MapData } from '@shared/mapData';
import { buildHeadless, compareSnapshots, goldenPath, OFFICIAL, summarize, type MapSnapshot } from '../../tools/snapshot-mapas';
import { fakeRenderer, loadClient, silentSfx } from '../../tools/headless';

const { buildMapFromData, loadOfficialMap } = await loadClient('client/world/mapLoader.ts');

const build = (data: MapData, modo: 'jogo' | 'editor') => buildHeadless((physics, scene) => buildMapFromData(data, { physics, scene, renderer: fakeRenderer, sfx: silentSfx, modo }));

describe('mapas oficiais a partir dos dados', () => {
  for (const slug of OFFICIAL) {
    it(`${slug}: igual ao golden (tolerância 1e-6)`, async () => {
      const golden = (await Bun.file(goldenPath(slug)).json()) as MapSnapshot;
      const data = (await loadOfficialMap(slug)) as MapData;
      const fresh = summarize(slug, await build(data, 'jogo'));
      expect(compareSnapshots(golden, fresh, 1e-6)).toEqual([]);
    }, 60_000);
  }

  it('modo editor: cada peça no seu grupo, com os seus colisores, e nenhum lote fora deles', async () => {
    const data = (await loadOfficialMap('cemiterio')) as MapData;
    const jogo = await build(data, 'jogo');
    const editor = await build(data, 'editor');
    const pieces = editor.map.pieces as Map<string, { group: { children: unknown[]; parent: unknown }; colliders: number[] }>;
    expect([...pieces.keys()]).toEqual(data.pecas.map((p) => p.id));
    for (const { group } of pieces.values()) expect(group.parent).toBe(editor.scene);
    // Every merged static mesh belongs to one piece's group; the scene has none of its own.
    const loose = editor.scene.children.filter((o) => o.name.startsWith('static:'));
    expect(loose).toHaveLength(0);
    // Same colliders and gags, split among the pieces.
    const total = [...pieces.values()].reduce((n, p) => n + p.colliders.length, 0);
    let count = 0;
    editor.physics.world.forEachCollider(() => count++);
    expect(total).toBe(count);
    const sj = summarize('cemiterio', jogo);
    const se = summarize('cemiterio', editor);
    expect(compareSnapshots({ ...sj, lotes: [], cena: [], stats: { ...sj.stats, meshes: 0 } }, { ...se, lotes: [], cena: [], stats: { ...se.stats, meshes: 0 } })).toEqual([]);
    // A wall's batches are in its own piece's group.
    const wall = data.pecas.find((p) => p.tipo === 'muroCemiterio')!;
    expect(pieces.get(wall.id)!.group.children.length).toBeGreaterThan(0);
  }, 60_000);
});
