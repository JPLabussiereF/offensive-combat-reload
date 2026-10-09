// The Galpão's pets (PF-29): the one taken along on the overview (on the hero table's top, or a dog standing behind
// it with its paws on it; never under the menu, gone in portrait), the 07 · PETS station by the front door (the
// collar rack with one hook per pet, the pet called in sitting on the doormat, the swap: the one there trots out to
// the yard while the new one comes in, on the mat within 0.8 s, its gesture done within 2 s, a new click
// interrupting it; a dry swap with reduced motion), and the launch (the pet running out ahead through the roll-up
// door). At most the overview's pet and one visitor are drawn (two visitors only while they cross at the door).
// The scene (scene.ts) adds `root` to the warehouse and calls `update` every frame; the tags are DOM (petBoard.ts).
import * as THREE from 'three';
import { COLLARS, PET_IDS, petLook, PETS, type PetChoice, type PetId } from '@shared/pets';
import { GESTURE_TIME, PetAnimator, restPose, STATION_GESTURE, type Gesture, type PetPose } from '../../pets/anim';
import type { PetModel } from '../../pets/rig';
import { makePet } from '../../pets/species';
import { clearOfHands, petSpot, type CamStation, type StationId } from './galpaoRules';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (t: number) => t * t * (3 - 2 * t);

/** The front door (the yard's) and the station's spots, in the warehouse's space. */
export const PET_DOOR = V(-0.2, 0, 8.0);
/** The doormat, 0.7 m in from the threshold. */
export const PET_MAT = V(-0.2, 0, 7.3);
/** Where a pet comes in from (the yard, out of the door's light) and where one leaving goes. */
const YARD_IN = V(-0.15, 0, 9.6);
const YARD_OUT = V(0.75, 0, 10.4);
/** The rack of hooks on the wall left of the door: x from -1.0 to -2.5, the hooks at 1.45 m. */
export const RACK = { x0: -1.0, x1: -2.5, y: 1.45, z: 7.93 };
/** The station's camera (the PF-36 framing) looks from here: the pets on the mat turn to it. */
const STATION_EYE = V(2.2, 1.3, 4.8);
/** The roll-up door's threshold (the launch runs out through it, on the door's left, clear of the play table and of
 * the drums), crossed RUN_DOOR s in (the white starts at 1.6 s), after a RUN_HOP s jump down. */
const LAUNCH_DOOR = V(4.0, 0, -7.9);
const LAUNCH_OUT = V(4.2, 0, -10.8);
const RUN_DOOR = 1.3;
const RUN_HOP = 0.35;
const RUN_AHEAD = 3.6;
/** The play table (scene.ts tableAt 5.2, -4.5, 3.0 x 1.7) with some room: the run keeps to its left. */
const PLAY_TABLE = { x: 3.35, z0: -5.7, z1: -3.3 };
/** How far apart (px) the tags' rows hang, at most three of them, and the room (px) between two tags of a row. */
const TAG_ROW = 48;
const TAG_GAP = 4;
/** The swap's timings (s): on the mat by ENTER, the gesture from GESTURE_AT. */
const ENTER = 0.7;
const GESTURE_AT = 0.75;

export interface PetRef {
  id: PetId;
  cor: string;
  coleira: string;
}

const collarHex = (id: string) => (COLLARS.find((c) => c.id === id) ?? COLLARS[0]).cor;
const yawTo = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
const sameRef = (a: PetRef | null, b: PetRef | null) => !!a && !!b && a.id === b.id && a.cor === b.cor && a.coleira === b.coleira;

/** A pet in the Galpão: its model, its animator and pose, where it's going. */
class Actor {
  readonly model: PetModel;
  readonly anim: PetAnimator;
  pose: PetPose = restPose();
  path: THREE.Vector3[] | null = null;
  pathT = 0;
  pathDur = 1;
  /** Seconds since it was called (the station's swap). */
  age = 0;
  leaving = false;

  constructor(readonly ref: PetRef) {
    this.model = makePet(ref.id, ref.cor, collarHex(ref.coleira), 'galpao');
    this.anim = new PetAnimator(this.model);
  }

