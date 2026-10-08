// The six pets as parts on their skeletons (PF-29), facing -Z with their feet on y = 0, like the Amora of the map:
// faceted primitives with vertex colors, never pure black (a black pet keeps bright eyes and a shiny pendant), at
// most PET_MAX_TRIS triangles each and a light version for far away. The Amora is the map's Chow Chow
// (client/world/dog.ts chowParts with the pet option); the Bruxinha is a chibi of the Vila Assombrada's witch (the
// same robe, skin, hat and band, hooked nose, wart, mismatched eyes, a head of over 40% of her height) on a broom.
import * as THREE from 'three';
import { PETS, type PetId } from '@shared/pets';
import { chowParts } from '../world/dog';
import type { ColoredPart } from '../render/materials';
import { PetModel, type BoneSpec, type P3, type PetBuild, type PetLook } from './rig';

type Part = ColoredPart;
const ico = (r: number, d = 0) => new THREE.IcosahedronGeometry(r, d);
const sph = (r: number, w: number, h: number) => new THREE.SphereGeometry(r, w, h);
const cap = (r: number, len: number, cs = 2, rs = 6) => new THREE.CapsuleGeometry(r, len, cs, rs);
const cyl = (r0: number, r1: number, h: number, s = 6) => new THREE.CylinderGeometry(r0, r1, h, s);
const cone = (r: number, h: number, s = 5) => new THREE.ConeGeometry(r, h, s);
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
const shift = (parts: Part[], d: P3): Part[] => parts.map((p) => ({ ...p, pos: [p.pos[0] + d[0], p.pos[1] + d[1], p.pos[2] + d[2]] }));
/** A part `k` times bigger around its pivot (its place and its size). */
const scaled = (p: Part, k: number): Part => ({ ...p, pos: [p.pos[0] * k, p.pos[1] * k, p.pos[2] * k], scale: [(p.scale?.[0] ?? 1) * k, (p.scale?.[1] ?? 1) * k, (p.scale?.[2] ?? 1) * k] });
/** Along Z (a capsule or cylinder lying down, for trunks and tails). */
const LIE: P3 = [Math.PI / 2, 0, 0];

const GLINT = 0xffffff;
const PENDANT = 0xf2d27a;
/** Fine details (glints, pupils, whiskers, toes): only on the full mesh (far away they're under a pixel). */
const fine = (light: boolean, ...parts: Part[]): Part[] => (light ? [] : parts);
/** The collar's ring: a thin torus (fewer segments far away). */
const ringGeo = (r: number, t: number, light: boolean) => new THREE.TorusGeometry(r, t, light ? 3 : 5, light ? 6 : 14);

/** A coat's colors: the main one, a lighter and a darker shade, the belly/muzzle and the eyes. */
interface Coat {
  base: number;
  light: number;
  dark: number;
  belly: number;
  eye: number;
  nose: number;
  stripes?: boolean;
}

const COATS: Record<Exclude<PetId, 'amora' | 'bruxinha'>, Record<string, Coat>> = {
  gato: {
    rajada: { base: 0x8a8a90, light: 0xb4b4ba, dark: 0x55555c, belly: 0xdcdcdc, eye: 0x8fd46a, nose: 0xd88a9a, stripes: true },
    laranja: { base: 0xe08a3a, light: 0xf2b97a, dark: 0xb0602a, belly: 0xf6e2c8, eye: 0xf2c230, nose: 0xe89a8a, stripes: true },
    preta: { base: 0x2f2d34, light: 0x48454f, dark: 0x232128, belly: 0x3b3942, eye: 0xf0d83a, nose: 0x5a4a52 },
  },
  fuinha: {
    marrom: { base: 0x7a4f2e, light: 0x93633c, dark: 0x5a3820, belly: 0xf0e2c4, eye: 0x1a1414, nose: 0x2a1c18 },
    canela: { base: 0xb5733a, light: 0xc98a4c, dark: 0x8a5428, belly: 0xf3dcb4, eye: 0x1a1414, nose: 0x2a1c18 },
    branca: { base: 0xf0ece4, light: 0xfaf7f1, dark: 0x34302c, belly: 0xffffff, eye: 0x1a1414, nose: 0x3a2c28 },
  },
  lontra: {
    marrom: { base: 0x6b4a32, light: 0x7d5a3e, dark: 0x4a3222, belly: 0xb89a7a, eye: 0x161212, nose: 0x241a16 },
    chocolate: { base: 0x4c3428, light: 0x5c4232, dark: 0x30201a, belly: 0x8f6f56, eye: 0x161212, nose: 0x241a16 },
    caramelo: { base: 0xa8733f, light: 0xbb8650, dark: 0x7a5230, belly: 0xe2c59c, eye: 0x161212, nose: 0x2a1e18 },
  },
  iguana: {
    verde: { base: 0x5aa04a, light: 0x8ac86a, dark: 0x3a7a32, belly: 0xa8d488, eye: 0xd8a030, nose: 0x3a6a2a },
    laranja: { base: 0xd8782e, light: 0xf0a85a, dark: 0xa85420, belly: 0xf3c58a, eye: 0xe0c040, nose: 0x8a4418 },
    turquesa: { base: 0x3aa8a8, light: 0x6ad0c8, dark: 0x2a7a80, belly: 0x9ae0d4, eye: 0xe0b040, nose: 0x266a6a },
  },
};

