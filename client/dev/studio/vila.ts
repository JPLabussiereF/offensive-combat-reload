// client/dev/studio/vila.ts — the vila domain's album stickers, drawn with the studio core (see core-api.md): the
// Vila Assombrada's props (the grandfather clock, the chapel bell, the grumpy grave ghost, the witch, her cauldron
// and potions, the giant rat, the Scooby box, the shooting gallery, the R.I.P. LAG tombstone) and the HERO's fails.
// Every subject is built from the game's own classes (client/world/halloween.ts, furniture.ts) at sticker scale.
import * as THREE from 'three';
import { RAT } from '@shared/constants';
import type { Avatar } from '../../entities/avatar';
import { mergeColoredParts, toonGradient } from '../../render/materials';
import { fitText } from '../../world/canvasText';
import { potion, table } from '../../world/furniture';
import {
  Bell,
  bullseyeGeometry,
  canvasTexture,
  Cauldron,
  epitaph,
  GiantRat,
  Glow,
  GrandfatherClock,
  GraveGhost,
  KitchenCabinet,
  ScoobyBiscuit,
  SPOOKY,
  TargetRow,
  tombstone,
  Witch,
} from '../../world/halloween';
import { MapBuilder, worldUVs } from '../../world/mapBuilder';
import { surfaceMaterial } from '../../world/surfaces';
import { dress, HERO, mood } from './core/cast';
import type { Kit } from './core/kit';
import { defineDomain } from './core/types';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Props built by a MapBuilder and a Glow of their own, inside a container that moves, turns or scales them as one
 * (the potion's label turned to the camera, a tombstone made bigger): the builder bakes world coordinates, so a
 * container is the only way to place its output afterwards. A THREE.Scene, as the builders want one.
 */
function nested(k: Kit, build: (b: MapBuilder, glow: Glow, scene: THREE.Scene) => void): THREE.Scene {
  const scene = new THREE.Scene();
  const b = new MapBuilder(k.physics, scene);
  const glow = new Glow();
  build(b, glow, scene);
  glow.finish(scene);
  b.finish();
  k.group.add(scene);
  return scene;
}

/** A geometry ready for a map surface's material: world UVs (the texture in meters) and one tint as vertex colors. */
function painted(geo: THREE.BufferGeometry, tint: THREE.ColorRepresentation) {
  worldUVs(geo);
  const c = new THREE.Color(tint);
  const colors = new Float32Array(geo.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** The finished MapBuilder meshes directly under `parent` (to hide a prop's batched case in one shot). */
const staticMeshes = (parent: THREE.Object3D) => parent.children.filter((o) => o.name.startsWith('static:'));

/**
 * Lunge with the right leg down a hole (com-um-pe-na-cova; not a core preset): the right leg goes straight down,
 * the left thigh comes up past level with the shin about upright so its foot stands on the ground in front, and
 * the hips sit wherever that left ankle lands at ground height (`lift`, the left thigh's angle, sets how deep the
 * other leg sinks). The sunk shin and foot are folded to nothing: below the grass line they would only show
 * under the island's edge. After the last animator call.
 */
function lunge(k: Kit, av: Avatar, ground = 0, lift = 2.0) {
  const p = k.pp(av);
  p.reset();
  p.hipsY(-0.6);
  p.leg('R', 0, 0, 0.02);
  p.leg('L', lift, lift - 0.12, -0.04);
  av.root.updateMatrixWorld(true);
  const ankle = p.bones.foot_L.getWorldPosition(new THREE.Vector3()).y;
  p.hipsY(-0.6 + (ground + 0.08 - ankle) / av.root.scale.y);
  p.bones.shin_R.scale.setScalar(0.001);
}

/**
 * A thin island of a map surface (an oval, as k.island makes them) with a rectangular pit through it, and the
 * pit's inside: an ink box drawn from within (BackSide), so its far and side walls and its floor read through the
 * opening as one black hole while none of it shows from outside (com-um-pe-na-cova's open grave). The hole's own
 * walls through the slab take `o.earth` (ink too, for a hole that is black all round).
 */
function pitIsland(k: Kit, w: number, d: number, center: [x: number, z: number], pit: { x0: number; z0: number; x1: number; z1: number }, o: { tint: number; earth: number; thick: number; depth: number }) {
  const shape = new THREE.Shape().absellipse(center[0], center[1], w / 2, d / 2, 0, Math.PI * 2, false, 0);
  shape.holes.push(new THREE.Path().moveTo(pit.x0, pit.z0).lineTo(pit.x1, pit.z0).lineTo(pit.x1, pit.z1).lineTo(pit.x0, pit.z1).closePath());
  // Drawn in (x, z): turned about X, the shape's y becomes world z and the extrusion goes down from y 0.
  const geo = new THREE.ExtrudeGeometry(shape, { depth: o.thick, bevelEnabled: false, curveSegments: 48 }).rotateX(Math.PI / 2);
  geo.computeVertexNormals();
  worldUVs(geo);
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const grass = new THREE.Color(o.tint);
  const earth = new THREE.Color(o.earth);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const inHole = Math.abs(nor.getY(i)) < 0.5 && x > pit.x0 - 0.01 && x < pit.x1 + 0.01 && z > pit.z0 - 0.01 && z < pit.z1 + 0.01;
    (inHole ? earth : grass).toArray(colors, i * 3);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const slab = new THREE.Mesh(geo, surfaceMaterial('grama'));
  const inside = new THREE.Mesh(
    new THREE.BoxGeometry(pit.x1 - pit.x0, o.depth - o.thick, pit.z1 - pit.z0).translate((pit.x0 + pit.x1) / 2, -(o.depth + o.thick) / 2, (pit.z0 + pit.z1) / 2),
    new THREE.MeshBasicMaterial({ color: 0x120e16, side: THREE.BackSide }),
  );
  const g = new THREE.Group();
  g.add(slab, inside);
  k.group.add(g);
  return g;
}

/**
 * Comic hiccup bubbles: flat pale circles with an ink rim and a glint, facing the camera, growing as they rise
 * from `from` along `dir` (saude-hic).
 */
function hiccups(k: Kit, from: THREE.Vector3, dir: THREE.Vector3, sizes: number[]) {
  const g = new THREE.Group();
  g.name = 'vila:soluco';
  const disc = new THREE.CircleGeometry(1, 24);
  const fill = new THREE.MeshBasicMaterial({ color: 0xfff1cf, side: THREE.DoubleSide });
  const ink = new THREE.MeshBasicMaterial({ color: 0x1b1530, side: THREE.DoubleSide });
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  let at = from.clone();
  for (const r of sizes) {
    at = at.clone().addScaledVector(dir, r * 1.6);
    const bubble = new THREE.Group();
    bubble.position.copy(at);
    bubble.userData.facecam = true;
    const rim = new THREE.Mesh(disc, ink);
    rim.scale.setScalar(r * 1.22);
    rim.position.z = -0.004;
    const body = new THREE.Mesh(disc, fill);
    body.scale.setScalar(r);
    const glint = new THREE.Mesh(disc, shine);
    glint.scale.setScalar(r * 0.28);
    glint.position.set(-r * 0.38, r * 0.38, 0.004);
    bubble.add(rim, body, glint);
    g.add(bubble);
    at.addScaledVector(dir, r * 0.6);
  }
  k.group.add(g);
  return g;
}

/**
 * The rat's humanity leaving its body (humanidade-restaurada), the Dark Souls kind the game's sound plays: a little
 * lavender spirit, a round head with the grave ghost's black eyes on a tail that curls down to `from`. Turned to
 * the camera of each shot (facecam): its eyes are on its +Z.
 */
function soul(k: Kit, from: THREE.Vector3, size = 1) {
  const g = new THREE.Group();
  g.name = 'vila:humanidade';
  g.position.copy(from);
  g.scale.setScalar(size);
  g.userData.facecam = true;
  const body = new THREE.MeshToonMaterial({ color: 0xc9a2ff, emissive: 0x2a1f44, gradientMap: toonGradient() });
  const ball = new THREE.SphereGeometry(1, 24, 16);
  const head = new THREE.Mesh(ball, body);
  head.scale.setScalar(0.32);
  head.position.set(0, 1.0, 0);
  g.add(head);
  // The tail, thinning as it curls down to the belly.
  for (let i = 1; i <= 9; i++) {
    const t = i / 9;
    const puff = new THREE.Mesh(ball, body);
    puff.scale.setScalar(0.28 * (1 - t) ** 1.2 + 0.035);
    puff.position.set(0.17 * Math.sin(t * Math.PI * 1.25), 1.0 - t * 0.98, 0);
    g.add(puff);
  }
  const black = new THREE.MeshBasicMaterial({ color: 0x14101e });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8).scale(0.06, 0.09, 0.03), black);
    eye.position.set(s * 0.11, 1.05, 0.29);
    g.add(eye);
  }
  k.group.add(g);
  return g;
}

/**
 * A copy of halloween.ts epitaph() with bigger letters for rip-lag: every line in Nunito 900 and ink, each at its
 * own share of the face's height (the game's caps them at W / 7.5, about 9 cm on the slab: a few pixels on a card).
 */
function bigEpitaph(parent: THREE.Object3D, f: ReturnType<typeof tombstone>, lines: [text: string, share: number][]) {
  const W = 512;
  const H = Math.round((W * f.h) / f.w);
  const tex = canvasTexture(W, H, (g) => {
    g.fillStyle = '#1b1530';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let y = 0;
    for (const [text, share] of lines) {
      const px = H * share * 0.92;
      fitText(g, text, W / 2, y + (H * share) / 2 + px * 0.04, W - 28, (s) => `900 ${s}px Nunito, system-ui, sans-serif`, Math.round(px));
      y += H * share;
    }
  });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.h), new THREE.MeshToonMaterial({ map: tex, transparent: true, alphaTest: 0.35, gradientMap: toonGradient() }));
  plate.position.copy(f.at);
  plate.quaternion.copy(f.tilt);
  parent.add(plate);
  return plate;
}