  gesture(g: Gesture) {
    this.pose.gesture = g;
    this.pose.gestureT = 0;
  }

  dispose() {
    this.model.dispose();
  }
}

export interface PetStageFrame {
  dt: number;
  time: number;
  camera: THREE.PerspectiveCamera;
  station: CamStation;
  arrived: boolean;
  peek: StationId | null;
  vw: number;
  vh: number;
  /** Seconds into the launch cinematic (null: none). */
  launch: number | null;
  /** The overview menu's box on screen (the pet must stay clear of it). */
  menuRect: DOMRect | null;
}

export class PetStage {
  readonly root = new THREE.Group();
  private along: PetRef | null = null;
  private overview: Actor | null = null;
  private visitor: Actor | null = null;
  private leaving: Actor[] = [];
  private choice: PetChoice | null = null;
  /** The rack: a collar on each hook (in the pet's color; the hook of the one taken along is empty). */
  private collars = new Map<PetId, THREE.Mesh>();
  private tags = new Map<PetId, HTMLElement>();
  private tagReveal = 0;
  private idleIn = 9;
  private rim = new THREE.PointLight(0x9fc4ff, 0, 2.6, 2);
  /** Where the overview's pet stands, after the menu check (null: hidden). */
  private spot: { at: THREE.Vector3; pose: 'sit' | 'table' } | null = null;
  private spotKey = '';
  private launching: { runs: boolean; from: THREE.Vector3 | null; prev: THREE.Vector3 | null; speed: number } | null = null;
  private pick = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }));
  private peekWas: StationId | null = null;

  constructor(private o: { reduceMotion: boolean; mobile: boolean }) {
    this.root.add(this.rim);
    this.pick.userData.station = 'pets';
    this.pick.visible = false;
    this.buildRack();
  }

  /** The invisible box around the overview's pet: clicking it goes to the station. */
  get pickables(): THREE.Object3D[] {
    return this.overview && this.spot ? [this.pick] : [];
  }

  /** Where the overview's pet is (the menu's PETS item hovered: the camera leans toward it), or null. */
  peekPoint(): THREE.Vector3 | null {
    return this.overview && this.spot ? this.spot.at.clone().setY(this.spot.at.y + 0.3) : null;
  }

  /** The pet shown at the station (its card): the one called in. */
  get visiting(): PetId | null {
    return this.visitor?.ref.id ?? null;
  }

  /** Where each hook is (the tags hang under them). */
  hookAt(id: PetId): THREE.Vector3 {
    const i = PET_IDS.indexOf(id);
    const step = (RACK.x0 - RACK.x1) / PET_IDS.length;
    return V(RACK.x0 - step * (i + 0.5), RACK.y, RACK.z);
  }

  bindTags(tags: Map<PetId, HTMLElement>) {
    this.tags = tags;
    for (const el of tags.values()) el.style.visibility = 'hidden';
  }

  /** The account's choice: the pet taken along (the overview's), and every collar on the rack. */
  setChoice(c: PetChoice) {
    this.choice = c;
    const ref = c.id ? { id: c.id, ...petLook(c, c.id) } : null;
    if (!sameRef(ref, this.along)) {
      this.along = ref;
      this.overview?.dispose();
      this.overview = ref ? new Actor(ref) : null;
      if (this.overview) {
        this.overview.model.root.visible = false;
        this.root.add(this.overview.model.root);
        this.overview.model.root.add(this.pick);
      }
      this.spotKey = '';
    }
    for (const id of PET_IDS) {
      const ring = this.collars.get(id)!;
      (ring.material as THREE.MeshStandardMaterial).color.setHex(collarHex(petLook(c, id).coleira));
      // The one taken along wears its collar: its hook is empty.
      ring.visible = c.id !== id;
    }
    // The visitor's look follows its card (a new coat or collar: the same pet, redressed).
    if (this.visitor) {
      const v = this.visitor.ref.id;
      const ref2 = { id: v, ...petLook(c, v) };
      if (!sameRef(ref2, this.visitor.ref)) this.replaceVisitor(ref2);
    }
  }

  /** Calls a pet in at the station: it comes in from the yard and sits on the mat; the one there trots out. */
  call(id: PetId) {
    const c = this.choice;
    const ref = { id, ...petLook(c, id) };
    if (this.visitor && this.visitor.ref.id === id) {
      // Already here: the gesture again.
      if (!this.o.reduceMotion) this.visitor.gesture(STATION_GESTURE[id]);
      return;
    }
    if (this.visitor) this.sendOut(this.visitor);
    const a = new Actor(ref);
    this.root.add(a.model.root);
    this.visitor = a;
    if (this.o.reduceMotion) {
      this.place(a, PET_MAT, yawTo(PET_MAT, STATION_EYE));
      a.pose.sit = 1;
      return;
    }
    a.path = [YARD_IN.clone(), V(PET_DOOR.x + 0.05, 0, PET_DOOR.z + 0.3), PET_MAT.clone()];
    a.pathDur = ENTER;
    this.place(a, YARD_IN, Math.PI);
  }

  /** At the station already sitting on the mat: the one taken along (or the first pet). */
  arriveAt() {
    if (this.visitor) return;
    const id = this.along?.id ?? PET_IDS[0];
    const ref = { id, ...petLook(this.choice, id) };
    const a = new Actor(ref);
    this.root.add(a.model.root);
    this.visitor = a;
    this.place(a, PET_MAT, yawTo(PET_MAT, STATION_EYE));
    a.pose.sit = 1;
    a.age = 10;
  }

  /** The same pet in a new coat or collar: swapped in place, no walk. */
  private replaceVisitor(ref: PetRef) {
    const old = this.visitor!;
    const a = new Actor(ref);
    this.root.add(a.model.root);
    a.model.root.position.copy(old.model.root.position);
    a.model.root.rotation.y = old.model.root.rotation.y;
    a.pose = { ...old.pose };
    a.path = old.path;
    a.pathT = old.pathT;
    a.pathDur = old.pathDur;
    a.age = old.age;
    old.dispose();
    this.visitor = a;
  }

  private sendOut(a: Actor) {
    a.leaving = true;
    a.pose.gesture = null;
    a.pose.sit = 0;
    if (this.o.reduceMotion) {
      a.dispose();
      return;
    }
    const from = a.model.root.position.clone();
    a.path = [from, V(PET_DOOR.x + 0.35, 0, PET_DOOR.z + 0.2), YARD_OUT.clone()];
    a.pathDur = 0.9;
    a.pathT = 0;
    this.leaving.push(a);
  }

  private place(a: Actor, p: THREE.Vector3, yaw: number) {
    a.model.root.position.copy(p);
    a.model.root.rotation.y = yaw;
  }

  /** The launch: the pet taken along runs out ahead through the roll-up door (`runs` false: it stays, it isn't along). */
  launch(runs: boolean) {
    this.launching = { runs: runs && !!this.overview && !this.o.reduceMotion, from: null, prev: null, speed: 0 };
  }

  private buildRack() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.7 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa1a6, metalness: 0.8, roughness: 0.35 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(RACK.x0 - RACK.x1 + 0.1, 0.5, 0.04), wood);
    board.position.set((RACK.x0 + RACK.x1) / 2, RACK.y + 0.05, RACK.z + 0.01);
    board.castShadow = board.receiveShadow = true;
    this.root.add(board);
    for (const id of PET_IDS) {
      const at = this.hookAt(id);
      const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 6), steel);
      peg.rotation.x = Math.PI / 2;
      peg.position.set(at.x, at.y + 0.12, at.z - 0.05);
      this.root.add(peg);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 6, 18), new THREE.MeshStandardMaterial({ color: 0xd8352a, roughness: 0.5 }));
      ring.position.set(at.x, at.y + 0.05, at.z - 0.06);
      ring.castShadow = true;
      this.root.add(ring);
      const tagPlate = new THREE.Mesh(new THREE.CircleGeometry(0.018, 10), new THREE.MeshStandardMaterial({ color: 0xf2d27a, metalness: 0.9, roughness: 0.3 }));
      tagPlate.position.set(0, -0.085, 0.005);
      ring.add(tagPlate);
      this.collars.set(id, ring);
    }
  }

  /** Per frame (from the scene's loop). */
  update(f: PetStageFrame) {
    this.updateOverview(f);
    this.updateStation(f);
    this.updateTags(f);
  }

  // ---- the overview's pet

  private updateOverview(f: PetStageFrame) {
    const a = this.overview;
    if (!a) {
      this.rim.intensity = 0;
      return;
    }
    const root = a.model.root;
    if (this.launching) return this.updateLaunch(a, f);
    // Where it stands, again when the window changes (checked against the menu once the camera has arrived).
    const key = `${f.vw}x${f.vh}|${f.station === 'home' && f.arrived}`;
    if (key !== this.spotKey) {
      this.spotKey = key;
      this.findSpot(a, f);
    }
    const s = this.spot;
    root.visible = !!s && (f.station === 'home' || f.station === 'intro' || f.station === 'profile' || f.station === 'album' || f.station === 'play');
    if (!s) return;
    root.position.copy(s.at);
    // Facing the overview's camera (a dog behind the table faces it straight).
    root.rotation.y = s.pose === 'table' ? Math.PI : yawTo(s.at, V(0.45, 0, 3.25));
    a.pose.table = s.pose === 'table' ? 1 : 0;
    a.pose.sit = s.pose === 'sit' ? 1 : 0;
    a.pose.hover = a.ref.id === 'bruxinha' ? 0.06 : 0;
    // Still: breathing only, and a gesture every 8 to 15 s; the PETS item hovered: a hello at once.
    if (f.peek === 'pets' && this.peekWas !== 'pets') a.gesture('hello');
    this.peekWas = f.peek;
    this.idleIn -= f.dt;
    if (this.idleIn <= 0) {
      this.idleIn = 8 + Math.random() * 7;
      a.gesture('hello');
    }
    this.tickGesture(a, f.dt);
    a.anim.update(f.dt, a.pose);
    // A faint cold rim light from behind, to lift a dark pet off the dark warehouse.
    this.rim.position.copy(s.at).add(V(0.6, 0.9, -0.8));
    this.rim.intensity = root.visible ? 1.2 : 0;
    // The pick box around it.
    const h = a.model.height * (s.pose === 'table' ? 1.3 : 1);
    this.pick.scale.set(Math.max(0.35, a.model.length * 0.7), h, Math.max(0.35, a.model.length * 0.7));
    this.pick.position.set(0, h / 2, 0);
  }

  /**
   * The spot by the window's size (galpaoRules.petSpot), then its box projected on the screen: it must not cross the
   * menu. A small pet slides left along the table top until it's clear (skipping the spots by the character's hands);
   * one that can't be cleared is hidden.
   */
  private findSpot(a: Actor, f: PetStageFrame) {
    const s = petSpot(f.vw, f.vh, PETS[a.ref.id].porte);
    if (!s) {
      this.spot = null;
      return;
    }
    // (The spot itself keeps PET_CLEARANCE from the character's hands: galpaoRules.test.ts checks it.)
    const at = V(...s.at);
    this.spot = { at, pose: s.pose };
    const menu = f.menuRect;
    if (!menu || f.station !== 'home' || !f.arrived) return;
    const box = new THREE.Box3();
    const corner = V();
    const cam = f.camera;
    cam.updateMatrixWorld();
    for (let k = 0; k <= 6; k++) {
      const p = at.clone().add(V(-0.12 * k, 0, 0));
      // Sliding left crosses the character's hands: never a spot within PET_CLEARANCE of them.
      if (s.pose === 'sit' && !clearOfHands(p.x, p.z)) continue;
      const hgt = a.model.height * (s.pose === 'table' ? 1.3 : 1);
      box.set(p.clone().add(V(-0.2, 0, -0.2)), p.clone().add(V(0.2, hgt, 0.2)));
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam);
        const x = (corner.x * 0.5 + 0.5) * f.vw;
        const y = (0.5 - corner.y * 0.5) * f.vh;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      const hits = maxX > menu.left && minX < menu.right && maxY > menu.top && minY < menu.bottom;
      if (!hits) {
        this.spot = { at: p, pose: s.pose };
        return;
      }
      if (s.pose === 'table') break;
    }
    this.spot = null;
  }

  private tickGesture(a: Actor, dt: number) {
    const g = a.pose.gesture;
    if (!g) return;
    a.pose.gestureT += dt;
    if (a.pose.gestureT > GESTURE_TIME[g]) a.pose.gesture = null;
  }

  // ---- the station

  private updateStation(f: PetStageFrame) {
    const here = f.station === 'pets';
    if (here && !this.visitor) this.arriveAt();
    for (const a of [this.visitor, ...this.leaving]) {
      if (!a) continue;
      a.model.root.visible = here;
      a.age += f.dt;
      if (a.path) {
        a.pathT = Math.min(1, a.pathT + f.dt / a.pathDur);
        const curve = new THREE.CatmullRomCurve3(a.path);
        const k = a.leaving ? a.pathT : smooth(a.pathT) * 0.85 + a.pathT * 0.15;
        const p = curve.getPointAt(k);
        const ahead = curve.getPointAt(Math.min(1, k + 0.02));
        a.model.root.position.copy(p);
        if (ahead.distanceToSquared(p) > 1e-6) a.model.root.rotation.y = yawTo(p, ahead);
        a.pose.speed = a.pathT < 1 ? curve.getLength() / a.pathDur : 0;
        if (a.pathT >= 1) {
          a.path = null;
          if (!a.leaving) {
            // On the mat: turned to the camera, sitting.
            a.model.root.rotation.y = yawTo(PET_MAT, STATION_EYE);
            a.pose.speed = 0;
          }
        }
      }
      if (!a.leaving) {
        if (!a.path) a.pose.sit = Math.min(1, a.pose.sit + f.dt * 6);
        // Its gesture, once on the mat (and only once per call).
        if (a.age >= GESTURE_AT && a.age - f.dt < GESTURE_AT && !this.o.reduceMotion) a.gesture(STATION_GESTURE[a.ref.id]);
        // The witch hovers low over the mat.
        a.pose.hover = a.ref.id === 'bruxinha' ? 0.08 : 0;
      }
      this.tickGesture(a, f.dt);
      a.anim.update(f.dt, a.pose);
    }
    // Those who left are gone once out in the yard.
    this.leaving = this.leaving.filter((a) => {
      if (a.path) return true;
      a.dispose();
      return false;
    });
    if (!here && f.station !== 'intro' && this.visitor && !this.launching) {
      // Away from the station: the visitor goes; the one taken along will be there next time.
      this.visitor.dispose();
      this.visitor = null;
    }
  }

  // ---- the tags under the hooks

  private updateTags(f: PetStageFrame) {
    const want = f.station === 'pets' && f.arrived ? 1 : 0;
    this.tagReveal = Math.max(0, Math.min(1, this.tagReveal + (want ? f.dt / 0.35 : -f.dt / 0.16)));
    const r = smooth(this.tagReveal);
    const v = V();
    const shown: { el: HTMLElement; x: number; y: number }[] = [];
    for (const [id, el] of this.tags) {
      if (r <= 0) {
        el.style.visibility = 'hidden';
        el.style.pointerEvents = 'none';
        continue;
      }
      v.copy(this.hookAt(id)).setY(RACK.y - 0.08).project(f.camera);
      if (v.z > 1) {
        el.style.visibility = 'hidden';
        continue;
      }
      shown.push({ el, x: (v.x * 0.5 + 0.5) * f.vw, y: (0.5 - v.y * 0.5) * f.vh });
    }
    // The hooks are close together (closer still on a phone): left to right, each tag hangs on the highest of three
    // rows where it clears the one before it, or, with no room in any, a little to the right of its hook, its string
    // still straight up to the hook. Never on top of each other.
    shown.sort((a, b) => a.x - b.x);
    const right = [-Infinity, -Infinity, -Infinity];
    for (const { el, x, y } of shown) {
      const w = el.offsetWidth || 60;
      let row = right.findIndex((edge) => x - w / 2 >= edge + TAG_GAP);
      let at = x;
      if (row < 0) {
        row = right.indexOf(Math.min(...right));
        at = right[row] + TAG_GAP + w / 2;
      }
      right[row] = at + w / 2;
      const drop = row * TAG_ROW;
      el.style.visibility = 'visible';
      el.style.opacity = r.toFixed(3);
      el.style.pointerEvents = r > 0.9 ? 'auto' : 'none';
      el.style.setProperty('--drop', `${drop + 6}px`);
      el.style.setProperty('--sx', `${(x - at).toFixed(1)}px`);
      el.style.transform = `translate(${at.toFixed(1)}px,${(y + drop).toFixed(1)}px) translate(-50%,0)`;
    }
  }


  // ---- the launch

  private updateLaunch(a: Actor, f: PetStageFrame) {
    const L = this.launching!;
    const root = a.model.root;
    const t = f.launch ?? 0;
    if (!L.runs) {
      root.visible = false;
      this.rim.intensity = 0;
      return;
    }
    if (!L.from) {
      L.from = root.position.clone();
      a.pose = restPose();
      a.pose.hover = a.ref.id === 'bruxinha' ? 0.35 : 0;
    }
    // The camera flies to the door faster than a pet runs from where it stood: it runs on the floor RUN_AHEAD m ahead
    // of the camera (any nearer is under the frame), a little to its left (the play table is on the right), closing
    // in to cross the threshold at RUN_DOOR s, then on at 4.5 m/s into the light outside (the sky plane 1.6 m out
    // hides it) before the white comes in. The first RUN_HOP s it jumps down from where it was (the table).
    const cam = f.camera.position;
    const c = V(cam.x, 0, cam.z);
    const toDoor = LAUNCH_DOOR.clone().sub(c);
    const far = toDoor.length() || 1;
    const dir = toDoor.divideScalar(far);
    const u = Math.min(1, t / RUN_DOOR);
    const p = V();
    if (u < 1) {
      const ahead = Math.min(far, RUN_AHEAD + (far - Math.min(far, RUN_AHEAD)) * smooth(u));
      p.copy(c).addScaledVector(dir, ahead).add(V(dir.z, 0, -dir.x).multiplyScalar(0.4 * (1 - smooth(u))));
      if (p.z > PLAY_TABLE.z0 && p.z < PLAY_TABLE.z1) p.x = Math.min(p.x, PLAY_TABLE.x);
    } else {
      const out = LAUNCH_OUT.clone().sub(LAUNCH_DOOR);
      const k = Math.min(1, ((t - RUN_DOOR) * 4.5) / out.length());
      p.copy(LAUNCH_DOOR).addScaledVector(out, k);
      root.visible = k < 1;
    }
    if (t < RUN_HOP) {
      const k = smooth(t / RUN_HOP);
      const y = L.from.y * (1 - k) + Math.sin(k * Math.PI) * 0.3;
      p.lerp(L.from, 1 - k).setY(y);
    }
    const prev = L.prev ?? p.clone();
    const moved = V(p.x - prev.x, 0, p.z - prev.z);
    if (moved.lengthSq() > 1e-8) root.rotation.y = yawTo(prev, p);
    L.speed += ((f.dt > 0 ? Math.min(8, moved.length() / f.dt) : 0) - L.speed) * Math.min(1, f.dt * 8);
    L.prev = p.clone();
    root.position.copy(p);
    if (u < 1) root.visible = true;
    a.pose.speed = L.speed;
    a.anim.update(f.dt, a.pose);
    this.rim.intensity = 0;
  }


  /** Back from a launch that didn't happen (the home stays). */
  resetLaunch() {
    this.launching = null;
    this.spotKey = '';
  }

  dispose() {
    this.overview?.dispose();
    this.visitor?.dispose();
    for (const a of this.leaving) a.dispose();
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.root.removeFromParent();
  }
}
