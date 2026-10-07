// Sticker studio, the jardim domain (see core-api.md): the Dragon Garden's own props as the game builds them
// (the panda, the cherry, the koi, the fountain dragon, the market's chime, the shrine's drums and gong), and the
// HERO as the versus dancer with one token of each versus map (pe-de-valsa), the angler showing off his koi
// (pescador) and the chime's conductor (maestro). The arms that hold something are put on it with the
// animator's own IK (reach, at the end of the file).
import * as THREE from 'three';
import type { Avatar } from '../../entities/avatar';
import { toon, toonGradient } from '../../render/materials';
import { knifeModel } from '../../render/weaponModels';
import { grenadeModel } from '../../weapons/grenades';
import { flamingoGeometry } from '../../world/decor';
import { fitText } from '../../world/canvasText';
import { pumpkinFace, pumpkinGeometry } from '../../world/halloween';
import { CherryPickup } from '../../world/jardim/cereja';
import { dragonCoil, JADE } from '../../world/jardim/lago';
import { bianzhong, NOTES } from '../../world/jardim/lanternas';
import { bigDrum } from '../../world/jardim/santuario';
import { panda } from '../../world/jardim/panda';
import { bend, glowTexture, GOLDEN, KINDS, variant, type Variant } from '../../world/jardim/peixes';
import { dragonGeometry, dragonMaterial, FireBreath, Gong, Lanterns, ORIENTAL, seeded } from '../../world/oriental';
import { dress, HERO, strip } from './core/cast';
import { defineDomain, type V3 } from './core/types';

/** A vertex-colored toon material of its own (the props' look; never the shared cache). */
const vertexToon = () => new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });

