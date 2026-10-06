// First-person models of every weapon (primitives, like the rest of the placeholder art): the guns with the
// sight, paint job, magazine and silencer their upgrades give them, the knife's forms, and the land mine.
// Every gun is built around the same hand: its pistol grip sits where the rifle's does, so the arms, the
// first-person poses and the third-person holder fit them all.
import * as THREE from 'three';
import type { GunStats } from '@shared/arsenal';
import type { GunId, GunLook, KnifeForm, Sight } from '@shared/progression';
import type { GunHold } from '../character/animator';
import { PALETTE, toon } from './materials';

export type { GunHold };

export interface GunParts {
  /** Rigid parts, baked into one mesh by the viewmodel. */
  meshes: THREE.Mesh[];
  /** Unlit parts (red dot, reticle): kept as separate meshes so they stay bright. */
  glow: THREE.Object3D[];
  /** The magazine (animated on reloads), and its resting height. */
  mag: THREE.Mesh;
  magY: number;
  /** Height of the sight line above the gun origin: the ADS pose puts it at eye level. */
  sightY: number;
  /** How far in front of the eye the gun origin sits when aiming (a pistol is held out farther). */
  adsZ?: number;
  /** Magnified optic: the game shows a scope overlay when fully aimed. */
  scoped: boolean;
  /** Where the bullet (and the flash) comes out, in gun space. */
  muzzle: THREE.Vector3;
  hold: GunHold;
}

/** What a gun's model depends on (a GunStats has it all). */
export type GunLookKey = Pick<GunStats, 'arma' | 'mira' | 'visual' | 'silenciador' | 'pente'>;

interface Palette {
  metal: number;
  dark: number;
  furniture: number;
  stripe: number;
  optic: number;
}

const LOOKS: Record<GunLook, Palette> = {
  padrao: { metal: 0x3a3f47, dark: 0x24272c, furniture: 0x6b5a45, stripe: PALETTE.teamA, optic: 0x2a2d33 },
  fita: { metal: 0x3a3f47, dark: 0x24272c, furniture: 0x5d5347, stripe: PALETTE.teamA, optic: 0x2a2d33 },
  vovo: { metal: 0x2d3440, dark: 0x1e232b, furniture: 0x8a4f25, stripe: 0xc8a24a, optic: 0xc8a24a },
};

const glowMat = (color: number, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, blending: opacity < 1 ? THREE.AdditiveBlending : THREE.NormalBlending });

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const along = (geo: THREE.BufferGeometry) => geo.rotateX(Math.PI / 2);

/** Adds parts to a gun: lit (baked) and glowing ones. */
function builder() {
  const meshes: THREE.Mesh[] = [];
  const glow: THREE.Object3D[] = [];
  const add = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, toon(color));
    m.position.set(x, y, z);
    m.rotation.set(rx, 0, rz);
    meshes.push(m);
    return m;
  };
  const lit = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    glow.push(m);
    return m;
  };
  return { meshes, glow, add, lit };
}
type Builder = ReturnType<typeof builder>;

/**
 * The sight on top of a gun (at `z`, sitting on a surface at `baseY`); returns the sight line's height. `k`
 * scales the red dot (a pistol's is a mini one).
 */
