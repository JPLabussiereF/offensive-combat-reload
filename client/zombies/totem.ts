// The chapel's totem (zumbi): a small carved idol on the altar, between the two candles. E there (the match
// decides: shared/zombieMatch.ts useTotem) pays for the Vigília Sem Trégua, no break between waves for the rest of
// the match and more money and XP. Asleep its eyes glow a dim green; lit, they burn red and a flame dances on its
// head. Only a picture: the altar under it is the collider, and the match knows where it stands (ZOMBIE.totem).
import * as THREE from 'three';
import type { Vec3 } from '@shared/protocol';
import { toon } from '../render/materials';

const EYES_ASLEEP = 0x3d8f4a;
const EYES_LIT = 0xff3b2a;

export class Totem {
  readonly position: THREE.Vector3;
  private root = new THREE.Group();
  /** Its own materials (toon()'s are shared caches: never recolored in place). */
  private eyes = new THREE.MeshBasicMaterial({ color: EYES_ASLEEP });
  private flame = new THREE.Group();
  private lit = false;
  private time = 0;

  constructor(scene: THREE.Scene, at: Vec3) {
    this.position = new THREE.Vector3(...at);
    const stone = toon(0x5d5850);
    const wood = toon(0x5a3a26);
    const bone = toon(0xd9cdb0);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      this.root.add(m);
      return m;
    };
    // A stone foot, a carved post, and a skull-like head with horns, facing the nave (+Z).
    add(new THREE.CylinderGeometry(0.13, 0.15, 0.06, 8), stone, 0, 0.03, 0);
    add(new THREE.CylinderGeometry(0.07, 0.09, 0.3, 6), wood, 0, 0.21, 0);
    for (const y of [0.12, 0.22, 0.31]) add(new THREE.TorusGeometry(0.085, 0.012, 4, 8).rotateX(Math.PI / 2), bone, 0, y, 0);
    add(new THREE.BoxGeometry(0.2, 0.2, 0.17), bone, 0, 0.45, 0);
    add(new THREE.BoxGeometry(0.14, 0.06, 0.15), bone, 0, 0.33, 0.01);
    for (const s of [-1, 1]) {
      add(new THREE.ConeGeometry(0.03, 0.16, 5).rotateZ(-s * 0.7), bone, s * 0.13, 0.58, 0);
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.035, 0.01), this.eyes);
      eye.position.set(s * 0.045, 0.47, 0.087);
      this.root.add(eye);
    }
    // The flame on its head, shown once lit.
    const fire = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.9 });
    const core = new THREE.MeshBasicMaterial({ color: 0xffd23f });
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 6), fire);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.13, 6), core);
    outer.position.y = 0.11;
    inner.position.y = 0.07;
    this.flame.add(outer, inner);
    this.flame.position.y = 0.56;
    this.flame.visible = false;
    this.root.add(this.flame);
    this.root.position.copy(this.position);
    scene.add(this.root);
  }

  /** Lit (the vigil is on) or asleep (a new match). */
  set(on: boolean) {
    this.lit = on;
    this.eyes.color.setHex(on ? EYES_LIT : EYES_ASLEEP);
    this.flame.visible = on;
  }

  update(dt: number) {
    if (!this.lit) return;
    this.time += dt;
    const s = 1 + Math.sin(this.time * 17) * 0.12 + Math.sin(this.time * 7.3) * 0.08;
    this.flame.scale.set(1 / s, s, 1 / s);
  }
}
