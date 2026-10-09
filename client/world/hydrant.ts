// Fire hydrant gag (section 10, "piadas ambientais"): shooting it bursts a water column for a few seconds,
// and anyone standing on it gets launched into the air.
import * as THREE from 'three';
import type { SpatialSfx, Vec } from '../audio/spatial';
import type { MapBuilder } from './mapBuilder';
import type { SurfaceInfo } from './physics';
import { surfaceMaterial } from './surfaces';
import { PackedInstances } from '../render/packedInstances';

const GUSH_TIME = 3;
const FADE_TIME = 0.8;
const COLUMN_HEIGHT = 6.5;
const LAUNCH_RADIUS = 0.65;
const LAUNCH_SPEED = 15; // ≈ 5 m up
const LAUNCH_SIDEWAYS = 2.5;
const MAX_DROPS = 360;

export interface HydrantSfx extends SpatialSfx {
  hiss(pos: Vec): { setVolume(v: number): void; stop(): void };
  splash(): void;
}

/** Droplets for every hydrant: one InstancedMesh (one draw call), only the ones in the air drawn. */
export class WaterDrops {
  readonly mesh: THREE.InstancedMesh;
  private pos = new Float32Array(MAX_DROPS * 3);
  private vel = new Float32Array(MAX_DROPS * 3);
  private life = new Float32Array(MAX_DROPS);
  /** Height each droplet vanishes at (the ground, or a fountain's water surface). */
  private floor = new Float32Array(MAX_DROPS);
  private cursor = 0;
  private packed: PackedInstances;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private v = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.85, depthWrite: false }),
      MAX_DROPS,
    );
    this.mesh.frustumCulled = false;
    this.packed = new PackedInstances(this.mesh);
    scene.add(this.mesh);
  }

  spawn(at: THREE.Vector3, up: number, spread: number, floor = 0.1) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * spread;
    this.emit(at, Math.cos(a) * r, up * (0.8 + Math.random() * 0.35), Math.sin(a) * r, floor);
  }

  /** One droplet with an exact starting velocity (fountain spouts). */
  emit(at: THREE.Vector3, vx: number, vy: number, vz: number, floor = 0.1) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_DROPS;
    this.pos.set([at.x, at.y, at.z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = 1.6;
    this.floor[i] = floor;
  }

  update(dt: number) {
    for (let i = 0; i < MAX_DROPS; i++) {
      if (this.life[i] <= 0) continue;
      const k = i * 3;
      this.life[i] -= dt;
      this.vel[k + 1] -= 16 * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      // Droplets vanish on the ground (splash) or when they run out of life.
      if (this.pos[k + 1] < this.floor[i] || this.life[i] <= 0) {
        this.life[i] = 0;
        this.packed.hide(i);
      } else {
        const size = 0.05 + Math.min(0.06, this.life[i] * 0.04);
        this.packed.set(i, this.m.compose(this.v.set(this.pos[k], this.pos[k + 1], this.pos[k + 2]), this.q, this.s.set(size, size * 1.6, size)));
      }
    }
    this.packed.flush();
  }
}

/**
 * The hydrant itself, standing at height `base` on (x, z): flange, red body (shooting it calls `onShot`), dome,
 * cap nut and the two side nozzles. Its top, where the Hydrant's water comes out, is at base + 0.85. The Rua dos
 * Vizinhos builds its hydrants with it, and so does the sticker studio (client/dev/studio/rua.ts).
 */
export function hydrantBody(b: MapBuilder, x: number, base: number, z: number, onShot?: SurfaceInfo['onShot']) {
  const red = 0xe23b3b;
  b.cylinder(x, base, z, 0.2, 0.06, 'metal', { tint: 0xb02a2a, collide: false }); // flange
  b.cylinder(x, base, z, 0.16, 0.66, 'metal', { tint: red, onShot });
  b.addGeometry(new THREE.SphereGeometry(0.16, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, base + 0.66, z), surfaceMaterial('metal'), red);
  b.cylinder(x, base + 0.78, z, 0.05, 0.08, 'metal', { tint: 0xd8dde3, collide: false }); // cap nut
  for (const side of [-1, 1]) {
    const nozzle = new THREE.CylinderGeometry(0.06, 0.06, 0.14, 8).rotateZ(Math.PI / 2).translate(x + side * 0.2, base + 0.45, z);
    b.addGeometry(nozzle, surfaceMaterial('metal'), 0xd8dde3);
  }
}