function sight(b: Builder, kind: Sight, c: Palette, z: number, baseY: number, k = 1): number {
  const { add, lit } = b;
  if (kind === 'pontoVermelho') {
    // Small tube sight: a ring you look through (front and back rims) with a glowing dot in the middle.
    const y = baseY + 0.029 * k;
    add(box(0.03 * k, 0.014 * k, 0.05 * k), c.dark, 0, baseY + 0.001 * k, z);
    add(box(0.012 * k, 0.012 * k, 0.04 * k), c.dark, 0, baseY + 0.011 * k, z);
    for (const dz of [-0.025, 0.025]) add(new THREE.TorusGeometry(0.021 * k, 0.0035 * k, 8, 24), c.optic, 0, y, z + dz * k);
    for (const x of [-0.021, 0.021]) add(box(0.004 * k, 0.012 * k, 0.05 * k), c.optic, x * k, y, z);
    lit(new THREE.CircleGeometry(0.02 * k, 20).rotateY(Math.PI), glowMat(0xff6060, 0.12), 0, y, z - 0.024 * k);
    lit(new THREE.SphereGeometry(0.0038, 10, 8), glowMat(0xff1a1a), 0, y, z - 0.023 * k);
    return y;
  }
  if (kind === 'holo') {
    // Open window frame with a smiley reticle floating in it.
    const y = baseY + 0.035;
    add(box(0.05, 0.012, 0.06), c.dark, 0, baseY, z);
    for (const x of [-0.027, 0.027]) add(box(0.006, 0.05, 0.05), c.optic, x, baseY + 0.029, z);
    add(box(0.06, 0.006, 0.05), c.optic, 0, baseY + 0.056, z);
    const reticle = glowMat(0xffd23f);
    const face = new THREE.Group();
    face.position.set(0, y, z - 0.02);
    face.add(new THREE.Mesh(new THREE.TorusGeometry(0.0065, 0.0007, 6, 24), reticle));
    for (const x of [-0.0024, 0.0024]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0008, 6, 4), reticle);
      eye.position.set(x, 0.0018, 0);
      face.add(eye);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.0032, 0.0006, 6, 16, Math.PI), reticle);
    smile.rotation.z = Math.PI;
    smile.position.y = -0.0005;
    face.add(smile);
    b.glow.push(face);
    return y;
  }
  if (kind === 'luneta') {
    // Grandpa's brass scope. Aiming shows the scope overlay instead.
    const y = baseY + 0.044;
    const len = 0.19;
    add(along(new THREE.CylinderGeometry(0.016, 0.016, len, 16)), c.optic, 0, y, z);
    add(along(new THREE.CylinderGeometry(0.029, 0.016, 0.05, 16)), c.optic, 0, y, z - len / 2 - 0.02);
    add(along(new THREE.CylinderGeometry(0.019, 0.019, 0.04, 16)), c.optic, 0, y, z + len / 2 + 0.01);
    for (const dz of [-0.045, 0.045]) add(box(0.02, 0.05, 0.016), c.dark, 0, baseY + 0.015, z + dz);
    add(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 10), c.dark, 0.022, y, z);
    lit(new THREE.CircleGeometry(0.028, 16).rotateY(Math.PI), glowMat(0x7fb8ff, 0.35), 0, y, z - len / 2 - 0.046);
    return y;
  }
  return baseY + 0.016;
}

