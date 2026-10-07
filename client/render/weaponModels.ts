// First-person models of every weapon (primitives, like the rest of the placeholder art): the guns with the
// sight, magazine and silencer their upgrades give them and each rifle's own paint job, every knife, and the
// land mine. The old rifles' paint jobs, the magnified sights and the old knives came back from the first
// versions of the game (PF-8); the stapler, the revolver, the drill, the garrucha and the hand cannon joined the
// secondaries in PF-10, each with its own builder (GUN_MODELS) in the pistol's hand.
// Every gun is built around the same hand: its pistol grip sits where the rifle's does, so the arms, the
// first-person poses and the third-person holder fit them all.
import * as THREE from 'three';
import type { GunStats } from '@shared/arsenal';
import { GUN_DATA_ID, type GunId, type GunLook, type KnifeId, type Sight } from '@shared/progression';
import { WEAPONS } from '@shared/weapons';
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
  tia: { metal: 0xe9e4ee, dark: 0x6b4a6e, furniture: 0xff8fc8, stripe: 0x7fe0c8, optic: 0x8a5a8e },
  natal: { metal: 0x3a3f47, dark: 0x24272c, furniture: 0xc0392b, stripe: 0x2e8b57, optic: 0x2a2d33 },
  chamas: { metal: 0x1f1f23, dark: 0x141417, furniture: 0x2b2b30, stripe: 0xff6a1a, optic: 0x1a1a1e },
  vovo: { metal: 0x2d3440, dark: 0x1e232b, furniture: 0x8a4f25, stripe: 0xc8a24a, optic: 0xc8a24a },
  ouro: { metal: 0xf2c230, dark: 0xb8860b, furniture: 0xd9a520, stripe: 0xfff1a8, optic: 0xe0b020 },
};

/** A magnified sight (the game shows the scope overlay when fully aimed through it). */
export const isScope = (kind: Sight) => kind.startsWith('luneta');

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
  if (kind === 'holo' || kind === 'holoLupa') {
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
    if (kind === 'holoLupa') {
      // Flip magnifier behind the holo: a short tube the eye looks through.
      add(along(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 16, 1, true)), c.optic, 0, y, z + 0.09);
      add(box(0.012, 0.03, 0.02), c.dark, 0, baseY + 0.009, z + 0.09);
    }
    return y;
  }
  if (isScope(kind)) {
    // Brass scopes, longer and bigger with the magnification (2x, grandpa's 3x, 4x). Aiming shows the scope
    // overlay instead.
    const power = kind === 'luneta2x' ? 1 : kind === 'luneta4x' ? 1.35 : 1.2;
    const y = baseY + 0.044;
    const len = 0.16 * power;
    add(along(new THREE.CylinderGeometry(0.016, 0.016, len, 16)), c.optic, 0, y, z);
    add(along(new THREE.CylinderGeometry(0.024 * power, 0.016, 0.05, 16)), c.optic, 0, y, z - len / 2 - 0.02);
    add(along(new THREE.CylinderGeometry(0.019, 0.019, 0.04, 16)), c.optic, 0, y, z + len / 2 + 0.01);
    for (const dz of [-0.045, 0.045]) add(box(0.02, 0.05, 0.016), c.dark, 0, baseY + 0.015, z + dz);
    add(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 10), c.dark, 0.022, y, z);
    lit(new THREE.CircleGeometry(0.023 * power, 16).rotateY(Math.PI), glowMat(0x7fb8ff, 0.35), 0, y, z - len / 2 - 0.046);
    return y;
  }
  return baseY + 0.016;
}

/**
 * The rifle (every rifle of the primary slot): receiver, barrel, handguard, stock, painted and decorated as
 * each one is; the duct-taped double mag; a soda bottle as a silencer.
 */
