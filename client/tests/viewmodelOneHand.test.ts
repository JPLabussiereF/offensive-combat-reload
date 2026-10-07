// First person with one hand (PF-3, client/render/viewmodel.ts): without the right hand the gun is mirrored to
// the left of the screen, and fully aimed the sight stays on the view's axis (x = y = 0).
import * as THREE from 'three';
import { afterAll, describe, expect, it } from 'bun:test';
import { defaultAppearance, type Appearance, type ArmLoss } from '@shared/appearance';

// The muzzle flash draws its texture on a canvas: a do-nothing one is enough here (no WebGL, no DOM on Bun).
const g = globalThis as { document?: unknown };
const hadDocument = 'document' in g;
const ctx2d = new Proxy({} as Record<string, unknown>, { get: (t, k) => t[k as string] ?? (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}) });
if (!hadDocument) g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
afterAll(() => {
  if (!hadDocument) delete g.document;
});

/** What the test uses of the Viewmodel. */
interface ViewmodelLike {
  setBody(look: Appearance, sex: 'm' | 'f'): void;
  update(dt: number, s: Record<string, unknown>): void;
  sightCameraSpace(out: THREE.Vector3): THREE.Vector3;
}
// Loaded by path: the server's typecheck covers client/tests without the DOM types viewmodel.ts needs.
const VIEWMODEL = '../render/viewmodel';
const { Viewmodel } = (await import(VIEWMODEL)) as { Viewmodel: new (scene: THREE.Scene) => ViewmodelLike };

const state = (ads: number) => ({ ads, sprint: 0, grounded: true, speed: 0, strafe: 0, mouseDX: 0, mouseDY: 0, reload: null, slide: 0, melee: null, grenadeCook: null, grenadeThrow: null, crouch: 0 });

/** The sight in camera space after a second at `ads`. */
function sight(braco: ArmLoss, ads: number) {
  const vm = new Viewmodel(new THREE.Scene());
  const look = defaultAppearance('m');
  look.pcd.braco = braco;
  vm.setBody(look, 'm');
  for (let f = 0; f < 60; f++) vm.update(1 / 60, state(ads));
  return vm.sightCameraSpace(new THREE.Vector3());
}

describe('primeira pessoa com uma mão (PCD)', () => {
  for (const braco of ['maoDir', 'bracoDir', 'maoEsq', ''] as ArmLoss[]) {
    it(`${braco || 'sem PCD'}: mirando, o ponto da mira fica no centro da tela`, () => {
      const p = sight(braco, 1);
      expect(p.x).toBeCloseTo(0, 4);
      expect(p.y).toBeCloseTo(0, 4);
    });
  }

  it('sem a mão direita, a arma fica espelhada do lado esquerdo da tela; sem PCD, à direita', () => {
    expect(sight('maoDir', 0).x).toBeLessThan(-0.05);
    expect(sight('bracoDir', 0).x).toBeLessThan(-0.05);
    expect(sight('', 0).x).toBeGreaterThan(0.05);
    expect(sight('maoEsq', 0).x).toBeGreaterThan(0.05);
  });
});
