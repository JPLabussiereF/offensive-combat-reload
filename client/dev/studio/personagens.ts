// Sticker studio, the personagens domain: the album's people stickers on the "Jeitos de matar", "Opressão" and
// "Sequências" pages (see core-api.md, kept next to the plan). The HERO (red cap) is "you" and earns every
// sticker; the victims rotate among neighbors, and the RIVAL gets a win (oportunista's kill) and a loss she earned
// (troco, the payback for oppressing you).
import * as THREE from 'three';
import type { Appearance } from '@shared/appearance';
import type { Avatar } from '../../entities/avatar';
import { toonGradient } from '../../render/materials';
import { CorpseTimer } from '../../ui/corpseTimer';
import { flamingoGeometry } from '../../world/decor';
import { FireBreath } from '../../world/oriental';
import type { SurfaceKey } from '../../world/surfaces';
import { dress, HERO, mood, neighbor, RIVAL, tweak } from './core/cast';
import type { Kit } from './core/kit';
import { defineDomain, type V3 } from './core/types';

const v3 = (p: V3) => ((p as THREE.Vector3).isVector3 ? (p as THREE.Vector3).clone() : new THREE.Vector3(...(p as [number, number, number])));

/**
 * Hit stars on a ring around `at` as a camera at `eye` sees it (k.stars scatters them at random, which reads as a
 * dizzy halo; a ring around one point reads as a burst from it): one k.stars star per [angle in degrees (0 =
 * screen right, 90 = up), distance m, size m], pulled `lift` m toward the camera so the body they burst from
 * never covers them. Returns the stars (to hide them in a shot).
 */
function ring(k: Kit, at: THREE.Vector3, eye: V3, stars: readonly (readonly [number, number, number])[], o: { lift?: number; color?: number } = {}): THREE.Group[] {
  const f = v3(at).sub(v3(eye)).normalize();
  const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, f);
  return stars.map(([deg, r, size]) => {
    const a = THREE.MathUtils.degToRad(deg);
    const p = at.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).addScaledVector(f, -(o.lift ?? 0.08));
    return k.stars(p, { count: 1, spread: 1e-4, size, color: o.color });
  });
}

/**
 * A comic impact burst (a studio extra, like the hit stars): a jagged starburst in the stars' yellow with a red
 * core, ink-rimmed so it reads on gold, facing the camera, `r` meters to its spike tips, pulled `lift` m toward
 * `eye` so the face it hits never covers it. The spikes are uneven (seeded), as drawn by hand.
 */
function pow(k: Kit, at: THREE.Vector3, eye: V3, r: number, o: { spikes?: number; lift?: number } = {}): THREE.Group {
  const n = o.spikes ?? 11;
  const tips = Array.from({ length: n }, () => 0.72 + Math.random() * 0.28);
  const shape = (scale: number) => {
    const s = new THREE.Shape();
    for (let i = 0; i < n * 2; i++) {
      const rr = (i % 2 ? 0.5 : tips[i / 2]) * scale;
      const a = Math.PI / 2 + (i * Math.PI) / n;
      if (i) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    return new THREE.ShapeGeometry(s);
  };
  const g = new THREE.Group();
  g.name = 'estudio:impacto';
  const layer = (scale: number, color: number, z: number) => {
    const m = new THREE.Mesh(shape(scale * r), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.position.z = z;
    g.add(m);
  };
  layer(1.16, 0x1b1530, -0.004);
  layer(1, 0xffe14d, 0);
  layer(0.5, 0xff3b2f, 0.004);
  g.position.copy(at).addScaledVector(v3(eye).sub(at).normalize(), o.lift ?? 0.06);
  g.userData.facecam = true;
  g.userData.roll = Math.random() * 0.6;
  k.group.add(g);
  return g;
}

/**
 * A point given in a bone's own frame (at rest every bone is aligned with the body: +Y up, -Z forward), in world
 * space: a forehead, a groin. After the last pose call and the bone tweaks.
 */
function local(bone: THREE.Object3D, x: number, y: number, z: number): THREE.Vector3 {
  bone.updateWorldMatrix(true, false);
  return bone.localToWorld(new THREE.Vector3(x, y, z));
}

/** Turns a bone further by an Euler in its parent's frame (on top of the pose it has). */
function bend(bone: THREE.Object3D, x: number, y = 0, z = 0) {
  bone.quaternion.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)));
}

/**
 * Cuts an avatar flat where `plane` says (everything on its negative side goes), so a bust closes into one
 * sticker instead of running off the picture's bottom edge. The body's pieces own their materials (k.avatar
 * doesn't bake), so they take the plane as they are (cloning would drop their onBeforeCompile patch); the guns in
 * the hands share heldWeapons' cached materials, so those are cloned first. Seen from above the cut, the open end
 * faces away from the camera: no hollow shows. The plane can move per shot (Shot.before). Local clipping is a
 * switch of the whole renderer: each shot turns it on (or off) in its before(), with `clipping`.
 */