export class Hydrant {
  private t = -1; // seconds since it burst; <0 = idle
  private column: THREE.Mesh;
  private foam: THREE.Mesh;
  private hiss: ReturnType<HydrantSfx['hiss']> | null = null;
  private launchCooldown = 0;
  private dropAcc = 0;
  private readonly nozzle: THREE.Vector3;

  constructor(
    scene: THREE.Scene,
    /** Top of the hydrant (where the water comes out). */
    readonly top: THREE.Vector3,
    private drops: WaterDrops,
    private sfx: HydrantSfx,
  ) {
    this.nozzle = top.clone();
    const mat = new THREE.MeshBasicMaterial({ color: 0xd6f3ff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
    this.column = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.1, 1, 10, 1, true).translate(0, 0.5, 0), mat);
    this.column.position.copy(top);
    this.column.visible = false;
    this.foam = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: 0.7, depthWrite: false }));
    this.foam.visible = false;
    scene.add(this.column, this.foam);
  }

  get active() {
    return this.t >= 0;
  }

  /** Current column height (0 when idle), ramping up on burst and down at the end. */
  private get strength() {
    if (this.t < 0) return 0;
    if (this.t < 0.25) return this.t / 0.25;
    if (this.t < GUSH_TIME) return 1;
    return Math.max(0, 1 - (this.t - GUSH_TIME) / FADE_TIME);
  }

  /** Shot: burst (or keep gushing if it already is). */
  burst() {
    if (this.t < 0) this.sfx.at(this.top, 'normal', (s) => s.splash());
    this.t = this.t >= 0 && this.t < GUSH_TIME ? Math.min(this.t, 0.25) : 0;
    this.hiss ??= this.sfx.hiss(this.top);
  }

  /** `feet` = local player's feet; `launch` throws them upward if they are standing in the column. */
  update(dt: number, feet: THREE.Vector3, launch: (vx: number, vy: number, vz: number) => void) {
    this.launchCooldown = Math.max(0, this.launchCooldown - dt);
    if (this.t < 0) return;
    this.t += dt;
    const k = this.strength;
    const height = COLUMN_HEIGHT * k;
    const wobble = 1 + Math.sin(this.t * 23) * 0.06;
    this.column.visible = k > 0.02;
    this.column.scale.set(wobble * (0.8 + k * 0.4), Math.max(0.01, height), wobble * (0.8 + k * 0.4));
    this.foam.visible = k > 0.1;
    this.foam.position.set(this.top.x, this.top.y + height, this.top.z);
    this.foam.scale.setScalar(0.6 + k * 0.5 + Math.sin(this.t * 17) * 0.08);

    // Spray: droplets fly up with the column and rain down around it.
    this.dropAcc += dt * 130 * k;
    while (this.dropAcc >= 1) {
      this.dropAcc--;
      this.drops.spawn(this.nozzle, Math.sqrt(2 * 16 * height), 1.1);
    }

    this.hiss?.setVolume(k);

    // Standing on it, right against it, or falling back into the column: launched, with a random sideways
    // kick. (Counted from the hydrant's base: its top is too small to balance on.)
    const dx = feet.x - this.top.x;
    const dz = feet.z - this.top.z;
    const within = Math.hypot(dx, dz) < LAUNCH_RADIUS && feet.y > this.top.y - 1.0 && feet.y < this.top.y + height;
    if (within && k > 0.5 && this.launchCooldown <= 0) {
      this.launchCooldown = 0.8;
      const a = Math.random() * Math.PI * 2;
      launch(Math.cos(a) * LAUNCH_SIDEWAYS, LAUNCH_SPEED, Math.sin(a) * LAUNCH_SIDEWAYS);
      this.sfx.at(this.top, 'normal', (s) => s.splash());
    }

    if (this.t >= GUSH_TIME + FADE_TIME) {
      this.t = -1;
      this.column.visible = false;
      this.foam.visible = false;
      this.hiss?.stop();
      this.hiss = null;
    }
  }
}