/** The Bruxinha's robes (her "coats"): the map witch's purple first. */
const ROBES: Record<string, { robe: number; dark: number }> = {
  roxo: { robe: 0x3a2a48, dark: 0x2a1e36 },
  musgo: { robe: 0x3f4f2e, dark: 0x2c3820 },
  vinho: { robe: 0x5a2234, dark: 0x3e1624 },
};

const coatOf = (id: Exclude<PetId, 'amora' | 'bruxinha'>, cor: string): Coat => COATS[id][cor] ?? COATS[id][PETS[id].pelagens[0].id];

/** A four-legged skeleton: the trunk, the head (and jaw) on it, a tail of `tails` bones, and the four legs. */
function quadBones(o: { body: P3; head: P3; jaw?: P3; tail: P3; tail2?: P3; tail3?: P3; legs: P3[] }): BoneSpec[] {
  const b: BoneSpec[] = [
    { name: 'body', parent: null, at: o.body },
    { name: 'head', parent: 'body', at: o.head },
    { name: 'tail', parent: 'body', at: o.tail },
  ];
  if (o.jaw) b.push({ name: 'jaw', parent: 'head', at: o.jaw });
  if (o.tail2) b.push({ name: 'tail2', parent: 'tail', at: o.tail2 });
  if (o.tail3) b.push({ name: 'tail3', parent: 'tail2', at: o.tail3 });
  ['fl', 'fr', 'bl', 'br'].forEach((n, i) => b.push({ name: n, parent: 'body', at: o.legs[i] }));
  return b;
}

/** A small rope toy (the Amora's gesture), a potion and a rubber duck (the Bruxinha's), a hammer, three stones. */
function prop(parts: Part[]): THREE.Object3D {
  const g = new THREE.Group();
  for (const p of parts) {
    const m = new THREE.Mesh(p.geo, new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.7, flatShading: true }));
    m.position.set(...p.pos);
    if (p.rot) m.rotation.set(...p.rot);
    if (p.scale) m.scale.set(...p.scale);
    g.add(m);
  }
  return g;
}

// --- Amora -----------------------------------------------------------------------------------------------------

function amora(): PetBuild {
  const full = chowParts({ pet: true });
  const lite = chowParts({ pet: true, light: true });
  const body: P3 = [0, 0.43, 0];
  const rel = (p: P3): P3 => [p[0] - body[0], p[1] - body[1], p[2] - body[2]];
  const bones = quadBones({ body, head: rel(full.headAt), jaw: full.jawAt, tail: rel(full.tailAt), legs: full.legs.map((l) => rel(l.at)) });
  const parts = (c: typeof full) => ({
    body: shift(c.body, [-body[0], -body[1], -body[2]]),
    head: [...c.head, ...c.collar.slice(1)],
    jaw: c.jaw,
    tail: c.tail,
    fl: c.legs[0].parts,
    fr: c.legs[1].parts,
    bl: c.legs[2].parts,
    br: c.legs[3].parts,
  });
  return {
    bones,
    parts: parts(full),
    light: parts(lite),
    collar: { bone: 'head', parts: full.collar.slice(0, 1), light: lite.collar.slice(0, 1) },
    props: {
      rope: {
        bone: 'jaw',
        object: prop([
          { geo: cyl(0.022, 0.022, 0.34, 6), color: 0xd84a3a, pos: [0, -0.01, -0.12], rot: [0, 0, Math.PI / 2] },
          { geo: ico(0.04, 0), color: 0xf2e6c8, pos: [-0.17, -0.01, -0.12] },
          { geo: ico(0.04, 0), color: 0xf2e6c8, pos: [0.17, -0.01, -0.12] },
        ]),
      },
    },
    height: 0.88,
    length: 0.9,
  };
}

// --- Bruxinha -------------------------------------------------------------------------------------------------------

