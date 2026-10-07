// The Hierarchy's groups in the editor, without a screen (PF-6 Revisions 01): grouping a selection, putting
// pieces in and out of groups and reordering them (they stay where they are in the world), moving, turning and
// scaling a group (its children go along, and the witch's spot with the witch), duplicating and deleting with
// the children, and undoing and redoing each of those as one edit that names only what changed.
import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { MAP_FORMAT, validateMapData, type MapData, type Peca } from '@shared/mapData';
import { EditorDocument, clone, keptInOrder } from '../editor/document';
import { childrenOf, duplicateTree, linkedRest, makeGroup, moveInto, moveTree, parentFrame, removalOf, scaleTree, subtree, topLevel } from '../editor/groups';
import { handleBase, handleWorld } from '../editor/transform';
import { worldPoseMatrix } from '../world/pose';

function map(): MapData {
  return {
    formato: MAP_FORMAT,
    nome: 'Grupos',
    cartao: { emoji: '🧪', cor: '#aabbcc' },
    ambiente: { ceu: {}, celula: 40, killY: -20 },
    pecas: [
      { id: 'chao', tipo: 'caixa', p: [0, -0.5, 0], params: { tamanho: [20, 1, 20], superficie: 'grama' } },
      { id: 'carro', tipo: 'carro', p: [2, 0, 3], yaw: 0.5, params: { cor: 0xd8342a } },
      { id: 'parede', tipo: 'parede', params: { eixo: 'x', fixo: 4, de: -3, ate: 3, espessura: 0.3, altura: 3, superficie: 'reboco', vaos: [], y0: 0 } },
      { id: 'barril', tipo: 'caixote', p: [-3, 0, -3], escala: 1.5, params: {} },
      { id: 'bruxa', tipo: 'bruxa', p: [6, 0, 6], yaw: 0, params: {}, prop: 'bruxa' },
    ],
    arquivos: [],
    spawns: { a: [{ p: [0, 0.2, 0], yaw: 0 }], b: [{ p: [5, 0.2, 0], yaw: 0 }], ffa: [{ p: [0, 0.2, 5], yaw: 0 }] },
    bonecos: [],
    objetos: { coletaveis: [], bruxa: [6, 0, 6], ratos: [], peixes: [] },
  };
}

const ids = (d: MapData) => d.pecas.map((p) => p.id);
const ZERO = new THREE.Vector3();
/** Where a piece's handle is in the world. */
const worldOf = (d: MapData, id: string) => {
  const p = d.pecas.find((x) => x.id === id)!;
  return handleWorld(p, handleBase(p, ZERO), parentFrame(d, p));
};
const near = (a: THREE.Matrix4, b: THREE.Matrix4, eps = 1e-3) => a.elements.every((v, i) => Math.abs(v - b.elements[i]) < eps);

