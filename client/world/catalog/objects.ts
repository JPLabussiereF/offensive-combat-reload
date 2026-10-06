// Gags and game objects as pieces: what reacts to shots (hydrants, flamingos, pumpkins, lamp posts, bells,
// the ghost's grave, the cauldron, scarecrows, the shooting gallery, the giant pumpkin, the clock, glowing
// mushrooms, the biscuit cabinet), the witch and her potion, the giant rat, the koi, the guard dog, lights
// (hanging bulbs, sconces, the chandelier), embers, bats and mist.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { POTION, RAT } from '@shared/constants';
import { toon, toonGradient } from '../../render/materials';
import { WORLD_GROUPS } from '../physics';
import { surfaceMaterial } from '../surfaces';
import { Hydrant } from '../hydrant';
import { flamingoGeometry } from '../decor';
import { ChowChow, namePlate } from '../dog';
import { candle } from '../furniture';
import { KoiSchool } from '../jardim/peixes';
import { seeded } from '../oriental';
import {
  Bats, Bell, Bonfire, Cauldron, FerrisWheel, GiantPumpkin, GiantRat, GlowShrooms, GrandfatherClock, GraveGhost, GroundMist, KitchenCabinet, ScoobyBiscuit, SPOOKY as C, TargetRow, Witch,
} from '../halloween';
import { bubbleAt } from './vehicles';
import { hangingLamp, light } from './haunted';
import { at, P, scaleOf, V, vec, yawOf, type Adapter, type BuildCtx } from './types';

type Vec3 = [number, number, number];

/** One flamingo geometry and material for every flamingo of a map. */
const flamingoParts = new WeakMap<object, { geo: THREE.BufferGeometry; mat: THREE.Material }>();

/** The map's objects entry of a collectible, rat or witch, by id (MapData.objetos). */
const pickupAt = (c: BuildCtx, id: string) => c.data.objetos.coletaveis.find((k) => k.id === id);

