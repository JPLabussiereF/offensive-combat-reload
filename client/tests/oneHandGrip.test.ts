// PCD with one hand (PF-3): the rifle held straight by the hand that is left (on the left of the chest, mirrored,
// when the right one is missing), the other arm hanging or its stump under the handguard, and the hitbox
// skeleton playing the same pose (client/character/animator.ts, character.ts, entities/rig.ts).
import * as THREE from 'three';
import { describe, expect, it } from 'bun:test';
import type { ArmLoss } from '@shared/appearance';
import { ANIM, CharacterAnimator, type AvatarPose, type Posable } from '../character/animator';
import { Character } from '../character/character';
import { LEFT_GRIP, RIFLE_GRIP } from '../character/registry';
import { createCanonicalSkeleton } from '../character/rig';

const FWD = new THREE.Vector3(0, 0, -1);

const still = (over: Partial<AvatarPose> = {}): AvatarPose => ({ speed: 0, crouch: false, pitch: 0, ads: false, reload: false, knife: false, cook: false, ...over });

function character(braco: ArmLoss) {
  const c = new Character({ v: 1, sex: 'm', items: { weapon_R: 'rifle', weapon_back: 'rifle_costas' }, colors: {}, eyes: { style: 'redondo' }, build: { height: 'medio', build: 'medio' }, pcd: { braco, perna: '' } });
  return { c, anim: new CharacterAnimator(c) };
}

/** Poses for `frames` frames at 60 fps and updates the world matrices. */
function play(c: Character, anim: CharacterAnimator, s: AvatarPose, frames = 60) {
  for (let f = 0; f < frames; f++) anim.pose(1 / 60, s);
  c.root.updateMatrixWorld(true);
}

