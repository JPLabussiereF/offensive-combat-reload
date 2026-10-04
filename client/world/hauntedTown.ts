// "Vila Assombrada": 120 x 110 m abandoned Halloween town at night (design doc: README_Halloween.md).
// North: the forest with the witch's cabin and the twisted tree, and the Estrada Maldita coming in from the
// north-east (spawn A) past the barn. Center-north: the cemetery (chapel with its bell tower, mausoleum
// with a roof you can climb, rows of tombstones, the grumpy ghost's grave). West: the haunted mansion (two
// floors around a great hall, basement) and its garden. Center: the village street with six houses.
// South-east: the abandoned amusement park (Ferris wheel, shooting gallery, stage, bumper cars). South: the
// Praça da Lua Cheia, the big open arena behind a hedge (spawn B court at its west end). Underground: a
// sewer from the mansion basement to the plaza and the park.
// Gags (synchronized): the ghost, the chapel and park bells, the car horn, pumpkins, lamp posts, the
// cauldron and its ducks, scarecrows, the shooting gallery, the giant pumpkin and the grandfather clock.
// Those objects are also what the secrets (section 23 of the doc) will be built on.
import * as THREE from 'three';
import { fitText } from './canvasText';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Physics } from './physics';
import { MapBuilder, STEP_D, stairRun, stairSteps, type Opening } from './mapBuilder';
import { PropBus } from './props';
import { skySpot, type SpatialSfx } from '../audio/spatial';
import { toon, toonGradient } from '../render/materials';
import { surfaceMaterial, type SurfaceKey } from './surfaces';
import { buildCar } from './vehicles';
import { railing, rock, seeded } from './oriental';
import {
  Bats, Bell, Bonfire, canvasTexture, Cauldron, Debris, deadTree, epitaph, FerrisWheel, GiantPumpkin, Glow, GlowShrooms, GrandfatherClock, GraveGhost, GroundMist, hedge, ironFence,
  gateArch, LampPosts, nightSky, Puffs, Pumpkins, Scarecrows, signBoard, slabWithHoles, SPOOKY as C, SpeechBubble, staticPumpkin, TargetRow, tombstone, type LampSpec, type TombKind,
  bumperCarGeometry, circusTrailer, GiantRat, KitchenCabinet, LightPool, ScoobyBiscuit, Witch,
} from './halloween';
import { barrel, bed, bench, bookshelf, candle, chair, coffin, crate, hayBale, pew, Place, potion, rockingHorse, sofa, suitOfArmor, table, toyChest } from './furniture';
import { POTION, RAT } from '@shared/constants';
import { PICKUPS, RATS, WITCHES } from '@shared/maps';
import type { GameMap, MapFrame, MapRewards, SpawnPoint } from './blockoutMap';

export interface HauntedSfx extends SpatialSfx {
  ghostMoan(): void;
  grumble(): void;
  churchBell(pitch?: number): void;
  carHorn(seconds: number): void;
  pumpkinSmash(): void;
  bulbPop(): void;
  ratSqueak(): void;
  ratHit(): void;
  ratDeath(): void;
  cabinetCreak(): void;
  cauldronBubble(): void;
  quack(): void;
  evilLaugh(): void;
  clockChime(n: number): void;
  targetDing(): void;
  carnivalJingle(): void;
  strawThud(): void;
  ambientCrow(): void;
  ambientHowl(): void;
}

type Side = 'n' | 's' | 'e' | 'w';
type Rect = { x0: number; z0: number; x1: number; z1: number };

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** Moon direction: the shadows come from it too. */
const MOON: [number, number, number] = [45, 62, -38];