export default defineDomain('jardim', [
  {
    id: 'pe-de-valsa',
    build(k) {
      // The HERO in disco gear on the Saturday-night point, one token of each versus map around him: the Rua's
      // lawn flamingo, the Jardim's red paper lantern, the Vila's jack-o'-lantern.
      // White bell-bottoms (Saturday Night Fever) under the HERO's own tee and red cap: still "you".
      const hero = k.avatar(dress(HERO, { id: 'bocaSino', cores: ['#f4f0e6'] }, 'aviador', 'corrente'));
      hero.dance(2.5);
      // The game's disco frame keeps its bounce (hips, legs, head); the arms become the classic point, one
      // straight line from the fist in the air (screen left) down to the hand pointing at the floor, over a wide
      // stance: the badge's one bold shape.
      const p = k.pp(hero);
      p.arm('R', 0.15, 0, 2.7, 0.05);
      p.arm('L', 0.1, 0, -1.1, 0.05);
      p.grip(0.9, 0.9);
      p.leg('L', 0.12, 0.3, -0.45);
      p.turn('head', 0.2, 0, 0.12);
      p.plant();

      // Rua: a lawn flamingo (blockoutMap.ts builds them from this geometry), its head turned to the dancer.
      const flamingo = new THREE.Mesh(flamingoGeometry(), vertexToon());
      flamingo.scale.setScalar(0.72);
      flamingo.position.set(1.1, 0, 0.45);
      flamingo.rotation.y = 2.6;
      k.group.add(flamingo);
      // A wooden dance floor under the three maps' tokens: one sticker, and the stage says "dancer".
      const stage = k.island('madeira', 3.5, 1.5, [-0.1, 0, 0.45]);

      // Vila: a jack-o'-lantern. Its face is drawn on the pumpkin's +Z side: turned to the camera on -Z.
      const pumpkin = new THREE.Group();
      pumpkin.add(new THREE.Mesh(pumpkinGeometry(0.32), vertexToon()), new THREE.Mesh(pumpkinFace(0.32), new THREE.MeshBasicMaterial({ color: 0xffa632 })));
      pumpkin.scale.setScalar(1.3);
      pumpkin.position.set(-1.05, 0, 0.35);
      pumpkin.rotation.y = Math.PI;
      k.group.add(pumpkin);

      // Jardim: a red paper lantern hanging over the pumpkin from a lacquered post. A container of its own
      // (Lanterns.finish wants a Scene), so the mini can hide it.
      const lantern = new THREE.Scene();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 2.3, 8), toon(ORIENTAL.lacquer));
      post.position.set(-1.7, 1.15, 0.9);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.05), toon(ORIENTAL.lacquer));
      arm.position.set(-1.45, 2.25, 0.9);
      lantern.add(post, arm);
      const lanterns = new Lanterns();
      lanterns.hang(new THREE.Vector3(-1.25, 2.25, 0.9), 0.45);
      lanterns.finish(lantern, k.builder(), k.props, () => {});
      k.group.add(lantern);

      return {
        card: { pos: [0, 1.45, -6.1], target: [-0.05, 0.95, 0.4], fov: 30 },
        // The badge: the dancer alone, the camera rolled 15 degrees (a dutch angle) so the line from the fist to
        // the planted foot runs along the square's diagonal.
        mini: { pos: [0.035, 1.02, -4.15], target: [0.035, 0.865, 0], up: [-0.26, 0.97, 0], fov: 30, hide: [flamingo, pumpkin, lantern, stage] },
      };
    },
  },
  {
    id: 'abraco-de-urso',
    build(k) {
      // The Jardim's panda, eyes shut in bliss, hugging a live frag grenade: the pin's ring flying off, the fuse
      // sparking. Its tick never runs, so it keeps the rest pose, the paws together in front of the chest.
      const c = k.jardimCtx();
      const before = new Set(k.group.children);
      panda(c, 0, 0, 0, { bamboo: false });
      // panda() returns nothing: its root is the one group it just added (children: body, head, arms).
      const root = k.group.children.find((o) => !before.has(o))!;
      const [body, , arms] = root.children;
      const grenade = grenadeModel();
      const ring = k.pinPulled(grenade);
      ring.material = toon(0x5d6672); // steel: the game's pale chrome vanishes against the white fur
      grenade.scale.setScalar(2.8);
      // Pressed to the belly (its back sunk in the fur), its top under the paws: the arms (one mesh, the paws
      // together, as the game holds the bamboo) come 6 cm forward and tip down onto it.
      grenade.position.set(0, 0.62, 0.4);
      arms.position.z += 0.06;
      arms.rotation.x = 0.08;
      // Tipped to the screen's right: the cap and its sparks off to the side, over the black arm, away from the
      // snout.
      grenade.rotation.set(0.15, 0, -0.3);
      k.group.add(grenade);
      // The pulled ring flying off the other way, beside the head (placed in the world: out of the grenade), twice
      // the size and turned to the lens so it reads as a ring.
      const cam = new THREE.Vector3(-1.0, 1.15, 3.75);
      grenade.updateMatrixWorld(true);
      k.group.attach(ring);
      ring.scale.multiplyScalar(2);
      ring.position.set(-0.66, 1.08, 0.45);
      ring.lookAt(cam);
      ring.rotateX(0.8);
      const sparks = k.stars(k.at(grenade, [0.15, 0.19, 0.05]), { count: 8, spread: 0.17, size: 0.07, color: 0xffb21f, dir: [1, 0.25, 0.5] });

      return {
        // The panda faces +Z: a 3/4 view from its right.
        card: { pos: cam, target: [0, 0.69, 0.1], fov: 30 },
        // Hidden sticker: the badge shows who, not how: the panda's face alone, the 🐼 of the album.
        mini: { pos: [-0.3, 1.18, 1.7], target: [0, 1.13, 0.04], fov: 30, hide: [body, arms, grenade, ring, sparks] },
      };
    },
  },
  {
    id: 'cereja-do-bolo',
    build(k) {
      // The Dragon Cherry pickup as it waits in the courtyard: the glossy pair and its leaf, a moment into its turn
      // so both cherries, the stems and the leaf show. Its pink glow lies on the floor 0.55 m below: at any angle
      // that keeps both in one sticker it turns into a big pink plate under the fruit, so it stays out.
      const cherry = new CherryPickup(k.group, 'cereja', new THREE.Vector3(), new THREE.Vector3(0, 3, 0));
      cherry.update(0.35);
      cherry['glow'].visible = false;
      return {
        card: { pos: [0.05, 1.0, 1.75], target: [0.05, 0.776, 0], fov: 30 },
        mini: { pos: [0, 0.86, 1.72], target: [0, 0.776, 0], fov: 30 },
        rim: 1.2,
      };
    },
  },
  {
    id: 'pescador',
    build(k) {
      // In this game you fish with a gun or a knife: "you" in a fishing vest and rain boots, showing off the
      // catch like an angler's trophy photo, a big kohaku of the garden's ponds (the game's koi, KINDS[0]) held
      // across the chest in both hands, the hit's stars still around its head.
      const hero = k.avatar(dress(HERO, 'coletePesca', 'botaChuva'));
      hero.idle(false);
      const koi = variant(k.group, KINDS[0], 2.0, seeded(40), 0x000000);
      // Head (+Z) toward world +X (screen left, by his right hand), its side to the camera, rolled so the red
      // patches on its back show too; the tail flicks up (a fresh catch).
      koi.mesh.position.set(0.17, 1.105, -0.38);
      koi.mesh.rotation.set(0, Math.PI / 2, -0.55);
      curl(koi, 0.04);
      // The hands under it, palms up: the right one under the belly by the fins, the left one at the tail.
      reach(hero, 'R', k.at(koi.mesh, [0.3, -0.11, 0.06]), [1, -0.6, 0.2], [-0.25, 0, -1]);
      reach(hero, 'L', k.at(koi.mesh, [-0.45, -0.04, 0.06]), [-1, -0.6, 0.2], [0.25, 0, -1]);
      k.pp(hero).grip(0.5, 0.5);
      const stars = k.stars([0.8, 1.24, -0.47], { count: 7, spread: 0.22, size: 0.1, dir: [1, 0.6, -0.2] });
      // The badge: the trophy portrait, his face over the fish; below the fish he ends at the vest (the pants
      // and boots hidden: the skin under clothes is masked, so nothing shows there).
      const legs = [...hero.character.objectsOf('baixo'), ...hero.character.objectsOf('calcado')];
      return {
        card: { pos: [0.27, 1.2, -4.55], target: [0.0, 0.86, 0], fov: 30 },
        mini: { pos: [0.2, 1.55, -3.95], target: [-0.06, 1.31, 0], fov: 30, hide: [stars, ...legs] },
        rim: 1.2,
      };
    },
  },
  {
    id: 'peixe-de-ouro',
    build(k) {
      // The golden carp, glowing over its halo, seen from above on a disc of the pond's dark water: gold over
      // gold (the halo, the gold finish, the pink page's warm light) would wash out; the water keeps it gold.
      const water = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.04, 48), new THREE.MeshToonMaterial({ color: 0x2c7f78, gradientMap: toonGradient() }));
      // A little behind the fish, which swims 0.14 m over it: seen from above at an angle, the fish lands on the
      // middle of the pool.
      water.position.set(0, -0.14, -0.13);
      k.group.add(water);
      // The game's halo (KoiSchool), normal-blended instead of additive so it survives the transparent canvas;
      // smaller than the water, so its faint rim stays on it.
      const halo = new THREE.Mesh(
        new THREE.CircleGeometry(0.74, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffd36b, transparent: true, opacity: 0.75, depthWrite: false }),
      );
      halo.position.set(0, -0.1, -0.13);
      k.group.add(halo);
      const size = 2.1;
      const gold = variant(k.group, GOLDEN, size, seeded(7), 0xffa21a);
      gold.mat.emissiveIntensity = 0.6;
      bend(gold, 1.2, 1);
      // Heading `yaw`, its middle over the disc's center (the tail is longer than the head: the mesh's origin, the
      // body's center, goes a tenth of the size ahead).
      const swim = (yaw: number) => {
        gold.mesh.rotation.y = yaw;
        gold.mesh.position.set(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(0.1 * size);
      };
      return {
        // From the pond's edge, about 40 degrees down: the disc becomes an oval that fills the card, the fish across
        // it heading right and a little away, its side and back to the camera, the upright forked tail nearly
        // face-on.
        card: { pos: [0, 1.95, 2.55], target: [0, -0.1, 0], fov: 30, before: () => swim(2.0) },
        // The badge: from higher up, a rounder pool, the fish on its diagonal.
        mini: { pos: [0, 3.75, 2.0], target: [0, -0.1, -0.06], fov: 30, before: () => swim(2.3) },
      };
    },
  },
  {
    id: 'proibido-acordar',
    build(k) {
      // The jade dragon of the lake's fountain, woken: roaring its jet of fire over the garden's own sign,
      // "PROIBIDO / acordar o dragão / (ele cospe fogo)", standing crooked in the foreground.
      const coil = dragonCoil(0, 0);
      const d = dragonGeometry(coil, 0.19, JADE);
      const dragon = new THREE.Mesh(d.geo, dragonMaterial());
      // Its pillar (lago.ts dragonFountain), from the ground up.
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.4, 10), toon(ORIENTAL.stoneDark));
      pillar.position.y = 1.2;
      const card = new THREE.Group();
      card.add(dragon, pillar);
      k.group.add(card);
      // The game's breath (FireBreath), stepped while it still pours out. Its puffs are 85% opaque in game, over
      // the lake; over the sticker's cream they wash out, so they're drawn solid.
      const breath = (from: THREE.Vector3, dir: THREE.Vector3, rise: number, frames: number) => {
        const box = new THREE.Scene();
        const fire = new FireBreath(box);
        const mesh: THREE.InstancedMesh = fire['mesh'];
        (mesh.material as THREE.MeshBasicMaterial).opacity = 1;
        fire.start(from, dir.clone().setY(rise));
        k.step(frames, (dt) => fire.update(dt));
        // FireBreath sets its yellow-to-red ramp as linear values (0.22 blue comes out about 0.5): pale over the
        // cream. Read as sRGB, the same numbers give the saturated flame they describe.
        const c = new THREE.Color();
        const colors = mesh.instanceColor!;
        for (let i = 0; i < colors.count; i++) {
          c.fromBufferAttribute(colors, i).convertSRGBToLinear();
          colors.setXYZ(i, c.r, c.g, c.b);
        }
        colors.needsUpdate = true;
        k.group.add(box);
        return box;
      };
      // Half a second of it (the full 0.75 s jet runs 4 m and leaves everything else small), aimed down at the
      // sign that warned about it instead of the game's slight lift: the puffs rise as they slow, so the jet stays
      // under the dragon's horns. It starts a hand ahead of the jaws: a sliver of cream keeps the head (the "who"
      // of this hidden sticker) from melting into the flame.
      const fire = breath(d.mouth.clone().addScaledVector(d.forward, 0.15), d.forward, -0.25, 30);
      // The sign beside the fountain, big and crooked (the real one stands on the lake's east bank, lago.ts).
      // "PROIBIDO" at 60 px takes about half the card's width: the board is as wide as that needs.
      const sign = punSign(['PROIBIDO', 'acordar o dragão', '(ele cospe fogo)'], 0.41);
      sign.scale.setScalar(3.3);
      sign.position.set(-2.58, 0, 0);
      sign.rotation.set(0, 0.08, 0.05);
      k.group.add(sign);
      // The badge: who, not how (hidden sticker): the dragon's head on the last curl of its neck (the coil's
      // last three points), no fire, seen up close from its front left and a little below, the open jaws, horns and
      // whiskers to the lens.
      const head = dragonGeometry(coil.slice(17), 0.19, JADE);
      const bust = new THREE.Mesh(head.geo, dragonMaterial());
      k.group.add(bust);
      return {
        card: { pos: [-1.89, 1.86, 9.85], target: [-1.89, 1.86, 0], fov: 30, hide: [bust] },
        mini: { pos: [-3.45, 3.76, 0.6], target: [-0.9, 3.21, 0.05], fov: 30, hide: [card, fire, sign] },
      };
    },
  },
  {
    id: 'maestro',
    build(k) {
      // The market's bianzhong (five bronze bells on a red lacquer frame) played dó to sol, each bell set
      // swinging six frames after the one before, conducted by the HERO, seen from behind his left shoulder, with
      // the arsenal's rubber chicken for a baton.
      const c = k.jardimCtx();
      // Posts 3.6 m apart instead of the market's 5.2 (the same bells, closer together): the frame takes less of
      // the card, the conductor and his chicken more.
      bianzhong(c, -1.8, 1.8, 0);
      for (let i = 0; i < NOTES.length; i++) {
        k.props.remote(`carrilhao:${i}`);
        k.tick(6);
      }
      // A slab of the market's paving under the frame: it closes the frame's opening, so the bronze bells hang over
      // the sticker's cream instead of the page (or the gold of the only finish this sticker gets).
      k.island('pedra', 4.7, 1.1, [0, 0, 0], { tint: 0xb8b0a0, shape: 'box' });
      // The conductor 3.6 m in front of the frame and the camera 5 m behind him: he stands as tall as the frame.
      const target = new THREE.Vector3(0.3, 1.34, -1.5);
      const cam = new THREE.Vector3(2.8, 0.95, -8.2).sub(target).multiplyScalar(1.08).add(target);
      const look = dress(HERO, 'golaAlta', { id: 'blazer', cores: ['#5e1f2a'] }, 'calcaTerno', 'sapatoSocial');
      const hero = k.avatar(look);
      hero.root.position.set(2.0, 0, -3.6);
      k.face(hero, [-0.4, 0, 0]);
      hero.idle(false);
      // A low wooden podium, square to him: his feet stand on something (the frame's slab is 3 m behind him).
      const podium = k.island('madeira', 0.6, 0.45, [0, 0, 0], { shape: 'box', thick: 0.14 });
      podium.position.copy(hero.root.position);
      podium.rotation.y = hero.root.rotation.y;
      // The rubber chicken raised high, in profile to the camera and pointing up at the bells, its feet in his right
      // hand; the left arm out to the side, open and low enough to clear the frame's post (a conductor seen from
      // behind).
      const baton = knifeModel('frango');
      baton.scale.setScalar(3.4);
      baton.position.copy(around(hero, [0.38, 1.9, 0.32]));
      profile(baton, cam, 1.05);
      k.group.add(baton);
      reach(hero, 'R', baton.position.clone(), [0.9, -0.2, 0.4]);
      reach(hero, 'L', around(hero, [-0.75, 1.55, 0.3]), [-0.9, -0.4, 0.3]);
      const p = k.pp(hero);
      p.grip(0.15, 0.9);
      p.turn('head', 0.2, 0, 0);
      // One big note coming off the chicken's beak, to its right over the end of the frame's top beam (two small
      // ones were specks on the album card and only made the die-cut lumpy).
      const right = target.clone().sub(cam).cross(new THREE.Vector3(0, 1, 0)).normalize();
      const beak = (chicken: THREE.Object3D) => {
        chicken.updateMatrixWorld(true);
        return chicken.localToWorld(new THREE.Vector3(0, 0.01, -0.37));
      };
      const cardNote = musicNote(0.48);
      cardNote.position.copy(beak(baton)).addScaledVector(right, 0.4).add(new THREE.Vector3(0, -0.12, 0));
      k.group.add(cardNote);
      // The badge, set up off to the side: the chicken alone from corner to corner (no bell: eu-ja-ouvi's badge, on
      // the same page, is one), held up by its feet in the HERO's fist, a note at its beak. Of him only the fist and
      // the end of his wine sleeve show: the rest is cut away by a plane across the forearm, its open end turned
      // away from the lens (local clipping, on in the mini only; a k.avatar's pieces own their materials).
      const X = 30;
      // No cap and a shaved head: only his arm is kept, and the brim reached past the cut.
      const hand = k.avatar(dress(strip(look, 'cabeca'), 'raspado'));
      hand.root.position.set(X, 0, 0);
      hand.root.rotation.y = Math.PI / 2; // facing -X (screen right), his right side to the camera
      hand.idle(false);
      // The arm up, forward and out to his right (toward the lens): the plane that keeps the forearm then passes
      // well clear of his head.
      reach(hand, 'R', around(hand, [0.45, 1.8, 0.35]), [0.6, -0.7, 0.2]);
      k.pp(hand).grip(0.5, 1);
      const wrist = k.at(hand.character.bones.hand_R);
      const fore = wrist.clone().sub(k.at(hand.character.bones.forearm_R)).normalize();
      // The fist turned about the forearm until the back of the hand faces the lens (on -Z): seen from its edge,
      // it was a sliver.
      knuckles(hand.character.bones.hand_R, new THREE.Vector3(0, 0, -1));
      const fist = wrist.clone().addScaledVector(fore, 0.07);
      const cutAt = wrist.clone().addScaledVector(fore, -0.2);
      const cut = new THREE.Plane().setFromNormalAndCoplanarPoint(fore, cutAt);
      hand.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.clippingPlanes = [cut];
      });
      const chicken = knifeModel('frango');
      chicken.scale.setScalar(1.8);
      k.group.add(chicken);
      // Its legs through the fist, the body up and to the screen's right at 45 degrees, in profile to the camera
      // (straight down +Z at the middle of the picture, between the sleeve's end and the beak: found in two passes).
      const D = 1.75;
      const miniTarget = fist.clone();
      for (let pass = 0; pass < 2; pass++) {
        chicken.position.copy(fist);
        profile(chicken, miniTarget.clone().add(new THREE.Vector3(0, 0, -D)), Math.PI / 4);
        chicken.position.addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(chicken.quaternion), -0.036);
        miniTarget.copy(cutAt).add(beak(chicken)).multiplyScalar(0.5);
      }
      const note = musicNote(0.22);
      note.position.copy(beak(chicken)).add(new THREE.Vector3(-0.03, -0.2, 0));
      k.group.add(note);
      // Clipping is a switch of the whole renderer (core-api trap 23): off for the card, on for the mini, and off
      // again once the clipped body has been drawn (render() reads it when it starts).
      const body = hand.root.getObjectByProperty('isSkinnedMesh', true) ?? hand.root;
      body.onAfterRender = () => {
        k.renderer.localClippingEnabled = false;
      };
      return {
        card: { pos: cam, target, fov: 39.5, before: () => void (k.renderer.localClippingEnabled = false) },
        // (Centered on the drawing with its note: 3 cm to the screen's right, 2.5 cm down.)
        mini: { pos: miniTarget.clone().add(new THREE.Vector3(-0.03, -0.025, -D)), target: miniTarget.clone().add(new THREE.Vector3(-0.03, -0.025, 0)), fov: 30, before: () => void (k.renderer.localClippingEnabled = true) },
      };
    },
  },
  {
    id: 'banda-marcial',
    build(k) {
      // The garden's percussion as a band with no musicians: the temple's bronze gong just struck and swinging,
      // the shrine's big red drum with its cream heads, and the music room's two standing drums.
      const c = k.jardimCtx();
      // A gong, struck (the bus keeps one handler per id: each gong is struck as soon as it's built), and a few
      // frames of its swing; a burst off its boss (the disc hangs 1.55 m up, facing ±Z).
      const struckGong = (x: number) => {
        const gong = new Gong(c.scene, c.b, x, 0, 0, c.props, () => {});
        k.props.remote('gongo');
        k.animate((dt) => gong.update(dt));
        k.stars([x + 0.3, 1.8, 0.35], { count: 7, spread: 0.3, size: 0.13, dir: [1, 0.8, 0.5] });
      };
      struckGong(0);
      // The drums close around it, on the stone of the temple's court: one stage, big in the card's 4:3.
      bigDrum(c, -1.85, 0, 0.9);
      // The music room's drums (lanternas.ts), without their shot gags.
      for (const [x, z] of [[1.55, 1.15], [2.25, 0.45]]) {
        c.b.cylinder(x, 0, z, 0.45, 0.9, 'pintura', { tint: ORIENTAL.lacquer, segments: 14 });
        c.b.cylinder(x, 0.9, z, 0.46, 0.04, 'pintura', { tint: 0xf2e6c8, segments: 14, collide: false });
      }
      k.island('pedra', 5.6, 2.6, [0.15, 0, 0.6], { tint: ORIENTAL.stone });
      // The badge, set up off to the side: the gong alone in its frame, on its own slab of the court.
      const X = 30;
      struckGong(X);
      k.island('pedra', 2.9, 0.9, [X, 0, 0], { tint: ORIENTAL.stone, shape: 'box' });
      k.tick(12);
      return {
        card: { pos: [3.65, 3.5, 10.22], target: [0.05, 0.98, 0.5], fov: 30 },
        mini: { pos: [X + 0.45, 1.41, 7.3], target: [X, 1.2, 0], fov: 30 },
      };
    },
  },
]);

