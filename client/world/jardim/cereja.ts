// The Dragon Cherry: the collectible of the courtyard. A pair of glossy cherries hovering under the cherry
// tree, turning and bobbing over a pink glow. Taken, it pops; grown back, it falls from the tree's canopy,
// bounces and settles. Who takes it (and what it does) is the game's business: see main.ts and CHERRY.
import * as THREE from 'three';
import { mergeColoredParts, toonGradient, type ColoredPart } from '../../render/materials';
import type { MapPickup } from '../blockoutMap';

const HOVER = 0.55;

export class CherryPickup implements MapPickup {
  readonly position: THREE.Vector3;
  private group = new THREE.Group();
  private fruit: THREE.Mesh;
  private glow: THREE.Mesh;
  private state: 'ready' | 'popping' | 'gone' | 'falling' = 'ready';
  private t = 0;
  private y = HOVER;
  private vy = 0;
  /** How far down the fall it got (0 in the canopy, 1 landed): bounces don't drift it back to the tree. */
  private along = 1;

  /**
   * `feet`: where it's taken (the floor under it); `from`: the point in the canopy it falls from when it
   * grows back.
   */
  constructor(
    scene: THREE.Scene,
    readonly id: string,
    feet: THREE.Vector3,
    private from: THREE.Vector3,
  ) {
    this.position = feet.clone();
    const parts: ColoredPart[] = [];
    // Two cherries on stems joined at the top, and a leaf.
    for (const s of [-1, 1]) {
      parts.push({ geo: new THREE.SphereGeometry(0.11, 14, 10), color: 0xc8102e, pos: [s * 0.1, 0, 0], scale: [1, 0.95, 1] });
      parts.push({ geo: new THREE.SphereGeometry(0.035, 8, 6), color: 0xff8a9a, pos: [s * 0.1 - 0.04, 0.05, 0.08] });
      const stem = new THREE.CylinderGeometry(0.01, 0.012, 0.26, 5);
      parts.push({ geo: stem, color: 0x5a7a2a, pos: [s * 0.05, 0.19, 0], rot: [0, 0, s * 0.45] });
    }
    const leaf = new THREE.SphereGeometry(0.07, 8, 5);
    parts.push({ geo: leaf, color: 0x4f9e3a, pos: [0.07, 0.31, 0], scale: [1.6, 0.25, 0.8], rot: [0, 0, -0.4] });
    const geo = mergeColoredParts(parts);
    parts.forEach((p) => p.geo.dispose());
    this.fruit = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true, emissive: 0x401018, gradientMap: toonGradient() }));
    this.fruit.castShadow = true;
    this.fruit.scale.setScalar(1.5);
    this.glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff6fa0, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.glow.position.y = 0.02;
    this.group.add(this.fruit, this.glow);
    this.group.position.copy(feet);
    scene.add(this.group);
  }

  get available() {
    return this.state === 'ready';
  }

  take() {
    if (this.state === 'gone' || this.state === 'popping') return;
    this.state = 'popping';
    this.t = 0;
  }

  restore() {
    if (this.state === 'ready' || this.state === 'falling') return;
    this.state = 'falling';
    this.y = this.from.y - this.position.y;
    this.vy = 0;
    this.along = 0;
    this.fruit.visible = true;
    this.fruit.scale.setScalar(1.5);
  }

  update(dt: number) {
    this.t += dt;
    const f = this.fruit;
    if (this.state === 'popping') {
      // A quick swell, then gone.
      const k = this.t / 0.25;
      f.scale.setScalar(1.5 * (k < 0.4 ? 1 + k : Math.max(0, 1.4 * (1 - (k - 0.4) / 0.6))));
      this.glow.visible = false;
      if (k >= 1) {
        this.state = 'gone';
        f.visible = false;
      }
      return;
    }
    if (this.state === 'gone') return;
    if (this.state === 'falling') {
      // Drops from the canopy, bounces twice on the platform and floats back up to its spot.
      this.vy -= 18 * dt;
      this.y += this.vy * dt;
      this.along = Math.max(this.along, Math.min(1, 1 - this.y / (this.from.y - this.position.y)));
      f.position.x = (this.from.x - this.position.x) * (1 - this.along);
      f.position.z = (this.from.z - this.position.z) * (1 - this.along);
      if (this.y < 0.12) {
        this.y = 0.12;
        this.along = 1;
        this.vy = Math.abs(this.vy) * 0.4;
        if (this.vy < 1) {
          this.state = 'ready';
          this.t = 0;
          f.position.x = f.position.z = 0;
        }
      }
      f.position.y = this.y;
      f.rotation.y += dt * 6;
      return;
    }
    // Ready: rises to its hover height, turns and bobs; the glow pulses.
    this.y += (HOVER - this.y) * Math.min(1, dt * 3);
    f.position.y = this.y + Math.sin(this.t * 2.4) * 0.06;
    f.rotation.y += dt * 1.6;
    this.glow.visible = true;
    (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.28 + 0.14 * Math.sin(this.t * 3);
  }
}