export async function buildHauntedTownMap(physics: Physics, scene: THREE.Scene, sfx: HauntedSfx): Promise<GameMap> {
  const b = new MapBuilder(physics, scene, 60);
  const W = 60; // half extent X
  const D = 55; // half extent Z
  const animated: ((dt: number, frame: MapFrame) => void)[] = [];
  /** Seconds since the map was built (gags with cooldowns). */
  let now = 0;
  animated.push((dt) => (now += dt));
  const props = new PropBus();
  const glow = new Glow();
  const puffs = new Puffs(scene);
  const debris = new Debris(scene);
  const pumpkins = new Pumpkins();
  const lamps = new LampPosts();
  const scarecrows = new Scarecrows();
  // Real lights: the 10 light spots nearest the camera (candles, lamps, the fire) light the scene for real.
  const lights = new LightPool(scene, 10);
  animated.push((dt, { listener }) => lights.update(dt, listener));
  /** A light spot; `bulb` also draws a glowing bulb there (hanging lamps). */
  const light = (x: number, y: number, z: number, o: { color?: number; intensity?: number; range?: number; flicker?: number; bulb?: boolean } = {}) => {
    const color = o.color ?? 0xffb46a;
    lights.add({ at: V(x, y, z), color: new THREE.Color(color), intensity: o.intensity ?? 10, range: o.range ?? 10, flicker: o.flicker });
    if (o.bulb) glow.add(new THREE.SphereGeometry(0.1, 8, 6).translate(x, y, z), 0xffe0a8);
  };
  /** A bulb hanging on its cord from a ceiling at `top`. */
  const hangingLamp = (x: number, top: number, z: number, o: { intensity?: number; range?: number } = {}) => {
    b.box(x, top - 0.3, z, 0.02, 0.6, 0.02, 'pintura', { tint: 0x1a1414, collide: false, castShadow: false });
    b.cylinder(x, top - 0.75, z, 0.16, 0.12, 'metal', { tint: 0x3a3436, collide: false, castShadow: false, radiusTop: 0.04, segments: 8 });
    light(x, top - 0.8, z, { range: 8, ...o, bulb: true });
  };
  /** Candles in a wall bracket (`out`: the direction away from the wall). */
  const sconce = (x: number, y: number, z: number, out: [number, number]) => {
    const across = (k: number) => [out[1] * k, -out[0] * k];
    b.box(x + out[0] * 0.015, y, z + out[1] * 0.015, out[0] ? 0.03 : 0.16, 0.26, out[1] ? 0.03 : 0.16, 'metal', { tint: 0x8a6a2a, collide: false, castShadow: false });
    b.box(x + out[0] * 0.1, y - 0.06, z + out[1] * 0.1, out[0] ? 0.17 : 0.32, 0.025, out[1] ? 0.17 : 0.32, 'metal', { tint: 0x8a6a2a, collide: false, castShadow: false });
    for (const k of [-1, 1]) {
      const [ax, az] = across(k * 0.11);
      candle(b, glow, x + out[0] * 0.12 + ax, y - 0.05, z + out[1] * 0.12 + az, 0.12, false);
    }
    // The light stands a metre into the room, small: it shouldn't light the room behind the wall.
    light(x + out[0] * 1.1, y + 0.1, z + out[1] * 1.1, { intensity: 7, range: 7, flicker: 0.5 });
  };
  /** An enterable house with a bulb hanging in the middle of its ground floor. */
  const home = (spec: HouseSpec) => {
    house(b, spec);
    hangingLamp((spec.x0 + spec.x1) / 2, spec.h ?? 3.2, (spec.z0 + spec.z1) / 2);
  };
  const rewards: MapRewards = { ratDown: null, aimBonus: null };
  /** What a knife swing can hit without a character in reach: the rat, the cabinet, pumpkins. */
  const stabbable: ((eye: THREE.Vector3, fwd: THREE.Vector3, reach: number) => THREE.Vector3 | null)[] = [];
  let biscuit: ScoobyBiscuit | null = null;
  let rat: GiantRat | null = null;
  // Same seed on every client: trees, rocks and tombstones collide identically online.
  const rand = seeded(1031);
  const decal = (x0: number, z0: number, x1: number, z1: number, y: number, surface: SurfaceKey, tint: number) => b.span(x0, y - 0.01, z0, x1, y, z1, surface, { tint, collide: false, castShadow: false });
  const bubbleAt = (at: THREE.Vector3, width = 3) => {
    const bubble = new SpeechBubble(width);
    bubble.sprite.position.copy(at);
    scene.add(bubble.sprite);
    animated.push((dt) => bubble.update(dt));
    return bubble;
  };

  // --- Ground: one slab with the three stairwells down to the sewer -----------------------------------
  const UG = -4; // sewer floor
  const CEIL = -0.5; // underside of the ground slab
  const H_MANSION: Rect = { x0: -54, z0: 6.4, x1: -54 + stairRun(4), z1: 7.9 };
  const H_PLAZA: Rect = { x0: -19.2, z0: 34.6, x1: -17.4, z1: 34.6 + stairRun(4) };
  const H_PARK: Rect = { x0: 22.2, z0: 30 - stairRun(4), x1: 24.2, z1: 30 };
  slabWithHoles(b, -W, -D, W, D, CEIL, 0, [H_MANSION, H_PLAZA, H_PARK], 'grama', { tint: C.grass, castShadow: false });
  // Region floors (decals): the forest floor, the cemetery's dead grass, the park and the plaza.
  decal(-W, -D, 18, -37, 0.005, 'grama', C.grassDark);
  decal(-W, -37, -28, -11, 0.005, 'grama', C.grassDark);
  decal(-28, -36, 28, -14, 0.005, 'grama', 0x5e5e40);
  slabWithHoles(b, 20, 13.5, 58, 30.4, 0, 0.012, [H_PARK], 'pedra', { tint: 0x6a5a62, collide: false, castShadow: false });
  slabWithHoles(b, -45, 31.6, 45, D, 0, 0.012, [H_PLAZA], 'pedra', { tint: 0x5f5a58, collide: false, castShadow: false });
  // Roads: the Estrada Maldita (east -> west, then south to the village) and the village street.
  decal(18, -50, W, -44, 0.02, 'asfalto', C.asphalt);
  decal(36, -44, 42, -2.5, 0.02, 'asfalto', C.asphalt);
  decal(-23, -2.5, 42, 2.5, 0.02, 'asfalto', C.asphalt);
  for (let x = 22; x < W; x += 6) decal(x, -47.12, x + 2.4, -46.88, 0.025, 'pintura', 0x9a9070);
  decal(-23, -4, 34, -2.5, 0.03, 'calcada', 0x6e6a66);
  decal(-23, 2.5, 34, 4, 0.03, 'calcada', 0x6e6a66);
  // Paths: cemetery cross, forest trails, the way from the cemetery to the mansion.
  decal(-1.2, -36, 1.2, -14, 0.015, 'pedra', C.path);
  decal(-28, -25.5, 28, -23.5, 0.015, 'pedra', C.path);
  decal(-1.2, -46, 1.2, -36, 0.015, 'grama', C.dirt);
  decal(-33, -47, 18, -45, 0.015, 'grama', C.dirt);
  decal(-45, -25.5, -28, -23.5, 0.015, 'grama', C.dirt);
  decal(-45, -23.5, -43, -11, 0.015, 'grama', C.dirt);

  // --- Perimeter: tall stone wall, and dead trees beyond it (silhouettes) -----------------------------
  const wallH = 4.5;
  const stoneWall = { tint: 0x4e4a50 };
  b.span(-W - 1, 0, -D - 1, W + 1, wallH, -D, 'pedra', stoneWall);
  b.span(-W - 1, 0, D, W + 1, wallH, D + 1, 'pedra', stoneWall);
  b.span(-W - 1, 0, -D, -W, wallH, D, 'pedra', stoneWall);
  b.span(W, 0, -D, W + 1, wallH, D, 'pedra', stoneWall);
  for (const [x0, z0, x1, z1] of [[-W - 1.15, -D - 1.15, W + 1.15, -D + 0.15], [-W - 1.15, D - 0.15, W + 1.15, D + 1.15], [-W - 1.15, -D, -W + 0.15, D], [W - 0.15, -D, W + 1.15, D]]) {
    b.span(x0, wallH, z0, x1, wallH + 0.18, z1, 'pedra', { tint: 0x3a363c, collide: false });
  }
  for (let k = 0; k < 36; k++) {
    const a = (k / 36) * Math.PI * 2 + rand() * 0.1;
    const r = 1 + 0.12 + rand() * 0.2;
    deadTree(b, Math.cos(a) * W * r * 1.08, Math.sin(a) * D * r * 1.1, 1.6 + rand() * 1.2, rand, { collide: false, tint: 0x241a1e });
  }

  // --- Forest (north and north-west) with the twisted tree ---------------------------------------------
  const keepOut: Rect[] = [
    { x0: -49, z0: -53, x1: -31, z1: -39 }, // cabin
    { x0: -36, z0: -48.5, x1: 19, z1: -43.5 }, // trail to the cabin and the road
    { x0: -2.5, z0: -48, x1: 2.5, z1: -36 }, // trail to the cemetery
    { x0: -46.5, z0: -27, x1: -27, z1: -22 }, // trail to the mansion
    { x0: -46.5, z0: -27, x1: -41.5, z1: -11 },
    { x0: 0, z0: -50, x1: 9, z1: -40 }, // twisted tree
    ...[[-22, -41], [-50, -52], [12, -52], [-30, -50], [-52, -20], [-8, -40]].map(([x, z]) => ({ x0: x - 2.2, z0: z - 2.2, x1: x + 2.2, z1: z + 2.2 })), // mushrooms
  ];
  const trees: [number, number][] = [];
  const free = (x: number, z: number) => !keepOut.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) && trees.every(([tx, tz]) => Math.hypot(tx - x, tz - z) > 3.4);
  const plant = (x0: number, z0: number, x1: number, z1: number, n: number) => {
    for (let tries = 0, placed = 0; placed < n && tries < n * 30; tries++) {
      const x = x0 + rand() * (x1 - x0);
      const z = z0 + rand() * (z1 - z0);
      if (!free(x, z)) continue;
      trees.push([x, z]);
      placed++;
      deadTree(b, x, z, 0.85 + rand() * 0.5, rand);
    }
  };
  plant(-58, -53.5, 17, -38, 34);
  plant(-58, -37, -30, -13, 18);
  deadTree(b, 4.5, -42.5, 2.7, rand, { branches: 10, tint: 0x2e2026 });
  for (let k = 0; k < 14; k++) {
    const x = -56 + rand() * 72;
    const z = -53 + rand() * 14;
    if (free(x, z)) rock(b, x, 0, z, 0.7 + rand() * 0.6, 0.5 + rand() * 0.5, 0.7 + rand() * 0.5, rand, 0x5a5850);
  }
  // Glowing mushrooms: decorative clusters, and three that light up when shot (a secret's ingredient).
  const shroomGlow = [0x6affd8, 0xb46aff, 0x6ad8ff];
  for (const [cx, cz] of [[-22, -41], [-50, -52], [12, -52], [-30, -50], [-52, -20], [-8, -40]]) {
    for (let k = 0; k < 5; k++) {
      const x = cx + (rand() - 0.5) * 2.4;
      const z = cz + (rand() - 0.5) * 2.4;
      const s = 0.5 + rand() * 0.6;
      b.cylinder(x, 0, z, 0.04 * s, 0.25 * s, 'pintura', { tint: 0xd8d2c0, collide: false, castShadow: false, segments: 5 });
      glow.add(new THREE.SphereGeometry(0.14 * s, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1).translate(x, 0.24 * s, z), shroomGlow[k % 3]);
    }
  }
  const shrooms = new GlowShrooms(scene, b, [V(-21, 0, -40), V(-49, 0, -51), V(13, 0, -51.5)], props, (at) => sfx.at(at, 'normal', (s) => s.targetDing()));
  animated.push((dt) => shrooms.update(dt));

  // Witch's cabin: the witch stirring the cauldron in the middle, shelves full of potions along the back
  // wall, a worktable, the broom by the door. Standing near her you can drink her potion (MapPotion).
  home({ x0: -47, z0: -51, x1: -33, z1: -41, h: 4.6, wall: 'madeira', tint: 0x4a3a2e, roof: 0x2e3a2a, ridge: 'x', rise: 3.4, doors: { s: [-40], e: [-46] }, windows: { w: [-46], n: [-40.5] }, frame: 0x2a1a12 });
  b.span(-46.6, 3.0, -50.8, -45.2, 9.4, -49.4, 'pedra', { tint: C.stoneDark });
  const potionColors = [0x6affd8, 0xb46aff, 0xff6ad8, 0x8aff4a, 0xffb43a, 0x4ac8ff, 0xff4a4a];
  for (const sx of [-44.5, -36.7]) {
    const shelf = new Place(b, sx, 0, -50.62, 0);
    for (const ex of [-1, 1]) shelf.box([ex * 1.0, 1.0, 0], [0.05, 2.0, 0.4], 'madeira', C.woodDark);
    shelf.box([0, 1.0, -0.18], [2.0, 2.0, 0.03], 'madeira', 0x2e2018);
    for (const y of [0.05, 0.6, 1.15, 1.7]) shelf.box([0, y, 0], [2.0, 0.04, 0.4], 'madeira', 0x5a3a26);
    shelf.solid([0, 1.0, 0], [1.0, 1.0, 0.2]);
    for (const y of [0.07, 0.62, 1.17, 1.72]) {
      for (let k = 0; k < 6; k++) {
        if (rand() < 0.15) continue;
        const at = shelf.at(-0.82 + k * 0.32 + (rand() - 0.5) * 0.08, y + 0.02, (rand() - 0.5) * 0.12);
        potion(b, glow, at.x, at.y, at.z, Math.floor(rand() * 3) as 0 | 1 | 2, potionColors[Math.floor(rand() * potionColors.length)], 0.9 + rand() * 0.4);
      }
    }
  }
  table(b, -35.2, 0, -49.6, 1.4, 0.8, 0, 0.8, 0x4a3020);
  for (const [px, pz, kind, c] of [[-35.6, -49.8, 0, 0x6affd8], [-35.3, -49.4, 1, 0xff6ad8], [-34.8, -49.75, 2, 0xffb43a]] as const) potion(b, glow, px, 0.8, pz, kind, c, 1.3);
  b.box(-34.85, 0.82, -49.35, 0.36, 0.04, 0.26, 'pintura', { tint: 0xd8c8a0, collide: false });
  candle(b, glow, -35.9, 0.8, -49.3, 0.14);
  // The broom leaning by the south door.
  b.box(-38.4, 0.75, -41.5, 0.05, 1.5, 0.05, 'madeira', { tint: 0x8a6a3a, collide: false, rot: new THREE.Euler(0.22, 0, 0) });
  b.box(-38.4, 0.14, -41.38, 0.3, 0.32, 0.18, 'feno', { tint: 0xc8a050, collide: false, rot: new THREE.Euler(0.22, 0, 0) });
  const witch = new Witch(scene, b, V(...WITCHES.halloween!), Math.PI / 2, props, {
    cackle: (at) => sfx.at(at, 'loud', (x) => x.evilLaugh()),
    scold: (at) => sfx.at(at, 'normal', (x) => x.grumble()),
  });
  animated.push((dt, f) => witch.update(dt, f.listener));
  const cauldron = new Cauldron(scene, b, V(-40, 0, -46), props, puffs, { x0: -46.3, x1: -33.7, z0: -50.2, z1: -41.7 }, {
    bubble: (at) => sfx.at(at, 'normal', (s) => s.cauldronBubble()),
    quack: (at) => sfx.at(at, 'normal', (s) => s.quack()),
  });
  animated.push((dt) => cauldron.update(dt));
  signBoard(b, scene, ['CUIDADO', 'Bruxa trabalhando', '(e de mau humor)'], -36.5, -39.6, 0, { bg: '#4a3a5a', fg: '#e6d8ff', height: 1.3 });

  // --- Cemetery -----------------------------------------------------------------------------------------
  ironFence(b, 'x', -36, -28, 28, [[-1.5, 1.5]]);
  ironFence(b, 'x', -14, -28, 28, [[-9.75, -7.75], [7, 9], [21, 24]]);
  ironFence(b, 'z', -28, -36, -14, [[-25.5, -23.5]]);
  ironFence(b, 'z', 28, -36, -14, [[-26, -22]]);
  gateArch(b, scene, glow, 'z', 28, -26, -22, 'CEMITÉRIO');
  gateArch(b, scene, glow, 'x', -36, -1.5, 1.5, 'SAÍDA ?');

  // Chapel with the bell tower over its door (east).
  {
    const cw = { tint: 0x7d7872, frame: { surface: 'pintura' as const, tint: 0x2a2428, width: 0.1 } };
    const op = (c: number): Opening => [c - 0.85, c + 0.85, 0, 2.4];
    b.wall('x', -33, -26, -16, 0.3, 4.6, 'pedra', [op(-23)], 0, cw);
    b.wall('x', -26, -26, -16, 0.3, 4.6, 'pedra', [op(-21)], 0, cw);
    b.wall('z', -26, -32.85, -26.15, 0.3, 4.6, 'pedra', [], 0, cw);
    b.wall('z', -16, -32.85, -26.15, 0.3, 4.6, 'pedra', [[-30.4, -28.6, 0, 2.6]], 0, cw);
    b.span(-25.85, 0, -32.85, -16.15, 0.02, -26.15, 'piso', { tint: 0x5a3a2e, collide: false, castShadow: false });
    b.span(-25.85, 4.4, -32.85, -16.15, 4.6, -26.15, 'concreto', { tint: 0x5a5458 });
    b.gableRoof(-26, -33, -16, -26, 4.6, 3.2, 'telhado', { tint: C.roof, ridgeAxis: 'x', gableSurface: 'pedra', gableTint: 0x7d7872 });
    // Stained glass (painted on the walls, inside and out) and the rose window over the altar.
    const stained = [0xc23a5a, 0x3a6ac2, 0xe6b23a, 0x5ac23a];
    for (const [k, x] of [-24.4, -18.6].entries()) {
      for (const z of [-33.18, -32.82, -26.18, -25.82]) {
        glow.add(new THREE.BoxGeometry(1.0, 1.6, 0.02).translate(x, 2.9, z), stained[(k + (z > -30 ? 2 : 0)) % 4]);
      }
    }
    glow.add(new THREE.CylinderGeometry(0.7, 0.7, 0.02, 12).rotateZ(Math.PI / 2).translate(-26.17, 5.6, -29.5), 0xb03ac2);
    // Pews (crouch cover) and the altar with candles.
    for (const x of [-23.6, -21.8, -20, -18.2]) for (const z of [-31.15, -27.85]) pew(b, x, z, -Math.PI / 2, 1.5, C.wood);
    b.span(-25.8, 0, -30.6, -25, 1.05, -28.4, 'pedra', { tint: 0x9a948c });
    for (const z of [-30.3, -29.8, -29.2, -28.7]) candle(b, glow, -25.4, 1.05, z, 0.24);
    light(-24.6, 1.8, -29.5, { intensity: 14, range: 11, flicker: 0.6 });
    // Standing candelabras by the door, and a lantern in the tower's vestibule.
    for (const z of [-32.3, -26.7]) {
      b.cylinder(-17.2, 0, z, 0.18, 0.08, 'metal', { tint: C.iron, segments: 8 });
      b.cylinder(-17.2, 0.08, z, 0.04, 1.4, 'metal', { tint: C.iron, segments: 6 });
      b.box(-17.2, 1.5, z, 0.5, 0.04, 0.04, 'metal', { tint: C.iron, collide: false });
      for (const dz of [-0.22, 0, 0.22]) glow.add(new THREE.ConeGeometry(0.035, 0.1, 5).translate(-17.2, 1.62, z + dz), C.candle);
      light(-17.5, 1.9, z, { intensity: 9, range: 9, flicker: 0.6 });
    }
    hangingLamp(-14.5, 7.8, -29.5, { intensity: 8, range: 8 });
    // Bell tower (the vestibule is its ground floor), open belfry, the bell.
    const tw = { tint: 0x77726c };
    b.wall('x', -31, -15.85, -13, 0.3, 8, 'pedra', [], 0, tw);
    b.wall('x', -28, -15.85, -13, 0.3, 8, 'pedra', [], 0, tw);
    b.wall('z', -13, -30.85, -28.15, 0.3, 8, 'pedra', [[-30.3, -28.7, 0, 2.6]], 0, { ...tw, frame: { surface: 'pintura', tint: 0x2a2428, width: 0.1 } });
    b.span(-16.15, 7.8, -31.15, -12.85, 8.0, -27.85, 'pedra', { tint: 0x5a5650 });
    for (const [x, z] of [[-16, -31], [-13, -31], [-13, -28], [-16, -28]]) b.box(x, 9.3, z, 0.35, 2.6, 0.35, 'pedra', { tint: 0x77726c });
    const spire = new THREE.ConeGeometry(2.5, 3.6, 4).rotateY(Math.PI / 4).translate(-14.5, 10.6 + 1.8, -29.5);
    b.addGeometry(spire, surfaceMaterial('telhado'), C.roof);
    spire.dispose();
    b.box(-14.5, 10.5, -29.5, 3.3, 0.2, 3.3, 'pedra', { tint: 0x5a5650, collide: false });
    b.box(-14.5, 10.25, -29.5, 0.12, 0.3, 2.6, 'madeira', { tint: C.woodDark, collide: false });
  }
  const bellBubble = bubbleAt(V(-14.5, 13.2, -29.5), 4);
  let bellComplained = -99;
  const chapelBell = new Bell(scene, b, V(-14.5, 10.1, -29.5), 1.1, props, 'sinocapela', (recent) => {
    sfx.at({ x: -14.5, y: 9.5, z: -29.5 }, 'loud', (s) => s.churchBell());
    if (recent >= 5 && now - bellComplained > 8) {
      bellComplained = now;
      bellBubble.say('EU JÁ OUVI.', 3);
      sfx.at({ x: -14.5, y: 9.5, z: -29.5 }, 'normal', (s) => s.grumble());
    }
  });
  animated.push((dt) => chapelBell.update(dt));

  // Mausoleum: a corridor between four burial rooms, doors on three sides, roof reached by the stairs.
  {
    const mw = { tint: 0x7a766e, frame: { surface: 'pintura' as const, tint: 0x3a363a, width: 0.12 } };
    const op = (c: number, w = 1.7): Opening => [c - w / 2, c + w / 2, 0, 2.5];
    const h = 4.2;
    b.wall('x', -35, 14, 24, 0.4, h, 'pedra', [], 0, mw);
    b.wall('x', -27, 14, 24, 0.4, h, 'pedra', [op(17)], 0, mw);
    b.wall('z', 14, -34.8, -27.2, 0.4, h, 'pedra', [op(-31, 1.8)], 0, mw);
    b.wall('z', 24, -34.8, -27.2, 0.4, h, 'pedra', [op(-31, 1.8)], 0, mw);
    const inner = { tint: 0x6a665e };
    b.wall('x', -32.3, 14.2, 23.8, 0.3, h, 'pedra', [op(16.5), op(21.5)], 0, inner);
    b.wall('x', -29.7, 14.2, 23.8, 0.3, h, 'pedra', [op(16.5), op(21.5)], 0, inner);
    b.wall('z', 19, -34.8, -32.45, 0.3, h, 'pedra', [], 0, inner);
    b.wall('z', 19, -29.55, -27.2, 0.3, h, 'pedra', [], 0, inner);
    b.span(14.2, 0, -34.8, 23.8, 0.02, -27.2, 'pedra', { tint: 0x4a4644, collide: false, castShadow: false });
    b.span(13.8, h, -35.2, 24.2, h + 0.25, -26.8, 'pedra', { tint: 0x5a5650 });
    const top = h + 0.25;
    const par = { tint: 0x6a665e };
    b.span(13.8, top, -35.2, 24.2, top + 0.9, -34.95, 'pedra', par);
    b.span(13.8, top, -34.95, 14.05, top + 0.9, -26.8, 'pedra', par);
    b.span(23.95, top, -34.95, 24.2, top + 0.9, -26.8, 'pedra', par);
    b.span(14.05, top, -27.05, 22.2, top + 0.9, -26.8, 'pedra', par);
    // Its top step lands right at the gap in the parapet.
    b.stairs('x', 1, 23.9 - stairRun(top), -26.75, -25.55, 0, top, 'pedra', { tint: 0x6a665e });
    // Porch with columns on the west side, facing the graves.
    for (const z of [-32.7, -29.3]) b.cylinder(13.1, 0, z, 0.25, h, 'pedra', { tint: 0x8a867e, segments: 10 });
    b.span(12.6, h, -33.3, 14, h + 0.3, -28.7, 'pedra', { tint: 0x5a5650 });
    // Coffins in the burial rooms.
    for (const [x, z] of [[16.5, -33.6], [21.5, -33.6], [21.5, -28.4], [16.4, -28.4]]) coffin(b, x, 0, z, Math.PI / 2, 0x3a2420);
    const plate = canvasTexture(256, 64, (g) => {
      g.fillStyle = '#4a4644';
      g.fillRect(0, 0, 256, 64);
      g.fillStyle = '#d8cfb8';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      fitText(g, 'FAMÍLIA DESCANSO', 128, 34, 230, (px) => `900 ${px}px Nunito, serif`, 30);
    });
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshToonMaterial({ map: plate, gradientMap: toonGradient() }));
    plaque.position.set(12.58, h + 0.15, -31);
    sconce(19.3, 2.2, -32.13, [0, 1]);
    sconce(19.3, 2.2, -29.87, [0, -1]);
    plaque.rotation.y = -Math.PI / 2;
    scene.add(plaque);
  }

  // Tombstones: rows broken by the paths, a few with epitaphs, and the ghost's grave.
  const kinds: TombKind[] = ['arco', 'arco', 'arco', 'arco', 'cruz', 'cruz', 'laje', 'obelisco'];
  const special: [number, number, TombKind, string[]][] = [
    [-3.5, -20.5, 'arco', ['AQUI JAZ', 'JOÃO', 'ELE DISSE QUE', 'NÃO IA CLICAR.', 'CLICOU.']],
    [-3.5, -28, 'arco', ['DESCONHECIDO', 'PROVAVELMENTE', 'FOI FLANQUEADO.']],
    [3.5, -31.5, 'arco', ['AQUI JAZ', 'O CAMPEÃO', 'DE ESCONDE-', 'ESCONDE']],
    [-7.2, -16.6, 'laje', ['R.I.P.', 'LAG']],
    [9.6, -28, 'arco', ['VOLTO JÁ']],
    [5, -22.1, 'arco', ['AQUI JAZ', 'UM FANTASMA', 'COM SONO']],
  ];
  for (const [x, z, kind, lines] of special) epitaph(scene, tombstone(b, x, z, 0, kind, rand), lines);
  for (let x = -12; x <= 11.5; x += 2.4) {
    if (Math.abs(x) < 2) continue;
    for (const z of [-34, -31.5, -29, -21.6, -19, -16.6]) {
      if (special.some(([sx, sz]) => Math.abs(sx - x) < 1.6 && Math.abs(sz - z) < 1.6)) continue;
      if (x > 2 && x < 8.5 && z > -24 && z < -17) continue; // the ghost's grave
      if (x < -10 && z > -32 && z < -27) continue; // the way into the bell tower
      if (rand() < 0.22) continue;
      tombstone(b, x + (rand() - 0.5) * 0.5, z + (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.3, kinds[Math.floor(rand() * kinds.length)], rand, rand() < 0.3 ? 0x7a7a70 : C.stone);
    }
  }
  for (const [x, z] of [[-10.5, -35], [12, -17], [-14.5, -18], [26, -34.5], [11, -35]]) deadTree(b, x, z, 1 + rand() * 0.3, rand);
  const ghost = new GraveGhost(scene, b, props, V(5, 0, -20.4), 0, puffs, {
    moan: () => sfx.at({ x: 5, y: 1, z: -20.4 }, 'normal', (s) => s.ghostMoan()),
    talk: () => sfx.at({ x: 5, y: 1.5, z: -20.4 }, 'normal', (s) => s.grumble()),
  });
  animated.push((dt) => ghost.update(dt));
  b.box(6.4, 0.5, -19.2, 0.06, 1.0, 0.25, 'metal', { tint: 0x5a5a60, collide: false, rot: new THREE.Euler(0, 0.3, 0.35) }); // the shovel

  // --- Estrada Maldita: the road in, the barn, the roadside ---------------------------------------------
  signBoard(b, scene, ['BEM-VINDO.', 'Se você chegou até aqui,', 'já era.'], 47, -42.4, Math.PI / 2, { bg: '#d9c8a6', fg: '#5a1a1a', height: 1.6, w: 1.8, h: 1.0, tilt: 0.12 });
  signBoard(b, scene, ['NÃO ENTRE.'], 31.2, -27.6, Math.PI / 2, { bg: '#e8e0d0', fg: '#a01a1a', height: 1.4, w: 1.4, h: 0.6 });
  signBoard(b, scene, ['ENTRADA →'], 31.2, -19.5, Math.PI / 2, { bg: '#d8342a', fg: '#ffffff', height: 2.0, w: 2.6, h: 0.9 });
  let honks: number[] = [];
  const neighbour = bubbleAt(V(51, 9.6, -29), 3.4);
  const horn = props.register('buzina', () => {
    honks = honks.filter((t) => now - t < 6);
    honks.push(now);
    sfx.at({ x: 30, y: 1, z: -47 }, 'loud', (s) => s.carHorn(0.25 + 0.3 * Math.min(8, honks.length - 1)));
    if (honks.length === 6) {
      neighbour.say('CHEGA.', 3);
      sfx.at({ x: 51, y: 8, z: -29 }, 'normal', (s) => s.grumble());
    }
  });
  buildCar(b, 30, -47, 0x4a5a6a, 0.3, horn);
  buildCar(b, 39.2, -20, 0x6a3a2a, Math.PI / 2 + 0.25);
  home({ x0: 46, z0: -34, x1: 56, z1: -24, h: 4.4, wall: 'madeira', tint: 0x6a2a24, roof: C.roof, ridge: 'z', rise: 3.6, doorW: 3, doors: { w: [-29], e: [-29], s: [51] }, windows: { n: [51] }, frame: 0xd8cfb8 });
  for (const [x, y, z, yaw] of [[48.0, 0, -33.0, 0], [49.3, 0, -33.0, 0], [48.65, 0.5, -33.0, 0.05], [48.6, 0, -32.3, 0], [54.2, 0, -26.2, Math.PI / 2], [54.2, 0.5, -26.2, Math.PI / 2 + 0.1], [52.5, 0, -31.2, 0.6]] as const) hayBale(b, x, y, z, yaw, [1.2, 0.5, 0.6]);
  for (const [x, z] of [[44, -40], [58.5, -33], [33, -40], [47, -18], [57, -16], [32, -10], [24, -52], [58, -53]]) deadTree(b, x, z, 1 + rand() * 0.4, rand);
  tombstone(b, 44.5, -36.5, -0.4, 'cruz', rand);
  tombstone(b, 53.5, -40.2, 0.3, 'arco', rand);
  buildCar(b, 50, -3, 0x3a5a3a, 0.6);
  buildCar(b, 55.5, 6, 0x5a2a4a, -0.2);
  for (const [x, z, y, yaw] of [[46, 8, 0, 0.1], [47.15, 8, 0, -0.1], [46.6, 8.1, 0.95, 0.3], [57, -9, 0, 0.4]] as const) crate(b, x, y, z, 0.95, yaw);
  {
    // Vending machine (a gag for later): lit front with rows of cans, buttons, the coin slot and the tray.
    const vm = new Place(b, 58.9, 0, -2, -Math.PI / 2);
    vm.round([0, 1.0, 0], [1.2, 2.0, 0.8], 0.05, 'metal', 0xa02a2a);
    vm.box([-0.15, 1.25, 0.401], [0.8, 1.2, 0.02], 'pintura', 0x1a1a22);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 5; k++) vm.cyl([-0.47 + k * 0.16, 0.8 + r * 0.28, 0.41], 0.045, 0.14, 'metal', [0xd8342a, 0x3a8ae8, 0xf2c230, 0x3aae6a, 0xf2f2f2][(r + k) % 5], { rot: [Math.PI / 2, 0, 0], seg: 8, shadow: false });
    for (let k = 0; k < 6; k++) vm.box([0.4, 1.6 - k * 0.12, 0.41], [0.12, 0.08, 0.02], 'pintura', 0xd8d8d0, undefined, false);
    vm.box([0.4, 0.8, 0.41], [0.08, 0.14, 0.02], 'metal', 0x2a2a2a, undefined, false);
    vm.box([-0.15, 0.32, 0.41], [0.6, 0.2, 0.02], 'pintura', 0x101014, undefined, false);
    glow.add(new THREE.BoxGeometry(0.02, 0.3, 1.0).translate(58.48, 1.9, -2), 0xffe0a0);
  }

  // --- Mansion ------------------------------------------------------------------------------------------
  const FH = 3.6;
  const M = { x0: -56, z0: -8, x1: -30, z1: 12 };
  const MWH = FH * 2 + 0.2;
  const hall = { x0: -43.1, z0: -0.5, x1: -34, z1: 5.85 }; // the hall's open void up to the ceiling
  {
    const t = 0.3;
    const ext = { tint: C.mansion, frame: { surface: 'pintura' as const, tint: C.trim, width: 0.12 } };
    const door = (c: number, w = 1.7, h = 2.4): Opening => [c - w / 2, c + w / 2, 0, h];
    const win = (c: number): Opening => [c - 1, c + 1, 0.9, 2.3];
    const up = (c: number): Opening => [c - 0.9, c + 0.9, FH + 0.9, FH + 2.2];
    b.wall('x', M.z0, M.x0, M.x1, t, MWH, 'reboco', [door(-50), door(-36), win(-53), win(-46), win(-40), win(-33), up(-53), up(-47.5), up(-39), up(-33)], 0, ext);
    b.wall('x', M.z1, M.x0, M.x1, t, MWH, 'reboco', [door(-50), door(-36), win(-53), win(-46), win(-40), win(-33), up(-53), up(-47.5), up(-39), up(-33)], 0, ext);
    b.wall('z', M.x0, M.z0 + t / 2, M.z1 - t / 2, t, MWH, 'reboco', [door(2, 2), win(-5), win(9), up(-5), up(2), up(9)], 0, ext);
    b.wall('z', M.x1, M.z0 + t / 2, M.z1 - t / 2, t, MWH, 'reboco', [door(2, 2.4, 2.8), win(-5), win(9), up(-5), up(2), up(9)], 0, ext);
    // Interior walls: the hall band (z -2..6) between the north rooms (dining, library) and the south
    // rooms (kitchen, parlor); every room has two or more ways in. Same layout upstairs.
    const wallpaper = { tint: 0x8a4656, frame: { surface: 'pintura' as const, tint: 0x3a2420, width: 0.08 } };
    const ix0 = M.x0 + t / 2;
    const ix1 = M.x1 - t / 2;
    const iz0 = M.z0 + t / 2;
    const iz1 = M.z1 - t / 2;
    for (const [y0, h] of [[0, FH - 0.25], [FH, FH]] as const) {
      b.wall('x', -2, ix0, ix1, 0.25, h, 'reboco', [door(-48), door(-38)], y0, wallpaper);
      b.wall('x', 6, ix0, ix1, 0.25, h, 'reboco', [door(-47), door(-35)], y0, wallpaper);
      b.wall('z', -43, iz0, -2.125, 0.25, h, 'reboco', [door(-5)], y0, wallpaper);
      // Downstairs the kitchen-parlor door is by the hall, to leave the wall to the fireplace.
      b.wall('z', -43, 6.125, iz1, 0.25, h, 'reboco', [door(y0 === 0 ? 7 : 9)], y0, wallpaper);
    }
    slabWithHoles(b, ix0, iz0, ix1, iz1, 0, 0.02, [H_MANSION], 'piso', { tint: 0x8a5e44, collide: false, castShadow: false });
    slabWithHoles(b, ix0, iz0, ix1, iz1, FH - 0.25, FH, [hall], 'piso', { tint: 0x8a5e44 });
    b.span(ix0, FH * 2, iz0, ix1, MWH, iz1, 'concreto', { tint: 0x4e4246 });
    // Grand staircase along the hall's south side, landing on the west gallery; railings around the void.
    b.stairs('x', -1, -38.5, 3.6, 5.75, 0, FH, 'madeira', { tint: 0x4a1e24 });
    const rail = { h: 1.0, tint: 0x2a1a14 };
    railing(b, 'x', hall.z0, hall.x0, hall.x1, FH, rail);
    railing(b, 'z', hall.x1, hall.z0, hall.z1, FH, rail);
    railing(b, 'z', hall.x0, hall.z0, 3.5, FH, rail);
    decal(-55.5, 1.2, -30.5, 2.8, 0.03, 'pintura', 0x7a1a24); // red carpet from door to door
    // Roof, chimneys and the lit cupola on the ridge (seen from the whole map).
    b.gableRoof(M.x0, M.z0, M.x1, M.z1, MWH, 4.0, 'telhado', { tint: 0x2e2834, ridgeAxis: 'x', gableSurface: 'reboco', gableTint: C.mansion });
    b.span(-52.6, MWH, -4.6, -51.4, MWH + 5.2, -3.4, 'tijolo', { tint: 0x4a3a3a, collide: false });
    b.span(-34.6, MWH, 7.4, -33.4, MWH + 5.2, 8.6, 'tijolo', { tint: 0x4a3a3a, collide: false });
    b.span(-45, MWH + 3, 0, -41, MWH + 6.4, 4, 'reboco', { tint: C.mansion, collide: false });
    const cap = new THREE.ConeGeometry(3.1, 2.8, 4).rotateY(Math.PI / 4).translate(-43, MWH + 6.4 + 1.4, 2);
    b.addGeometry(cap, surfaceMaterial('telhado'), 0x2e2834);
    cap.dispose();
    for (const [x, z, sx, sz] of [[-43, -0.02, 1.2, 0.02], [-43, 4.02, 1.2, 0.02], [-45.02, 2, 0.02, 1.2], [-40.98, 2, 0.02, 1.2]]) glow.add(new THREE.BoxGeometry(sx, 1.4, sz).translate(x, MWH + 4.7, z), C.window);
    // Painted attic windows on both gables.
    for (const x of [M.x0 - 0.17, M.x1 + 0.17]) glow.add(new THREE.CylinderGeometry(0.6, 0.6, 0.02, 12).rotateZ(Math.PI / 2).translate(x, MWH + 1.6, 2), C.window);
    // Front porch with columns, toward the village.
    b.span(-30, 0, -1.2, -27, 0.3, 5.2, 'pedra', { tint: 0x6a6460 });
    for (const z of [-0.8, 4.8]) b.cylinder(-27.4, 0.3, z, 0.18, 3.0, 'pintura', { tint: C.trim, segments: 10 });
    b.span(-30, 3.3, -1.4, -26.9, 3.5, 5.4, 'telhado', { tint: 0x2e2834, collide: false });
    // Hall: the clock, suits of armor, a chandelier with candles (the only warm light inside).
    for (const z of [-1.2, 5.2]) suitOfArmor(b, -30.85, 0, z, -Math.PI / 2);
    const chandelier = new THREE.Group();
    const iron = toon(C.iron);
    chandelier.add(new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.05, 6, 24).rotateX(Math.PI / 2), iron));
    chandelier.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 4).translate(0, 0.7, 0), iron));
    const flames = Array.from({ length: 8 }, (_, k) => new THREE.ConeGeometry(0.05, 0.14, 5).translate(Math.cos((k / 8) * Math.PI * 2) * 1.1, 0.18, Math.sin((k / 8) * Math.PI * 2) * 1.1));
    chandelier.add(new THREE.Mesh(mergeGeometries(flames, false)!, new THREE.MeshBasicMaterial({ color: C.candle })));
    chandelier.position.set(-38.5, 5.6, 2.6);
    scene.add(chandelier);
    light(-38.5, 5.2, 2.6, { intensity: 20, range: 10, flicker: 0.25 });
    animated.push(() => (chandelier.rotation.z = Math.sin(now * 0.7) * 0.02));
    // Candles on the walls of the hall, and a lamp in every room, upstairs too.
    sconce(-55.75, 2.2, 5.5, [1, 0]);
    sconce(-55.75, 2.2, -1.2, [1, 0]);
    hangingLamp(-32.2, FH * 2, 2.2);
    for (const [x, z] of [[-50, -5], [-36.5, -5], [-50, 9], [-36.5, 9.4], [-49, 2]]) hangingLamp(x, FH * 2, z);
    // Portraits along the hall (their eyes will follow the player some day).
    // Two portraits of the family, each one only once.
    portrait(b, scene, -44.6, 1.9, 5.86, Math.PI, 0);
    const clock = new GrandfatherClock(scene, b, -46, 0, -1.58, 0, props, (hour) => sfx.at({ x: -46, y: 2, z: -1.6 }, 'loud', (s) => s.clockChime(hour === 12 ? 4 : 3)));
    animated.push((dt) => clock.update(dt));
    // Dining room: the long table, chairs, candles.
    table(b, -49.5, 0, -5, 6.4, 1.2, 0, 0.78, 0x3a2018);
    for (let x = -52.2; x <= -46.8; x += 1.35) {
      chair(b, x, 0, -6.05, 0, 0x3a2018);
      chair(b, x, 0, -3.95, Math.PI, 0x3a2018);
    }
    chair(b, -53.25, 0, -5, Math.PI / 2, 0x3a2018);
    chair(b, -45.75, 0, -5, -Math.PI / 2, 0x3a2018);
    for (const x of [-51.5, -49.5, -47.5]) candle(b, glow, x, 0.78, -5, 0.18);
    for (const x of [-52.2, -50.85, -49.5, -48.15, -46.8]) for (const z of [-5.35, -4.65]) b.cylinder(x, 0.78, z, 0.11, 0.012, 'pintura', { tint: 0xe8e4dc, collide: false, castShadow: false, segments: 12 });
    light(-49.5, 1.6, -5, { intensity: 12, range: 10, flicker: 0.5 });
    hangingLamp(-49.5, FH - 0.25, -5);
    // Library: freestanding bookshelves (cover) and a desk.
    // Shelves against the walls (around the doors and windows), one double-sided stack in the east half
    // for cover, and the reading desk under the north-west window, its chair facing the glass.
    bookshelf(b, -42.6, -6.85, 1.8, rand, Math.PI / 2, 2.2, false);
    bookshelf(b, -42.6, -3.15, 1.8, rand, Math.PI / 2, 2.2, false);
    bookshelf(b, -37.93, -7.57, 1.9, rand, 0, 2.2, false);
    bookshelf(b, -33.6, -5, 3, rand, Math.PI / 2);
    table(b, -40, 0, -7.35, 1.4, 0.7, 0, 0.78, 0x3a2018);
    chair(b, -40, 0, -6.55, Math.PI, 0x3a2018, 0x2a4a3a);
    b.cylinder(-39.5, 0.78, -7.45, 0.07, 0.35, 'metal', { tint: 0xc8a03a, collide: false, segments: 8 });
    b.cylinder(-39.5, 1.13, -7.45, 0.2, 0.2, 'pintura', { tint: 0x2a5a3a, collide: false, radiusTop: 0.1, segments: 10 });
    light(-39.6, 1.2, -6.9, { intensity: 10, range: 8 });
    hangingLamp(-37.2, FH - 0.25, -4.6);
    // Kitchen: tiled floor, a counter with the sink under the window, the stove under its hood, the fridge,
    // a table under hanging pots, the basement stairs, and the tall cabinet with the Scooby biscuits
    // (shoot or stab it and the doors swing open).
    slabWithHoles(b, ix0, 6.125, -43.125, iz1, 0, 0.03, [H_MANSION], 'azulejo', { tint: 0xd8cfc0, collide: false, castShadow: false });
    const cabinetWood = { tint: 0x7a5238 };
    b.box(-53.4, 0.45, 11.52, 4.4, 0.9, 0.62, 'madeira', cabinetWood);
    b.box(-53.4, 0.925, 11.49, 4.5, 0.05, 0.7, 'pedra', { tint: 0xe0dcd4, collide: false });
    b.box(-53, 0.95, 11.45, 0.8, 0.02, 0.42, 'metal', { tint: 0x4a4a52, collide: false, castShadow: false });
    b.cylinder(-53, 0.95, 11.74, 0.02, 0.32, 'metal', { tint: 0xc8c8d0, collide: false, segments: 6 });
    b.box(-53, 1.25, 11.64, 0.03, 0.03, 0.2, 'metal', { tint: 0xc8c8d0, collide: false });
    for (let k = 0; k < 4; k++) b.box(-55.1 + k * 1.1, 0.5, 11.2, 0.9, 0.7, 0.02, 'madeira', { tint: 0x6a4630, collide: false, castShadow: false });
    b.box(-55.0, 2.05, 11.62, 1.2, 0.7, 0.42, 'madeira', cabinetWood);
    b.box(-48, 0.45, 11.45, 0.9, 0.9, 0.75, 'metal', { tint: 0x2a2a2e });
    b.box(-48, 0.91, 11.45, 0.92, 0.03, 0.77, 'metal', { tint: 0x1a1a1e, collide: false });
    for (const [px, pr, ph] of [[-48.2, 0.16, 0.22], [-47.78, 0.13, 0.14]]) b.cylinder(px, 0.93, 11.4, pr, ph, 'metal', { tint: 0x9a9aa2, collide: false, segments: 12 });
    b.box(-48, 2.1, 11.6, 1.0, 0.45, 0.5, 'metal', { tint: 0x5a5a62, collide: false });
    b.box(-48, 2.85, 11.7, 0.3, 1.05, 0.3, 'metal', { tint: 0x5a5a62, collide: false });
    b.box(-43.6, 1.0, 11.35, 0.85, 2.0, 0.8, 'metal', { tint: 0xd8d0c0 });
    b.box(-44.05, 1.2, 11.0, 0.03, 0.6, 0.04, 'metal', { tint: 0x8a8a90, collide: false });
    table(b, -51.4, 0, 9.7, 1.6, 0.9, 0, 0.78, 0x5a3a28);
    chair(b, -52.55, 0, 9.7, Math.PI / 2, 0x4a2e20, 0xd8c8a0);
    chair(b, -50.25, 0, 9.7, -Math.PI / 2, 0x4a2e20, 0xd8c8a0);
    b.box(-51.4, 2.9, 9.7, 1.5, 0.05, 0.05, 'metal', { tint: C.iron, collide: false, castShadow: false });
    for (const [px, pr] of [[-51.9, 0.14], [-51.4, 0.11], [-50.9, 0.16]]) {
      b.box(px, 2.75, 9.7, 0.015, 0.3, 0.015, 'metal', { tint: C.iron, collide: false, castShadow: false });
      b.cylinder(px, 2.42, 9.7, pr, 0.18, 'metal', { tint: 0xb87a4a, collide: false, segments: 10 });
    }
    hangingLamp(-48.6, FH - 0.25, 9.3, { intensity: 12, range: 8 });
    railing(b, 'x', H_MANSION.z1 + 0.05, H_MANSION.x0, H_MANSION.x1, 0, { h: 1.0, tint: 0x2a1a14 });
    railing(b, 'z', H_MANSION.x0 - 0.05, H_MANSION.z0, H_MANSION.z1 + 0.05, 0, { h: 1.0, tint: 0x2a1a14 });
    const cabinet = new KitchenCabinet(scene, b, V(-43.125 - 0.3, 0, 9), -Math.PI / 2, props, () => sfx.at({ x: -43.7, y: 1.2, z: 9 }, 'normal', (s) => s.cabinetCreak()));
    const [biscuitAt] = PICKUPS.halloween;
    biscuit = new ScoobyBiscuit(scene, biscuitAt.id, V(...biscuitAt.p), cabinet);
    animated.push((dt) => {
      cabinet.update(dt);
      biscuit!.update(dt);
    });
    stabbable.push((eye, fwd, reach) => cabinet.stab(eye, fwd, reach));
    // Parlor: the fireplace on the wall shared with the kitchen, the sofa and armchairs facing it, a rug.
    b.box(-42.55, 0.75, 10, 0.6, 1.5, 2.3, 'pedra', { tint: 0x7a706a });
    b.box(-42.6, 2.45, 10, 0.5, 1.8, 1.7, 'pedra', { tint: 0x7a706a });
    b.box(-42.4, 1.55, 10, 0.85, 0.1, 2.6, 'madeira', { tint: 0x3a2418 });
    b.box(-42.24, 0.45, 10, 0.02, 0.62, 1.1, 'pintura', { tint: 0x140c0a, collide: false, castShadow: false });
    glow.add(new THREE.BoxGeometry(0.02, 0.32, 0.8).translate(-42.215, 0.32, 10), 0xff8a2a);
    for (let k = 0; k < 3; k++) b.box(-42.05, 0.2, 10, 0.1, 0.1, 0.9, 'madeira', { tint: C.woodDark, collide: false, castShadow: false, rot: new THREE.Euler(k * 1.05, 0, 0) });
    for (const z of [9.1, 10.9]) glow.add(new THREE.ConeGeometry(0.04, 0.11, 5).translate(-42.3, 1.75, z), C.candle);
    light(-41.6, 0.8, 10, { color: 0xff8a3a, intensity: 18, range: 11, flicker: 0.8 });
    let ember = 0;
    animated.push((dt) => {
      ember -= dt;
      if (ember > 0) return;
      ember = 0.08;
      const hot = Math.random();
      puffs.emit(V(-42.08, 0.25, 10 + (Math.random() - 0.5) * 0.7), 0.05, 0.9 + Math.random() * 0.5, 0, 0.45, 0.13, 0.03, hot < 0.5 ? 0xffc040 : 0xff6a1a);
    });
    b.span(-43.6, MWH, 9.4, -42.2, MWH + 4.6, 10.6, 'tijolo', { tint: 0x4a3a3a, collide: false });
    decal(-41.8, 8.4, -38.8, 11.6, 0.035, 'pintura', 0x5a2030);
    sofa(b, -38.75, 0, 10, -Math.PI / 2, 2.4, 0x7a2a3a);
    table(b, -40.55, 0, 10, 0.55, 1.0, 0, 0.42, 0x3a2418);
    candle(b, glow, -40.55, 0.42, 10.25, 0.12);
    // Upstairs: the children's room (NW), master bedroom (NE), storage (SW), portrait gallery (SE).
    const fy = FH;
    bed(b, -54.95, fy, -7.2, Math.PI / 2, 1.0, 1.8, 0x5a7ab0, 0x6a4a5a);
    toyChest(b, -45, fy, -7.45, 0);
    rockingHorse(b, -49, fy, -4.2, 0.4);
    bed(b, -36, fy, -6.85, 0, 1.6, 2.0, 0x4a2a5a);
    for (const [x, z, y, yaw] of [[-54.2, 8, 0, 0.1], [-53.1, 8, 0, -0.15], [-53.7, 8.05, 0.95, 0.3], [-54.2, 9.3, 0, 0.5], [-50, 10.8, 0, -0.3], [-46, 8.6, 0, 0.2]] as const) crate(b, x, fy + y, z, 0.95, yaw);
    portrait(b, scene, -35, fy + 1.8, 11.84, Math.PI, 1);
  }
  // Mansion grounds: iron fence along the street with the gate, and toward the forest.
  ironFence(b, 'z', -23, -11, 13, [[-2.5, 2.5]]);
  gateArch(b, scene, glow, 'z', -23, -2.5, 2.5, 'MANSÃO');
  // The gates' lanterns light their way in.
  for (const [x, z] of [[-23, 0], [28, -24], [0, -36], [24, 13.5]]) light(x, 3.4, z, { intensity: 10, range: 11 });
  ironFence(b, 'x', -11, -W, -23, [[-45, -43], [-37, -35]]);

  // Mansion garden (south-west): hedges, the dry fountain, the family plot.
  hedge(b, 'x', 18, -58, -36, [[-51.5, -48.5]]);
  hedge(b, 'z', -30, 15, 27, [[19.5, 22.5]]);
  hedge(b, 'x', 25.5, -50, -36, [[-45, -42]]);
  {
    const fx = -42;
    const fz = 21.5;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      b.box(fx + Math.cos(a) * 2.3, 0.35, fz + Math.sin(a) * 2.3, 0.4, 0.7, 0.95, 'pedra', { tint: C.stone, rot: new THREE.Euler(0, -a, 0) });
    }
    b.cylinder(fx, 0, fz, 0.35, 1.6, 'pedra', { tint: C.stoneDark, segments: 8 });
    b.cylinder(fx, 1.6, fz, 0.5, 0.25, 'pedra', { tint: C.stone, radiusTop: 0.9, segments: 10, collide: false });
    staticPumpkin(b, glow, fx, 1.85, fz, Math.PI / 2, 0.45);
  }
  ironFence(b, 'x', 19.5, -58.5, -52.5, [], 1.1);
  ironFence(b, 'x', 25, -58.5, -52.5, [[-56, -54.6]], 1.1);
  ironFence(b, 'z', -52.5, 19.5, 25, [], 1.1);
  for (const [x, z] of [[-57.5, 21], [-55.8, 21], [-54.1, 21], [-57, 23.4]]) tombstone(b, x, z, 0, 'arco', rand, 0x8a867e);
  for (const [x, z] of [[-26, 16], [-33, 29], [-58, 29]]) deadTree(b, x, z, 1.1, rand);

  // --- Village: the street and its houses ------------------------------------------------------------
  const vf = 0x2a201c;
  home({ x0: -20, z0: -12.5, x1: -11, z1: -5, wall: 'reboco', tint: 0x6a5a4a, roof: C.roofRed, doors: { s: [-15.5], n: [-13], e: [-8.75] }, windows: { s: [-18.4, -12.4], w: [-8.75] }, frame: vf });
  b.box(-18.3, 0.52, -8.8, 2.6, 1.05, 0.6, 'madeira', { tint: 0x5a3a2a }); // butcher's counter
  b.box(-12, 0.6, -11.6, 1.6, 1.2, 1.0, 'metal', { tint: 0xc8c8c0 }); // freezer
  for (const x of [-19, -18.2, -17.4]) b.box(x, 2.3, -11.9, 0.04, 0.5, 0.04, 'metal', { tint: 0x8a8a90, collide: false }); // hooks
  home({ x0: -6, z0: -13, x1: 6, z1: -5, stories: 2, wall: 'tijolo', tint: 0x6a3a30, roof: C.roof, doors: { s: [2], n: [3.5], w: [-9], e: [-9] }, windows: { s: [-3] }, upper: { s: [-3, 3], n: [0], e: [-9], w: [-9] }, frame: vf });
  {
    // The mayor's safe: a dial, a handle and gilt lettering; his desk and chair.
    const safe = new Place(b, 4.5, 0, -7, -Math.PI / 2);
    safe.round([0, 0.6, 0], [0.9, 1.2, 0.8], 0.04, 'metal', 0x3a4a3a);
    safe.cyl([0, 0.75, 0.41], 0.09, 0.03, 'metal', 0xc8c8c0, { rot: [Math.PI / 2, 0, 0], seg: 14, shadow: false });
    safe.box([0.22, 0.55, 0.42], [0.04, 0.22, 0.04], 'metal', 0xc8a040, undefined, false);
    safe.box([0, 1.05, 0.405], [0.6, 0.06, 0.01], 'pintura', 0xc8a040, undefined, false);
    safe.solid([0, 0.6, 0], [0.45, 0.6, 0.4], 'metal');
    table(b, -3, 0, -9, 1.8, 0.9, 0, 0.78, 0x3a2018);
    chair(b, -3, 0, -9.85, 0, 0x3a2018, 0x2a3a5a);
  }
  home({ x0: 10, z0: -12.5, x1: 19, z1: -5, wall: 'madeira', tint: 0x5a5856, roof: 0x3a3838, boarded: true, doors: { s: [14.5], n: [12], e: [-8.75] }, windows: { s: [11.8, 17.3], w: [-8.75] }, frame: vf });
  home({ x0: -20, z0: 5, x1: -11, z1: 12.5, wall: 'madeira', tint: 0x7a6a3a, roof: 0x4a3a2a, doors: { n: [-15.5], s: [-13], e: [8.75] }, windows: { n: [-18.4, -12.4], w: [8.75] }, frame: vf });
  for (const [x, y, z, yaw] of [[-18.8, 0, 11.5, 0], [-17.55, 0, 11.5, 0.05], [-18.2, 0.5, 11.5, -0.08]] as const) hayBale(b, x, y, z, yaw, [1.2, 0.5, 0.6]);
  home({ x0: -6, z0: 5, x1: 3, z1: 12.5, wall: 'reboco', tint: 0x6a4a6a, roof: 0x2a2a3a, doors: { n: [-1.5], s: [0], w: [8.75] }, windows: { n: [-4.3, 1.5] }, frame: vf });
  b.box(-3.5, 0.5, 8.5, 3, 1.0, 0.7, 'madeira', { tint: 0x8a3a6a }); // candy counter
  for (let k = 0; k < 5; k++) {
    const jx = -4.7 + k * 0.6;
    b.cylinder(jx, 1.0, 8.5, 0.135, 0.03, 'vidro', { tint: 0xd8f0f0, collide: false, segments: 10 });
    glow.add(new THREE.CylinderGeometry(0.11, 0.11, 0.2, 10).translate(jx, 1.12, 8.5), [0xff6ad8, 0xffd23f, 0x6affd8, 0xff8a3a, 0xb46aff][k]);
    b.cylinder(jx, 1.22, 8.5, 0.12, 0.04, 'metal', { tint: 0xd8d8d0, collide: false, segments: 10 });
  }
  home({ x0: 9, z0: 5, x1: 15, z1: 11, wall: 'madeira', tint: 0x4a4a52, roof: C.roof, doorW: 2.4, doors: { n: [12], s: [11], e: [8] }, frame: vf });
  signBoard(b, scene, ['AÇOUGUE', 'Carne fresca', '(mais ou menos)'], -15.5, -4.4, 0, { bg: '#8a2a2a', fg: '#f2e6d0', height: 2.6, w: 1.4, h: 0.8 });
  signBoard(b, scene, ['PREFEITURA', 'Fechada desde 1892'], -2, -4.4, 0, { bg: '#2a3a4a', fg: '#e6e0d0', height: 2.6, w: 1.5, h: 0.8 });
  signBoard(b, scene, ['DOCES', 'ou travessuras'], 1.2, 4.4, 0, { bg: '#6a2a6a', fg: '#ffd27a', height: 2.6, w: 1.3, h: 0.75 });
  buildCar(b, 8, 0.9, 0x5a4a3a, 0.08);
  for (const [x, z, yaw] of [[-8.5, -3.2, 0.1], [-7.6, -3.3, -0.2], [24, 3.1, 0.3], [24.9, 3.3, 0], [-22, 3.2, 0.5]] as const) crate(b, x, 0, z, 0.8, yaw);
  // Back yards between the village and the plaza: fences, a shed, a well, the pumpkin patch.
  const fence = { tint: 0x5a4632 };
  b.wall('x', 17, -23, -11, 0.12, 1.5, 'madeira', [[-17.5, -15.5, 0, 1.5]], 0, fence);
  b.wall('x', 17, -6, 3, 0.12, 1.5, 'madeira', [[-2, 0, 0, 1.5]], 0, fence);
  b.wall('z', 16, 15, 30, 0.12, 1.5, 'madeira', [[21, 23, 0, 1.5]], 0, fence);
  home({ x0: -21, z0: 21, x1: -16, z1: 25, h: 2.6, wall: 'madeira', tint: 0x4a3a2a, roof: 0x3a3030, rise: 1.4, doors: { e: [23] }, windows: { n: [-18.5] }, frame: vf });
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    b.box(-2 + Math.cos(a) * 0.95, 0.4, 22 + Math.sin(a) * 0.95, 0.3, 0.8, 0.55, 'pedra', { tint: C.stoneDark, rot: new THREE.Euler(0, -a, 0) });
  }
  for (const s of [-1, 1]) b.box(-2 + s * 0.95, 1.3, 22, 0.1, 1.8, 0.1, 'madeira', { tint: C.woodDark });
  b.gableRoof(-3.1, 21.2, -0.9, 22.8, 2.2, 0.6, 'telhado', { tint: C.roofRed, ridgeAxis: 'z', overhang: 0.2, collide: false });
  for (const [x, z] of [[-10, 26], [-26, 13], [17, 28]]) deadTree(b, x, z, 1, rand);
  for (let k = 0; k < 9; k++) pumpkins.add(8 + (k % 3) * 1.6 + rand() * 0.4, 0, 20 + Math.floor(k / 3) * 1.7 + rand() * 0.4, rand() * 6, 0.9 + rand() * 0.5);

  // --- Amusement park --------------------------------------------------------------------------------
  ironFence(b, 'x', 13.5, 20, 58, [[22, 26]]);
  ironFence(b, 'z', 20, 13.5, 30.4, [[19, 22]]);
  gateArch(b, scene, glow, 'x', 13.5, 22, 26, 'PARQUE');
  // Ticket booth next to the gate.
  b.span(27, 0, 14.2, 29, 2.4, 16.2, 'madeira', { tint: 0x7a2a4a });
  b.span(26.7, 2.4, 13.9, 29.3, 2.6, 16.5, 'pintura', { tint: 0xf07a1a, collide: false });
  glow.add(new THREE.BoxGeometry(1.2, 0.6, 0.02).translate(28, 1.5, 16.22), 0xffd27a);
  // Shooting gallery: a booth with its counter facing south, the targets along the back wall.
  {
    const x0 = 30.5;
    const x1 = 38.5;
    const booth = { tint: 0x5a2a6a };
    b.span(x0, 0, 14.0, x1, 3.0, 14.3, 'madeira', booth);
    b.span(x0, 0, 14.3, x0 + 0.3, 3.0, 17.6, 'madeira', booth);
    b.span(x1 - 0.3, 0, 14.3, x1, 3.0, 17.6, 'madeira', booth);
    b.span(x0 + 0.3, 0, 17.2, x1 - 0.3, 1.1, 17.6, 'madeira', { tint: 0x8a3a2a });
    for (let k = 0; k < 8; k++) b.span(x0 - 0.2 + k * 1.05, 3.0, 13.8, x0 - 0.2 + (k + 1) * 1.05, 3.15, 18.0, 'pintura', { tint: k % 2 ? 0xe8e0d0 : 0xb02a2a, collide: false });
    const bulbs: THREE.Vector3[] = [];
    for (let x = x0 + 0.2; x <= x1 - 0.2; x += 0.5) bulbs.push(V(x, 2.92, 17.7));
    // Scattered (always the same spots), not in a row; whoever knocks down the last one gets sharp aim.
    const spots = [[31.4, 1.0, 15.0], [32.5, 1.9, 14.7], [33.3, 1.25, 15.9], [34.6, 2.05, 15.2], [35.4, 0.95, 14.8], [36.5, 1.6, 16.2], [37.4, 1.15, 15.4]].map(([x, y, z]) => V(x, y, z));
    const gallery = new TargetRow(scene, b, props, spots,
      (at) => sfx.at(at, 'normal', (s) => s.targetDing()),
      (local) => {
        sfx.at({ x: 34.5, y: 2, z: 16 }, 'loud', (s) => s.carnivalJingle());
        if (local) rewards.aimBonus?.();
      },
      bulbs);
    light(34.5, 2.7, 16.5, { color: 0xffd8a0, intensity: 12, range: 9 });
    animated.push((dt) => gallery.update(dt));
    signBoard(b, scene, ['TIRO AO ALVO', 'Acerte todos!'], 34.5, 18.6, 0, { bg: '#2a1a3a', fg: '#ffd27a', height: 3.6, w: 2.2, h: 0.8 });
  }
  // Stage with the curtain (a skeleton bows behind it, one day).
  {
    const top = 1.1;
    b.span(40.5, 0, 14.4, 47.5, top, 19, 'madeira', { tint: 0x4a2e22 });
    b.span(40.5, 0, 14.0, 47.5, 5, 14.4, 'madeira', { tint: 0x2a1a1a });
    for (let k = 0; k < 14; k++) b.span(40.6 + k * 0.49, top, 14.42, 40.6 + (k + 1) * 0.49 - 0.04, 4.6, 14.62 + (k % 2) * 0.08, 'pintura', { tint: 0x8a1a2a, collide: false });
    b.stairs('x', 1, 40.5 - stairRun(top), 17.4, 18.8, 0, top, 'madeira', { tint: 0x4a2e22 });
    b.stairs('x', -1, 47.5 + stairRun(top), 17.4, 18.8, 0, top, 'madeira', { tint: 0x4a2e22 });
    for (const x of [40.7, 47.3]) b.box(x, 2.5, 18.8, 0.15, 5, 0.15, 'metal', { tint: C.iron, collide: false });
    b.box(44, 5, 18.8, 6.8, 0.12, 0.12, 'metal', { tint: C.iron, collide: false });
    [0xff4a4a, 0xffd23f, 0x6aa0ff, 0xb46aff, 0x6aff9a].forEach((c, k) => glow.add(new THREE.SphereGeometry(0.15, 8, 6).translate(41.4 + k * 1.3, 4.82, 18.8), c));
  }
  // Bumper cars inside a low rim (waist-high cover).
  {
    const rim = { tint: 0xb04a2a };
    b.wall('x', 21, 26.5, 39.5, 0.4, 0.9, 'madeira', [[32, 34, 0, 0.9]], 0, rim);
    b.wall('x', 28.5, 26.5, 39.5, 0.4, 0.9, 'madeira', [[32, 34, 0, 0.9]], 0, rim);
    b.wall('z', 26.5, 21.2, 28.3, 0.4, 0.9, 'madeira', [], 0, rim);
    b.wall('z', 39.5, 21.2, 28.3, 0.4, 0.9, 'madeira', [], 0, rim);
    decal(26.7, 21.2, 39.3, 28.3, 0.03, 'metal', 0x3a3a44);
    const cars = [[28.5, 23, 0xd8342a, 0xf2ead8, 0.4], [31, 26.5, 0x2a7ad8, 0xf2c230, -0.6], [35.5, 23.5, 0xf2c230, 0x2a2a30, 1.2], [37.5, 26.8, 0x3aae6a, 0xf2ead8, 2.6], [33.5, 25, 0xb46aff, 0xf2c230, -1.9]] as const;
    const carGeo = mergeGeometries(cars.map(([x, z, c, accent, yaw]) => bumperCarGeometry(c, accent).rotateY(yaw).translate(x, 0, z)), false)!;
    const carMesh = new THREE.Mesh(carGeo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }));
    carMesh.castShadow = true;
    scene.add(carMesh);
    for (const [x, z, , , yaw] of cars) b.cuboidCollider(V(x, 0.5, z), V(0.85, 0.5, 0.62), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), 'metal');
    // The ceiling grid the poles run on, and a few colored bulbs around its edge.
    b.span(26.3, 2.9, 20.8, 39.7, 3.02, 28.7, 'metal', { tint: 0x3a2a4a, collide: false });
    for (const [x, z] of [[26.5, 21], [39.5, 21], [26.5, 28.5], [39.5, 28.5]]) b.box(x, 1.45, z, 0.15, 2.9, 0.15, 'metal', { tint: C.iron, collide: false });
    for (let k = 0; k < 14; k++) glow.add(new THREE.SphereGeometry(0.08, 6, 4).translate(26.6 + k, 2.86, k % 2 ? 20.85 : 28.65), [0xff4a4a, 0xffd23f, 0x6aa0ff, 0xb46aff][k % 4]);
    light(33, 2.6, 24.7, { color: 0xd8b0ff, intensity: 12, range: 10 });
  }
  const wheel = new FerrisWheel(scene, b, 52, 22, 7);
  animated.push((dt) => wheel.update(dt));
  // Strength tester with its bell (the park's bell for the secrets).
  b.cylinder(44.5, 0, 26.5, 0.12, 5.0, 'metal', { tint: 0xd8d0c0, segments: 8 });
  b.box(44.5, 0.25, 26.5, 1.0, 0.5, 1.0, 'madeira', { tint: 0x8a2a2a });
  const parkBell = new Bell(scene, b, V(44.5, 5.5, 26.5), 0.6, props, 'sinoparque', () => sfx.at({ x: 44.5, y: 5.2, z: 26.5 }, 'normal', (s) => s.churchBell(1.8)));
  animated.push((dt) => parkBell.update(dt));
  {
    // Striped tent.
    const tent = new THREE.ConeGeometry(2.2, 3.6, 12).translate(48.5, 1.8, 28.3);
    b.addGeometry(tent, surfaceMaterial('pintura'), 0x6a2a7a);
    tent.dispose();
    b.cylinder(48.5, 0, 28.3, 1.4, 2.2, 'pintura', { tint: 0x4a1a5a });
  }
  // Railings around the sewer stairs coming up in the park.
  for (const x of [H_PARK.x0 - 0.15, H_PARK.x1 + 0.15]) ironFence(b, 'z', x, H_PARK.z0, H_PARK.z1 + 0.2, [], 1.1);
  ironFence(b, 'x', H_PARK.z1 + 0.15, H_PARK.x0 - 0.15, H_PARK.x1 + 0.15, [], 1.1);

  // --- Praça da Lua Cheia (the open arena) -----------------------------------------------------------
  hedge(b, 'x', 31, -45, 45, [[-40, -36], [-10.5, -6.5], [4, 8], [33, 37]]);
  hedge(b, 'z', -45, 31.55, D, [[41, 45]]);
  hedge(b, 'z', 45, 31.55, D, [[43, 47]]);
  // The giant dead tree on its round base (two steps up).
  b.cylinder(0, 0, 44, 4.4, 0.3, 'pedra', { tint: 0x5a5650, segments: 20 });
  b.cylinder(0, 0, 44, 3.7, 0.6, 'pedra', { tint: 0x6a6660, segments: 20 });
  deadTree(b, 0, 44, 2.9, rand, { y: 0.6, branches: 11, tint: 0x2a1e22 });
  const giant = new GiantPumpkin(scene, b, -26, 46, 2.2, Math.PI / 2, props, () => sfx.at({ x: -26, y: 2, z: 46 }, 'loud', (s) => s.evilLaugh()));
  animated.push((dt) => giant.update(dt));
  const fire = new Bonfire(scene, b, V(16, 0, 41), puffs);
  animated.push((dt) => fire.update(dt));
  // Low stage (elevation and cover), the gazebo, the statue.
  b.span(12, 0, 49, 22, 1.2, 53, 'madeira', { tint: 0x4a3426 });
  b.stairs('x', 1, 12 - stairRun(1.2), 50.2, 51.8, 0, 1.2, 'madeira', { tint: 0x4a3426 });
  b.stairs('x', -1, 22 + stairRun(1.2), 50.2, 51.8, 0, 1.2, 'madeira', { tint: 0x4a3426 });
  for (const [x, z, yaw] of [[14, 52.2, 0.2], [19.5, 49.8, -0.3]] as const) crate(b, x, 1.2, z, 0.9, yaw);
  {
    const gx = 33;
    const gz = 47;
    const top = 1.0;
    b.span(gx - 3, 0, gz - 3, gx + 3, top, gz + 3, 'madeira', { tint: 0x5a4030 });
    b.stairs('x', 1, gx - 3 - stairRun(top), gz - 0.9, gz + 0.9, 0, top, 'madeira', { tint: 0x5a4030 });
    b.stairs('x', -1, gx + 3 + stairRun(top), gz - 0.9, gz + 0.9, 0, top, 'madeira', { tint: 0x5a4030 });
    const low = { h: 0.9, tint: 0xd8cfb8 };
    railing(b, 'x', gz - 2.95, gx - 3, gx + 3, top, low);
    railing(b, 'x', gz + 2.95, gx - 3, gx + 3, top, low);
    for (const x of [gx - 2.95, gx + 2.95]) {
      railing(b, 'z', x, gz - 3, gz - 0.9, top, low);
      railing(b, 'z', x, gz + 0.9, gz + 3, top, low);
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.cylinder(gx + sx * 2.8, top, gz + sz * 2.8, 0.1, 2.6, 'pintura', { tint: 0xd8cfb8, segments: 8 });
    const roof = new THREE.ConeGeometry(4.6, 2.2, 8).translate(gx, top + 2.6 + 1.1, gz);
    b.addGeometry(roof, surfaceMaterial('telhado'), 0x4a2a4a);
    roof.dispose();
  }
  b.box(-34, 0.7, 38, 1.6, 1.4, 1.6, 'pedra', { tint: C.stoneDark });
  b.box(-34, 2.2, 38, 0.7, 1.6, 0.45, 'pedra', { tint: C.stone });
  for (const s of [-1, 1]) b.box(-34 + s * 0.5, 2.4, 38, 0.25, 1.1, 0.25, 'pedra', { tint: C.stone, collide: false, rot: new THREE.Euler(0, 0, s * 0.3) });
  staticPumpkin(b, glow, -34, 3.0, 38, Math.PI / 2, 0.42);
  // Cover: cars, market stalls, hay bales, crates, barrels, benches.
  buildCar(b, -12, 50, 0x5a3a3a, 0.4);
  buildCar(b, 26, 37, 0x3a4a5a, -0.3);
  stall(b, -30, 34.6, 0, 0xb02a2a);
  stall(b, 6, 52.8, Math.PI, 0x5a2a7a);
  stall(b, -39, 51.5, -Math.PI / 2, 0xf07a1a);
  for (const [x, z, rot] of [[-30, 49.5, 0.2], [-8, 37.5, 0], [8, 40.5, 1.1], [-16, 42.5, 0.5], [28, 52, 0.3], [39, 38, 0], [-40.5, 36.5, 0.8], [-20, 51, 1.3]]) {
    hayBale(b, x, 0, z, rot, [2.2, 0.9, 1.1]);
    crate(b, x + Math.cos(rot) * 0.45, 0.9, z - Math.sin(rot) * 0.45, 0.85, rot + 0.15);
  }
  for (const [x, z] of [[-22.5, 53.5], [24, 45.5], [-4.1, 53.4], [-3.2, 53.9], [41, 33.5], [-43, 45.5]]) barrel(b, x, 0, z);
  for (const [x, z, yaw] of [[-6, 47.6, Math.PI], [6, 47.6, Math.PI], [0, 38.6, 0]]) bench(b, x, z, yaw);
  for (const [x, z, yaw] of [[-14, 52.5, Math.PI], [6, 36.5, 0.4], [40, 51, -Math.PI / 2]]) scarecrows.add(x, z, yaw);
  // The sewer kiosk: stairs down, roofed, open to the south. The walls reach down past the ground slab (and
  // a hair into the stairwell) so its grassy edge doesn't show inside; a lamp under the roof lights the flight.
  {
    const k = { tint: 0x5a5a5a };
    const y0 = CEIL - 0.12;
    b.span(H_PLAZA.x0 - 0.3, y0, H_PLAZA.z0 - 0.3, H_PLAZA.x0 + 0.02, 2.6, H_PLAZA.z1, 'concreto', k);
    b.span(H_PLAZA.x1 - 0.02, y0, H_PLAZA.z0 - 0.3, H_PLAZA.x1 + 0.3, 2.6, H_PLAZA.z1, 'concreto', k);
    b.span(H_PLAZA.x0, y0, H_PLAZA.z0 - 0.3, H_PLAZA.x1, 2.6, H_PLAZA.z0 + 0.02, 'concreto', k);
    b.span(H_PLAZA.x0 - 0.5, 2.6, H_PLAZA.z0 - 0.5, H_PLAZA.x1 + 0.5, 2.8, H_PLAZA.z1 + 0.3, 'metal', { tint: 0x3a3a40 });
    hangingLamp((H_PLAZA.x0 + H_PLAZA.x1) / 2, 2.6, H_PLAZA.z1 - 1.2, { intensity: 7, range: 8 });
    signBoard(b, scene, ['ESGOTO', 'Proibido nadar'], H_PLAZA.x1 + 1.6, H_PLAZA.z1 + 0.4, 0, { bg: '#3a4a3a', fg: '#e6e0d0', height: 1.4, w: 1.2, h: 0.65 });
  }
  signBoard(b, scene, ['PRAÇA DA', 'LUA CHEIA', 'Proibido uivar'], -37.2, 32.4, 0, { bg: '#2a2a4a', fg: '#ffd27a', height: 2.4, w: 1.6, h: 1.0 });

  // South-west court (spawn B) and the south-east trailers.
  buildCar(b, -52, 44, 0x1a1a1e, Math.PI / 2);
  for (const [x, z, y, yaw] of [[-48, 50.5, 0, 0.1], [-48, 51.6, 0, -0.1], [-48, 51.05, 0.95, 0.4], [-57.5, 33, 0, 0.3], [-47.5, 36.5, 0, -0.2]] as const) crate(b, x, y, z, 0.95, yaw);
  for (const [x, z] of [[-57, 52], [-50, 32.5], [58, 53], [47, 33]]) deadTree(b, x, z, 1.1, rand);
  circusTrailer(b, scene, glow, 52.25, 36.25, 0, 0x5a2a6a, 0xf07a1a, 'CIRCO SINISTRO');
  circusTrailer(b, scene, glow, 54.25, 48.25, Math.PI, 0x6a2a2a, 0xe8c040, 'HOMEM-ABÓBORA');
  light(52.4, 2.4, 38.6, { intensity: 8, range: 8 });
  for (const [x, z, yaw] of [[48, 42, 0.2], [57, 42, -0.1], [57, 43.1, 0.15]] as const) crate(b, x, 0, z, 0.95, yaw);
  barrel(b, 48.2, 0, 43.3);

  // --- Sewer: mansion basement -> south -> east under the plaza -> park; maintenance room with stairs ---
  {
    const brick = { tint: 0x7a7266 };
    const h = CEIL - UG;
    const ugWall = (axis: 'x' | 'z', fixed: number, a: number, end: number, ops: Opening[] = []) => b.wall(axis, fixed, a, end, 0.4, h, 'tijolo', ops, UG, brick);
    const floors: Rect[] = [
      { x0: -56.4, z0: 5.8, x1: -42.6, z1: 12.4 }, // basement
      { x0: -50.4, z0: 12.4, x1: -46.6, z1: 29.6 }, // tunnel south
      { x0: -50.4, z0: 29.6, x1: 24.9, z1: 33.4 }, // tunnel east
      { x0: -26.4, z0: 33.4, x1: -16.6, z1: 41.4 }, // maintenance room
      { x0: 5.6, z0: 33.4, x1: 9.4, z1: 43.8 }, // dead end
      { x0: 2.6, z0: 43.8, x1: 12.4, z1: 51.6 }, // the rat's chamber
    ];
    for (const f of floors) {
      b.span(f.x0, UG - 0.3, f.z0, f.x1, UG, f.z1, 'concreto', { tint: 0x5e5c56, castShadow: false });
      // Ceiling: blocks the moonlight (the ground slab doesn't cast shadows).
      slabWithHoles(b, f.x0, f.z0, f.x1, f.z1, CEIL - 0.12, CEIL, [H_MANSION, H_PLAZA, H_PARK], 'concreto', { tint: 0x4a4844, collide: false });
    }
    ugWall('z', -56.2, 5.8, 12.4);
    ugWall('z', -42.8, 5.8, 12.4);
    ugWall('x', 5.8, -56.4, -42.6);
    ugWall('x', 12.2, -56.4, -42.6, [[-50, -47, 0, 3]]);
    ugWall('z', -50.2, 12.4, 33.4);
    ugWall('z', -46.8, 12.4, 29.6);
    ugWall('x', 29.8, -46.6, 24.9, [[H_PARK.x0, H_PARK.x1, 0, h]]);
    ugWall('x', 33.2, -50.4, 24.9, [[-24, -21.5, 0, 2.6], [6, 9, 0, 2.8]]);
    // The dead end: a corridor south to the chamber where the giant rat lives.
    ugWall('z', 5.8, 33.4, 43.8);
    ugWall('z', 9.2, 33.4, 43.8);
    ugWall('x', 44, 2.6, 12.4, [[6, 9, 0, 2.8]]);
    ugWall('z', 2.8, 43.8, 51.6);
    ugWall('z', 12.2, 43.8, 51.6);
    ugWall('x', 51.4, 2.6, 12.4);
    ugWall('z', 24.7, 29.6, 33.4);
    ugWall('z', -26.2, 33.4, 41.4);
    ugWall('z', -16.8, 33.4, 41.4);
    ugWall('x', 41.2, -26.4, -16.6);
    ugWall('z', H_PARK.x0 - 0.2, H_PARK.z0, 29.6);
    ugWall('z', H_PARK.x1 + 0.2, H_PARK.z0, 29.6);
    b.stairs('x', 1, H_MANSION.x0, H_MANSION.z0, H_MANSION.z1, UG, -UG, 'madeira', { tint: 0x3a2a20 });
    b.stairs('z', 1, H_PLAZA.z0, H_PLAZA.x0, H_PLAZA.x1, UG, -UG, 'concreto', { tint: 0x5a5a56 });
    b.stairs('z', -1, H_PARK.z1, H_PARK.x0, H_PARK.x1, UG, -UG, 'concreto', { tint: 0x5a5a56 });
    // Glow-in-the-dark safety strips on the concrete steps' nosings: seen from the top, where the risers face away, a
    // flight going down otherwise reads as a flat floor you sink through.
    const nosings = (dir: 1 | -1, start: number, x0: number, x1: number) => {
      const n = stairSteps(-UG);
      for (let i = 0; i < n; i++) {
        const s = start + dir * i * STEP_D;
        const top = UG + (-UG / n) * (i + 1);
        glow.add(new THREE.BoxGeometry(x1 - x0, 0.012, 0.08).translate((x0 + x1) / 2, top + 0.006, s + dir * 0.04), 0xc8a02a);
      }
    };
    nosings(1, H_PLAZA.z0, H_PLAZA.x0, H_PLAZA.x1);
    nosings(-1, H_PARK.z1, H_PARK.x0, H_PARK.x1);
    // Murky water along the channels, a pipe along the wall, caged lamps.
    const water = new THREE.MeshToonMaterial({ color: 0x3a5a3a, transparent: true, opacity: 0.75, gradientMap: toonGradient() });
    for (const [x0, z0, x1, z1] of [[-49.2, 12.4, -47.8, 30.8], [-49.2, 30.8, 24.5, 32.2]]) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), water);
      plane.position.set((x0 + x1) / 2, UG + 0.03, (z0 + z1) / 2);
      scene.add(plane);
    }
    const pipe = new THREE.CylinderGeometry(0.16, 0.16, 74.5, 8).rotateZ(Math.PI / 2).translate(-12.75, UG + 2.7, 30.25);
    b.addGeometry(pipe, surfaceMaterial('metal'), 0x4a5a4a);
    pipe.dispose();
    const sewerLight = { color: 0xe6ee9a, intensity: 10, range: 12 };
    for (let x = -44; x < 24; x += 9) {
      glow.add(new THREE.BoxGeometry(0.25, 0.25, 0.15).translate(x, UG + 2.6, 32.92), 0xd8e070);
      b.box(x, UG + 2.6, 32.88, 0.32, 0.32, 0.2, 'metal', { tint: C.iron, collide: false, castShadow: false });
      light(x, UG + 2.4, 32.5, sewerLight);
    }
    for (const z of [16, 24]) {
      glow.add(new THREE.BoxGeometry(0.15, 0.25, 0.25).translate(-49.92, UG + 2.6, z), 0xd8e070);
      light(-49.5, UG + 2.4, z, sewerLight);
    }
    light(-49.4, UG + 2.4, 6.6, { intensity: 10, range: 10 });
    light(-46, UG + 2.4, 10, { intensity: 9, range: 9 });
    light(-21.5, UG + 2.5, 34, sewerLight);
    light(-23, UG + 2.5, 38.5, sewerLight);
    // A plaque at the dead end's mouth, a lamp halfway, and a dim red one where the rat waits among bones.
    const plate = canvasTexture(256, 96, (g) => {
      g.fillStyle = '#2a2a2a';
      g.fillRect(0, 0, 256, 96);
      g.strokeStyle = '#d8cfb8';
      g.lineWidth = 6;
      g.strokeRect(6, 6, 244, 84);
      g.fillStyle = '#d8cfb8';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      fitText(g, 'RUA SEM SAÍDA', 128, 50, 220, (px) => `400 ${px}px "Lilita One", system-ui, sans-serif`, 34);
    });
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.52), new THREE.MeshToonMaterial({ map: plate, gradientMap: toonGradient() }));
    plaque.position.set(10.3, UG + 2.1, 32.98);
    plaque.rotation.y = Math.PI;
    scene.add(plaque);
    glow.add(new THREE.BoxGeometry(0.15, 0.22, 0.22).translate(5.98, UG + 2.6, 38.5), 0xd8e070);
    light(6.6, UG + 2.4, 38.5, { ...sewerLight, intensity: 8 });
    glow.add(new THREE.BoxGeometry(0.15, 0.22, 0.22).translate(12.0, UG + 2.4, 49.5), 0xff5a3a);
    light(11.2, UG + 2.2, 49.5, { color: 0xff6a4a, intensity: 9, range: 11, flicker: 0.3 });
    for (let k = 0; k < 14; k++) {
      const bx = 3.4 + rand() * 8.2;
      const bz = 44.6 + rand() * 6.2;
      if (Math.hypot(bx - 7.5, bz - 47.5) < 2.4) continue;
      b.box(bx, UG + 0.05, bz, 0.5 + rand() * 0.3, 0.07, 0.07, 'pintura', { tint: 0xe8e0c8, collide: false, castShadow: false, rot: new THREE.Euler(0, rand() * 6, 0) });
    }
    for (const [sx, sz] of [[4, 50.6], [11, 45.2]]) b.addGeometry(new THREE.SphereGeometry(0.16, 8, 6).scale(1, 0.85, 1.1).translate(sx, UG + 0.14, sz), surfaceMaterial('pintura'), 0xe8e0c8);
    const [ratAt] = RATS.halloween;
    rat = new GiantRat(scene, b, ratAt.id, V(...ratAt.p), Math.PI, RAT.hits, RAT.stab, (id) => rewards.ratDown?.(id), puffs, {
      squeak: (at) => sfx.at(at, 'normal', (s) => s.ratSqueak()),
      hurt: (at) => sfx.at(at, 'normal', (s) => s.ratHit()),
      death: (at) => sfx.at(at, 'loud', (s) => s.ratDeath()),
    });
    animated.push((dt, f) => rat!.update(dt, f.time, f.listener));
    stabbable.push((eye, fwd, reach) => rat!.stab(eye, fwd, reach));
    // Basement: the boiler, barrels, shelves. Maintenance room: generator, panels, fuses, a lever.
    b.cylinder(-45, UG, 10.2, 0.8, 2.2, 'metal', { tint: 0x5a3a2a, segments: 12 });
    for (const [x, z] of [[-55.3, 11.4], [-54.45, 11.5], [-55.4, 10.55], [-44, 6.6]]) barrel(b, x, UG, z, 0.38, 1.0, 0x5a3820);
    b.box(-51.5, UG + 1, 11.7, 3, 2, 0.5, 'madeira', { tint: C.woodDark });
    glow.add(new THREE.BoxGeometry(0.2, 0.2, 0.15).translate(-49.4, UG + 2.6, 6.08), 0xffc861);
    b.box(-24.5, UG + 0.6, 36.5, 1.8, 1.2, 1.1, 'metal', { tint: 0x5a6a3a });
    b.box(-25.7, UG + 1.4, 39.2, 0.3, 1.6, 2.4, 'metal', { tint: 0x4a4a52 });
    for (const [z, c] of [[38.4, 0xff4a3a], [39.0, 0x6aff6a], [39.6, 0xffd23f]] as const) glow.add(new THREE.BoxGeometry(0.02, 0.12, 0.12).translate(-25.54, UG + 1.8, z), c);
    b.box(-21, UG + 1.3, 40.9, 0.9, 1.1, 0.3, 'metal', { tint: 0x3a3a40 });
    glow.add(new THREE.BoxGeometry(0.15, 0.2, 0.15).translate(-21.5, UG + 2.7, 33.62), 0xd8e070);
  }

  // --- Lamp posts, pumpkins, bats, mist, sky -----------------------------------------------------------
  const lampSpecs: LampSpec[] = [
    { x: 24, z: -43.3, dir: [0, -1] }, { x: 34, z: -43.3, dir: [0, -1], flicker: true }, { x: 44, z: -43.3, dir: [0, -1] },
    { x: 35.3, z: -36, dir: [1, 0] }, { x: 35.3, z: -24, dir: [1, 0], flicker: true }, { x: 35.3, z: -12, dir: [1, 0] },
    { x: -18, z: -3.6, dir: [0, 1] }, { x: -2, z: -3.6, dir: [0, 1], flicker: true }, { x: 14, z: -3.6, dir: [0, 1] }, { x: 30, z: -3.6, dir: [0, 1] },
    { x: -10, z: 3.6, dir: [0, -1] }, { x: 6, z: 3.6, dir: [0, -1] }, { x: 22, z: 3.6, dir: [0, -1], flicker: true },
    { x: -42, z: 33.6, dir: [1, 0] }, { x: -22, z: 33, dir: [0, 1] }, { x: 0, z: 33, dir: [0, 1], flicker: true }, { x: 22, z: 33, dir: [0, 1] }, { x: 42, z: 33.6, dir: [-1, 0] },
    { x: -42, z: 53.2, dir: [1, 0] }, { x: -24, z: 54, dir: [0, -1] }, { x: 4, z: 54.2, dir: [0, -1], flicker: true }, { x: 26, z: 54, dir: [0, -1] }, { x: 42, z: 53.2, dir: [-1, 0] },
    { x: 23, z: 19, dir: [1, 0] }, { x: 42, z: 21, dir: [-1, 0], flicker: true }, { x: -48, z: 47, dir: [1, 0] }, { x: -28, z: 17, dir: [-1, 0] },
  ];
  for (const s of lampSpecs) lamps.add(s);
  lamps.finish(scene, b, props, (at) => sfx.at(at, 'normal', (s) => s.bulbPop()));
  lights.add(...lamps.lights());
  animated.push((dt) => lamps.update(dt));
  // Jack-o'-lanterns: on porches and doorsteps, along paths, around the plaza.
  for (const [x, z, yaw] of [
    [-16.6, -4.4, 0], [-13.9, -4.4, 0], [3.2, -4.4, 0], [13.2, -4.4, 0], [-16.6, 4.4, Math.PI], [-2.6, 4.4, Math.PI], [-0.4, 4.4, Math.PI], [13.6, 4.4, Math.PI],
    [-26.7, -1.5, -Math.PI / 2], [-26.7, 5.6, -Math.PI / 2], [-29.6, 12.6, Math.PI], [-23.6, -3, -Math.PI / 2], [-23.6, 3, -Math.PI / 2],
    [26.8, -26.6, -Math.PI / 2], [26.8, -21.4, -Math.PI / 2], [1.8, -14.6, 0], [-1.8, -14.6, 0], [-12.4, -31.3, -Math.PI / 2],
    [-38.6, -40.4, 0], [-41.4, -40.4, 0], [21.4, 13, 0], [26.6, 13, 0], [39.6, 19.6, Math.PI], [43.6, 19.6, Math.PI],
    [-3.4, 40.4, Math.PI], [3.4, 40.4, Math.PI], [-4.2, 47.4, 0], [4.2, 47.6, 0], [-22.5, 44, Math.PI / 2], [-26, 43.2, 0],
    [14.5, 39.5, 1], [17.6, 39.6, -1], [-35, 32.2, Math.PI], [-41, 32.2, Math.PI], [3.6, 32.2, Math.PI], [8.6, 32.2, Math.PI], [37.8, 32.2, Math.PI],
    [-55, 38.5, -Math.PI / 2], [-46.2, 40.2, -Math.PI / 2], [-20.1, 40.4, Math.PI], [53.2, -23.5, Math.PI], [58.5, -42.5, -Math.PI / 2],
  ] as const) pumpkins.add(x, 0, z, yaw, 0.8 + rand() * 0.5);
  pumpkins.add(-28.4, 0.3, -0.5, -Math.PI / 2, 1.3);
  pumpkins.finish(scene, b, props, debris, (at) => sfx.at(at, 'normal', (s) => s.pumpkinSmash()));
  stabbable.push((eye, fwd, reach) => pumpkins.stab(eye, fwd, reach));
  scarecrows.finish(scene, b, props, (at) => sfx.at(at, 'normal', (s) => s.strawThud()));
  animated.push((dt) => {
    pumpkins.update(dt);
    scarecrows.update(dt);
    debris.update(dt);
    puffs.update(dt);
  });
  const bats = new Bats(scene, [
    { center: V(-43, 15, 2), radius: 9, count: 9 },
    { center: V(-14.5, 13, -29.5), radius: 5, count: 5 },
    { center: V(52, 18, 22), radius: 7, count: 6 },
    { center: V(0, 14, 44), radius: 8, count: 6 },
  ], rand);
  const mist = new GroundMist(scene, [
    [-8, -30, 7], [6, -20, 7], [-12, -18, 6], [10, -32, 6], [0, -25, 8], [20, -18, 5],
    [-20, -45, 8], [-45, -30, 8], [-50, -18, 7], [10, -48, 7], [-32, -52, 7], [-5, -50, 7], [-55, -42, 7],
  ], rand);
  animated.push((dt) => {
    bats.update(dt);
    mist.update(dt);
  });
  nightSky(scene, V(...MOON));

  // Ambience: crows and, now and then, a wolf far away.
  let crowTimer = 3;
  let howlTimer = 25;
  animated.push((dt, { listener }) => {
    crowTimer -= dt;
    howlTimer -= dt;
    if (crowTimer <= 0) {
      crowTimer = 7 + Math.random() * 10;
      sfx.at(skySpot(listener), 'ambient', (s) => s.ambientCrow());
    }
    if (howlTimer <= 0) {
      howlTimer = 40 + Math.random() * 40;
      sfx.at(skySpot(listener), 'ambient', (s) => s.ambientHowl());
    }
  });

  glow.finish(scene);
  b.finish();

  const at = (x: number, y: number, z: number, yaw: number): SpawnPoint => ({ position: V(x, y, z), yaw });
  const E = -Math.PI / 2; // facing +X
  const Wd = Math.PI / 2; // facing -X
  const S = Math.PI; // facing +Z
  return {
    spawnsA: [at(56, 0.2, -47, Wd), at(56, 0.2, -44.8, Wd), at(56, 0.2, -49.2, Wd), at(52, 0.2, -38, Wd), at(57, 0.2, -36, Wd)],
    spawnsB: [at(-56, 0.2, 50, E), at(-56, 0.2, 46.5, E), at(-53, 0.2, 53, E), at(-57, 0.2, 38, E), at(-50, 0.2, 36.5, E)],
    spawnsFFA: ([
      // Mansion: hall, library, kitchen, upstairs rooms, basement; the sewer.
      [-48, 0.2, 2], [-36, 0.2, -5], [-50, 0.2, 10], [-51, FH + 0.2, -4], [-37, FH + 0.2, 9], [-48, UG + 0.2, 10.5], [-30, UG + 0.2, 31.5],
      // Forest, cabin, cemetery (chapel, mausoleum, paths).
      [-37, 0.2, -44], [-15, 0.2, -46], [-44, 0.2, -20], [-20, 0.2, -29.5], [19, 0.2, -31], [-6, 0.2, -24.5],
      // Road and barn; village houses.
      [28, 0.2, -45], [51, 0.2, -29], [-15.5, 0.2, -8.8], [0.5, 0.2, 9.5], [14.5, 0.2, -8.8],
      // Park, plaza, garden and the corners.
      [30, 0.2, 24.6], [-30, 0.2, 52], [26, 0.2, 49.5], [0, 0.2, 36.5], [-42, 0.2, 27.5], [53, 0.2, 43], [-55, 0.2, 40],
    ] as [number, number, number][]).map(([x, y, z]) => at(x, y, z, Math.atan2(x, z))),
    dummies: [
      // From the road: along it, behind the car, at the barn and the cemetery gate.
      { position: V(44, 0, -47), yaw: Wd, patrol: { axis: 'z', amplitude: 2, speed: 0.9 } },
      { position: V(32.5, 0, -45.2), yaw: Wd },
      { position: V(39, 0, -31), yaw: Wd, patrol: { axis: 'z', amplitude: 3, speed: 0.8 } },
      { position: V(51, 0, -27), yaw: Wd },
      { position: V(31.5, 0, -24), yaw: Wd },
      // Cemetery: mausoleum (inside and on the roof), the ghost's grave, the chapel.
      { position: V(19, 0, -31), yaw: Wd },
      { position: V(19, 4.45, -31), yaw: Wd },
      { position: V(7.5, 0, -18), yaw: Wd },
      { position: V(-20, 0, -29.5), yaw: E },
      // Village, mansion hall, park, plaza.
      { position: V(12, 0, -1.2), yaw: Wd, patrol: { axis: 'x', amplitude: 3, speed: 1.1 } },
      { position: V(-40, 0, 2), yaw: E },
      { position: V(30, 0, 24.6), yaw: S },
      { position: V(0, 0.6, 40.5), yaw: S },
    ],
    killY: -20,
    stats: b.stats,
    openings: b.openings,
    props,
    update(dt, frame) {
      for (const f of animated) f(dt, frame);
    },
    dog: null,
    pickups: biscuit ? [biscuit] : [],
    potion: { at: witch.feet, radius: POTION.radius, drink: (kind) => witch.drink(kind) },
    rats: {
      kill: (id, ready) => rat?.id === id && rat.kill(ready),
      set: (id, ready) => rat?.id === id && rat.set(ready),
    },
    rewards,
    critters: {
      shot: () => null,
      stab(eye, fwd, reach) {
        for (const f of stabbable) {
          const point = f(eye, fwd, reach);
          if (point) return { point, fish: null };
        }
        return null;
      },
    },
    shadowExtent: Math.max(W, D) + 24,
    atmosphere: {
      background: 0x120f26,
      fog: { color: 0x2e2648, near: 55, far: 210 },
      hemi: { sky: 0xbab6f2, ground: 0x625668, intensity: 2.3 },
      // Moonlight; its shadows reach the whole map within the shadow camera's 150 m depth.
      sun: { color: 0xd2daff, intensity: 2.0, from: MOON },
      viewmodel: { sky: 0xbab6f2, ground: 0x625668, hemi: 1.6, sun: 1.6, sunColor: 0xd2daff },
    },
  };
}