/** A V3 as a new Vector3. */
const vec3 = (v: V3) => (v instanceof THREE.Vector3 ? v.clone() : new THREE.Vector3(v[0], v[1], v[2]));

/** An arm as the animator's IK takes it (CharacterAnimator's Limb: the chain, its rest axis and hinge). */
interface Limb {
  upper: string;
  lower: string;
  end: string;
  axis: THREE.Vector3;
  hinge: THREE.Vector3;
}

/**
 * Puts an avatar's wrist on a world point with the animator's own two-bone IK (private in CharacterAnimator, as
 * the helpers k.pp reaches are), the elbow bending toward `pole`, a direction in the body's frame (the character
 * faces -Z, +X is its right). With `fingers` (body frame, horizontal) the hand points that way, palm up, as under
 * something it carries; without, it goes on along the forearm. After the last animator call, like k.pp.
 */
function reach(av: Avatar, side: 'L' | 'R', at: THREE.Vector3, pole: V3, fingers?: V3) {
  type Ik = (l: Limb, target: THREE.Vector3, pole: THREE.Vector3, endRot?: THREE.Quaternion) => void;
  const animator = (av as unknown as { animator: { ik?: Ik } }).animator;
  if (typeof animator?.ik !== 'function') throw new Error('reach: o CharacterAnimator não tem mais ik() (client/character/animator.ts mudou)');
  const s = side === 'L' ? -1 : 1;
  // As the animator's limbs: an arm rests along its bone's ±X (the T-pose) and bends about ±Y (up in the T-pose).
  const limb: Limb = { upper: `upperArm_${side}`, lower: `forearm_${side}`, end: `hand_${side}`, axis: new THREE.Vector3(s, 0, 0), hinge: new THREE.Vector3(0, s, 0) };
  av.root.updateMatrixWorld(true);
  const target = av.character.body.worldToLocal(at.clone());
  let hand: THREE.Quaternion | undefined;
  if (fingers) {
    // The rest frame (axis, hinge) onto the fingers' direction and a hinge that turns the back of the hand down.
    const dir = vec3(fingers).normalize();
    const hinge = new THREE.Vector3(0, -s, 0).addScaledVector(dir, s * dir.y).normalize();
    const rest = new THREE.Matrix4().makeBasis(limb.axis, limb.hinge, new THREE.Vector3().crossVectors(limb.axis, limb.hinge));
    const now = new THREE.Matrix4().makeBasis(dir, hinge, new THREE.Vector3().crossVectors(dir, hinge));
    hand = new THREE.Quaternion().setFromRotationMatrix(now.multiply(rest.transpose()));
  }
  animator.ik(limb, target, vec3(pole).normalize(), hand);
}

