// The pets in a match (PF-29). Each pet is drawn by every game from its owner's position (nothing of it travels over
// the network but PlayerInfo.pet and, in the zumbi mode, the 'zpet' events): it follows its owner (client/pets/follow.ts),
// is animated in code (anim.ts) and uses its light mesh far away.
// - PvP (a look): a short leash, no sound at all, gone while its owner can't be seen from the camera (a ray about 10
//   times a second), dancing along with the Opressão; whoever ticked "hide other players' pets" sees none.
// - Zumbi (PvE): it follows its owner's path out of the cone in front of them, fades within 1 m of the camera, and
//   acts when the match says so: it runs to the zombie (the Amora biting a shin with her body outside the zombie's,
//   the Bruxinha's spell, the otter's stone flying, the weasel at the boards, the iguana's colorful tail left behind,
//   the cat pushing its owner up), a paw in the collar's color over the target for up to 1.5 s, and a short sound under
//   the mode's warnings (one bark or meow every 2 s at most, for the whole game).
import * as THREE from 'three';
import { collarOf, type PetId, type PlayerPet } from '@shared/pets';
import type { ServerMsg } from '@shared/protocol';
import type { Sfx } from '../audio/sfx';
import type { Effects } from '../render/effects';
import { PetAnimator, restPose, type Gesture, type PetPose } from './anim';
import { newFollow, stepFollow, type FollowState } from './follow';
import { PET_LIGHT_FROM, type PetModel } from './rig';
import { makePet } from './species';

type PetEvent = Extract<ServerMsg, { t: 'zpet' }>;

/** An owner this frame. */
export interface PetOwner {
  id: number;
  feet: THREE.Vector3;
  yaw: number;
  alive: boolean;
  /** Down in the zumbi mode (waiting for a revive). */
  downed: boolean;
  /** Doing the Opressão's dance. */
  dancing: boolean;
}

export interface PetHooks {
  scene: THREE.Scene;
  sfx: Sfx;
  effects: Effects;
  camera(): THREE.Camera;
  /** Nothing of the map between the two points (PvP: an owner out of sight hides their pet). */
  clearLine(from: THREE.Vector3, to: THREE.Vector3): boolean;
  /** A zombie's feet and size (zumbi), or null when it's gone. */
  zombie?(id: number): { feet: THREE.Vector3; scale: number; kind: string } | null;
  /** A barricade's middle (zumbi). */
  gap?(i: number): THREE.Vector3 | null;
}

/** At most one bark or meow every this many seconds (the whole game). */
const VOICE_GAP = 2;
/** The paw over the target, at most (s). */
const PAW_TIME = 1.5;
/** How often the PvP line of sight is checked (s). */
const SIGHT_EVERY = 0.1;

/** What a pet's ability looks like in its gesture. */
const ACT_GESTURE: Partial<Record<PetEvent['act'], Gesture>> = { hold: 'bite', nudge: 'bite', duck: 'cast', lift: 'push', nail: 'hammer', stone: 'throw', tail: 'tail' };

let pawTexture: THREE.CanvasTexture | null = null;
/** A paw print (white, tinted with the collar's color): a big pad and four toes, with a dark outline to read over anything. */
function pawTex(): THREE.CanvasTexture {
  if (pawTexture) return pawTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const blob = (x: number, y: number, rx: number, ry: number) => {
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  };
  g.fillStyle = '#ffffff';
  g.strokeStyle = 'rgba(20,16,24,0.85)';
  g.lineWidth = 3;
  blob(32, 41, 14, 12);
  blob(15, 25, 6, 8);
  blob(26, 15, 6, 8);
  blob(38, 15, 6, 8);
  blob(49, 25, 6, 8);
  pawTexture = new THREE.CanvasTexture(c);
  pawTexture.colorSpace = THREE.SRGBColorSpace;
  return pawTexture;
}

