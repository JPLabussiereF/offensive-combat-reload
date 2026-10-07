// A piece's pose (Peca.pose, P32): the editor's gizmo moves and turns any piece at any angle, and everything
// the piece builds follows it. A wall with a door, a room for the sound and a cabinet with its biscuit, turned
// on all three axes: the colliders, the batches, the room and the hole land where the pose puts them, the
// door is still a way through, the biscuit is still where the server expects it; and a piece without a pose
// (or with one that moves nothing) builds exactly as before.
import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { MAP_FORMAT, validateMapData, type MapData, type Peca, type Pose } from '@shared/mapData';
import { buildHeadless } from '../../tools/snapshot-mapas';
import { fakeRenderer, loadClient, silentSfx } from '../../tools/headless';

const { buildMapFromData, startBuild } = await loadClient('client/world/mapLoader.ts');
const { poseMatrix, poseOf, openingCenter } = await loadClient('client/world/pose.ts');
const { RoomVolumes } = await loadClient('client/audio/spatial.ts');

const POSE: Pose = { p: [5, 1.5, -3], r: [0.3, 0.7, -0.2] };

const WALL: Peca = { id: 'parede', tipo: 'parede', params: { eixo: 'x', fixo: 0, de: -4, ate: 4, espessura: 0.3, altura: 3, superficie: 'reboco', vaos: [[-0.5, 0.5, 0, 2.2]], y0: 0 } };
const ROOM: Peca = { id: 'sala', tipo: 'sala', p: [0, 1.5, 3], params: { tamanho: [4, 3, 2], fechamento: 0.8 } };
const CABINET: Peca = { id: 'armario', tipo: 'armarioBiscoito', p: [6, 0, 6], yaw: 0, params: { som: [6, 1, 6] }, prop: 'armario', coletavel: 'biscoito' };

function mapWith(pecas: Peca[]): MapData {
  return {
    formato: MAP_FORMAT,
    nome: 'Pose',
    cartao: { emoji: '🧪', cor: '#aabbcc' },
    ambiente: { ceu: {}, celula: 40, killY: -20 },
    pecas,
    arquivos: [],
    spawns: { a: [{ p: [0, 0, -6], yaw: 0 }], b: [{ p: [0, 0, 6], yaw: 0 }], ffa: [{ p: [6, 0, 0], yaw: 0 }] },
    bonecos: [],
    objetos: { coletaveis: [{ id: 'biscoito', tipo: 'biscoito', p: [6.2, 1.1, 6.1] }], bruxa: null, ratos: [], peixes: [] },
  };
}

const posed = (p: Peca, pose: Pose = POSE): Peca => ({ ...structuredClone(p), pose });
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

function staticBounds(scene: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.name.startsWith('static:')) return;
    const g = (o as THREE.Mesh).geometry;
    g.computeBoundingBox();
    box.union(g.boundingBox!.clone().applyMatrix4(o.matrixWorld));
  });
  return box;
}

const close = (a: THREE.Vector3, b: THREE.Vector3, eps = 1e-4) => a.distanceTo(b) < eps;