function rifle(b: Builder, g: GunLookKey): GunParts {
  const c = LOOKS[g.visual] ?? LOOKS.padrao;
  const { add, lit } = b;
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
  // Paint jobs (each rifle's own).
  if (g.visual === 'fita') {
    for (const [z, rz] of [[-0.17, 0.12], [-0.27, -0.08]] as const) add(box(0.064, 0.068, 0.022), 0xc9c9c9, 0, -0.004, z, 0, rz);
    add(box(0.053, 0.083, 0.03), 0xc9c9c9, 0, -0.012, 0.23, 0, 0.1);
  } else if (g.visual === 'tia') {
    // Flower sticker on the stock.
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      add(new THREE.SphereGeometry(0.009, 8, 6), 0xffffff, 0.024, -0.01 + Math.sin(a) * 0.012, 0.25 + Math.cos(a) * 0.012);
    }
    add(new THREE.SphereGeometry(0.008, 8, 6), 0xffd23f, 0.026, -0.01, 0.25);
  } else if (g.visual === 'natal') {
    // Blinking-looking string of lights along the handguard and barrel.
    const colors = [0xff3b3b, 0x3bff6a, 0xffe14d, 0x4fa3ff];
    for (let k = 0; k < 9; k++) {
      const z = -0.12 - k * 0.035;
      const x = (k % 2 ? 1 : -1) * 0.022;
      const y = k < 5 ? 0.03 : 0.024;
      add(box(0.004, 0.004, 0.036), 0x1a3a1a, x * 0.5, y + 0.002, z + 0.017);
      lit(new THREE.SphereGeometry(0.0065, 8, 6), glowMat(colors[k % colors.length]), x, y, z);
    }
  } else if (g.visual === 'chamas') {
    // Flame stickers: +10 speed, everybody knows.
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const flame = new THREE.ConeGeometry(0.012, 0.05 - k * 0.008, 3).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).scale(0.3, 1, 1);
        add(flame, k === 1 ? 0xffd23f : 0xff6a1a, side * 0.027, -0.012 + k * 0.012, 0.02 + k * 0.03);
      }
    }
  } else if (g.visual === 'ouro') {
    // Gold all over, with a ruby on each side.
    for (const side of [-1, 1]) add(new THREE.OctahedronGeometry(0.009), 0xff2a4a, side * 0.027, 0.005, 0.05);
  }
  const muzzle = new THREE.Vector3(0, 0.012, -0.47);
  if (g.silenciador) {
    // A 2-liter soda bottle taped to the barrel.
    add(along(new THREE.CylinderGeometry(0.026, 0.026, 0.13, 14)), 0x4fae6b, 0, 0.012, -0.53);
    add(along(new THREE.CylinderGeometry(0.012, 0.026, 0.04, 14)), 0x4fae6b, 0, 0.012, -0.47);
    add(along(new THREE.CylinderGeometry(0.0265, 0.0265, 0.05, 14)), 0xd8262d, 0, 0.012, -0.53); // label
    muzzle.z = -0.6;
  }
  return { meshes: b.meshes, glow: b.glow, mag, magY: -0.09, sightY, scoped: isScope(g.mira), muzzle, hold: holdOf('rifle') };
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

// --- The newer secondaries (PF-10). All of them sit in the pistol's hand: the grip where the pistol's is. ---