function bruxinha(cor: string, light: boolean): { parts: Record<string, Part[]>; ring: Part[] } {
  const r = ROBES[cor] ?? ROBES.roxo;
  const skin = 0x7aa040;
  const skinDark = 0x5a7a2a;
  const hat = 0x1a1420;
  const L = light;
  // Seated side-saddle on her broom, the robe spilling over it, pointed boots out to the side.
  const body: Part[] = [
    { geo: cyl(0.014, 0.014, 0.5, L ? 4 : 6), color: 0x6a4a2a, pos: [0, -0.08, -0.02], rot: LIE },
    { geo: cone(0.07, 0.16, L ? 5 : 8), color: 0xc8a050, pos: [0, -0.08, 0.28], rot: [-Math.PI / 2, 0, 0] },
    { geo: new THREE.LatheGeometry([0.14, 0.13, 0.11, 0.08, 0.05].map((x, i) => new THREE.Vector2(x, -0.08 + i * 0.05)), L ? 6 : 10), color: r.robe, pos: [0, 0, 0] },
    { geo: cyl(0.085, 0.09, 0.025, L ? 6 : 10), color: 0x5a3a22, pos: [0, 0.05, 0] },
    { geo: cone(0.03, 0.09, L ? 4 : 5), color: hat, pos: [0.11, -0.1, -0.06], rot: [Math.PI / 2, 0, -0.4] },
    ...fine(
      L,
      { geo: box(0.03, 0.025, 0.012), color: 0xd8b040, pos: [0, 0.05, -0.09] },
      { geo: cone(0.03, 0.09, 5), color: hat, pos: [0.13, -0.11, 0.02], rot: [Math.PI / 2, 0, -0.5] },
      { geo: box(0.05, 0.05, 0.01), color: 0x2a4a3a, pos: [-0.08, -0.02, -0.08], rot: [0, -0.6, 0] },
    ),
  ];
  // The head (40-45% of her height with the hat): green, warty, hooked nose, pointed chin, mismatched eyes.
  const head: Part[] = [
    { geo: ico(0.11, L ? 0 : 2), color: skin, pos: [0, 0, 0], scale: [1, 1.05, 0.95] },
    { geo: cone(0.035, 0.08, L ? 4 : 6), color: skin, pos: [0, -0.06, -0.1], rot: [-1.9, 0, 0] },
    { geo: cone(0.022, 0.1, L ? 4 : 6), color: skin, pos: [0.004, -0.02, -0.14], rot: [-2.2, 0, 0.1] },
    { geo: sph(0.012, 5, 4), color: skinDark, pos: [0.03, -0.035, -0.12] },
    // The left eye bigger than the right, yellow with a red pupil (her map self's).
    { geo: sph(0.03, L ? 4 : 6, L ? 3 : 5), color: 0xe0d860, pos: [-0.042, 0.02, -0.088] },
    { geo: sph(0.022, L ? 4 : 6, L ? 3 : 5), color: 0xe0d860, pos: [0.044, 0.02, -0.09] },
    ...fine(
      L,
      { geo: sph(0.011, 4, 3), color: 0x8a1010, pos: [-0.042, 0.022, -0.115] },
      { geo: sph(0.009, 4, 3), color: 0x8a1010, pos: [0.044, 0.022, -0.11] },
      { geo: sph(0.005, 4, 3), color: GLINT, pos: [-0.036, 0.03, -0.122] },
      { geo: box(0.1, 0.012, 0.012), color: 0x2a2a28, pos: [0, 0.06, -0.09], rot: [0, 0, 0.12] },
      { geo: box(0.06, 0.01, 0.01), color: 0x2a0a0a, pos: [0, -0.055, -0.095], rot: [0, 0, -0.15] },
      { geo: cone(0.022, 0.07, 4), color: skin, pos: [0.11, 0.0, 0], rot: [0, 0, -1.3] },
      { geo: cone(0.022, 0.07, 4), color: skin, pos: [-0.11, 0.0, 0], rot: [0, 0, 1.3] },
      { geo: box(0.035, 0.03, 0.01), color: 0xd8b040, pos: [0, 0.1, -0.105] },
    ),
    // The hat: a wide floppy brim, a crooked cone, the purple band and its buckle.
    { geo: cyl(0.19, 0.19, 0.012, L ? 7 : 14), color: hat, pos: [0, 0.075, 0], rot: [0.06, 0, 0.05] },
    { geo: cyl(0.06, 0.1, 0.12, L ? 5 : 10), color: hat, pos: [0, 0.14, 0.005] },
    { geo: cone(0.065, 0.17, L ? 4 : 8), color: hat, pos: [0.035, 0.28, 0.02], rot: [-0.25, 0, -0.45] },
    { geo: cyl(0.102, 0.102, 0.03, L ? 5 : 12), color: 0x6a3a8a, pos: [0, 0.1, 0.005] },
  ];
  // Stringy grey hair from under the brim.
  for (let k = 0; k < (L ? 0 : 7); k++) {
    const a = Math.PI * 0.35 + (k / 6) * Math.PI * 1.3;
    // (she faces -Z: the strands go round the sides and the back, +Z)
    head.push({ geo: box(0.02, 0.12, 0.012), color: k % 2 ? 0x8a8680 : 0x6a6660, pos: [Math.sin(a) * 0.1, -0.05, -Math.cos(a) * 0.1], rot: [0, -a, 0] });
  }
  const arm = (s: number): Part[] => [
    { geo: cone(0.04, 0.12, L ? 4 : 6), color: r.robe, pos: [s * 0.03, -0.04, -0.03], rot: [-1.0, 0, s * 0.3] },
    ...fine(L, { geo: sph(0.022, 6, 5), color: skin, pos: [s * 0.05, -0.08, -0.08] }),
  ];
  const ring: Part[] = [{ geo: ringGeo(0.06, 0.012, L), color: 0xffffff, pos: [0, -0.13, 0], rot: [Math.PI / 2, 0, 0] }];
  // Chibi: the whole head (face, hair, hat) 25% bigger than her map self's proportions, over a small body.
  const big = head.map((p) => scaled(p, 1.25));
  // The collar's pendant on her neck (bright, always).
  big.push(...fine(L, { geo: sph(0.014, 5, 4), color: PENDANT, pos: [0, -0.14, -0.06] }));
  return { parts: { body, head: big, armL: arm(1), armR: arm(-1) }, ring };
}

