// The map in the editor's scene: built by the game's loader in its editor mode (every piece in a group of its
// own, client/world/mapLoader.ts), and kept in step with the document by rebuilding only the pieces an edit
// touched. Pieces that draw nothing (a room for the sound, an invisible collider, a light spot, a group) get a
// wire stand-in so they can be seen and picked. What isn't selected is drawn from batches (P46:
// client/editor/batches.ts); the selection is drawn by its own meshes.
import * as THREE from 'three';
import type { MapData, Peca } from '@shared/mapData';
import { MAP_CATALOG } from '@shared/mapCatalog';
import type { Physics } from '../world/physics';
import type { MapFrame, MapSfx } from '../world/gameMap';
import { startBuild, type BuiltMap, type MapBuild } from '../world/mapLoader';
import { worldPoseMatrix } from '../world/pose';
import { EditorBatches } from './batches';
import type { EditorDocument } from './document';

/** Sounds stay off in the editor (no one is there to set off the gags anyway). */
export const silentSfx: MapSfx = new Proxy({}, { get: () => () => {} }) as MapSfx;

const WIRE = new THREE.LineBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.85, depthTest: false });
const WIRE_SOLID = new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.12, depthWrite: false });

/** The editor never moves a player: gags that watch the feet see nobody. */
const NOBODY = new THREE.Vector3(0, -10_000, 0);

export class MapView {
  readonly root = new THREE.Group();
  /** P46: the pieces not selected, in batches. */
  readonly batches: EditorBatches;
  private build!: MapBuild;
  map!: BuiltMap;
  private queue: Promise<void> = Promise.resolve();
  private time = 0;
  /** A piece failed to build (its id and why). */
  onError: (id: string, err: unknown) => void = () => {};
  /** Pieces were rebuilt (the selection box follows). */
  onRebuilt: (ids: Set<string>) => void = () => {};

  constructor(
    scene: THREE.Scene,
    private readonly physics: Physics,
    private readonly renderer: THREE.WebGLRenderer,
    private readonly doc: EditorDocument,
  ) {
    this.root.name = 'mapa';
    scene.add(this.root);
    this.batches = new EditorBatches(this.root);
  }

  /** Builds every piece, then the sky and the shared systems. */
  async init() {
    this.build = startBuild(this.doc.data, { physics: this.physics, scene: this.root as unknown as THREE.Scene, renderer: this.renderer, sfx: silentSfx, modo: 'editor' });
    for (const p of this.doc.data.pecas) await this.buildPiece(p);
    this.map = this.build.finish();
    // The pieces' groups are reachable once the map is finished: their stand-ins and batches come now.
    for (const p of this.doc.data.pecas) this.settle(p);
  }

  private async buildPiece(p: Peca) {
    try {
      await this.build.piece(p);
    } catch (err) {
      // What it made before failing goes away with it; the piece stays in the data (fix it in the inspector).
      this.build.remove(p.id);
      this.onError(p.id, err);
      return;
    }
    if (this.map) this.settle(p);
  }

  /** A piece built: its wire stand-in, and its meshes into the batches (P46). */
  private settle(p: Peca) {
    const g = this.group(p.id);
    if (!g) return;
    this.decorate(p);
    this.batches.add(p.id, g);
  }

  /** Rebuilds the pieces an edit touched (in order: edits wait for the previous ones). */
  rebuild(ids: Set<string>) {
    this.queue = this.queue.then(async () => {
      for (const id of ids) {
        this.batches.remove(id);
        this.build.remove(id);
        const p = this.doc.piece(id);
        if (p) await this.buildPiece(p);
      }
      this.onRebuilt(ids);
    });
    return this.queue;
  }

  /** Waits for the rebuilds asked so far. */
  idle() {
    return this.queue;
  }

  group(id: string): THREE.Group | undefined {
    return this.map?.pieces?.get(id)?.group;
  }

  /** The piece an object of the scene belongs to (null: not a piece's). */
  pieceOf(o: THREE.Object3D | null): string | null {
    for (let x = o; x; x = x.parent) if (typeof x.userData.peca === 'string') return x.userData.peca;
    return null;
  }

  /** The middle of what a piece built, in its own frame (before its pose): where the gizmo holds it. */
  pivot(peca: Peca): THREE.Vector3 {
    const g = this.group(peca.id);
    const box = g ? new THREE.Box3().setFromObject(g) : new THREE.Box3();
    const c = box.isEmpty() ? new THREE.Vector3(...(peca.p ?? [0, 0, 0])) : box.getCenter(new THREE.Vector3());
    const m = worldPoseMatrix(peca, (id) => this.doc.piece(id));
    return m ? c.applyMatrix4(m.invert()) : c;
  }

