// "Jardim do Dragão": a great Chinese estate, 90 x 90 m (docs: the Chinese map design).
// The main house in the middle (courtyard with the Dragon Tree, Great Hall, ceremony hall, library, tea
// room), the ring around it, and six walled sectors around the ring, each touching the next:
// Bonsai Garden (N), Lotus Lake (NE), Lantern Court (SE), Warriors' Court (S), Bamboo Valley (SW) and the
// Ancestral Sanctuary (NW). See jardim/kit.ts for the layout.
//
// The walls between sectors are 4 m tall and their gates never line up with each other: sightlines stay
// inside one sector (or one room), so nobody across the map can shoot whoever is busy oppressing a corpse.
// Paper walls are shot through; lanterns swing, bells, drums and the gong sound and the dragon breathes
// fire when shot. The cherry under the courtyard's tree gives extra max health for a while (CHERRY); the
// cherries in the tree come apart when shot, and the koi can be shot for a little XP (KOI).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FISH } from '@shared/maps';
import { toonGradient } from '../render/materials';
import { skySpot } from '../audio/spatial';
import type { Physics } from './physics';
import { MapBuilder } from './mapBuilder';
import { WaterDrops } from './hydrant';
import { PropBus } from './props';
import { Lanterns, ORIENTAL as C, seeded, wallCap } from './oriental';
import type { CritterHit, GameMap, MapFrame, SpawnPoint } from './blockoutMap';
import { type Ctx, type GardenSfx, gardenWall, MID_X, MID_Z, rect, slab, W } from './jardim/kit';
import { buildCasa, buildRing } from './jardim/casa';
import { buildBonsai } from './jardim/bonsai';
import { buildLago } from './jardim/lago';
import { buildLanternas } from './jardim/lanternas';
import { buildGuerreiros } from './jardim/guerreiros';
import { buildBambu } from './jardim/bambu';
import { buildSantuario } from './jardim/santuario';
import { type FishHit, KoiSchool } from './jardim/peixes';
import type { FruitHit } from './jardim/frutas';
import { LanternLights, NIGHT, nightSky, SkyLanterns } from './jardim/luzes';

export type { GardenSfx };