function bruxinhaBuild(cor: string): PetBuild {
  const bones: BoneSpec[] = [
    { name: 'body', parent: null, at: [0, 0.18, 0] },
    { name: 'head', parent: 'body', at: [0, 0.23, -0.01] },
    { name: 'armL', parent: 'body', at: [0.1, 0.1, 0] },
    { name: 'armR', parent: 'body', at: [-0.1, 0.1, 0] },
  ];
  const full = bruxinha(cor, false);
  const lite = bruxinha(cor, true);
  return {
    bones,
    parts: full.parts,
    light: lite.parts,
    collar: { bone: 'head', parts: full.ring, light: lite.ring },
    props: {
      potion: {
        bone: 'armR',
        object: prop([
          { geo: sph(0.035, 8, 6), color: 0x9a5ad8, pos: [-0.05, -0.12, -0.1] },
          { geo: cyl(0.012, 0.012, 0.04, 6), color: 0xd8e4ee, pos: [-0.05, -0.08, -0.1] },
          { geo: cyl(0.014, 0.014, 0.012, 6), color: 0x8a5a2a, pos: [-0.05, -0.055, -0.1] },
        ]),
      },
      duck: {
        bone: 'body',
        object: prop([
          { geo: sph(0.06, 8, 6), color: 0xf2c230, pos: [0, 0, 0], scale: [1, 0.8, 1.2] },
          { geo: sph(0.04, 8, 6), color: 0xf2c230, pos: [0, 0.06, -0.05] },
          { geo: cone(0.018, 0.04, 5), color: 0xf07a1e, pos: [0, 0.055, -0.1], rot: [-Math.PI / 2, 0, 0] },
          { geo: sph(0.008, 4, 3), color: 0x1a1414, pos: [0.022, 0.075, -0.075] },
        ]),
      },
    },
    height: 0.72,
    length: 0.55,
  };
}

// --- Gata ---------------------------------------------------------------------------------------------------------