describe('pose das peças (P32)', () => {
  it('a pose vira matriz e volta igual; a pose nula não move nada', () => {
    const m = poseMatrix(POSE);
    const back = poseOf(m);
    for (let i = 0; i < 3; i++) {
      expect(back.p[i]).toBeCloseTo(POSE.p[i], 4);
      expect(back.r[i]).toBeCloseTo(POSE.r[i], 5);
    }
    expect(poseMatrix(undefined)).toBeNull();
    expect(poseMatrix({ p: [0, 0, 0], r: [0, 0, 0] })).toBeNull();
    expect(poseOf(new THREE.Matrix4())).toBeUndefined();
  });

  it('validateMapData aceita a pose e recusa uma pose quebrada', () => {
    expect(validateMapData(mapWith([posed(WALL)])).erros).toEqual([]);
    const bad = mapWith([{ ...WALL, pose: { p: [0, 0], r: [0, 0, 0] } as unknown as Pose }]);
    expect(validateMapData(bad).erros.some((e) => e.startsWith('pecas[0].pose'))).toBe(true);
  });

  it('peça sem pose (ou com pose que não move) monta exatamente como antes', async () => {
    const plain = await build(mapWith([WALL, ROOM, CABINET]));
    const zero = await build(mapWith([posed(WALL, { p: [0, 0, 0], r: [0, 0, 0] }), ROOM, CABINET]));
    const a = colliders(plain.physics);
    const b = colliders(zero.physics);
    expect(b.length).toBe(a.length);
    a.forEach((c, i) => {
      expect(close(c.t, b[i].t, 1e-9)).toBe(true);
      expect(Math.abs(c.q.dot(b[i].q))).toBeCloseTo(1, 9);
    });
    expect(zero.map.openings).toEqual(plain.map.openings);
    expect(zero.map.rooms).toEqual(plain.map.rooms);
    expect(zero.scene.children.map((o: THREE.Object3D) => o.name)).toEqual(plain.scene.children.map((o: THREE.Object3D) => o.name));
  });

  it('parede girada em ângulo livre: colisores, lotes e vão no lugar da pose, e a porta continua passagem', async () => {
    const m = poseMatrix(POSE) as THREE.Matrix4;
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    const plain = await build(mapWith([WALL]));
    const turned = await build(mapWith([posed(WALL)]));

    // Every collider is the unposed one carried by the pose.
    const a = colliders(plain.physics);
    const b = colliders(turned.physics);
    expect(b.length).toBe(a.length);
    a.forEach((c, i) => {
      expect(b[i].shape).toBe(c.shape);
      expect(close(b[i].t, c.t.clone().applyMatrix4(m))).toBe(true);
      expect(Math.abs(b[i].q.dot(c.q.clone().premultiply(q)))).toBeCloseTo(1, 6);
    });

    // The batches: the unposed bounds' corners all land inside the posed bounds (and not inside the plain ones).
    const pb = staticBounds(plain.scene);
    const tb = staticBounds(turned.scene);
    const center = pb.getCenter(new THREE.Vector3()).applyMatrix4(m);
    expect(tb.containsPoint(center)).toBe(true);
    expect(pb.containsPoint(center)).toBe(false);

    // The hole keeps its numbers in the wall's frame; its center is where the pose takes it.
    const [hole] = turned.map.openings;
    expect(hole.pose).toBeDefined();
    expect(close(openingCenter(hole), openingCenter(plain.map.openings[0]).applyMatrix4(m))).toBe(true);
    expect(hole.door).toBe(true);

    // Through the door along the wall's (turned) normal nothing is hit; a meter to the side, the wall is.
    turned.physics.world.step();
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const cast = (local: THREE.Vector3) => {
      const o = local.clone().applyMatrix4(m).addScaledVector(normal, -1);
      const ray = new RAPIER.Ray({ x: o.x, y: o.y, z: o.z }, { x: normal.x, y: normal.y, z: normal.z });
      return turned.physics.world.castRay(ray, 2, true);
    };
    expect(cast(new THREE.Vector3(0, 1, 0))).toBeNull();
    expect(cast(new THREE.Vector3(2, 1, 0))).not.toBeNull();
  });

  it('sala girada: o som acha o ponto dentro da caixa girada e não no canto da caixa alinhada em volta dela', async () => {
    const pose: Pose = { p: [0, 0, 0], r: [0, Math.PI / 4, 0] };
    const m = poseMatrix(pose) as THREE.Matrix4;
    const built = await build(mapWith([posed(ROOM, pose)]));
    const rooms = new RoomVolumes(built.map.rooms);
    const at = (x: number, y: number, z: number) => {
      const v = new THREE.Vector3(x, y, z).applyMatrix4(m);
      return rooms.at({ x: v.x, y: v.y, z: v.z });
    };
    // Inside the 4 x 3 x 2 box around (0, 1.5, 3), near a corner: in.
    expect(at(1.9, 1.5, 3.9)).toBeCloseTo(0.8, 9);
    // Just past its long side: out, though it's inside the world box around the turned room.
    const outside = new THREE.Vector3(0, 1.5, 4.3).applyMatrix4(m);
    const r = built.map.rooms[0];
    expect(r.local).toBeDefined();
    expect(rooms.at({ x: outside.x, y: outside.y, z: outside.z })).toBeNull();
    // The unposed room is a plain world box still.
    const plain = await build(mapWith([ROOM]));
    expect(plain.map.rooms[0].local).toBeUndefined();
    expect(new RoomVolumes(plain.map.rooms).at({ x: 1.9, y: 1.5, z: 3.9 })).toBeCloseTo(0.8, 9);
  });

  it('caixa ROOM_ girada num .glb: fica com o seu próprio referencial; sem giro, a caixa do mundo de sempre', async () => {
    const { MapBuilder } = await loadClient('client/world/mapBuilder.ts');
    const { createPhysics } = await loadClient('client/world/physics.ts');
    const b = new MapBuilder(await createPhysics(), new THREE.Scene());
    const frame = new THREE.Matrix4().compose(new THREE.Vector3(10, 0, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 6), new THREE.Vector3(3, 2, 1));
    b.orientedRoom({ x: -1, y: -1, z: -1 }, { x: 1, y: 1, z: 1 }, frame, 0.5);
    b.orientedRoom({ x: -1, y: -1, z: -1 }, { x: 1, y: 1, z: 1 }, new THREE.Matrix4().makeTranslation(0, 5, 0), 1);
    const [turned, plain] = b.rooms;
    expect(turned.local).toHaveLength(12);
    expect(plain.local).toBeUndefined();
    expect(plain.min).toEqual({ x: -1, y: 4, z: -1 });
    const rooms = new RoomVolumes([turned]);
    const world = (x: number, y: number, z: number) => {
      const v = new THREE.Vector3(x, y, z).applyMatrix4(frame);
      return rooms.at({ x: v.x, y: v.y, z: v.z });
    };
    expect(world(0.95, 0.9, -0.95)).toBe(0.5);
    expect(world(1.1, 0, 0)).toBeNull();
  });

  it('armário girado: o biscoito continua onde o servidor espera e o armário vai com a pose', async () => {
    const plain = await build(mapWith([CABINET]));
    const turned = await build(mapWith([posed(CABINET)]));
    expect(plain.map.pickups[0].position.toArray()).toEqual([6.2, 1.1, 6.1]);
    const p = turned.map.pickups[0].position;
    expect(p.x).toBeCloseTo(6.2, 6);
    expect(p.y).toBeCloseTo(1.1, 6);
    expect(p.z).toBeCloseTo(6.1, 6);
    // Its objects hang from the pose's group.
    const group = turned.scene.getObjectByName('pose:armario');
    expect(group).toBeDefined();
    expect(group!.children.length).toBeGreaterThan(0);
  });

  it('lanterna de papel girada (P42): a luz da noite sai de onde a pose leva a lanterna', async () => {
    const LANTERN: Peca = { id: 'lanterna', tipo: 'lanternaPapel', p: [2, 3, 1], params: { queda: 0.85 } };
    const night = (pecas: Peca[]): MapData => ({ ...mapWith(pecas), ambiente: { ceu: { cupula: { tipo: 'oriental' } }, celula: 40, killY: -20 } });
    const spots = async (data: MapData) => {
      const built = await buildHeadless(async (physics, scene) => {
        const b = startBuild(data, { physics, scene, renderer: fakeRenderer, sfx: silentSfx, modo: 'jogo' });
        for (const p of data.pecas) await b.piece(p);
        b.finish();
        return b;
      });
      return Array.from(built.map.ctx.s.lanternSpots() as Float32Array);
    };
    const m = poseMatrix(POSE) as THREE.Matrix4;
    const plain = await spots(night([LANTERN]));
    const turned = await spots(night([posed(LANTERN)]));
    expect(plain).toHaveLength(3);
    expect(turned).toHaveLength(3);
    expect(close(new THREE.Vector3(...turned), new THREE.Vector3(...plain).applyMatrix4(m))).toBe(true);
    // Not left where the unposed lantern would be.
    expect(close(new THREE.Vector3(...turned), new THREE.Vector3(...plain), 0.5)).toBe(false);
  });

  it('lago girado (P42): o recorte no chão vai com a pose; sem pose, igual', async () => {
    const POND: Peca = { id: 'lago', tipo: 'tanque', params: { area: { x0: 2, z0: 1, x1: 6, z1: 3 }, fundo: 0.8 } };
    const holes = async (data: MapData) => {
      const built = await buildHeadless(async (physics, scene) => {
        const b = startBuild(data, { physics, scene, renderer: fakeRenderer, sfx: silentSfx, modo: 'jogo' });
        for (const p of data.pecas) await b.piece(p);
        b.finish();
        return b;
      });
      return built.map.ctx.s.holes as { x0: number; z0: number; x1: number; z1: number }[];
    };
    expect(await holes(mapWith([POND]))).toEqual([{ x0: 2, z0: 1, x1: 6, z1: 3 }]);
    // A quarter turn around the origin and 10 m east: (x, z) → (z + 10, -x).
    const [hole] = await holes(mapWith([posed(POND, { p: [10, 0, 0], r: [0, Math.PI / 2, 0] })]));
    expect(hole.x0).toBeCloseTo(11, 6);
    expect(hole.x1).toBeCloseTo(13, 6);
    expect(hole.z0).toBeCloseTo(-6, 6);
    expect(hole.z1).toBeCloseTo(-2, 6);
  });

  it('editor: peça girada no seu grupo; tirar a peça leva os colisores, a sala e o vão', async () => {
    const data = mapWith([posed(WALL), posed(ROOM), CABINET]);
    const built = await buildHeadless(async (physics, scene) => {
      const b = startBuild(data, { physics, scene, renderer: fakeRenderer, sfx: silentSfx, modo: 'editor' });
      for (const p of data.pecas) await b.piece(p);
      return { build: b, map: b.finish() };
    });
    const { build: b, map } = built.map;
    expect(map.pieces.get('parede').group.getObjectByName('pose:parede')).toBeDefined();
    let before = 0;
    built.physics.world.forEachCollider(() => before++);
    const wallCols = map.pieces.get('parede').colliders.length;
    expect(map.openings).toHaveLength(1);
    expect(map.rooms).toHaveLength(1);
    b.remove('parede');
    b.remove('sala');
    let after = 0;
    built.physics.world.forEachCollider(() => after++);
    expect(after).toBe(before - wallCols);
    expect(map.openings).toHaveLength(0);
    expect(map.rooms).toHaveLength(0);
    // And it builds again, the same.
    await b.piece(data.pecas[0]);
    expect(map.openings).toHaveLength(1);
    expect(map.pieces.get('parede').colliders.length).toBe(wallCols);
  });
});