/** 3×5 pixel letters for the decals made of tiny boxes ("RH", "NO PAIN NO GAIN"). */
const PIXEL_FONT: Record<string, string[]> = {
  A: ['010', '101', '111', '101', '101'],
  G: ['011', '100', '101', '101', '011'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  N: ['101', '111', '111', '111', '101'],
  O: ['111', '101', '101', '101', '111'],
  P: ['110', '101', '110', '100', '100'],
  R: ['110', '101', '110', '101', '101'],
};

/**
 * Words on the gun's left side (the one the first-person camera sees), in boxes of `px` meters, reading from
 * `z` toward the back (+Z), the top of the letters at `y`.
 */
function pixelText(b: Builder, text: string, color: number, x: number, y: number, z: number, px: number) {
  [...text].forEach((ch, i) => {
    const rows = PIXEL_FONT[ch];
    if (!rows) return;
    rows.forEach((row, r) => {
      for (let c = 0; c < 3; c++) if (row[c] === '1') b.add(box(0.0012, px, px), color, x, y - (r + 0.5) * px, z + (i * 4 + c + 0.5) * px);
    });
  });
}

/** The pistol's grip, where every secondary of the pistol's hand has its own. */
const pistolGrip = (b: Builder, color: number) => b.add(box(0.03, 0.095, 0.045), color, 0, -0.068, 0.085, 0.3);

/** The potato silencer (the pistol's Batata upgrade) on a muzzle at `z`, `y`; returns where the shot comes out. */
function potato(b: Builder, y: number, z: number): number {
  b.add(new THREE.SphereGeometry(0.034, 10, 8).scale(1, 0.85, 1.35), 0xa8793f, 0, y, z - 0.035);
  for (const [x, dy, dz] of [[0.02, 0.018, -0.025], [-0.025, -0.012, -0.055], [0.01, -0.032, -0.065]]) b.add(new THREE.SphereGeometry(0.004, 5, 4), 0x6e4a22, x, y + dy, z + dz);
  return z - 0.08;
}

/** Iron sights of a pistol-sized gun: rear notch at `rearZ`, front post at `frontZ`, on a top at `top`. */
function pistolIrons(b: Builder, top: number, rearZ: number, frontZ: number, color = 0x1d1f23): number {
  for (const x of [-0.009, 0.009]) b.add(box(0.006, 0.012, 0.008), color, x, top + 0.006, rearZ);
  b.add(box(0.005, 0.012, 0.006), color, 0, top + 0.006, frontZ);
  return top + 0.013;
}

/** The HR stapler: grey base, black arm with an "RH" label and a yellow post-it, the staple strip as the magazine. */
function stapler(b: Builder, g: GunLookKey): GunParts {
  const { add } = b;
  const grey = 0x8f949b;
  const black = 0x1f2125;
  add(box(0.044, 0.02, 0.24), grey, 0, -0.02, 0.0); // base
  add(box(0.04, 0.006, 0.05), grey, 0, -0.033, -0.095); // anvil under the mouth
  add(box(0.038, 0.032, 0.225), black, 0, 0.012, -0.002); // top arm
  add(box(0.034, 0.008, 0.2), 0x2c2f34, 0, 0.031, 0.0); // rounded top
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.046, 12).rotateZ(Math.PI / 2), grey, 0, 0.0, 0.11); // hinge
  add(box(0.02, 0.012, 0.012), 0xc9ccd1, 0, 0.0, -0.115); // the mouth's steel lip
  pistolGrip(b, black);
  add(box(0.006, 0.02, 0.035), black, 0, -0.04, 0.035); // trigger guard
  // "RH" on a white label, a yellow post-it slapped on top ("urgente").
  add(box(0.0012, 0.02, 0.034), 0xf4f1e8, -0.0196, 0.014, -0.03);
  pixelText(b, 'RH', 0xc8102e, -0.0205, 0.021, -0.041, 0.0026);
  add(box(0.034, 0.002, 0.034), 0xffe14d, 0, 0.036, 0.045, 0, 0.12);
  add(box(0.02, 0.0022, 0.003), 0x5a5a5a, 0.002, 0.0365, 0.04, 0, 0.12);
  // Staple strip (the magazine): a silver bar slid into the base.
  const mag = new THREE.Mesh(box(0.024, 0.022, 0.07), toon(0xc9ccd1));
  mag.position.set(0, -0.042, -0.03);
  let sightY = 0.048;
  const muzzle = new THREE.Vector3(0, -0.004, -0.125);
  if (g.mira === 'ferro') sightY = pistolIrons(b, 0.035, 0.09, -0.09, black);
  else sightY = sight(b, g.mira, LOOKS.padrao, 0.03, 0.035, 0.65);
  if (g.silenciador) muzzle.z = potato(b, muzzle.y, -0.12);
  return { meshes: b.meshes, glow: b.glow, mag, magY: mag.position.y, sightY, adsZ: -0.46, scoped: false, muzzle, hold: holdOf('grampeador') };
}