function gato(c: Coat, L: boolean): { parts: Record<string, Part[]>; ring: Part[] } {
  const seg = L ? 4 : 7;
  const body: Part[] = [
    { geo: cap(0.085, 0.2, L ? 1 : 3, seg), color: c.base, pos: [0, 0, 0.02], rot: LIE, scale: [1, 0.95, 1] },
    { geo: ico(0.075, L ? 0 : 1), color: c.belly, pos: [0, -0.02, -0.12], scale: [1, 1.05, 0.9] },
  ];
  // Tabby stripes: dark flattened patches lying on the back.
  if (c.stripes && !L) for (let k = 0; k < 4; k++) body.push({ geo: sph(0.07, 8, 4), color: c.dark, pos: [0, 0.062, -0.09 + k * 0.07], scale: [1.1, 0.3, 0.26] });
  const head: Part[] = [
    { geo: ico(0.085, L ? 0 : 1), color: c.base, pos: [0, 0, 0], scale: [1.05, 0.95, 1] },
    { geo: sph(0.045, seg, L ? 3 : 5), color: c.belly, pos: [0, -0.03, -0.065], scale: [1.2, 0.8, 0.9] },
    { geo: cone(0.04, 0.07, 4), color: c.base, pos: [-0.05, 0.08, 0.005], rot: [0, Math.PI / 4, 0.22] },
    { geo: cone(0.04, 0.07, 4), color: c.base, pos: [0.05, 0.08, 0.005], rot: [0, Math.PI / 4, -0.22] },
    { geo: sph(0.022, L ? 4 : 7, L ? 3 : 5), color: c.eye, pos: [-0.035, 0.015, -0.068] },
    { geo: sph(0.022, L ? 4 : 7, L ? 3 : 5), color: c.eye, pos: [0.035, 0.015, -0.068] },
    ...fine(
      L,
      { geo: sph(0.014, 4, 3), color: c.nose, pos: [0, -0.012, -0.105] },
      { geo: box(0.008, 0.026, 0.008), color: 0x101010, pos: [-0.035, 0.015, -0.088] },
      { geo: box(0.008, 0.026, 0.008), color: 0x101010, pos: [0.035, 0.015, -0.088] },
      { geo: sph(0.006, 4, 3), color: GLINT, pos: [-0.03, 0.025, -0.09] },
      { geo: sph(0.006, 4, 3), color: GLINT, pos: [0.04, 0.025, -0.09] },
      // The collar's pendant: a little bell.
      { geo: sph(0.016, 5, 4), color: PENDANT, pos: [0, -0.09, -0.03] },
    ),
  ];
  if (!L) {
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) head.push({ geo: box(0.08, 0.003, 0.003), color: 0xf2f2f2, pos: [s * 0.06, -0.03 - k * 0.012, -0.085], rot: [0, s * 0.25, s * (0.1 - k * 0.2)] });
    head.push({ geo: cone(0.022, 0.04, 3), color: c.nose, pos: [-0.05, 0.075, -0.005], rot: [0, Math.PI / 4, 0.22] });
    head.push({ geo: cone(0.022, 0.04, 3), color: c.nose, pos: [0.05, 0.075, -0.005], rot: [0, Math.PI / 4, -0.22] });
  }
  const leg = (front: boolean): Part[] => [
    L ? { geo: cyl(0.028, 0.024, 0.2, 4), color: front ? c.light : c.base, pos: [0, -0.11, 0] } : { geo: cap(0.028, 0.14, 2, 6), color: front ? c.light : c.base, pos: [0, -0.1, 0] },
    ...fine(L, { geo: sph(0.03, 6, 4), color: c.belly, pos: [0, -0.2, -0.01], scale: [1, 0.6, 1.3] }),
  ];
  const tail = [{ geo: L ? cyl(0.024, 0.024, 0.16, 4) : cap(0.024, 0.12, 1, 6), color: c.base, pos: [0, 0.07, 0] as P3 }];
  const tail2 = [{ geo: L ? cyl(0.022, 0.018, 0.16, 4) : cap(0.022, 0.12, 1, 6), color: c.stripes ? c.dark : c.base, pos: [0, 0.07, 0] as P3 }];
  const ring: Part[] = [{ geo: ringGeo(0.06, 0.012, L), color: 0xffffff, pos: [0, -0.07, 0.03], rot: [Math.PI / 2 - 0.4, 0, 0] }];
  return { parts: { body, head, tail, tail2, fl: leg(true), fr: leg(true), bl: leg(false), br: leg(false) }, ring };
}

function gatoBuild(cor: string): PetBuild {
  const c = coatOf('gato', cor);
  const bones = quadBones({ body: [0, 0.25, 0], head: [0, 0.11, -0.2], tail: [0, 0.03, 0.17], tail2: [0, 0.14, 0], legs: [[-0.05, -0.03, -0.12], [0.05, -0.03, -0.12], [-0.05, -0.03, 0.13], [0.05, -0.03, 0.13]] });
  const full = gato(c, false);
  const lite = gato(c, true);
  return { bones, parts: full.parts, light: lite.parts, collar: { bone: 'head', parts: full.ring, light: lite.ring }, height: 0.42, length: 0.5 };
}

// --- Fuinha ---------------------------------------------------------------------------------------------------------

