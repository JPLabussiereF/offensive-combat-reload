// The map editor without a screen: undo and redo of every kind of edit (pieces added, changed, removed,
// several at once, and the rest of the map), the keys that do it, what each edit says to rebuild, the gizmo's
// math (a 'livre' piece keeps its own place; any other turn becomes a pose; the server's places follow), new and
// duplicated pieces, markers, and the ends and holes of walls.
import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { MAP_FORMAT, validateMapData, type MapData, type Peca } from '@shared/mapData';
import { MAP_CATALOG } from '@shared/mapCatalog';
import { applyPatch, clone, EditorDocument, newObjectId, newPieceId, newPropId } from '../editor/document';
import { History, historyKey } from '../editor/history';
import { applyHandle, handleBase, handleDelta, handleWorld, hasLinked, moveLinked } from '../editor/transform';
import { defaultParams, duplicatePiece, newPiece, removalRest, templatesFrom } from '../editor/create';
import { addMarker, markerKeys, markerPlace, removeMarker, setMarkerPlace, zombieTemplate } from '../editor/markers';
import { addOpening, handlePoints, moveHandle } from '../editor/linearHandles';
import { checkZombieMap } from '@shared/zombies';
import rua from '@shared/data/mapas/rua.json';
import halloween from '@shared/data/mapas/halloween.json';
import jardim from '@shared/data/mapas/jardim.json';
import cemiterio from '@shared/data/mapas/cemiterio.json';

function map(): MapData {
  return {
    formato: MAP_FORMAT,
    nome: 'Teste',
    cartao: { emoji: '🧪', cor: '#aabbcc' },
    ambiente: { ceu: {}, celula: 40, killY: -20 },
    pecas: [
      { id: 'chao', tipo: 'caixa', p: [0, -0.5, 0], params: { tamanho: [20, 1, 20], superficie: 'grama' } },
      { id: 'carro', tipo: 'carro', p: [2, 0, 3], yaw: 0.5, params: { cor: 0xd8342a } },
      { id: 'parede', tipo: 'parede', params: { eixo: 'x', fixo: 4, de: -3, ate: 3, espessura: 0.3, altura: 3, superficie: 'reboco', vaos: [[-0.5, 0.5, 0, 2.2]], y0: 0 } },
    ],
    arquivos: [],
    spawns: { a: [{ p: [0, 0.2, 0], yaw: 0 }], b: [{ p: [5, 0.2, 0], yaw: 0 }], ffa: [{ p: [0, 0.2, 5], yaw: 0 }] },
    bonecos: [],
    objetos: { coletaveis: [], bruxa: null, ratos: [], peixes: [] },
  };
}

const ids = (d: MapData) => d.pecas.map((p) => p.id);