/** The square-dance sheriff's revolver: long barrel, cylinder, wooden grip, a tin star and a checkered kerchief. */
function revolverModel(b: Builder, g: GunLookKey): GunParts {
  const { add } = b;
  const steel = 0x50545c;
  const dark = 0x2a2c31;
  add(box(0.03, 0.04, 0.09), steel, 0, 0.004, 0.06); // frame
  add(box(0.028, 0.014, 0.05), steel, 0, 0.026, 0.07); // top strap
  add(along(new THREE.CylinderGeometry(0.009, 0.01, 0.26, 12)), dark, 0, 0.018, -0.12); // long barrel
  add(box(0.012, 0.012, 0.25), steel, 0, 0.008, -0.12); // ejector rod under it
  add(box(0.008, 0.016, 0.02), dark, 0, 0.03, 0.115, -0.5); // hammer
  add(box(0.006, 0.022, 0.032), dark, 0, -0.03, 0.05); // trigger guard
  add(box(0.032, 0.1, 0.044), 0x7a4a24, 0, -0.07, 0.1, 0.42); // wooden grip
  add(box(0.033, 0.02, 0.03), 0x5c3519, 0, -0.115, 0.125, 0.42); // grip butt
  // The cylinder (the "magazine": it swings down on a reload).
  const mag = new THREE.Mesh(along(new THREE.CylinderGeometry(0.024, 0.024, 0.048, 12)), toon(steel));
  mag.position.set(0, 0.004, 0.03);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const flute = new THREE.Mesh(along(new THREE.CylinderGeometry(0.005, 0.005, 0.05, 6)), toon(dark));
    flute.position.set(Math.cos(a) * 0.022, Math.sin(a) * 0.022, 0);
    mag.add(flute);
  }
  // Tin sheriff star on the frame, and the festa junina kerchief (red and white squares) tied under the barrel.
  const star = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? 0.006 : 0.014;
    const a = (k / 10) * Math.PI * 2 + Math.PI / 2;
    if (k === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  add(new THREE.ExtrudeGeometry(star, { depth: 0.002, bevelEnabled: false }).rotateY(-Math.PI / 2), 0xd9d9d9, -0.0155, 0.004, 0.072);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) add(box(0.03 - r * 0.008, 0.012, 0.012), (r + c) % 2 ? 0xffffff : 0xd8262d, 0, -0.008 - r * 0.012, -0.06 - c * 0.012);
  }
  add(new THREE.SphereGeometry(0.008, 8, 6), 0xd8262d, 0, 0.004, -0.06); // the knot
  let sightY = 0.04;
  if (g.mira === 'ferro') {
    add(box(0.004, 0.012, 0.008), dark, 0, 0.03, -0.245); // front blade
    add(box(0.016, 0.006, 0.008), dark, 0, 0.034, 0.09); // rear notch
    sightY = 0.036;
  } else sightY = sight(b, g.mira, LOOKS.padrao, 0.07, 0.033, 0.65);
  const muzzle = new THREE.Vector3(0, 0.018, -0.252);
  if (g.silenciador) muzzle.z = potato(b, 0.018, -0.25);
  return { meshes: b.meshes, glow: b.glow, mag, magY: mag.position.y, sightY, adsZ: -0.5, scoped: false, muzzle, hold: holdOf('revolver') };
}