describe('editor: grupos', () => {
  it('agrupar a seleção cria o grupo no meio dela, no lugar da primeira peça, e as peças não saem do lugar', () => {
    const d = map();
    const before = { carro: worldOf(d, 'carro'), parede: worldOf(d, 'parede') };
    const g = makeGroup(d, ['parede', 'carro'], [2, 0, 3]);
    const doc = new EditorDocument(d);
    doc.setPieces(g.pecas);
    expect(ids(doc.data)).toEqual(['chao', g.id, 'carro', 'parede', 'barril', 'bruxa']);
    expect(doc.piece(g.id)).toMatchObject({ tipo: 'grupo', pose: { p: [2, 0, 3], r: [0, 0, 0] } });
    expect(childrenOf(doc.data, g.id).map((p) => p.id)).toEqual(['carro', 'parede']);
    expect(near(worldOf(doc.data, 'carro'), before.carro)).toBe(true);
    expect(near(worldOf(doc.data, 'parede'), before.parede)).toBe(true);
    // A 'livre' piece keeps its own place, now in the group's frame.
    expect(doc.piece('carro')!.p).toEqual([0, 0, 0]);
    expect(doc.piece('carro')!.yaw).toBeCloseTo(0.5, 6);
    expect(validateMapData(doc.data).erros).toEqual([]);
    // Undo takes the group away and the pieces back as they were; redo makes it again.
    doc.undo();
    expect(doc.data).toEqual(map());
    doc.redo();
    expect(doc.piece('carro')!.pai).toBe(g.id);
  });

  it('mover e girar o grupo leva os filhos (e o lugar da bruxa com a bruxa), num desfazer só', () => {
    const d = map();
    const made = makeGroup(d, ['carro', 'bruxa'], [4, 0, 4]);
    const doc = new EditorDocument(d);
    doc.setPieces(made.pecas);
    const before = { carro: worldOf(doc.data, 'carro'), bruxa: worldOf(doc.data, 'bruxa') };
    const delta = new THREE.Matrix4().compose(new THREE.Vector3(10, 0, -2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 3), new THREE.Vector3(1, 1, 1));
    const changes: string[][] = [];
    doc.onChange((c) => changes.push([...c.ids]));
    const next = moveTree(doc.data, [made.id], delta);
    doc.setPieces(next, linkedRest(doc.data, next));
    // Only the group changed: its children follow through its frame.
    expect(changes).toEqual([[made.id]]);
    expect(doc.piece('carro')!.p).toEqual([-2, 0, -1]);
    expect(near(worldOf(doc.data, 'carro'), delta.clone().multiply(before.carro))).toBe(true);
    expect(near(worldOf(doc.data, 'bruxa'), delta.clone().multiply(before.bruxa))).toBe(true);
    const spot = new THREE.Vector3(6, 0, 6).applyMatrix4(delta);
    expect(doc.data.objetos.bruxa![0]).toBeCloseTo(spot.x, 3);
    expect(doc.data.objetos.bruxa![2]).toBeCloseTo(spot.z, 3);
    // Where the loader builds the child: the group's pose times its own place.
    const frame = worldPoseMatrix(doc.piece(made.id)!, (id) => doc.piece(id));
    expect(near(frame!, delta.clone().multiply(new THREE.Matrix4().makeTranslation(4, 0, 4)))).toBe(true);
    doc.undo();
    expect(doc.data.objetos.bruxa).toEqual([6, 0, 6]);
    expect(doc.piece(made.id)!.pose).toEqual({ p: [4, 0, 4], r: [0, 0, 0] });
  });

  it('pôr numa peça dentro e fora de grupos e reordenar mantém o lugar no mundo e só muda o que precisa', () => {
    const d = map();
    const g = makeGroup(d, [], [1, 0, 1]);
    const doc = new EditorDocument(d);
    doc.setPieces(g.pecas);
    // A turned group: what goes in is worked out in its frame.
    const turned = clone(doc.piece(g.id)!);
    turned.pose = { p: [1, 2, 1], r: [0.4, 1.1, 0] };
    doc.editPiece(turned);
    const before = worldOf(doc.data, 'barril');
    const into = moveInto(doc.data, ['barril'], g.id)!;
    doc.setPieces(into);
    expect(doc.piece('barril')!.pai).toBe(g.id);
    // Tilted in its group: it keeps its place by a pose.
    expect(doc.piece('barril')!.pose).toBeDefined();
    expect(near(worldOf(doc.data, 'barril'), before)).toBe(true);
    expect(doc.piece('barril')!.escala).toBeCloseTo(1.5, 6);
    // Out again (dropped before the car, at the top).
    const out = moveInto(doc.data, ['barril'], null, { before: 'carro' })!;
    const changes: { ids: string[]; ordem: boolean }[] = [];
    doc.onChange((c) => changes.push({ ids: [...c.ids], ordem: c.ordem }));
    doc.setPieces(out);
    expect(ids(doc.data).indexOf('barril')).toBe(ids(doc.data).indexOf('carro') - 1);
    expect(doc.piece('barril')!.pai).toBeUndefined();
    expect(near(worldOf(doc.data, 'barril'), before)).toBe(true);
    // Reordering alone: nothing to build again, only the order changes.
    const order = moveInto(doc.data, ['chao'], null, { after: 'bruxa' })!;
    doc.setPieces(order);
    expect(ids(doc.data).indexOf('chao')).toBe(ids(doc.data).indexOf('bruxa') + 1);
    expect(changes[1]).toEqual({ ids: [], ordem: true });
    doc.undo();
    expect(ids(doc.data)[0]).toBe('chao');
    doc.undo();
    expect(doc.piece('barril')!.pai).toBe(g.id);
    doc.redo();
    doc.redo();
    expect(ids(doc.data).indexOf('chao')).toBe(ids(doc.data).indexOf('bruxa') + 1);
  });

  it('um grupo não entra nele mesmo nem num grupo de dentro dele', () => {
    const d = map();
    const a = makeGroup(d, ['carro'], [0, 0, 0]);
    const d2 = { ...d, pecas: a.pecas };
    const b = makeGroup(d2, ['carro'], [0, 0, 0]);
    const d3 = { ...d, pecas: b.pecas };
    expect(childrenOf(d3, a.id).map((p) => p.id)).toEqual([b.id]);
    expect(moveInto(d3, [a.id], a.id)).toBeNull();
    expect(moveInto(d3, [a.id], b.id)).toBeNull();
    expect(moveInto(d3, ['carro'], 'parede')).toBeNull();
    expect(topLevel(d3, [a.id, 'carro', 'parede'])).toEqual([a.id, 'parede']);
    expect([...subtree(d3, [a.id])].sort()).toEqual([a.id, b.id, 'carro'].sort());
  });

  it('escalar o grupo espalha os filhos a partir da origem dele e aumenta o que escala', () => {
    const d = map();
    const g = makeGroup(d, ['barril', 'carro'], [0, 0, 0]);
    const data = { ...d, pecas: g.pecas };
    const next = scaleTree(data, [g.id], new THREE.Vector3(0, 0, 0), 2, () => new THREE.Vector3());
    const after = { ...data, pecas: next };
    const barril = after.pecas.find((p) => p.id === 'barril')!;
    const carro = after.pecas.find((p) => p.id === 'carro')!;
    expect(barril.p).toEqual([-6, 0, -6]);
    expect(barril.escala).toBeCloseTo(3, 6);
    // The car doesn't scale (its kind has no Peca.escala): it only moves.
    expect(carro.p).toEqual([4, 0, 6]);
    expect(carro.escala).toBeUndefined();
    expect(after.pecas.find((p) => p.id === g.id)!.pose).toBeUndefined();
  });

  it('duplicar o grupo copia os filhos para o grupo novo; apagar leva os filhos', () => {
    const d = map();
    const g = makeGroup(d, ['carro', 'barril'], [0, 0, 0]);
    const data = { ...d, pecas: g.pecas };
    const dup = duplicateTree(data, [g.id]);
    expect(dup.copies).toHaveLength(1);
    const copy = dup.pecas.find((p) => p.id === dup.copies[0])!;
    expect(copy.tipo).toBe('grupo');
    const kids = dup.pecas.filter((p) => p.pai === copy.id).map((p) => p.tipo);
    expect(kids.sort()).toEqual(['caixote', 'carro']);
    // The copy stands a meter aside (its group's pose); the children keep their places in it.
    expect(copy.pose?.p).toEqual([1, 0, 1]);
    expect(validateMapData({ ...data, pecas: dup.pecas }).erros).toEqual([]);
    expect(removalOf(data, [g.id]).sort()).toEqual([g.id, 'barril', 'carro'].sort());
    const doc = new EditorDocument(data);
    doc.removePieces(removalOf(data, [g.id]));
    expect(ids(doc.data)).toEqual(['chao', 'parede', 'bruxa']);
    doc.undo();
    expect(doc.data.pecas).toEqual(data.pecas);
  });

  it('a lista nova vira um patch com só o que mudou de lugar (a sequência mais longa que fica em ordem)', () => {
    expect([...keptInOrder([0, 1, 2, 3])].sort()).toEqual([0, 1, 2, 3]);
    expect([...keptInOrder([3, 0, 1, 2])].sort()).toEqual([0, 1, 2]);
    expect([...keptInOrder([-1, 2, 0, 1])].sort()).toEqual([0, 1]);
    const doc = new EditorDocument(map());
    let seen: Peca[] = [];
    doc.onChange(() => (seen = clone(doc.data.pecas)));
    const p = doc.data.pecas;
    doc.setPieces([p[4], p[0], p[1], p[2], p[3]]);
    expect(doc.history.size).toBe(1);
    expect(ids({ ...doc.data, pecas: seen })).toEqual(['bruxa', 'chao', 'carro', 'parede', 'barril']);
  });
});
