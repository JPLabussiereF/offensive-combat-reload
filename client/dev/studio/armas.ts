// client/dev/studio/armas.ts: the armas domain's album stickers (the guns and their upgrades, the knife, the
// grenade, the gun game's ladder). See core-api.md for the kit; everything here is built from the game's own
// models (weaponModels.ts, grenades.ts, the viewmodel) and the studio cast.
import * as THREE from 'three';
import { DEFAULT_LOADOUT, gunStats, type Loadout } from '@shared/arsenal';
import { LADDER } from '@shared/gunGame';
import type { Avatar } from '../../entities/avatar';
import { Viewmodel, type ViewmodelState } from '../../render/viewmodel';
import { knifeModel } from '../../render/weaponModels';
import { grenadeModel } from '../../weapons/grenades';
import { HERO, RIVAL, dress, mood, neighbor, tweak } from './core/cast';
import { DT, type Kit } from './core/kit';
import { defineDomain, type Built, type Shot, type V3 } from './core/types';

const INK = 0x1b1530;
const ORIGIN = new THREE.Vector3();
const vtx = new THREE.Vector3();
const qa = new THREE.Quaternion();
const vec = (p: V3) =>
  (p as THREE.Vector3).isVector3 ? (p as THREE.Vector3).clone() : new THREE.Vector3(...(p as readonly [number, number, number]));

// --- Framing ------------------------------------------------------------------------------------------------------

/** A straight cut through some objects, on in the mini only (see cutAway). */
interface Cut {
  /** Whether a world point is on the kept side (in the mini). */
  keeps(p: THREE.Vector3): boolean;
  /** The meshes it cuts (fit() skips their vertices on the cut side). */
  meshes: Set<THREE.Object3D>;
  card(): void;
  mini(): void;
}

/**
 * A straight cut for the mini: the objects under `roots` lose what lies behind the plane through `at` facing
 * `normal` (they keep the side `normal` points to), in the mini only (the die-cut then wraps the straight cut,
 * like a bust sticker), so a figure can fill the badge without running off its edge. `except` keeps whole objects
 * under the roots uncut (a blade reaching past the cut). A live character's pieces own their materials (patched
 * in onBeforeCompile, which clone() would drop): they take the plane as they are; every other material (held
 * weapons and toon props share theirs with the game) is cloned first. Hand it to framed(), which turns the cut
 * on for the mini only.
 */
function cutAway(k: Kit, roots: THREE.Object3D[], normal: V3, at: V3, except: THREE.Object3D[] = []): Cut {
  const n = vec(normal).normalize();
  const constant = -n.dot(vec(at));
  const plane = new THREE.Plane(n, 1000);
  const keep = new Set<THREE.Object3D>();
  for (const e of except) e.traverse((x) => keep.add(x));
  const meshes = new Set<THREE.Object3D>();
  const cut = (x: THREE.Material) => {
    const c = Object.prototype.hasOwnProperty.call(x, 'onBeforeCompile') ? x : x.clone();
    c.clippingPlanes = [plane];
    return c;
  };
  for (const root of roots)
    root.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (!m.material || keep.has(obj)) return;
      m.material = Array.isArray(m.material) ? m.material.map(cut) : cut(m.material);
      meshes.add(obj);
    });
  return {
    keeps: (p) => n.dot(p) + constant >= 0,
    meshes,
    card() {
      k.renderer.localClippingEnabled = false;
      plane.constant = 1000;
    },
    mini() {
      k.renderer.localClippingEnabled = true;
      plane.constant = constant;
    },
  };
}

/** A bust for the mini: cut away below height `y` (or above it, `below`: legs). See cutAway. */
const bust = (k: Kit, roots: THREE.Object3D[], y: number, o: { below?: boolean; except?: THREE.Object3D[] } = {}) =>
  cutAway(k, roots, [0, o.below ? -1 : 1, 0], [0, y, 0], o.except);

/**
 * Frames a shot on what it shows: keeps the camera's line of sight and FOV, and moves it sideways and along that
 * line until the visible meshes (skinned vertices where the bones put them; the cut side of `cut` left out)
 * are centered and fill `fill` of the limiting dimension. The die-cut's band goes around that: about 0.77 keeps
 * the card's cut inside the album's 6% margin, 0.8 keeps the mini's off its edge. Runs in the shot's before().
 */
function fit(k: Kit, shot: Shot, aspect: number, fill: number, cut?: Cut) {
  const hidden = new Set(shot.hide ?? []);
  const fillX = aspect > 1 ? fill * 1.03 : fill;
  const pos = vec(shot.pos);
  const target = vec(shot.target);
  const cam = new THREE.PerspectiveCamera(shot.fov ?? 30, aspect, 0.01, 300);
  const tanY = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
  for (let iter = 0; iter < 5; iter++) {
    cam.position.copy(pos);
    if (shot.up) cam.up.copy(vec(shot.up)).normalize();
    cam.lookAt(target);
    cam.updateMatrixWorld();
    // What faces the camera (stars, confetti, bursts) turned to this one first, as the core does before a render.
    k.group.traverse((o) => {
      if (!o.userData.facecam || !o.parent) return;
      o.parent.getWorldQuaternion(qa).invert();
      o.quaternion.copy(qa).multiply(cam.quaternion);
      if (o.userData.roll) o.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), o.userData.roll));
    });
    k.group.updateMatrixWorld(true);
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    const walk = (o: THREE.Object3D) => {
      if (!o.visible || hidden.has(o)) return;
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !(o as THREE.InstancedMesh).isInstancedMesh) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const p = mesh.geometry.getAttribute('position');
        const clipped = cut?.meshes.has(o);
        if (p && mats.some((m) => m.visible))
          for (let i = 0; i < p.count; i++) {
            mesh.getVertexPosition(i, vtx).applyMatrix4(mesh.matrixWorld);
            if (clipped && !cut!.keeps(vtx)) continue;
            vtx.project(cam);
            x0 = Math.min(x0, vtx.x);
            x1 = Math.max(x1, vtx.x);
            y0 = Math.min(y0, vtx.y);
            y1 = Math.max(y1, vtx.y);
          }
      }
      for (const c of o.children) walk(c);
    };
    walk(k.group);
    if (x0 > x1) throw new Error(`fit: nada visível no quadro de ${k.id}`);
    const d = pos.distanceTo(target);
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const shift = right.multiplyScalar(((x0 + x1) / 2) * d * tanY * aspect).add(up.multiplyScalar(((y0 + y1) / 2) * d * tanY));
    target.add(shift);
    pos.add(shift);
    const grow = Math.max((x1 - x0) / 2 / fillX, (y1 - y0) / 2 / fill);
    pos.sub(target).multiplyScalar(grow).add(target);
  }
  shot.pos = [pos.x, pos.y, pos.z];
  shot.target = [target.x, target.y, target.z];
}