/** The neighbor's cordless drill: yellow and black body, the bit as the barrel, the battery as the magazine. */
function drill(b: Builder, g: GunLookKey): GunParts {
  const { add } = b;
  const yellow = 0xf2c230;
  const black = 0x1e1f22;
  add(along(new THREE.CylinderGeometry(0.027, 0.025, 0.15, 16)), yellow, 0, 0.005, 0.02); // motor housing
  add(along(new THREE.CylinderGeometry(0.026, 0.026, 0.024, 16)), 0x3a3b3f, 0, 0.005, 0.105); // vented back cap
  for (let k = 0; k < 4; k++) add(box(0.054, 0.004, 0.003), black, 0, 0.005 - 0.012 + k * 0.008, 0.106);
  add(along(new THREE.CylinderGeometry(0.024, 0.028, 0.03, 14)), black, 0, 0.005, -0.07); // clutch ring
  add(along(new THREE.CylinderGeometry(0.014, 0.02, 0.04, 12)), 0x3a3b3f, 0, 0.005, -0.105); // chuck
  add(along(new THREE.CylinderGeometry(0.0035, 0.004, 0.11, 8)), 0xc9ccd1, 0, 0.005, -0.18); // the bit
  add(box(0.004, 0.004, 0.09), 0x9aa0a8, 0, 0.005, -0.18, 0, 0.785); // its spiral (a twist of steel)
  add(box(0.03, 0.1, 0.044), black, 0, -0.07, 0.08, 0.2); // handle
  add(box(0.031, 0.06, 0.02), yellow, 0, -0.06, 0.1, 0.2); // rubber back of the handle
  add(box(0.012, 0.02, 0.016), 0xd8262d, 0, -0.035, 0.05); // trigger
  add(box(0.038, 0.01, 0.014), 0x3a3b3f, 0, -0.024, 0.06); // forward/reverse switch, over the trigger
  // Battery pack (the magazine), with its yellow stripe.
  const mag = new THREE.Mesh(box(0.05, 0.035, 0.085), toon(black));
  mag.add(new THREE.Mesh(box(0.052, 0.008, 0.087), toon(yellow)));
  mag.position.set(0, -0.135, 0.095);
  let sightY = 0.045;
  if (g.mira === 'ferro') sightY = pistolIrons(b, 0.032, 0.08, -0.04, black);
  else sightY = sight(b, g.mira, LOOKS.padrao, 0.03, 0.032, 0.8);
  return { meshes: b.meshes, glow: b.glow, mag, magY: mag.position.y, sightY, adsZ: -0.44, scoped: false, muzzle: new THREE.Vector3(0, 0.005, -0.24), hold: holdOf('furadeira') };
}