describe('editor: desfazer e refazer', () => {
  it('adicionar, mudar e apagar peças voltam e vão de novo, na ordem certa', () => {
    const doc = new EditorDocument(map());
    const changes: string[][] = [];
    doc.onChange((c) => changes.push([...c.ids]));
    const original = clone(doc.data);

    doc.addPieces([{ id: 'barril', tipo: 'barril', p: [1, 0, 1], params: {} }]);
    expect(ids(doc.data)).toEqual(['chao', 'carro', 'parede', 'barril']);
    doc.editPiece({ ...doc.piece('carro')!, p: [9, 0, 9] });
    expect(doc.piece('carro')!.p).toEqual([9, 0, 9]);
    doc.removePieces(['chao', 'parede']);
    expect(ids(doc.data)).toEqual(['carro', 'barril']);

    // Every edit names only what it touched (the scene rebuilds just those).
    expect(changes).toEqual([['barril'], ['carro'], ['chao', 'parede']]);

    expect(doc.undo()).toBe(true);
    expect(ids(doc.data)).toEqual(['chao', 'carro', 'parede', 'barril']);
    expect(doc.undo()).toBe(true);
    expect(doc.piece('carro')!.p).toEqual([2, 0, 3]);
    expect(doc.undo()).toBe(true);
    expect(doc.data).toEqual(original);
    expect(doc.undo()).toBe(false);

    expect(doc.redo()).toBe(true);
    expect(doc.redo()).toBe(true);
    expect(doc.redo()).toBe(true);
    expect(ids(doc.data)).toEqual(['carro', 'barril']);
    expect(doc.piece('carro')!.p).toEqual([9, 0, 9]);
    expect(doc.redo()).toBe(false);
  });

  it('peça no meio da lista volta para o mesmo lugar; duplicar insere logo depois', () => {
    const doc = new EditorDocument(map());
    doc.removePieces(['carro']);
    doc.undo();
    expect(ids(doc.data)).toEqual(['chao', 'carro', 'parede']);
    doc.addPieces([{ id: 'carro-2', tipo: 'carro', p: [3, 0, 4], params: { cor: 1 } }], undefined, 2);
    expect(ids(doc.data)).toEqual(['chao', 'carro', 'carro-2', 'parede']);
    doc.undo();
    expect(ids(doc.data)).toEqual(['chao', 'carro', 'parede']);
  });

  it('o resto do mapa (spawns, objetos, nome) também desfaz e refaz, e campos opcionais somem de novo', () => {
    const doc = new EditorDocument(map());
    let rest = 0;
    doc.onChange((c) => (rest += c.resto ? 1 : 0));
    doc.editRest((r) => {
      r.nome = 'Outro';
      r.exclusivo = 'zumbi';
      r.spawns.a.push({ p: [1, 2, 3], yaw: 1 });
    });
    expect(doc.data.nome).toBe('Outro');
    expect(doc.data.exclusivo).toBe('zumbi');
    doc.undo();
    expect(doc.data.nome).toBe('Teste');
    expect('exclusivo' in doc.data).toBe(false);
    expect(doc.data.spawns.a).toHaveLength(1);
    doc.redo();
    expect(doc.data.spawns.a).toHaveLength(2);
    expect(rest).toBe(3);
  });

  it('uma edição nova apaga o que dava para refazer; o histórico tem limite', () => {
    const doc = new EditorDocument(map());
    doc.editPiece({ ...doc.piece('carro')!, yaw: 1 });
    doc.undo();
    expect(doc.history.canRedo).toBe(true);
    doc.editPiece({ ...doc.piece('carro')!, yaw: 2 });
    expect(doc.history.canRedo).toBe(false);
    const h = new History(3);
    for (let i = 0; i < 5; i++) h.push({ pecas: [] });
    expect(h.size).toBe(3);
  });

  it('alterações não salvas: o documento sabe quando está igual ao salvo', () => {
    const doc = new EditorDocument(map());
    expect(doc.dirty).toBe(false);
    doc.editPiece({ ...doc.piece('carro')!, yaw: 1 });
    expect(doc.dirty).toBe(true);
    doc.markSaved();
    expect(doc.dirty).toBe(false);
    doc.undo();
    expect(doc.dirty).toBe(true);
    doc.redo();
    expect(doc.dirty).toBe(false);
  });

  it('applyPatch é o próprio inverso', () => {
    const d = map();
    const before = clone(d);
    const p = { pecas: [{ id: 'carro', before: { index: 1, peca: clone(d.pecas[1]) }, after: null }, { id: 'novo', before: null, after: { index: 0, peca: { id: 'novo', tipo: 'barril', p: [0, 0, 0], params: {} } as Peca } }] };
    applyPatch(d, p, 'forward');
    expect(ids(d)).toEqual(['novo', 'chao', 'parede']);
    applyPatch(d, p, 'back');
    expect(d).toEqual(before);
  });

  it('teclas: Ctrl+Z desfaz; Ctrl+Y e Ctrl+Shift+Z refazem; sem Ctrl, nada', () => {
    const k = (key: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) => historyKey({ key, ctrlKey: false, metaKey: false, shiftKey: false, ...o });
    expect(k('z', { ctrlKey: true })).toBe('undo');
    expect(k('Z', { ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(k('y', { ctrlKey: true })).toBe('redo');
    expect(k('z', { metaKey: true })).toBe('undo');
    expect(k('z')).toBeNull();
    expect(k('x', { ctrlKey: true })).toBeNull();
  });
});

describe('editor: o gizmo nas peças', () => {
  const at = (p: Peca, pivot = new THREE.Vector3()) => handleBase(p, pivot);
  const moved = (base: THREE.Matrix4, t: [number, number, number], q = new THREE.Quaternion()) => new THREE.Matrix4().compose(new THREE.Vector3(...t), q, new THREE.Vector3(1, 1, 1)).multiply(new THREE.Matrix4().extractRotation(base));

  it('peça livre movida e girada no eixo vertical continua só com p e yaw', () => {
    const car = map().pecas[1];
    const base = at(car);
    const world = new THREE.Matrix4().compose(new THREE.Vector3(5, 0, 7), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.2), new THREE.Vector3(1, 1, 1));
    const next = applyHandle(car, base, world);
    expect(next.p).toEqual([5, 0, 7]);
    expect(next.yaw).toBeCloseTo(1.2, 6);
    expect(next.pose).toBeUndefined();
    // Same place: nothing changes.
    expect(applyHandle(car, base, handleWorld(car, base))).toEqual(car);
  });

  it('peça livre inclinada ganha pose; voltar a ficar em pé tira a pose', () => {
    const car = map().pecas[1];
    const base = at(car);
    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0.5, 0));
    const world = new THREE.Matrix4().compose(new THREE.Vector3(2, 0, 3), tilt, new THREE.Vector3(1, 1, 1));
    const tilted = applyHandle(car, base, world);
    expect(tilted.p).toEqual(car.p);
    expect(tilted.pose).toBeDefined();
    // The handle is where the gizmo left it.
    const back = handleWorld(tilted, at(tilted));
    const t = new THREE.Vector3().setFromMatrixPosition(back);
    expect(t.distanceTo(new THREE.Vector3(2, 0, 3))).toBeLessThan(1e-3);
    const upright = applyHandle(tilted, at(tilted), new THREE.Matrix4().makeTranslation(1, 0, 1));
    expect(upright.pose).toBeUndefined();
    expect(upright.p).toEqual([1, 0, 1]);
    expect(upright.yaw).toBe(0);
  });

  it('parede (linear) e telhado (fixa) movidos e girados em ângulo livre: só a pose muda', () => {
    const wall = map().pecas[2];
    const pivot = new THREE.Vector3(0, 1.5, 4);
    const base = at(wall, pivot);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.77, -0.05));
    const next = applyHandle(wall, base, moved(base, [3, 1.5, 6], q));
    expect(next.params).toEqual(wall.params);
    expect(next.p).toBeUndefined();
    expect(next.pose).toBeDefined();
    // The handle lands where it was let go.
    const w = handleWorld(next, base);
    expect(new THREE.Vector3().setFromMatrixPosition(w).distanceTo(new THREE.Vector3(3, 1.5, 6))).toBeLessThan(1e-3);
    expect(validateMapData({ ...map(), pecas: [next] }).ok).toBe(true);
  });

  it('a bruxa, o rato e o coletável seguem a peça', () => {
    const d = map();
    const witch: Peca = { id: 'bruxa', tipo: 'bruxa', p: [0, 0, 0], params: {}, prop: 'bruxa' };
    d.pecas.push(witch);
    d.objetos.bruxa = [0, 0, 0];
    expect(hasLinked(witch, d)).toBe(true);
    const base = at(witch);
    const world = new THREE.Matrix4().makeTranslation(4, 0, -2);
    const delta = handleDelta(handleWorld(witch, base), world);
    const doc = new EditorDocument(d);
    doc.editPiece(applyHandle(witch, base, world), (r) => moveLinked(r, witch, delta));
    expect(doc.data.objetos.bruxa).toEqual([4, 0, -2]);
    doc.undo();
    expect(doc.data.objetos.bruxa).toEqual([0, 0, 0]);
  });
});

