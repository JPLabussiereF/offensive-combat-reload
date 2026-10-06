// The map budget (client/world/budget.ts): draw calls and triangles as three.js counts them in a frame, the worst
// sample camera plus the sun's shadow pass. The official maps fit MAP_BUDGET (400 draw calls, 750k triangles).
import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { MAP_BUDGET, type MapData } from '@shared/mapData';
import { buildHeadless, OFFICIAL } from '../../tools/snapshot-mapas';
import { fakeRenderer, loadClient, silentSfx } from '../../tools/headless';

const { measureBudget, measureMapBudget } = await loadClient('client/world/budget.ts');
const { buildMapFromData, loadOfficialMap } = await loadClient('client/world/mapLoader.ts');

const box = (x: number, z: number, o: { shadow?: boolean; name?: string } = {}) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  m.position.set(x, 0.5, z);
  m.castShadow = o.shadow ?? false;
  m.name = o.name ?? '';
  return m;
};

describe('orçamento de desenho', () => {
  it('conta uma chamada e 12 triângulos por caixa vista, e nada do que fica fora da câmera', () => {
    const scene = new THREE.Scene();
    // The camera at the origin looks along -Z at yaw 0, +X at -90°... every yaw is tried: the worst sees both boxes ahead of it only one at a time.
    scene.add(box(0, -10), box(0, 10));
    const r = measureBudget(scene, { spawns: [[0, 0, 0]], step: 1000 });
    expect(r.camera.drawCalls).toBe(1);
    expect(r.camera.triangulos).toBe(12);
    expect(r.sombra).toEqual({ drawCalls: 0, triangulos: 0 });
    expect(r.excedeu).toEqual([]);
  });

  it('a passada de sombra conta só o que projeta sombra, dentro da câmera do sol', () => {
    const scene = new THREE.Scene();
    scene.add(box(0, -10, { shadow: true }), box(3, -10, { shadow: true }), box(0, -12), box(500, 500, { shadow: true }));
    const r = measureBudget(scene, { spawns: [[0, 0, 0]], step: 1000 });
    expect(r.sombra).toEqual({ drawCalls: 2, triangulos: 24 });
    expect(r.drawCalls).toBe(r.camera.drawCalls + 2);
  });

  it('malha com vários materiais: uma chamada por grupo; instanciada: triângulos vezes as instâncias', () => {
    const scene = new THREE.Scene();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const multi = new THREE.Mesh(geo, Array.from({ length: 6 }, () => new THREE.MeshBasicMaterial()));
    multi.position.set(0, 0, -5);
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 10);
    inst.count = 4;
    inst.frustumCulled = false;
    scene.add(multi, inst);
    const r = measureBudget(scene, { spawns: [[0, 0, 0]], step: 1000 });
    expect(r.camera.drawCalls).toBe(7);
    expect(r.camera.triangulos).toBe(12 + 4 * 12);
  });

  it('acusa o que passa do orçamento', () => {
    const scene = new THREE.Scene();
    const big = new THREE.Mesh(new THREE.SphereGeometry(1, 1024, 512), new THREE.MeshBasicMaterial());
    big.position.set(0, 0, -5);
    scene.add(big);
    for (let i = 0; i < MAP_BUDGET.drawCalls; i++) scene.add(box(0, -3 - i * 0.01));
    expect(measureBudget(scene, { spawns: [[0, 0, 0]], step: 1000 }).excedeu).toEqual(['drawCalls', 'triangulos']);
  });

  it('os 4 mapas oficiais cabem em 400 chamadas e 750 mil triângulos', async () => {
    const rows: string[] = [];
    for (const slug of OFFICIAL) {
      const data = (await loadOfficialMap(slug)) as MapData;
      const built = await buildHeadless((physics, scene) => buildMapFromData(data, { physics, scene, renderer: fakeRenderer, sfx: silentSfx, modo: 'jogo' }));
      const r = measureMapBudget(built.scene, data);
      rows.push(`${slug}: ${r.drawCalls} chamadas (câmera ${r.camera.drawCalls} + sombra ${r.sombra.drawCalls}), ${r.triangulos} triângulos (câmera ${r.camera.triangulos} + sombra ${r.sombra.triangulos}), ${r.amostras} amostras`);
      expect([slug, r.excedeu]).toEqual([slug, []]);
    }
    console.log(`orçamento dos mapas oficiais:\n  ${rows.join('\n  ')}`);
  }, 120_000);
});