function fuinha(c: Coat, L: boolean): { parts: Record<string, Part[]>; ring: Part[] } {
  const seg = L ? 4 : 7;
  const body: Part[] = [
    { geo: cap(0.06, 0.3, L ? 1 : 3, seg), color: c.base, pos: [0, 0, 0.02], rot: LIE },
    { geo: cap(0.04, 0.16, 1, L ? 4 : 6), color: c.belly, pos: [0, -0.025, -0.1], rot: LIE },
  ];
  const head: Part[] = [
    { geo: ico(0.055, L ? 0 : 1), color: c.base, pos: [0, 0, 0], scale: [1, 0.9, 1.25] },
    { geo: cone(0.035, 0.07, L ? 4 : 6), color: c.belly, pos: [0, -0.015, -0.075], rot: [-Math.PI / 2, 0, 0] },
    { geo: sph(0.013, L ? 4 : 6, L ? 3 : 4), color: c.eye, pos: [-0.026, 0.015, -0.05] },
    { geo: sph(0.013, L ? 4 : 6, L ? 3 : 4), color: c.eye, pos: [0.026, 0.015, -0.05] },
    ...fine(
      L,
      { geo: sph(0.012, 4, 3), color: c.nose, pos: [0, -0.012, -0.112] },
      { geo: sph(0.022, 6, 3), color: c.base, pos: [-0.04, 0.04, 0.01], scale: [1, 1, 0.5] },
      { geo: sph(0.022, 6, 3), color: c.base, pos: [0.04, 0.04, 0.01], scale: [1, 1, 0.5] },
      { geo: sph(0.005, 4, 3), color: GLINT, pos: [-0.022, 0.02, -0.062] },
      { geo: sph(0.005, 4, 3), color: GLINT, pos: [0.03, 0.02, -0.062] },
      { geo: sph(0.012, 4, 3), color: PENDANT, pos: [0, -0.06, -0.01] },
    ),
  ];
  const leg: Part[] = [
    L ? { geo: cyl(0.022, 0.02, 0.1, 4), color: c.base, pos: [0, -0.05, 0] } : { geo: cap(0.022, 0.06, 1, 6), color: c.base, pos: [0, -0.05, 0] },
    ...fine(L, { geo: sph(0.022, 4, 3), color: c.dark, pos: [0, -0.095, -0.01], scale: [1, 0.6, 1.3] }),
  ];
  const tail: Part[] = [{ geo: L ? cyl(0.03, 0.03, 0.16, 4) : cap(0.03, 0.1, 1, 6), color: c.base, pos: [0, 0, 0.06], rot: LIE }];
  const tail2: Part[] = [{ geo: L ? cyl(0.034, 0.02, 0.12, 4) : cap(0.034, 0.08, 1, 6), color: c.dark, pos: [0, 0, 0.05], rot: LIE }];
  const ring: Part[] = [{ geo: ringGeo(0.045, 0.01, L), color: 0xffffff, pos: [0, -0.03, 0.04], rot: [Math.PI / 2 - 0.2, 0, 0] }];
  return { parts: { body, head, tail, tail2, fl: leg, fr: leg, bl: leg, br: leg }, ring };
}

function fuinhaBuild(cor: string): PetBuild {
  const c = coatOf('fuinha', cor);
  const bones = quadBones({ body: [0, 0.13, 0], head: [0, 0.05, -0.26], tail: [0, 0.02, 0.2], tail2: [0, 0.02, 0.13], legs: [[-0.04, -0.03, -0.14], [0.04, -0.03, -0.14], [-0.04, -0.03, 0.15], [0.04, -0.03, 0.15]] });
  const full = fuinha(c, false);
  const lite = fuinha(c, true);
  return {
    bones,
    parts: full.parts,
    light: lite.parts,
    collar: { bone: 'head', parts: full.ring, light: lite.ring },
    props: {
      hammer: {
        bone: 'fr',
        object: prop([
          { geo: box(0.016, 0.17, 0.016), color: 0x8a5a2a, pos: [0, -0.12, -0.05] },
          { geo: box(0.075, 0.035, 0.035), color: 0x5a6068, pos: [0, -0.04, -0.05] },
        ]),
      },
    },
    height: 0.24,
    length: 0.55,
  };
}

// --- Lontra ---------------------------------------------------------------------------------------------------------

