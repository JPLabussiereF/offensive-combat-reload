// New pieces dragged from the Project panel, without a screen (PF-6 Revisions 01, etapa 4): on the Scene they land
// where the mouse points, on the grid of the move step; on the Hierarchy at the origin of the group they were
// dropped in (a group's row, the group of another row, the top below the rows), with the group as their parent and
// their place at the end of its children; the kinds placed by a pose stand their middle on the point; a giant rat
// brings its server place (in the world); and the whole drop is one edit, undone at once.
import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { MAP_FORMAT, validateMapData, type MapData } from '@shared/mapData';
import { EditorDocument, clone } from '../editor/document';
import { dropPiece, ghostBox, hierarchySpot, insertPiece, sceneSpot, type Probe } from '../editor/dropPiece';
import { worldPoseMatrix } from '../world/pose';
import { finder } from '../editor/groups';

function map(): MapData {
  return {
    formato: MAP_FORMAT,
    nome: 'Arrastar',
    cartao: { emoji: '🧪', cor: '#aabbcc' },
    ambiente: { ceu: {}, celula: 40, killY: -20 },
    pecas: [
      { id: 'chao', tipo: 'caixa', p: [0, -0.5, 0], params: { tamanho: [30, 1, 30], superficie: 'grama' } },
      // A group at (10, 2, -4) turned a quarter about Y, with a box in it, and a group inside it.
      { id: 'casa', tipo: 'grupo', params: {}, pose: { p: [10, 2, -4], r: [0, Math.PI / 2, 0] } },
      { id: 'mesa', tipo: 'caixa', pai: 'casa', p: [1, 0, 0], params: { tamanho: [1, 1, 1], superficie: 'madeira' } },
      { id: 'quarto', tipo: 'grupo', pai: 'casa', params: {}, pose: { p: [0, 0, 3], r: [0, 0, 0] } },
      { id: 'cama', tipo: 'caixa', pai: 'quarto', p: [0, 0, 0], params: { tamanho: [2, 0.5, 1], superficie: 'madeira' } },
      { id: 'poste', tipo: 'caixa', p: [-5, 0, 5], params: { tamanho: [0.2, 3, 0.2], superficie: 'metal' } },
    ],
    arquivos: [],
    spawns: { a: [{ p: [0, 0.2, 0], yaw: 0 }], b: [{ p: [5, 0.2, 0], yaw: 0 }], ffa: [{ p: [0, 0.2, 5], yaw: 0 }] },
    bonecos: [],
    objetos: { coletaveis: [], bruxa: null, ratos: [], peixes: [] },
  };
}

/** What a kind placed by its pose builds where its example was: a 4 x 3 x 2 box around (20, 1.5, 7). */
const probe: Probe = async () => new THREE.Box3(new THREE.Vector3(18, 0, 6), new THREE.Vector3(22, 3, 8));
const noProbe: Probe = async () => null;

describe('arrastar do Project para a Cena', () => {
  it('cai onde o mouse aponta, com X e Z na grade do passo de mover (a altura como está)', () => {
    expect(sceneSpot({ x: 1.26, y: 0.3, z: -0.74 }, 0.5)).toEqual({ at: [1.5, 0.3, -0.5], world: [1.5, 0.3, -0.5], pai: null });
    expect(sceneSpot({ x: 1.26, y: 0.3, z: -0.74 }, 0.25)).toEqual({ at: [1.25, 0.3, -0.75], world: [1.25, 0.3, -0.75], pai: null });
    expect(sceneSpot({ x: 3.333, y: 1, z: 2 }, null).at).toEqual([3.333, 1, 2]);
  });

  it('uma peça livre fica no ponto; a de pose põe o meio do que monta em cima dele; vai para o fim da lista', async () => {
    const d = map();
    const box = await dropPiece(d, 'caixa', sceneSpot({ x: 2.1, y: 0, z: 3.9 }, 0.5), { probe: noProbe, rand: () => 0.5 });
    expect(box).not.toBeNull();
    const p = box!.pecas[box!.pecas.length - 1];
    expect(p).toMatchObject({ id: 'caixa', tipo: 'caixa', p: [2, 0, 4] });
    expect(p.pai).toBeUndefined();
    expect(box!.pecas.slice(0, -1)).toEqual(d.pecas);

    // 'escada' is placed by its pose: its 4 x 3 x 2 box (middle at 20, 7) stands on (2, 0, 4).
    const st = await dropPiece(d, 'escada', sceneSpot({ x: 2, y: 0, z: 4 }, 0.5), { probe });
    const s = st!.pecas.find((x) => x.id === st!.id)!;
    expect(s.pose).toEqual({ p: [-18, 0, -3], r: [0, 0, 0] });
    expect(s.p).toBeUndefined();
  });

  it('a prévia fantasma: a caixa medida na miniatura levada ao ponto, ou um cubo de 1 m em pé nele', () => {
    const g = ghostBox({ x: 2, y: 1, z: -3 }, [-1, 0, -0.5, 1, 2, 0.5]);
    expect(g.min.toArray()).toEqual([1, 1, -3.5]);
    expect(g.max.toArray()).toEqual([3, 3, -2.5]);
    const c = ghostBox({ x: 0, y: 0, z: 0 });
    expect(c.min.toArray()).toEqual([-0.5, 0, -0.5]);
    expect(c.max.toArray()).toEqual([0.5, 1, 0.5]);
  });
});

