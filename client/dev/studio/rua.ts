// Sticker studio, the rua domain (see core-api.md): the Rua dos Vizinhos and its gags (the house, the hydrants,
// the ice cream truck, Amora, the crates) plus the Estrada Maldita's honking car and two falls. The house and the
// hydrant come from the map's own builders (buildHouse, hydrantBody); the two closures the map keeps local (bush,
// mailbox) are copied here as the map calls them. Studio-made extras: music notes, a jagged yell balloon, Amora's
// red mouth and fangs.
import * as THREE from 'three';
import type { Avatar } from '../../entities/avatar';
import { PALETTE, toonGradient } from '../../render/materials';
import { buildHouse } from '../../world/catalog/street';
import { flamingoGeometry, iceCreamTopper } from '../../world/decor';
import { ChowChow, namePlate } from '../../world/dog';
import { crate } from '../../world/furniture';
import { addGltfToMap, gltfLoader } from '../../world/gltfMap';
import { SPOOKY } from '../../world/halloween';
import { Hydrant, hydrantBody, WaterDrops } from '../../world/hydrant';
import { MapBuilder } from '../../world/mapBuilder';
import { FireBreath } from '../../world/oriental';
import { surfaceMaterial } from '../../world/surfaces';
import { buildCar, buildIceCreamTruck } from '../../world/vehicles';
import { dress, HERO, mood, neighbor, RIVAL, tweak } from './core/cast';
import { DT, type Kit } from './core/kit';
import { defineDomain } from './core/types';

/** The map's bush (blockoutMap.ts, the `bush` closure): three low blobs of flat-painted foliage, `w` wide. */
function bush(b: MapBuilder, x: number, z: number, w: number) {
  const pintura = surfaceMaterial('pintura');
  for (let i = 0; i < 3; i++) {
    const g = new THREE.IcosahedronGeometry(0.45 + (i % 2) * 0.1, 0).scale(1.2, 0.8, 1).translate(x + (i - 1) * w * 0.33, 0.4, z + (i % 2) * 0.1);
    b.addGeometry(g, pintura, i % 2 ? 0x3f8a2e : 0x4e9e38);
  }
}

/** The map's mailbox (blockoutMap.ts, by the sidewalks) standing on `y`: a wooden post and the metal box. */
function mailbox(b: MapBuilder, x: number, z: number, tint: number, y = 0) {
  b.span(x - 0.05, y, z - 0.05, x + 0.05, y + 0.95, z + 0.05, 'madeira', { tint: PALETTE.wood, collide: false });
  b.span(x - 0.25, y + 0.95, z - 0.2, x + 0.25, y + 1.25, z + 0.2, 'metal', { tint, collide: false });
}

/**
 * A MapBuilder of its own in a container of its own (k.builder's pieces are merged with everything else): what it
 * builds can be hidden or moved per shot. Finish it before returning.
 */
function apart(k: Kit): { b: MapBuilder; group: THREE.Scene } {
  const group = new THREE.Scene();
  k.group.add(group);
  return { b: new MapBuilder(k.physics, group), group };
}

type P3 = [number, number, number];

/**
 * A flat music note, ♪ or the beamed ♫ (drawn on a canvas: `fill` with an ink outline, like the hit stars), `size`
 * meters, facing the camera at a seeded tilt.
 */
function note(k: Kit, at: P3, size: number, beamed: boolean, fill = '#ff4f9a'): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const path = new Path2D();
  const head = (x: number, y: number) => {
    path.moveTo(x + 19, y);
    path.ellipse(x, y, 19, 13, -0.4, 0, Math.PI * 2);
  };
  if (beamed) {
    head(32, 100);
    head(92, 88);
    path.rect(42, 30, 10, 68);
    path.rect(102, 18, 10, 68);
    path.moveTo(42, 28);
    path.lineTo(112, 14);
    path.lineTo(112, 34);
    path.lineTo(42, 48);
    path.closePath();
  } else {
    head(46, 96);
    path.rect(56, 20, 10, 76);
    path.moveTo(64, 20);
    path.bezierCurveTo(98, 34, 106, 58, 92, 82);
    path.bezierCurveTo(94, 62, 84, 48, 64, 44);
    path.closePath();
  }
  g.lineJoin = g.lineCap = 'round';
  g.lineWidth = 14;
  g.strokeStyle = '#1b1530';
  g.stroke(path);
  g.fillStyle = fill;
  g.fill(path);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  m.position.set(...at);
  m.userData.facecam = true;
  m.userData.roll = (Math.random() - 0.5) * 0.7;
  k.group.add(m);
  return m;
}

/** A camera `dist` m from `target`, `yaw` degrees around it (0: on +Z, 90: on +X) and `pitch` degrees above it. */
function orbit(target: P3, yaw: number, pitch: number, dist: number): P3 {
  const y = THREE.MathUtils.degToRad(yaw);
  const p = THREE.MathUtils.degToRad(pitch);
  return [target[0] + Math.sin(y) * Math.cos(p) * dist, target[1] + Math.sin(p) * dist, target[2] + Math.cos(y) * Math.cos(p) * dist];
}

interface Cam {
  pos: P3;
  target: P3;
  fov: number;
}

/**
 * A yell: `text` in dark Lilita One inside a jagged white balloon with an ink outline (the comics' shout, so it
 * reads apart from the round speech bubbles elsewhere on the Mapas page), the spike's tip at `tip`. Sized so the
 * letters are `capPx` tall on the card (`card`: its camera). `lean` puts the tip that far toward the balloon's right
 * end (a fraction of its half width: 0 under the middle, 0.7 under the right end, so the balloon sits up and to the
 * left of the speaker); `tail` is the spike's length in label heights. The words are a k.label, which the core
 * measures and reports like any text; the balloon is drawn here. Returns both (hide them in the mini).
 */