describe('editor: peças novas, duplicadas e apagadas', () => {
  const templates = templatesFrom([rua, jardim, halloween, cemiterio] as unknown as MapData[]);

  it('cada tipo do catálogo vira uma peça nova válida (exemplo dos oficiais ou padrões do esquema)', () => {
    for (const tipo of Object.keys(MAP_CATALOG)) {
      if (tipo === 'glb' || tipo === 'peixes') continue;
      const d = map();
      const made = newPiece(d, tipo, [1, 0, 1], templates.get(tipo), () => 0.5);
      expect(made).not.toBeNull();
      d.pecas.push(made!.peca);
      if (made!.rest) made!.rest(d as never);
      if (made!.peca.coletavel) delete made!.peca.coletavel;
      const errs = validateMapData(d).erros;
      expect({ tipo, errs }).toEqual({ tipo, errs: [] });
    }
  });

  it('ids, ids de piada e de objetos novos não repetem', () => {
    const d = map();
    expect(newPieceId(d, 'carro')).toBe('carro-2');
    expect(newPieceId(d, 'barril')).toBe('barril');
    d.pecas.push({ id: 'h', tipo: 'hidrante', p: [0, 0, 0], params: {}, prop: 'hidrante:1' });
    expect(newPropId(d, 'hidrante', 'hidrante:0')).toBe('hidrante:2');
    expect(newPropId(d, 'bruxa')).toBe('bruxa');
    d.pecas.push({ id: 'b', tipo: 'bruxa', p: [0, 0, 0], params: {}, prop: 'bruxa' });
    expect(newPropId(d, 'bruxa')).toBeNull();
    d.objetos.ratos.push({ id: 'rato', p: [0, 0, 0] });
    expect(newObjectId(d, 'rato')).toBe('rato:2');
  });

  it('rato gigante novo traz o seu lugar nos objetos; apagar leva junto; a bruxa idem', () => {
    const doc = new EditorDocument(map());
    const rat = newPiece(doc.data, 'ratoGigante', [3, 0, 3])!;
    doc.addPieces([rat.peca], rat.rest);
    expect(doc.data.objetos.ratos).toEqual([{ id: rat.peca.params.id as string, p: [3, 0, 3] }]);
    const witch = newPiece(doc.data, 'bruxa', [1, 0, 1])!;
    doc.addPieces([witch.peca], witch.rest);
    expect(doc.data.objetos.bruxa).toEqual([1, 0, 1]);
    expect(validateMapData(doc.data).erros).toEqual([]);
    doc.removePieces([rat.peca.id, witch.peca.id], removalRest(doc.data, [rat.peca.id, witch.peca.id]));
    expect(doc.data.objetos.ratos).toEqual([]);
    expect(doc.data.objetos.bruxa).toBeNull();
    expect(validateMapData(doc.data).erros).toEqual([]);
    doc.undo();
    expect(doc.data.objetos.bruxa).toEqual([1, 0, 1]);
  });

  it('duplicar: id e piada novos, ao lado; peça fixa vai pela pose', () => {
    const d = map();
    const copy = duplicatePiece(d, d.pecas[1])!;
    expect(copy.peca.id).toBe('carro-2');
    expect(copy.peca.p).toEqual([3, 0, 4]);
    const wall = duplicatePiece(d, d.pecas[2])!;
    expect(wall.peca.params).toEqual(d.pecas[2].params);
    expect(wall.peca.pose).toEqual({ p: [1, 0, 1], r: [0, 0, 0] });
  });

  it('parâmetros padrão cobrem os obrigatórios do esquema', () => {
    const p = defaultParams(MAP_CATALOG.telhado.params);
    expect(p.x0).toBe(-2);
    expect(p.x1).toBe(2);
    expect(p.superficie).toBe('telhado');
    expect('aba' in p).toBe(false);
  });
});