/**
 * Turns a knife model (knifeModel: feet at the origin, the body along -Z, comb up +Y) so a camera at `cam` sees
 * it in profile: pointing `tilt` rad from the screen's up toward its right, the comb on the upper-left side.
 */
function profile(obj: THREE.Object3D, cam: V3, tilt: number) {
  const view = obj.position.clone().sub(vec3(cam)).normalize();
  const right = new THREE.Vector3().crossVectors(view, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, view);
  const along = up.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(right, Math.sin(tilt));
  const comb = up.clone().multiplyScalar(Math.sin(tilt)).addScaledVector(right, -Math.cos(tilt));
  const z = along.clone().negate();
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(comb, z), comb, z));
}

/** A point in an avatar's own frame ([right, up, forward] meters from its feet) in world space. */
function around(av: Avatar, [right, up, forward]: readonly [number, number, number]): THREE.Vector3 {
  const y = av.root.rotation.y;
  const fwd = new THREE.Vector3(-Math.sin(y), 0, -Math.cos(y));
  return av.root.position.clone().addScaledVector(new THREE.Vector3(-fwd.z, 0, fwd.x), right).addScaledVector(fwd, forward).setY(av.root.position.y + up);
}

/**
 * Twists a hand bone about its own length (the arm's rest axis, local X) until the back of the hand (local +Y in
 * the T-pose, where reach() turns it down for a palm-up carry) faces `toward`, a world direction. After the arm's
 * last pose call; the fingers' grip is a morph and keeps.
 */