export async function buildDragonGardenMap(physics: Physics, scene: THREE.Scene, sfx: GardenSfx): Promise<GameMap> {
  // 45 m cells: the estate's four quadrants (40 m cells cut it in 16 pieces, doubling the draw calls).
  const b = new MapBuilder(physics, scene, W);
  const animated: ((dt: number, frame: MapFrame) => void)[] = [];
  const glow: THREE.BufferGeometry[] = [];
  const c: Ctx = {
    b,
    scene,
    // Same seed on every client: rocks, trees and bamboo collide identically online.
    rand: seeded(8128),
    lanterns: new Lanterns(),
    props: new PropBus(),
    sfx,
    glow,
    animate: (f) => animated.push(f),
    // No depth writes: the koi are drawn after the water and stay clearly visible under it.
    water: new THREE.MeshToonMaterial({ color: 0x3fa49c, transparent: true, opacity: 0.72, gradientMap: toonGradient(), depthWrite: false }),
    drops: new WaterDrops(scene),
    holes: [],
  };

  // --- Sectors -------------------------------------------------------------------------------------
  const { cherry, fruit } = buildCasa(c);
  buildRing(c);
  buildBonsai(c);
  buildLago(c);
  const stalls = buildLanternas(c);
  buildGuerreiros(c);
  buildBambu(c);
  buildSantuario(c);

  // --- Ground (with the ponds, the lake and the stream cut out) -------------------------------------
  slab(b, rect(-W, -W, W, W), c.holes, -3, 0, 'grama', { tint: 0x86c45a, castShadow: false });

  // --- Outer wall (down to the ground's bottom: the stream runs into it) ---------------------------
  const outerH = 4.5;
  const plaster = { tint: C.plaster };
  b.span(-W - 1, -3, -W - 1, W + 1, outerH, -W, 'concreto', plaster);
  b.span(-W - 1, -3, W, W + 1, outerH, W + 1, 'concreto', plaster);
  b.span(-W - 1, -3, -W, -W, outerH, W, 'concreto', plaster);
  b.span(W, -3, -W, W + 1, outerH, W, 'concreto', plaster);
  wallCap(b, -W - 1, -W - 1, W + 1, -W, outerH);
  wallCap(b, -W - 1, W, W + 1, W + 1, outerH);
  wallCap(b, -W - 1, -W, -W, W, outerH);
  wallCap(b, W, -W, W + 1, W, outerH);
  const skirting = { tint: C.stoneDark, collide: false, castShadow: false };
  b.span(-W, 0, -W, W, 0.5, -W + 0.04, 'pedra', skirting);
  b.span(-W, 0, W - 0.04, W, 0.5, W, 'pedra', skirting);
  b.span(-W, 0, -W, -W + 0.04, 0.5, W, 'pedra', skirting);
  b.span(W - 0.04, 0, -W, W, 0.5, W, 'pedra', skirting);

  // --- Walls between the sectors, with their gates -------------------------------------------------
  // Every sector has a gate to the ring and one to each neighbor; no two gates face each other.
  gardenWall(c, 'z', -MID_X, -W, W, [
    { at: -38, name: '松風' },
    { at: -10, name: '祖廟' },
    { at: 10, name: '竹谷' },
    { at: 41, kind: 'lua' },
  ]);
  gardenWall(c, 'z', MID_X, -W, W, [
    { at: -29, kind: 'lua' },
    { at: -10, name: '蓮池' },
    { at: 13, name: '燈街' },
    { at: 37, name: '演武' },
  ]);
  gardenWall(c, 'x', -MID_Z, -MID_X + 0.3, MID_X - 0.3, [{ at: -6, name: '盆景' }, { at: 13, kind: 'porta' }]);
  gardenWall(c, 'x', MID_Z, -MID_X + 0.3, MID_X - 0.3, [{ at: 6, name: '武院', tint: C.lacquer, leaves: true }, { at: -12, kind: 'porta' }]);
  gardenWall(c, 'x', 0, -W, -MID_X - 0.3, [{ at: -36, name: '竹林' }]);
  gardenWall(c, 'x', 0, MID_X + 0.3, W, [{ at: 31, name: '燈籠' }]);

  // --- Glow, lanterns, sky -------------------------------------------------------------------------
  // The glowing cores' centers (stone lanterns, crypt lamps; a lamp is two boxes): lights for the night.
  const cores: THREE.Vector3[] = [];
  for (const g of glow) {
    g.computeBoundingBox();
    const p = g.boundingBox!.getCenter(new THREE.Vector3());
    if (!cores.some((q) => q.distanceTo(p) < 0.2)) cores.push(p);
  }
  if (glow.length) scene.add(new THREE.Mesh(mergeGeometries(glow, false)!, new THREE.MeshBasicMaterial({ color: 0xffe6a0 })));
  glow.forEach((g) => g.dispose());
  c.lanterns.finish(scene, b, c.props, (at) => sfx.at(at, 'normal', (s) => s.lanternTap()));
  animated.push((dt) => c.lanterns.update(dt));
  // --- Night: the sky, the floating lanterns and the light of the lanterns --------------------------
  const sky = nightSky(scene);
  const floating = new SkyLanterns(scene);
  const lights = new LanternLights(scene, () => c.lanterns.at, cores);
  animated.push((dt, { listener }) => {
    sky(listener);
    floating.update(dt);
    lights.update(dt, listener);
  });
  animated.push((dt) => c.drops.update(dt));
  let birdTimer = 4;
  animated.push((dt, { listener }) => {
    birdTimer -= dt;
    if (birdTimer <= 0) {
      birdTimer = 6 + Math.random() * 9;
      sfx.at(skySpot(listener), 'ambient', (s) => s.ambientBird());
    }
  });

  // --- Koi in the ponds (they can be shot: see KOI) --------------------------------------------------
  const koi = new KoiSchool(scene, FISH.jardim, c.drops, seeded(4242));
  animated.push((dt, { time }) => koi.update(dt, time));
  /** The nearer of a fish and a cherry pair along a shot or in reach of a knife; the pair falls at once. */
  /** The nearest of a fish and the fruit along a shot or in reach of a knife; fruit is cut at once. */
  const nearest = (f: FishHit | null, fruits: [FruitHit | null, typeof fruit | typeof stalls][], dir: THREE.Vector3): CritterHit | null => {
    let best: [FruitHit, typeof fruit | typeof stalls] | null = null;
    for (const [h, set] of fruits) if (h && (!best || h.d < best[0].d)) best = [h, set];
    if (best && (!f || best[0].d < f.d)) {
      best[1].hit(best[0].k, dir);
      return { point: best[0].point, fish: null };
    }
    return f ? { point: f.point, fish: { id: f.id, golden: f.golden } } : null;
  };

  b.finish();

  const at = (x: number, y: number, z: number, yaw: number): SpawnPoint => ({ position: new THREE.Vector3(x, y, z), yaw });
  const E = -Math.PI / 2; // facing +X
  const Wd = Math.PI / 2; // facing -X
  const N = 0; // facing -Z
  const S = Math.PI; // facing +Z
  return {
    // Teams: west (sanctuary's lower court, bamboo valley) against east (lake's south bank, lantern street).
    spawnsA: [at(-40, 0.2, -3.5, E), at(-27.5, 0.2, -2.4, E), at(-22.4, 0.2, -16, E), at(-29.6, 0.2, 2.6, E), at(-24, 0.2, 7.4, E)],
    spawnsB: [at(23.8, 0.2, -2.6, Wd), at(36.6, 0.2, -6.6, Wd), at(31, 0.2, 5.2, Wd), at(26.4, 0.2, 12.6, Wd), at(37.4, 0.2, 13.6, Wd)],
    spawnsFFA: ([
      // House: corner rooms, library, east wing; the ring.
      [-10.6, 0.2, -11.2], [10.6, 0.2, 10.4], [-11.8, 0.2, -5.6], [9.6, 0.2, -1.2], [-12, 0.2, -16.4], [11.4, 0.2, 18.4],
      // Bonsai: the pavilion, the west lawn, the deck.
      [13, 1.1, -39.6], [-14, 0.2, -27.4], [0.8, 0.7, -43.2],
      // Lake: tea house, the island's upper floor, south bank, west bank.
      [32, 0.6, -42.6], [32.5, 3.85, -21.6], [40.5, 0.2, -6.4], [20.2, 0.2, -37.6],
      // Lantern court: servants' upper floor, music room, market, kitchen.
      [40, 3.5, 9], [39, 0.2, 21.2], [27, 0.2, 43.4], [24.6, 0.2, 21.8],
      // Warriors: dojo, the Master's Platform, zen garden, armory.
      [-12, 0.2, 29.4], [15, 2.2, 24.6], [-8, 0.2, 41.6], [13.2, 0.2, 42],
      // Bamboo: gardener's house, the dense stretch, the central path.
      [-40.6, 0.2, 40.2], [-42.4, 0.2, 7], [-30, 0.2, 10.8],
      // Sanctuary: crypt, temple, lower court, incense court.
      [-30, 0.2, -25.6], [-34.5, 3.7, -38.2], [-23.4, 0.2, -11.6], [-42, 3.2, -26],
    ] as [number, number, number][]).map(([x, y, z]) => at(x, y, z, Math.atan2(x, z))),
    dummies: [
      // The ring, the courtyard, the Great Hall.
      { position: new THREE.Vector3(-15.4, 0, 0), yaw: E, patrol: { axis: 'z', amplitude: 3, speed: 0.8 } },
      { position: new THREE.Vector3(3, 0, 4.2), yaw: N },
      { position: new THREE.Vector3(5, 0, -9.6), yaw: S },
      // Bonsai bridge, the lake's island balcony and old bridge.
      { position: new THREE.Vector3(-10, 1.0, -38), yaw: Wd, patrol: { axis: 'x', amplitude: 1.2, speed: 0.9 } },
      { position: new THREE.Vector3(32.5, 3.65, -19.4), yaw: S },
      { position: new THREE.Vector3(34.6, 0.25, -13), yaw: Wd, patrol: { axis: 'z', amplitude: 3, speed: 0.8 } },
      // Behind paper: the music room (shoot through it), the lantern street.
      { position: new THREE.Vector3(35.4, 0, 20.6), yaw: E },
      { position: new THREE.Vector3(30.2, 0, 18.4), yaw: S },
      // Arena, the Master's Platform, under the bamboo bridge.
      { position: new THREE.Vector3(4, 0, 31.3), yaw: N, patrol: { axis: 'x', amplitude: 3, speed: 0.7 } },
      { position: new THREE.Vector3(15, 2.0, 24.4), yaw: S },
      { position: new THREE.Vector3(-31, -1.2, 26.7), yaw: E, patrol: { axis: 'x', amplitude: 4, speed: 0.6 } },
      // Sanctuary: incense court, crypt.
      { position: new THREE.Vector3(-34.5, 3.0, -25.4), yaw: S },
      { position: new THREE.Vector3(-29.6, 0, -23.6), yaw: E },
    ],
    killY: -20,
    pickups: [cherry],
    critters: {
      shot: (o, dir, dist) => nearest(koi.shot(o, dir, dist), [[fruit.shot(o, dir, dist), fruit], [stalls.shot(o, dir, dist), stalls]], dir),
      stab: (eye, fwd, reach) => nearest(koi.stab(eye, fwd, reach), [[fruit.stab(eye, fwd, reach), fruit], [stalls.stab(eye, fwd, reach), stalls]], fwd),
    },
    fish: koi,
    shadowExtent: W + 12,
    atmosphere: NIGHT,
    stats: b.stats,
    openings: b.openings,
    props: c.props,
    update(dt, frame) {
      for (const f of animated) f(dt, frame);
    },
    dog: null,
  };
}
