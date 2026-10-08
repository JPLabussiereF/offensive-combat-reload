// Pools drawn as one InstancedMesh (droplets, puffs, debris, fruit halves, bullet marks) keep their slots in a
// fixed order, but only the slots in use go to the GPU (PF-35): they're packed at the front of the mesh and
// `mesh.count` is how many there are. A hidden slot used to be drawn at scale zero, every frame, for nothing
// (44 thousand triangles in the Jardim do Dragão at rest). Same idea as the zombies' crows (client/zombies/crows.ts).
import * as THREE from 'three';

/**
 * The slots of an InstancedMesh by their own index (`set`, `hide`, `setColor`, extra per-instance attributes),
 * written to the mesh packed (`flush`, once a frame or after a change): what's shown, in slot order.
 */
export class PackedInstances {
  readonly capacity: number;
  private matrices: Float32Array;
  private shown: Uint8Array;
  private colors: Float32Array | null = null;
  private extras: { attr: THREE.InstancedBufferAttribute; values: Float32Array }[] = [];
  private dirty = true;

  constructor(readonly mesh: THREE.InstancedMesh) {
    this.capacity = mesh.instanceMatrix.count;
    this.matrices = new Float32Array(this.capacity * 16);
    this.shown = new Uint8Array(this.capacity);
    mesh.count = 0;
    // The map editor's batches leave it out (client/editor/batches.ts): its count changes all the time.
    mesh.userData.empacotada = true;
  }

  /** Slot `i` shown with matrix `m`. */
  set(i: number, m: THREE.Matrix4) {
    m.toArray(this.matrices, i * 16);
    this.shown[i] = 1;
    this.dirty = true;
  }

  /** Slot `i` not drawn. */
  hide(i: number) {
    if (!this.shown[i]) return;
    this.shown[i] = 0;
    this.dirty = true;
  }

  isShown(i: number): boolean {
    return this.shown[i] === 1;
  }

  setColor(i: number, c: THREE.Color) {
    this.colors ??= new Float32Array(this.capacity * 3).fill(1);
    c.toArray(this.colors, i * 3);
    this.dirty = true;
  }

  /** An extra per-instance attribute of the mesh's geometry, packed along with the matrices; returns its index for `setExtra`. */
  addExtra(attr: THREE.InstancedBufferAttribute): number {
    this.extras.push({ attr, values: new Float32Array(this.capacity * attr.itemSize) });
    return this.extras.length - 1;
  }

  setExtra(k: number, i: number, value: number) {
    const e = this.extras[k];
    e.values[i * e.attr.itemSize] = value;
    this.dirty = true;
  }

  /** Writes the shown slots to the front of the mesh and sets its count (nothing to do without a change). */
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    const mesh = this.mesh;
    const out = mesh.instanceMatrix.array as Float32Array;
    if (this.colors && !mesh.instanceColor) mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    const colorOut = this.colors ? (mesh.instanceColor!.array as Float32Array) : null;
    let n = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.shown[i]) continue;
      out.set(this.matrices.subarray(i * 16, i * 16 + 16), n * 16);
      if (colorOut) colorOut.set(this.colors!.subarray(i * 3, i * 3 + 3), n * 3);
      for (const e of this.extras) {
        const s = e.attr.itemSize;
        (e.attr.array as Float32Array).set(e.values.subarray(i * s, i * s + s), n * s);
      }
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    for (const e of this.extras) e.attr.needsUpdate = true;
  }
}