/**
 * The shots of `built`, each framed by fit() at the end of its before() (card: `card` of the height, default
 * 0.765; mini: `mini`, default 0.8), with the mini's `bust` cut, if any, on in the mini and off in the card.
 */
function framed(k: Kit, built: Built, o: { card?: number; mini?: number; bust?: Cut } = {}): Built {
  for (const [shot, aspect, fill, on, cut] of [
    [built.card, 4 / 3, o.card ?? 0.765, o.bust?.card, undefined],
    [built.mini, 1, o.mini ?? 0.8, o.bust?.mini, o.bust],
  ] as const) {
    const own = shot.before;
    shot.before = () => {
      own?.();
      on?.();
      fit(k, shot, aspect, fill, cut);
    };
  }
  return built;
}

/** The world-space box of the visible meshes under `root` (vertices where the matrices put them). */
function boxOf(root: THREE.Object3D): THREE.Box3 {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  root.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (o as THREE.InstancedMesh).isInstancedMesh) return;
    const p = m.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) box.expandByPoint(m.getVertexPosition(i, vtx).applyMatrix4(m.matrixWorld));
  });
  return box;
}

// --- Posing -------------------------------------------------------------------------------------------------------

/** A point given in a bone's own frame (the rig's T-pose axes: +X the character's right, +Y up, -Z its front). */
function onBone(bone: THREE.Object3D, offset: readonly [number, number, number]): THREE.Vector3 {
  bone.updateWorldMatrix(true, false);
  return bone.localToWorld(new THREE.Vector3(...offset));
}

type ArmAngles = [x: number, y: number, z: number, elbow: number];

/**
 * Puts a hand's palm (its socket, where held things sit) on a world point: a search over k.pp's arm angles
 * starting from `from`, step halving, the elbow kept between straight and fully bent. A slight pull toward
 * `from` picks, among the poses that reach, the one nearest it (start from a natural pose). After the last
 * animator call; the grip stays as it was. Returns the angles it set.
 */
function reach(k: Kit, av: Avatar, side: 'L' | 'R', target: V3, from: ArmAngles): ArmAngles {
  const p = k.pp(av);
  const palm = av.character.sockets[side === 'L' ? 'hand_L' : 'hand_R'];
  const goal = vec(target);
  const at = new THREE.Vector3();
  const cost = (a: ArmAngles) => {
    p.arm(side, ...a);
    palm.updateWorldMatrix(true, false);
    let c = palm.getWorldPosition(at).distanceTo(goal);
    for (let i = 0; i < 4; i++) c += 0.01 * Math.abs(a[i] - from[i]);
    return c;
  };
  let best: ArmAngles = [...from];
  let low = cost(best);
  for (let step = 0.4; step > 0.003; step /= 2)
    for (let better = true; better; ) {
      better = false;
      for (let i = 0; i < 4; i++)
        for (const s of [-1, 1]) {
          const a: ArmAngles = [...best];
          a[i] += s * step;
          a[3] = THREE.MathUtils.clamp(a[3], 0, 2.6);
          const c = cost(a);
          if (c < low - 1e-7) {
            best = a;
            low = c;
            better = true;
          }
        }
    }
  p.arm(side, ...best);
  av.root.updateMatrixWorld(true);
  return best;
}

/**
 * Both palms on the cheeks, elbows in (the core's panic preset stops the hands at the shoulders, palms out,
 * which reads as a shrug): after k.poses.panic and any head turn, since the hands follow the head.
 */
function handsOnCheeks(k: Kit, av: Avatar) {
  const head = av.character.bones.head;
  reach(k, av, 'L', onBone(head, [-0.11, 0.06, -0.05]), [0.35, 0.6, 0.35, 2.3]);
  reach(k, av, 'R', onBone(head, [0.11, 0.06, -0.05]), [0.35, -0.6, -0.35, 2.3]);
  k.pp(av).grip(0.15, 0.15);
}

/**
 * Turns `obj` (a child of a bone or a socket) so its local -Z, where the knife models point, runs along the world
 * direction `dir`, with its local +Y toward world `up`.
 */