/** The rifle: receiver, barrel, handguard, stock; the duct-taped double mag; a soda bottle as a silencer. */
function rifle(b: Builder, g: GunLookKey): GunParts {
  const c = LOOKS[g.visual];
  const { add } = b;
  add(box(0.05, 0.07, 0.32), c.metal, 0, 0, 0); // receiver
  add(along(new THREE.CylinderGeometry(0.011, 0.011, 0.3, 8)), c.dark, 0, 0.012, -0.31); // barrel
  add(box(0.056, 0.06, 0.2), c.furniture, 0, -0.004, -0.22); // handguard
  add(box(0.045, 0.075, 0.2), c.furniture, 0, -0.012, 0.25); // stock
  add(box(0.03, 0.085, 0.042), c.furniture, 0, -0.068, 0.085, 0.35); // pistol grip
  add(box(0.052, 0.008, 0.07), c.stripe, 0, 0.039, -0.1); // stripe
  const big = g.pente > 30;
  const mag = new THREE.Mesh(box(big ? 0.07 : 0.034, 0.13, 0.06), toon(c.dark));
  mag.position.set(0, -0.09, -0.045);
  mag.rotation.x = 0.18;
  if (big) {
    // Two magazines taped side by side.
    const tape = new THREE.Mesh(box(0.074, 0.03, 0.064), toon(0xc9c9c9));
    mag.add(tape);
  }
  let sightY = 0.057;
  if (g.mira === 'ferro') {
    add(box(0.006, 0.016, 0.01), c.dark, -0.014, 0.047, 0.1);
    add(box(0.006, 0.016, 0.01), c.dark, 0.014, 0.047, 0.1);
    add(box(0.034, 0.006, 0.01), c.dark, 0, 0.041, 0.1);
    add(box(0.006, 0.03, 0.006), c.dark, 0, 0.042, -0.36); // front post, tip at y≈0.057
    add(box(0.022, 0.012, 0.012), c.dark, 0, 0.03, -0.36);
  } else sightY = sight(b, g.mira, c, 0.02, 0.041);
  if (g.visual === 'fita') {
    for (const [z, rz] of [[-0.17, 0.12], [-0.27, -0.08]] as const) add(box(0.064, 0.068, 0.022), 0xc9c9c9, 0, -0.004, z, 0, rz);
    add(box(0.053, 0.083, 0.03), 0xc9c9c9, 0, -0.012, 0.23, 0, 0.1);
  }
  const muzzle = new THREE.Vector3(0, 0.012, -0.47);
  if (g.silenciador) {
    // A 2-liter soda bottle taped to the barrel.
    add(along(new THREE.CylinderGeometry(0.026, 0.026, 0.13, 14)), 0x4fae6b, 0, 0.012, -0.53);
    add(along(new THREE.CylinderGeometry(0.012, 0.026, 0.04, 14)), 0x4fae6b, 0, 0.012, -0.47);
    add(along(new THREE.CylinderGeometry(0.0265, 0.0265, 0.05, 14)), 0xd8262d, 0, 0.012, -0.53); // label
    muzzle.z = -0.6;
  }
  return { meshes: b.meshes, glow: b.glow, mag, magY: -0.09, sightY, scoped: g.mira === 'luneta', muzzle, hold: holdOf('rifle') };
}

/** The doorman's pistol: slide, frame, grip and his ring of keys; a potato as a silencer. */
function pistol(b: Builder, g: GunLookKey): GunParts {
  const { add, lit } = b;
  const slide = 0x2f3238;
  add(box(0.032, 0.034, 0.2), slide, 0, 0.012, 0.02); // slide
  for (let k = 0; k < 4; k++) add(box(0.033, 0.024, 0.004), 0x1d1f23, 0, 0.012, 0.09 + k * 0.008); // serrations
  add(box(0.03, 0.026, 0.17), 0x24262b, 0, -0.016, 0.03); // frame
  add(box(0.03, 0.095, 0.045), 0x6b4a2e, 0, -0.068, 0.085, 0.3); // grip (wood)
  add(box(0.006, 0.02, 0.035), 0x24262b, 0, -0.04, 0.035); // trigger guard
  add(new THREE.TorusGeometry(0.012, 0.0025, 6, 14), 0xc8a24a, 0, -0.128, 0.115); // key ring
  add(box(0.004, 0.026, 0.009), 0xd9d9d9, 0, -0.152, 0.115);
  add(box(0.004, 0.02, 0.008), 0xc8a24a, 0.004, -0.148, 0.121, 0, 0.4);
  const mag = new THREE.Mesh(box(0.026, 0.03, 0.036), toon(0x1d1f23));
  mag.position.set(0, -0.112, 0.1);
  mag.rotation.x = 0.3;
  let sightY = 0.042;
  if (g.mira === 'ferro') {
    for (const x of [-0.009, 0.009]) add(box(0.006, 0.012, 0.008), 0x1d1f23, x, 0.035, 0.11);
    add(box(0.005, 0.012, 0.006), 0x1d1f23, 0, 0.035, -0.07);
    lit(new THREE.SphereGeometry(0.0022, 6, 4), glowMat(0x7dff6a), 0, 0.042, -0.072);
  } else sightY = sight(b, g.mira, LOOKS.padrao, 0.04, 0.029, 0.65);
  const muzzle = new THREE.Vector3(0, 0.012, -0.085);
  if (g.silenciador) {
    // A potato on the muzzle, as seen in the movies.
    add(new THREE.SphereGeometry(0.034, 10, 8).scale(1, 0.85, 1.35), 0xa8793f, 0, 0.012, -0.12);
    for (const [x, y, z] of [[0.02, 0.03, -0.11], [-0.025, 0.0, -0.14], [0.01, -0.02, -0.15]]) add(new THREE.SphereGeometry(0.004, 5, 4), 0x6e4a22, x, y, z);
    muzzle.z = -0.165;
  }
  return { meshes: b.meshes, glow: b.glow, mag, magY: -0.112, sightY, adsZ: -0.46, scoped: false, muzzle, hold: holdOf('pistola') };
}