describe('editor: marcadores', () => {
  it('spawns, bonecos, coletáveis, ratos e peixes: pôr, mover, girar e tirar', () => {
    const doc = new EditorDocument(map());
    let key = null as string | null;
    doc.editRest((r) => (key = addMarker(r, 'spawnB', [1, 0, 2])));
    expect(key).toBe('spawn:b:1');
    doc.editRest((r) => setMarkerPlace(r, key!, { p: [4, 0, 4], yaw: 1 }));
    expect(markerPlace(doc.data, key!)).toEqual({ p: [4, 0, 4], yaw: 1 });
    for (const k of ['boneco', 'cereja', 'biscoito', 'rato', 'peixe'] as const) doc.editRest((r) => addMarker(r, k, [0, 0, 0]));
    expect(markerKeys(doc.data)).toEqual(['spawn:a:0', 'spawn:b:0', 'spawn:b:1', 'spawn:ffa:0', 'boneco:0', 'coletavel:0', 'coletavel:1', 'rato:0', 'peixe:0']);
    expect(doc.data.objetos.peixes[0].id).toBe('koi:0');
    expect(validateMapData(doc.data).erros).toEqual([]);
    doc.editRest((r) => removeMarker(r, 'spawn:b:1'));
    expect(doc.data.spawns.b).toHaveLength(1);
    doc.undo();
    expect(doc.data.spawns.b).toHaveLength(2);
  });

  it('modo zumbi: o modelo inicial passa na conferência; brecha fica no muro; canto leva as brechas junto', () => {
    const z = zombieTemplate([0, 0, 0]);
    expect(checkZombieMap('novo', z)).toEqual([]);
    const d = { ...map(), exclusivo: 'zumbi' as const, zumbi: z };
    expect(validateMapData(d).erros).toEqual([]);
    const r = clone(d);
    setMarkerPlace(r, 'zumbi:barricada:0', { p: [3, 0, -11] });
    expect(r.zumbi.barricadas[0].centro).toEqual([3, 0, -12]);
    setMarkerPlace(r, 'zumbi:dentro:0', { p: [-14, 0, -14] });
    expect(r.zumbi.dentro).toEqual([-14, -14, 12, 12]);
    expect(r.zumbi.barricadas[0].centro).toEqual([3, 0, -14]);
    expect(checkZombieMap('novo', r.zumbi)).toEqual([]);
    expect(removeMarker(r, 'zumbi:caixa')).toBe(false);
  });
});

