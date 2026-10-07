// Sticker studio, the zumbi domain: the album art of the Zumbi page (and Vexames' beijando-o-chao), drawn with
// the zumbi mode's own pieces: the zombies as the game builds them (zombies/looks.ts), the bosses with their
// props, the Mystery Coffin, the barricades and the downed marker. See core/types.ts for the contract and the
// kit (core/kit.ts) for the helpers.
//
// CharacterAnimator.zombie tips the torso back where its comments mean a hunch (an open question in the game,
// left as is): every standing zombie here gets its lean set again with k.pp after its last animator call.
import * as THREE from 'three';
import { gunStats } from '@shared/arsenal';
import type { ZKind } from '@shared/zombies';
import type { Avatar } from '../../entities/avatar';
import { toon, toonGradient } from '../../render/materials';
import { SPOOKY } from '../../world/halloween';
import { BarricadeView } from '../../zombies/barricades';
import { crossTexture } from '../../zombies/client';
import { Coffin } from '../../zombies/coffin';
import { dress, HERO, neighbor } from './core/cast';
import type { Kit } from './core/kit';
import { defineDomain } from './core/types';

/** The churchyard's grass (cemetery.ts: the decal inside the wall), for the ground islands. */
const CHURCHYARD = 0x5e5e40;
/** The die-cut's ink (core/dieCut.ts), for studio-made rims. */
const INK = 0x1b1530;
const UP = new THREE.Vector3(0, 1, 0);

/** A knocked-out zombie lying with its body centered on `at`, the head toward `head` (k.lying's angle). */
function downed(k: Kit, kind: ZKind, n: number, dir: 1 | -1, at: [number, number, number], head: number): Avatar {
  const z = k.zombie(kind, n, null, { steps: 0 });
  k.lying(z, dir, at, head);
  return z;
}

/**
 * A standing zombie's torso bowed forward (the game's animator leans it back): spine and chest bowed by
 * `bow` (rad), the head lifted back toward what it wants.
 */
function hunch(k: Kit, z: Avatar, bow = 0.3, head = 0.2) {
  const p = k.pp(z);
  p.turn('spine', -bow * 0.55);
  p.turn('chest', -bow * 0.45);
  p.turn('head', head);
}

const vtx = new THREE.Vector3();

/** Every visible vertex under `root` in world space (skinned vertices where the bones put them). */
function eachVertex(root: THREE.Object3D, f: (p: THREE.Vector3) => void) {
  root.updateMatrixWorld(true);
  const walk = (o: THREE.Object3D) => {
    if (!o.visible) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !(o as THREE.InstancedMesh).isInstancedMesh) {
      const pos = mesh.geometry.getAttribute('position');
      if (pos) for (let i = 0; i < pos.count; i++) f(mesh.getVertexPosition(i, vtx).applyMatrix4(mesh.matrixWorld));
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
}

/** The highest point of `root`'s visible meshes within `r` of (x, z) in plan. */
function topAt(root: THREE.Object3D, x: number, z: number, r = 0.15): number {
  let top = -Infinity;
  eachVertex(root, (p) => {
    if (Math.hypot(p.x - x, p.z - z) < r) top = Math.max(top, p.y);
  });
  return top;
}

/**
 * A height map of `root` (the highest point per 4 cm cell in plan), for searches that would otherwise walk every
 * vertex at each step: (x, z) → the top within `r`, or -Infinity off the body.
 */
function heightMap(root: THREE.Object3D, r = 0.06): (x: number, z: number) => number {
  const cell = 0.04;
  const cells = new Map<string, number>();
  eachVertex(root, (p) => {
    const key = `${Math.round(p.x / cell)},${Math.round(p.z / cell)}`;
    cells.set(key, Math.max(cells.get(key) ?? -Infinity, p.y));
  });
  const n = Math.ceil(r / cell);
  return (x, z) => {
    const cx = Math.round(x / cell);
    const cz = Math.round(z / cell);
    let top = -Infinity;
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) top = Math.max(top, cells.get(`${cx + i},${cz + j}`) ?? -Infinity);
    return top;
  };
}

/**
 * Puts a hand on a point: searches the arm's angles (k.pp's arm: forward `x`, sideways `z`, the elbow) for the
 * hand socket closest to `target` (world), outward sideways for either side. Returns the distance left. After the
 * last animator call.
 */
function reach(k: Kit, av: Avatar, side: 'L' | 'R', target: THREE.Vector3, xs: [number, number] = [-0.6, 3.1], elbows = [0, 0.3, 0.6, 0.9, 1.2, 1.5]): number {
  const p = k.pp(av);
  const hand = av.character.sockets[side === 'L' ? 'hand_L' : 'hand_R'];
  const [z0, z1] = side === 'R' ? [-0.4, 1.6] : [-1.6, 0.4];
  const at = new THREE.Vector3();
  let best = { d: Infinity, x: 0, z: 0, e: 0 };
  for (let x = xs[0]; x <= xs[1]; x += 0.05)
    for (let z = z0; z <= z1; z += 0.05)
      for (const e of elbows) {
        p.arm(side, x, 0, z, e);
        hand.updateWorldMatrix(true, false);
        const d = hand.getWorldPosition(at).distanceTo(target);
        if (d < best.d) best = { d, x, z, e };
      }
  p.arm(side, best.x, 0, best.z, best.e);
  return best.d;
}

/** Ankle height over the sole (animator.ts ANIM.foot.y, as k.pp's plant uses it). */
const ANKLE = 0.08;

/**
 * Sets a raised foot down on a body: searches the leg's angles (thigh forward, knee) for the sole to land on
 * `top` (a heightMap) with the shin near upright. After the last animator call and k.rest on the standing foot.
 */
function footOn(k: Kit, av: Avatar, side: 'L' | 'R', top: (x: number, z: number) => number) {
  const p = k.pp(av);
  const foot = av.character.bones[`foot_${side}`];
  const at = new THREE.Vector3();
  let best = { err: Infinity, x: 0, knee: 0 };
  for (let x = 0.5; x <= 1.8; x += 0.03)
    for (let knee = 0.2; knee <= 2.3; knee += 0.03) {
      p.leg(side, x, knee);
      foot.updateWorldMatrix(true, false);
      foot.getWorldPosition(at);
      const surface = top(at.x, at.z);
      if (surface === -Infinity) continue;
      const err = Math.abs(at.y - ANKLE - surface) + 0.04 * Math.abs(x - knee - 0.05);
      if (err < best.err) best = { err, x, knee };
    }
  p.leg(side, best.x, best.knee);
}

/**
 * Seats a sitting avatar by its pelvis: the root moved so the lowest point near the hips (in plan) is `sink` below
 * `y`. k.rest would rest the lowest vertex anywhere, a heel under a bent knee, and leave the seat in the air.
 */
function seat(av: Avatar, y = 0, sink = 0.02) {
  av.root.updateMatrixWorld(true);
  const hips = av.character.bones.hips.getWorldPosition(new THREE.Vector3());
  const r = 0.2 * av.root.scale.x;
  let seatY = Infinity;
  eachVertex(av.root, (p) => {
    if (Math.hypot(p.x - hips.x, p.z - hips.z) < r) seatY = Math.min(seatY, p.y);
  });
  av.root.position.y += y - sink - seatY;
  av.root.updateMatrixWorld(true);
}

/**
 * Cuts everything under `root` below `plane` (a bust for a mini) in the shots that turn local clipping on
 * (clipInMini). A character's own pieces take the plane in place (a clone would drop their shader patch, core-api
 * trap 22); the props' shared materials (toon()) are cloned first, so nobody else is cut.
 */
