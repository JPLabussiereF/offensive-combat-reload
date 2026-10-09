// Pets on screen (PF-29): every pet fits the triangle budget (at most 2,000, the light version about a third: 10
// players with a pet stay around 20 thousand), the Amora is the map's Chow Chow builder (the map's own unchanged),
// and where a pet walks: the PvP leash (at most 0.7 m from the edge of its owner's body, always behind on its side)
// and the zumbi's path behind and beside its owner (the breadcrumbs it follows), out of the cone in front of them; and
// no pet has a collider or a hit target (only bones, groups and meshes); the ability's paw is one texture per collar
// color.
import { describe, expect, it } from 'bun:test';
import { PET_IDS, PETS } from '@shared/pets';
import * as THREE from 'three';
import { behindSpot, BODY_RADIUS, followTarget, FRONT_RANGE, inFrontCone, inSightLine, newFollow, PVE_SIDE, PVP_LEASH, routeAround, stepFollow, type Owner } from '../pets/follow';
import { installCanvasStandIn, loadClient } from '../../tools/headless';

const { makePet } = await loadClient('client/pets/species.ts');
const { PET_MAX_TRIS } = await loadClient('client/pets/rig.ts');
const { chowParts } = await loadClient('client/world/dog.ts');
const { PetAnimator, restPose, STATION_GESTURE, GESTURE_TIME } = await loadClient('client/pets/anim.ts');
const { pawTexture, pawSprite } = await loadClient('client/pets/paw.ts');

const coats = (id: (typeof PET_IDS)[number]) => (PETS[id].pelagens.length ? PETS[id].pelagens.map((p) => p.id) : ['']);

describe('modelos dos pets', () => {
  it('cada pet, em toda pelagem, cabe em 2 mil triângulos e a versão leve fica em até 35%', () => {
    let worst = 0;
    for (const id of PET_IDS)
      for (const cor of coats(id)) {
        const m = makePet(id, cor, 0xd8352a, 'match');
        const t = m.triangles;
        expect(t.full).toBeLessThanOrEqual(PET_MAX_TRIS);
        expect(t.light / t.full).toBeLessThanOrEqual(0.35);
        expect(t.light).toBeGreaterThan(100);
        worst = Math.max(worst, t.full);
        m.dispose();
      }
    // Ten players with the heaviest pet, all close: about 20 thousand triangles at most.
    expect(worst * 10).toBeLessThanOrEqual(20_000);
  });

  it('a Amora pet é o mesmo construtor da Amora do mapa, com a cabeça e os olhos maiores', () => {
    const map = chowParts();
    const pet = chowParts({ pet: true });
    // The map's dog sits (no legs of their own); the pet stands on four.
    expect(map.legs).toHaveLength(0);
    expect(pet.legs).toHaveLength(4);
    // Same pieces of the head, 12% bigger.
    expect(pet.head.length).toBe(map.head.length);
    const r = (g: { parameters: { radius?: number } }) => g.parameters.radius ?? 0;
    expect(r(pet.head[0].geo as never) / r(map.head[0].geo as never)).toBeCloseTo(1.12, 2);
    // The eyes 15% more on top of that.
    expect(r(pet.head[5].geo as never) / r(map.head[5].geo as never)).toBeCloseTo(1.12 * 1.15, 2);
    expect(map.collar).toHaveLength(0);
  });

  it('cada pet tem o seu gesto na estação, curto o bastante para a troca caber em 2 s', () => {
    for (const id of PET_IDS) {
      const g = STATION_GESTURE[id];
      expect(GESTURE_TIME[g]).toBeLessThanOrEqual(1);
      const m = makePet(id, coats(id)[0], 0x2f7fe0, 'galpao');
      const anim = new PetAnimator(m);
      // It plays from start to end without throwing, the props shown only meanwhile.
      for (let t = 0; t <= GESTURE_TIME[g]; t += 0.05) anim.update(0.05, { ...restPose(), gesture: g, gestureT: t });
      anim.update(0.05, restPose());
      expect([...m.props.values()].every((p: { visible: boolean }) => !p.visible)).toBe(true);
      m.dispose();
    }
  });

  it('nenhum pet tem colisor nem alvo: só ossos, grupos e malhas (e todo gesto posa sem erro)', () => {
    for (const id of PET_IDS) {
      const m = makePet(id, coats(id)[0], 0xd8352a, 'match');
      m.root.traverse((o: THREE.Object3D) => {
        expect({ id, ok: o instanceof THREE.Mesh || o instanceof THREE.Group || o instanceof THREE.Bone }).toEqual({ id, ok: true });
        // Nothing the game's hit tests or the zombies' picks could take for a body.
        expect(Object.keys(o.userData)).toHaveLength(0);
      });
      const anim = new PetAnimator(m);
      for (const g of Object.keys(GESTURE_TIME)) anim.update(0.05, { ...restPose(), gesture: g, gestureT: 0.3 });
      anim.update(0.05, { ...restPose(), speed: 5 });
      anim.update(0.05, { ...restPose(), dance: true, tailGone: 1, sit: 1 });
      m.dispose();
    }
  });
});