export default defineDomain('vila', [
  {
    id: 'bate-ponto',
    build(k) {
      // Clocking in: the mansion's grandfather clock at nine sharp, and you beside it in home-office dress (shirt
      // and tie up top, pajama pants and flip-flops below) checking the watch on your left wrist.
      const clock = new GrandfatherClock(k.group, k.builder(), 0, 0, 0, 0, k.props, () => {});
      k.finish();
      const clockCase = staticMeshes(k.group);
      clock.hour = 9;
      clock['setHands'](0); // update() only redraws the hands while they spin
      clock.update(0.5); // the pendulum at the end of its swing (0.18 rad)
      // The game's hands are 2-3 cm wide: hairlines at sticker size. Bolder, the 9 o'clock L reads on the badge.
      clock['hourHand'].scale.set(2.6, 1.15, 1);
      clock['minuteHand'].scale.set(2.8, 1, 1);
      // One plank floor under both, an oval along the line from the clock to him.
      const floor = k.island('madeira', 1.6, 3.85, [0, 0, 0], { tint: SPOOKY.plank, thick: 0.1 });
      floor.position.set(0.95, 0, 1.12);
      floor.rotation.y = Math.atan2(1.9, 2.3);

      const worker = k.avatar(dress(HERO, { id: 'socialCurta', cores: ['#e8e2d6'] }, { id: 'gravata', cores: ['#c0392f'] }, 'pijama', 'chinelo', 'relogio'));
      // Beside the clock (screen right) and well in front of it: nearer the camera he is bigger, and the two make a
      // wide picture instead of one tall column.
      worker.root.position.set(1.9, 0, 2.3);
      // Toward the camera (on +Z) in 3/4, turned toward the clock on his right: his left side to the camera.
      worker.root.rotation.y = Math.PI - 0.75;
      worker.idle(false, 0);
      const p = k.pp(worker);
      // Checking the watch: the left forearm raised a little above level and held out ahead of his chest, toward
      // the clock, so the wrist shows against the backing rather than the shirt; the head turned down to it, the
      // face still under the brim.
      p.arm('L', 0.8, -0.4, -0.2, 1.12);
      p.turn('neck', -0.06, 0.1);
      p.turn('head', -0.1, 0.18);
      // A bigger watch face than the catalog's, so the gesture has its object.
      worker.root.updateMatrixWorld(true);
      const wrist = worker.character.sockets.wrist_L;
      const dial = new THREE.Group();
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.032, 20), new THREE.MeshBasicMaterial({ color: 0xfff8ec }));
      const bezel = new THREE.Mesh(new THREE.CircleGeometry(0.042, 20), new THREE.MeshBasicMaterial({ color: 0x1b1530 }));
      bezel.position.z = -0.002;
      dial.add(bezel, face);
      dial.userData.facecam = true;
      wrist.add(dial);

      // The badge: the hood alone (the dial in its dark wood square under its cap), not the case below it, which
      // would run off the badge. A copy of the hood's pieces stands in for the batched case there.
      const hood = new THREE.Mesh(
        mergeColoredParts([
          { geo: new THREE.BoxGeometry(0.8, 0.8, 0.5), color: SPOOKY.woodDark, pos: [0, 2.2, 0] },
          { geo: new THREE.BoxGeometry(0.9, 0.12, 0.56), color: 0x2a1a12, pos: [0, 2.66, 0] },
        ]),
        new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }),
      );
      k.group.add(hood);
      // The pendulum and the glass in front of it (the clock's own group holds the dial, hands, pendulum, glass).
      const pendulum: THREE.Group = clock['pendulum'];
      const glass = pendulum.parent!.children.filter((o) => (o as THREE.Mesh).material instanceof THREE.MeshBasicMaterial);
      const inside: THREE.Object3D[] = [pendulum, ...glass];
      return {
        card: { pos: [1.57, 1.46, 8.85], target: [0.98, 1.22, 1.0], fov: 32, hide: [hood] },
        mini: { pos: [0, 2.27, 2.33], target: [0, 2.27, 0.25], fov: 30, hide: [...clockCase, ...inside, worker.root, floor] },
      };
    },
  },
  {
    id: 'com-um-pe-na-cova',
    build(k) {
      // One foot in the grave, literally: you, nearly dead, still firing your pistol one-handed with your right
      // leg sunk to the groin in an open grave. The grave runs away from the camera through a thin island of the
      // cemetery's dark grass, ink-black inside, walls too; your right thigh drops in at its near end, so the grass
      // line swallows it with the black round it, and the left foot is planted on the grass beside it. The cross
      // stands at the grave's far end, behind your back shoulder, a little dug-up earth beside it.
      const ink = 0x15101a;
      const pit = { x0: -0.22, z0: -0.21, x1: 0.42, z1: 0.69 };
      const ground = pitIsland(k, 1.55, 1.62, [0.04, 0.26], pit, { tint: SPOOKY.grassDark, earth: ink, thick: 0.08, depth: 0.2 });
      const mound = new THREE.Mesh(painted(new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.2, 0.12, 0.13), SPOOKY.dirt), surfaceMaterial('grama'));
      mound.position.set(0.36, -0.02, 0.84);
      ground.add(mound);
      // The cross smaller than the cemetery's, so it stays behind his shoulder instead of towering over him.
      const cross = nested(k, (b) => tombstone(b, 0, 0, Math.PI, 'cruz', () => 0.5, SPOOKY.moss));
      cross.position.set(0.12, 0, 0.82);
      cross.scale.setScalar(0.6);

      const hero = k.avatar(mood(HERO, 'marcante', 'grossa'), 'm', { armed: true });
      // His right side to the camera, facing screen right: the gun arm in front. His right hip (about 0.09 m to
      // his right) lands over the grave's near end, a little right of its middle.
      hero.root.rotation.y = 0.9;
      const aim = { secondary: true, hold: 'pistola' as const };
      k.settle(hero, aim, 40);
      hero.fire();
      k.settle(hero, aim, 1);
      k.hideBack(hero);
      lunge(k, hero, 0, 2.3); // the left knee high, so the hips sink nearly to the grass
      const p = k.pp(hero);
      p.turn('spine', -0.3);
      p.turn('head', 0.15);
      p.arm('R', 1.66, 0, 0.05, 0.05); // the pistol at arm's length toward screen right, a little down
      p.arm('L', -0.35, 0, -0.45, 0.4);
      p.grip(0.5, 1);
      const flash = k.muzzleFlash(hero, { size: 0.36 });
      // Nearly dead: a bandage round the gun arm's forearm (the album's icon for this sticker is a band-aid).
      const elbow = k.at(p.bones.forearm_R);
      const wrist = k.at(p.bones.hand_R);
      const bandage = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.12, 14), new THREE.MeshToonMaterial({ color: 0xf4efe4, gradientMap: toonGradient() }));
      bandage.position.lerpVectors(elbow, wrist, 0.45);
      bandage.quaternion.setFromUnitVectors(V(0, 1, 0), wrist.clone().sub(elbow).normalize());
      k.group.add(bandage);
      p.bones.forearm_R.attach(bandage);

      // The badge, its own tighter shot: a smaller island with only a slot round his thigh, the cross brought up
      // behind his back shoulder, the gun swung a little toward the camera and its flash smaller, so the square
      // holds a red cap, a cross and a black slot.
      const patch = pitIsland(k, 1.15, 0.8, [-0.1, -0.01], { x0: -0.22, z0: -0.21, x1: 0.3, z1: 0.2 }, { tint: SPOOKY.grass, earth: ink, thick: 0.05, depth: 0.2 });
      return {
        card: { pos: [0.28, 1.72, -3.42], target: [-0.22, 0.36, 0.1], fov: 30, hide: [patch] },
        mini: {
          pos: [0.235, 1.793, -2.8],
          target: [-0.16, 0.435, 0],
          fov: 30,
          hide: [ground],
          before() {
            cross.position.set(0.22, 0, 0.3);
            cross.scale.setScalar(0.58);
            p.arm('R', 2.15, 0, 0.45, 0.05); // swung toward the camera and up, so the flash stays in the square
            flash.scale.setScalar(0.75);
          },
        },
      };
    },
  },
  {
    id: 'scooby-dooby-doo',
    build(k) {
      // The box of Scooby Snacks the Vila's kitchen cabinet hides, big enough for its label to read. The cabinet
      // around it (2.1 m tall) would shrink SCOOBY SNACKS to a smudge, and a crop of it would run off the card: it is
      // built hidden, only to seat the box, and its shelf comes back as a board.
      let cab!: KitchenCabinet;
      nested(k, (b, _glow, scene) => (cab = new KitchenCabinet(scene, b, V(0, 0, 0), 0, k.props, () => {}))).visible = false;
      const snack = new ScoobyBiscuit(k.group, 'biscoito', V(0, 0, 0), cab);
      const box: THREE.Group = snack['box'];
      box.position.set(-0.08, 0, 0);
      box.rotation.set(0, 0.34, 0);
      // Its two bone biscuits (the box's first children), apart: one flat in front, one leaning on its side.
      const [lying, leaning] = box.children;
      lying.position.set(0.04, 0.03, 0.2);
      lying.rotation.set(-Math.PI / 2, 0, 0.35);
      leaning.position.set(0.26, 0.1, 0.0);
      leaning.rotation.set(0, 0, 1.05);
      const shelf = k.island('madeira', 0.62, 0.32, [0.04, 0, 0.04], { tint: 0x8a6a4a, thick: 0.045, shape: 'box' });
      // The badge: one bone biscuit alone, upright and diagonal to the camera (the sticker's 🦴), not the box again.
      const [, , boxBody, label] = box.children;
      const bone = V(0, 0, 0);
      const boneCam = V(0, 0, 0);
      return {
        card: { pos: [0.17, 0.38, 1.33], target: [0.01, 0.15, 0.03], fov: 30 },
        mini: {
          pos: boneCam,
          target: bone,
          fov: 30,
          hide: [shelf, leaning, boxBody, label],
          before() {
            lying.position.set(0.04, 0.2, 0.2);
            lying.rotation.set(0.35, 0, 0.62);
            box.updateMatrixWorld(true);
            lying.getWorldPosition(bone);
            boneCam.copy(bone).add(V(0.02, 0.17, 0.5));
          },
        },
      };
    },
  },
  {
    id: 'humanidade-restaurada',
    build(k) {
      // The giant sewer rat flipped on its back, pink feet in the air, its pale humanity rising from its belly as
      // a wisp (the column kill() releases, made bigger so it reads).
      const rat = new GiantRat(k.group, k.builder(), 'rato', V(0, 0, 0), 0, RAT.hits, RAT.stab, () => {}, k.puffs, k.mute);
      k.finish();
      const g: THREE.Group = rat['group'];
      // Belly up (rolled about its length), side-on to the camera with the head to screen right, turned a little
      // toward the camera so both eyes and the teeth show.
      g.rotation.set(0, 1.25, Math.PI);
      // Cartoon X eyes for dead instead of its glowing red ones (children: body, eyes, tail), big enough to read.
      g.children[1].visible = false;
      const ink = new THREE.MeshBasicMaterial({ color: 0x1b1530 });
      const bar = new THREE.BoxGeometry(0.42, 0.1, 0.03);
      for (const s of [-1, 1]) {
        const eye = V(s * 0.2, 1.12, 1.74);
        const n = eye.clone().sub(V(0, 1.0, 1.25)).normalize();
        const mark = new THREE.Group();
        mark.position.copy(eye).addScaledVector(n, 0.03);
        mark.quaternion.setFromUnitVectors(V(0, 0, 1), n);
        for (const r of [Math.PI / 4, -Math.PI / 4]) {
          const m = new THREE.Mesh(bar, ink);
          m.rotation.z = r;
          mark.add(m);
        }
        g.add(mark);
      }
      // Its long tail swung round toward the camera instead of trailing off the card.
      const tail: THREE.Group = rat['tail'];
      tail.rotation.y = 1.1;
      k.rest(g, 0);
      g.updateMatrixWorld(true);
      // Its humanity rising from the belly: a little lavender spirit (the HUD's humanity color) on a wavy tail.
      const belly = g.localToWorld(V(0, 0.25, 0.1));
      const spirit = soul(k, belly, 1.5);
      // The badge: the head from the front in 3/4, close, upside down with its X eyes and buck teeth, the front
      // paws up; the long body hides behind the head (a side view is a long brown bar at 30 px), the tail with it.
      // The spirit, smaller, rises from the chest right behind the head, so the square holds the face.
      const snout = g.localToWorld(V(0, 0.94, 2.15));
      const along = snout.clone().sub(g.localToWorld(V(0, 0.94, 0))).setY(0).normalize();
      const front = along.clone().applyAxisAngle(V(0, 1, 0), -0.3).multiplyScalar(5.0).add(V(0, 1.3, 0));
      const head = g.localToWorld(V(0, 0.9, 1.3));
      const chest = g.localToWorld(V(0, 0.3, 0.9));
      return {
        card: { pos: [6.4, 3.95, 7.9], target: [0.2, 1.78, 0.25], fov: 32 },
        mini: {
          pos: snout.clone().add(front),
          target: head.clone().add(V(0.16, 0.46, -0.1)),
          fov: 32,
          hide: [tail],
          before() {
            spirit.position.copy(chest);
            spirit.scale.setScalar(0.8);
          },
        },
      };
    },
  },
  {
    id: 'saude-hic',
    build(k) {
      // You, drunk on the witch's potion: staggering in an S (hips one way, back the other), legs crossed at the
      // shins with the knees giving way, the amber 'bebado' bottle raised high in a toast (its label to the
      // camera), the other arm out for balance, a red nose, hiccup bubbles floating up beside the head.
      const hero = k.avatar(mood(HERO, 'caido', 'fina'));
      hero.idle(false, 0);
      const p = k.pp(hero);
      // The hips pushed to screen right (his left, -X); the legs slant back so the feet stay under him.
      p.bones.hips.position.x -= 0.07;
      // Crossed at the shins, knees bent: the left shin in front, slanting over to his right, the right one behind
      // slanting to his left, the shoes apart so both show; toes in (the leg helper only pitches the feet).
      p.leg('L', 0.24, 0.3, 0.14);
      p.turn('shin_L', -0.3, 0, 0.42);
      p.turn('foot_L', 0.3 * 0.35 - 0.24 * 0.2, 0.45, -0.3);
      p.leg('R', -0.1, 0.3, 0.06);
      p.turn('shin_R', -0.3, 0, -0.38);
      p.turn('foot_R', 0.3 * 0.35 + 0.1 * 0.2, -0.3, 0.3);
      p.turn('hips', 0, -0.08, 0);
      // The back and chest leaning the other way, toward screen left.
      p.turn('spine', 0.06, 0.05, -0.2);
      p.turn('chest', 0.04, 0.05, -0.14);
      p.arm('R', 0.3, 0, 2.62, 0.3); // the toast, up and out toward screen left (45 degrees, the lean included)
      p.arm('L', 0.3, 0, -1.4, 0.55); // the other arm out for balance
      p.grip(0.3, 0.9);
      p.turn('neck', 0, 0, 0.1);
      p.turn('head', 0.08, 0.2, 0.3);
      hero.root.rotation.z = 0.04;
      k.rest(hero, 0);
      const ground = k.island('grama', 1.3, 0.75, [0.05, 0, 0.05], { tint: SPOOKY.grassDark, thick: 0.12 });
      const head = hero.character.bones.head;
      // The drunk's red nose, on the head bone (it rests unrotated: -Z is the face's front).
      const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshToonMaterial({ color: 0xe0443a, gradientMap: toonGradient() }));
      nose.position.set(0, 0.075, -0.118);
      head.add(nose);
      hero.root.updateMatrixWorld(true);
      const hand = k.at(hero.character.sockets.hand_R);
      const bottle = nested(k, (b, glow) => potion(b, glow, 0, 0, 0, 1, 0xe0a83a, 1.8));
      bottle.rotation.y = Math.PI; // the label (+Z in potion()) to the camera on -Z
      bottle.position.copy(hand).add(V(0, -0.22, 0));
      // From beside the mouth, on the side away from the bottle (screen right is world -X), rising: clear of the
      // ×N corner, which starts about two thirds across the card.
      const mouth = k.at(head, [-0.16, 0.1, -0.06]);
      const hic = hiccups(k, mouth, V(-0.3, 1, 0).normalize(), [0.055, 0.08, 0.11]);
      // The badge: a bust, the bottle beside the face (the thighs folded to nothing take the legs away), smaller
      // bubbles rising past the cap on the other side; the camera aimed at the posed head (the core reads the
      // shot then).
      const hicBadge = hiccups(k, k.at(head, [-0.15, 0.04, -0.06]), V(-1, 0.5, 0).normalize(), [0.036, 0.047, 0.058]);
      const miniPos = V(0, 0, 0);
      const miniTarget = V(0, 0, 0);
      return {
        card: { pos: [0.5, 1.4, -6.05], target: [0.03, 1.07, 0], fov: 30, hide: [hicBadge] },
        mini: {
          pos: miniPos,
          target: miniTarget,
          fov: 30,
          hide: [ground, hic],
          before() {
            p.arm('R', 0.55, 0.3, 0.75, 2.3); // the bottle down by the cheek
            p.arm('L', 0.35, 0, -0.25, 1.9); // the other hand on his belly
            // A short bust: the legs folded to nothing and the lower back squashed (the chest, straight on it, is
            // scaled back to size), so the head is a big share of the badge.
            const bones = hero.character.bones;
            for (const t of ['thigh_L', 'thigh_R']) bones[t].scale.setScalar(0.001);
            p.turn('chest');
            bones.spine.scale.set(1, 0.05, 1);
            bones.chest.scale.set(1, 20, 1);
            hero.root.updateMatrixWorld(true);
            bottle.position.copy(k.at(hero.character.sockets.hand_R)).add(V(0, -0.22, 0));
            const h = k.at(head, [0.02, 0.05, 0]);
            miniPos.copy(h).add(V(0.18, 0.1, -2.15));
            miniTarget.copy(h).add(V(-0.08, -0.14, 0));
          },
        },
      };
    },
  },
  {
    id: 'provador-da-bruxa',
    build(k) {
      // The witch behind her worktable with the five potions you have to drink lined up like a tasting flight,
      // in their HUD colors: duck yellow, haste cyan, sluggish brown, critical red, drunk amber.
      const b = k.builder();
      // Forward to the table's back edge and a little to her right, so her ladle reaches over the cyan flask.
      const witch = new Witch(k.group, b, V(-0.36, 0, 0.31), 0, k.props, k.mute);
      // The table in a builder of its own, so the badge can leave it out.
      const desk = nested(k, (tb) => table(tb, 0, 0, 1.3, 2.05, 0.7, 0, 0.8, 0x4a3020));
      // Three tall labelled bottles and two round flasks (the sluggish brown one tall too: as the cabin's thin vial
      // it was a stick at album size).
      const flight: [number, 0 | 1 | 2][] = [
        [0xffd23f, 1],
        [0x6fe3ff, 0],
        [0xb08a5e, 1],
        [0xff5a4f, 0],
        [0xe0a83a, 1],
      ];
      // Bigger than the cabin's (scale 2.5): they are the subject, filling the lower third in front of her robe.
      flight.forEach(([color, kind], i) => potion(b, k.glow, -0.8 + i * 0.4, 0.8, 1.45, kind, color, 2.5));
      k.finish();
      const cam = V(0.755, 1.6, 7.16);
      k.step(45, (dt) => witch.update(dt, cam)); // she turns her head to the camera
      // Her ladle lifted out of the stirring, its bowl just over the cyan flask's cork, below her chin.
      witch['arm'].rotation.set(-0.33, 0, 0);
      const crone: THREE.Group = witch['root'];
      return {
        card: { pos: cam, target: [-0.02, 1.165, 0.8], fov: 32 },
        // The badge: the five bottles alone, a row of the potions' colors.
        mini: { pos: [0, 1.5, 5.6], target: [0, 1.12, 1.45], fov: 30, hide: [crone, desk] },
      };
    },
  },
  {
    id: 'eu-ja-ouvi',
    build(k) {
      // The chapel bell rung five times in eight seconds, swung out toward the camera's side and seen across the swing
      // from below its lip: the dome, the flared lip and the dark mouth with its clapper make it a bell (seen into the
      // mouth it was a megaphone, side-on a pennant), answering with the map's own line.
      const b = k.builder();
      const pivot = 2.0;
      const size = 1.6; // the chapel's is 1.1: bigger, it carries the picture
      const bell = new Bell(k.group, b, V(0, pivot, 0), size, k.props, 'sinocapela', () => {});
      // A stub of its headstock beam over the yoke (a whole beam would be wider than the bell).
      b.box(0, pivot + 0.17, 0, 0.75, 0.22, 0.3, 'madeira', { tint: SPOOKY.woodDark, collide: false });
      k.finish();
      // The inside dark: a slightly smaller copy of the bronze shell, seen only from within (the lathe's profile runs
      // downward, so its front faces look in), in front of the shell's own lit inner faces.
      const swing: THREE.Group = bell['pivot'];
      const [shell, clapper] = swing.children as THREE.Mesh[];
      const inside = new THREE.Mesh(shell.geometry.clone().scale(0.96, 0.99, 0.96), new THREE.MeshBasicMaterial({ color: 0x2a170b }));
      swing.add(inside);
      // A lighter clapper, so the ball reads against the dark inside.
      clapper.material = new THREE.MeshToonMaterial({ color: 0x8a7a6a, gradientMap: toonGradient() });
      // Swung toward +Z, its mouth tipped up toward the camera's side.
      bell['angle'] = -0.65;
      bell.update(0);
      const line = k.bubble('EU JÁ\nOUVI.', [0.7, pivot - 0.38, -0.75]);
      line.material.depthTest = false; // over the beam's stub, which is nearer the camera
      const beam = staticMeshes(k.group);
      return {
        card: { pos: [5.4, 1.12, 2.88], target: [0.336, 1.84, -0.16], fov: 30 },
        // The badge: the bell alone, the classic bell icon (dome, flared lip, dark mouth, the clapper), seen from
        // below and in front of its mouth.
        mini: {
          pos: [2.47, 0.54, 2.61],
          target: [-0.1, 1.45, 0.36],
          fov: 30,
          hide: [line, ...beam],
          before() {
            bell['angle'] = -0.5;
            bell.update(0);
          },
        },
        rim: 1.2,
      };
    },
  },
  {
    id: 'mudou-pro-mausoleu',
    build(k) {
      // The grave ghost woken for the twelfth time: fed up, he floats off with his suitcase ('Cansei. Vou me mudar
      // pro mausoléu.', his twelfth line, cut to its first word), leaving his headstone and his dug-up mound. The
      // stone stands right behind his trailing half, so the white sheet reads against grey there and gets the
      // die-cut's ink line everywhere else (white against the cream fill, it melted away).
      const b = k.builder();
      const ghost = new GraveGhost(k.group, b, k.props, V(0.1, 0, -0.1), 0, k.puffs, k.mute);
      // His headstone, bigger than the cemetery's so it rises behind his shoulder (a container of its own).
      const stone = nested(k, (sb, _glow, scene) => epitaph(scene, tombstone(sb, 0, 0, 0, 'arco', () => 0.5), ['AQUI JAZ', 'UM FANTASMA', 'COM SONO']));
      stone.position.set(0.3, 0, -0.75);
      stone.scale.setScalar(1.35);
      // The shovel stuck in his dug-up mound.
      b.box(0.55, 0.55, 0.45, 0.06, 1.0, 0.25, 'metal', { tint: 0x5a5a60, collide: false, rot: new THREE.Euler(0, 0.3, -0.28) });
      k.finish();
      const grave = [...staticMeshes(k.group), stone];
      ghost.activations = 11; // the twelfth wake picks GHOST_LINES[2][3]
      k.props.remote('fantasma', V(-3, 1.5, 4));
      k.step(60, (dt) => ghost.update(dt), (dt) => k.puffs.update(dt));
      ghost['bubble'].sprite.visible = false;
      const root: THREE.Group = ghost['root'];
      const body: THREE.Group = ghost['body'];
      root.position.set(-0.55, 0, 0.3);
      body.position.y = 0.5;
      body.rotation.z = 0.18;
      // His suitcase, big enough to read, hanging from the trailing hand at his hip, the handle in the hand.
      const caseGeo = mergeColoredParts([
        { geo: new THREE.BoxGeometry(0.65, 0.47, 0.2), color: 0x7a4a2a, pos: [0, 0, 0] },
        { geo: new THREE.BoxGeometry(0.66, 0.05, 0.21), color: 0x4a2a1a, pos: [0, 0.11, 0] },
        { geo: new THREE.BoxGeometry(0.05, 0.47, 0.21), color: 0x4a2a1a, pos: [-0.2, 0, 0] },
        { geo: new THREE.BoxGeometry(0.05, 0.47, 0.21), color: 0x4a2a1a, pos: [0.2, 0, 0] },
        { geo: new THREE.TorusGeometry(0.08, 0.02, 6, 12, Math.PI), color: 0x2a1a12, pos: [0, 0.235, 0] },
      ]);
      const suitcase = new THREE.Mesh(caseGeo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }));
      suitcase.position.set(0.74, 0.44, 0.06);
      suitcase.rotation.z = -0.18; // hanging plumb while the sheet leans
      body.add(suitcase);
      // Beside his face (he heads to screen left), its tail on the corner of his head.
      const line = k.bubble('CANSEI.', [-1.14, 1.74, 0.6]);
      return {
        card: { pos: [0.42, 2.12, 7.45], target: [-0.5, 1.3, -0.1], fov: 32 },
        // The badge: the ghost and his suitcase alone.
        mini: { pos: [-1.22, 1.6, 4.6], target: [-0.46, 1.22, 0.3], fov: 30, hide: [line, ...grave] },
        rim: 1.2,
      };
    },
  },
  {
    id: 'patinhos-em-fila',
    build(k) {
      // Ducks in a row: the witch's cauldron bubbling green, and the three rubber ducks it spat out (one every
      // fifth stir) marching away from it in single file.
      const pot = new Cauldron(k.group, k.builder(), V(0, 0, 0), k.props, k.puffs, { x0: -2.5, x1: 2.5, z0: -2.5, z1: 2.5 }, k.mute);
      k.finish();
      // The pot, its brew and its steam (hidden on the badge, which shows the ducks alone).
      const brew = k.group.children.filter((o) => (o as THREE.Mesh).material === pot['liquid']);
      const potParts: THREE.Object3D[] = [...staticMeshes(k.group), ...brew, k.puffs['mesh']];
      for (let i = 0; i < 15; i++) k.props.remote('caldeirao'); // three ducks, and the brew's target is POTION[0], green
      pot.update(1);
      k.step(55, (dt) => pot.update(dt), (dt) => k.puffs.update(dt)); // steam about a metre high
      const ducks: { mesh: THREE.Mesh }[] = pot['ducks'];
      ducks.forEach((d, i) => {
        d.mesh.position.set(0.9 + i * 0.66, 0, 0.82 - i * 0.14);
        d.mesh.rotation.set(0, Math.PI / 2 - 0.22, 0);
        d.mesh.scale.setScalar(1.45);
      });
      return {
        card: { pos: [2.03, 2.98, 5.4], target: [1.05, 1.05, 0.35], fov: 32 },
        // The badge: down the line from the leading duck, the three overlapping in depth.
        mini: { pos: [4.4, 1.14, 2.5], target: [1.62, 0.24, 0.58], fov: 30, hide: potParts },
      };
    },
  },
  {
    id: 'mosca-no-alvo',
    build(k) {
      // The haunted park's shooting gallery knocked down in one sweep: the first target already flat, the next one
      // falling in a burst of stars, the last still standing. Seen in 3/4 from the shooter's right, so the tilts
      // read in profile down the row: the flat one nearest (it hides nothing), the one still up farthest, at the
      // upper left (clear of the ×N corner). The targets (bigger than the park's) stand on short poles along the
      // gallery's counter (its red-brown wood), the booth's bulbs lit along the counter's front edge like marquee
      // lights (a string of them overhead would cross the ×N corner).
      const counter = k.island('madeira', 1.6, 0.5, [0, 0, 0.05], { tint: 0x8a3a2a, thick: 0.16, shape: 'box' });
      const bulbs = Array.from({ length: 6 }, (_, i) => V(-0.65 + i * 0.26, -0.08, 0.31));
      // Short poles and close together: the discs overlap down the row instead of framing a panel of sky.
      const row = new TargetRow(k.group, k.builder(), k.props, [V(-0.5, 0.14, 0), V(0, 0.14, 0), V(0.5, 0.14, 0)], () => {}, () => {}, bulbs);
      k.finish();
      const poles = staticMeshes(k.group);
      row.update(0);
      k.props.remote('alvo:2');
      row.update(0.3); // flat
      k.props.remote('alvo:1');
      row.update(0.05); // mid-fall, about 55 degrees back
      // Lit bulbs (the game's idle color is a dim amber that reads as unlit by day).
      const lamps = row['bulbs']!;
      for (let i = 0; i < lamps.count; i++) lamps.setColorAt(i, new THREE.Color(0xffd27a));
      lamps.instanceColor!.needsUpdate = true;
      const targets: { pivot: THREE.Group }[] = row['targets'];
      for (const t of targets) t.pivot.scale.setScalar(1.4);
      // The one still standing turned a little toward the key light (in the toon shadow band it went grey).
      targets[0].pivot.rotation.y = 0.26;
      const falling = targets[1].pivot;
      falling.updateMatrixWorld(true);
      // The hit: a small burst off the falling bullseye's top edge, clear of its face.
      k.stars(falling.localToWorld(V(-0.05, 0.54, 0.02)), { count: 6, spread: 0.24, size: 0.13, dir: [-0.45, 1, 0.3] });
      return {
        card: { pos: [2.35, 1.5, 2.52], target: [0.1, 0.22, -0.09], fov: 30 },
        mini: { pos: [0.17, 2.0, 1.6], target: [-0.03, 0.63, -0.2], fov: 30, hide: [counter, lamps, ...poles, targets[0].pivot, targets[2].pivot] },
      };
    },
  },
  {
    id: 'saco-de-pancada',
    build(k) {
      // Everybody's target: you, a shooting-gallery bullseye strapped to your chest, knocked off balance by hits
      // from every side (small bursts at your head, chest and leg) and seeing stars. Unarmed: a rifle across the
      // chest would cover the bullseye.
      const hero = k.avatar(mood(HERO, 'caido', 'fina'));
      // Knocked sideways (a diagonal: tiro-no-pe, on the same page, is an upright HERO), toward his left (screen
      // right), by hits from screen left.
      // The flail twists the torso 0.4 rad to his left: the root turned the other way puts the chest to the camera.
      hero.root.rotation.set(0, -0.25, 0.3);
      k.poses.flail(hero);
      const p = k.pp(hero);
      p.body.rotation.x = 0.1; // and back
      p.turn('head', -0.3, -0.15, 0.22); // dazed, tilted, but the face to the camera (the flail leans him back)
      k.rest(hero, 0);
      hero.root.updateMatrixWorld(true);
      // The bullseye on the chest bone (the bones rest unrotated, so its -Z is the chest's front), on the sternum
      // below the collar, clear of the chin.
      const chest = hero.character.bones.chest;
      const target = new THREE.Mesh(bullseyeGeometry(false).translate(0, -0.32, 0), new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }));
      target.position.set(0, -0.05, -0.17);
      target.rotation.y = Math.PI;
      target.scale.setScalar(0.85);
      chest.add(target);
      hero.root.updateMatrixWorld(true);
      const head = hero.character.bones.head;
      const top = k.at(head, [0, 0.28, 0]);
      // Hits at the edges of the body, clear of the bullseye and the face (the head has its ring of stars).
      const hits = [
        k.stars(k.at(head, [0.26, -0.04, -0.06]), { count: 3, spread: 0.15, size: 0.11, dir: [1, 0.3, 0] }),
        k.stars(k.at(target, [0.32, -0.06, 0]), { count: 3, spread: 0.16, size: 0.12, dir: [1, 0.1, 0] }),
        k.stars(k.at(hero.character.bones.shin_R, [0.15, 0.1, -0.05]), { count: 3, spread: 0.15, size: 0.11, dir: [1, -0.2, 0] }),
      ];
      // Seeing stars: a ring of small ones over his head (one group, so the badge can move it with the head).
      const ring = new THREE.Group();
      k.group.add(ring);
      ring.position.copy(top);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        ring.add(k.stars([Math.cos(a) * 0.3, Math.sin(a * 2) * 0.03, Math.sin(a) * 0.1], { count: 1, spread: 0.001, size: 0.075 }));
      }
      // The badge: his dazed face under the ring of stars, a bust without the bullseye (mosca-no-alvo's badge is
      // one). Posed in its before(): the torso straight, the head lolling, the arms limp, and the thighs folded to
      // nothing so the legs go away; the camera is aimed at the posed head (the core reads the shot then).
      const facing = V(-Math.sin(-0.25), 0, -Math.cos(-0.25));
      const miniPos = V(0, 0, 0);
      const miniTarget = V(0, 0, 0);
      return {
        card: { pos: [-0.05, 1.36, -5.15], target: [-0.45, 1.06, 0.1], fov: 30 },
        mini: {
          pos: miniPos,
          target: miniTarget,
          fov: 30,
          hide: [...hits, target],
          before() {
            hero.root.rotation.z = 0;
            p.body.rotation.x = 0;
            p.turn('hips');
            p.turn('spine', 0.05);
            p.turn('chest');
            p.turn('neck', 0, 0, 0.1);
            p.turn('head', -0.1, 0, 0.32);
            p.arm('L', 0.15, 0, -0.12, 0.35);
            p.arm('R', 0.15, 0, 0.12, 0.35);
            for (const t of ['thigh_L', 'thigh_R']) hero.character.bones[t].scale.setScalar(0.001);
            hero.root.updateMatrixWorld(true);
            const h = k.at(head);
            ring.position.copy(h).add(V(0, 0.3, 0));
            // About 25 degrees above the head, so the ring of stars is an ellipse round the cap.
            miniPos.copy(h).addScaledVector(facing, 2.7).add(V(0, 1.2, 0));
            miniTarget.copy(h).add(V(0, -0.2, 0));
          },
        },
      };
    },
  },
  {
    id: 'rip-lag',
    build(k) {
      // Died of lag: the cemetery's slab grave engraved R.I.P. LAG, big in front, and you in your gaming headset
      // frozen in a T-pose behind it, sunk to the knees in its ledger stone (the lag glitch).
      const scale = 1.85;
      const stone = nested(k, (b, _glow, scene) => {
        const face = tombstone(b, 0, 0, 0, 'laje', () => 0.5);
        bigEpitaph(scene, face, [
          ['R.I.P.', 0.45],
          ['LAG', 0.55],
        ]);
      });
      stone.scale.setScalar(scale);
      const ledger = 0.28 * scale; // the ledger slab's top
      const gamer = k.avatar(dress(HERO, 'headset', 'moletomOversized', 'calcaMoletom', 'slipOn'));
      k.pp(gamer).reset(); // the rig's rest pose is the T-pose
      // Toward the ledger's right edge, so his knee-deep cut shows beside the headstone.
      gamer.root.position.set(0.68, ledger - 0.55, -1.25);
      gamer.root.rotation.set(0, Math.PI, 0.08);
      // The badge has no headstone (it would spell the secret): a block of the ledger around his knees instead,
      // deep enough to swallow his shins and shoes.
      const slab = k.island('pedra', 0.95, 0.6, [0.68, ledger, -1.25], { tint: SPOOKY.stone, thick: 0.64, shape: 'box' });
      return {
        card: { pos: [1.38, 2.08, 4.13], target: [0.25, 0.72, -0.45], fov: 34, hide: [slab] },
        mini: { pos: [0.68, 1.38, 3.85], target: [0.68, 0.86, -1.25], fov: 30, hide: [stone] },
      };
    },
  },
]);