describe('arrastar do Project para a Hierarchy', () => {
  it('na linha de um grupo: dentro dele, na origem dele; noutra linha: no grupo dela; abaixo das linhas: no topo', () => {
    const d = map();
    const casa = hierarchySpot(d, 'casa');
    expect(casa).toEqual({ at: [0, 0, 0], world: [10, 2, -4], pai: 'casa' });
    // The bed's row: into its group (the room), whose origin is 3 m along the house's turned Z.
    const quarto = hierarchySpot(d, 'cama');
    expect(quarto.pai).toBe('quarto');
    expect(quarto.at).toEqual([0, 0, 0]);
    const w = new THREE.Vector3().setFromMatrixPosition(worldPoseMatrix(d.pecas.find((p) => p.id === 'quarto')!, finder(d))!);
    expect(quarto.world).toEqual([Math.round(w.x * 1e4) / 1e4, Math.round(w.y * 1e4) / 1e4, Math.round(w.z * 1e4) / 1e4]);
    expect(quarto.world[0]).toBeCloseTo(13, 6);
    expect(hierarchySpot(d, 'poste')).toEqual({ at: [0, 0, 0], world: [0, 0, 0], pai: null });
    expect(hierarchySpot(d, null)).toEqual({ at: [0, 0, 0], world: [0, 0, 0], pai: null });
  });

  it('a peça nova é filha do grupo, na origem dele (no referencial dele), no fim dos filhos dele', async () => {
    const d = map();
    const made = await dropPiece(d, 'caixa', hierarchySpot(d, 'casa'), { probe: noProbe });
    const ids = made!.pecas.map((p) => p.id);
    // After everything inside the house (the room and the bed), before the lamp post.
    expect(ids).toEqual(['chao', 'casa', 'mesa', 'quarto', 'cama', 'caixa', 'poste']);
    const p = made!.pecas.find((x) => x.id === 'caixa')!;
    expect(p).toMatchObject({ pai: 'casa', p: [0, 0, 0] });
    // In the world it's at the house's origin.
    const at = new THREE.Vector3().setFromMatrixPosition(worldPoseMatrix(p, finder({ ...d, pecas: made!.pecas }))!);
    expect(at.x).toBeCloseTo(10, 6);
    expect(at.y).toBeCloseTo(2, 6);
    expect(at.z).toBeCloseTo(-4, 6);
    // An empty group: right after it.
    expect(insertPiece({ ...d, pecas: [...d.pecas, { id: 'vazio', tipo: 'grupo', params: {} }] }, { id: 'x', tipo: 'caixa', params: {} }, 'vazio').map((q) => q.id).slice(-2)).toEqual(['vazio', 'x']);
  });

  it('a de pose dentro de um grupo: medida sozinha (sem pai nem pose), o meio na origem do grupo', async () => {
    const d = map();
    const seen: unknown[] = [];
    const made = await dropPiece(d, 'escada', hierarchySpot(d, 'casa'), {
      probe: async (p) => {
        seen.push(p);
        return probe(p);
      },
    });
    expect(seen).toHaveLength(1);
    expect((seen[0] as { pai?: string }).pai).toBeUndefined();
    const s = made!.pecas.find((x) => x.id === made!.id)!;
    expect(s.pai).toBe('casa');
    expect(s.pose).toEqual({ p: [-20, 0, -7], r: [0, 0, 0] });
  });

  it('um rato gigante leva o lugar dele no servidor no ponto do mundo; o tipo no limite não entra', async () => {
    const d = map();
    const rat = await dropPiece(d, 'ratoGigante', hierarchySpot(d, 'casa'), { probe: noProbe });
    const rest = clone(d) as MapData;
    rat!.rest!(rest);
    expect(rest.objetos.ratos).toEqual([{ id: 'rato', p: [10, 2, -4] }]);
    // The witch: one per map.
    const withWitch: MapData = { ...d, objetos: { ...d.objetos, bruxa: [0, 0, 0] } };
    expect(await dropPiece(withWitch, 'bruxa', sceneSpot({ x: 0, y: 0, z: 0 }, 0.5), { probe: noProbe })).toBeNull();
  });

  it('um modelo GLB do mapa: o arquivo vai nos parâmetros', async () => {
    const d: MapData = { ...map(), arquivos: [{ id: 'barco', url: '/mapas/arquivos/aa.glb', sha256: 'aa', bytes: 10 }] };
    const made = await dropPiece(d, 'glb', sceneSpot({ x: 1, y: 0, z: 1 }, 0.5), { params: { arquivo: 'barco' }, probe: noProbe });
    expect(made!.pecas.at(-1)).toMatchObject({ tipo: 'glb', p: [1, 0, 1], params: { arquivo: 'barco' } });
  });
});

describe('desfazer o que foi arrastado', () => {
  it('a peça (e o lugar do servidor que veio com ela) é uma edição só, desfeita de uma vez', async () => {
    const doc = new EditorDocument(map());
    const before = clone(doc.data);
    const made = await dropPiece(doc.data, 'ratoGigante', hierarchySpot(doc.data, 'quarto'), { probe: noProbe });
    doc.setPieces(made!.pecas, made!.rest);
    expect(doc.history.size).toBe(1);
    expect(doc.piece('ratoGigante')).toMatchObject({ pai: 'quarto' });
    expect(doc.data.objetos.ratos).toHaveLength(1);
    expect(validateMapData(doc.data).ok).toBe(true);
    doc.undo();
    expect(doc.data).toEqual(before);
    doc.redo();
    expect(doc.piece('ratoGigante')).toMatchObject({ pai: 'quarto' });
  });
});