function aim(obj: THREE.Object3D, dir: readonly [number, number, number], up: readonly [number, number, number] = [0, 1, 0]) {
  const parent = obj.parent!;
  parent.updateWorldMatrix(true, false);
  // Matrix4.lookAt(eye, target) puts +Z from the target to the eye: from the origin toward `dir`, -Z runs along it.
  const m = new THREE.Matrix4().lookAt(ORIGIN, new THREE.Vector3(...dir), new THREE.Vector3(...up));
  const world = new THREE.Quaternion().setFromRotationMatrix(m);
  obj.quaternion.copy(parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
}

/** The direction from one object (a socket, a bone) toward a world point or another object, for aim(). */
function toward(k: Kit, from: THREE.Object3D, to: THREE.Object3D | THREE.Vector3): [number, number, number] {
  const d = ((to as THREE.Vector3).isVector3 ? (to as THREE.Vector3).clone() : k.at(to as THREE.Object3D)).sub(k.at(from)).normalize();
  return [d.x, d.y, d.z];
}

// --- Props --------------------------------------------------------------------------------------------------------

/**
 * An ink outline around every mesh under `root`: an inverted hull, each mesh's geometry grown by `t` (in its own
 * units) on every side about its center and drawn back faces only. A small light prop (the knife's blade) then
 * reads over the die-cut's cream backing and on gold.
 */
function inkOutline(root: THREE.Object3D, t: number) {
  const ink = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  const grow = (size: number) => (size + 2 * t) / Math.max(size, t);
  for (const m of meshes) {
    const g = m.geometry.clone();
    g.computeBoundingBox();
    const c = g.boundingBox!.getCenter(new THREE.Vector3());
    const s = g.boundingBox!.getSize(new THREE.Vector3());
    g.translate(-c.x, -c.y, -c.z).scale(grow(s.x), grow(s.y), grow(s.z)).translate(c.x, c.y, c.z);
    const hull = new THREE.Mesh(g, ink);
    hull.name = 'armas:contorno';
    m.add(hull);
  }
}

/**
 * The avatar's knife as the knife model's separate parts (the held one is a single merged mesh), in the same
 * place in the hand: it can then be outlined and turned. After the last animator call.
 */
function handKnife(av: Avatar): THREE.Group {
  const held = av['knife']!;
  const knife = knifeModel('faca');
  knife.position.copy(held.position);
  held.parent!.add(knife);
  held.removeFromParent();
  return knife;
}

/** The guns in an avatar's hands and on its back, hidden (after the last animator call). */
function hideGuns(av: Avatar) {
  for (const slot of ['weapon_R', 'weapon_back'] as const) for (const o of av.character.objectsOf(slot)) o.visible = false;
}

/**
 * A comic explosion burst at `at`, `r` meters across the spikes (studio-made: at sticker size the game's fireball
 * puffs, unlit and pale, read as flat discs): a spiky red-orange layer, a yellow one and a white-hot core,
 * ink-rimmed like the hit stars and turned to the camera.
 */
function boom(k: Kit, at: THREE.Vector3, r: number, spikes = 13): THREE.Group {
  const shape = new THREE.Shape();
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i * Math.PI) / spikes + (Math.random() - 0.5) * 0.12;
    const d = (i % 2 ? 0.6 : 1) * (0.85 + Math.random() * 0.3);
    if (i) shape.lineTo(Math.cos(a) * d, Math.sin(a) * d);
    else shape.moveTo(Math.cos(a) * d, Math.sin(a) * d);
  }
  const geo = new THREE.ShapeGeometry(shape);
  const g = new THREE.Group();
  g.name = 'armas:explosao';
  // Scale, color, depth toward the camera, turn (the ink rim lies right under the outer layer).
  const layers: [number, number, number, number][] = [
    [1.07, INK, -0.02, 0],
    [1, 0xff5a1f, 0, 0],
    [0.68, 0xffc22e, 0.02, 0.24],
    [0.36, 0xfff6c8, 0.04, 0.5],
  ];
  for (const [s, color, z, turn] of layers) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.scale.setScalar(r * s);
    m.rotation.z = turn;
    m.position.z = z;
    g.add(m);
  }
  g.position.copy(at);
  g.userData.facecam = true;
  k.group.add(g);
  return g;
}

/** The knock-off lightsaber's see-through pink sheath made denser (it is drawn over the die-cut's cream). */
function pinkBlade(saber: THREE.Object3D, opacity = 0.8) {
  saber.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
    if (m?.transparent) {
      m.opacity = opacity;
      m.blending = THREE.NormalBlending;
    }
  });
}

/** The gun game's ladder as wooden steps: each RUN deep (unless given) and RISE higher than the one before. */
const RUN = 0.8;
const RISE = 0.22;

/**
 * Wooden steps from `x0`, one per entry of `runs` (its depth along X), rising toward `dir` (+1: world +X, screen
 * left; -1: screen right), `rise` higher each: boxes of the maps' wood from the ground up (k.island, so a shot can
 * hide them), in two alternating tints so each step reads apart from the next.
 */
function stairs(k: Kit, runs: number[], x0: number, dir: 1 | -1, depth = 0.9, rise = RISE): THREE.Mesh[] {
  let x = x0;
  return runs.map((run, i) => {
    const step = k.island('madeira', run, depth, [x + (dir * run) / 2, rise * (i + 1), 0], { shape: 'box', thick: rise * (i + 1), tint: i % 2 ? 0xc0844e : 0xdcab72 });
    x += dir * run;
    return step;
  });
}

/**
 * A k.gun lying in profile on a tread, as on a display shelf: right side to the -Z camera, muzzle toward world
 * -X (screen right), scaled to `length` meters long, centered on x and resting on the tread at height y.
 */
function shelfGun(k: Kit, gun: THREE.Group, x: number, y: number, z: number, length: number): THREE.Group {
  const holder = new THREE.Group();
  holder.rotation.y = Math.PI / 2;
  holder.add(gun);
  k.group.add(holder);
  const b = boxOf(holder);
  holder.scale.setScalar(length / (b.max.x - b.min.x));
  const c = boxOf(holder);
  holder.position.set(x - (c.min.x + c.max.x) / 2, 0, z);
  k.rest(holder, y);
  return holder;
}

// --- Costumes ----------------------------------------------------------------------------------------------------

/**
 * A neighbor dressed as a bowling pin: white from the top down (the skin and the shaved hair too, so the head and
 * the white skullcap make the pin's one round top), stout, a red scarf for the neck stripe, wide trousers with no
 * belt and white shoes.
 */
const PIN_WHITE = '#ece6da';
const pinLook = (n: number) =>
  tweak(
    dress(
      mood(neighbor(n), 'grande', 'arqueada'),
      'raspado',
      { id: 'basica', cores: [PIN_WHITE, PIN_WHITE] },
      { id: 'pantalona', cores: [PIN_WHITE] },
      { id: 'sapatoSocial', cores: [PIN_WHITE, PIN_WHITE] },
      { id: 'cachecol', cores: ['#c0392f', '#c0392f'] },
      { id: 'touca', cores: [PIN_WHITE] },
    ),
    { biotipo: 'gordo', pele: PIN_WHITE, cabelo: { cor: PIN_WHITE }, barba: '' },
  );

/**
 * A pin-neighbor standing stiff at `at` (feet together, no arms: they shrink into the shoulders, as if inside the
 * costume, so the body is one smooth white bottle), then tipped: `back` rad (its top away from a camera on -Z,
 * about the feet) and `roll` rad (rotation.z: < 0 tips the top toward screen left).
 */
