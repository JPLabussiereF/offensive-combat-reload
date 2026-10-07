// Copy and paste in the editor (PF-6 Revisions 01, etapa 3), without a screen: the copies get new ids (and gag
// ids, and a rat its own server place), a copied group's children hang from the copied group, a top piece goes
// back into its group (or to the top, where it was, when the group is gone), the copies move by the paste's
// offset, the snapshot ignores later edits, and the whole paste is one edit undone at once.
import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { MAP_FORMAT, validateMapData, type MapData, type Peca } from '@shared/mapData';
import { EditorDocument, clone } from '../editor/document';
import { clipAnchor, copyPieces, pastePieces } from '../editor/clipboard';
import { makeGroup, moveTree, parentFrame, removalOf } from '../editor/groups';
import { handleBase, handleWorld } from '../editor/transform';

function map(): MapData {
  return {
    formato: MAP_FORMAT,
    nome: 'Colar',
    cartao: { emoji: '🧪', cor: '#aabbcc' },
    ambiente: { ceu: {}, celula: 40, killY: -20 },
    pecas: [
      { id: 'chao', tipo: 'caixa', p: [0, -0.5, 0], params: { tamanho: [30, 1, 30], superficie: 'grama' } },
      { id: 'carro', tipo: 'carro', p: [2, 0, 3], yaw: 0.5, params: { cor: 0xd8342a } },
      { id: 'barril', tipo: 'caixote', p: [-3, 0, -3], escala: 1.5, params: {}, nome: 'Barril' },
      { id: 'hidrante', tipo: 'hidrante', p: [4, 0, -4], params: {}, prop: 'hidrante:0' },
      { id: 'rato', tipo: 'ratoGigante', p: [-6, 0, 6], yaw: 0, params: { id: 'rato' } },
      { id: 'bruxa', tipo: 'bruxa', p: [6, 0, 6], yaw: 0, params: {}, prop: 'bruxa' },
    ],
    arquivos: [],
    spawns: { a: [{ p: [0, 0.2, 0], yaw: 0 }], b: [{ p: [5, 0.2, 0], yaw: 0 }], ffa: [{ p: [0, 0.2, 5], yaw: 0 }] },
    bonecos: [],
    objetos: { coletaveis: [], bruxa: [6, 0, 6], ratos: [{ id: 'rato', p: [-6, 0, 6] }], peixes: [] },
  };
}

const ZERO = new THREE.Vector3();
/** Where a piece's handle is in the world. */
const worldPos = (d: MapData, id: string) => {
  const p = d.pecas.find((x) => x.id === id)!;
  return new THREE.Vector3().setFromMatrixPosition(handleWorld(p, handleBase(p, ZERO), parentFrame(d, p)));
};
const near = (a: THREE.Vector3, b: THREE.Vector3, eps = 1e-3) => expect(a.distanceTo(b)).toBeLessThan(eps);
const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);

/** The map with the car and the crate in a group turned 90° (its origin at (10, 0, 0)). */
function grouped() {
  const d = map();
  const g = makeGroup(d, ['carro', 'barril'], [10, 0, 0]);
  d.pecas = g.pecas;
  const grupo = d.pecas.find((p) => p.id === g.id)!;
  d.pecas = moveTree(d, [g.id], new THREE.Matrix4().makeRotationY(Math.PI / 2).premultiply(T(10, 0, 0)).multiply(T(-10, 0, 0)));
  return { d, gid: grupo.id };
}

