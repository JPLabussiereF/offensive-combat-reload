// The sight while aiming (client/render/viewmodel.ts, its stance layers in viewmodelStance.ts): the shot leaves
// the center of the screen, so at full aim crouching, landing and sliding must not move the sight off it;
// without aiming the gun moves as before. (viewmodel.ts itself needs a DOM, so the test uses its pure parts.)
import * as THREE from 'three';
import { describe, expect, it } from 'bun:test';
import { MOVE } from '@shared/constants';
import { eyeHeight, type MoveState } from '@shared/movement';
import { GUN_IDS, type Sight } from '@shared/progression';
import { stanceOffset } from '../render/viewmodelStance';
import { gunParts } from '../render/weaponModels';

/** Every sight without a scope (a scope swaps to its overlay when fully aimed). */
const SIGHTS: Sight[] = ['ferro', 'pontoVermelho', 'holo'];
/** VM_FEEL.pose.adsZ (a gun without its own ADS distance) and the deepest landing sink, VM_FEEL.landing.max. */
const ADS_Z = -0.36;
const LAND_MAX = 0.07;

/** The sight point (0, sightY, 0) of the gun, in camera space, fully aimed with these stance layers. */
function sightAimed(sightY: number, adsZ: number, crouch: number, slide: number, land: number): THREE.Vector3 {
  const o = stanceOffset(1, crouch, slide, land);
  const pos = new THREE.Vector3(o.x, -sightY + o.y, adsZ);
  const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, o.rz)), new THREE.Vector3(1, 1, 1));
  return new THREE.Vector3(0, sightY, 0).applyMatrix4(m);
}

describe('mira com a arma no ombro', () => {
  it('o ponto de cada mira sem luneta fica no centro agachado, ao aterrissar e deslizando', () => {
    for (const arma of GUN_IDS) {
      for (const mira of SIGHTS) {
        const parts = gunParts({ arma, mira, visual: 'padrao', silenciador: false, pente: 30 });
        expect(parts.scoped).toBe(false);
        const adsZ = parts.adsZ ?? ADS_Z;
        for (const crouch of [0, 1]) {
          for (const slide of [0, 1]) {
            for (const land of [0, -LAND_MAX, 0.02]) {
              const p = sightAimed(parts.sightY, adsZ, crouch, slide, land);
              expect(p.x).toBeCloseTo(0, 6);
              expect(p.y).toBeCloseTo(0, 6);
            }
          }
        }
      }
    }
  });

  it('sem mirar, a arma desce ao agachar, afunda ao aterrissar e inclina no deslize como antes', () => {
    const crouched = stanceOffset(0, 1, 0, 0);
    expect(crouched.x).toBeCloseTo(0, 9);
    expect(crouched.y).toBeCloseTo(-0.01, 9);
    expect(crouched.rz).toBeCloseTo(0, 9);
    const landing = stanceOffset(0, 0, 0, -0.04);
    expect(landing.y).toBeCloseTo(-0.04, 9);
    const sliding = stanceOffset(0, 0, 1, 0);
    expect(sliding.x).toBeCloseTo(-0.02, 9);
    expect(sliding.y).toBeCloseTo(-0.02, 9);
    expect(sliding.rz).toBeCloseTo(0.22, 9);
    const all = stanceOffset(0, 1, 1, -0.04);
    expect(all.x).toBeCloseTo(-0.02, 9);
    expect(all.y).toBeCloseTo(-0.04 - 0.01 - 0.02, 9);
    expect(all.rz).toBeCloseTo(0.22, 9);
  });

  it('a altura do olho agachado continua 1,05 m (o tiro sai dela)', () => {
    expect(MOVE.eyeCrouch).toBe(1.05);
    expect(eyeHeight({ crouchT: 1 } as MoveState)).toBeCloseTo(MOVE.eyeCrouch, 9);
  });
});
