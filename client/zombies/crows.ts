// The crows of the dead trees (zumbi): a flock pecking whoever stayed up a tree, circling their head and diving at
// it. The match decides who and hurts them (shared/zombieMatch.ts tickPerches, 'zcrows'); here the birds are only
// drawn, around wherever that player is (us, or a teammate), cawing. One instanced mesh for the bodies and one per
// wing, like the yard's bats (client/world/halloween.ts Bats).
import * as THREE from 'three';
import type { Sfx } from '../audio/sfx';

/** Crows around each pecked player, and how many players can have them at once (the session's cap). */
const PER = 7;
const MAX = PER * 9;

interface Bird {
  a: number;
  r: number;
  h: number;
  sp: number;
  ph: number;
}

interface Flock {
  birds: Bird[];
  /** Seconds to the next caw. */
  caw: number;
}

export class CrowView {
  private flocks = new Map<number, Flock>();
  private body: THREE.InstancedMesh;
  private wings: THREE.InstancedMesh[] = [];
  private o = new THREE.Object3D();
  private w = new THREE.Object3D();
  private t = 0;

  constructor(scene: THREE.Scene, private sfx: Sfx) {
    const black = new THREE.MeshLambertMaterial({ color: 0x15121a, side: THREE.DoubleSide });
    this.body = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 7, 5).scale(0.9, 0.8, 1.9), black, MAX);
    const wingShape = new THREE.Shape([new THREE.Vector2(0, 0.12), new THREE.Vector2(0.42, 0.06), new THREE.Vector2(0.5, -0.04), new THREE.Vector2(0.3, -0.06), new THREE.Vector2(0.16, -0.02), new THREE.Vector2(0, -0.1)]);
    for (const s of [1, -1]) {
      const mesh = new THREE.InstancedMesh(new THREE.ShapeGeometry(wingShape).rotateX(-Math.PI / 2).scale(s, 1, 1), black, MAX);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.wings.push(mesh);
      scene.add(mesh);
    }
    this.body.count = 0;
    this.body.frustumCulled = false;
    scene.add(this.body);
    this.o.add(this.w);
  }

  /** The crows start (or stop) pecking player `id`. */
  set(id: number, on: boolean) {
    if (!on) {
      this.flocks.delete(id);
      return;
    }
    if (this.flocks.has(id)) return;
    const birds = Array.from({ length: PER }, (_, i) => ({
      a: (i / PER) * Math.PI * 2 + Math.random() * 0.6,
      r: 0.7 + Math.random() * 0.5,
      h: 0.2 + Math.random() * 0.7,
      sp: (1.6 + Math.random() * 1.2) * (Math.random() < 0.5 ? 1 : -1),
      ph: Math.random() * 6,
    }));
    this.flocks.set(id, { birds, caw: 0 });
  }

  has(id: number): boolean {
    return this.flocks.has(id);
  }

  clear() {
    this.flocks.clear();
  }

  /**
   * Moves every flock around its player's head (`feetOf`: where that player stands now, or null: not drawn). Around
   * our own head (`me`) they fly wider and higher: right by the camera they would be black blots on the screen (the
   * HUD's feathers show the pecking).
   */
  update(dt: number, feetOf: (id: number) => THREE.Vector3 | null, me: number) {
    this.t += dt;
    let i = 0;
    for (const [id, f] of this.flocks) {
      const feet = feetOf(id);
      if (!feet || i + f.birds.length > MAX) continue;
      const own = id === me;
      for (const b of f.birds) {
        b.a += b.sp * dt;
        // Now and then each one dives at the head, pecks and pulls back out.
        const dive = Math.max(0, Math.sin(this.t * 2.6 + b.ph)) ** 6;
        const r = own ? (b.r + 1.6) * (1 - 0.3 * dive) : b.r * (1 - 0.75 * dive);
        const y = (own ? 2.4 + b.h : 1.6 + b.h * (1 - dive)) + Math.sin(this.t * 3 + b.ph) * 0.12;
        this.o.position.set(feet.x + Math.cos(b.a) * r, feet.y + y, feet.z + Math.sin(b.a) * r);
        this.o.rotation.set(dive * 0.6, -b.a + (b.sp > 0 ? 0 : Math.PI), 0);
        this.o.updateMatrixWorld();
        this.body.setMatrixAt(i, this.o.matrixWorld);
        const flap = Math.sin(this.t * 22 + b.ph) * 0.9;
        this.wings.forEach((mesh, k) => {
          this.w.rotation.set(0, 0, k === 0 ? flap : -flap);
          this.w.updateMatrixWorld();
          mesh.setMatrixAt(i, this.w.matrixWorld);
        });
        i++;
      }
      f.caw -= dt;
      if (f.caw <= 0) {
        f.caw = 0.7 + Math.random() * 1.1;
        this.sfx.at(feet.clone().setY(feet.y + 2), 'normal', (s) => s.ambientCrow());
      }
    }
    this.body.count = i;
    this.body.instanceMatrix.needsUpdate = true;
    for (const mesh of this.wings) {
      mesh.count = i;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