function yell(k: Kit, text: string, tip: THREE.Vector3, card: Cam, o: { capPx?: number; lean?: number; tail?: number } = {}): THREE.Object3D[] {
  const capPx = o.capPx ?? 72;
  const lean = o.lean ?? 0.12;
  const cam = new THREE.Vector3(...card.pos);
  const forward = new THREE.Vector3(...card.target).sub(cam).normalize();
  const right = forward.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
  const up = right.clone().cross(forward);
  const perPx = (2 * tip.clone().sub(cam).dot(forward) * Math.tan(THREE.MathUtils.degToRad(card.fov / 2))) / 600;
  // The label's own proportions (kit.ts: 120 px Lilita One, a quarter em of padding a side, 1.5 em tall).
  const g = document.createElement('canvas').getContext('2d')!;
  g.font = '400 120px "Lilita One", system-ui, sans-serif';
  const cap = g.measureText('H');
  const labelH = (capPx * perPx * 180) / (cap.actualBoundingBoxAscent + cap.actualBoundingBoxDescent);
  const labelW = (labelH * (g.measureText(text).width + 60)) / 180;
  // The balloon: a jagged ellipse around the words, one spike down to the tip.
  const bodyW = labelW * 1.2;
  const bodyH = labelH * 1.35;
  const W = 512;
  const scale = W / bodyW; // canvas px per meter
  const H = Math.ceil((bodyH + labelH * (o.tail ?? 0.55)) * scale);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const lw = 12;
  const cx = W / 2;
  const cy = (bodyH * scale) / 2;
  const pts: [number, number][] = [];
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = (i % 2 ? 0.78 : 1) * (1 - Math.random() * 0.05);
    pts.push([cx + Math.cos(a) * (cx - lw) * r, cy + Math.sin(a) * (cy - lw) * r]);
    // The spike, between the two points around where the ellipse's edge is over the tip.
    if (i === Math.floor((Math.acos(lean) / (Math.PI * 2)) * n)) pts.push([cx + (cx - lw) * lean, H - lw]);
  }
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  ctx.fillStyle = '#fffdf6';
  ctx.strokeStyle = '#1b1530';
  ctx.fill();
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const balloon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const tipX = cx + (cx - lw) * lean;
  balloon.center.set(tipX / W, lw / H);
  balloon.scale.set(W / scale, H / scale, 1);
  balloon.position.copy(tip);
  balloon.renderOrder = 4; // under the words (the label is 5)
  k.group.add(balloon);
  const at = tip.clone().addScaledVector(right, (cx - tipX) / scale).addScaledVector(up, (H - cy) / scale);
  const words = k.label(text, at, { fill: '#1b1530', stroke: '#fffdf6', height: labelH });
  return [balloon, words];
}

/**
 * Amora's bite, readable on a card: the game's Chow Chow opens her jaw onto nothing (her mouth is the gap
 * between two dark blobs), so this puts a dark red mouth in it and four white fangs, on her own head and jaw
 * (they follow the jaw). Studio-made, like the hit stars.
 */
function snarl(dog: ChowChow) {
  const head = dog['head'] as THREE.Object3D;
  const jaw = dog['jaw'] as THREE.Object3D;
  const toonOf = (color: number) => new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), toonOf(0x6a1f2c));
  mouth.scale.set(0.075, 0.07, 0.06);
  mouth.position.set(0, -0.15, -0.21);
  head.add(mouth);
  const ivory = toonOf(0xfff8ec);
  const fang = new THREE.ConeGeometry(0.022, 0.075, 6);
  for (const x of [-0.048, 0.048]) {
    const top = new THREE.Mesh(fang, ivory);
    top.position.set(x, -0.125, -0.255);
    top.rotation.x = Math.PI; // pointing down from the muzzle
    head.add(top);
    const low = new THREE.Mesh(fang, ivory);
    low.position.set(x * 0.85, 0.03, -0.16);
    jaw.add(low);
  }
}

/**
 * Cuts an avatar flat at `plane` (what's on its negative side goes), so a bust closes into one sticker instead of
 * running off the picture's edge. Its body pieces own their materials (k.avatar doesn't bake): they take the plane
 * as they are (a clone would drop their onBeforeCompile patch). The guns in its hands and on its back share the
 * game's cached materials, so they are left whole (a bust keeps its hands and gun above the cut anyway). Move the
 * plane per shot, and switch the page-wide local clipping on only for the shot that cuts (core-api.md traps 3, 22
 * and 23).
 */
function cutAt(av: Avatar, plane: THREE.Plane) {
  const guns = new Set<THREE.Object3D>();
  for (const slot of ['weapon_R', 'weapon_L', 'weapon_back'] as const) for (const o of av.character.objectsOf(slot)) o.traverse((m) => guns.add(m));
  av.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || guns.has(o)) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.clippingPlanes = [plane];
  });
}

/**
 * One jet of a burning crown, as embalado draws a streak's fire (personagens.ts): the fountain dragon's FireBreath
 * shrunk in a container (a nested Scene: FireBreath wants one), burned `n` frames toward `dir`, then made opaque
 * and colored by age in the Vila bonfire's palette (its own pastel puffs at 0.85 wash out over the die-cut's cream).
 */