/** The cangaceiro's double-barrel: two barrels, a curved leather-wrapped grip with stars and half moons, a red kerchief. */
function garruchaModel(b: Builder, g: GunLookKey): GunParts {
  const { add } = b;
  const steel = 0x3b3e44;
  const wood = 0x8a5a2b;
  const leather = 0x6b3e1e;
  const gold = 0xe0b53a;
  for (const x of [-0.0125, 0.0125]) add(along(new THREE.CylinderGeometry(0.01, 0.01, 0.22, 12)), steel, x, 0.016, -0.08); // barrels
  for (const x of [-0.0125, 0.0125]) add(new THREE.CircleGeometry(0.0065, 10).rotateY(Math.PI), 0x111111, x, 0.016, -0.1905); // their two dark mouths
  add(box(0.012, 0.006, 0.2), steel, 0, 0.026, -0.075); // rib between them
  add(box(0.04, 0.03, 0.06), steel, 0, 0.008, 0.055); // breech
  add(box(0.034, 0.022, 0.1), wood, 0, -0.006, -0.04); // fore-end
  for (const x of [-0.009, 0.009]) add(box(0.006, 0.02, 0.01), steel, x, 0.03, 0.08, -0.6); // hammers
  add(box(0.006, 0.02, 0.03), steel, 0, -0.022, 0.06); // trigger guard
  // Curved grip wrapped in leather, ending in a round knob.
  add(box(0.032, 0.04, 0.045), leather, 0, -0.02, 0.085, 0.25);
  add(box(0.032, 0.045, 0.045), leather, 0, -0.06, 0.098, 0.55);
  add(box(0.032, 0.04, 0.044), leather, 0, -0.095, 0.122, 0.95);
  add(new THREE.SphereGeometry(0.02, 10, 8), wood, 0, -0.112, 0.145);
  // The leather's tooling: gold stars and a half moon on the side; brass studs on the breech.
  const star = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? 0.0035 : 0.008;
    const a = (k / 10) * Math.PI * 2 + Math.PI / 2;
    if (k === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  for (const [y, z] of [[-0.03, 0.082], [-0.09, 0.118]]) add(new THREE.ExtrudeGeometry(star, { depth: 0.0015, bevelEnabled: false }).rotateY(-Math.PI / 2), gold, -0.017, y, z);
  add(new THREE.TorusGeometry(0.009, 0.0022, 6, 14, Math.PI).rotateY(Math.PI / 2), gold, -0.017, -0.062, 0.1, 0, 0.6);
  for (const z of [0.035, 0.075]) add(new THREE.SphereGeometry(0.003, 6, 4), gold, -0.02, 0.008, z);
  // The red kerchief tied around the grip, its tails hanging.
  add(box(0.036, 0.014, 0.05), 0xc8102e, 0, -0.045, 0.092, 0.4);
  add(box(0.004, 0.035, 0.014), 0xc8102e, -0.02, -0.07, 0.07, 0.2, 0.15);
  add(box(0.004, 0.03, 0.012), 0xa80d26, -0.02, -0.068, 0.085, -0.15, 0.15);
  // The two shells at the breech are its "magazine" (they come out on a reload).
  const mag = new THREE.Mesh(box(0.03, 0.012, 0.012), toon(0xc8a24a));
  mag.position.set(0, 0.016, 0.03);
  let sightY = 0.04;
  if (g.mira === 'ferro') {
    add(new THREE.SphereGeometry(0.003, 6, 4), gold, 0, 0.032, -0.185); // bead
    add(box(0.014, 0.006, 0.006), steel, 0, 0.034, 0.07); // rear notch
    sightY = 0.035;
  } else sightY = sight(b, g.mira, LOOKS.padrao, 0.04, 0.029, 0.65);
  const muzzle = new THREE.Vector3(0, 0.016, -0.195);
  if (g.silenciador) muzzle.z = potato(b, 0.016, -0.19);
  return { meshes: b.meshes, glow: b.glow, mag, magY: mag.position.y, sightY, adsZ: -0.46, scoped: false, muzzle, hold: holdOf('garrucha') };
}

/** The gym bro's hand cannon: chrome, chunky, a sweatband on the grip and a "NO PAIN NO GAIN" sticker. */
function handCannon(b: Builder, g: GunLookKey): GunParts {
  const { add } = b;
  const chrome = 0xdfe3e8;
  const shade = 0x9aa1aa;
  add(box(0.042, 0.046, 0.26), chrome, 0, 0.016, -0.01); // slide
  for (let k = 0; k < 5; k++) add(box(0.043, 0.032, 0.004), shade, 0, 0.016, 0.08 + k * 0.009); // serrations
  add(box(0.012, 0.01, 0.24), shade, 0, 0.042, -0.01); // top rib
  add(box(0.04, 0.03, 0.2), 0xb9bfc7, 0, -0.018, 0.0); // frame
  add(box(0.008, 0.024, 0.04), shade, 0, -0.044, 0.04); // trigger guard
  add(box(0.036, 0.1, 0.05), 0x2b2d31, 0, -0.07, 0.088, 0.3); // grip
  // The sweatband around the grip (red and white, gym edition).
  add(box(0.04, 0.03, 0.054), 0xd8262d, 0, -0.08, 0.093, 0.3);
  add(box(0.041, 0.006, 0.055), 0xffffff, 0, -0.08, 0.093, 0.3);
  // The sticker on the slide: yellow, black letters.
  add(box(0.0012, 0.02, 0.19), 0xffd23f, -0.0216, 0.016, -0.01);
  pixelText(b, 'NO PAIN NO GAIN', 0x111111, -0.0225, 0.0235, -0.1, 0.00305);
  const mag = new THREE.Mesh(box(0.032, 0.035, 0.044), toon(0x2b2d31));
  mag.position.set(0, -0.125, 0.105);
  mag.rotation.x = 0.3;
  let sightY = 0.06;
  if (g.mira === 'ferro') sightY = pistolIrons(b, 0.047, 0.1, -0.12, 0x1d1f23);
  else sightY = sight(b, g.mira, LOOKS.padrao, 0.04, 0.047, 0.65);
  const muzzle = new THREE.Vector3(0, 0.016, -0.145);
  if (g.silenciador) muzzle.z = potato(b, 0.016, -0.14);
  return { meshes: b.meshes, glow: b.glow, mag, magY: mag.position.y, sightY, adsZ: -0.48, scoped: false, muzzle, hold: holdOf('pistolao') };
}

/** How each gun is held (where the support hand goes, first and third person): the SMG is a short gun, every rifle a long one, the other secondaries pistols. */
export const holdOf = (gun: GunId): GunHold => (gun === 'smg' ? 'curta' : WEAPONS[GUN_DATA_ID[gun]].slot === 'secundaria' ? 'pistola' : 'longa');

/** Each gun's own model; every rifle is the rifle, painted its own way. client/tests/weapon.test.ts checks every secondary has one. */
export const GUN_MODELS: Partial<Record<GunId, (b: Builder, g: GunLookKey) => GunParts>> = {
  pistola: pistol,
  smg,
  grampeador: stapler,
  revolver: revolverModel,
  furadeira: drill,
  garrucha: garruchaModel,
  pistolao: handCannon,
};

/** The model of a gun as its upgrades make it (sight, paint job, magazine, silencer). */
export function gunParts(g: GunLookKey): GunParts {
  return (GUN_MODELS[g.arma] ?? rifle)(builder(), g);
}

/** Cache key of a gun's model: everything gunParts looks at. */
export const gunModelKey = (g: GunLookKey) => `${g.arma}|${g.mira}|${g.visual}|${g.silenciador ? 1 : 0}|${g.pente}`;

/** What the knife hand swings (each knife), pointing down -Z from the fist at the origin. */
export function knifeModel(form: KnifeId): THREE.Group {
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
  } else if (form === 'colher') {
    // Grandma's wooden spoon.
    const wood = toon(0xc69c6d);
    add(new THREE.BoxGeometry(0.018, 0.012, 0.3), wood, 0, 0, -0.1);
    add(new THREE.SphereGeometry(0.036, 12, 8).scale(1, 0.35, 1.45), wood, 0, 0.004, -0.29);
  } else if (form === 'baguete') {
    // Yesterday's baguette, with its cuts.
    const crust = toon(0xd9a04e);
    add(along(new THREE.CapsuleGeometry(0.028, 0.4, 6, 12)), crust, 0, 0, -0.2);
    for (let k = 0; k < 5; k++) {
      const cut = add(new THREE.BoxGeometry(0.03, 0.006, 0.012), toon(0xf3d7a0), 0, 0.026, -0.06 - k * 0.075);
      cut.rotation.y = 0.6;
    }
  } else if (form === 'peixe') {
    // Frozen fish held by the tail, frost on the scales.
    const fish = toon(0x8fb3c9);
    add(new THREE.ConeGeometry(0.035, 0.05, 4).rotateX(Math.PI / 2).scale(0.25, 1.2, 1), fish, 0, 0, -0.01);
    add(new THREE.SphereGeometry(0.045, 12, 10).scale(0.45, 1, 2.8), fish, 0, 0, -0.17);
    add(new THREE.SphereGeometry(0.006, 6, 4), toon(0x111111), 0.018, 0.012, -0.28);
    add(new THREE.ConeGeometry(0.01, 0.03, 4), toon(0x6f93a9), 0, 0.045, -0.15);
    for (let k = 0; k < 7; k++) add(new THREE.SphereGeometry(0.006, 5, 4), toon(0xffffff), (k % 2 ? 1 : -1) * 0.02, -0.02 + (k % 3) * 0.02, -0.07 - k * 0.028);
  } else if (form === 'macarrao') {
    // A green pool noodle, 60 cm of foam.
    add(along(new THREE.CylinderGeometry(0.036, 0.036, 0.6, 14)), toon(0x39d353), 0, 0, -0.29);
    add(new THREE.CircleGeometry(0.014, 12).rotateY(Math.PI), toon(0x1c7a2a), 0, 0, -0.591);
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