function clipBelow(root: THREE.Object3D, plane: THREE.Plane) {
  root.traverse((o) => {
    const holder = o as THREE.Mesh;
    if (!holder.material) return;
    const own = (m: THREE.Material) => {
      const mat = m.userData?.uniforms ? m : m.clone();
      mat.clippingPlanes = [plane];
      return mat;
    };
    holder.material = Array.isArray(holder.material) ? holder.material.map(own) : own(holder.material);
  });
}

/**
 * Local clipping in the mini only: the renderer's flag is global to the page (core-api trap 23). The card's
 * before() turns it off, the mini's on, and `drawn` (a mesh the mini shows) turns it off again once it is drawn:
 * render() reads the flag when it starts, so the rest of the mini is still cut and nothing after it is.
 */
function clipInMini(k: Kit, drawn: THREE.Object3D) {
  drawn.onAfterRender = () => {
    k.renderer.localClippingEnabled = false;
  };
  return {
    card: () => {
      k.renderer.localClippingEnabled = false;
    },
    mini: () => {
      k.renderer.localClippingEnabled = true;
    },
  };
}

/** A boss prop or any object moved from its socket into the scene, keeping its world size (attach). */
function unsocket(k: Kit, obj: THREE.Object3D): THREE.Object3D {
  k.group.attach(obj);
  return obj;
}

/** The boss's shovel (zombies/looks.ts: a group of handle, blade and grip on hand_R). */
function shovelOf(av: Avatar): THREE.Object3D {
  const g = av.character.sockets.hand_R.children.find((c) => c.type === 'Group' && c.children.length === 3);
  if (!g) throw new Error('zumbi: o Coveiro não tem a pá (client/zombies/looks.ts mudou?)');
  return g;
}

/** The Mystery Coffin's top outline (zombies/coffin.ts: the head end wider), scaled toward its middle. */
function coffinOutline(scale = 1): THREE.Shape {
  const s = new THREE.Shape();
  const pts: [number, number][] = [[-0.24, -1], [0.24, -1], [0.38, 0.45], [0.26, 1], [-0.26, 1], [-0.38, 0.45]];
  pts.forEach(([x, y], i) => (i ? s.lineTo(x * scale, y * scale) : s.moveTo(x * scale, y * scale)));
  s.closePath();
  return s;
}

/** Turns an object so its +Y runs along `dir` (world). */
function alongY(obj: THREE.Object3D, dir: THREE.Vector3) {
  obj.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
}

/** The witch's broom (hauntedTown.ts: a 1.5 m handle, hay bristles), bristles at the origin, handle up +Y. */
function broom(): THREE.Group {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 1.5, 8), toon(0x8a6a3a));
  handle.position.y = 0.75 + 0.3;
  // Bristles flared toward the floor, tied off with a dark band.
  const bristles = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.22, 0.42, 10).scale(1, 1, 0.45), toon(0xc8a050));
  bristles.position.y = 0.21;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 10).scale(1, 1, 0.5), toon(0x6a3a22));
  band.position.y = 0.38;
  g.add(handle, bristles, band);
  return g;
}

/**
 * A carpenter's hammer (studio-made: the game has none, sized to read on a card): the grip at the origin, the
 * handle up +Y, the head across it along X (the striking face at +X).
 */
function hammer(): THREE.Group {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.5, 0.045), toon(0x8a6a3a));
  handle.position.y = 0.17;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.08), toon(0x8c96a3));
  head.position.set(0.02, 0.42, 0);
  const claw = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.06), toon(0x6a7480));
  claw.position.set(-0.12, 0.45, 0);
  claw.rotation.z = -0.5;
  g.add(handle, head, claw);
  return g;
}

/**
 * A big kitchen knife (studio-made, after weaponModels' 'faca'), ink-rimmed so it reads over a white dress: the
 * grip at the origin, the blade along +X with its spine up, its flat facing +Z (the ink rim lies flat behind it).
 */
function knife(): THREE.Group {
  const g = new THREE.Group();
  const prof = new THREE.Shape();
  prof.moveTo(0, 0.022);
  prof.lineTo(0.24, 0.022);
  prof.quadraticCurveTo(0.29, 0.016, 0.32, 0.0);
  prof.quadraticCurveTo(0.25, -0.032, 0.12, -0.036);
  prof.lineTo(0, -0.036);
  prof.closePath();
  const steel = new THREE.Mesh(new THREE.ExtrudeGeometry(prof, { depth: 0.008, bevelEnabled: false }).translate(0.02, 0, -0.004), toon(0xaab3bd));
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.04, 0.026).translate(-0.065, -0.006, 0), toon(0x1f2226));
  const bolster = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.068, 0.03).translate(0.01, -0.007, 0), toon(0x5a6068));
  const ink = new THREE.MeshBasicMaterial({ color: INK });
  const t = 0.015;
  const rimBlade = new THREE.Mesh(new THREE.ShapeGeometry(prof).translate(-0.16, 0.007, 0).scale(1 + (2 * t) / 0.32, 1 + (2 * t) / 0.058, 1).translate(0.18, -0.007, -0.009), ink);
  const rimHandle = new THREE.Mesh(new THREE.PlaneGeometry(0.15 + 2 * t, 0.068 + 2 * t).translate(-0.06, -0.006, -0.016), ink);
  g.add(rimHandle, rimBlade, handle, bolster, steel);
  return g;
}

/**
 * A bride's veil torn off and flying (studio-made, the game's veil color, lit so its folds read): a sheet whose
 * root is at the origin, rising along +Y and curling over toward +Z, wider toward its loose end.
 */
function flyingVeil(len = 1.25, width = 0.5): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(width, len, 6, 18);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const u = (pos.getY(i) + len / 2) / len;
    const a = u * 2.1;
    const r = len / 2.1;
    pos.setXYZ(i, x * (0.6 + 0.9 * u), Math.sin(a) * r, (1 - Math.cos(a)) * r + Math.sin(x * 10 + u * 6) * 0.03 * u);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color: 0xf2f0ff, gradientMap: toonGradient(), transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
}

/** A bride's bouquet (studio-made): red, pink and white roses over green leaves, its middle at the origin. */
function bouquet(): THREE.Group {
  const g = new THREE.Group();
  const rose = new THREE.SphereGeometry(0.045, 10, 8);
  const roses: [number, number, number, number][] = [
    [0, 0.05, 0, 0xc0392f],
    [0.065, 0.03, 0.01, 0xf1efe8],
    [-0.065, 0.03, 0.01, 0xc0392f],
    [0.03, 0.025, -0.06, 0xd8566a],
    [-0.035, 0.02, -0.055, 0xf1efe8],
    [0.0, 0.01, 0.065, 0xd8566a],
    [0.07, -0.005, -0.045, 0xc0392f],
  ];
  for (const [x, y, z, color] of roses) {
    const m = new THREE.Mesh(rose, toon(color));
    m.position.set(x, y, z);
    g.add(m);
  }
  const leaf = new THREE.ConeGeometry(0.03, 0.09, 4);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const m = new THREE.Mesh(leaf, toon(0x4f8a3a));
    m.position.set(Math.cos(a) * 0.1, -0.015, Math.sin(a) * 0.1);
    m.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
    g.add(m);
  }
  const stems = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.015, 0.14, 8), toon(0x6a8a3a));
  stems.position.y = -0.09;
  g.add(stems);
  return g;
}