function pin(k: Kit, seed: number, at: readonly [number, number, number], back: number, roll: number): Avatar {
  const av = k.avatar(pinLook(seed));
  const p = k.pp(av);
  p.reset();
  p.arm('L', 0, 0, -0.1, 0.05);
  p.arm('R', 0, 0, 0.1, 0.05);
  for (const side of ['L', 'R'] as const) av.character.bones[`upperArm_${side}`].scale.setScalar(0.08);
  p.leg('L', 0, 0, 0.04);
  p.leg('R', 0, 0, -0.04);
  p.body.rotation.x = back;
  av.root.position.set(...at);
  av.root.rotation.z = roll;
  return av;
}

/**
 * The HERO as the gun game's racing driver (the page's "Piloto de Fuga"): full-face helmet in his cap's red,
 * flight suit, moto pants and boots.
 */
const racer = () =>
  dress(
    HERO,
    { id: 'motoFechado', cores: ['#c0392f', '#e8e2d6', '#1b1530'] },
    { id: 'macacaoVoo', cores: ['#e8e2d6', '#c0392f', '#1b1530'] },
    { id: 'calcaMoto', cores: ['#e8e2d6', '#c0392f'] },
    { id: 'botaMoto', cores: ['#c0392f', '#1b1530'] },
  );

// --- Stickers ----------------------------------------------------------------------------------------------------