function knuckles(hand: THREE.Object3D, toward: THREE.Vector3) {
  hand.updateWorldMatrix(true, false);
  const q = hand.getWorldQuaternion(new THREE.Quaternion());
  const along = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const back = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const want = toward.clone().addScaledVector(along, -toward.dot(along)).normalize();
  hand.rotateX(Math.atan2(back.clone().cross(want).dot(along), back.dot(want)));
}

/** Bends a koi (a peixes.ts variant) up toward its tail, as a fish held out of the water flicks it. */
function curl(v: Variant, amount: number) {
  const pos = v.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const arr = pos.array as Float32Array;
  let head = -Infinity;
  let tail = Infinity;
  for (let i = 2; i < v.base.length; i += 3) {
    head = Math.max(head, v.base[i]);
    tail = Math.min(tail, v.base[i]);
  }
  for (let i = 0; i < arr.length; i += 3) {
    const t = (head - v.base[i + 2]) / (head - tail);
    arr[i + 1] = v.base[i + 1] + amount * t * t;
  }
  pos.needsUpdate = true;
}

/**
 * A flat eighth note in ink, `size` meters tall, turned to the camera at every render (the studio's music
 * notes, cut like the hit stars).
 */
function musicNote(size: number): THREE.Mesh {
  const head = new THREE.Shape().absellipse(0, 0, 0.3, 0.21, 0, Math.PI * 2, false, -0.4);
  const stem = new THREE.Shape([new THREE.Vector2(0.21, 0.05), new THREE.Vector2(0.3, 0.05), new THREE.Vector2(0.3, 1.0), new THREE.Vector2(0.21, 1.0)]);
  const flag = new THREE.Shape();
  flag.moveTo(0.21, 1.0);
  flag.bezierCurveTo(0.35, 0.82, 0.62, 0.78, 0.56, 0.42);
  flag.bezierCurveTo(0.5, 0.66, 0.36, 0.7, 0.3, 0.72);
  flag.lineTo(0.21, 0.72);
  const geo = new THREE.ShapeGeometry([head, stem, flag]).translate(-0.15, -0.5, 0).scale(size, size, size);
  const note = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x1b1530, side: THREE.DoubleSide }));
  note.name = 'estudio:nota';
  note.userData.facecam = true;
  return note;
}