function clip(av: Avatar, plane: THREE.Plane) {
  const shared = new Set<THREE.Object3D>();
  for (const slot of ['weapon_R', 'weapon_back'] as const) for (const o of av.character.objectsOf(slot)) o.traverse((m) => shared.add(m));
  av.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const own = (m: THREE.Material) => {
      const c = shared.has(o) ? m.clone() : m;
      c.clippingPlanes = [plane];
      return c;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
  });
}

/** Turns the renderer's local clipping on or off for the next shot (a page-wide switch: set it in every shot). */
function clipping(k: Kit, on: boolean) {
  k.renderer.localClippingEnabled = on;
}

/**
 * A bust's cut seen from `eye`: the plane through the eye and a level line through `at`, so the cut shows as
 * one straight line on the picture (a level cut drops lower at the chest, nearer the lens, and runs off the
 * bottom). Keeps what is above the line.
 */
function viewCut(eye: V3, at: V3): THREE.Plane {
  const p = v3(at);
  const ahead = p.clone().sub(v3(eye));
  const right = new THREE.Vector3().crossVectors(ahead, new THREE.Vector3(0, 1, 0)).normalize();
  return new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3().crossVectors(right, ahead).normalize(), p);
}

/**
 * Doubled over in pain, deeper than the core's ouch (which reads as a mild crouch at card size): a big bow at the
 * hips with the butt out, knees knocked and bent, both hands cupping the groin, the face up in a grimace.
 */
function doubledOver(k: Kit, av: Avatar) {
  const p = k.pp(av);
  p.reset();
  // The thighs turn with the hips: give the bow back to them, plus the bend.
  p.turn('hips', -0.75);
  // Thighs well forward and knees bent: the hips (butt out) behind the feet, so the level back balances.
  p.leg('L', 1.5, 1.3, 0.2);
  p.leg('R', 1.5, 1.3, -0.2);
  p.turn('spine', -0.55);
  p.turn('chest', -0.3);
  p.turn('neck', 0.5);
  p.turn('head', 0.5);
  p.arm('L', 0.75, 0, 0.25, 0.7);
  p.arm('R', 0.75, 0, -0.25, 0.7);
  p.grip(0.8, 0.8);
  p.plant();
}

/**
 * A low kick (the core has no kick preset): the right leg swung forward and low with the knee nearly straight,
 * the standing leg bent, the torso leaning back over it, the arms out for balance (left forward, right back), the
 * head down at the target.
 */
function kick(k: Kit, av: Avatar) {
  const p = k.pp(av);
  p.reset();
  p.leg('R', 0.85, 0.15, 0);
  p.leg('L', -0.12, 0.3, 0);
  p.turn('spine', 0.18);
  p.turn('chest', 0.06);
  p.turn('head', -0.4);
  p.arm('L', 0.7, 0, -0.75, 0.45);
  p.arm('R', -0.55, 0, 0.7, 0.35);
  p.grip(0.85, 0.85);
  p.plant();
}

/**
 * A baseball slide, feet first (the game's slide bends both knees under the hips and reads as sitting at card
 * size): the seat low, the torso leaning back, the lead (right, near) leg straight out along the ground and the
 * trailing one a little bent, the near arm up for balance and the far hand trailing on the ground. Speed lines and
 * dust carry the motion.
 */
function slide(k: Kit, av: Avatar) {
  const p = k.pp(av);
  p.reset();
  // The seat on the ground.
  p.hipsY(-0.72);
  // The thighs turn with the hips (tipping them back swings the thighs forward).
  p.turn('hips', 0.35);
  p.leg('R', 1.1, 0.05, 0);
  // The trailing leg bent a little (folded under, its knee lifts the seat off the ground; straight, both legs
  // read as lying down).
  p.leg('L', 1.0, 0.75, -0.05);
  p.turn('spine', 0.2);
  p.turn('chest', 0.08);
  p.turn('head', -0.35);
  p.arm('R', 2.6, 0, 0.35, 0.3);
  p.arm('L', -0.85, 0, -0.5, 0.15);
  p.grip(0.3, 0.9);
}

/**
 * Comic speed lines trailing behind a moving figure (a studio extra, like the hit stars): flat ink strokes facing
 * the camera, drawn from `from` (a bone) back along the world direction `back`, one per [up m, length m, along
 * offset m]. Returns them (to hide them in a shot).
 */
function speedLines(k: Kit, from: THREE.Object3D, back: V3, strokes: readonly (readonly [number, number, number])[]): THREE.Mesh[] {
  const o = local(from, 0, 0, 0);
  const d = v3(back).normalize();
  const mat = new THREE.MeshBasicMaterial({ color: 0x1b1530, side: THREE.DoubleSide });
  return strokes.map(([up, len, along]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.035), mat);
    m.position.copy(o).addScaledVector(d, 0.45 + along + len / 2).y += up - 0.35;
    // Turned to face a camera on -Z, the long side along `back`.
    m.rotation.y = -Math.atan2(d.z, d.x);
    k.group.add(m);
    return m;
  });
}