const rifleOf = (c: Character) => c.objectsOf('weapon_R')[0];
/** Where the rifle points (its -Z) in the world. */
const aim = (o: THREE.Object3D) => FWD.clone().transformDirection(o.matrixWorld);
const worldPos = (o: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
/** A point in the chest bone's space. */
const inChest = (c: Character, p: THREE.Vector3) => p.clone().applyMatrix4(c.bones.chest.matrixWorld.clone().invert());

const ALL: ArmLoss[] = ['maoDir', 'bracoDir', 'maoEsq', 'bracoEsq', ''];
const RIGHT_MISSING = new Set<ArmLoss>(['maoDir', 'bracoDir']);

describe('empunhadura de uma mão (PCD)', () => {
  it('a empunhadura esquerda é o espelho da direita', () => {
    // The barrel (model -Z) along the arm: +X of the right hand, -X of the left one.
    const right = FWD.clone().applyQuaternion(RIFLE_GRIP);
    const left = FWD.clone().applyQuaternion(LEFT_GRIP);
    expect(left.x).toBeCloseTo(-right.x, 5);
    expect(left.y).toBeCloseTo(right.y, 5);
    expect(left.z).toBeCloseTo(right.z, 5);
  });

  for (const braco of ALL) {
    const name = braco || 'sem PCD';
    it(`${name}: o rifle aponta para a frente do peito no quadril e na mira`, () => {
      const { c, anim } = character(braco);
      for (const ads of [false, true]) {
        play(c, anim, still({ ads }));
        const chestFwd = FWD.clone().transformDirection(c.bones.chest.matrixWorld);
        expect(aim(rifleOf(c)).dot(chestFwd)).toBeGreaterThan(0.95);
      }
    });

    it(`${name}: correndo, o rifle segue a pose de corrida`, () => {
      const { c, anim } = character(braco);
      play(c, anim, still({ sprint: true }));
      const rot = (RIGHT_MISSING.has(braco) ? ANIM.rifleOneHand : ANIM.rifle).sprint.rot;
      const chestQ = new THREE.Quaternion().setFromRotationMatrix(c.bones.chest.matrixWorld);
      const want = FWD.clone().applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]))).applyQuaternion(chestQ);
      expect(aim(rifleOf(c)).dot(want)).toBeGreaterThan(0.95);
    });

    it(`${name}: o rifle fica do lado da mão que o segura e o outro braço como deve`, () => {
      const { c, anim } = character(braco);
      play(c, anim, still());
      const rifle = rifleOf(c);
      const side = inChest(c, worldPos(rifle)).x;
      const hips = c.bones.hips.getWorldPosition(new THREE.Vector3()).y;
      const handR = c.bones.hand_R.getWorldPosition(new THREE.Vector3());
      if (RIGHT_MISSING.has(braco)) {
        // Left of the chest, in the left hand; the right arm (or stump) hangs by the side.
        expect(side).toBeLessThan(0);
        expect(rifle.parent?.name).toBe('socket_hand_L');
        expect(handR.y).toBeLessThan(hips + 0.1);
      } else {
        expect(side).toBeGreaterThan(0);
        expect(rifle.parent?.name).toBe('socket_hand_R');
        expect(handR.y).toBeGreaterThan(hips + 0.2);
        // The left hand (or its stump) under the handguard, ahead of the grip.
        const handL = inChest(c, c.bones.hand_L.getWorldPosition(new THREE.Vector3()));
        expect(handL.z).toBeLessThan(inChest(c, worldPos(rifle)).z - 0.1);
      }
    });
  }

  it('sem a mão direita, recarrega com o rifle apoiado no corpo, sem ele sair voando', () => {
    const { c, anim } = character('maoDir');
    let away = 0;
    for (let f = 0; f < 96; f++) {
      anim.pose(1 / 60, still({ reload: true }));
      // What Avatar does: the rifle stays where the animator rests it.
      const rifle = rifleOf(c);
      if (anim.rifleOffset) anim.rifleOffset.decompose(rifle.position, rifle.quaternion, new THREE.Vector3());
      c.root.updateMatrixWorld(true);
      const chest = c.bones.chest.getWorldPosition(new THREE.Vector3());
      expect(worldPos(rifle).distanceTo(chest)).toBeLessThan(0.45);
      away = Math.max(away, c.bones.hand_L.getWorldPosition(new THREE.Vector3()).distanceTo(worldPos(rifle)));
    }
    // The hand left the grip for the magazine and the pouch.
    expect(away).toBeGreaterThan(0.15);
  });

  it('com uma mão, a granada põe o rifle nas costas; com duas, não', () => {
    for (const braco of ALL) {
      const { anim } = character(braco);
      anim.pose(1 / 60, still({ cook: true }));
      expect(anim.rifleAway).toBe(braco !== '');
      anim.pose(1 / 60, still());
      expect(anim.rifleAway).toBe(false);
    }
  });

  it('sem a mão direita, a faca vai na esquerda e o braço direito fica pendurado', () => {
    const { c, anim } = character('maoDir');
    play(c, anim, still({ knife: true, blade: true }));
    const hips = c.bones.hips.getWorldPosition(new THREE.Vector3()).y;
    expect(c.bones.hand_R.getWorldPosition(new THREE.Vector3()).y).toBeLessThan(hips + 0.1);
    expect(c.bones.hand_L.getWorldPosition(new THREE.Vector3()).y).toBeGreaterThan(hips + 0.2);
  });

  it('o esqueleto das hitboxes faz a mesma pose de uma mão', () => {
    for (const braco of ['maoDir', 'maoEsq', ''] as ArmLoss[]) {
      const { c, anim } = character(braco);
      // The hitbox skeleton (entities/rig.ts): standard proportions, the same missing parts.
      const { root, bones } = createCanonicalSkeleton('m');
      const holder = new THREE.Group();
      holder.add(root);
      const poser: Posable = { bones: Object.fromEntries(bones.map((b) => [b.name, b])), body: holder, setGrip: () => {}, missing: c.missing };
      const hit = new CharacterAnimator(poser);
      for (let f = 0; f < 40; f++) hit.pose(1 / 60, still({ ads: f > 20 }));
      anim.syncFrom(hit);
      anim.pose(0, still({ ads: true }));
      c.root.updateMatrixWorld(true);
      holder.updateMatrixWorld(true);
      for (const bone of ['hand_L', 'hand_R', 'forearm_L', 'forearm_R']) {
        const a = c.bones[bone].getWorldPosition(new THREE.Vector3());
        const b = poser.bones[bone].getWorldPosition(new THREE.Vector3());
        expect(a.distanceTo(b)).toBeLessThan(0.01);
      }
    }
  });
});