describe('editor: pontas e vãos', () => {
  it('as pontas de uma parede deslizam no eixo dela; os vãos têm dois lados', () => {
    const wall = map().pecas[2];
    const hs = handlePoints(wall);
    expect(hs.map((h) => h.key)).toEqual(['de', 'ate', 'vao:0:0', 'vao:0:1']);
    expect(hs[0].p).toEqual([-3, 0, 4]);
    const longer = moveHandle(wall, 'ate', [5.25, 9, 99]);
    expect(longer.params.ate).toBe(5.25);
    expect(longer.params.fixo).toBe(4);
    const wider = moveHandle(wall, 'vao:0:1', [1.5, 1, 4]);
    expect(wider.params.vaos).toEqual([[-0.5, 1.5, 0, 2.2]]);
    // Dragged past the other end: the ends keep their order.
    const swapped = moveHandle(wall, 'de', [4, 0, 4]);
    expect([swapped.params.de, swapped.params.ate]).toEqual([3, 4]);
  });

  it('um vão novo no meio: porta na parede, brecha de 2 m na cerca', () => {
    const wall = map().pecas[2];
    expect(addOpening(wall)!.params.vaos).toEqual([[-0.5, 0.5, 0, 2.2], [-0.5, 0.5, 0, 2.2]]);
    const fence: Peca = { id: 'g', tipo: 'grade', params: { eixo: 'z', fixo: 1, de: 0, ate: 10, vaos: [] } };
    expect(addOpening(fence)!.params.vaos).toEqual([[4, 6]]);
    expect(handlePoints(fence)[1].p).toEqual([1, 0, 10]);
  });
});