/**
 * The countdown ring of CorpseTimer.countdown() (client/ui/corpseTimer.ts: the translucent ink disc, the faint
 * track, the arc in the game's green/yellow/red, the seconds in white Lilita One), redrawn alone at twice its
 * resolution and without the [E] key under it: a badge's one round shape. `size` is the disc's diameter (m).
 */
function countdownRing(left: number, total: number, size: number): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const frac = Math.max(0, left / total);
  const mid = 128;
  g.fillStyle = 'rgba(27,21,48,0.8)';
  g.beginPath();
  g.arc(mid, mid, 124, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 20;
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.beginPath();
  g.arc(mid, mid, 100, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = frac > 0.5 ? '#7dff5a' : frac > 0.25 ? '#ffd23f' : '#ff4a3d';
  g.beginPath();
  g.arc(mid, mid, 100, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
  g.stroke();
  g.fillStyle = '#ffffff';
  g.font = '400 104px "Lilita One", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(Math.ceil(left)), mid, mid + 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sprite.scale.setScalar((size * 256) / 248);
  return sprite;
}

/**
 * A dead body lying on its own island of a map surface: `look` on its back (dir 1) or face down (-1), centered on
 * `center`, the head toward the world direction `head` (π/2: screen left for a camera on -Z). The island is a
 * little longer and wider than the body. Returns both (to hide or frame them).
 */
function bodyOn(k: Kit, look: Appearance, dir: 1 | -1, center: V3, head: number, surface: SurfaceKey, o: { w?: number; d?: number; tint?: THREE.ColorRepresentation } = {}) {
  const body = k.avatar(look);
  k.lying(body, dir, center, head);
  const c = v3(center);
  // The island's long side along the body.
  const along = Math.abs(Math.sin(head)) > Math.abs(Math.cos(head));
  const w = o.w ?? 2.3;
  const d = o.d ?? 1.0;
  const island = k.island(surface, along ? w : d, along ? d : w, [c.x, c.y, c.z], { tint: o.tint });
  return { body, island };
}

export default defineDomain('personagens', [
  {
    id: 'na-testa',
    build(k) {
      // An armed neighbor caught by a headshot, as a bust: head snapped back, a comic impact burst on his forehead
      // and the game's yellow hit stars flying off it. Hip pose (not ADS) and turned 0.55 rad, so the rifle crosses
      // the chest, not the face.
      const av = k.avatar(mood(neighbor(8), 'grande', 'arqueada'), undefined, { armed: true });
      av.root.rotation.y = 0.55;
      k.settle(av, {}, 30);
      // Shot from the camera's side: the torso jerks back along the bullet's path.
      av.hitReact(new THREE.Vector3(0, 1.6, -6));
      k.settle(av, {}, 2);
      k.hideBack(av);
      const { head, neck, chest } = av.character.bones;
      // The jerk, bigger than the game's: chest back, and the head snapped back but turned to the lens (the body
      // stays turned, for the rifle).
      bend(chest, 0.1);
      bend(neck, 0.1, -0.3);
      bend(head, 0.22, -0.2, 0.1);
      const card: V3 = [0.1, 1.72, -1.9];
      const brow = local(head, 0, 0.16, -0.11);
      // The hit: a comic impact burst right on the forehead (a dome of stars all around the head read as a dizzy
      // halo), and a trail of the game's yellow stars flying off it, up and back with the snap of the head (one
      // trail, touching: stars spread around the head close a pocket the die-cut rims in ink).
      pow(k, brow, card, 0.075, { lift: 0.06 });
      const far = ring(k, brow, card, [
        [118, 0.12, 0.034],
        [128, 0.19, 0.029],
        [136, 0.255, 0.024],
        [62, 0.12, 0.026],
      ]);
      const cut = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      clip(av, cut);
      const mini: V3 = [0.07, 1.62, -0.96];
      return {
        card: {
          pos: card,
          target: [-0.12, 1.475, 0],
          fov: 30,
          before() {
            clipping(k, true);
            cut.constant = -1.17;
          },
        },
        // The mini: the face and the burst on a bust cut under the shoulders (through the lens: a straight line),
        // without the rifle or the flying stars; the arms hang (only here: the card is already rendered), so no
        // hand floats over the cut.
        mini: {
          pos: mini,
          target: [0.02, 1.565, 0],
          fov: 30,
          hide: [...av.character.objectsOf('weapon_R'), ...far],
          before() {
            const p = k.pp(av);
            p.arm('L', 0.05, 0, -0.12, 0.1);
            p.arm('R', 0.05, 0, 0.12, 0.1);
            clipping(k, true);
            cut.copy(viewCut(mini, [0.02, 1.36, 0]));
          },
        },
      };
    },
  },
  {
    id: 'no-passaro',
    build(k) {
      // "No pássaro!": a neighbor doubled over, knees knocked, both hands at the groin, where the game's hit
      // stars pop; beside him the Rua's pink lawn flamingo (the only bird around) looks away, innocent ("os
      // flamingos não têm culpa de nada").
      // A sky-blue tee over dark jeans: the yellow pop reads on the denim, the tee keeps him from being a dark
      // blot on the red page, and nothing in him is the HERO's moss green.
      const av = k.avatar(mood(dress(neighbor(18), { id: 'basica', cores: ['#4aa8e0'] }), 'grande', 'arqueada'));
      // Right of center, bowed toward the flamingo on the left: his head goes left and down, and a counter's
      // ×N tag (the top-right corner) covers nobody's head.
      av.root.position.set(0.24, 0, 0);
      // 3/4, facing screen left: the bow reads from the side, the hands at the groin from the front.
      const yaw = -0.6;
      av.root.rotation.y = yaw;
      doubledOver(k, av);
      k.rest(av);
      const groin = local(av.character.bones.hips, 0, -0.12, -0.15);
      const card: V3 = [0.5, 0.78, -3.52];
      // The hit: a red impact star where it landed, the yellow pop around his hands (not over them: the hands are
      // half the joke).
      const impact = ring(k, groin, card, [[0, 0, 0.065]], { lift: 0.35, color: 0xff3b2f });
      // Spraying out in front of him (screen left), toward the bird.
      const pop = ring(k, groin, card, [
        [190, 0.24, 0.075],
        [145, 0.25, 0.08],
        [100, 0.22, 0.06],
        [235, 0.22, 0.065],
        [280, 0.2, 0.05],
        [55, 0.21, 0.055],
        [10, 0.2, 0.05],
        [175, 0.4, 0.05],
        [215, 0.38, 0.045],
      ], { lift: 0.3 });
      const flamingo = new THREE.Mesh(flamingoGeometry(), new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }));
      flamingo.scale.setScalar(0.6);
      // In front of him on screen left, facing +X (screen left) as built: its back turned on him.
      flamingo.position.set(0.85, 0, 0.25);
      k.group.add(flamingo);
      const lawn = k.island('grama', 1.85, 0.72, [0.42, 0, 0.22], { thick: 0.12 });
      // The mini: the pair, closer and without the lawn: the pink bird (the page's one pink shape, the pun of the
      // name) with its back turned, and him doubled over at it, the pop between them in fewer, bigger stars that
      // still read at 30 px. (Alone, he is a dark blob with dots at that size.)
      const mini: V3 = [0.45, 0.88, -3.35];
      const miniPop = [
        ...ring(k, groin, mini, [[0, 0, 0.085]], { lift: 0.35, color: 0xff3b2f }),
        ...ring(k, groin, mini, [
          [175, 0.24, 0.1],
          [130, 0.25, 0.09],
          [220, 0.24, 0.09],
          [80, 0.2, 0.07],
          [270, 0.2, 0.07],
        ], { lift: 0.3 }),
      ];
      return {
        card: { pos: card, target: [0.43, 0.53, 0.15], fov: 30, hide: miniPop },
        mini: {
          pos: mini,
          target: [0.55, 0.55, -0.1],
          fov: 30,
          hide: [lawn, ...impact, ...pop],
          // The bird steps in front of him on the left, its back still turned on him (facing where he faces).
          before() {
            flamingo.position.set(0.86, 0, -0.34);
            // The flamingo faces (cos r, 0, -sin r); he faces (-sin yaw, 0, -cos yaw).
            flamingo.rotation.y = Math.atan2(Math.cos(yaw), -Math.sin(yaw));
          },
        },
        rim: 1.2,
      };
    },
  },
  {
    id: 'opressor',
    build(k) {
      // The game's signature humiliation: the HERO's raise-the-roof (the first move of the Dancinha da Vitória)
      // over a neighbor's body, the finish's confetti in the air.
      const { island } = bodyOn(k, neighbor(11), 1, [0, 0, 0.1], -Math.PI / 2, 'grama');
      const hero = k.avatar(HERO);
      hero.root.position.set(0.05, 0, 0.62);
      hero.root.rotation.y = 0.12;
      hero.dance(0.48);
      k.rest(hero, 0);
      // Raining down low, over the body and the lawn: up by his arms the die-cut merged the chips and the
      // raise-the-roof into one cream cloud, and the pose is the card's shape.
      const confetti = k.confetti([0.0, 0.45, 0.2], { count: 26, spread: 0.85 });
      return {
        card: { pos: [0, 3.75, -5.25], target: [0, 0.85, 0.35], fov: 30 },
        // The mini: from higher up, the raise-the-roof big and the body a bar across his feet.
        mini: { pos: [0, 4.2, -3.85], target: [0.03, 0.93, 0.4], fov: 30, hide: [island, confetti] },
      };
    },
  },
  {
    id: 'oprimido',
    build(k) {
      // You, oppressed: the HERO flat on his back with sad eyes, the head rolled to one side, under the game's
      // tilted yellow "OPRIMIDO!" stamp (CorpseTimer.done(): Lilita One, #ffd23f, ink stroke, -0.12 rad on the
      // canvas), redrawn crisp at sticker size. No dancer: on a page of dancers, a body and a stamp.
      // Across the card, the head on screen right (where the RIVAL's is in troco: the before and after) and a
      // little toward the lens; the stamp over his legs, left of center, so its end stays out of the top-right
      // corner a counter's ×N tag covers.
      const hero = k.avatar(mood(HERO, 'caido', 'fina'));
      k.lying(hero, 1, [0, 0, 0], -(Math.PI / 2 + 0.25));
      // The head rolled toward the lens and the near hand over the face: the weary 😩 of the icon, which reads at
      // card size where 2 px eyes don't. The far arm lies limp on the grass (bent up too, it misses the turned
      // face and sticks up in the air).
      const p = k.pp(hero);
      p.turn('head', 0.15, 0.55, 0);
      p.arm('L', 0.5, 0.5, 0.3, 2.35);
      p.arm('R', 0.05, 0, 0.35, 0.4);
      p.grip(0.2, 0.35);
      k.rest(hero, 0);
      const lawn = k.island('grama', 2.15, 0.95, [0, 0, 0]);
      lawn.rotation.y = -0.25;
      // Low over his legs and middle (a gap between it and the body would leave pockets the die-cut rims in ink),
      // clear of his face.
      const stamp = k.label('OPRIMIDO!', [0.2, 0.32, -0.05], { tilt: 0.12, height: 0.36 });
      return {
        card: { pos: [-0.06, 1.7, -3.58], target: [-0.06, 0.16, 0.1], fov: 30 },
        // The mini: no stamp (no small text), just him flat on his lawn, a hand over his face, red cap on the
        // right: the page's one badge without anybody standing.
        mini: { pos: [-0.02, 2.9, -4.1], target: [-0.02, 0.2, 0.05], fov: 30, hide: [stamp] },
      };
    },
  },
  {
    id: 'troco',
    build(k) {
      // Payback, oprimido's mirror: the RIVAL (who oppressed you last) now lies on the same lawn under the same
      // stamp, and the HERO, standing at her feet, points straight at her: "it's you", fist on the hip.
      // Her head on screen right and the HERO on the left: a counter's ×N tag covers the card's top-right corner
      // (about the right 35% and the top 30% on a 110 px card), so nobody's head goes there.
      const rival = k.avatar(RIVAL);
      k.lying(rival, 1, [-0.25, 0, 0.1], -Math.PI / 2 + 0.2);
      const lawn = k.island('grama', 2.6, 1.0, [0.05, 0, 0.12]);
      lawn.rotation.y = -0.2;
      const hero = k.avatar(mood(HERO, 'marcante', 'grossa'));
      hero.root.position.set(1.0, 0, 0.3);
      // Toward her head, a little toward the lens (his face and the pointing arm both show): facing screen right,
      // his right arm is the near one.
      k.face(hero, [-1.1, 0, -0.3]);
      const p = k.pp(hero);
      // The accusing finger: the arm straight out at her and the stamp (a lower one hangs in front of him and
      // reads as reaching), the back leaning in, the head down at her.
      p.arm('R', 1.12, 0, 0.1, 0);
      // Akimbo: the elbow out and back, the fist on the hip.
      p.arm('L', -0.45, 0, -0.6, 1.6);
      p.grip(0.9, 1);
      p.turn('spine', -0.12);
      p.turn('chest', 0, 0.1, 0);
      p.turn('head', -0.3, 0.1, 0);
      k.rest(hero, 0);
      const stamp = k.label('OPRIMIDO!', [-0.35, 0.5, 0.1], { tilt: 0.12, height: 0.45 });
      // The mini's lawn: only under her and the HERO where the mini moves him.
      const patch = k.island('grama', 2.2, 1.2, [-0.25, 0, 0.3]);
      patch.visible = false;
      return {
        card: { pos: [0.05, 2.25, -5.0], target: [0.05, 0.66, 0.2], fov: 30 },
        // The mini (no stamp): from her side, in front and to the right, the HERO moved up to stand just behind
        // her hips (both fit the badge bigger): his red cap at the top, her turquoise bandana bottom right, and
        // his pointing arm between them.
        mini: {
          pos: [-2.6, 2.67, -4.4],
          target: [-0.3, 0.8, 0.3],
          fov: 30,
          hide: [stamp, lawn],
          before() {
            hero.root.position.set(0.15, 0, 0.75);
            k.face(hero, [-1.15, 0, 0.0]);
            k.rest(hero, 0);
            patch.visible = true;
          },
        },
      };
    },
  },
  {
    id: 'oportunista',
    build(k) {
      // A body someone else dropped: the RIVAL made the kill (her win) and still aims at it from behind, while
      // the HERO, crouched over the body like a vulture, arms spread like wings, is already claiming the dance.
      // A royal-blue tee: nothing like the HERO's moss green on the dark street.
      const body = k.avatar(dress(neighbor(23), { id: 'basica', cores: ['#2f6fd6'] }));
      // The head on screen right, under the vulture; the legs on the left, where the killer aims.
      k.lying(body, 1, [0, 0, 0], -Math.PI / 2 + 0.1);
      // One street for the three of them: the body, the vulture behind it, the killer on the left.
      const street = k.island('asfalto', 3.2, 1.6, [0.5, 0, 0.45]);
      const hero = k.avatar(HERO);
      hero.root.position.set(-0.4, 0, 0.42);
      hero.root.rotation.y = 0.3;
      k.settle(hero, { crouch: true, pitch: -0.4 }, 40);
      // The vulture mantling its prize: back hunched over it, the head low and thrust forward between raised
      // shoulders, the wings spread wide and held a little forward over the body like a cape, the hands open like
      // feathers (drooping forearms made a wrestler's stance, level ones a "ta-da").
      const p = k.pp(hero);
      p.turn('spine', -0.7);
      p.turn('chest', -0.3);
      p.turn('shoulder_L', 0, 0, 0.3);
      p.turn('shoulder_R', 0, 0, -0.3);
      p.turn('neck', 0.6);
      p.turn('head', 0.0);
      p.arm('L', 0.6, 0, -1.3, 0.35);
      p.arm('R', 0.6, 0, 1.3, 0.35);
      p.grip(0, 0);
      k.rest(hero, 0);
      // The killer, back on the left, still aiming down at the body's legs (not at the vulture).
      const rival = k.avatar(RIVAL, undefined, { armed: true });
      rival.root.position.set(1.65, 0, 1.0);
      k.face(rival, [0.35, 0, 0.0]);
      k.settle(rival, { ads: true, pitch: -0.75, yaw: rival.root.rotation.y }, 40);
      k.hideBack(rival);
      // Her barrel still smoking (she made the kill): a wisp of grey puffs rising from the muzzle, one every few
      // frames. The flash only marks where the muzzle is.
      const flash = k.muzzleFlash(rival, { size: 0.08 });
      flash.visible = false;
      const tip = flash.getWorldPosition(new THREE.Vector3());
      for (let i = 0; i < 6; i++) {
        k.puffs.emit(tip.clone(), (Math.random() - 0.5) * 0.08, 0.18 + Math.random() * 0.08, (Math.random() - 0.5) * 0.08, 1.4, 0.035, 0.085, i % 2 ? 0xbdb7cc : 0xdcd8e4);
        k.step(7, (dt) => k.puffs.update(dt));
      }
      // The mini's own ground, under the body and the vulture only: the wings' wide crouched M over the body's
      // bar (opressor's badge is a tall Y).
      const patch = k.island('asfalto', 2.3, 1.15, [-0.08, 0, 0.22]);
      return {
        card: { pos: [0.4, 1.85, -5.2], target: [0.5, 0.68, 0.45], fov: 30, hide: [patch] },
        mini: { pos: [-0.15, 2.3, -4.6], target: [-0.12, 0.45, 0.25], fov: 30, hide: [rival.root, street, k.puffs['mesh']] },
      };
    },
  },
  {
    id: 'chutando-cachorro-morto',
    build(k) {
      // Kicking them while they're down: a neighbor who died on his own lies face down on the sidewalk, and the
      // HERO, at his feet, still lands a kick on him. No dog in sight (nobody should read it as Amora).
      // The HERO on the left kicking toward screen right: a counter keeps the top-right corner (its ×N tag) free
      // of his head.
      bodyOn(k, neighbor(12), -1, [-0.25, 0, 0], -Math.PI / 2, 'calcada', { w: 2.9, d: 1.05 });
      const hero = k.avatar(mood(HERO, 'marcante', 'grossa'));
      hero.root.position.set(1.05, 0, 0.05);
      // Toward the body (screen right), a little toward the lens.
      hero.root.rotation.y = Math.PI / 2 - 0.35;
      kick(k, hero);
      k.rest(hero, 0);
      const foot = local(hero.character.bones.foot_R, 0, -0.03, -0.12);
      const thud = k.stars(foot, { count: 5, spread: 0.2, size: 0.07, dir: [-0.3, 1, -0.5] });
      return {
        card: { pos: [-0.05, 1.9, -5.55], target: [-0.08, 0.74, 0.05], fov: 30 },
        // The mini: from the kicker's front left, the kick big and the body receding behind it.
        mini: { pos: [3.75, 1.75, -4.15], target: [0.12, 0.65, -0.05], fov: 30, hide: [thud] },
      };
    },
  },
  {
    id: 'no-ultimo-segundo',
    build(k) {
      // Just in time: a neighbor's body with its countdown almost out (the game's CorpseTimer: the red ring
      // nearly empty, "1", the [E] key), and the HERO sliding in feet first to start the dance.
      const body = k.avatar(neighbor(16));
      k.lying(body, 1, [0, 0, 0.3], -Math.PI / 2);
      // A deck under the body and the slider's seat.
      k.island('madeira', 3.6, 1.1, [0.62, 0, 0.3]);
      const timer = new CorpseTimer();
      timer.countdown(0.4, 6);
      // The game's sprite at 4 times its size, the hook of the card: its "1" over 60 px tall on the 800 x 600
      // render (the 160 x 200 canvas still lands near 1:1 in the halved card).
      timer.sprite.scale.multiplyScalar(4);
      // Over the body's feet, where the slider arrives: left of center, out of the top-right corner a counter's
      // ×N tag covers.
      timer.sprite.position.set(0.9, 1.5, 0.3);
      k.group.add(timer.sprite);
      // The mini's ring alone, where the sprite's ring is (its center 28 of the canvas' 200 px above the
      // sprite's, its disc 124 of 160 px wide).
      const ring1 = countdownRing(0.4, 6, (124 / 160) * timer.sprite.scale.x);
      ring1.position.copy(timer.sprite.position).y += (28 / 200) * timer.sprite.scale.y;
      k.group.add(ring1);
      const hero = k.avatar(HERO);
      hero.root.position.set(1.75, 0, 0.3);
      // Facing screen right, feet first at the body's feet.
      hero.root.rotation.y = Math.PI / 2;
      slide(k, hero);
      k.rest(hero, 0);
      // The dust of the slide: a trail behind him and a spray off the lead heel (the motion reads from it).
      const dust = (i: number) => (i % 2 ? 0xd2bd98 : 0xbfa67f);
      for (let i = 0; i < 6; i++) {
        const a = new THREE.Vector3(1.85 + i * 0.09 + Math.random() * 0.05, 0.06, 0.3 + (Math.random() - 0.5) * 0.35);
        k.puffs.emit(a, 0.5 + Math.random() * 0.4, 0.2 + Math.random() * 0.25, (Math.random() - 0.5) * 0.3, 1.0, 0.08, 0.2, dust(i));
      }
      for (let i = 0; i < 4; i++) {
        const a = new THREE.Vector3(1.0 + Math.random() * 0.1, 0.08, 0.3 + (Math.random() - 0.5) * 0.25);
        k.puffs.emit(a, -0.3 - Math.random() * 0.3, 0.5 + Math.random() * 0.3, (Math.random() - 0.5) * 0.4, 0.8, 0.05, 0.13, dust(i));
      }
      k.step(12, (dt) => k.puffs.update(dt));
      const lines = speedLines(k, hero.character.bones.hips, [1, 0, 0], [
        [0.5, 0.36, 0.05],
        [0.72, 0.48, 0.0],
        [0.95, 0.34, 0.08],
      ]);
      return {
        card: { pos: [0.64, 1.68, -6.4], target: [0.66, 1.02, 0.3], fov: 32, hide: [ring1] },
        // The mini: the ring with its "1", one round shape (the number reads as a shape, not as text).
        mini: { pos: [ring1.position.x, ring1.position.y, -2.85], target: [ring1.position.x, ring1.position.y, 0.3], fov: 30, hide: [timer.sprite, ...lines] },
      };
    },
  },
  {
    id: 'davi-contra-golias',
    build(k) {
      // The upset: a tiny HERO doing the raise-the-roof on the belly of a giant brute laid out flat (the size gap
      // comes from root.scale: the height option only changes ±4%).
      // Black stubble and beard (the seed's hair color was purple: on the purple page, and not a brute's).
      const golias = dress(
        tweak(neighbor(5), { altura: 'alto', biotipo: 'gordo', cabelo: { cor: '#1d1a18' } }),
        { id: 'camisetaTatica', cores: ['#23262c', '#3a3d42'] },
        'calcaCamuflada',
        'bota',
        'escuros',
        'raspado',
        'barbaCheia',
        'tatuagens',
      );
      const giant = k.avatar(golias);
      giant.root.scale.setScalar(1.75);
      k.lying(giant, 1, [0, 0, 0.2], Math.PI / 2);
      const ground = k.island('concreto', 3.75, 1.55, [0, 0, 0.2]);
      // Where his belly is highest: straight down onto the posed mesh, over the belly (a bit toward his hips).
      const belly = local(giant.character.bones.spine, 0, 0, 0);
      const hit = new THREE.Raycaster(new THREE.Vector3(belly.x - 0.1, 3, belly.z), new THREE.Vector3(0, -1, 0)).intersectObject(giant.root, true)[0];
      const top = hit ? hit.point.y : 0.6;
      const david = k.avatar(HERO);
      david.root.scale.setScalar(0.62);
      david.root.position.set(belly.x - 0.1, 0, belly.z + 0.05);
      david.root.rotation.y = 0.1;
      david.dance(0.48);
      k.rest(david, top, 0.04);
      return {
        card: { pos: [0, 2.0, -6.2], target: [0, 0.76, 0.2], fov: 30 },
        // The mini: the whole giant across the badge, the tiny dancer standing on him (the size gap is the joke).
        mini: { pos: [-0.04, 2.55, -7.5], target: [-0.04, 0.9, 0.2], fov: 30, hide: [ground] },
      };
    },
  },
  {
    id: 'embalado',
    build(k) {
      // On a roll, "tá pegando fogo": the HERO sprinting, the rifle across his chest, his head and shoulders on
      // fire (the fountain dragon's FireBreath, shrunk in a container), the flames streaming up and back.
      const hero = k.avatar(mood(HERO, 'marcante', 'grossa'), undefined, { armed: true });
      // Running toward screen right, a little toward the lens: his back (where the flames stream) is then
      // mostly screen left, so they trail across the card instead of hiding behind him.
      const yaw = 1.1;
      hero.root.rotation.y = yaw;
      // 62 frames: the stride at its widest (T = 2.5 / 2.43 s), the rifle across the chest.
      k.settle(hero, { speed: 7, sprint: true, yaw }, 62);
      k.hideBack(hero);
      k.rest(hero, 0);
      const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      // Across the run, for fanning the jets out.
      const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const flames = (at: THREE.Vector3, scale: number, n: number, lean: number, fan = 0) => {
        // FireBreath wants a Scene: a nested one is the scaled container (a Group would not type-check).
        const box = new THREE.Scene();
        box.position.copy(at);
        box.scale.setScalar(scale);
        k.group.add(box);
        const fire = new FireBreath(box);
        fire.start(new THREE.Vector3(), new THREE.Vector3(back.x * lean + side.x * fan, 1, back.z * lean + side.z * fan));
        k.step(n, (dt) => fire.update(dt));
        // Its puffs are colored with linear setRGB (pastel on a card) at 0.85 over the die-cut's cream (a pale
        // smoke): opaque, and recolored by age, a yellow core, orange, then deep red tips (the page is orange).
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
          mesh.setColorAt(i, c.set(age < 0.3 ? 0xffe14d : age < 0.62 ? 0xff9a2e : 0xd8301c));
        }
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        return box;
      };
      // A burning crown: jets fanned over the top of his head (one jet is a thin stream), then the shoulders.
      // Each jet runs a whole flame life (0.75 s, 45 frames): small at the base, fat in the middle and small
      // again at the tip, a tongue of fire (stopped halfway, every jet ends in its biggest puffs: a cloud).
      const { head, shoulder_L, shoulder_R } = hero.character.bones;
      const crown: [number, number, number, number][] = [[0, 0, 0, 46], [-0.07, 0.02, -0.55, 42], [0.07, 0.02, 0.55, 42], [-0.04, 0.06, -0.25, 44], [0.04, 0.06, 0.25, 44]];
      const trail = crown.map(([x, z, fan, n]) => flames(local(head, x, 0.13, z), 0.19, n, 0.9, fan));
      trail.push(flames(local(shoulder_L, -0.1, 0.07, 0.04), 0.13, 40, 1.1), flames(local(shoulder_R, 0.1, 0.07, 0.04), 0.13, 40, 1.1));
      // The mini's own fire, shorter (the head stays the badge's size): a tight crown of flames.
      const tight = crown.map(([x, z, fan, n]) => flames(local(head, x, 0.13, z), 0.12, n, 0.6, fan * 1.3));
      // The mini is a bust: the burning head and shoulders, cut at the chest (the card shows him whole).
      const cut = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      clip(hero, cut);
      return {
        card: { pos: [-0.45, 1.15, -5.2], target: [0, 1.0, 0.3], fov: 30, hide: tight, before: () => clipping(k, false) },
        mini: {
          pos: [-0.12, 1.62, -1.95],
          target: [0.06, 1.48, 0.15],
          fov: 30,
          hide: trail,
          before() {
            clipping(k, true);
            cut.constant = -1.2;
          },
        },
        rim: 1.2,
      };
    },
  },
  {
    id: 'combo',
    build(k) {
      // Kills in a row, like dominoes: three neighbors toppling to screen right, each further down than the
      // next (die() is a stiff plank whose angle grows with (t / 0.45)²), each with a burst of hit stars.
      // About 45°, 20° and 5° (t = 0.45 √(angle / 1.49)), 1.2 m apart: each domino its own shape, the first one's
      // head on the second one's shoulder.
      // Three plain tees (blue, teal, purple): three distinct shapes on the orange page, away from the stars' yellow.
      const row: [n: number, tee: string, x: number, t: number][] = [
        [3, '#2f6fd6', 1.2, 0.33],
        [9, '#1f9e8f', 0.0, 0.22],
        [15, '#7a4fd6', -1.2, 0.11],
      ];
      const people = row.map(([n, tee, x, t]) => {
        const av = k.avatar(dress(neighbor(n), { id: 'basica', cores: [tee] }));
        av.root.position.set(x, 0, 0);
        // Facing screen left: falling on their backs takes them to screen right.
        av.root.rotation.y = -Math.PI / 2;
        av.die(t, 1);
        return av;
      });
      const stars = people.map((av) => k.stars(k.at(av.character.bones.chest, [0, 0.05, -0.25]), { count: 7, spread: 0.24, size: 0.07, dir: [0.4, 1, -0.6] }));
      const ground = k.island('calcada', 3.6, 0.9, [0, 0, 0]);
      return {
        card: { pos: [0, 1.05, -6.3], target: [0, 0.74, 0], fov: 30 },
        // The mini: the cascade from about 35° off the row's axis, the three overlapping in a tight diagonal.
        mini: { pos: [3.4, 1.55, -5.0], target: [0.05, 0.9, 0], fov: 30, hide: [ground, ...stars] },
      };
    },
  },
]);