export const objects: Record<string, Adapter> = {
  /** Shoot it and it gushes; stand on it and you fly ("hidrante:N"). `p` is its base. */
  hidrante(c, p) {
    const [x, base, z] = at(p);
    const red = 0xe23b3b;
    const hydrant = new Hydrant(c.scene, new THREE.Vector3(x, base + 0.85, z), c.s.drops, c.sfx);
    const onShot = c.props.register(p.prop ?? 'hidrante:0', () => hydrant.burst());
    c.b.cylinder(x, base, z, 0.2, 0.06, 'metal', { tint: 0xb02a2a, collide: false }); // flange
    c.b.cylinder(x, base, z, 0.16, 0.66, 'metal', { tint: red, onShot });
    c.b.addGeometry(new THREE.SphereGeometry(0.16, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, base + 0.66, z), surfaceMaterial('metal'), red);
    c.b.cylinder(x, base + 0.78, z, 0.05, 0.08, 'metal', { tint: 0xd8dde3, collide: false }); // cap nut
    for (const side of [-1, 1]) {
      const nozzle = new THREE.CylinderGeometry(0.06, 0.06, 0.14, 8).rotateZ(Math.PI / 2).translate(x + side * 0.2, base + 0.45, z);
      c.b.addGeometry(nozzle, surfaceMaterial('metal'), 0xd8dde3);
    }
    c.animate((dt, f) => hydrant.update(dt, f.feet, f.launch));
  },

  /** Lawn flamingo: spins when shot ("flamingo:N"). */
  flamingo(c, p) {
    const [x, , z] = at(p);
    let parts = flamingoParts.get(c.s);
    if (!parts) flamingoParts.set(c.s, (parts = { geo: flamingoGeometry(), mat: new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }) }));
    const pivot = new THREE.Mesh(parts.geo, parts.mat);
    pivot.position.set(x, 0, z);
    pivot.rotation.y = yawOf(p);
    pivot.castShadow = true;
    c.scene.add(pivot);
    let spin = 0;
    const desc = RAPIER.ColliderDesc.cylinder(0.6, 0.25).setTranslation(x, 0.9, z).setCollisionGroups(WORLD_GROUPS);
    const col = c.physics.world.createCollider(desc, c.physics.staticBody);
    c.physics.surfaces.set(col.handle, {
      material: 'wood',
      onShot: c.props.register(p.prop ?? 'flamingo:0', () => {
        spin = Math.min(spin + 18, 40);
        c.sfx.at({ x, y: 0.9, z }, 'normal', (s) => s.squeak());
      }),
    });
    c.animate((dt) => {
      pivot.rotation.y += spin * dt;
      spin *= Math.exp(-2.5 * dt);
    });
  },

  /** Jack-o'-lantern that smashes when shot and grows back ("abobora:N"): one of the map's instanced pumpkins. */
  abobora(c, p) {
    const [x, y, z] = at(p);
    c.s.c.pumpkins.add(x, y, z, yawOf(p), scaleOf(p), p.prop);
  },

  /** Old street lamp; some flicker, a shot puts it out for a while ("poste:N"). */
  poste(c, p) {
    const q = P<{ braco: [number, number]; piscar?: boolean }>(p);
    const [x, , z] = at(p);
    c.s.c.lamps.add({ x, z, dir: q.braco, ...(q.piscar ? { flicker: true } : {}) }, p.prop);
  },

  /** Knocked over when shot, it gets back up ("espantalho:N"). */
  espantalho(c, p) {
    const [x, , z] = at(p);
    c.s.c.scarecrows.add(x, z, yawOf(p), p.prop);
  },

  /** The grave of the grumpy ghost: shoot it and he rises complaining ("fantasma"). */
  fantasma(c, p) {
    const [x, y, z] = at(p);
    const ghost = new GraveGhost(c.scene, c.b, c.props, V(x, y, z), yawOf(p), c.s.puffs, {
      moan: () => c.sfx.at({ x, y: 1, z }, 'normal', (s) => s.ghostMoan()),
      talk: () => c.sfx.at({ x, y: 1.5, z }, 'normal', (s) => s.grumble()),
    });
    c.animate((dt) => ghost.update(dt));
  },

  /**
   * Bronze bell that swings and rings when shot (`prop` its id). `som`: where it's heard (`alto`: loud); with
   * `bolha`, ringing it `toques` times within 8 s gets a complaint in a bubble.
   */
  sino(c, p) {
    const q = P<{ tamanho: number; som: Vec3; tom?: number; alto?: boolean; bolha?: { p: Vec3; largura: number; texto: string; toques: number } }>(p);
    const [sx, sy, sz] = q.som;
    const sound = { x: sx, y: sy, z: sz };
    const complaint = q.bolha && { ...q.bolha, bubble: bubbleAt(c, V(...q.bolha.p), q.bolha.largura) };
    let complained = -99;
    const bell = new Bell(c.scene, c.b, vec(p), q.tamanho, c.props, p.prop ?? 'sino', (recent) => {
      c.sfx.at(sound, q.alto ? 'loud' : 'normal', (s) => (q.tom === undefined ? s.churchBell() : s.churchBell(q.tom)));
      if (complaint && recent >= complaint.toques && c.clock.now - complained > 8) {
        complained = c.clock.now;
        complaint.bubble.say(complaint.texto, 3);
        c.sfx.at(sound, 'normal', (s) => s.grumble());
      }
    });
    c.animate((dt) => bell.update(dt));
  },

  /** The witch's cauldron: bubbles when shot and now and then spits a rubber duck that waddles in `area` ("caldeirao"). */
  caldeirao(c, p) {
    const area = P<{ area: { x0: number; x1: number; z0: number; z1: number } }>(p).area;
    const cauldron = new Cauldron(c.scene, c.b, vec(p), c.props, c.s.puffs, area, {
      bubble: (pos) => c.sfx.at(pos, 'normal', (s) => s.cauldronBubble()),
      quack: (pos) => c.sfx.at(pos, 'normal', (s) => s.quack()),
    });
    c.animate((dt) => cauldron.update(dt));
  },

  /** The witch stirring away: near her, her potion can be drunk (MapData.objetos.bruxa is where she stands). */
  bruxa(c, p) {
    const witch = new Witch(c.scene, c.b, vec(p), yawOf(p), c.props, {
      cackle: (pos) => c.sfx.at(pos, 'loud', (x) => x.evilLaugh()),
      scold: (pos) => c.sfx.at(pos, 'normal', (x) => x.grumble()),
    });
    c.animate((dt, f) => witch.update(dt, f.listener));
    c.out.potion = { at: witch.feet, radius: POTION.radius, drink: (kind) => witch.drink(kind) };
  },

  /** Shooting gallery targets ("alvo:N"): knocking all down plays the fanfare at `festa` and gives sharp aim. */
  alvos(c, p) {
    const q = P<{ alvos: Vec3[]; lampadas?: Vec3[]; festa: Vec3 }>(p);
    const [fx, fy, fz] = q.festa;
    const rewards = c.rewards();
    const gallery = new TargetRow(
      c.scene,
      c.b,
      c.props,
      q.alvos.map((s) => V(...s)),
      (pos) => c.sfx.at(pos, 'normal', (s) => s.targetDing()),
      (local) => {
        c.sfx.at({ x: fx, y: fy, z: fz }, 'loud', (s) => s.carnivalJingle());
        if (local) rewards.aimBonus?.();
      },
      (q.lampadas ?? []).map((s) => V(...s)),
    );
    c.animate((dt) => gallery.update(dt));
  },

  rodaGigante(c, p) {
    const [x, , z] = at(p);
    const wheel = new FerrisWheel(c.scene, c.b, x, z, P<{ raio: number }>(p).raio);
    c.animate((dt) => wheel.update(dt));
  },

  fogueira(c, p) {
    const fire = new Bonfire(c.scene, c.b, vec(p), c.s.puffs);
    c.animate((dt) => fire.update(dt));
  },

  /** The giant pumpkin: laughs when shot ("aboboragigante"). */
  aboboraGigante(c, p) {
    const [x, , z] = at(p);
    const giant = new GiantPumpkin(c.scene, c.b, x, z, P<{ raio: number }>(p).raio, yawOf(p), c.props, () => c.sfx.at({ x, y: 2, z }, 'loud', (s) => s.evilLaugh()));
    c.animate((dt) => giant.update(dt));
  },

  /** The grandfather clock: chimes the hour when shot ("relogio"), heard from `som`. */
  relogio(c, p) {
    const [x, y, z] = at(p);
    const [sx, sy, sz] = P<{ som: Vec3 }>(p).som;
    const clock = new GrandfatherClock(c.scene, c.b, x, y, z, yawOf(p), c.props, (hour) => c.sfx.at({ x: sx, y: sy, z: sz }, 'loud', (s) => s.clockChime(hour === 12 ? 4 : 3)));
    c.animate((dt) => clock.update(dt));
  },

  /** Mushrooms that light up when shot ("cogumelo:N"). */
  cogumelosBrilho(c, p) {
    const pts = P<{ pontos: Vec3[] }>(p).pontos;
    const shrooms = new GlowShrooms(c.scene, c.b, pts.map((s) => V(...s)), c.props, (pos) => c.sfx.at(pos, 'normal', (s) => s.targetDing()));
    c.animate((dt) => shrooms.update(dt));
  },

  /** The tall kitchen cabinet: shoot or stab it and its doors swing open on the biscuits (the piece's collectible). */
  armarioBiscoito(c, p) {
    const [sx, sy, sz] = P<{ som: Vec3 }>(p).som;
    const cabinet = new KitchenCabinet(c.scene, c.b, vec(p), yawOf(p), c.props, () => c.sfx.at({ x: sx, y: sy, z: sz }, 'normal', (s) => s.cabinetCreak()));
    const pickup = p.coletavel ? pickupAt(c, p.coletavel) : undefined;
    const biscuit = pickup ? new ScoobyBiscuit(c.scene, pickup.id, V(...pickup.p), cabinet) : null;
    c.animate((dt) => {
      cabinet.update(dt);
      biscuit?.update(dt);
    });
    c.out.stabbable.push((eye, fwd, reach) => cabinet.stab(eye, fwd, reach));
    if (biscuit) c.out.pickups.push(biscuit);
  },

  /** The giant rat in the sewer (MapData.objetos.ratos): our hits bring it down and the game claims its humanity. */
  ratoGigante(c, p) {
    const id = P<{ id: string }>(p).id;
    const rewards = c.rewards();
    const rat = new GiantRat(c.scene, c.b, id, vec(p), yawOf(p), RAT.hits, RAT.stab, (rid) => rewards.ratDown?.(rid), c.s.puffs, {
      squeak: (pos) => c.sfx.at(pos, 'normal', (s) => s.ratSqueak()),
      hurt: (pos) => c.sfx.at(pos, 'normal', (s) => s.ratHit()),
      death: (pos) => c.sfx.at(pos, 'loud', (s) => s.ratDeath()),
    });
    c.animate((dt, f) => rat.update(dt, f.time, f.listener));
    c.out.stabbable.push((eye, fwd, reach) => rat.stab(eye, fwd, reach));
    c.out.rats.push({ id: rat.id, kill: (ready) => rat.kill(ready), set: (ready) => rat.set(ready) });
  },

  /** The koi of every pond (MapData.objetos.peixes): they swim on the game clock and can be shot. */
  peixes(c, p) {
    const fish = c.data.objetos.peixes.map((f) => ({ id: f.id, pond: f.lago, loop: f.volta, y: f.y }));
    const koi = new KoiSchool(c.scene, fish, c.s.drops, seeded(p.semente ?? 4242));
    c.animate((dt, { time }) => koi.update(dt, time));
    c.out.fish = koi;
  },

  /**
   * The guard dog in front of her house's door (the house at `p`, scaled by `escala`, its door toward +Z): bites
   * whoever steps in front of it. Her name is on a plate over the door.
   */
  cachorro(c, p) {
    const [hx, , hz] = at(p);
    const scale = scaleOf(p);
    // The door wall is 0.7 m (model units) from the center.
    const doorZ = hz + 0.7 * scale;
    const plate = namePlate(P<{ nome: string }>(p).nome, 0.44 * scale, 0.14 * scale);
    plate.position.set(hx, (0.66 + 0.07) * scale, doorZ + 0.02 * scale + 0.004);
    c.scene.add(plate);
    // Bite zone: the strip in front of her door, a bit wider than the house and ~2.3 m deep.
    const zone = new THREE.Box3(new THREE.Vector3(hx - 1.35, -0.5, doorZ - 0.05), new THREE.Vector3(hx + 1.35, 1.2, doorZ + 2.3));
    c.out.dog = new ChowChow(c.scene, c.physics, new THREE.Vector3(hx, 0, doorZ + 0.45), yawOf(p), zone, c.sfx);
  },

  /** A bulb hanging on its cord from a ceiling (`p` at the ceiling). */
  lampadaPendurada(c, p) {
    const q = P<{ intensidade?: number; alcance?: number }>(p);
    const [x, top, z] = at(p);
    const o: { intensity?: number; range?: number } = {};
    if (q.intensidade !== undefined) o.intensity = q.intensidade;
    if (q.alcance !== undefined) o.range = q.alcance;
    hangingLamp(c, x, top, z, o);
  },

  /** Candles in a wall bracket (`para`: the direction away from the wall); its light stands a metre into the room. */
  arandela(c, p) {
    const [x, y, z] = at(p);
    const out = P<{ para: [number, number] }>(p).para;
    const across = (k: number) => [out[1] * k, -out[0] * k];
    c.b.box(x + out[0] * 0.015, y, z + out[1] * 0.015, out[0] ? 0.03 : 0.16, 0.26, out[1] ? 0.03 : 0.16, 'metal', { tint: 0x8a6a2a, collide: false, castShadow: false });
    c.b.box(x + out[0] * 0.1, y - 0.06, z + out[1] * 0.1, out[0] ? 0.17 : 0.32, 0.025, out[1] ? 0.17 : 0.32, 'metal', { tint: 0x8a6a2a, collide: false, castShadow: false });
    for (const k of [-1, 1]) {
      const [ax, az] = across(k * 0.11);
      candle(c.b, c.s.c.glow, x + out[0] * 0.12 + ax, y - 0.05, z + out[1] * 0.12 + az, 0.12, false);
    }
    // Small: it shouldn't light the room behind the wall.
    light(c, x + out[0] * 1.1, y + 0.1, z + out[1] * 1.1, { intensity: 7, range: 7, flicker: 0.5 });
  },

  /** Iron chandelier with candles, swaying a hair (its light is a light piece of its own). */
  lustre(c, p) {
    const chandelier = new THREE.Group();
    const iron = toon(C.iron);
    chandelier.add(new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.05, 6, 24).rotateX(Math.PI / 2), iron));
    chandelier.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 4).translate(0, 0.7, 0), iron));
    const flames = Array.from({ length: 8 }, (_, k) => new THREE.ConeGeometry(0.05, 0.14, 5).translate(Math.cos((k / 8) * Math.PI * 2) * 1.1, 0.18, Math.sin((k / 8) * Math.PI * 2) * 1.1));
    chandelier.add(new THREE.Mesh(mergeGeometries(flames, false)!, new THREE.MeshBasicMaterial({ color: C.candle })));
    chandelier.position.copy(vec(p));
    c.scene.add(chandelier);
    c.animate(() => (chandelier.rotation.z = Math.sin(c.clock.now * 0.7) * 0.02));
  },

  /** Embers rising from a fire (the mansion's fireplace). */
  brasas(c, p) {
    const [x, y, z] = at(p);
    let ember = 0;
    c.animate((dt) => {
      ember -= dt;
      if (ember > 0) return;
      ember = 0.08;
      const hot = Math.random();
      c.s.puffs.emit(V(x, y, z + (Math.random() - 0.5) * 0.7), 0.05, 0.9 + Math.random() * 0.5, 0, 0.45, 0.13, 0.03, hot < 0.5 ? 0xffc040 : 0xff6a1a);
    });
  },

  morcegos(c, p) {
    const flocks = P<{ bandos: { centro: Vec3; raio: number; n: number }[] }>(p).bandos;
    const bats = new Bats(c.scene, flocks.map((f) => ({ center: V(...f.centro), radius: f.raio, count: f.n })), c.rand);
    c.animate((dt) => bats.update(dt));
  },

  nevoa(c, p) {
    const mist = new GroundMist(c.scene, P<{ manchas: Vec3[] }>(p).manchas, c.rand);
    c.animate((dt) => mist.update(dt));
  },
};