/** A comic burst (studio-made, ink-rimmed like k.stars): jagged orange, yellow and white layers facing the camera. */
function burst(k: Kit, at: THREE.Vector3, size: number): THREE.Group {
  const spikes = 11;
  const tips = Array.from({ length: spikes }, () => 0.78 + Math.random() * 0.4);
  const shape = (inner: number) => {
    const s = new THREE.Shape();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 ? inner : tips[i / 2];
      const a = (i * Math.PI) / spikes;
      if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    return s;
  };
  const g = new THREE.Group();
  g.name = 'zumbi:estouro';
  const layers: [number, number, number][] = [[0x1b1530, 1.1, -0.02], [0xff7a1a, 1, 0], [0xffd23f, 0.7, 0.01], [0xfff1c4, 0.4, 0.02]];
  for (const [color, scale, z] of layers) {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape(0.6)), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.scale.setScalar(size * scale);
    m.position.z = z;
    g.add(m);
  }
  g.position.copy(at);
  g.userData.facecam = true;
  g.userData.roll = Math.random() * Math.PI;
  k.group.add(g);
  return g;
}

/** The see-through blue ghost of a character (its pieces own their materials: k.avatar). */
function ghostly(av: Avatar, opacity = 0.8) {
  av.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const std = m as THREE.MeshStandardMaterial;
      std.transparent = true;
      std.opacity = opacity;
      if (std.color) std.color.set(0xa8c0ff);
      if (std.emissive) {
        std.emissive.set(0x6a7cff);
        std.emissiveIntensity = 0.45;
      }
    }
  });
}