interface HouseSpec extends Rect {
  stories?: 1 | 2;
  /** Floor-to-floor height (m). */
  h?: number;
  wall: SurfaceKey;
  tint: number;
  roof: number;
  ridge?: 'x' | 'z';
  rise?: number;
  /** Door and window centers along each side (absolute x for n/s, z for e/w). */
  doors?: Partial<Record<Side, number[]>>;
  doorW?: number;
  /** Ground-floor windows: sill at 0.9 m, top at 2.3 m (crouch-jump through). */
  windows?: Partial<Record<Side, number[]>>;
  /** Upstairs windows (two-story houses). */
  upper?: Partial<Record<Side, number[]>>;
  /** Planks nailed across the windows (visual: bullets and grenades still get through). */
  boarded?: boolean;
  frame: number;
}

/** Enterable house with doors on several sides, a gable roof and, with two stories, stairs along the north wall. */
function house(b: MapBuilder, s: HouseSpec) {
  const t = 0.3;
  const h = s.h ?? 3.2;
  const stories = s.stories ?? 1;
  const wallH = h * stories + 0.2;
  const dw = (s.doorW ?? 1.7) / 2;
  const ops = (side: Side): Opening[] => [
    ...(s.doors?.[side] ?? []).map((c): Opening => [c - dw, c + dw, 0, 2.4]),
    ...(s.windows?.[side] ?? []).map((c): Opening => [c - 1, c + 1, 0.9, 2.3]),
    ...(s.upper?.[side] ?? []).map((c): Opening => [c - 0.9, c + 0.9, h + 0.9, h + 2.2]),
  ];
  const o = { tint: s.tint, frame: { surface: 'pintura' as const, tint: s.frame, width: 0.1 } };
  b.wall('x', s.z0, s.x0, s.x1, t, wallH, s.wall, ops('n'), 0, o);
  b.wall('x', s.z1, s.x0, s.x1, t, wallH, s.wall, ops('s'), 0, o);
  b.wall('z', s.x0, s.z0 + t / 2, s.z1 - t / 2, t, wallH, s.wall, ops('w'), 0, o);
  b.wall('z', s.x1, s.z0 + t / 2, s.z1 - t / 2, t, wallH, s.wall, ops('e'), 0, o);
  if (s.boarded) {
    const plank = { tint: 0x7a6248, collide: false };
    const sides: [Side, 'x' | 'z', number, number][] = [['n', 'x', s.z0, -1], ['s', 'x', s.z1, 1], ['w', 'z', s.x0, -1], ['e', 'z', s.x1, 1]];
    for (const [side, axis, fixed, out] of sides) {
      for (const c of s.windows?.[side] ?? []) {
        const d = fixed + out * (t / 2 + 0.03);
        for (const a of [0.5, -0.45]) {
          const rot = axis === 'x' ? new THREE.Euler(0, 0, a) : new THREE.Euler(a, 0, 0);
          if (axis === 'x') b.box(c, 1.6, d, 2.3, 0.18, 0.04, 'madeira', { ...plank, rot });
          else b.box(d, 1.6, c, 0.04, 0.18, 2.3, 'madeira', { ...plank, rot });
        }
      }
    }
  }
  const ix0 = s.x0 + t / 2;
  const ix1 = s.x1 - t / 2;
  const iz0 = s.z0 + t / 2;
  const iz1 = s.z1 - t / 2;
  b.span(ix0, 0, iz0, ix1, 0.02, iz1, 'piso', { tint: 0x7a5e48, collide: false, castShadow: false });
  if (stories === 2) {
    const hx0 = ix0 + 0.8;
    const hx1 = hx0 + stairRun(h);
    const hz1 = iz0 + 1.3;
    const floor = { tint: 0x5a4636 };
    b.span(ix0, h - 0.25, hz1, ix1, h, iz1, 'piso', floor);
    b.span(ix0, h - 0.25, iz0, hx0, h, hz1, 'piso', floor);
    b.span(hx1, h - 0.25, iz0, ix1, h, hz1, 'piso', floor);
    b.stairs('x', 1, hx0, iz0, hz1, 0, h, 'madeira', { tint: 0x4a3426 });
    railing(b, 'x', hz1 + 0.05, hx0, hx1 - 1.2, h, { h: 1.0, tint: 0x2a1a14 });
  }
  b.span(ix0, h * stories, iz0, ix1, wallH, iz1, 'concreto', { tint: 0x4a4446 });
  b.gableRoof(s.x0, s.z0, s.x1, s.z1, wallH, s.rise ?? 2.2, 'telhado', { tint: s.roof, ridgeAxis: s.ridge ?? 'x', gableSurface: s.wall, gableTint: s.tint });
}