function flames(k: Kit, at: THREE.Vector3, scale: number, n: number, dir: THREE.Vector3): THREE.Scene {
  const box = new THREE.Scene();
  box.position.copy(at);
  box.scale.setScalar(scale);
  k.group.add(box);
  const fire = new FireBreath(box);
  fire.start(new THREE.Vector3(), dir);
  k.step(n, (dt) => fire.update(dt));
  const mesh = box.children[0] as THREE.InstancedMesh;
  const mat = mesh.material as THREE.MeshBasicMaterial;
  mat.transparent = false;
  mat.opacity = 1;
  mat.depthWrite = true;
  const life = fire['life'];
  const c = new THREE.Color();
  for (let i = 0; i < life.length; i++) {
    if (life[i] <= 0) continue;
    const age = 1 - life[i] / 0.75;
    mesh.setColorAt(i, c.set(age < 0.3 ? 0xffd25a : age < 0.6 ? 0xff8a2a : 0xd8401a));
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return box;
}

/**
 * A bust's cut seen from `eye`: the plane through the eye and a line through `at` along the camera's screen-right
 * (for a camera whose up is `up`), so the cut shows as one straight level line across the picture whatever the
 * body's tilt. Keeps what is above the line (cutAt clips the plane's negative side).
 */
function viewCut(eye: THREE.Vector3, at: THREE.Vector3, up = new THREE.Vector3(0, 1, 0)): THREE.Plane {
  const ahead = at.clone().sub(eye);
  const right = ahead.clone().cross(up).normalize();
  return new THREE.Plane().setFromNormalAndCoplanarPoint(right.cross(ahead).normalize(), at);
}

/** A point given in a bone's own space (+y up the head, +x the character's right, -z its front), in world space. */
function local(bone: THREE.Object3D, x: number, y: number, z: number): THREE.Vector3 {
  bone.updateWorldMatrix(true, false);
  return bone.localToWorld(new THREE.Vector3(x, y, z));
}

/**
 * A cartoon puff of steam, a cauliflower cloud: a white toon-shaded ball of radius `r` at `at` with `n` smaller
 * ones around its top and sides, spread in the picture plane (`side`: the camera's level screen-right). The
 * Puffs' faceted, unlit balls read as pebbles at card size; these keep a soft shaded underside. Studio-made, like
 * the hit stars.
 */
function steam(k: Kit, at: THREE.Vector3, r: number, n: number, side: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshToonMaterial({ color: 0xf7fafc, gradientMap: toonGradient() });
  const ball = (p: THREE.Vector3, radius: number) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), mat);
    m.position.copy(p);
    g.add(m);
  };
  ball(at, r);
  for (let i = 0; i < n; i++) {
    // From the left side over the top to the right side.
    const a = Math.PI * (1.15 - (1.3 * i) / Math.max(1, n - 1)) + (Math.random() - 0.5) * 0.3;
    const p = at.clone().addScaledVector(side, Math.cos(a) * r * 0.95).add(new THREE.Vector3(0, Math.sin(a) * r * 0.8, 0));
    ball(p, r * (0.5 + Math.random() * 0.25));
  }
  k.group.add(g);
  return g;
}

/** The Rua houses' door tints (blockoutMap.ts buildHouse). */
const DOOR_LEAF = 0x8a5a3a;
const TRIM = 0xf7f3ea;
const ROOF = 0x8e4b3a;
const HYDRANT_RED = 0xe23b3b;