function lontra(c: Coat, L: boolean): { parts: Record<string, Part[]>; ring: Part[] } {
  const seg = L ? 4 : 7;
  const body: Part[] = [
    { geo: cap(0.085, 0.3, L ? 1 : 3, seg), color: c.base, pos: [0, 0, 0.02], rot: LIE },
    { geo: cap(0.06, 0.18, 1, L ? 4 : 6), color: c.belly, pos: [0, -0.035, -0.08], rot: LIE },
  ];
  const head: Part[] = [
    { geo: ico(0.072, L ? 0 : 1), color: c.base, pos: [0, 0, 0], scale: [1.1, 0.9, 1.05] },
    { geo: sph(0.042, seg, L ? 3 : 5), color: c.belly, pos: [0, -0.02, -0.06], scale: [1.35, 0.8, 0.9] },
    { geo: sph(0.014, L ? 4 : 6, L ? 3 : 4), color: c.eye, pos: [-0.032, 0.022, -0.06] },
    { geo: sph(0.014, L ? 4 : 6, L ? 3 : 4), color: c.eye, pos: [0.032, 0.022, -0.06] },
    ...fine(
      L,
      { geo: sph(0.016, 5, 4), color: c.nose, pos: [0, -0.005, -0.1], scale: [1.4, 0.8, 1] },
      { geo: sph(0.018, 4, 3), color: c.dark, pos: [-0.06, 0.035, 0.01] },
      { geo: sph(0.018, 4, 3), color: c.dark, pos: [0.06, 0.035, 0.01] },
      { geo: sph(0.005, 4, 3), color: GLINT, pos: [-0.028, 0.028, -0.072] },
      { geo: sph(0.005, 4, 3), color: GLINT, pos: [0.036, 0.028, -0.072] },
      { geo: sph(0.014, 4, 3), color: PENDANT, pos: [0, -0.08, -0.02] },
    ),
  ];
  if (!L) for (const s of [-1, 1]) for (let k = 0; k < 2; k++) head.push({ geo: box(0.07, 0.003, 0.003), color: 0xe8e0d0, pos: [s * 0.06, -0.02 - k * 0.01, -0.08], rot: [0, s * 0.2, s * (0.08 - k * 0.16)] });
  const leg: Part[] = [
    L ? { geo: cyl(0.03, 0.026, 0.11, 4), color: c.dark, pos: [0, -0.06, 0] } : { geo: cap(0.03, 0.06, 1, 6), color: c.dark, pos: [0, -0.06, 0] },
    ...fine(L, { geo: sph(0.03, 4, 3), color: c.dark, pos: [0, -0.11, -0.015], scale: [1.1, 0.5, 1.4] }),
  ];
  const tail: Part[] = [{ geo: cyl(0.03, 0.06, 0.16, L ? 4 : 7), color: c.base, pos: [0, 0, 0.08], rot: LIE }];
  const tail2: Part[] = [{ geo: cone(0.03, 0.16, L ? 4 : 7), color: c.base, pos: [0, 0, 0.08], rot: [Math.PI / 2, 0, 0] }];
  const ring: Part[] = [{ geo: ringGeo(0.065, 0.012, L), color: 0xffffff, pos: [0, -0.04, 0.05], rot: [Math.PI / 2 - 0.25, 0, 0] }];
  return { parts: { body, head, tail, tail2, fl: leg, fr: leg, bl: leg, br: leg }, ring };
}

function lontraBuild(cor: string): PetBuild {
  const c = coatOf('lontra', cor);
  const bones = quadBones({ body: [0, 0.16, 0], head: [0, 0.06, -0.28], tail: [0, 0.0, 0.24], tail2: [0, 0, 0.16], legs: [[-0.055, -0.04, -0.15], [0.055, -0.04, -0.15], [-0.06, -0.04, 0.16], [0.06, -0.04, 0.16]] });
  const full = lontra(c, false);
  const lite = lontra(c, true);
  // In front of her chest when she stands up (the trunk's -Y faces forward then, its -Z points up).
  const stone = (x: number, up: number) => ({ geo: ico(0.022, 0), color: 0x8a8a86, pos: [x, -0.13, -0.2 - up] as P3 });
  return {
    bones,
    parts: full.parts,
    light: lite.parts,
    collar: { bone: 'head', parts: full.ring, light: lite.ring },
    props: { stones: { bone: 'body', object: prop([stone(-0.04, 0), stone(0, 0.06), stone(0.04, 0)]) } },
    height: 0.3,
    length: 0.85,
  };
}

// --- Iguana ---------------------------------------------------------------------------------------------------------

