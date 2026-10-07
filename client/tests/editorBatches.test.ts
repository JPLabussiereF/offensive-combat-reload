// The editor's batches (PF-6 Revisions 01, P46): the pieces neither selected nor being edited are drawn from
// BatchedMeshes, so the editor costs about what the game does to draw; a piece selected comes out of its batch
// and goes back when deselected; the copies follow their meshes; the selection's ray still hits a batched piece.
import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import type { MapData } from '@shared/mapData';
import { buildHeadless } from '../../tools/snapshot-mapas';
import { fakeRenderer, loadClient, silentSfx } from '../../tools/headless';
import { drawCount, EditorBatches, HIDDEN_LAYER } from '../editor/batches';

const { buildMapFromData, loadOfficialMap } = await loadClient('client/world/mapLoader.ts');

const build = async (data: MapData, modo: 'jogo' | 'editor') => buildHeadless((physics, scene) => buildMapFromData(data, { physics, scene, renderer: fakeRenderer, sfx: silentSfx, modo }));

/** The editor's map with its batches, as client/editor/view.ts makes them. */
async function editorWithBatches(data: MapData) {
  const built = await build(data, 'editor');
  const batches = new EditorBatches(built.scene);
  for (const [id, p] of built.map.pieces) batches.add(id, p.group);
  batches.update();
  return { ...built, batches };
}

describe('lotes do editor (P46)', () => {
  it('Jardim: sem seleção, o editor desenha em chamadas próximas às do jogo (antes, uma por malha de cada peça)', async () => {
    const data = (await loadOfficialMap('jardim')) as MapData;
    const game = drawCount((await build(data, 'jogo')).scene);
    const before = drawCount((await build(data, 'editor')).scene);
    const { scene, batches } = await editorWithBatches(data);
    const after = drawCount(scene);
    console.log(`Jardim, chamadas sem recorte: jogo ${game}, editor sem lotes ${before}, editor com lotes ${after} (${batches.stats().batches} lotes com ${batches.stats().meshes} malhas)`);
    expect(before).toBeGreaterThan(game * 4);
    expect(after).toBeLessThanOrEqual(game * 1.25);
  }, 120_000);

  it('a peça selecionada sai do lote (as malhas dela voltam a desenhar, as cópias somem) e volta ao desselecionar', async () => {
    const data = (await loadOfficialMap('rua')) as MapData;
    const { scene, map, batches } = await editorWithBatches(data);
    const base = drawCount(scene);
    // A piece with several batched meshes (a house, a car...).
    const [id, piece] = [...map.pieces].find(([, p]: [string, any]) => {
      let n = 0;
      p.group.traverse((o: THREE.Object3D) => (n += o.layers.isEnabled(HIDDEN_LAYER) ? 1 : 0));
      return n >= 2;
    }) as [string, any];
    const own: THREE.Mesh[] = [];
    piece.group.traverse((o: THREE.Object3D) => o.layers.isEnabled(HIDDEN_LAYER) && own.push(o as THREE.Mesh));
    expect(batches.batched(id)).toBe(true);

    batches.setOut([id]);
    expect(batches.batched(id)).toBe(false);
    for (const m of own) expect(m.layers.test(new THREE.Layers())).toBe(true);
    expect(drawCount(scene)).toBe(base + own.length);

    batches.setOut([]);
    for (const m of own) expect(m.layers.isEnabled(HIDDEN_LAYER)).toBe(true);
    expect(drawCount(scene)).toBe(base);
  }, 60_000);

  it('as cópias seguem a malha que se move, e o raio da seleção ainda acerta a peça no lote', async () => {
    const data = (await loadOfficialMap('rua')) as MapData;
    const { scene, map, batches } = await editorWithBatches(data);
    const [, piece] = [...map.pieces].find(([, p]: [string, any]) => {
      let ok = false;
      p.group.traverse((o: THREE.Object3D) => (ok ||= o.layers.isEnabled(HIDDEN_LAYER) && !(o as THREE.InstancedMesh).isInstancedMesh));
      return ok;
    }) as [string, any];
    let mesh: THREE.Mesh | null = null;
    piece.group.traverse((o: THREE.Object3D) => {
      if (!mesh && o.layers.isEnabled(HIDDEN_LAYER) && !(o as THREE.InstancedMesh).isInstancedMesh) mesh = o as THREE.Mesh;
    });
    const m = mesh! as THREE.Mesh;
    m.position.y += 3;
    scene.updateMatrixWorld(true);
    batches.update();
    // The batch holding it has a copy at the mesh's new world matrix.
    const lots = scene.getObjectByName('lotes')!.children as THREE.BatchedMesh[];
    const want = m.matrixWorld;
    const found = lots.some((b) => {
      const got = new THREE.Matrix4();
      for (let i = 0; i < b.maxInstanceCount; i++) {
        try {
          b.getMatrixAt(i, got);
        } catch {
          continue;
        }
        if (got.equals(want)) return true;
      }
      return false;
    });
    expect(found).toBe(true);

    // A ray (all layers, as the selection casts it) at the mesh's middle hits the mesh itself, never a batch.
    const box = new THREE.Box3().setFromObject(m);
    const c = box.getCenter(new THREE.Vector3());
    const ray = new THREE.Raycaster(new THREE.Vector3(c.x, c.y + 50, c.z), new THREE.Vector3(0, -1, 0));
    ray.layers.enableAll();
    const hits = ray.intersectObject(scene, true);
    expect(hits.some((h) => h.object === m)).toBe(true);
    expect(hits.some((h) => (h.object as unknown as THREE.BatchedMesh).isBatchedMesh)).toBe(false);
  }, 60_000);

  it('materiais iguais de peças diferentes dividem um lote; material que muda depois (pisca, apaga) sai do lote', async () => {
    const scene = new THREE.Scene();
    const batches = new EditorBatches(scene);
    const piece = (id: string, x: number) => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x336699 }));
      m.position.x = x;
      g.add(m);
      scene.add(g);
      batches.add(id, g);
      return m;
    };
    const a = piece('a', 0);
    const b = piece('b', 3);
    batches.update();
    expect(batches.stats()).toEqual({ batches: 1, meshes: 2 });
    expect(drawCount(scene)).toBe(1);
    (b.material as THREE.MeshLambertMaterial).color.set(0xff0000);
    batches.update();
    expect(batches.stats()).toEqual({ batches: 1, meshes: 1 });
    expect(b.layers.isEnabled(HIDDEN_LAYER)).toBe(false);
    expect(a.layers.isEnabled(HIDDEN_LAYER)).toBe(true);
    expect(drawCount(scene)).toBe(2);
  });

  it('peça reconstruída troca as suas cópias; peça apagada leva as cópias', async () => {
    const data = (await loadOfficialMap('rua')) as MapData;
    const { scene, map, batches } = await editorWithBatches(data);
    const base = batches.stats().meshes;
    const [id, piece] = [...map.pieces].find(([pid]: [string]) => batches.batched(pid)) as [string, any];
    let n = 0;
    piece.group.traverse((o: THREE.Object3D) => (n += o.layers.isEnabled(HIDDEN_LAYER) ? 1 : 0));
    batches.remove(id);
    batches.update();
    expect(batches.stats().meshes).toBe(base - n);
    batches.add(id, piece.group);
    batches.update();
    expect(batches.stats().meshes).toBe(base);
    expect(drawCount(scene)).toBeGreaterThan(0);
  }, 60_000);
});