export default defineDomain('armas', [
  {
    id: 'oficina-do-seu-ze',
    build(k) {
      // Every upgrade of the rifle at once: it resolves to the dark 'fita' scope ('visual' is last-wins), the
      // silver-tape wraps, the taped double magazine and the green soda-bottle silencer.
      const gun = k.gun(gunStats('rifle', ['pontoVermelho', 'empunhadura', 'luneta', 'pente', 'silenciador']));
      // The gun runs from the stock (z +0.35) to the bottle (z -0.6): center it, right side to the -Z camera
      // (muzzle to screen right), then roll it so the muzzle rises to the upper right.
      gun.position.set(0, 0.02, 0.125);
      const inner = new THREE.Group();
      inner.rotation.y = Math.PI / 2;
      inner.add(gun);
      const outer = new THREE.Group();
      outer.add(inner);
      k.group.add(outer);
      return framed(k, {
        card: { pos: [0, 0.3, -1.78], target: [0, 0, 0], fov: 25, before: () => void outer.rotation.set(0, 0, -0.55) },
        // The badge: a hero shot from the muzzle end, the bottle silencer big in front and the rest of the gun
        // (scope, tape, double magazine) running back from it.
        mini: { pos: [-1.0, 0.35, -0.65], target: [-0.1, 0, 0], fov: 40, before: () => void outer.rotation.set(0, 0, -0.7) },
        rim: 1.2,
      });
    },
  },
  {
    id: 'facada',
    build(k) {
      // First person, as characterLab's ?view=fp: the HERO's own bare forearm (the moss tee is short-sleeved)
      // stabbing with the kitchen knife, the gun put away. The swing's own keyframes point the blade into the
      // screen (seen end-on): the fist stays near where melee 0.2 puts it, the blade is turned up and to the left.
      const vm = new Viewmodel(k.group);
      vm.setBody(HERO, 'm');
      vm.setKnife('faca');
      vm.setBladeOnly(true);
      // Standing still, mid-swing (melee 0.2 of the stab).
      const state: ViewmodelState = {
        ads: 0,
        sprint: 0,
        grounded: true,
        speed: 0,
        strafe: 0,
        mouseDX: 0,
        mouseDY: 0,
        reload: null,
        slide: 0,
        melee: 0.2,
        grenadeCook: null,
        grenadeThrow: null,
        crouch: 0,
      };
      for (let i = 0; i < 40; i++) vm.update(DT, state);
      const hand = vm['knife'];
      hand.position.set(0.13, -0.12, -0.4);
      // The blade along `dir`, its flat side to the eye (local +Y across both the line of sight and the blade),
      // rolled a little so the forearm's fold behind the fist turns away from the lens. Returns the tip.
      const stab = (dir: THREE.Vector3) => {
        const up = new THREE.Vector3().crossVectors(hand.position.clone().normalize(), dir).normalize().applyAxisAngle(dir, -0.3);
        aim(hand, [dir.x, dir.y, dir.z], [up.x, up.y, up.z]);
        return hand.localToWorld(new THREE.Vector3(0, 0, -0.32));
      };
      // The card: the blade up and to the left. The badge: its own moment, the blade almost upright with three
      // big stars at the tip and the fist in the lower right corner.
      const cardDir = new THREE.Vector3(-0.62, 0.5, -0.6).normalize();
      const miniDir = new THREE.Vector3(-0.3, 0.85, -0.45).normalize();
      const cardTip = stab(cardDir);
      const cardStars = k.stars(cardTip.clone().addScaledVector(cardDir, 0.03), { count: 6, spread: 0.06, size: 0.02, dir: [cardDir.x, cardDir.y, cardDir.z] });
      const miniTip = stab(miniDir);
      const miniStars = k.stars(miniTip.clone().addScaledVector(miniDir, 0.035), { count: 3, spread: 0.05, size: 0.03, dir: [miniDir.x, miniDir.y, miniDir.z] });
      // The forearm runs off the lower right corner (first person: the one sticker allowed to touch the edge).
      return {
        card: { pos: [0, 0, 0], target: [0.02, -0.03, -0.45], fov: 38, hide: [miniStars], before: () => void stab(cardDir) },
        mini: { pos: [0, 0, 0], target: hand.position.clone().lerp(miniTip, 0.62), fov: 30, hide: [cardStars], before: () => void stab(miniDir) },
        light: 'viewmodel',
        allowEdge: true,
      };
    },
  },
  {
    id: 'pelas-costas',
    build(k) {
      // The oblivious victim, a big neighbor in a black tee and shades, crouched and busy aiming off to screen
      // right; the HERO looms right behind him, his near hand on the victim's shoulder and the kitchen knife in
      // the far one, up by his ear, blade down at the neck (in the near hand, his own forearm hid his face).
      const yaw = 1.13; // both face screen right, turned a little toward the camera
      const look = tweak(dress(neighbor(14), { id: 'basica', cores: ['#26262b'] }, 'escuros'), { biotipo: 'gordo', altura: 'alto' });
      const brute = k.avatar(look, 'm', { armed: true });
      brute.root.rotation.y = yaw;
      k.settle(brute, { ads: true, crouch: true }, 60);
      k.hideBack(brute);

      const hero = k.avatar(mood(HERO, 'marcante', 'grossa'), 'm', { armed: true });
      hero.root.position.set(Math.sin(yaw) * 0.62, 0, Math.cos(yaw) * 0.62);
      hero.root.rotation.y = yaw;
      k.settle(hero, { knife: true }, 9);
      k.hideBack(hero);
      k.pp(hero).turn('spine', -0.15, 0, 0);
      const knife = handKnife(hero);
      hero.character.sockets.hand_L.add(knife);
      knife.position.set(-0.01, 0, 0);
      knife.scale.setScalar(2.4);
      inkOutline(knife, 0.0075);
      reach(k, hero, 'R', k.at(brute.character.bones.upperArm_R, [0, 0.08, 0]), [0.75, 0, 0.3, 0.8]);
      k.pp(hero).grip(1, 0.5);
      // The knife fist just over his ear on the card; in the badge, raised higher so the whole blade shows above
      // both heads (lower, the victim's head hid it). Either way the blade points down at the neck with its flat
      // side to that shot's camera (seen edge on, it was a dark stick at badge size).
      const card: Shot = { pos: [-0.3, 1.2, -5.0], target: [0.2, 1.04, 0.1], fov: 30 };
      const mini: Shot = { pos: [-1.4, 1.45, -1.9], target: [0.2, 1.5, 0.2], fov: 25 };
      const raise = (shot: Shot) => {
        reach(k, hero, 'L', onBone(hero.character.bones.head, shot === mini ? [-0.05, 0.42, -0.2] : [-0.1, 0.15, -0.26]), [1.8, 0, -0.3, 1.4]);
        const dir = toward(k, hero.character.sockets.hand_L, brute.character.bones.neck);
        const up = vec(shot.pos).sub(vec(shot.target)).normalize().cross(new THREE.Vector3(...dir)).normalize();
        aim(knife, dir, [up.x, up.y, up.z]);
      };
      raise(card);
      // The badge: two faces and one blade, from the victim's front right at his eye level: his face, the HERO's
      // angry one over his shoulder and the knife above them, both cut below the shoulders.
      const cut = bust(k, [hero.root, brute.root], k.at(brute.character.bones.neck).y - 0.1);
      card.before = () => raise(card);
      mini.before = () => raise(mini);
      return framed(k, { card, mini }, { bust: cut });
    },
  },
  {
    id: 'lancador',
    build(k) {
      // A lefty pitcher's windup, in profile facing screen right: grenade pouches and a bandolier, the right knee
      // kicked up, the glove arm reaching at the target and the frag (x3) cocked far back behind his head in the
      // left hand (the game's cook pose carried further). The grenade ends up at the upper left: the top right
      // stays clear for the repeats tag.
      const hero = k.avatar(dress(HERO, 'portaGranadas', 'bandoleira'), 'm', { armed: true });
      hero.root.rotation.y = 1.35;
      k.settle(hero, { cook: true, pitch: 0.15 }, 30);
      hideGuns(hero);
      const p = k.pp(hero);
      p.leg('R', 1.45, 1.6);
      p.leg('L', -0.08, 0.12);
      p.turn('spine', 0.12, 0.35, 0);
      p.turn('head', 0.05, -0.3, 0);
      p.plant();
      const own = (x: number, y: number, z: number) => hero.root.localToWorld(new THREE.Vector3(x, y, z));
      reach(k, hero, 'R', own(0.15, 1.42, -0.62), [1.5, 0, 0.1, 0.2]);
      reach(k, hero, 'L', own(-0.3, 1.72, 0.88), [-0.6, 0, -2.0, 1.2]);
      p.grip(1, 0.3);
      hero['grenade']!.scale.setScalar(3);
      k.rest(hero, 0);
      return framed(k, {
        card: { pos: [-0.2, 1.2, -4.6], target: [0, 1.1, 0], fov: 30 },
        // The badge: the whole pitcher from a little behind and below, the cocked grenade nearer the lens.
        mini: { pos: [1.3, 0.8, -4.2], target: [0, 1.1, 0], fov: 30 },
      });
    },
  },
  {
    id: 'estraga-prazer',
    build(k) {
      // That party, spoiled: the RIVAL raising the roof over a neighbor she dropped (opressor's dance) is shot
      // mid-pump, stars bursting off her head as she tips over, while the HERO fires, kneeling, from the right
      // (the top right stays clear for the repeats tag).
      const body = k.avatar(neighbor(9));
      k.lying(body, 1, [0.15, 0, 0.3], -Math.PI / 2);
      const island = k.island('grama', 3.3, 1.6, [-0.3, 0, 0.4]); // under all three, the kneeling HERO too
      const rival = k.avatar(mood(RIVAL, 'grande', 'arqueada'));
      rival.root.position.set(0.4, 0, 0.9);
      rival.dance(0.48);
      rival.character.body.rotation.set(0.1, 0, -0.42); // tipping toward screen left, away from the shot
      const stars = k.stars(k.at(rival.character.bones.head, [-0.22, 0.06, -0.1]), { count: 10, spread: 0.3, dir: [-0.6, 1, 0] });
      const hands = k.at(rival.character.bones.hand_L).lerp(k.at(rival.character.bones.hand_R), 0.5);
      const confetti = k.confetti([hands.x, hands.y - 0.05, hands.z], { count: 10, spread: 0.35 });
      const hero = k.avatar(HERO, 'm', { armed: true });
      hero.root.position.set(-1.2, 0, -0.15);
      k.face(hero, [0.4, 0, 0.9]);
      k.settle(hero, { ads: true, crouch: true, pitch: 0.2 }, 40);
      hero.fire();
      k.settle(hero, { ads: true, crouch: true, pitch: 0.2 }, 1);
      k.hideBack(hero);
      k.muzzleFlash(hero, { size: 0.45 });
      // The badge's own burst: fewer stars on the far side of her head (her surprised face shows) and five big
      // chips over her raised hands.
      const miniStars = k.stars(k.at(rival.character.bones.head, [-0.32, 0.06, -0.1]), { count: 6, spread: 0.26, dir: [-0.6, 1, 0] });
      const miniConfetti = k.confetti([hands.x, hands.y + 0.1, hands.z], { count: 5, spread: 0.2, size: 0.2 });
      return framed(
        k,
        {
          card: { pos: [-0.25, 1.4, -5.6], target: [-0.2, 1.0, 0.35], fov: 30, hide: [miniStars, miniConfetti] },
          // The badge: her raised arms and the burst on her head.
          mini: { pos: [0.5, 1.75, -2.8], target: [0.35, 1.72, 0.8], fov: 30, hide: [hero.root, body.root, island, stars, confetti] },
          rim: 1.2,
        },
        { bust: bust(k, [rival.root], 1.0) },
      );
    },
  },
  {
    id: 'vinganca',
    build(k) {
      // Kill Bill: the HERO in the yellow tracksuit with black stripes over the neighbor who killed him last,
      // face down at his feet, the pink knock-off lightsaber (the blade-only loadout of the gun game's last step)
      // in both hands, pointed down at the killer's back.
      const look = dress(
        mood(HERO, 'marcante', 'grossa'),
        { id: 'agasalho', cores: ['#e6c23a', '#1f2226'] },
        { id: 'calcaAgasalho', cores: ['#e6c23a', '#1f2226'] },
        { id: 'tenis', cores: ['#e6c23a', '#1f2226', '#1f2226'] },
      );
      const loadout: Loadout = { ...DEFAULT_LOADOUT, ativas: { ...DEFAULT_LOADOUT.ativas, faca: ['sabre'] }, soFaca: true };
      const hero = k.avatar(look, 'm', { armed: true, loadout });
      hero.root.rotation.y = 0.55; // turned toward the body (screen right): a side stripe shows
      k.settle(hero, { blade: true }, 40);
      const killer = k.avatar(neighbor(18));
      k.lying(killer, -1, [-1.05, 0, -0.3], -Math.PI / 2);
      const island = k.island('grama', 2.4, 1.05, [-0.8, 0, -0.2]);
      const saber = k.saber(hero);
      saber.scale.setScalar(1.6);
      pinkBlade(saber);
      const own = (x: number, y: number, z: number) => hero.root.localToWorld(new THREE.Vector3(x, y, z));
      const back = k.at(killer.character.bones.chest, [0, 0.1, 0]);
      // Both hands on the hilt, the right one first, the left one under it toward the pommel. The card: a low
      // guard, the fists in front of his belly and the blade down at the killer's back. The badge: a guard across
      // the chest, from his right hip up past his left shoulder (unlike volta-olimpica's raised torch), so the
      // bust stays compact and his angry face big.
      const guard = (mini: boolean) => {
        reach(k, hero, 'R', mini ? own(0.17, 0.98, -0.3) : own(0.02, 1.02, -0.36), [0.9, 0, 0.1, 1.0]);
        aim(saber, toward(k, hero.character.sockets.hand_R, mini ? own(-0.45, 1.9, -0.32) : back));
        reach(k, hero, 'L', saber.localToWorld(new THREE.Vector3(0, 0, 0.055)), [0.9, 0, -0.1, 1.0]);
        k.pp(hero).grip(1, 1);
      };
      guard(false);
      const cut = bust(k, [hero.root], 0.86, { except: [saber] });
      return framed(
        k,
        {
          card: { pos: [-0.4, 0.75, -5.0], target: [-0.7, 0.8, -0.2], fov: 30, before: () => guard(false) },
          mini: { pos: [-0.6, 1.5, -2.4], target: [-0.15, 1.35, 0], fov: 24, hide: [killer.root, island], before: () => guard(true) },
          rim: 1.2,
        },
        { bust: cut },
      );
    },
  },
  {
    id: 'kamikaze',
    build(k) {
      // Your own grenade, and you took her with you: one cartoon blast flinging the HERO and the RIVAL apart
      // among confetti fireworks, the pin's ring still in his hand.
      const blast = boom(k, new THREE.Vector3(0, 1.15, 0.35), 1.15);
      const hero = k.avatar(mood(HERO, 'grande', 'arqueada'));
      const rival = k.avatar(mood(RIVAL, 'grande', 'arqueada'));
      // A dozen big chips on the burst's top (spread above it, they would close into a cream cloud).
      const confetti = k.confetti([0.05, 1.78, 0.2], { count: 12, spread: 0.45, size: 0.2 });
      // The badge's own fireworks: four big chips touching the two heads.
      const sparkle = k.confetti([0, 1.86, -0.12], { count: 4, spread: 0.13, size: 0.17 });
      const cut = bust(k, [hero.root, rival.root], 1.28);
      // The punchline: the ring (k.pinPulled finds it) out at the end of his flung arm, big and ink-rimmed: his
      // own grenade.
      const ring = k.pinPulled(grenadeModel());
      ring.removeFromParent();
      ring.position.set(0.05, -0.02, 0);
      ring.scale.setScalar(9.5);
      inkOutline(ring, 0.004);
      hero.character.sockets.hand_R.add(ring);
      // The card: flung apart, feet toward the blast and heads outward (rotation.z < 0 tips the top toward screen
      // left). The badge, a hidden sticker's, shows who and not how: the two of them cheek to cheek, hands on
      // their cheeks, eyes up at the chips (the emoji's fireworks), no blast.
      const place = (flung: boolean) => {
        for (const av of [hero, rival]) k.poses[flung ? 'flail' : 'panic'](av);
        hero.root.position.set(flung ? 0.55 : 0.25, flung ? 1.05 : 0, 0);
        hero.character.body.rotation.z = flung ? -0.95 : 0.05;
        rival.root.position.set(flung ? -0.5 : -0.25, flung ? 0.7 : 0, flung ? 0.1 : 0);
        rival.character.body.rotation.z = flung ? 1.05 : -0.05;
        if (flung) return;
        k.pp(hero).turn('head', 0.3, -0.1, 0.15);
        k.pp(rival).turn('head', 0.3, 0.1, -0.15);
        handsOnCheeks(k, hero);
        handsOnCheeks(k, rival);
      };
      return framed(
        k,
        {
          card: { pos: [0, 1.4, -7.6], target: [0.05, 1.38, 0], fov: 30, hide: [sparkle], before: () => place(true) },
          mini: { pos: [0, 1.5, -3.0], target: [0, 1.55, 0], fov: 23, hide: [blast, confetti, ring], before: () => place(false) },
        },
        { bust: cut },
      );
    },
  },
  {
    id: 'strike',
    build(k) {
      // Bowling, from the bowler's end: six neighbors dressed as pins (white from the round top down, a red neck
      // stripe) in the 1-2-3 triangle at the end of a lane with its dark gutters, scattering from a grenade (x3,
      // pin pulled) going off under the head pin: it flies highest, the second row tips outward, the back row
      // only leans.
      const lane = k.island('madeira', 1.4, 2.3, [0, 0, 0.55], { shape: 'box', tint: 0xe2b77c });
      const gutters = [-1, 1].map((s) => k.island('asfalto', 0.22, 2.3, [s * 0.81, -0.06, 0.55], { shape: 'box', tint: 0x2b2a33 }));
      // Spot on the lane (x, z), then the flight: lift, back tip, sideways roll; seed.
      const spots: [x: number, z: number, lift: number, back: number, roll: number, seed: number][] = [
        [0, 0, 0.75, 0.3, -0.1, 7],
        [0.5, 0.6, 0.42, 0.08, -0.92, 2],
        [-0.5, 0.6, 0.38, 0.08, 0.95, 16],
        [0.88, 1.2, 0.0, 0.04, -0.36, 10],
        [0, 1.2, 0.0, 0.16, 0.05, 18],
        [-0.88, 1.2, 0.0, 0.04, 0.38, 1],
      ];
      const pins = spots.map(([x, z, lift, back, roll, seed]) => pin(k, seed, [x, lift, z], back, roll).root);
      const grenade = grenadeModel();
      k.pinPulled(grenade);
      grenade.scale.setScalar(3);
      grenade.position.set(0, 0.22, -0.22);
      grenade.rotation.z = 1.2;
      k.group.add(grenade);
      const blast = boom(k, new THREE.Vector3(0, 0.32, 0), 0.34, 11);
      // The badge's own pins, away from the lane: one big pin tipping to the left, a second well behind it falling
      // the other way, and the grenade going off at the front one's feet.
      const mx = 30;
      const badge: THREE.Object3D[] = [pin(k, 5, [mx + 0.1, 0, 0], 0.04, -0.44).root, pin(k, 12, [mx - 0.6, 0.05, 2.4], 0.1, 0.42).root];
      const g2 = grenadeModel();
      k.pinPulled(g2).visible = false;
      g2.scale.setScalar(3);
      g2.position.set(mx - 0.22, 0.2, -0.35);
      g2.rotation.z = 1.2;
      k.group.add(g2);
      badge.push(g2, boom(k, new THREE.Vector3(mx - 0.18, 0.3, -0.15), 0.3, 11));
      return framed(k, {
        // From the bowler's end, about 30 degrees down the lane, so the rows of the triangle show apart.
        card: { pos: [0, 3.8, -4.7], target: [0, 0.8, 0.5], fov: 30, hide: badge },
        mini: { pos: [mx, 1.0, -4.0], target: [mx, 0.9, 0], fov: 26, hide: [lane, ...gutters, ...pins, grenade, blast] },
      });
    },
  },
  {
    id: 'corredor',
    build(k) {
      // The gun game's ladder as wooden stairs rising to screen right, its last rungs' guns lying in profile on
      // their treads with the muzzles up the stairs (Rifle Silenciado with its bottle, Pistola Ligeira, Pistola da
      // Batata) and the pink lightsaber standing on the landing at the top.
      // A ladder: steps from x0, guns on all but the last step, the saber standing on that one `saberX` from its
      // start, everything `scale` times the card's size. The rifle runs longer than its tread so its slim profile
      // still reads.
      const ladder = (x0: number, runs: number[], rise: number, guns: number, scale: number, saberX: number) => {
        const parts: THREE.Object3D[] = stairs(k, runs, x0, -1, 0.9, rise);
        let x = x0;
        LADDER.slice(6 - guns, 6).forEach((rung, i) => {
          if (rung.arma === 'faca') return; // (never: these rungs are guns; this narrows the type)
          const length = (rung.arma === 'rifle' ? 0.95 : 0.66) * scale;
          parts.push(shelfGun(k, k.gun(gunStats(rung.arma, rung.melhorias)), x - runs[i] / 2, rise * (i + 1), -0.15, length));
          x -= runs[i];
        });
        // The prize, bigger and thicker than the rest so its pink reads at badge size.
        const saber = knifeModel('sabre');
        pinkBlade(saber, 0.9);
        saber.rotation.x = Math.PI / 2;
        const top = new THREE.Group();
        top.scale.set(3.0, 1.7, 3.0).multiplyScalar(scale);
        top.add(saber);
        top.position.set(x - saberX, 3, -0.1);
        k.group.add(top);
        k.rest(top, rise * runs.length);
        parts.push(top);
        return parts;
      };
      // The card: the last three guns on wide treads and the saber on the landing, left of the repeats tag's corner.
      const card = ladder(1.6, [RUN, RUN, RUN, 1.3], RISE, 3, 1, 0.16);
      // The badge: a steeper ladder of its own (away from the card's), side-on: the page's one zigzag shape.
      const mx = 30;
      const badge = ladder(mx + 1.25, [0.5, 0.5, 0.5, 0.5, 0.5], 0.34, 4, 0.62, 0.25);
      return framed(k, {
        // About 22 degrees above, so the treads show between the risers.
        card: { pos: [-0.2, 3.4, -6.4], target: [-0.2, 0.8, 0], fov: 30, hide: badge },
        mini: { pos: [mx, 1.0, -7.0], target: [mx, 0.95, 0], fov: 30, hide: card },
      });
    },
  },
  {
    id: 'volta-olimpica',
    build(k) {
      // The victory lap: the HERO as the gun game's racing driver, mid-stride in profile, leaning into the run
      // and carrying the pink lightsaber forward and up like the Olympic torch.
      const hero = k.avatar(racer());
      hero.root.rotation.y = -1.3;
      for (let i = 0; i < 62; i++) hero.walk(DT, 7);
      const p = k.pp(hero);
      p.turn('spine', -0.2, 0, 0);
      p.arm('R', 2.5, 0, 0.2, 0.2);
      p.grip(0.2, 1);
      const saber = k.saber(hero);
      saber.scale.setScalar(1.4);
      pinkBlade(saber, 0.9);
      aim(saber, [0.35, 1, -0.1]);
      k.rest(hero, 0);
      return framed(
        k,
        {
          card: { pos: [0.3, 1.45, -6.6], target: [0, 1.25, 0], fov: 30 },
          // The badge: the red helmet and the raised saber.
          mini: { pos: [0.3, 1.95, -3.2], target: [0, 1.9, 0], fov: 30 },
        },
        { bust: bust(k, [hero.root], 0.95) },
      );
    },
  },
  {
    id: 'esfaqueador',
    build(k) {
      // Knocked down the ladder: on the top step the racer HERO stabs with his kitchen knife (x2.4) and the
      // neighbor he hit tumbles backward head first down the stairs, the blade's tip at his chest, his
      // potato-silenced pistol flying.
      const x0 = -1.2;
      const steps = stairs(k, [RUN, RUN, RUN], x0, 1);
      const hero = k.avatar(racer(), 'm', { armed: true });
      hero.root.position.set(x0 + RUN * 2.6, RISE * 3, 0);
      hero.root.rotation.y = Math.PI / 2; // down the stairs, toward screen right
      k.settle(hero, { knife: true }, 15); // the slash, arm out at him
      k.hideBack(hero);
      const knife = handKnife(hero);
      knife.scale.setScalar(2.4);
      inkOutline(knife, 0.007);
      const stab = new THREE.Vector3(-0.74, -0.66, -0.1).normalize();
      aim(knife, [stab.x, stab.y, stab.z]);
      const tip = knife.localToWorld(new THREE.Vector3(0, 0, -0.3));
      // The victim: facing up the stairs at him, arms flung, tipped past flat (head first down the stairs, about
      // the feet), then moved so his chest, facing up, meets the blade coming down on it. His legs stay along the
      // body, knees a little bent, below the blade's line (flexed, they rose into it and hid it).
      const victim = k.avatar(mood(neighbor(8), 'grande', 'arqueada'));
      victim.root.rotation.y = -Math.PI / 2;
      const q = k.pp(victim);
      q.reset();
      q.leg('L', -0.15, 0.7, 0.06);
      q.leg('R', 0.05, 0.4, -0.06);
      q.arm('L', 1.7, 0, -1.1, 0.4);
      q.arm('R', 2.5, 0, 0.7, 0.3);
      q.turn('head', 0.35);
      q.grip(0.2, 0.2);
      q.body.rotation.x = 1.85;
      victim.root.updateMatrixWorld(true);
      victim.root.position.add(tip.clone().addScaledVector(stab, 0.12).sub(k.at(victim.character.bones.chest)));
      k.stars(tip, { count: 6, spread: 0.2, dir: [0.4, 1, -0.2] });
      const pistol = k.gun(gunStats('pistola', ['batata']));
      pistol.scale.setScalar(3.5);
      pistol.position.copy(k.at(victim.character.sockets.hand_R, [-0.25, -0.15, -0.15]));
      pistol.rotation.set(0.4, 1.4, 2.4);
      inkOutline(pistol, 0.004);
      // The badge: the falling neighbor, cut at the knees, with a knife of its own at his chest (the HERO and his
      // knife go with hero.root) and the stars, from a camera tilted so he falls down across the square.
      const knife2 = knifeModel('faca');
      inkOutline(knife2, 0.007);
      knife.updateWorldMatrix(true, false);
      knife.matrixWorld.decompose(knife2.position, knife2.quaternion, knife2.scale);
      k.group.add(knife2);
      const chest = k.at(victim.character.bones.chest);
      const cut = cutAway(k, [victim.root], [-1, 0, 0], [chest.x + 0.8, 0, 0]);
      return framed(
        k,
        {
          card: { pos: [0.0, 1.4, -6.6], target: [-0.1, 0.9, 0], fov: 30, hide: [knife2] },
          mini: { pos: [chest.x, chest.y + 0.3, -3.0], target: chest, up: [0.45, 0.89, 0], fov: 30, hide: [hero.root, ...steps, pistol] },
        },
        { bust: cut },
      );
    },
  },
  {
    id: 'tiro-no-pe',
    build(k) {
      // Your own grenade: the HERO frozen in panic (hands on his face, knees knocked, bent over it) above an
      // oversized live frag by his right sneaker, its ring flying and the fuse sparking. A low camera close to the
      // grenade makes it loom.
      const hero = k.avatar(mood(HERO, 'grande', 'arqueada'));
      k.poses.panic(hero);
      // Bent over it, knees knocked, staring down at it by his right foot.
      const p = k.pp(hero);
      p.leg('L', 0.5, 0.95, 0.17);
      p.leg('R', 0.5, 0.95, -0.17);
      p.turn('spine', -0.35, -0.15, 0);
      p.turn('chest', -0.12);
      p.turn('head', -0.3, -0.3, 0);
      p.plant();
      handsOnCheeks(k, hero);
      k.rest(hero, 0);
      const grenade = grenadeModel();
      const ring = k.pinPulled(grenade);
      grenade.scale.setScalar(3.4);
      grenade.position.set(0.36, 1, -0.22);
      grenade.rotation.set(0, 0.4, 0.22);
      k.group.add(grenade);
      k.rest(grenade, 0);
      k.stars(grenade.localToWorld(new THREE.Vector3(0, 0.1, 0)), { count: 7, spread: 0.2, size: 0.07, color: 0xffd23f });
      // The ring, flown clear of the sparks to the left of the grenade, bigger and ink-rimmed against the page.
      ring.removeFromParent();
      ring.scale.setScalar(5.1);
      ring.position.set(0.8, 0.48, -0.32);
      ring.rotation.set(0.25, 0.3, 0.6);
      inkOutline(ring, 0.004);
      k.group.add(ring);
      // The badge: the joke itself, low and close at his right foot: the sparking grenade big in front, the
      // sneaker beside it, his knock-kneed shins cut flat above.
      const cut = bust(k, [hero.root], 0.68, { below: true });
      return framed(
        k,
        {
          card: { pos: [0.95, 0.5, -2.7], target: [0.12, 0.8, 0], fov: 34 },
          mini: { pos: [0.2, 0.32, -1.35], target: [0.22, 0.3, -0.1], fov: 30, hide: [ring] },
          rim: 1.2,
        },
        { bust: cut },
      );
    },
  },
]);
