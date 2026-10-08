// Switching guns in first person (PF-34, client/render/viewmodel.ts): a switch creates and disposes nothing (the
// arms keep their one material, which dropped and recompiled its shader on every switch between a rifle and a
// pistol), the support hand shows the pose of the gun in hand (also with PCD), and the warm-up at the start of a
// match shows everything for one compile and puts it all back.
import * as THREE from 'three';
import { afterAll, describe, expect, it } from 'bun:test';
import { defaultAppearance, type Appearance, type ArmLoss } from '@shared/appearance';
import { gunStats, type GunStats } from '@shared/arsenal';

// The muzzle flash draws its texture on a canvas: a do-nothing one is enough here (no WebGL, no DOM on Bun).
const g = globalThis as { document?: unknown };
const hadDocument = 'document' in g;
const ctx2d = new Proxy({} as Record<string, unknown>, { get: (t, k) => t[k as string] ?? (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}) });
if (!hadDocument) g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
afterAll(() => {
  if (!hadDocument) delete g.document;
});

type V3 = [number, number, number];
/** What the test uses of the Viewmodel. */
interface ViewmodelLike {
  readonly root: THREE.Group;
  setBody(look: Appearance, sex: 'm' | 'f'): void;
  setGun(g: GunStats): void;
  prepare(g: GunStats): void;
  warmup(compile: () => void): void;
  update(dt: number, s: Record<string, unknown>): void;
}
// Loaded by path: the server's typecheck covers client/tests without the DOM types viewmodel.ts needs.
const VIEWMODEL = '../render/viewmodel';
const { Viewmodel, VM_FEEL } = (await import(VIEWMODEL)) as {
  Viewmodel: new (scene: THREE.Scene) => ViewmodelLike;
  VM_FEEL: { arms: Record<'right' | 'left' | 'pistolLeft', { wrist: V3 }> };
};

const RIFLE = gunStats('rifle');
const PISTOL = gunStats('pistola');
const SMG = gunStats('smg');
const REVOLVER = gunStats('revolver');
const GUNS = [RIFLE, PISTOL, SMG, REVOLVER];

const state = { ads: 0, sprint: 0, grounded: true, speed: 0, strafe: 0, mouseDX: 0, mouseDY: 0, reload: null, slide: 0, melee: null, grenadeCook: null, grenadeThrow: null, crouch: 0 };

function viewmodel(braco: ArmLoss = '', look = defaultAppearance('m')) {
  const vm = new Viewmodel(new THREE.Scene());
  look.pcd.braco = braco;
  vm.setBody(look, 'm');
  return vm;
}

const meshes = (root: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
};
/** The arms: the meshes in the character's painted material (with its tint uniforms). */
const isArm = (m: THREE.Mesh) => !!(m.material as THREE.Material).userData?.uniforms;
/** On screen: it and every parent up to the root are visible. */
const shown = (o: THREE.Object3D, root: THREE.Object3D) => {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    if (!p.visible) return false;
    if (p === root) return true;
  }
  return true;
};

/** Every material, geometry and arm mesh in the viewmodel now, added to `into`. */
function collect(vm: ViewmodelLike, into = { mats: new Set<THREE.Material>(), geos: new Set<THREE.BufferGeometry>(), arms: new Set<THREE.Mesh>() }) {
  for (const m of meshes(vm.root)) {
    into.geos.add(m.geometry);
    for (const mat of [m.material].flat()) into.mats.add(mat);
    if (isArm(m)) into.arms.add(m);
  }
  return into;
}

const at = (wrists: THREE.Vector3[], w: V3) => wrists.some((p) => p.distanceTo(new THREE.Vector3(...w)) < 1e-6);
/** Where the wrists of the arms on screen are (gun space), holding `gun`. */
function wristsWith(vm: ViewmodelLike, gun: GunStats) {
  vm.setGun(gun);
  vm.update(1 / 60, state);
  return meshes(vm.root)
    .filter((m) => isArm(m) && shown(m, vm.root))
    .map((m) => m.position.clone());
}