/** The blender SMG: appliance-white body with a speed dial, foregrip, wire stock; a popcorn drum. */
function smg(b: Builder, g: GunLookKey): GunParts {
  const { add } = b;
  const body = 0xe9e4d6;
  const red = 0xd8262d;
  add(box(0.048, 0.062, 0.25), body, 0, 0, -0.01); // receiver
  add(box(0.05, 0.01, 0.25), red, 0, 0.03, -0.01); // red top stripe
  add(along(new THREE.CylinderGeometry(0.013, 0.013, 0.12, 10)), 0x2a2d33, 0, 0.012, -0.19); // barrel
  add(along(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 12)), 0xb8bcc4, 0, 0.012, -0.15); // barrel shroud
  add(box(0.024, 0.07, 0.026), 0x2a2d33, 0, -0.06, -0.13, -0.1); // foregrip
  add(box(0.03, 0.085, 0.042), 0x2a2d33, 0, -0.068, 0.085, 0.35); // pistol grip
  // Speed dial on the side (1 to 5).
  add(new THREE.CylinderGeometry(0.014, 0.014, 0.008, 14).rotateZ(Math.PI / 2), 0x2a2d33, 0.028, -0.005, 0.05);
  add(box(0.004, 0.004, 0.012), red, 0.033, 0.0, 0.045);
  // Wire stock.
  for (const y of [0.012, -0.03]) add(box(0.008, 0.008, 0.2), 0x8a8f99, 0, y, 0.21);
  add(box(0.012, 0.06, 0.012), 0x8a8f99, 0, -0.009, 0.31);
  const drum = g.pente > 40;
  let mag: THREE.Mesh;
  if (drum) {
    // Popcorn-maker drum: red and white stripes.
    mag = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.045, 18).rotateZ(Math.PI / 2), toon(0xf4efe6));
    for (const dx of [-0.016, 0.016]) mag.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0555, 0.0555, 0.008, 18).rotateZ(Math.PI / 2).translate(dx, 0, 0), toon(red)));
    mag.position.set(0, -0.095, -0.04);
  } else {
    mag = new THREE.Mesh(box(0.03, 0.15, 0.04), toon(0x2a2d33));
    mag.position.set(0, -0.1, -0.04);
    mag.rotation.x = 0.08;
  }
  let sightY = 0.054;
  if (g.mira === 'ferro') {
    add(box(0.02, 0.016, 0.008), 0x2a2d33, 0, 0.043, 0.08);
    add(box(0.005, 0.02, 0.006), 0x2a2d33, 0, 0.044, -0.12);
  } else sightY = sight(b, g.mira, LOOKS.padrao, 0.0, 0.041);
  return { meshes: b.meshes, glow: b.glow, mag, magY: mag.position.y, sightY, adsZ: -0.42, scoped: false, muzzle: new THREE.Vector3(0, 0.012, -0.26), hold: holdOf('smg') };
}

/** How each gun is held (where the support hand goes, first and third person). */
export const holdOf = (gun: GunId): GunHold => (gun === 'pistola' ? 'pistola' : gun === 'smg' ? 'curta' : 'longa');

/** The model of a gun as its upgrades make it (sight, paint job, magazine, silencer). */
export function gunParts(g: GunLookKey): GunParts {
  const b = builder();
  return g.arma === 'pistola' ? pistol(b, g) : g.arma === 'smg' ? smg(b, g) : rifle(b, g);
}

