// Groups of pieces (PF-6 Revisions 01): a piece may hang from a group (Peca.pai, the id of a piece of kind
// 'grupo'), whose pose is its frame. The data checks the parents (a group of the map, no loops, not too deep),
// and the loader (the game's, the editor's and the server's, which is the game's headless) builds a child where
// its groups' poses and its own put it together; a group builds nothing, and a group that moves nothing leaves
// its children exactly where they were.
import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { MAP_FORMAT, MAX_GROUP_DEPTH, validateMapData, type MapData, type Peca, type Pose } from '@shared/mapData';
import { buildHeadless } from '../../tools/snapshot-mapas';
import { fakeRenderer, loadClient, silentSfx } from '../../tools/headless';

const { buildMapFromData } = await loadClient('client/world/mapLoader.ts');
const { poseMatrix, worldPoseMatrix, groupMatrix } = await loadClient('client/world/pose.ts');

const WALL: Peca = { id: 'parede', tipo: 'parede', params: { eixo: 'x', fixo: 0, de: -4, ate: 4, espessura: 0.3, altura: 3, superficie: 'reboco', vaos: [[-0.5, 0.5, 0, 2.2]], y0: 0 } };
const BOX: Peca = { id: 'caixa', tipo: 'caixa', p: [3, 0.5, 2], yaw: 0.4, params: { tamanho: [1, 1, 1], superficie: 'madeira' } };
const group = (id: string, pose?: Pose, pai?: string): Peca => ({ id, tipo: 'grupo', params: {}, ...(pose ? { pose } : {}), ...(pai ? { pai } : {}) });
const child = (p: Peca, pai: string): Peca => ({ ...structuredClone(p), pai });

function mapWith(pecas: Peca[]): MapData {
  return {
    formato: MAP_FORMAT,
    nome: 'Grupos',
    cartao: { emoji: '🧪', cor: '#aabbcc' },
    ambiente: { ceu: {}, celula: 40, killY: -20 },
    pecas,
    arquivos: [],
    spawns: { a: [{ p: [0, 0, -6], yaw: 0 }], b: [{ p: [0, 0, 6], yaw: 0 }], ffa: [{ p: [6, 0, 0], yaw: 0 }] },
    bonecos: [],
    objetos: { coletaveis: [], bruxa: null, ratos: [], peixes: [] },
  };
}

const build = (data: MapData, modo: 'jogo' | 'editor' = 'jogo') => buildHeadless((physics, scene) => buildMapFromData(data, { physics, scene, renderer: fakeRenderer, sfx: silentSfx, modo }));

type Col = { t: THREE.Vector3; q: THREE.Quaternion; shape: number };
function colliders(physics: any): Col[] {
  const out: Col[] = [];
  physics.world.forEachCollider((c: any) => {
    const t = c.translation();
    const r = c.rotation();
    out.push({ t: new THREE.Vector3(t.x, t.y, t.z), q: new THREE.Quaternion(r.x, r.y, r.z, r.w), shape: c.shapeType() });
  });
  return out;
}

function sameColliders(a: Col[], b: Col[], eps = 1e-5) {
  expect(b.length).toBe(a.length);
  a.forEach((c, i) => {
    expect(b[i].shape).toBe(c.shape);
    expect(c.t.distanceTo(b[i].t)).toBeLessThan(eps);
    expect(Math.abs(c.q.dot(b[i].q))).toBeCloseTo(1, 5);
  });
}

const errorsOf = (d: MapData) => validateMapData(d).erros;

describe('grupos: os dados', () => {
  it('aceita peças dentro de grupos (e grupos dentro de grupos), com nome', () => {
    const d = mapWith([group('g', { p: [1, 0, 0], r: [0, 0.5, 0] }), group('h', undefined, 'g'), child(WALL, 'h'), { ...child(BOX, 'g'), nome: 'Caixa da esquina' }]);
    expect(errorsOf(d)).toEqual([]);
  });

  it('recusa pai que não existe, que não é grupo, a própria peça, ciclos e grupos fundos demais', () => {
    expect(errorsOf(mapWith([child(WALL, 'nada')])).join()).toContain('pecas[0].pai: "nada" não é um grupo do mapa');
    expect(errorsOf(mapWith([BOX, child(WALL, 'caixa')])).join()).toContain('"caixa" não é um grupo');
    expect(errorsOf(mapWith([group('g', undefined, 'g')])).join()).toContain('o próprio pai');
    expect(errorsOf(mapWith([group('a', undefined, 'b'), group('b', undefined, 'a')])).join()).toContain('ciclo');
    const chain: Peca[] = [group('g0')];
    for (let i = 1; i <= MAX_GROUP_DEPTH + 1; i++) chain.push(group(`g${i}`, undefined, `g${i - 1}`));
    expect(errorsOf(mapWith(chain)).join()).toContain('no máximo');
    const ok = chain.slice(0, MAX_GROUP_DEPTH);
    expect(errorsOf(mapWith(ok))).toEqual([]);
    expect(errorsOf(mapWith([{ ...BOX, nome: '' }])).join()).toContain('pecas[0].nome');
    expect(errorsOf(mapWith([{ ...BOX, pai: 3 as unknown as string }])).join()).toContain('pecas[0].pai');
  });
});