  /** Where a piece would build (its box), without keeping it: new pieces placed by their pose. */
  async probe(peca: Peca): Promise<THREE.Box3 | null> {
    await this.queue;
    const probe = { ...peca, id: `__sonda_${peca.id}` };
    try {
      await this.build.piece(probe);
      const g = this.group(probe.id);
      const box = g ? new THREE.Box3().setFromObject(g) : new THREE.Box3();
      return box.isEmpty() ? null : box;
    } catch {
      return null;
    } finally {
      this.build.remove(probe.id);
    }
  }

  /** The pieces' bounds (the sky's dome and the like left out). */
  bounds(): THREE.Box3 {
    const box = new THREE.Box3();
    for (const { group } of this.map?.pieces?.values() ?? []) box.union(new THREE.Box3().setFromObject(group));
    return box;
  }

  /** Takes the whole map out of the scene and the physics world (to build it again). */
  dispose() {
    this.batches.dispose();
    for (const id of [...(this.map?.pieces?.keys() ?? [])]) this.build.remove(id);
    this.root.removeFromParent();
    this.root.traverse((x) => (x as THREE.Mesh).geometry?.dispose());
  }

  /** Per frame: the map's animations (clouds, lanterns, the koi...). */
  update(dt: number, camera: THREE.Vector3) {
    this.time += dt;
    const time = this.time;
    const frame: MapFrame = { feet: NOBODY, listener: camera, launch: () => {}, time };
    this.map?.update(dt, frame);
    this.batches.update();
  }

  /** The pieces drawn by their own meshes (the selection, what's being edited): the rest comes from batches. */
  setOut(ids: Iterable<string>) {
    this.batches.setOut(ids);
  }

  /** A wire stand-in for what a piece doesn't draw (rooms, invisible colliders, light spots, empty pieces). */
  private decorate(p: Peca) {
    const g = this.group(p.id);
    if (!g) return;
    const frame = g.getObjectByName(`pose:${p.id}`) ?? g;
    const add = (o: THREE.Object3D) => {
      o.userData.ajuda = true;
      o.renderOrder = 10;
      frame.add(o);
    };
    const box = (center: THREE.Vector3, size: THREE.Vector3, yaw = 0) => {
      const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
      const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geo), WIRE);
      const fill = new THREE.Mesh(geo, WIRE_SOLID);
      for (const o of [lines, fill]) {
        o.position.copy(center);
        o.rotation.y = yaw;
        add(o);
      }
    };
    const at = new THREE.Vector3(...(p.p ?? [0, 0, 0]));
    if (p.tipo === 'sala') {
      const [x, y, z] = p.params.tamanho as number[];
      box(at, new THREE.Vector3(x, y, z));
      return;
    }
    if (p.tipo === 'colisor') {
      const [x, y, z] = p.params.meia as number[];
      box(at, new THREE.Vector3(x * 2, y * 2, z * 2), p.yaw ?? 0);
      return;
    }
    if (p.tipo === 'grupo') {
      // A group: its origin, as three short axes (red X, green Y, blue Z) and a ring to pick it by.
      const axes = new THREE.AxesHelper(0.8);
      (axes.material as THREE.LineBasicMaterial).depthTest = false;
      add(axes);
      const ring = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), new THREE.MeshBasicMaterial({ color: 0xc8a2ff, wireframe: true, depthTest: false }));
      add(ring);
      return;
    }
    const empty = new THREE.Box3().setFromObject(g).isEmpty();
    if (p.tipo === 'luz' || empty) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(p.tipo === 'luz' ? 0.25 : 0.4), new THREE.MeshBasicMaterial({ color: p.tipo === 'luz' ? 0xffd27a : 0x7fe0ff, wireframe: true, depthTest: false }));
      s.position.copy(at);
      add(s);
    }
  }

  /** The kinds a piece of this map is (for the Project panel's limits). */
  kinds(data: MapData = this.doc.data) {
    const out = new Map<string, number>();
    for (const p of data.pecas) if (MAP_CATALOG[p.tipo]) out.set(p.tipo, (out.get(p.tipo) ?? 0) + 1);
    return out;
  }
}
