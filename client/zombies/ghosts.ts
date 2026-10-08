// The haunted graves' ghosts (zumbi): white sheets with dark eyes that fly after whoever stood on a tombstone.
// The match decides where they are (shared/zombieMatch.ts tickGhosts, sent in each zsnap); here they're drawn,
// eased toward each new position, bobbing and turned the way they fly. They're only pictures: no hitboxes (they
// can't be shot; a knife swing or a grenade scares them, which the match decides too).
import * as THREE from 'three';

interface Drawn {
  root: THREE.Group;
  to: THREE.Vector3;
  bob: number;
}

export class GhostView {
  private group = new THREE.Group();
  private drawn = new Map<number, Drawn>();
  private body: THREE.BufferGeometry;
  private sheet = new THREE.MeshLambertMaterial({ color: 0xf1f4ff, emissive: 0x4a5878, transparent: true, opacity: 0.82 });
  private dark = new THREE.MeshBasicMaterial({ color: 0x15121f });
  private eye = new THREE.SphereGeometry(0.055, 8, 6);
  private mouth = new THREE.SphereGeometry(0.06, 8, 6).scale(1, 1.4, 0.5);
  private dir = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    // A sheet: round head, a wider skirt that frays at the bottom (lathe profile, bottom to top).
    const pts = [
      [0.34, -0.55],
      [0.28, -0.45],
      [0.33, -0.3],
      [0.3, -0.05],
      [0.26, 0.15],
      [0.25, 0.3],
      [0.2, 0.45],
      [0.1, 0.53],
      [0, 0.55],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    this.body = new THREE.LatheGeometry(pts, 12);
    scene.add(this.group);
  }

  /** The ghosts in the latest snapshot: new ones appear where they are, gone ones vanish. */
  snapshot(list: [id: number, x: number, y: number, z: number][] | undefined) {
    const seen = new Set<number>();
    for (const [id, x, y, z] of list ?? []) {
      seen.add(id);
      const d = this.drawn.get(id);
      if (d) d.to.set(x, y, z);
      else this.add(id, new THREE.Vector3(x, y, z));
    }
    for (const [id, d] of this.drawn) {
      if (seen.has(id)) continue;
      this.group.remove(d.root);
      this.drawn.delete(id);
    }
  }

  private add(id: number, at: THREE.Vector3) {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(this.body, this.sheet));
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(this.eye, this.dark);
      e.position.set(s * 0.09, 0.28, 0.21);
      root.add(e);
    }
    const m = new THREE.Mesh(this.mouth, this.dark);
    m.position.set(0, 0.12, 0.24);
    root.add(m);
    root.position.copy(at);
    this.group.add(root);
    this.drawn.set(id, { root, to: at.clone(), bob: id * 1.7 });
  }

  update(dt: number) {
    const k = 1 - Math.exp(-10 * dt);
    for (const d of this.drawn.values()) {
      this.dir.subVectors(d.to, d.root.position);
      d.root.position.addScaledVector(this.dir, k);
      d.bob += dt * 3;
      d.root.position.y += Math.sin(d.bob) * 0.004;
      // Face the way it flies (its face is on +Z).
      if (this.dir.x * this.dir.x + this.dir.z * this.dir.z > 1e-4) d.root.rotation.y = Math.atan2(this.dir.x, this.dir.z);
      d.root.rotation.z = Math.sin(d.bob * 0.7) * 0.12;
    }
  }

  /** Any ghost within `r` metres of `p` (a knife swing then tells the match, which checks it again). */
  near(p: THREE.Vector3, r: number): boolean {
    for (const d of this.drawn.values()) if (d.root.position.distanceTo(p) <= r) return true;
    return false;
  }

  get count() {
    return this.drawn.size;
  }
}