function iguana(c: Coat, L: boolean): { parts: Record<string, Part[]>; ring: Part[] } {
  const seg = L ? 4 : 6;
  const body: Part[] = [
    { geo: cap(0.065, 0.26, L ? 1 : 2, seg), color: c.base, pos: [0, 0, 0], rot: LIE, scale: [1.1, 0.75, 1] },
    { geo: cap(0.045, 0.2, 1, L ? 4 : 5), color: c.belly, pos: [0, -0.03, 0], rot: LIE, scale: [1.2, 0.6, 1] },
  ];
  // The crest of spikes down the back, and darker bands.
  for (let k = 0; k < (L ? 0 : 7); k++) body.push({ geo: cone(0.012, 0.04, 3), color: c.light, pos: [0, 0.055, -0.15 + k * 0.05] });
  if (!L) for (let k = 0; k < 3; k++) body.push({ geo: box(0.15, 0.012, 0.03), color: c.dark, pos: [0, 0.045, -0.08 + k * 0.09] });
  const head: Part[] = [
    { geo: box(0.08, 0.055, 0.1), color: c.base, pos: [0, 0, -0.03] },
    { geo: box(0.06, 0.045, 0.06), color: c.base, pos: [0, -0.005, -0.1] },
    { geo: cone(0.03, 0.05, 3), color: c.belly, pos: [0, -0.05, -0.03], rot: [Math.PI, 0, 0], scale: [0.4, 1, 1.6] },
    { geo: sph(0.018, L ? 4 : 6, L ? 3 : 4), color: c.eye, pos: [-0.042, 0.012, -0.04] },
    { geo: sph(0.018, L ? 4 : 6, L ? 3 : 4), color: c.eye, pos: [0.042, 0.012, -0.04] },
    ...fine(
      L,
      { geo: box(0.004, 0.02, 0.008), color: 0x101010, pos: [-0.058, 0.012, -0.04] },
      { geo: box(0.004, 0.02, 0.008), color: 0x101010, pos: [0.058, 0.012, -0.04] },
      { geo: sph(0.005, 4, 3), color: GLINT, pos: [-0.058, 0.02, -0.046] },
      { geo: sph(0.005, 4, 3), color: GLINT, pos: [0.058, 0.02, -0.046] },
      { geo: cyl(0.018, 0.018, 0.004, 8), color: c.light, pos: [-0.042, -0.015, 0], rot: [0, 0, Math.PI / 2] },
      { geo: cyl(0.018, 0.018, 0.004, 8), color: c.light, pos: [0.042, -0.015, 0], rot: [0, 0, Math.PI / 2] },
      { geo: sph(0.01, 4, 3), color: PENDANT, pos: [0, -0.06, 0.02] },
    ),
  ];
  // Sprawled legs: out to the side, then down to the toes.
  const leg = (s: number): Part[] => [
    L ? { geo: box(0.08, 0.025, 0.025), color: c.base, pos: [s * 0.045, -0.01, 0] } : { geo: cap(0.018, 0.06, 1, 5), color: c.base, pos: [s * 0.04, -0.01, 0], rot: [0, 0, Math.PI / 2] },
    L ? { geo: box(0.025, 0.07, 0.025), color: c.base, pos: [s * 0.08, -0.045, 0] } : { geo: cap(0.016, 0.05, 1, 5), color: c.base, pos: [s * 0.08, -0.045, 0] },
    ...fine(L, { geo: box(0.04, 0.008, 0.04), color: c.dark, pos: [s * 0.085, -0.075, -0.01] }),
  ];
  const tseg = (r0: number, r1: number, color: number): Part[] => [{ geo: cyl(r1, r0, 0.18, L ? 4 : 6), color, pos: [0, 0, 0.09], rot: LIE }];
  const ring: Part[] = [{ geo: ringGeo(0.05, 0.01, L), color: 0xffffff, pos: [0, -0.01, 0.03], rot: [Math.PI / 2, 0, 0] }];
  return {
    parts: { body, head, tail: tseg(0.045, 0.035, c.base), tail2: tseg(0.035, 0.022, c.dark), tail3: tseg(0.022, 0.006, c.base), fl: leg(-1), fr: leg(1), bl: leg(-1), br: leg(1) },
    ring,
  };
}

function iguanaBuild(cor: string): PetBuild {
  const c = coatOf('iguana', cor);
  const bones = quadBones({ body: [0, 0.085, 0], head: [0, 0.025, -0.22], tail: [0, -0.005, 0.18], tail2: [0, 0, 0.18], tail3: [0, 0, 0.18], legs: [[-0.05, -0.005, -0.12], [0.05, -0.005, -0.12], [-0.05, -0.005, 0.12], [0.05, -0.005, 0.12]] });
  const full = iguana(c, false);
  const lite = iguana(c, true);
  return { bones, parts: full.parts, light: lite.parts, collar: { bone: 'head', parts: full.ring, light: lite.ring }, height: 0.2, length: 0.95 };
}

/** The build of a pet with a coat (the Amora has none; the Bruxinha's is her robe). */
export function petBuild(id: PetId, cor: string): PetBuild {
  switch (id) {
    case 'amora':
      return amora();
    case 'bruxinha':
      return bruxinhaBuild(cor);
    case 'gato':
      return gatoBuild(cor);
    case 'fuinha':
      return fuinhaBuild(cor);
    case 'lontra':
      return lontraBuild(cor);
    case 'iguana':
      return iguanaBuild(cor);
  }
}

/** A pet ready to animate: its model with the coat and the collar's color, in the Galpão's look or a match's. */
export function makePet(id: PetId, cor: string, collar: THREE.ColorRepresentation, look: PetLook): PetModel {
  const m = new PetModel(id, petBuild(id, cor), look);
  m.setCollar(collar);
  return m;
}

/** A coat's main color (the HUD and the card's swatches). */
export function coatSwatch(id: PetId, cor: string): string {
  if (id === 'amora') return '#35323c';
  if (id === 'bruxinha') return `#${(ROBES[cor] ?? ROBES.roxo).robe.toString(16).padStart(6, '0')}`;
  return `#${coatOf(id, cor).base.toString(16).padStart(6, '0')}`;
}