/** Cache key of a gun's model: everything gunParts looks at. */
export const gunModelKey = (g: GunLookKey) => `${g.arma}|${g.mira}|${g.visual}|${g.silenciador ? 1 : 0}|${g.pente}`;

/** What the knife's hand swings, pointing down -Z from the fist at the origin. */
export function knifeModel(form: KnifeForm): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  if (form === 'faca') {
    add(new THREE.BoxGeometry(0.012, 0.035, 0.2), toon(0xd8dde3), 0, 0, -0.14);
    add(new THREE.ConeGeometry(0.018, 0.06, 4).rotateX(-Math.PI / 2).scale(0.4, 1, 1), toon(0xd8dde3), 0, 0, -0.27);
    add(new THREE.BoxGeometry(0.02, 0.06, 0.015), toon(0x24272c), 0, 0, -0.035);
    add(new THREE.BoxGeometry(0.026, 0.032, 0.1), toon(0x3b2a1e), 0, 0, 0.02);
  } else if (form === 'frango') {
    // Yellow rubber chicken held by the feet: long floppy body, skinny neck, red comb, open beak.
    const yellow = toon(0xffd83a);
    const orange = toon(0xff8a1f);
    add(along(new THREE.CylinderGeometry(0.006, 0.006, 0.05)), orange, -0.008, 0, -0.02);
    add(along(new THREE.CylinderGeometry(0.006, 0.006, 0.05)), orange, 0.008, 0, -0.02);
    add(new THREE.SphereGeometry(0.042, 12, 10).scale(1, 0.9, 1.8), yellow, 0, 0, -0.12);
    for (const x of [-0.04, 0.04]) add(new THREE.SphereGeometry(0.022, 8, 6).scale(0.4, 0.8, 1.4), yellow, x, 0.005, -0.12);
    add(along(new THREE.CapsuleGeometry(0.014, 0.1, 4, 8)), yellow, 0, 0.005, -0.25);
    add(new THREE.SphereGeometry(0.026, 10, 8), yellow, 0, 0.012, -0.32);
    for (let k = 0; k < 3; k++) add(new THREE.SphereGeometry(0.009, 6, 4), toon(0xe0263b), 0, 0.036 + (k === 1 ? 0.006 : 0), -0.31 - k * 0.012);
    add(new THREE.ConeGeometry(0.012, 0.03, 6).rotateX(-Math.PI / 2), orange, 0, 0.008, -0.35);
    for (const x of [-0.012, 0.012]) add(new THREE.SphereGeometry(0.004, 6, 4), toon(0x111111), x, 0.02, -0.335);
  } else {
    // Knock-off lightsaber: silver hilt, hot pink blade with a soft glow.
    add(along(new THREE.CylinderGeometry(0.015, 0.015, 0.13, 12)), toon(0xc9ccd1), 0, 0, 0.0);
    for (const z of [0.02, -0.01, -0.04]) add(along(new THREE.CylinderGeometry(0.0165, 0.0165, 0.012, 12)), toon(0x1c1c20), 0, 0, z);
    add(along(new THREE.CylinderGeometry(0.011, 0.009, 0.55, 12)), glowMat(0xffe6fb), 0, 0, -0.34);
    add(along(new THREE.CylinderGeometry(0.024, 0.02, 0.57, 12)), glowMat(0xff3df0, 0.35), 0, 0, -0.34);
  }
  return g;
}

/** Land mine: olive disc with a pressure plate and a red LED (returned so it can blink). */
export function mineModel(): { group: THREE.Group; led: THREE.Mesh } {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.06, 20), toon(0x4a5a32));
  body.position.y = 0.03;
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16), toon(0x6f7d52));
  plate.position.y = 0.07;
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  led.position.set(0.11, 0.065, 0);
  g.add(body, plate, led);
  g.traverse((o) => (o.castShadow = true));
  return { group: g, led };
}