/**
 * The garden's pun sign (jardim/kit.ts signBoard: a yellow board framed in ink on two lacquered posts, the
 * first two lines in Lilita One, the third in Nunito) rebuilt as a group of its own, so it can be scaled and
 * tipped. The first line is painted larger than the game's (condensed, fitText from 80 px instead of 40): at
 * the game's size the key word only reaches the 60 px a card needs when the board covers two thirds of it. The
 * posts stand under the board (the game's are 5 cm outside it), so the sign is no wider than its words. Faces +Z.
 */
function punSign(lines: [string, string, string], height: number): THREE.Group {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 160;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#ffd23f';
  g.fillRect(0, 0, 256, 160);
  g.strokeStyle = '#1b1530';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 246, 150);
  g.fillStyle = '#1b1530';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lilita = (px: number) => `400 ${px}px "Lilita One", system-ui, sans-serif`;
  // The key word slightly condensed: the same width on the board, taller letters.
  const squeeze = 0.8;
  g.save();
  g.scale(squeeze, 1);
  fitText(g, lines[0], 128 / squeeze, 54, 236 / squeeze, lilita, 80);
  g.restore();
  fitText(g, lines[1], 128, 106, 224, lilita, 30);
  fitText(g, lines[2], 128, 133, 224, (px) => `800 ${px}px Nunito, system-ui, sans-serif`, 18);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const face = new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient() });
  const wood = toon(0x8a5432);
  const sign = new THREE.Group();
  // BoxGeometry's groups: +x, -x, +y, -y, +z (the painted face), -z.
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.05), [wood, wood, wood, wood, face, wood]);
  board.position.y = height;
  sign.add(board);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, height + 0.3, 6), toon(ORIENTAL.lacquer));
    post.position.set(side * 0.42, (height + 0.3) / 2, -0.05);
    sign.add(post);
  }
  return sign;
}