/** Market stall: counter (cover), back panel, posts and a striped awning. Faces +Z at yaw 0. */
function stall(b: MapBuilder, x: number, z: number, yaw: number, color: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const P = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  const rot = new THREE.Euler(0, yaw, 0);
  const [cx, cz] = P(0, 0.5);
  b.box(cx, 0.52, cz, 2.6, 1.05, 0.5, 'madeira', { tint: 0x5a3a26, rot });
  const [bx, bz] = P(0, -0.9);
  b.box(bx, 1.2, bz, 2.6, 2.4, 0.1, 'madeira', { tint: 0x4a3020, rot });
  for (const lx of [-1.25, 1.25]) {
    const [px, pz] = P(lx, 0.7);
    b.box(px, 1.2, pz, 0.1, 2.4, 0.1, 'madeira', { tint: C.woodDark, rot, collide: false });
  }
  for (let k = 0; k < 6; k++) {
    const [ax, az] = P(-1.35 + (k + 0.5) * 0.45, -0.1);
    b.box(ax, 2.5, az, 0.45, 0.06, 1.9, 'pintura', { tint: k % 2 ? 0xe8e0d0 : color, rot: new THREE.Euler(0.15, yaw, 0, 'YXZ'), collide: false });
  }
}

/** Gloomy portrait in a gilded frame, hung on a wall facing `yaw` (0 = facing +Z). */
function portrait(b: MapBuilder, scene: THREE.Scene, x: number, y: number, z: number, yaw: number, who: 0 | 1) {
  const art = new THREE.MeshToonMaterial({ map: portraitTexture(who), gradientMap: toonGradient() });
  const dx = Math.sin(yaw);
  const dz = Math.cos(yaw);
  b.box(x + dx * 0.03, y, z + dz * 0.03, 0.9, 1.1, 0.06, 'pintura', { tint: 0x8a6a2a, collide: false, castShadow: false, rot: new THREE.Euler(0, yaw, 0) });
  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.96), art);
  canvas.position.set(x + dx * 0.065, y, z + dz * 0.065);
  canvas.rotation.y = yaw;
  scene.add(canvas);
}