let spiralTexture: THREE.CanvasTexture | null = null;
/** A dizzy spiral (the otter's stone: never stars). */
function spiralTex(): THREE.CanvasTexture {
  if (spiralTexture) return spiralTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#fff8e8';
  g.lineWidth = 4;
  g.lineCap = 'round';
  g.beginPath();
  for (let a = 0; a < Math.PI * 6; a += 0.1) {
    const r = 3 + a * 1.4;
    const x = 32 + Math.cos(a) * r;
    const y = 32 + Math.sin(a) * r;
    if (a === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  spiralTexture = new THREE.CanvasTexture(c);
  spiralTexture.colorSpace = THREE.SRGBColorSpace;
  return spiralTexture;
}

/** A word drawn over the scene ("pfff"). */
function wordSprite(text: string, color: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 48;
  const g = c.getContext('2d')!;
  g.font = '900 34px Nunito, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(0,0,0,0.7)';
  g.fillStyle = color;
  g.strokeText(text, 64, 24);
  g.fillText(text, 64, 24);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(0.8, 0.3, 1);
  s.renderOrder = 11;
  return s;
}

/** Something drawn for a while (a paw, a spiral, a flying stone, a dropped tail, a word). */
interface Flash {
  obj: THREE.Object3D;
  until: number;
  update?(now: number, f: Flash): void;
}

class PetActor {
  readonly model: PetModel;
  readonly anim: PetAnimator;
  follow: FollowState | null = null;
  pose: PetPose = restPose();
  /** The side it walks on: by the owner's id, so everyone sees it on the same side. */
  readonly side: 1 | -1;
  /** What it's doing for its ability (zumbi), until when (match clock), and when the match said so. */
  act: PetEvent | null = null;
  actAt = 0;
  /** The hammer's blow last played (the weasel's gesture: three a loop). */
  beat = -1;
  /** Hidden by the rules this frame (PvP: owner out of sight; others' pets hidden; the owner dead). */
  sightT = 0;
  inSight = true;
  /** The iguana's tail grows back after this (match clock). */
  tailBack = 0;
  idleIn = 4;

  constructor(
    readonly owner: number,
    readonly pet: PlayerPet,
  ) {
    this.model = makePet(pet.id, pet.cor, collarOf(pet.coleira).cor, 'match');
    this.anim = new PetAnimator(this.model);
    this.side = owner % 2 === 0 ? 1 : -1;
  }
}

export class PetManager {
  private actors = new Map<number, PetActor>();
  private flashes: Flash[] = [];
  private voiceAt = -Infinity;
  private time = 0;
  /** Others' pets hidden (Settings, PvP only). */
  hideOthers = false;

  constructor(
    private h: PetHooks,
    /** 'pvp': a look; 'pve': the zumbi mode's abilities. */
    readonly mode: 'pvp' | 'pve',
    private me: number,
  ) {}

  /** A player's pet in this match (null: none). */
  set(owner: number, pet: PlayerPet | null | undefined) {
    const cur = this.actors.get(owner);
    if (cur && pet && cur.pet.id === pet.id && cur.pet.cor === pet.cor && cur.pet.coleira === pet.coleira) return;
    if (cur) this.remove(owner);
    if (!pet) return;
    const a = new PetActor(owner, pet);
    a.model.root.visible = false;
    this.h.scene.add(a.model.root);
    this.actors.set(owner, a);
  }

  remove(owner: number) {
    const a = this.actors.get(owner);
    if (!a) return;
    a.model.dispose();
    this.actors.delete(owner);
  }

  has(owner: number) {
    return this.actors.has(owner);
  }

  /** The pet of `owner` (its id), if it has one here. */
  petOf(owner: number): PetId | null {
    return this.actors.get(owner)?.pet.id ?? null;
  }

  /** The collar color of a player's pet (the paws, the HUD). */
  collarOf(owner: number): number {
    const a = this.actors.get(owner);
    return a ? collarOf(a.pet.coleira).cor : 0xffffff;
  }

  /** Per frame: everyone's pet follows (or acts), animates, picks its mesh and shows or hides. `now`: the match clock (ms). */
  update(dt: number, owners: PetOwner[], now: number) {
    this.time += dt;
    const cam = this.h.camera();
    const camPos = cam.getWorldPosition(new THREE.Vector3());
    const byId = new Map(owners.map((o) => [o.id, o]));
    for (const a of this.actors.values()) {
      const o = byId.get(a.owner);
      const root = a.model.root;
      if (!o || !o.alive) {
        root.visible = false;
        a.follow = null;
        continue;
      }
      const ow = { x: o.feet.x, y: o.feet.y, z: o.feet.z, yaw: o.yaw };
      a.follow ??= newFollow(ow, a.side);
      // Where to go: its ability's target, or after its owner.
      if (a.act) {
        // The cat stays with its owner while they're down (its 'up' or 'yield' ends it); the others until `until`.
        const over = a.act.act === 'lift' ? (!o.downed && now - a.actAt > 1000) || now > a.act.until + 3000 : now > a.act.until;
        if (over) a.act = null;
      }
      const to = this.mode === 'pve' ? this.actTarget(a, o, now) : null;
      stepFollow(a.follow, ow, dt, this.mode, a.side, to);
      const f = a.follow;
      root.position.set(f.x, f.y, f.z);
      root.rotation.y = f.yaw;
      // The pose.
      const p = a.pose;
      p.speed = f.speed;
      p.dance = o.dancing && !a.act;
      p.sit = this.mode === 'pve' && o.downed && !a.act ? 1 : f.speed < 0.2 && !a.act ? Math.min(1, p.sit + dt * 0.6) : 0;
      p.hover = a.pet.id === 'bruxinha' ? (this.mode === 'pvp' ? 0.22 : 0.6) : 0;
      p.tailGone = a.tailBack > now ? Math.min(1, (a.tailBack - now) / 4000) : 0;
      const g = a.act ? (ACT_GESTURE[a.act.act] ?? null) : null;
      if (g) {
        if (p.gesture !== g) {
          p.gesture = g;
          p.gestureT = 0;
        }
        p.gestureT = (p.gestureT + dt) % 0.95;
        // The weasel's light, high hammer, blow by blow.
        if (g === 'hammer') {
          const beat = Math.floor((p.gestureT / 0.95) * 3);
          if (beat !== a.beat) {
            a.beat = beat;
            this.h.sfx.at(a.model.root.position, 'normal', (s) => s.petHammer());
          }
        }
      } else if (p.gesture && p.gesture !== 'hello') {
        p.gesture = null;
      } else if (this.mode === 'pve' && f.speed < 0.2) {
        // Now and then, standing around: a little hello.
        a.idleIn -= dt;
        if (a.idleIn <= 0) {
          a.idleIn = 8 + Math.random() * 7;
          p.gesture = 'hello';
          p.gestureT = 0;
        }
        if (p.gesture === 'hello') {
          p.gestureT += dt;
          if (p.gestureT > 0.9) p.gesture = null;
        }
      }
      // Its head toward its owner (or its target).
      const look = to ?? { x: o.feet.x, z: o.feet.z };
      const yawTo = Math.atan2(-(look.x - f.x), -(look.z - f.z));
      let dy = yawTo - f.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      p.lookYaw = dy;
      a.anim.update(dt, p);
      // The light mesh far away; a faded pet right next to the camera (zumbi).
      const dist = camPos.distanceTo(root.position);
      a.model.setLight(dist > PET_LIGHT_FROM);
      a.model.setOpacity(this.mode === 'pve' && dist < 1 ? 0.35 : 1);
      root.visible = this.shown(a, o, camPos, dt);
    }
    this.renderFlashes(now);
  }

  /** PvP: never another's pet with the option on, nor one whose owner the camera can't see. */
  private shown(a: PetActor, o: PetOwner, camPos: THREE.Vector3, dt: number): boolean {
    if (this.mode === 'pve' || a.owner === this.me) return true;
    if (this.hideOthers) return false;
    a.sightT -= dt;
    if (a.sightT <= 0) {
      a.sightT = SIGHT_EVERY;
      a.inSight = this.h.clearLine(camPos, o.feet.clone().setY(o.feet.y + 1.1)) || this.h.clearLine(camPos, o.feet.clone().setY(o.feet.y + 1.6));
    }
    return a.inSight;
  }

  /** Where the pet goes for what it's doing (zumbi), or null to follow its owner. */
  private actTarget(a: PetActor, o: PetOwner, now: number): { x: number; z: number } | null {
    const e = a.act;
    if (!e) return null;
    const near = (p: THREE.Vector3, d: number) => {
      // On the line from the pet to the target, `d` short of it: its body outside the zombie's.
      const f = a.follow!;
      const dx = p.x - f.x;
      const dz = p.z - f.z;
      const len = Math.hypot(dx, dz) || 1;
      return { x: p.x - (dx / len) * d, z: p.z - (dz / len) * d };
    };
    switch (e.act) {
      case 'hold':
      case 'nudge': {
        const z = e.z !== undefined ? this.h.zombie?.(e.z) : null;
        return z ? near(z.feet, 0.45 * z.scale + 0.2) : null;
      }
      case 'duck': {
        const z = e.z !== undefined ? this.h.zombie?.(e.z) : null;
        return z && now < e.until ? near(z.feet, 1.4) : null;
      }
      case 'nail': {
        const g = e.i !== undefined ? this.h.gap?.(e.i) : null;
        return g && now < e.until + 300 ? near(g, 0.7) : null;
      }
      case 'lift':
        return o.downed ? near(o.feet, 0.45) : null;
      default:
        return null;
    }
  }

  /** A pet acted (the match's 'zpet', `now` the match clock): it goes there, its gesture, the paw, a sound. */
  onEvent(e: PetEvent, now: number) {
    const a = this.actors.get(e.id);
    if (!a || this.mode !== 'pve') return;
    if (e.act === 'yield' || e.act === 'up') {
      a.act = null;
      if (e.act === 'up') this.voice(a, () => a.model.root.position, (s) => s.meow(true));
      return;
    }
    // The weasel's last board (until now): its job is done.
    if (e.act === 'nail' && e.until <= now) {
      a.act = null;
      return;
    }
    a.act = e;
    a.actAt = now;
    a.pose.gestureT = 0;
    const color = collarOf(a.pet.coleira).cor;
    const sfx = this.h.sfx;
    const zombie = e.z !== undefined ? this.h.zombie?.(e.z) : null;
    const over = (p: THREE.Vector3, h: number) => p.clone().setY(p.y + h);
    switch (e.act) {
      case 'hold':
      case 'nudge':
        if (zombie) this.paw(over(zombie.feet, 2.1 * zombie.scale), color, Math.min(e.until, now + PAW_TIME * 1000));
        this.voice(a, () => a.model.root.position, (s) => s.bark());
        sfx.at(a.model.root.position, 'normal', (s) => s.bite());
        break;
      case 'duck':
        if (zombie) this.paw(over(zombie.feet, 2.2 * zombie.scale), color, now + PAW_TIME * 1000);
        sfx.at(a.model.root.position, 'normal', (s) => s.witchSpell());
        if (zombie) sfx.at(zombie.feet, 'normal', (s) => s.quack());
        break;
      case 'stone':
        this.voice(a, () => a.model.root.position, (s) => s.otterChirp());
        if (zombie) this.stone(a, e, zombie, color, now);
        break;
      case 'nail': {
        const g = e.i !== undefined ? this.h.gap?.(e.i) : null;
        if (g) this.paw(over(g, 2.2), color, now + PAW_TIME * 1000);
        break;
      }
      case 'tail':
        if (e.at) this.tail(a, new THREE.Vector3(...e.at), e.until, color, now);
        sfx.at(a.model.root.position, 'normal', (s) => s.tailPop());
        break;
      case 'lift':
        this.voice(a, () => a.model.root.position, (s) => s.meow());
        break;
    }
  }

  /** A bark or a meow, at most one every VOICE_GAP s in the whole game. */
  private voice(_a: PetActor, at: () => THREE.Vector3, play: (s: Sfx) => void) {
    if (this.time - this.voiceAt < VOICE_GAP) return;
    this.voiceAt = this.time;
    this.h.sfx.at(at().clone().setY(at().y + 0.4), 'normal', play);
  }

  private paw(at: THREE.Vector3, color: number, until: number) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: pawTex(), color, depthTest: false, transparent: true }));
    s.scale.setScalar(0.42);
    s.renderOrder = 10;
    s.position.copy(at);
    this.h.scene.add(s);
    const y0 = at.y;
    this.flashes.push({ obj: s, until, update: (now, f) => (s.position.y = y0 + Math.sin(now / 180) * 0.04 + Math.max(0, 1 - (f.until - now) / 300) * 0.2) });
  }

  /** The otter's stone: from her paws to the zombie's head in an arc, a knock, a dizzy spiral (and the bloater's "pfff"). */
  private stone(a: PetActor, e: PetEvent, z: { feet: THREE.Vector3; scale: number; kind: string }, color: number, now: number) {
    const from = a.model.root.position.clone().setY(a.model.root.position.y + 0.35);
    const to = z.feet.clone().setY(z.feet.y + 1.7 * z.scale);
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), new THREE.MeshToonMaterial({ color: 0x8a8a86 }));
    rock.position.copy(from);
    this.h.scene.add(rock);
    this.h.sfx.at(from, 'normal', (s) => s.stoneThrow());
    const t0 = now;
    const t1 = now + 350;
    let landed = false;
    this.flashes.push({
      obj: rock,
      until: t1,
      update: (n) => {
        const k = Math.min(1, (n - t0) / (t1 - t0));
        rock.position.lerpVectors(from, to, k);
        rock.position.y += Math.sin(k * Math.PI) * 0.6;
        rock.rotation.x += 0.3;
        if (k >= 1 && !landed) landed = true;
      },
    });
    setTimeout(() => {
      this.h.sfx.at(to, 'normal', (s) => s.stoneHit());
      this.h.effects.burst('debris', to, new THREE.Vector3(0, 1, 0), 6, 0xbab4a8);
    }, 350);
    this.paw(to.clone().setY(to.y + 0.45), color, Math.min(e.until, now + PAW_TIME * 1000));
    // Dizzy until the match says so: a spiral turning over its head.
    const spin = new THREE.Sprite(new THREE.SpriteMaterial({ map: spiralTex(), color: 0xfff4d8, depthTest: true, transparent: true }));
    spin.scale.setScalar(0.38);
    spin.position.copy(to).setY(to.y + 0.25);
    this.h.scene.add(spin);
    this.flashes.push({ obj: spin, until: e.until, update: (n) => (spin.material.rotation = n / 120) });
    if (z.kind === 'inchado') {
      // The bloater goes limp: "pfff", air puffing out.
      const word = wordSprite('pfff', '#f3f0e8');
      word.position.copy(to).setY(to.y - 0.3);
      this.h.scene.add(word);
      const y0 = word.position.y;
      this.flashes.push({ obj: word, until: now + 1200, update: (n) => (word.position.y = y0 + (n - now) / 2500) });
      this.h.effects.burst('debris', z.feet.clone().setY(z.feet.y + 1.1 * z.scale), new THREE.Vector3(0, 1, 0), 10, 0xf2f0ea);
      this.h.sfx.at(to, 'normal', (s) => s.deflate());
    }
  }

  /** The iguana's dropped tail: colorful, wriggling where it fell until the zombies give up on it; hers grows back. */
  private tail(a: PetActor, at: THREE.Vector3, until: number, color: number, now: number) {
    const g = new THREE.Group();
    const bands = [0xf2c230, 0xec6fb0, 0x2fa84f, 0x2f7fe0, 0xf07a1e];
    bands.forEach((c, i) => {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.035 - i * 0.005, 0.04 - i * 0.005, 0.1, 6), new THREE.MeshToonMaterial({ color: c }));
      seg.rotation.x = Math.PI / 2;
      seg.position.z = i * 0.09;
      g.add(seg);
    });
    g.position.copy(at).setY(at.y + 0.04);
    this.h.scene.add(g);
    this.flashes.push({ obj: g, until, update: (n) => g.children.forEach((c, i) => (c.position.x = Math.sin(n / 70 + i) * 0.03 * i)) });
    this.paw(at.clone().setY(at.y + 0.6), color, now + PAW_TIME * 1000);
    a.tailBack = until + 4000;
  }

  private renderFlashes(now: number) {
    this.flashes = this.flashes.filter((f) => {
      if (now < f.until) {
        f.update?.(now, f);
        return true;
      }
      f.obj.removeFromParent();
      f.obj.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
          if (o instanceof THREE.Mesh) o.geometry.dispose();
          const m = o.material as THREE.Material & { map?: THREE.Texture | null };
          if (m.map && m.map !== pawTexture && m.map !== spiralTexture) m.map.dispose();
          m.dispose();
        }
      });
      return false;
    });
  }

  /** Everything gone (leaving the match). */
  dispose() {
    for (const id of [...this.actors.keys()]) this.remove(id);
    this.renderFlashes(Infinity);
  }
}