describe('a pata da assinatura', () => {
  it('na cor da coleira, uma textura por cor (compartilhada pelos sprites, nunca uma por pata)', () => {
    // The paw is drawn on a canvas: a stand-in for the browser's.
    const restore = installCanvasStandIn();
    try {
      const red = pawTexture(0xd8352a);
      expect(pawTexture('#d8352a')).toBe(red);
      expect(pawTexture(0x2f7fe0)).not.toBe(red);
      const a = pawSprite(0xd8352a);
      const b = pawSprite(0xd8352a);
      expect(a.material.map).toBe(red);
      expect(b.material.map).toBe(red);
      // Seen through walls, over the scene.
      expect(a.material.depthTest).toBe(false);
    } finally {
      restore();
    }
  });
});

describe('onde o pet anda', () => {
  const owner: Owner = { x: 0, y: 0, z: 0, yaw: 0 };

  it('no PvP: coleira curta, atrás e do mesmo lado, mesmo com o dono correndo e virando', () => {
    const f = newFollow(owner, 1);
    const o = { ...owner };
    let maxGap = 0;
    for (let i = 0; i < 400; i++) {
      // Runs in a circle, turning.
      o.yaw = i * 0.03;
      o.x += -Math.sin(o.yaw) * 0.12;
      o.z += -Math.cos(o.yaw) * 0.12;
      stepFollow(f, o, 1 / 60, 'pvp', 1);
      maxGap = Math.max(maxGap, Math.hypot(f.x - o.x, f.z - o.z) - BODY_RADIUS);
    }
    expect(maxGap).toBeLessThanOrEqual(PVP_LEASH + 1e-6);
    // Standing still, it settles behind and to its side.
    for (let i = 0; i < 200; i++) stepFollow(f, o, 1 / 60, 'pvp', 1);
    const spot = behindSpot(o, 'pvp', 1);
    expect(Math.hypot(f.x - spot.x, f.z - spot.z)).toBeLessThan(0.15);
    expect(inFrontCone(o, f)).toBe(false);
  });

  it('no zumbi: segue o caminho do dono uns 1,2 m atrás e fora do cone da frente', () => {
    const f = newFollow(owner, -1);
    const o = { ...owner };
    for (let i = 0; i < 240; i++) {
      o.z -= 0.05;
      stepFollow(f, o, 1 / 60, 'pve', -1);
    }
    const d = Math.hypot(f.x - o.x, f.z - o.z);
    expect(d).toBeGreaterThan(0.8);
    expect(d).toBeLessThan(2);
    // Behind (larger z: the owner walks toward -z).
    expect(f.z).toBeGreaterThan(o.z);
    // The owner turns around: the pet is in front of them now, and goes around to behind.
    o.yaw = Math.PI;
    for (let i = 0; i < 240; i++) stepFollow(f, o, 1 / 60, 'pve', -1);
    expect(inFrontCone(o, f)).toBe(false);
    expect(Math.hypot(f.x - o.x, f.z - o.z)).toBeLessThan(FRONT_RANGE);
  });

  it('o rastro do dono: um ponto a cada 25 cm, no máximo 24, e o pet vai atrás pelo caminho (não corta a esquina)', () => {
    const o = { ...owner, z: 3 };
    const f = newFollow(o, 1);
    // 3 m along -Z, then a turn to +X for 0.6 m.
    for (let i = 0; i < 60; i++) {
      o.z = 3 - (i + 1) * 0.05;
      stepFollow(f, o, 1 / 60, 'pve', 1);
    }
    o.yaw = -Math.PI / 2;
    for (let i = 0; i < 12; i++) {
      o.x = (i + 1) * 0.05;
      stepFollow(f, o, 1 / 60, 'pve', 1);
    }
    expect(f.trail.length).toBeLessThanOrEqual(24);
    for (let i = 1; i < f.trail.length; i++) expect(Math.hypot(f.trail[i].x - f.trail[i - 1].x, f.trail[i].z - f.trail[i - 1].z)).toBeGreaterThan(0.25);
    // 1.2 m back along the path is ~(0, 0.6), on the first leg: the target is PVE_SIDE to the side of it, not on the
    // straight line to the owner.
    const t = followTarget(f, o, 'pve', 1);
    expect(Math.abs(Math.hypot(t.x, t.z - 0.6) - PVE_SIDE)).toBeLessThan(0.15);
    for (let i = 0; i < 200; i++) stepFollow(f, o, 1 / 60, 'pve', 1);
    expect(f.trail.length).toBeLessThanOrEqual(24);
  });

  it('agindo, vai até o alvo em vez de seguir', () => {
    const f = newFollow(owner, 1);
    for (let i = 0; i < 180; i++) stepFollow(f, owner, 1 / 60, 'pve', 1, { x: 3, z: -4 });
    expect(Math.hypot(f.x - 3, f.z + 4)).toBeLessThan(0.2);
  });

  it('correndo para agir num zumbi à frente, nunca cruza a mira do dono: sai para o lado e depois vai', () => {
    // The owner looks down -Z at a zombie 7 m ahead; the pet is just behind, on the right.
    const f = newFollow(owner, 1);
    f.x = 0.8;
    f.z = 1.2;
    const zombie = { x: 0, z: -7 };
    let crossed = false;
    for (let i = 0; i < 400; i++) {
      stepFollow(f, owner, 1 / 60, 'pve', 1, zombie);
      if (inFrontCone(owner, f)) crossed = true;
    }
    expect(crossed).toBe(false);
    expect(Math.hypot(f.x - zombie.x, f.z - zombie.z)).toBeLessThan(0.3);
    // The way it took: out to the side before going in.
    expect(routeAround(owner, { x: 0.8, z: 1.2 }, zombie, 1).x).toBeGreaterThan(1.5);
    // Coming back: from in front of the owner it first steps out sideways, then goes round to behind them.
    const back = newFollow(owner, 1);
    back.x = 0.2;
    back.z = -2;
    expect(inFrontCone(owner, back)).toBe(true);
    const out = routeAround(owner, back, behindSpot(owner, 'pve', 1), 1);
    expect(inFrontCone(owner, out)).toBe(false);
    expect(Math.abs(out.z - back.z)).toBeLessThan(1e-6);
    let inside = 0;
    for (let i = 0; i < 400; i++) {
      stepFollow(back, owner, 1 / 60, 'pve', 1);
      if (inFrontCone(owner, back)) inside++;
    }
    expect(inFrontCone(owner, back)).toBe(false);
    // (only the first steps, out of it sideways)
    expect(inside).toBeLessThan(30);
    // A zombie right in front, in the cone itself: straight to it.
    expect(routeAround(owner, { x: 0.8, z: 1.2 }, { x: 0.1, z: -2 }, 1)).toEqual({ x: 0.1, z: -2 });
  });

  it('no meio da visão do dono (±15°) a menos de 3 m o pet fica apagado; fora disso, não', () => {
    expect(inSightLine(owner, { x: 0, z: -2 })).toBe(true);
    expect(inSightLine(owner, { x: 0.4, z: -2.5 })).toBe(true);
    expect(inSightLine(owner, { x: 1, z: -2 })).toBe(false);
    expect(inSightLine(owner, { x: 0, z: -4 })).toBe(false);
    expect(inSightLine(owner, { x: 0, z: 2 })).toBe(false);
  });
});