/** The family: 0 = the lady of the house (dark hair in a bun, pearls), 1 = the old master (mustache, monocle). */
function portraitTexture(who: 0 | 1) {
  return canvasTexture(256, 320, (g) => {
    const bg = g.createRadialGradient(128, 120, 20, 128, 160, 200);
    bg.addColorStop(0, who ? '#3a3226' : '#3a2630');
    bg.addColorStop(1, '#140c10');
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 320);
    const ell = (x: number, y: number, rx: number, ry: number, c: string) => {
      g.fillStyle = c;
      g.beginPath();
      g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    };
    // Shoulders and clothes.
    ell(128, 330, 112, 110, who ? '#2a2a3a' : '#4a1a2a');
    if (who) {
      g.fillStyle = '#e8e4dc';
      g.beginPath();
      g.moveTo(108, 225);
      g.lineTo(128, 300);
      g.lineTo(148, 225);
      g.fill();
      ell(128, 238, 10, 8, '#8a1a1a');
    } else {
      for (let k = 0; k < 9; k++) ell(92 + k * 9, 236 + Math.sin((k / 8) * Math.PI) * 14, 5, 5, '#f2ece0');
    }
    // Neck, face, hair.
    g.fillStyle = '#d8b8a0';
    g.fillRect(112, 180, 32, 50);
    if (!who) {
      ell(128, 74, 34, 26, '#1e1214');
      ell(128, 118, 56, 60, '#1e1214');
    } else ell(128, 90, 48, 22, '#c8c8c8');
    ell(128, 130, 44, 56, '#e0c4ac');
    ell(110, 124, 6, 4, '#1a1214');
    ell(146, 124, 6, 4, '#1a1214');
    g.fillStyle = '#b89480';
    g.fillRect(124, 128, 8, 22);
    if (who) {
      ell(112, 162, 22, 7, '#d8d8d8');
      ell(144, 162, 22, 7, '#d8d8d8');
      g.strokeStyle = '#c8a040';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(146, 124, 12, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(158, 128);
      g.lineTo(168, 200);
      g.stroke();
    } else {
      ell(128, 166, 12, 4, '#8a2a3a');
      ell(84, 132, 6, 8, '#f2ece0');
    }
    // Varnish: a soft glare across the top.
    const glare = g.createLinearGradient(0, 0, 256, 320);
    glare.addColorStop(0, 'rgba(255,240,210,0.12)');
    glare.addColorStop(0.5, 'rgba(255,240,210,0)');
    g.fillStyle = glare;
    g.fillRect(0, 0, 256, 320);
  });
}