export default defineDomain('rua', [
  {
    id: 'endereco-fixo',
    build(k) {
      // The cream house of the Rua on its lawn, its door shut, the mailbox out front: "your address".
      const b = k.builder();
      buildHouse(b, 0, 0, PALETTE.house, ROOF);
      // The map's leaf swings inward and the hall would show through the doorway: shut it.
      b.span(1.2, 0, 4.42, 2.8, 2.25, 4.56, 'madeira', { tint: DOOR_LEAF, collide: false });
      // Red like the hydrants: the map's blue box would sink into the Carreira page.
      mailbox(b, 3.5, 5.75, HYDRANT_RED);
      bush(b, -3, 5.15, 2.4);
      const lawn = k.island('grama', 18, 15.2, [0, 0, 0.5]);
      const card: P3 = [0.35, 3.4, 0.75];
      const mini: P3 = [-0.1, 3.9, 0.15];
      return {
        card: { pos: orbit(card, 34, 11, 31.4), target: card, fov: 30 },
        // The mini: the house alone from the other front corner, the 30 px house icon.
        mini: { pos: orbit(mini, -38, 13, 37.5), target: mini, fov: 30, hide: [lawn] },
      };
    },
  },
  {
    id: 'morador-assiduo',
    build(k) {
      // The HERO stepping in through a Rua front door, seen from behind. Only the door's slice of the facade,
      // built as buildHouse builds it (the wall with its trimmed opening, the leaf swung in, porch step, awning):
      // a whole house would repeat endereco-fixo on the same page.
      const b = k.builder();
      const DOOR_W = 1.6;
      const DOOR_H = 2.3;
      const t = 0.3;
      // The wall and the awning apart (the card's): the mini shows only the doorway's trim, so he fills it.
      const facade = apart(k);
      facade.b.wall('x', 0, -1.2, 1.5, t, 2.85, 'reboco', [[-DOOR_W / 2, DOOR_W / 2, 0, DOOR_H]], 0, { tint: PALETTE.house, frame: { tint: TRIM } });
      facade.b.span(-1.1, DOOR_H + 0.25, t / 2, 1.1, DOOR_H + 0.35, t / 2 + 0.9, 'telhado', { tint: ROOF, collide: false });
      facade.b.finish();
      const trim = apart(k);
      for (const [x0, y0, x1, y1] of [[-DOOR_W / 2 - 0.14, 0, -DOOR_W / 2, DOOR_H + 0.14], [DOOR_W / 2, 0, DOOR_W / 2 + 0.14, DOOR_H + 0.14], [-DOOR_W / 2, DOOR_H, DOOR_W / 2, DOOR_H + 0.14]] as const) {
        trim.b.span(x0, y0, -t / 2, x1, y1, t / 2, 'pintura', { tint: TRIM, collide: false });
      }
      trim.b.finish();
      // Inside: a dark hall (floor, walls, back), so the doorway reads as a way in.
      const dark = { tint: 0x2a2230, collide: false };
      b.span(-0.85, 0, -1.5, 0.85, 0.02, -t / 2, 'piso', { tint: 0x6a5242, collide: false });
      b.span(-0.85, 0, -1.5, 0.85, DOOR_H, -1.4, 'pintura', dark);
      b.span(-0.9, 0, -1.5, -0.8, DOOR_H, -t / 2, 'pintura', dark);
      b.span(0.8, 0, -1.5, 0.9, DOOR_H, -t / 2, 'pintura', dark);
      b.span(-0.85, DOOR_H, -1.5, 0.85, DOOR_H + 0.1, -t / 2, 'pintura', dark);
      // The leaf swung in along the left jamb and the porch step (buildHouse's numbers).
      b.span(-DOOR_W / 2, 0, -1.4, -DOOR_W / 2 + 0.05, DOOR_H - 0.05, -t / 2, 'madeira', { tint: DOOR_LEAF, collide: false });
      b.span(-1, 0, t / 2, 1, 0.15, t / 2 + 0.8, 'concreto', { tint: 0xd6d1c4 });

      const hero = k.avatar(HERO);
      hero.root.position.set(0.05, 0.15, 0.45);
      // Walking in (facing -Z, away from the camera): at 0.83 s the stride is at its widest.
      for (let i = 0; i < 50; i++) hero.walk(DT, 3);
      // Three-quarters from behind, so the stride shows in profile and the facade widens the die-cut.
      const card: P3 = [0.1, 1.35, 0.3];
      // The mini: the red cap going through a dark door, his back filling the trimmed opening.
      const mini: P3 = [0.05, 1.12, 0.2];
      return {
        card: { pos: orbit(card, 30, 5, 7.95), target: card, fov: 30, hide: [trim.group] },
        mini: { pos: orbit(mini, 20, 4, 6.3), target: mini, fov: 30, hide: [facade.group] },
      };
    },
  },
  {
    id: 'vizinho-perigoso',
    build(k) {
      // The dangerous neighbor is you: the HERO standing on his own lawn, firing his rifle from the hip, the big
      // flash the card's 💥. Behind him a stretch of the Rua's wooden yard fence and a bush say "his own yard". He
      // fires to screen left, standing (com-um-pe-na-cova, on Proezas, has him crouched firing to screen right).
      const yard = apart(k);
      // The map's yard fence (blockoutMap.ts: a 'madeira' wall in PALETTE.wood), lower here so he stays the subject.
      yard.b.wall('x', 0.75, -1.35, 0.3, 0.12, 1.2, 'madeira', [], 0, { tint: PALETTE.wood, collide: false });
      bush(yard.b, -0.7, 0.4, 1.25);
      yard.b.finish();
      const lawn = k.island('grama', 2.45, 1.6, [-0.2, 0, 0.3]);
      const hero = k.avatar(HERO, 'm', { armed: true });
      hero.root.rotation.y = -1.15; // his left side to the camera, the rifle across him, firing toward screen left
      k.settle(hero, { pitch: -0.05 }, 40);
      hero.fire();
      k.settle(hero, { pitch: -0.05 }, 1);
      k.hideBack(hero);
      // Braced for the recoil: the near (left) foot forward, the other back.
      const p = k.pp(hero);
      p.leg('L', 0.32, 0.22, -0.04);
      p.leg('R', -0.28, 0.12, 0.04);
      p.plant();
      k.rest(hero, 0);
      k.muzzleFlash(hero, { size: 0.6 });
      const card: P3 = [-0.05, 0.76, 0.15];
      // The mini: the HERO from the belt up and his flash, cut level at the belt.
      const mini: P3 = [0.52, 1.3, 0];
      const miniPos = new THREE.Vector3(...orbit(mini, 160, 4, 3.15));
      const belt = viewCut(miniPos, k.at(hero.character.bones.hips, [0, 0.08, 0]));
      cutAt(hero, belt);
      return {
        card: {
          pos: orbit(card, 172, 6, 5.45),
          target: card,
          fov: 30,
          before() {
            k.renderer.localClippingEnabled = false;
          },
        },
        mini: {
          pos: miniPos,
          target: mini,
          fov: 30,
          hide: [yard.group, lawn],
          before() {
            k.renderer.localClippingEnabled = true;
          },
        },
      };
    },
  },
  {
    id: 'estraga-sequencia',
    build(k) {
      // Streak spoiled: the RIVAL, her head ablaze from her streak (the burning crown of embalado, on the same
      // page), thrown up by a Rua hydrant's gush (the map's hydrants launch whoever stands on them), surprised and
      // tipping back over the jet. The spray rains on her crown: one half still burns, the other is already white
      // steam. The stars on her shoulder: the hit that ended the streak.
      // The hydrant and its curb at 0.6: she is the story, so she gets the size.
      const SCALE = 0.6;
      const street = apart(k);
      hydrantBody(street.b, 0, 0, 0);
      street.b.finish();
      street.group.scale.setScalar(SCALE);
      const curb = k.island('calcada', 1.1 * SCALE, 0.85 * SCALE, [0, 0, 0], { thick: 0.2 * SCALE });
      const TOP = 0.85 * SCALE; // the hydrant's top, where the water comes out
      const FEET = TOP + 0.5; // her soles, in the foam
      const drops = new WaterDrops(k.group);
      const hydrant = new Hydrant(k.group, new THREE.Vector3(0, TOP, 0), drops, k.sfx);
      hydrant.burst();
      hydrant.update(DT, k.mapFrame.feet, () => {});
      // The column only up to her soles (the game's runs 6.5 m up), its foam a wide splash under them. The game's
      // water is a pale see-through blue that vanishes on the die-cut's cream: bluer and opaque here.
      const column = hydrant['column'] as THREE.Mesh;
      const foam = hydrant['foam'] as THREE.Mesh;
      column.visible = foam.visible = true;
      column.scale.set(0.9, FEET - TOP, 0.9);
      foam.position.set(0, FEET, 0);
      foam.scale.set(0.72, 0.32, 0.72);
      for (const [mesh, color, opacity] of [[column, 0x4fb4ec, 1], [foam, 0xe4f6ff, 1], [drops.mesh, 0x4fb4ec, 1]] as const) {
        const m = mesh.material as THREE.MeshBasicMaterial;
        m.color.set(color);
        m.opacity = opacity;
      }

      const card: P3 = [-0.05, 1.56, 0];
      const cardPos = orbit(card, 196, 15, 8.0);
      const eye = new THREE.Vector3(...cardPos);
      // The card camera's screen-right direction, level: fire and steam split her crown by screen side.
      const right = new THREE.Vector3(...card).sub(eye).cross(new THREE.Vector3(0, 1, 0)).setY(0).normalize();
      const rival = k.avatar(mood(RIVAL, 'grande', 'arqueada'));
      rival.root.position.set(0, FEET, 0);
      // Facing the lens, a little turned (her face shows); thrown back and off to screen left by the jet.
      k.face(rival, [cardPos[0], FEET, cardPos[2]]);
      rival.root.rotation.y += 0.3;
      k.poses.flail(rival);
      // Both arms flung up and out, unevenly ("whoa!"), under the flames.
      const p = k.pp(rival);
      p.arm('R', 0.25, 0, 2.05, 0.5);
      p.arm('L', 0.45, 0, -1.8, 0.55);
      p.turn('head', -0.35, 0, 0); // chin down: her surprised face on the lens
      rival.character.body.rotation.set(0.3, 0, 0); // launched, tipping back
      const head = rival.character.bones.head;
      const up = new THREE.Vector3(0, 1, 0);
      // The half of her crown on screen left still burns, as embalado's crown (opaque jets colored by age): fire
      // rises, so the jets go up in world space, fanned a little out to screen left.
      const crown = [[0.05, 0.02, 40, 0.25], [0.09, -0.01, 34, 0.6], [0.04, 0.07, 38, 0.1]] as const;
      const fire = crown.map(([x, z, n, out]) => flames(k, local(head, x, 0.12, z), 0.16, n, up.clone().addScaledVector(right, -out)));
      // The mini's own fire, shorter (her face stays the badge's size).
      const small = crown.map(([x, z, n, out]) => flames(k, local(head, x, 0.12, z), 0.115, n, up.clone().addScaledVector(right, -out)));
      // The half on screen right: put out, a puff of steam rising off it.
      steam(k, local(head, -0.07, 0.16, 0).addScaledVector(right, 0.17).add(new THREE.Vector3(0, 0.1, 0)), 0.14, 6, right);
      // The spray: droplets thrown up from the splash, raining around her (finer than the game's, which are sized
      // for a 6.5 m column: the drops' mesh at half size, so they are emitted at twice the place and speed).
      const SPRAY = 0.5;
      drops.mesh.scale.setScalar(SPRAY);
      for (let i = 0; i < 24; i++) {
        if (i % 2 === 0) {
          const at = new THREE.Vector3((Math.random() - 0.5) * 0.3, FEET, (Math.random() - 0.5) * 0.3);
          drops.emit(at.divideScalar(SPRAY), ((Math.random() - 0.5) * 1.5) / SPRAY, (0.8 + Math.random() * 1.2) / SPRAY, ((Math.random() - 0.5) * 1.0) / SPRAY, 0.1 / SPRAY);
        }
        drops.update(DT);
      }
      // The hit that ended the streak: stars off her shoulder on screen right, out past it (clear of her face).
      const shoulder = rival.character.bones.shoulder_L;
      const hit = k.stars(k.at(shoulder).addScaledVector(right, 0.24).add(new THREE.Vector3(0, -0.12, 0)).addScaledVector(eye.clone().sub(k.at(shoulder)).normalize(), 0.15), { count: 5, spread: 0.18, size: 0.13, dir: [right.x, -0.2, right.z] });
      // The mini: her head and shoulders, the fire on one side of her crown and the steam on the other, her face
      // between them; seen from the card's side, closer, the camera rolled to her chest's tilt so the bust stands
      // upright, cut level across the chest (her arms down for that shot, so the bust closes into one sticker).
      const face = k.at(head, [0, 0.12, 0]);
      const miniEye = face.clone().add(eye.clone().sub(face).normalize().multiplyScalar(2.2));
      const chestBone = rival.character.bones.chest;
      const miniUp = new THREE.Vector3(0, 1, 0).applyQuaternion(chestBone.getWorldQuaternion(new THREE.Quaternion()));
      const chest = viewCut(miniEye, k.at(chestBone, [0, -0.06, 0]), miniUp);
      cutAt(rival, chest);
      return {
        card: {
          pos: cardPos,
          target: card,
          fov: 30,
          hide: small,
          before() {
            k.renderer.localClippingEnabled = false;
          },
        },
        mini: {
          pos: miniEye,
          target: face,
          up: miniUp,
          fov: 30,
          hide: [curb, street.group, column, foam, drops.mesh, hit, ...fire],
          before() {
            k.renderer.localClippingEnabled = true;
            p.arm('R', 0.15, 0, 0.3, 0.3);
            p.arm('L', 0.15, 0, -0.3, 0.3);
          },
        },
        rim: 1.2,
      };
    },
  },
  {
    id: 'empurraozinho',
    build(k) {
      // The little push: on top of one of the Rua's orange crates, the HERO pokes a neighbor in the chest with
      // his rifle's muzzle, and the neighbor windmills backward off the edge, heels on the rim, his body already
      // out over the drop. A sky-blue tee and an afro: a shape of his own against the orange crate.
      const top = 1.1;
      const b = k.builder();
      crate(b, 0.45, 0, 0, top, 0, PALETTE.teamA); // x from -0.1 (its screen-right edge) to 1.0
      const hero = k.avatar(HERO, 'm', { armed: true });
      hero.root.position.set(0.62, top, 0);
      hero.root.rotation.y = Math.PI / 2; // facing screen right
      k.settle(hero, { pitch: -0.15 }, 40);
      hero.fire();
      k.settle(hero, { pitch: -0.15 }, 1);
      hero.character.body.rotation.x = -0.25; // leaning into the poke
      k.muzzleFlash(hero, { size: 0.3 });

      const look = dress(neighbor(7), { id: 'basica', cores: ['#4fb3ff'] }, { id: 'calcaJeans', cores: ['#26324d'] });
      const victim = k.avatar(mood(look, 'grande', 'arqueada'));
      victim.root.position.set(-0.05, top, 0); // heels on the rim
      victim.root.rotation.y = -Math.PI / 2; // facing the HERO, his back to the drop
      k.poses.flail(victim);
      victim.character.body.rotation.x = 0.72; // tipping back, out over the drop
      victim.root.updateMatrixWorld(true);
      k.stars(k.at(victim.character.bones.chest, [0.14, 0.04, -0.15]), { count: 7, spread: 0.24, size: 0.13, dir: [0.5, 0.5, -1] });
      const card: P3 = [-0.2, 1.37, 0];
      const mini: P3 = [-0.35, 1.38, 0];
      return {
        card: { pos: orbit(card, 186, 6, 7.45), target: card, fov: 30 },
        // The mini: the neighbor going over the edge, alone on his crate.
        mini: { pos: orbit(mini, 200, 8, 6.6), target: mini, fov: 30, hide: [hero.root] },
      };
    },
  },
  {
    id: 'sorveteiro-fantasma',
    build(k) {
      // The phantom ice cream man is the one who isn't there: the Rua's truck plays its jingle with its hatch
      // empty and dark (strings: "não vende sorvete. Mas toca música."), notes floating out of it. The mini is
      // the giant cone on its roof, the 🍦, so it never meets the Vila's ghost (mudou-pro-mausoleu) at 30 px.
      const truck = apart(k);
      buildIceCreamTruck(truck.b, PALETTE.truck, PALETTE.truckTrim, undefined);
      truck.b.finish();
      const cone = iceCreamTopper(new THREE.Vector3(1.6, 2.75, 0));
      k.group.add(cone);
      const notes = [
        note(k, [0.6, 2.75, 1.9], 0.85, false),
        note(k, [-0.5, 3.6, 2.1], 0.95, true),
        note(k, [-1.8, 4.3, 2.0], 0.8, false),
        note(k, [-3.0, 3.4, 1.9], 0.75, true),
      ];
      const card: P3 = [-0.32, 2.78, 0.28];
      const mini: P3 = [1.6, 4.55, 0];
      // The topper's first piece is the pink mount it stands on: alone it reads as a sundae glass's foot.
      const mount = cone.children[0];
      return {
        card: { pos: orbit(card, -28, 12, 17.6), target: card, fov: 30 },
        // The mini: the cone alone, a clean 🍦 at 30 px (a note beside it only blurred its outline), ending in
        // its point.
        mini: { pos: orbit(mini, -20, 10, 7.85), target: mini, fov: 30, hide: [truck.group, mount, ...notes] },
      };
    },
  },
  {
    id: 'chega',
    build(k) {
      // Six honks of the Estrada Maldita's car in six seconds, and the neighbor has had enough: out in his pajamas
      // (a pale blue buttoned top, striped bottoms) and pom-pom nightcap, he shakes his fist at whoever honked (the
      // lens), the car behind him.
      // "CHEGA." is the game's own line, the sticker's name and its main shape.
      const road = apart(k);
      buildCar(road.b, 1.5, 2.6, 0x4a5a6a, 1.0);
      road.b.finish();
      const asphalt = k.island('asfalto', 5.0, 5.4, [0.45, 0, 0.55], { tint: SPOOKY.asphalt });
      const pajamas = dress(
        neighbor(19),
        { id: 'socialLonga', cores: ['#b9d2ec', '#9fbbd8', '#3e5878'] },
        { id: 'pijama', cores: ['#3e5878', '#e8e2d6'] },
        { id: 'chinelo', cores: ['#2b211d', '#e8e2d6'] },
        // The hat's band in its own white (a dark band across the brows reads as a burglar's mask), the pom-pom navy.
        { id: 'gorro', cores: ['#e8e2d6', '#e8e2d6', '#3e5878'] },
        'bigode',
      );
      const man = k.avatar(mood(tweak(pajamas, { biotipo: 'gordo', cabelo: { cor: '#d8d2c4' } }), 'marcante', 'grossa'));
      man.root.position.set(-0.85, 0, -1.95);
      man.root.rotation.y = -0.35; // at the lens, a little toward the car (screen left)
      // Leaning in, one fist shaken at the lens, the other on his hip.
      const p = k.pp(man);
      p.reset();
      p.turn('spine', -0.22);
      p.turn('chest', -0.1);
      p.turn('head', 0.3, 0.1);
      p.arm('R', 1.95, 0, 0.4, 1.1);
      p.arm('L', 0.1, 0, -0.75, 2.0);
      p.grip(1, 1);
      p.leg('R', 0.35, 0.3, 0.05);
      p.leg('L', -0.25, 0.15, -0.05);
      p.plant();
      // The nightcap pushed back on his head: its rim off his brows, so the angry eyes show.
      for (const hat of man.character.objectsOf('cabeca')) {
        hat.rotation.x += 0.3;
        hat.position.y += 0.015;
      }
      const card: P3 = [0.25, 1.37, 0];
      const cardCam: Cam = { pos: orbit(card, 186, 3, 10.15), target: card, fov: 30 };
      // The balloon up and to the left, over the car, its spike down to his head: he keeps the card's full height.
      const shout = yell(k, 'CHEGA.', k.at(man.character.bones.head, [0.2, 0.14, 0]), cardCam, { capPx: 62, lean: 0.62, tail: 0.3 });
      // The mini: the angry neighbor alone from the belly up (no text at 30 px), cut level: the nightcap, the
      // moustache, the angry brows, the fist.
      const mini: P3 = [-0.7, 1.5, -1.95];
      const miniPos = new THREE.Vector3(...orbit(mini, 194, 8, 2.8));
      const belly = viewCut(miniPos, k.at(man.character.bones.hips, [0, 0.2, 0]));
      cutAt(man, belly);
      return {
        card: {
          ...cardCam,
          before() {
            k.renderer.localClippingEnabled = false;
          },
        },
        mini: {
          pos: miniPos,
          target: mini,
          fov: 30,
          hide: [road.group, asphalt, ...shout],
          before() {
            k.renderer.localClippingEnabled = true;
          },
        },
      };
    },
  },
  {
    id: 'gravidade',
    build(k) {
      // Gravidade 1 x 0 Você: the HERO in a football kit (the name is a score) planted head first in the lawn
      // like a lawn dart, legs up in a V, stars where he hit.
      const kit = dress(
        HERO,
        { id: 'timeEsportivo', cores: ['#e6c23a', '#2e8b4a', '#e8e2d6'] },
        { id: 'shortFutebol', cores: ['#2f5fc9', '#e8e2d6', '#e6c23a'] },
        { id: 'chuteira', cores: ['#1f2226', '#e8e2d6', '#e6c23a'] },
      );
      k.island('grama', 1.85, 1.45, [0, 0, 0], { thick: 0.42 });
      const hero = k.avatar(mood(kit, 'grande', 'arqueada'));
      const p = k.pp(hero);
      p.reset();
      p.body.rotation.x = Math.PI; // upside down about the feet
      hero.root.rotation.y = Math.PI + 0.35; // the flip turned him around: face the camera again, a bit to the side
      p.leg('L', 0.05, 0.15, -0.45);
      p.leg('R', -0.05, 0.25, 0.45);
      p.arm('L', 0.2, 0, -1.35, 0.25);
      p.arm('R', 0.2, 0, 1.35, 0.25);
      p.grip(0.1, 0.1);
      hero.root.position.y = 1.52; // head and neck in the ground (the lawn is 0.42 m thick)
      hero.root.updateMatrixWorld(true);
      // A dizzy ring of stars on the grass around where he went in.
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.3;
        k.stars([Math.cos(a) * 0.62, 0.14 + Math.sin(a * 2) * 0.04, Math.sin(a) * 0.42], { count: 1, spread: 0.02, size: 0.15 });
      }
      const card: P3 = [0, 0.38, 0];
      const mini: P3 = [0, 0.4, 0];
      return {
        card: { pos: orbit(card, 200, 16, 5.3), target: card, fov: 30 },
        mini: { pos: orbit(mini, 160, 16, 5.4), target: mini, fov: 30 },
      };
    },
  },
  {
    id: 'fora-do-mapa',
    build(k) {
      // Off the map: a chunk of the Rua dos Vizinhos adrift in the void (lawn, a strip of sidewalk, a hydrant and
      // a lawn flamingo over its dirt underside), and the HERO who just slipped off its edge, tipped back so he
      // looks up at it, one hand still reaching for the rim.
      const chunk = apart(k);
      const b = chunk.b;
      const top = 2.4;
      b.cylinder(0, top - 1.35, 0, 0.3, 1.35, 'grama', { radiusTop: 1.5, tint: SPOOKY.dirt, collide: false, segments: 9 });
      b.cylinder(0, top - 0.04, 0, 1.52, 0.2, 'grama', { tint: PALETTE.grass, collide: false, segments: 28 });
      b.span(-0.35, top + 0.1, -1.2, 0.45, top + 0.2, 1.2, 'calcada', { tint: PALETTE.sidewalk, collide: false });
      hydrantBody(b, 0.05, top + 0.2, 0.35);
      b.finish();
      const flamingo = new THREE.Mesh(flamingoGeometry(), new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }));
      flamingo.scale.setScalar(0.5);
      flamingo.position.set(0.95, top + 0.16, 0.25);
      flamingo.rotation.y = -2.4; // looking down at the fall (its head is on +X)
      chunk.group.add(flamingo);
      // A smaller chunk, so he is the size that reads: shrunk about the rim his hand reaches for.
      const ISLAND = 0.74;
      const rim = new THREE.Vector3(-1.35, 2.35, -0.45);
      chunk.group.scale.setScalar(ISLAND);
      chunk.group.position.copy(rim).multiplyScalar(1 - ISLAND);

      const hero = k.avatar(mood(HERO, 'grande', 'arqueada'));
      hero.root.position.set(-0.85, 0.45, -0.8);
      // Tumbling away from the edge: the back-tilt below goes into depth, this one shows on screen.
      hero.root.rotation.set(0, 0.15, 0.8);
      k.poses.flail(hero);
      hero.character.body.rotation.x = 0.5; // tipped back: he looks up at the edge he slipped off
      k.pp(hero).turn('head', -0.25, -0.2, 0.1); // less of a chin-up, so the red cap's crown still shows
      const card: P3 = [-0.6, 1.62, 0];
      // The mini: he fills the badge mid-flail, the island shrunk and hung with its rim on his higher hand, small in
      // the corner over it (one die-cut).
      const SMALL = 0.38;
      const bones = hero.character.bones;
      const hand = [k.at(bones.hand_L), k.at(bones.hand_R)].sort((p, q) => q.y - p.y)[0];
      const hung = hand.clone().add(new THREE.Vector3(0, 0.06, 0)).addScaledVector(rim, -SMALL);
      const place = (scale: number, at: THREE.Vector3) => {
        chunk.group.scale.setScalar(scale);
        chunk.group.position.copy(at);
      };
      const island = hung.clone().add(new THREE.Vector3(0, top * SMALL, 0));
      const mini = k.at(bones.chest).lerp(island, 0.1).add(new THREE.Vector3(0, -0.08, 0)).toArray() as P3;
      const cardAt = rim.clone().multiplyScalar(1 - ISLAND);
      return {
        card: { pos: orbit(card, 190, 12, 8.15), target: card, fov: 30, before: () => place(ISLAND, cardAt) },
        mini: { pos: orbit(mini, 192, 8, 5.55), target: mini, fov: 30, before: () => place(SMALL, hung) },
      };
    },
  },
  {
    id: 'amora-mandou-lembrancas',
    async build(k) {
      // Amora sends her regards: the Rua's black Chow Chow, out of her red doghouse, rears up and sinks her teeth
      // into the seat of the HERO's cargo pants as he bolts (the cartoon dog hanging on to the trousers), stars
      // where she bit. Both are turned a little toward the lens: her snarl in three-quarters (side-on her face
      // sinks into the ruff), his surprised face looking back at her.
      const yard = apart(k);
      const HOUSE = 1.2; // the map's is 1.6: smaller here, so the two of them dominate
      const gltf = await gltfLoader(k.renderer).loadAsync('/models/casinha_cachorro.glb');
      // As the map places it (blockoutMap.ts): the model's door faces -Z, turned around to open toward +Z.
      const home = new THREE.Vector3(0.75, 0, -1.0);
      addGltfToMap(gltf, yard.b, { position: home, yaw: Math.PI, scale: HOUSE });
      yard.b.finish();
      const doorZ = home.z + 0.7 * HOUSE;
      const plate = namePlate('Amora', 0.44 * HOUSE, 0.14 * HOUSE);
      plate.position.set(home.x, (0.66 + 0.07) * HOUSE, doorZ + 0.02 * HOUSE + 0.004);
      yard.group.add(plate);
      const lawn = k.island('grama', 3.1, 2.6, [0.1, 0, 0.05], { thick: 0.14 });

      // The HERO bolting toward screen left (a little away from the lens, so his seat shows), the near arm up,
      // looking back at her over his shoulder.
      const hero = k.avatar(mood(HERO, 'grande', 'arqueada'));
      hero.root.position.set(-0.45, 0, 0.85);
      hero.root.rotation.y = Math.PI / 2 - 0.26;
      k.settle(hero, { speed: 7, sprint: true }, 40);
      k.hideBack(hero);
      const hp = k.pp(hero);
      hp.arm('L', 2.7, 0, -0.5, 0.4);
      hp.arm('R', 1.4, 0, 0.3, 0.3);
      hp.grip(0.1, 0.1);
      hp.turn('chest', 0, 0.3);
      hp.turn('head', 0.1, 0.8);
      hero.character.body.rotation.x = -0.12; // leaning into the run
      const ahead = new THREE.Vector3(-Math.sin(hero.root.rotation.y), 0, -Math.cos(hero.root.rotation.y));
      const seat = k.at(hero.character.bones.hips, [0, -0.04, 0]).addScaledVector(ahead, -0.14);

      // Amora reared up on her hind paws, forelegs off the grass, her jaws shut on the seat of his pants.
      const dog = new ChowChow(k.group, k.physics, new THREE.Vector3(), Math.PI / 2 + 0.75, new THREE.Box3(), k.sfx);
      const head = dog['head'] as THREE.Object3D;
      const jaw = dog['jaw'] as THREE.Object3D;
      dog.root.rotation.order = 'YXZ'; // the pitch in her own frame, then her yaw
      dog.root.rotation.x = 0.45;
      head.rotation.set(-0.3, 0.4, 0); // nose down onto the seat, the face turned on to the lens
      // The game's bite opens the jaw with +0.7, which swings it up through the muzzle: opened downward here.
      const BITING = -0.45;
      jaw.rotation.x = BITING;
      snarl(dog);
      k.rest(dog.root, 0);
      const bite = local(head, 0, -0.1, -0.25);
      dog.root.position.add(new THREE.Vector3(seat.x - bite.x, Math.max(0, seat.y - bite.y), seat.z - bite.z));
      dog.root.updateMatrixWorld(true);
      // The stars on his side of the bite, toward the lens and low (clear of her eyes).
      const hit = k.stars(seat.clone().addScaledVector(ahead, 0.12).add(new THREE.Vector3(0, -0.06, 0.22)), { count: 5, spread: 0.2, size: 0.11, dir: [ahead.x, 0.2, ahead.z + 0.6] });

      const face = k.at(head);
      const front = local(head, 0, 0, -1).sub(face).normalize();
      const card: P3 = [0.12, 0.86, 0.3];
      const mini = face.clone().add(new THREE.Vector3(0, -0.06, 0));
      return {
        card: {
          pos: orbit(card, 4, 8, 6.35),
          target: card,
          fov: 30,
          before() {
            jaw.rotation.x = BITING;
          },
        },
        // The mini: her snarling face alone (body and tail hidden), from its own front, the jaws wide: ears, eyes,
        // the red mouth, the fangs and the blue-black tongue.
        mini: {
          pos: mini.clone().addScaledVector(front, 1.75).add(new THREE.Vector3(0, 0.25, 0)),
          target: mini,
          fov: 30,
          hide: [dog['body'] as THREE.Object3D, dog['tail'] as THREE.Object3D, lawn, yard.group, hero.root, hit],
          before() {
            jaw.rotation.x = -1.05;
          },
        },
        rim: 1.2,
      };
    },
  },
]);