describe('grupos: a montagem', () => {
  const P: Pose = { p: [5, 1, -3], r: [0.2, 0.9, -0.1] };
  const Q: Pose = { p: [0, 2, 1], r: [0, 0.3, 0.4] };

  it('a pose do grupo compõe com a da peça: grupo · peça, nos colisores', async () => {
    const composed = poseMatrix(P).multiply(poseMatrix(Q));
    const t = new THREE.Vector3();
    const q = new THREE.Quaternion();
    composed.decompose(t, q, new THREE.Vector3());
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    const alone = await build(mapWith([{ ...WALL, pose: { p: t.toArray(), r: [e.x, e.y, e.z] } }]));
    const grouped = await build(mapWith([group('g', P), child({ ...WALL, pose: Q }, 'g')]));
    sameColliders(colliders(alone.physics), colliders(grouped.physics));
    // The wall's hole is carried the same way.
    expect(grouped.map.openings).toHaveLength(1);
    const a = new THREE.Matrix4().fromArray(alone.map.openings[0].pose);
    const b = new THREE.Matrix4().fromArray(grouped.map.openings[0].pose);
    a.elements.forEach((v: number, i: number) => expect(b.elements[i]).toBeCloseTo(v, 5));
  });

  it('grupos aninhados compõem de fora para dentro; uma peça livre (p, yaw) vai com eles', async () => {
    const outer: Pose = { p: [10, 0, 0], r: [0, Math.PI / 2, 0] };
    const inner: Pose = { p: [0, 0, 4], r: [0, 0, 0] };
    const m = poseMatrix(outer).multiply(poseMatrix(inner));
    const t = new THREE.Vector3();
    const q = new THREE.Quaternion();
    m.decompose(t, q, new THREE.Vector3());
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    const alone = await build(mapWith([{ ...BOX, pose: { p: t.toArray(), r: [e.x, e.y, e.z] } }]));
    const grouped = await build(mapWith([child(BOX, 'dentro'), group('dentro', inner, 'fora'), group('fora', outer)]));
    sameColliders(colliders(alone.physics), colliders(grouped.physics));
    // The math the loader uses, on its own: the frame of the groups, then the piece's.
    const data = mapWith([child({ ...BOX, pose: Q }, 'dentro'), group('dentro', inner, 'fora'), group('fora', outer)]);
    const find = (id: string) => data.pecas.find((p) => p.id === id);
    const frame = groupMatrix(data.pecas[0], find);
    frame.elements.forEach((v: number, i: number) => expect(v).toBeCloseTo(m.elements[i], 9));
    const world = worldPoseMatrix(data.pecas[0], find);
    const want = m.clone().multiply(poseMatrix(Q));
    world.elements.forEach((v: number, i: number) => expect(v).toBeCloseTo(want.elements[i], 9));
  });

  it('grupo que não move nada deixa tudo exatamente como sem grupo; no jogo o grupo não monta nada', async () => {
    const plain = await build(mapWith([WALL, BOX]));
    const grouped = await build(mapWith([group('g'), child(WALL, 'g'), group('h', { p: [0, 0, 0], r: [0, 0, 0] }), child(BOX, 'h')]));
    sameColliders(colliders(plain.physics), colliders(grouped.physics), 1e-12);
    expect(grouped.map.openings).toEqual(plain.map.openings);
    expect(grouped.scene.children.map((o: THREE.Object3D) => o.name)).toEqual(plain.scene.children.map((o: THREE.Object3D) => o.name));
    // A posed group with no children builds nothing either.
    const lone = await build(mapWith([WALL, BOX, group('vazio', P)]));
    expect(colliders(lone.physics)).toHaveLength(colliders(plain.physics).length);
    expect(lone.scene.getObjectByName('pose:vazio')).toBeUndefined();
  });

  it('no editor o grupo tem o seu próprio grupo na cena e o filho vai para onde o grupo leva', async () => {
    const built = await build(mapWith([group('g', P), child(BOX, 'g')]), 'editor');
    expect(built.map.pieces.get('g')).toBeDefined();
    const box = built.map.pieces.get('caixa');
    const posed = box.group.getObjectByName('pose:caixa');
    expect(posed).toBeDefined();
    posed.matrix.elements.forEach((v: number, i: number) => expect(v).toBeCloseTo(poseMatrix(P).elements[i], 9));
  });
});
