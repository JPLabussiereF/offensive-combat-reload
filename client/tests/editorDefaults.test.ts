// New pieces with the catalog's defaults (P53, PF-6 Revisions 01): what the Project makes (and its thumbnails show)
// is a piece of the kind with shared/mapCatalog.ts's defaults, no longer the first example in the official maps.
// Every kind built that way alone (the game's loader, headless) builds without errors, passes the map's
// validation and draws something a few meters wide (the kinds that draw nothing by nature, a sound room, an
// invisible collider, a light, embers, are the only exceptions); the cylinder is a plain 1 m one. A drop makes the
// piece with the defaults, not with an official map's example.
import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { MAP_FORMAT, validateMapData, type MapData } from '@shared/mapData';
import { MAP_CATALOG } from '@shared/mapCatalog';
import { buildHeadless } from '../../tools/snapshot-mapas';
import { fakeRenderer, loadClient, silentSfx } from '../../tools/headless';
import { defaultParams, newPiece } from '../editor/create';
import { dropPiece, sceneSpot } from '../editor/dropPiece';

const { buildMapFromData } = await loadClient('client/world/mapLoader.ts');

/** Kinds that draw nothing by nature (the editor shows a wire stand-in, the Project the folder's icon). */
const DRAW_NOTHING = new Set(['sala', 'colisor', 'luz', 'brasas']);

const empty = (): MapData => ({
  formato: MAP_FORMAT,
  nome: 'Padrões',
  cartao: { emoji: '🧪', cor: '#aabbcc' },
  ambiente: { ceu: {}, celula: 40, killY: -20 },
  pecas: [],
  arquivos: [],
  spawns: { a: [{ p: [0, 0, 5], yaw: 0 }], b: [{ p: [5, 0, 0], yaw: 0 }], ffa: [{ p: [-5, 0, 0], yaw: 0 }] },
  bonecos: [],
  objetos: { coletaveis: [], bruxa: null, ratos: [], peixes: [] },
});

/** The box of what a scene draws (hidden things don't count). */
function drawnBox(scene: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  scene.updateMatrixWorld(true);
  scene.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    box.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld));
  });
  return box;
}

describe('peças novas com os padrões do catálogo (P53)', () => {
  it('cada tipo, montado só com os padrões, monta sem erro, é válido e desenha algo de alguns metros', async () => {
    const report: string[] = [];
    for (const tipo of Object.keys(MAP_CATALOG)) {
      if (tipo === 'glb' || tipo === 'grupo') continue;
      const d = empty();
      const made = newPiece(d, tipo, [0, 0, 0], undefined, () => 0.5);
      expect({ tipo, made: !!made }).toEqual({ tipo, made: true });
      d.pecas.push(made!.peca);
      made!.rest?.(d);
      if (tipo !== 'peixes') expect({ tipo, erros: validateMapData(d).erros }).toEqual({ tipo, erros: [] });
      let built: { scene: THREE.Scene };
      try {
        built = await buildHeadless((physics, scene) => buildMapFromData(d, { physics, scene, renderer: fakeRenderer, sfx: silentSfx, modo: 'editor' }));
      } catch (err) {
        report.push(`${tipo}: ${String((err as Error).message)}`);
        continue;
      }
      const box = drawnBox(built.scene);
      if (DRAW_NOTHING.has(tipo)) continue;
      const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
      const biggest = Math.max(size.x, size.y, size.z);
      if (biggest < 0.09 || biggest > 20) report.push(`${tipo}: ${size.toArray().map((v) => v.toFixed(2)).join(' x ')}`);
    }
    expect(report).toEqual([]);
  }, 240_000);

  it('o cilindro novo é um cilindro neutro de 1 m (não a vela do exemplo oficial)', async () => {
    expect(defaultParams(MAP_CATALOG.cilindro.params)).toMatchObject({ raio: 0.5, altura: 1 });
    const d = empty();
    d.pecas.push(newPiece(d, 'cilindro', [0, 0, 0])!.peca);
    const { scene } = await buildHeadless((physics, sc) => buildMapFromData(d, { physics, scene: sc, renderer: fakeRenderer, sfx: silentSfx, modo: 'editor' }));
    const s = drawnBox(scene).getSize(new THREE.Vector3());
    expect([s.x, s.y, s.z].map((v) => +v.toFixed(2))).toEqual([1, 1, 1]);
  });

  it('as listas e o JSON do esquema têm padrões montáveis (o padrão vem copiado, nunca compartilhado)', () => {
    const a = defaultParams(MAP_CATALOG.carrinhosBateBate.params);
    const b = defaultParams(MAP_CATALOG.carrinhosBateBate.params);
    expect((a.carros as unknown[]).length).toBe(2);
    (a.carros as { cor: number }[])[0].cor = 0;
    expect((b.carros as { cor: number }[])[0].cor).not.toBe(0);
    expect((defaultParams(MAP_CATALOG.pavilhao.params).spec as { stories: unknown[] }).stories).toHaveLength(1);
    expect(defaultParams(MAP_CATALOG.varalLanternas.params)).toMatchObject({ de: [-2, 2.6, 0], ate: [2, 2.6, 0] });
  });

  it('arrastar do Project cria com os padrões do catálogo', async () => {
    const d = empty();
    const made = await dropPiece(d, 'caminhaoSorvete', sceneSpot({ x: 3, y: 0, z: 1 }, 0.5), { probe: async () => null });
    expect(made!.pecas.at(-1)!.params).toEqual(defaultParams(MAP_CATALOG.caminhaoSorvete.params));
    expect(made!.pecas.at(-1)!.params).toEqual({ cor: 0xffd1e8, detalhe: 0xff4f9a });
  });
});