export default defineDomain('zumbi', [
  {
    id: 'sobrevivente',
    build(k) {
      // The last one standing: the HERO, one boot on a knocked-out brute, holds his rifle up over his head in
      // both fists. A low, close camera makes him the tall shape and the brute the dark base under his boot.
      const hero = k.avatar(HERO, 'm', { armed: true });
      hero.root.rotation.y = 0.55;
      k.settle(hero, {}, 40);
      k.hideBack(hero);
      const p = k.pp(hero);
      p.leg('R', -0.12, 0.08);
      p.leg('L', 1.1, 1.1);
      p.plant();
      p.turn('spine', 0.05);
      p.turn('chest', 0.08);
      p.turn('head', 0.3);
      p.grip(1, 1);
      k.rest(hero, 0);

      // The brute face down across in front of him, his back under the raised boot; then the boot set on it.
      const brute = k.zombie('brutamontes', 8, null, { steps: 0 });
      const step = new THREE.Vector3(-0.15, 0, -0.38);
      const along = new THREE.Vector3(-1, 0, 0);
      const center = step.clone().addScaledVector(along, -0.3);
      k.lying(brute, -1, center, Math.atan2(along.x, along.z));
      footOn(k, hero, 'L', heightMap(brute.root));
      const boot = k.at(hero.character.bones.foot_L).setY(0);
      // Where the boot sits on him, along his body and across it: the mini lays him again with the same spot.
      const side = new THREE.Vector3(-along.z, 0, along.x);
      const onBody = [boot.clone().sub(center).dot(along), boot.clone().sub(center).dot(side)];

      // The rifle across over his head, barrel to his left, a fist at the grip and one on the handguard.
      const rifle = unsocket(k, hero['primary'][0]);
      const yaw = hero.root.rotation.y;
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      rifle.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(UP, right), UP, right));
      rifle.position.copy(k.at(hero.character.bones.head, [0, 0.58, 0])).addScaledVector(right, 0.1);
      rifle.updateMatrixWorld(true);
      reach(k, hero, 'R', rifle.localToWorld(new THREE.Vector3(0, -0.06, 0.12)));
      reach(k, hero, 'L', rifle.localToWorld(new THREE.Vector3(0, -0.03, -0.3)));

      const patch = k.island('grama', 2.6, 1.0, [0, 0, 0], { tint: CHURCHYARD, thick: 0.12 });
      patch.position.set(0.15, 0, -0.3);
      return {
        card: { pos: [0.4, 1.15, -6.15], target: [0.1, 0.95, 0.0], fov: 30 },
        mini: {
          pos: [0.25, 1.0, -6.15],
          target: [-0.22, 0.9, -0.1],
          fov: 30,
          // The badge: the brute laid again pointing at the camera (diagonally, clear of the planted foot), the
          // boot on the same spot of his back, so his length no longer sets the square's scale.
          before() {
            const toCam = new THREE.Vector3(0.45, 0, -1).normalize();
            const across = new THREE.Vector3(-toCam.z, 0, toCam.x);
            const c = boot.clone().addScaledVector(toCam, -onBody[0]).addScaledVector(across, -onBody[1]);
            k.lying(brute, -1, c, Math.atan2(toCam.x, toCam.z));
            patch.position.set(c.x + 0.15, 0, c.z);
            patch.rotation.y = Math.atan2(toCam.x, toCam.z) + Math.PI / 2;
          },
        },
      };
    },
  },
  {
    id: 'ate-onde-der',
    build(k) {
      // The wave: a horde surging at the camera, seen from above so the rows stack into a sea of heads and
      // reaching arms, the runner lunging in front, big at the bottom. Ten of them (seeds of their own, so no
      // other card's zombies), all reaching forward: the brute and the spitter too (raised or flung arms read as
      // cheering in a crowd).
      const eye = new THREE.Vector3(0.55, 3.0, -4.8);
      const horde: [ZKind, number, number, number][] = [
        ['corredor', 12, 0.0, -0.55],
        ['comum', 18, -1.15, -0.05],
        ['comum', 19, 1.1, 0.0],
        ['brutamontes', 14, -0.15, 0.45],
        ['cuspidor', 13, -2.0, 0.75],
        ['inchado', 11, 1.95, 0.8],
        ['comum', 20, 0.8, 1.25],
        ['comum', 21, -1.05, 1.35],
        ['comum', 22, 0.05, 2.0],
        ['comum', 23, -2.15, 2.1],
      ];
      const zs = horde.map(([kind, n, x, z], i) => {
        const av = k.zombie(kind, n, { speed: 1.5 }, { steps: 30 + i * 7, swell: kind === 'inchado' ? 1.15 : 1 });
        av.root.position.set(x, 0, z);
        k.face(av, eye);
        av.root.rotation.y += ((i % 3) - 1) * 0.12;
        hunch(k, av, 0.7, 0.55);
        const p = k.pp(av);
        p.arm('R', 1.4 + (i % 2) * 0.1, 0, 0.12, 0.25);
        p.arm('L', 1.5 - (i % 2) * 0.1, 0, -0.12, 0.25);
        return av;
      });
      // The runner lunges: a long stride, bowed low, both hands clawing at the lens.
      const lunge = (av: Avatar) => {
        const p = k.pp(av);
        p.leg('L', 0.75, 0.55);
        p.leg('R', -0.55, 0.45);
        p.plant();
        hunch(k, av, 0.85, 0.7);
        p.arm('R', 1.6, 0, 0.18, 0.15);
        p.arm('L', 1.6, 0, -0.18, 0.15);
        p.grip(0.35, 0.35);
        k.rest(av, 0);
      };
      lunge(zs[0]);

      // The badge: the runner alone lunging at the lens in three-quarters, two more packed behind his shoulders
      // (another group, off to the side), cut off at the thighs: one mass of heads and clawing hands.
      const lead = k.zombie('corredor', 12, { speed: 1.5 }, { steps: 30 });
      lead.root.position.set(10, 0, 0);
      const lens = new THREE.Vector3(10.0, 1.3, -3.3);
      k.face(lead, lens);
      lead.root.rotation.y += 0.65;
      lunge(lead);
      // Less bowed than in the crowd, his face up toward the lens, both arms reaching out ahead of him (reaching
      // straight at the lens foreshortens them into his chest).
      hunch(k, lead, 0.45, 0.4);
      k.pp(lead).arm('R', 1.7, 0, 0.12, 0.15);
      k.pp(lead).arm('L', 1.62, 0, -0.12, 0.2);
      const pack = ([[18, 0.5, 1.35], [19, -0.38, 1.45]] as const).map(([n, x, z], i) => {
        const av = k.zombie('comum', n, { speed: 1.5 }, { steps: 37 + i * 9 });
        av.root.position.set(10 + x, 0, z);
        k.face(av, lens);
        hunch(k, av, 0.6, 0.55);
        const p = k.pp(av);
        p.arm('R', 1.5, 0, 0.15, 0.3);
        p.arm('L', 1.45, 0, -0.15, 0.3);
        return av.root;
      });
      const thighs = new THREE.Plane(UP, -0.62);
      for (const root of [lead.root, ...pack]) clipBelow(root, thighs);
      const clip = clipInMini(k, lead.root.getObjectByProperty('isSkinnedMesh', true) ?? lead.root);
      return {
        card: { pos: eye, target: [0.05, 0.62, 0.6], fov: 42, hide: [lead.root, ...pack], before: clip.card },
        mini: { pos: lens, target: [9.96, 1.1, 0.2], fov: 30, hide: zs.map((z) => z.root), before: clip.mini },
        // A crowd of grey-green skins: the stronger rim lifts their edges.
        rim: 1.2,
      };
    },
  },
  {
    id: 'faxina',
    build(k) {
      // The HERO in work gloves sweeping a heap of knocked-out zombies (the mechanic, the office guy, the rocker)
      // with the witch's broom.
      const hero = k.avatar(dress(HERO, 'luvasTrabalho'), 'm');
      hero.root.position.set(1.05, 0, 0.15);
      hero.root.rotation.y = Math.PI / 2;
      k.settle(hero, {}, 40);
      const p = k.pp(hero);
      p.turn('spine', -0.3);
      p.turn('chest', -0.1);
      p.turn('head', -0.2);
      p.leg('R', 0.35, 0.35);
      p.leg('L', -0.2, 0.2);
      p.plant();
      p.grip(1, 1);
      // The broom from the floor at the heap up through the hands.
      const end = new THREE.Vector3(-0.2, 0, 0.05);
      const dir = new THREE.Vector3(0.95, 1.1, 0).normalize();
      const b = broom();
      alongY(b, dir);
      b.position.copy(end);
      k.group.add(b);
      reach(k, hero, 'L', end.clone().addScaledVector(dir, 1.45));
      reach(k, hero, 'R', end.clone().addScaledVector(dir, 1.05));
      k.rest(hero, 0);

      // The heap: two side by side, the third across them: the office guy on top, his white shirt a light edge
      // against the paving.
      downed(k, 'comum', 2, 1, [-1.0, 0, 0.0], Math.PI / 2 + 0.35);
      downed(k, 'comum', 4, -1, [-1.1, 0, 0.6], Math.PI / 2 - 0.3);
      downed(k, 'comum', 3, 1, [-1.1, 0.32, 0.3], -0.2);
      // Swept on the Alameda's paving (cemetery.ts: 'pedra' tinted SPOOKY.path).
      k.island('pedra', 3.2, 1.6, [-0.32, 0, 0.3], { tint: SPOOKY.path, shape: 'box' });
      // The mini, a scene of its own off to the side: one swept-up zombie (the office guy) with the broom planted
      // upright on him like a flag on a finished job: one bold shape for the badge.
      const swept = downed(k, 'comum', 3, 1, [10, 0, 0.1], Math.PI / 2);
      const laid = broom();
      laid.scale.set(1.8, 1.3, 1.8);
      const belly = k.at(swept.character.bones.spine);
      alongY(laid, new THREE.Vector3(-0.22, 1, 0.12));
      laid.position.set(belly.x, topAt(swept.root, belly.x, belly.z, 0.12) - 0.04, belly.z);
      k.group.add(laid);
      const patch = k.island('pedra', 2.3, 1.0, [10, 0, 0.1], { tint: SPOOKY.path, shape: 'box' });
      return {
        card: { pos: [-0.25, 2.25, -6.05], target: [-0.32, 0.6, 0.3], fov: 30, hide: [swept.root, laid, patch] },
        mini: { pos: [9.58, 1.45, -6.75], target: [10, 1.12, 0.1], fov: 30 },
      };
    },
  },
  {
    id: 'caca-chefes',
    build(k) {
      // The three bosses side by side, in the album's order from the left: O Coveiro leaning on his shovel, A
      // Noiva screaming under her veil, O Prefeito with a fist up.
      const coveiro = k.zombie('coveiro', 0);
      coveiro.root.position.set(1.35, 0, 0.35);
      coveiro.root.rotation.y = 0.25;
      const c = k.pp(coveiro);
      c.turn('spine', -0.12);
      c.turn('chest', -0.08);
      c.turn('head', 0.15);
      c.arm('R', 0.75, 0, -0.1, 0.55);
      c.arm('L', 0.75, 0, 0.1, 0.55);
      c.grip(1, 1);
      // The shovel planted in front of him, both hands on its grip.
      const hands = k.at(coveiro.character.sockets.hand_R).add(k.at(coveiro.character.sockets.hand_L)).multiplyScalar(0.5);
      const shovel = unsocket(k, shovelOf(coveiro));
      const sc = 1.6;
      shovel.scale.setScalar(sc);
      const len = 1.425 * sc;
      const lean = Math.sqrt(Math.max(0.01, len * len - hands.y * hands.y));
      const base = new THREE.Vector3(hands.x - lean * 0.25, 0, hands.z - lean * 0.97);
      const axis = hands.clone().sub(base).normalize();
      alongY(shovel, axis);
      shovel.position.copy(base).addScaledVector(axis, 1.11 * sc);

      const noiva = k.zombie('noiva', 0, { special: { kind: 'scream', t: 0.85 } });
      noiva.root.position.set(0, 0, -0.6);
      // The Bride screams: arched back (the game's scream frame bows her over), head thrown back, hands at her
      // cheeks with the elbows out (no T-pose); her veil flares out behind her.
      const n = k.pp(noiva);
      n.turn('spine', 0.18);
      n.turn('chest', 0.15);
      n.turn('head', 0.5);
      const ns = noiva.root.scale.x;
      for (const [side, dx] of [['R', 1], ['L', -1]] as const)
        reach(k, noiva, side, k.at(noiva.character.bones.head, [dx * 0.13 * ns, 0.02 * ns, -0.07 * ns]), [-0.6, 3.1], [1.5, 1.8, 2.1, 2.4]);
      n.grip(0.2, 0.2);
      const veil = noiva.character.sockets.head.children.find((c) => (c as THREE.Mesh).geometry?.type === 'ConeGeometry');
      if (veil) {
        veil.scale.set(1.5, 1.1, 1.5);
        veil.rotation.x = 0.45;
      }

      const prefeito = k.zombie('prefeito', 0);
      prefeito.root.position.set(-1.4, 0, 0.35);
      prefeito.root.rotation.y = -0.3;
      const m = k.pp(prefeito);
      m.turn('spine', -0.05);
      m.turn('chest', 0.12);
      m.turn('head', 0.2);
      m.arm('R', 2.45, 0, 0.3, 0.9);
      m.arm('L', 0.45, 0, -0.25, 1.5);
      m.grip(1, 1);

      // The badge: three heads. Each boss cut off at the hips (a clipping plane, on in the mini only) and set
      // down so the three cuts line up, the busts overlapping: the Coveiro's straw hat on the left, the Bride's
      // veil in the middle and a little forward, the Mayor's fedora and sash on the right.
      const cut = new THREE.Plane(UP, 0);
      const bosses = [coveiro, noiva, prefeito];
      for (const b of bosses) clipBelow(b.root, cut);
      clipBelow(shovel, cut);
      const hipsY = bosses.map((b) => k.at(b.character.bones.hips).y);
      const clip = clipInMini(k, noiva.root.getObjectByProperty('isSkinnedMesh', true) ?? noiva.root);
      return {
        card: { pos: [-0.1, 1.3, -9.65], target: [-0.1, 1.57, 0], fov: 30, before: clip.card },
        mini: {
          pos: [-0.1, 0.8, -4.85],
          target: [-0.1, 0.74, 0],
          fov: 30,
          hide: [shovel],
          before() {
            clip.mini();
            const place = (b: Avatar, i: number, x: number, y: number, z: number) => b.root.position.set(x, y - hipsY[i], z);
            place(coveiro, 0, 0.5, 0, 0.3);
            place(noiva, 1, 0, 0.15, -0.25);
            veil?.scale.set(1.15, 1, 1.15);
            place(prefeito, 2, -0.5, 0, 0.3);
            // His fist down, and her face toward the lens, the hands back on her cheeks: one compact shape.
            m.arm('R', 0.25, 0, 0.2, 0.4);
            n.turn('head', 0.12);
            for (const [side, dx] of [['R', 1], ['L', -1]] as const)
              reach(k, noiva, side, k.at(noiva.character.bones.head, [dx * 0.13 * ns, 0.02 * ns, -0.07 * ns]), [-0.6, 3.1], [1.5, 1.8, 2.1, 2.4]);
          },
        },
        rim: 1.2,
      };
    },
  },
  {
    id: 'anjo-da-guarda',
    build(k) {
      // The revive: the HERO, a medic with a big golden halo, leans back and pulls a downed teammate up off the
      // grass by the hand.
      const hero = k.avatar(dress(HERO, { id: 'jaleco', cores: ['#f1efe8', '#c9d3d6'] }, { id: 'mascaraCirurgica', cores: ['#8fcfd6'] }), 'm');
      hero.root.position.set(0.38, 0, 0);
      hero.root.rotation.y = Math.PI / 2;
      k.settle(hero, {}, 40);
      const h = k.pp(hero);
      h.turn('spine', 0.14);
      h.turn('chest', 0.05);
      h.turn('head', -0.3);
      h.leg('R', 0.35, 0.3);
      h.leg('L', -0.3, 0.15);
      h.plant();
      h.arm('L', -0.35, 0, -0.3, 0.5);
      h.grip(0.3, 1);
      k.rest(hero, 0);

      // The teammate, sitting on the grass and leaning in to be pulled up: knees up, feet flat by his seat (clear
      // of the medic's shoes), one hand propped on the grass behind him, the other in the medic's grip.
      const mate = k.avatar(neighbor(3), 'm');
      mate.root.position.set(-0.82, 0, 0.02);
      mate.root.rotation.y = -Math.PI / 2;
      k.settle(mate, {}, 40);
      const t = k.pp(mate);
      t.reset();
      t.hipsY(-0.8);
      t.leg('L', 1.95, 1.75, -0.06);
      t.leg('R', 2.15, 2.1, 0.08);
      t.turn('spine', -0.22);
      t.turn('chest', -0.08);
      t.turn('head', 0.5);
      t.grip(1, 0.2);
      seat(mate, 0);
      const behind = k.at(mate.character.bones.hips).setY(0.03).add(new THREE.Vector3(-0.32, 0, 0.26));
      reach(k, mate, 'R', behind, [-1.6, 0.6]);
      // Hands meet between them: the teammate's left reaches up, the HERO's right reaches down to it.
      const meet = new THREE.Vector3(-0.15, 0.98, -0.2);
      reach(k, mate, 'L', meet);
      reach(k, hero, 'R', meet);
      k.island('grama', 2.5, 1.2, [-0.25, 0, 0.05], { tint: CHURCHYARD, thick: 0.14 });

      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 10, 32), toon(0xffd23f, { emissive: 0x6a4a00 }));
      halo.rotation.x = Math.PI / 2 - 0.35;
      halo.position.copy(k.at(hero.character.bones.head, [0, 0.42, 0]));
      k.group.add(halo);
      return {
        card: { pos: [-0.3, 1.42, -5.85], target: [-0.2, 0.9, 0], fov: 30 },
        mini: { pos: [-2.3, 1.85, -5.85], target: [-0.3, 0.92, 0.03], fov: 30 },
      };
    },
  },
  {
    id: 'apostador',
    build(k) {
      // The Mystery Coffin thrown open, the legendary Liquidificador Supremo floating over it in its gold glow.
      const coffin = new Coffin(k.group, k.physics, [0, 0, 0, 0], k.sfx);
      coffin.set({ state: 'offer', by: 0, item: 'liquidificadorSupremo', flaw: null, until: 0 }, 0);
      coffin.update(1, 1000);
      coffin['beam'].visible = false;
      const display = coffin['display'];
      const shown = coffin['shown'];
      if (shown) shown.visible = false;
      const gun = k.gun(gunStats('smg', ['motor', 'holo', 'tambor', 'coronha']));
      gun.scale.setScalar(3.1);
      // Muzzle up a little, three-quarters to the camera (off +X and +Z, above): the popcorn drum below and the
      // holo on top both show.
      gun.rotation.x = 0.3;
      // The smiley reticle (the holo's glowing face group) blown up so it reads.
      const smiley = gun.children.find((c) => c.type === 'Group');
      if (!smiley) throw new Error('zumbi: a SMG não tem mais o sorriso da mira holo (client/render/weaponModels.ts mudou?)');
      // It faces the shooter in game, inside the sight's frame; here it floats just over the frame, turned to the
      // lens (studio exaggeration).
      smiley.scale.setScalar(5);
      smiley.position.y += 0.05;
      smiley.userData.facecam = true;
      // A dark glass behind the reticle, so its thin yellow lines read over the glow.
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.0095, 24), new THREE.MeshBasicMaterial({ color: INK }));
      glass.position.z = -0.0008;
      smiley.add(glass);
      display.add(gun);
      display.position.y = 1.2;
      // The muzzle up to the left, so the counter's corner (top right) stays clear.
      display.rotation.y = 2.05;
      // The gold glow hugging the gun instead of a big dome over it.
      coffin['glow'].scale.set(1.25, 0.8, 1);
      // The game's coffin is a solid box: a velvet lining on its top makes it read as open (studio-made).
      const lining = new THREE.Mesh(new THREE.ShapeGeometry(coffinOutline(0.82)).rotateX(-Math.PI / 2), toon(0x6e1f2a));
      lining.position.y = 0.425;
      const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.22), toon(0xe8e2d6));
      pillow.position.set(0, 0.45, -0.72);
      coffin.root.add(lining, pillow);
      // The mini: the coffin as everyone knows it before paying, lid shut under its gold cross and the floating
      // '?' (a second coffin, off to the side): one bold shape for the badge.
      const shut = new Coffin(k.group, k.physics, [10, 0, 0, 0], k.sfx);
      shut.update(1, 1000);
      shut['beam'].visible = false;
      // Its '?' floats lower than in game, so the two make one sticker.
      shut['mark'].position.y = 1.1;
      shut['mark'].scale.setScalar(1.05);
      return {
        card: { pos: [3.45, 3.05, 3.08], target: [-0.22, 0.58, -0.03], fov: 30, hide: [shut.root] },
        mini: { pos: [14.0, 3.3, 2.4], target: [10, 0.55, -0.1], fov: 30, hide: [coffin.root] },
      };
    },
  },
  {
    id: 'voto-nulo',
    build(k) {
      // The card: O Prefeito doubled over, three-quarters so his sash shows, both hands at the groin, stars
      // bursting below his belt.
      const mayor = k.zombie('prefeito', 0);
      const yaw = 0.75;
      mayor.root.rotation.y = yaw;
      k.poses.ouch(mayor);
      // Doubled over further than the preset, face up in pain, so the bend reads from three-quarters.
      const o = k.pp(mayor);
      o.turn('spine', -0.5);
      o.turn('chest', -0.3);
      o.turn('neck', 0.4);
      o.turn('head', 0.45);
      const s = mayor.root.scale.x;
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const groin = k.at(mayor.character.bones.hips, [0, -0.3 * s, 0]).addScaledVector(fwd, 0.24 * s);
      const stars = k.stars(groin, { count: 11, spread: 0.22 * s, size: 0.12 * s, dir: [fwd.x, -0.6, fwd.z] });
      // The fedora pops off his head.
      for (const o of mayor.character.objectsOf('cabeca')) {
        o.position.y += 0.2;
        o.position.z += 0.08;
        o.rotation.x -= 0.5;
      }

      // The mini shows who, not how: the Mayor sat down dazed on the grass, his fedora knocked up off his head,
      // stars circling it (compact, so he is big in the badge).
      const dazed = k.zombie('prefeito', 0, null, { steps: 0 });
      dazed.root.position.set(8, 0, 0);
      dazed.root.rotation.y = 0.85;
      const d = k.pp(dazed);
      d.reset();
      d.hipsY(-0.86);
      // Sat on the ground: the left leg out along it, the right knee up with its foot flat by the seat.
      d.leg('L', 1.47, 0.02, -0.08);
      d.leg('R', 2.3, 2.2, 0.12);
      d.turn('spine', -0.06);
      d.turn('chest', -0.06);
      d.turn('head', 0.1, 0.2, 0.3);
      d.arm('R', 0.75, 0, 0.35, 0.6);
      d.grip(0.6, 0.2);
      seat(dazed, 0);
      // His left hand propped on the grass behind him.
      const back = new THREE.Vector3(Math.sin(0.85), 0, Math.cos(0.85));
      const side = new THREE.Vector3(-back.z, 0, back.x);
      reach(k, dazed, 'L', k.at(dazed.character.bones.hips).setY(0.04).addScaledVector(back, 0.35).addScaledVector(side, -0.3));
      for (const o of dazed.character.objectsOf('cabeca')) {
        o.position.y += 0.12;
        o.rotation.z += 0.5;
      }
      const top = k.at(dazed.character.bones.head, [0, 0.42, 0]);
      const ring = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        ring.add(k.stars([top.x + Math.cos(a) * 0.42, top.y + Math.sin(a) * 0.08, top.z + Math.sin(a) * 0.3], { count: 1, spread: 0.001, size: 0.17 }));
      }
      k.group.add(ring);
      const grass = k.island('grama', 1.9, 1.3, [8.0, 0, -0.25], { tint: CHURCHYARD, thick: 0.14 });
      return {
        card: { pos: [-0.64, 1.74, -8.45], target: [-0.2, 1.53, 0], fov: 30, hide: [ring, dazed.root, grass] },
        mini: { pos: [9.05, 2.5, -7.1], target: [7.7, 0.92, -0.23], fov: 30, hide: [stars, mayor.root] },
      };
    },
  },
  {
    id: 'divorcio',
    build(k) {
      // The HERO as the groom drives the kitchen knife into A Noiva: she arches back screaming, toppling, arms
      // flung. The knife is studio-made and ink-rimmed, half of its blade out against the cream between them.
      const groom = k.avatar(
        dress(HERO, { id: 'paleto', cores: ['#1f2226'] }, { id: 'socialLonga', cores: ['#e8e2d6'] }, { id: 'gravata', cores: ['#c0392f'] }, { id: 'calcaTerno', cores: ['#1f2226'] }, { id: 'sapatoSocial', cores: ['#1f2226'] }),
        'm',
      );
      groom.root.position.set(0.72, 0, 0.05);
      groom.root.rotation.y = Math.PI / 2;
      k.settle(groom, {}, 40);
      // A lunge: the knife hand thrust at her, the other arm back.
      const g = k.pp(groom);
      g.turn('spine', -0.15, 0.15);
      g.turn('chest', -0.05, 0.1);
      g.leg('R', 0.55, 0.5);
      g.leg('L', -0.35, 0.1);
      g.plant();
      g.arm('L', -0.5, 0, -0.35, 0.5);
      g.grip(0.6, 1);
      k.rest(groom, 0);

      const bride = k.zombie('noiva', 0, { special: { kind: 'scream', t: 1 } });
      bride.root.position.set(-0.5, 0, 0);
      bride.root.rotation.y = -0.5;
      // Arched back at the waist, head thrown back, one arm flung up and back, the other out and down: toppling.
      const b = k.pp(bride);
      b.turn('spine', 0.38);
      b.turn('chest', 0.35);
      b.turn('head', 0.22);
      b.arm('R', 0.3, 0, 2.5, 0.6);
      b.arm('L', -0.6, 0, -0.8, 0.5);
      b.grip(0, 0);
      b.body.rotation.x = 0.12;
      // Her veil flies off behind her, away from the knife (the cone would hang over it).
      for (const c of bride.character.sockets.head.children) if ((c as THREE.Mesh).geometry?.type === 'ConeGeometry') c.visible = false;
      const trail = flyingVeil(0.8, 0.36);
      trail.position.copy(k.at(bride.character.bones.head, [0, 0.1, 0]));
      trail.rotation.set(0, -Math.PI / 2, -1.45, 'YXZ');
      k.group.add(trail);
      const camera = new THREE.Vector3(-1.0, 1.34, -5.3);

      // The knife: its tip in her middle, the grip out toward the groom's fist, the flat of the blade to the lens.
      const middle = k.at(bride.character.bones.spine, [0, 0.05, 0]);
      const fist = k.at(groom.character.bones.chest, [0, -0.05, 0]).lerp(middle, 0.45);
      const along = middle.clone().sub(fist).normalize();
      const blade = knife();
      blade.scale.setScalar(2);
      const toLens = camera.clone().sub(middle);
      const face = toLens.addScaledVector(along, -toLens.dot(along)).normalize();
      blade.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, new THREE.Vector3().crossVectors(face, along), face));
      blade.position.copy(middle).addScaledVector(along, -0.12 - 0.34 * 2);
      k.group.add(blade);
      reach(k, groom, 'R', blade.position.clone());
      const stars = k.stars(middle.clone().addScaledVector(along, -0.2).add(new THREE.Vector3(0, 0.24, 0.05)), { count: 7, spread: 0.24, size: 0.13, dir: [0.3, 1, 0] });

      // The mini shows who, not how: A Noiva alone (another one, off to the side), from the waist up, her bouquet
      // held at her chest (studio-made: the bride's red-and-white cue at badge size), her flower crown bigger, her
      // veil falling wide behind her shoulders.
      const solo = k.zombie('noiva', 0, { special: { kind: 'scream', t: 1 } });
      solo.root.position.set(8, 0, 0);
      solo.root.rotation.y = -0.2;
      const sp = k.pp(solo);
      sp.turn('spine', 0.05);
      sp.turn('chest', 0.05);
      sp.turn('head', 0.12, 0, -0.08);
      const ss = solo.root.scale.x;
      const flowers = bouquet();
      flowers.scale.setScalar(ss * 1.25);
      const fwdSolo = new THREE.Vector3(-Math.sin(solo.root.rotation.y), 0, -Math.cos(solo.root.rotation.y));
      flowers.position.copy(k.at(solo.character.bones.spine, [0, 0.16 * ss, 0])).addScaledVector(fwdSolo, 0.24 * ss);
      k.group.add(flowers);
      const acrossSolo = fwdSolo.clone().cross(UP);
      reach(k, solo, 'R', flowers.position.clone().addScaledVector(acrossSolo, -0.07 * ss).add(new THREE.Vector3(0, -0.08 * ss, 0)));
      reach(k, solo, 'L', flowers.position.clone().addScaledVector(acrossSolo, 0.07 * ss).add(new THREE.Vector3(0, -0.08 * ss, 0)));
      sp.grip(0.9, 0.9);
      const drape = solo.character.sockets.head.children.find((c) => (c as THREE.Mesh).geometry?.type === 'ConeGeometry') as THREE.Mesh | undefined;
      if (drape) {
        drape.scale.set(1.6, 1, 1.6);
        (drape.material as THREE.MeshBasicMaterial).opacity = 0.62;
      }
      for (const o of solo.character.objectsOf('cabeca')) o.scale.multiplyScalar(1.5);
      const portrait = k.at(solo.character.bones.chest, [0, 0.1 * ss, 0]);
      clipBelow(solo.root, new THREE.Plane(UP, -k.at(solo.character.bones.hips).y));
      const clip = clipInMini(k, solo.root.getObjectByProperty('isSkinnedMesh', true) ?? solo.root);
      const front = new THREE.Vector3(-Math.sin(solo.root.rotation.y + 0.25), 0, -Math.cos(solo.root.rotation.y + 0.25));

      return {
        card: { pos: camera, target: [-0.17, 1.07, 0], fov: 30, hide: [solo.root], before: clip.card },
        mini: {
          pos: portrait.clone().addScaledVector(front, 3.45).add(new THREE.Vector3(-0.07, 0.1, 0)),
          target: portrait.clone().add(new THREE.Vector3(-0.07, 0.02, 0)),
          fov: 30,
          hide: [groom.root, bride.root, blade, stars, trail],
          before: clip.mini,
        },
        rim: 1.2,
      };
    },
  },
  {
    id: 'churrasco-coletivo',
    build(k) {
      // The Tio do Churrasco bursts, frozen on the first fireball, taking three neighbors with him into the air.
      // He is swollen past the game's swell so the belly reads; his arms are flung up and out, bent (not the
      // fuse's straight-out T).
      const uncle = k.zombie('inchado', 7, { fuse: 1 }, { swell: 1.4 });
      hunch(k, uncle, 0.2, 0.3);
      const u = k.pp(uncle);
      u.arm('R', 0.25, 0, 2.45, 0.6);
      u.arm('L', 0.25, 0, -2.45, 0.6);
      u.grip(0, 0);
      const belly = k.at(uncle.character.bones.spine, [0, -0.32, -0.45]);
      // The pop: a comic burst out of his belly (the game's puffs are flat discs at this size), the game's
      // confetti around it, none over his face.
      const pop = burst(k, belly, 0.6);
      const chips = k.confetti(belly, { count: 28, spread: 1.1 });
      const face = k.at(uncle.character.bones.head);
      for (const c of chips.children) {
        const away = c.position.clone().sub(face);
        if (away.length() < 0.4) c.position.copy(face).addScaledVector(away.normalize(), 0.4);
      }

      // The three flung out around him, clear of his hands and of each other, heads pointing away from the
      // blast (a little behind him, so he stays the big shape): left low, right low, and one up by his left arm.
      const hip = 0.95;
      const fling = (n: number, center: [number, number, number], out: [number, number], yaw: number) => {
        const z = k.zombie('comum', n, null, { steps: 0 });
        k.poses.flail(z);
        const dir = new THREE.Vector3(out[0], out[1], 0).normalize();
        z.root.rotation.set(0, 0, Math.atan2(-dir.x, dir.y));
        z.root.position.set(...center).addScaledVector(dir, -hip);
        z.character.body.rotation.y = yaw;
        return z;
      };
      const zs = [
        fling(0, [1.55, 1.05, 0.9], [1, 0.3], 0.6),
        fling(1, [-1.6, 1.15, 0.8], [-1, 0.35], -0.5),
        fling(5, [1.3, 2.85, 1.1], [0.55, 1], 0.4),
      ];
      return {
        card: { pos: [0.05, 1.7, -8.55], target: [0.05, 1.6, 0.3], fov: 30 },
        mini: {
          pos: [0, 1.5, -7.0],
          target: [0, 1.32, 0],
          fov: 30,
          hide: [...zs.map((z) => z.root), chips],
          // The badge: the burst itself, bigger, his head, arms and feet sticking out of it.
          before() {
            pop.scale.setScalar(1.55);
          },
        },
      };
    },
  },
  {
    id: 'vitoria-do-alem',
    build(k) {
      // Won while dead: the HERO's see-through blue ghost rises out of his own body, arms up in a V, a
      // knocked-out zombie across the far end. Shot low from the body's feet, three-quarters: the body runs from
      // the sneakers to the red cap and the ghost towers over it (a tall picture, unlike sobrevivente's).
      const body = k.avatar(HERO, 'm');
      k.lying(body, 1, [0, 0, 0.35], Math.PI / 2);
      const zs = [downed(k, 'corredor', 6, 1, [1.35, 0, 0.3], 0.25)];
      const island = k.island('grama', 2.3, 1.5, [0.25, 0, 0.35], { tint: SPOOKY.grassDark, thick: 0.12 });
      const eye = new THREE.Vector3(-4.8, 0.95, -2.0);

      const ghost = k.avatar(HERO, 'm');
      k.settle(ghost, {}, 10);
      const g = k.pp(ghost);
      g.reset();
      g.arm('R', 0.15, 0, 2.3, 0.15);
      g.arm('L', 0.15, 0, -2.3, 0.15);
      g.grip(1, 1);
      // Legs together and trailing, toes down: floating, not standing on air.
      g.leg('L', -0.15, 1.05, 0.04);
      g.leg('R', 0.0, 0.8, -0.04);
      g.turn('foot_L', -0.6);
      g.turn('foot_R', -0.5);
      g.turn('spine', 0.08, 0, 0.06);
      g.turn('head', 0.25);
      const chest = k.at(body.character.bones.chest);
      ghost.root.position.set(chest.x, 0, chest.z);
      k.face(ghost, eye);
      k.rest(ghost, 0.25);
      ghostly(ghost, 0.82);
      // The badge: the ghost alone, from in front of it.
      const front = new THREE.Vector3(-Math.sin(ghost.root.rotation.y), 0, -Math.cos(ghost.root.rotation.y));
      const look = new THREE.Vector3(chest.x, 1.22, chest.z);
      return {
        card: { pos: eye, target: [0.37, 0.89, 0.28], fov: 33 },
        mini: { pos: look.clone().addScaledVector(front, 4.6).setY(1.65), target: look, fov: 30, hide: [body.root, island, ...zs.map((z) => z.root)] },
      };
    },
  },
  {
    id: 'marceneiro',
    build(k) {
      // A barricade's boards sliding into place, and the HERO in a red hard hat raising his hammer at its end.
      // Three boards up; the fourth slides in from the nail side (bars.set 'nail') as the hammer comes down.
      const bars = new BarricadeView(k.group, k.physics, [{ id: 'estudio', eixo: 'x', centro: [0, 0, 0], largura: 1.6 }], k.sfx, k.effects);
      bars.set(0, { built: true, boards: 3, hp: 150 });
      bars.set(0, { built: true, boards: 4, hp: 150 }, 'nail');
      k.step(12, (dt) => bars.update(dt));
      const wide = bars['gaps'][0].root;

      const hero = k.avatar(dress(HERO, { id: 'capaceteObra', cores: ['#c0392f'] }, 'luvasTrabalho', 'botaTrabalho'), 'm');
      hero.root.position.set(-1.45, 0, 0.42);
      hero.root.rotation.y = -Math.PI / 2;
      k.settle(hero, {}, 40);
      const p = k.pp(hero);
      p.turn('spine', -0.1);
      p.turn('head', -0.1);
      p.leg('R', 0.25, 0.2);
      p.leg('L', -0.15, 0.1);
      p.plant();
      p.arm('R', 2.6, 0, 0.25, 1.1);
      p.grip(0.6, 1);
      reach(k, hero, 'L', new THREE.Vector3(-0.98, 1.46, 0.12));
      k.rest(hero, 0);
      // The hammer in the raised fist, its head up and back (world space: the swing's top).
      const h = hammer();
      h.position.copy(k.at(hero.character.sockets.hand_R));
      alongY(h, new THREE.Vector3(-0.55, 0.85, 0));
      k.group.add(h);

      // The badge: the sticker's hammer driving a big nail into a board end over its post (off to the side, no
      // carpenter): one bold shape. The board and post in the barricade's woods, the nail in its nail grey.
      const bench = new THREE.Group();
      bench.position.set(10, 0, 0);
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.1, 0.26), toon(0x8a6a4a));
      plank.position.set(0.0, 0.5, 0);
      plank.rotation.y = 0.1;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.32, 0.17), toon(0x5a4030));
      post.position.set(-0.28, 0.29, 0);
      const nailMat = toon(0x2a2a2e);
      const done = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 12), nailMat);
      done.position.set(0.22, 0.556, 0.05);
      const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.018, 14), nailMat);
      nail.position.set(-0.28, 0.588, -0.02);
      const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.04, 8), nailMat);
      shank.position.set(-0.28, 0.568, -0.02);
      bench.add(plank, post, done, shank, nail);
      k.group.add(bench);
      const strike = hammer();
      strike.scale.setScalar(1.5);
      // On the downswing: the handle up to the right (screen), the face coming down onto the nail.
      const face = new THREE.Vector3(-0.55, -0.83, 0).normalize();
      const grip = new THREE.Vector3(0.83, -0.55, 0).normalize();
      strike.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(face, grip, new THREE.Vector3().crossVectors(face, grip)));
      const top = new THREE.Vector3(10 - 0.28, 0.598, -0.02);
      strike.position.copy(top).addScaledVector(face, -0.14 * 1.5).addScaledVector(grip, -0.42 * 1.5);
      k.group.add(strike);
      const bang = k.stars(top.clone().add(new THREE.Vector3(0.1, 0.02, -0.06)), { count: 4, spread: 0.26, size: 0.1, dir: [1, 0.5, -0.3] });
      return {
        card: { pos: [-4.07, 1.83, 5.85], target: [-0.45, 1.15, 0.23], fov: 30, hide: [bench, strike, bang] },
        mini: { pos: [9.86, 1.48, -3.05], target: [9.8, 0.72, 0], fov: 30, hide: [wide, hero.root, h] },
      };
    },
  },
  {
    id: 'beijando-o-chao',
    build(k) {
      // Down in zombies: the HERO face down in the grass under the red revive cross, dizzy stars around his head,
      // the brute standing over him by his head, bowed, both fists together up over his head for the smash. Shot
      // low from the head end, so the face-plant is in front and the brute shows in profile (a double-fisted
      // smash, not 'hands up'); he stands on the left, clear of the counter's corner.
      const hero = k.avatar(HERO, 'm');
      k.lying(hero, -1, [-0.05, 0, 0.2], Math.PI / 2);
      const island = k.island('grama', 2.3, 1.45, [0.0, 0, 0.5], { tint: CHURCHYARD, thick: 0.12 });
      const patch = k.island('grama', 2.3, 1.1, [-0.05, 0, 0.25], { tint: CHURCHYARD });
      const head = k.at(hero.character.bones.head);
      const stars = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        stars.add(k.stars([head.x + Math.cos(a) * 0.3, head.y + 0.3, head.z + Math.sin(a) * 0.2], { count: 1, spread: 0.001, size: 0.13 }));
      }
      k.group.add(stars);
      const cross = new THREE.Sprite(new THREE.SpriteMaterial({ map: crossTexture(256), depthTest: false, depthWrite: false, transparent: true }));
      cross.scale.set(0.6, 0.6, 1);
      cross.renderOrder = 10;
      // Over his legs, so it clears the brute.
      cross.position.set(-0.55, 1.0, 0.05);
      k.group.add(cross);

      const brute = k.zombie('brutamontes', 8, null, { steps: 30 });
      brute.root.position.set(0.95, 0, 1.0);
      const back = k.at(hero.character.bones.spine);
      k.face(brute, back);
      const bow = 0.85;
      hunch(k, brute, bow, 0.55);
      const bp = k.pp(brute);
      bp.leg('L', 0.35, 0.45);
      bp.leg('R', -0.2, 0.35);
      bp.plant();
      k.rest(brute, 0);
      const s = brute.root.scale.x;
      const fwd = new THREE.Vector3(-Math.sin(brute.root.rotation.y), 0, -Math.cos(brute.root.rotation.y));
      const lift = fwd.clone().multiplyScalar(Math.sin(bow)).addScaledVector(UP, Math.cos(bow));
      const fists = k.at(brute.character.bones.head).addScaledVector(lift, 0.42 * s);
      const across = fwd.clone().cross(UP);
      reach(k, brute, 'R', fists.clone().addScaledVector(across, 0.05));
      reach(k, brute, 'L', fists.clone().addScaledVector(across, -0.05));
      bp.grip(1, 1);
      return {
        card: { pos: [4.25, 0.9, -3.0], target: [0.19, 1.01, 0.78], fov: 36, hide: [patch] },
        mini: {
          pos: [3.04, 1.42, -3.71],
          target: [0.18, 0.55, 0.11],
          fov: 30,
          hide: [brute.root, island],
          // The badge: the cross over his back, the body and the stars under it (no brute).
          before() {
            cross.position.set(0.1, 1.0, 0.2);
          },
        },
      };
    },
  },
]);