describe('troca de arma em primeira pessoa (PF-34)', () => {
  it('50 trocas entre rifle, pistola, SMG e revólver não criam nem descartam nada', () => {
    const vm = viewmodel();
    const first = collect(vm);
    for (const gun of GUNS) {
      vm.setGun(gun);
      collect(vm, first);
    }
    let disposed = 0;
    for (const m of first.mats) m.addEventListener('dispose', () => disposed++);
    for (const geo of first.geos) geo.addEventListener('dispose', () => disposed++);
    const later = collect(vm);
    for (let i = 0; i < 50; i++) {
      vm.setGun(GUNS[i % GUNS.length]);
      vm.update(1 / 60, state);
      collect(vm, later);
    }
    expect(disposed).toBe(0);
    expect([...later.mats].every((m) => first.mats.has(m))).toBe(true);
    expect([...later.geos].every((geo) => first.geos.has(geo))).toBe(true);
    expect(later.mats.size).toBe(first.mats.size);
    expect(later.geos.size).toBe(first.geos.size);
    // The same arms throughout (no rebuild on a switch), all four (and the support hand's second pose) in one material.
    expect([...later.arms].every((a) => first.arms.has(a))).toBe(true);
    expect(new Set([...first.arms].map((a) => a.material)).size).toBe(1);
  });

  const A = VM_FEEL.arms;
  // Mirrored (no right hand) the left hand holds the grip and there is no support hand; no left arm, none either.
  const support: [ArmLoss, boolean][] = [['', true], ['maoEsq', true], ['maoDir', false], ['bracoEsq', false]];
  for (const [braco, hasSupport] of support) {
    it(`${braco || 'sem PCD'}: a mão de apoio fica no punho da pistola com a pistola e no guarda-mão com o rifle`, () => {
      const vm = viewmodel(braco);
      for (let round = 0; round < 3; round++) {
        const rifle = wristsWith(vm, RIFLE);
        expect(at(rifle, A.left.wrist)).toBe(hasSupport);
        expect(at(rifle, A.pistolLeft.wrist)).toBe(false);
        const pistol = wristsWith(vm, PISTOL);
        expect(at(pistol, A.pistolLeft.wrist)).toBe(hasSupport);
        expect(at(pistol, A.left.wrist)).toBe(false);
        // The SMG's foregrip is a handguard pose.
        const smg = wristsWith(vm, SMG);
        expect(at(smg, A.left.wrist)).toBe(hasSupport);
        expect(at(smg, A.pistolLeft.wrist)).toBe(false);
        // The hand on the grip is always there.
        expect(at(rifle, A.right.wrist) && at(pistol, A.right.wrist)).toBe(true);
      }
    });
  }

  it('setBody duas vezes mantém o mesmo material dos braços, com as cores novas', () => {
    const vm = viewmodel();
    const before = collect(vm).arms;
    const mat = [...before][0].material as THREE.Material & { userData: { uniforms: { uTints: { value: THREE.Color[] } } } };
    const look = defaultAppearance('m');
    look.pele = '#5a3a22';
    vm.setBody(look, 'm');
    const after = collect(vm).arms;
    expect(new Set([...after].map((a) => a.material))).toEqual(new Set([mat]));
    const skin = new THREE.Color(look.pele).getHex();
    expect(mat.userData.uniforms.uTints.value.some((c) => c.getHex() === skin)).toBe(true);
  });

  it('o aquecimento mostra as armas preparadas, a faca e a granada durante o compile e devolve tudo como estava', () => {
    const vm = viewmodel();
    vm.prepare(PISTOL);
    vm.prepare(SMG);
    vm.setGun(RIFLE);
    vm.update(1 / 60, state);
    vm.root.visible = false;
    const objects = (root: THREE.Object3D) => {
      const all: THREE.Object3D[] = [];
      root.traverse((o) => all.push(o));
      return all;
    };
    const before = new Map(objects(vm.root).map((o) => [o, o.visible]));
    let during: { hidden: number; geos: number; arms: number } | null = null;
    vm.warmup(() => {
      const all = meshes(vm.root);
      during = { hidden: all.filter((m) => !shown(m, vm.root)).length, geos: new Set(all.map((m) => m.geometry)).size, arms: all.filter(isArm).length };
    });
    expect(during).not.toBeNull();
    const d = during!;
    // Everything on screen for the compile: the three guns, both support hand poses, the knife and the grenade.
    expect(d.hidden).toBe(0);
    expect(d.geos).toBeGreaterThan(collect(vm).geos.size);
    expect(d.arms).toBe(5);
    // Then back as it was: the same objects, each as visible as before (the viewmodel itself hidden).
    const after = objects(vm.root);
    expect(after.length).toBe(before.size);
    for (const o of after) expect(o.visible).toBe(before.get(o)!);
  });
});