describe('copiar e colar', () => {
  it('colar um grupo: ids novos, os filhos penduram no grupo novo, tudo deslocado; um desfazer tira tudo', () => {
    const { d, gid } = grouped();
    const doc = new EditorDocument(d);
    const clip = copyPieces(doc.data, [gid])!;
    expect(clip.tops).toEqual([gid]);
    expect(clip.pecas.map((p) => p.id).sort()).toEqual(['barril', 'carro', gid].sort());
    const before = doc.data.pecas.map((p) => p.id);
    const made = pastePieces(doc.data, clip, T(0, 0, 20));
    expect(made.skipped).toEqual([]);
    expect(made.copies.length).toBe(1);
    const copyId = made.copies[0];
    expect(before).not.toContain(copyId);
    doc.setPieces(made.pecas, made.rest);
    const kids = doc.data.pecas.filter((p) => p.pai === copyId);
    expect(kids.map((p) => p.tipo).sort()).toEqual(['caixote', 'carro']);
    for (const k of kids) expect(before).not.toContain(k.id);
    // The names come along; the copies are where the originals are, 20 m further on z.
    expect(kids.find((k) => k.tipo === 'caixote')!.nome).toBe('Barril');
    near(worldPos(doc.data, kids.find((k) => k.tipo === 'carro')!.id), worldPos(doc.data, 'carro').add(new THREE.Vector3(0, 0, 20)));
    near(worldPos(doc.data, kids.find((k) => k.tipo === 'caixote')!.id), worldPos(doc.data, 'barril').add(new THREE.Vector3(0, 0, 20)));
    expect(validateMapData(doc.data).ok).toBe(true);
    expect(doc.undo()).toBe(true);
    expect(doc.data.pecas.map((p) => p.id)).toEqual(before);
    doc.redo();
    expect(doc.data.pecas.filter((p) => p.pai === copyId).length).toBe(2);
  });

  it('uma peça de dentro de um grupo volta para o mesmo grupo; se ele sumiu, vai para o topo no mesmo lugar do mundo', () => {
    const { d, gid } = grouped();
    const clip = copyPieces(d, ['carro'])!;
    const where = worldPos(d, 'carro');
    const inGroup = pastePieces(d, clip, T(1, 0, 1));
    const copy = inGroup.pecas.find((p) => p.id === inGroup.copies[0])!;
    expect(copy.pai).toBe(gid);
    near(worldPos({ ...d, pecas: inGroup.pecas }, copy.id), where.clone().add(new THREE.Vector3(1, 0, 1)));
    // The group deleted (with what's inside it), then pasted: at the top, where the car was in the world.
    const gone = { ...d, pecas: d.pecas.filter((p) => !removalOf(d, [gid]).includes(p.id)) };
    const atTop = pastePieces(gone, clip);
    const c2 = atTop.pecas.find((p) => p.id === atTop.copies[0])!;
    expect(c2.pai).toBeUndefined();
    near(worldPos({ ...gone, pecas: atTop.pecas }, c2.id), where);
    expect(validateMapData({ ...gone, pecas: atTop.pecas }).ok).toBe(true);
  });

  it('a cópia guardada não muda com o que se edita depois', () => {
    const d = map();
    const clip = copyPieces(d, ['carro'])!;
    d.pecas = d.pecas.map((p) => (p.id === 'carro' ? { ...clone(p), p: [9, 9, 9] } : p));
    const made = pastePieces(d, clip, T(0, 0, 0));
    expect(made.pecas.find((p) => p.id === made.copies[0])!.p).toEqual([2, 0, 3]);
  });

  it('colar duas vezes: ids e ids de piada diferentes a cada vez; o rato ganha o seu lugar; a bruxa (uma só) não é colada', () => {
    const d = map();
    const clip = copyPieces(d, ['hidrante', 'rato', 'bruxa'])!;
    const doc = new EditorDocument(d);
    const first = pastePieces(doc.data, clip, T(0, 0, 10));
    expect(first.skipped).toEqual(['bruxa']);
    doc.setPieces(first.pecas, first.rest);
    const second = pastePieces(doc.data, clip, T(0, 0, 20));
    doc.setPieces(second.pecas, second.rest);
    const ids = doc.data.pecas.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const props = doc.data.pecas.map((p) => p.prop).filter(Boolean);
    expect(new Set(props).size).toBe(props.length);
    const rats = doc.data.pecas.filter((p) => p.tipo === 'ratoGigante');
    expect(rats.length).toBe(3);
    const ratIds = rats.map((p) => p.params.id as string);
    expect(new Set(ratIds).size).toBe(3);
    // Each rat's server place is where its piece is.
    for (const r of rats) {
      const place = doc.data.objetos.ratos.find((x) => x.id === r.params.id)!;
      expect(place.p).toEqual(r.p!);
    }
    expect(validateMapData(doc.data).ok).toBe(true);
    // Undoing the second paste takes its rat's place away too.
    doc.undo();
    expect(doc.data.objetos.ratos.length).toBe(2);
  });

  it('o ponto de colar é o fundo do meio da caixa copiada; sem caixa, não há', () => {
    const d = map();
    const box = new THREE.Box3(new THREE.Vector3(1, 0, 2), new THREE.Vector3(3, 2, 4));
    near(clipAnchor(copyPieces(d, ['carro'], box)!)!, new THREE.Vector3(2, 0, 3));
    expect(clipAnchor(copyPieces(d, ['carro'])!)).toBeNull();
    expect(copyPieces(d, [])).toBeNull();
  });

  it('o que não é peça do mapa não é copiado', () => {
    const d = map();
    expect(copyPieces(d, ['nada'])).toBeNull();
    const kept: Peca[] = clone(d.pecas);
    pastePieces(d, copyPieces(d, ['carro'])!);
    expect(d.pecas).toEqual(kept);
  });
});
