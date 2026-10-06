// The barricades of the zumbi mode as they're seen and heard: the boards nailed across each gap of the cemetery
// wall (shared/barricades.ts has the rules, the match decides everything). A built barricade shows its frame
// (two posts) and its boards; the top board shows its damage (loose, then hanging by a nail), shakes and sheds
// splinters on every blow and falls off (tumbling to the ground) when its health runs out; nailed boards slide
// in with a hammer's knock. While any board stands, the gap has a collider that stops players and grenades (not
// bullets: there's room between the boards to shoot through).
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GROUP, groups } from '@shared/constants';
import type { ZBarricade } from '@shared/protocol';
import type { BarricadeSpot } from '@shared/zombies';
import { ZOMBIE } from '@shared/zombies';
import { toon } from '../render/materials';
import type { Effects } from '../render/effects';
import type { Physics } from '../world/physics';
import type { Sfx } from '../audio/sfx';

const UP = new THREE.Vector3(0, 1, 0);
/** Board heights (m), bottom to top. */
const BOARD_Y = [0.35, 0.72, 1.09, 1.46, 1.83];
const WOODS = [0x8a6a4a, 0x7a5c3e, 0x94744f, 0x6f5236, 0x86664a];

interface Falling {
  mesh: THREE.Mesh;
  v: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
}

class Gap {
  readonly root = new THREE.Group();
  readonly boards: THREE.Mesh[] = [];
  private posts: THREE.Mesh[] = [];
  /** Each board's slant (radians), so the barricade looks hand-made. */
  private slant: number[] = [];
  state: ZBarricade = { built: false, boards: 0, hp: 0 };
  /** 0..1 of a board sliding in (1: in place), per board. */
  slide: number[] = BOARD_Y.map(() => 1);
  shake = 0;
  collider: RAPIER.Collider | null = null;
  readonly center: THREE.Vector3;

  constructor(
    readonly spot: BarricadeSpot,
    scene: THREE.Scene,
    rand: () => number,
  ) {
    const [x, y, z] = spot.centro;
    this.center = new THREE.Vector3(x, y, z);
    this.root.position.copy(this.center);
    // Boards run along the wall, nailed on its outer face (local +Z points out of the yard, whose middle is the origin).
    this.root.rotation.y = spot.eixo === 'x' ? (z < 0 ? Math.PI : 0) : x > 0 ? Math.PI / 2 : -Math.PI / 2;
    const w = spot.largura + 0.5;
    const nail = new THREE.BoxGeometry(0.04, 0.04, 0.03);
    const nailMat = toon(0x2a2a2e);
    BOARD_Y.forEach((by, i) => {
      const board = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, 0.05), toon(WOODS[i % WOODS.length]));
      board.castShadow = true;
      for (const sx of [-1, 1]) {
        const n = new THREE.Mesh(nail, nailMat);
        n.position.set(sx * (w / 2 - 0.16), 0, 0.035);
        board.add(n);
      }
      board.position.set(0, by, 0.05);
      const s = (rand() - 0.5) * 0.18;
      this.slant.push(s);
      board.rotation.z = s;
      board.visible = false;
      this.boards.push(board);
      this.root.add(board);
    });
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.15, 0.12), toon(0x5a4030));
      post.position.set(sx * (spot.largura / 2 - 0.04), 1.08, 0.12);
      post.visible = false;
      this.posts.push(post);
      this.root.add(post);
    }
    scene.add(this.root);
  }

  /** Puts the boards as the state says: missing ones hidden, the top one showing its damage. */
  pose(time: number) {
    const s = this.state;
    for (const p of this.posts) p.visible = s.built;
    const loose = s.boards > 0 ? 1 - s.hp / ZOMBIE.barricadas.vidaTabua : 0;
    this.boards.forEach((b, i) => {
      b.visible = s.built && i < s.boards;
      if (!b.visible) return;
      const top = i === s.boards - 1;
      // Loose: slanting more and sagging at one end; past two thirds, hanging by a nail.
      const sag = top ? (loose > 0.66 ? 0.55 : loose > 0.33 ? 0.22 : 0) : 0;
      const k = this.slide[i];
      const jitter = top && this.shake > 0 ? Math.sin(time * 70) * 0.04 * this.shake : 0;
      b.rotation.z = this.slant[i] + sag + jitter;
      b.position.y = BOARD_Y[i] - sag * 0.25;
      // Sliding in from the outer side.
      b.position.z = 0.05 + (1 - k) * 0.9;
      b.position.x = jitter * 2;
    });
  }
}

/** Every gap's barricade on screen. */
export class BarricadeView {
  private gaps: Gap[];
  private falling: Falling[] = [];
  private time = 0;

  constructor(
    private scene: THREE.Scene,
    private physics: Physics,
    spots: BarricadeSpot[],
    private sfx: Sfx,
    private effects: Effects,
  ) {
    let seed = 9;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    this.gaps = spots.map((s) => new Gap(s, scene, rand));
  }

  /** Where a gap is (its middle on the ground), for prompts and the HUD's arrows. */
  center(i: number): THREE.Vector3 | null {
    return this.gaps[i]?.center ?? null;
  }

  /** A barricade changed (`fx`: why; none when joining). */
  set(i: number, b: ZBarricade, fx?: 'build' | 'nail' | 'hit' | 'break' | 'reset') {
    const g = this.gaps[i];
    if (!g) return;
    const before = g.state;
    g.state = { ...b };
    const at = g.center.clone().setY(g.center.y + 1.2);
    // Boards that came off: they fall.
    if (fx !== 'reset') for (let k = b.boards; k < before.boards; k++) this.drop(g, k);
    if (fx === 'build') {
      // Every board slides in, one after the other.
      g.slide = g.slide.map((_, k) => -k * 0.35);
      this.sfx.at(at, 'normal', (s) => s.barricadeBuild());
    } else if (fx === 'nail') {
      if (b.boards > before.boards) g.slide[b.boards - 1] = 0;
      this.sfx.at(at, 'normal', (s) => s.boardNail());
    } else if (fx === 'hit') {
      g.shake = 1;
      this.splinters(g, b.boards);
      this.sfx.at(at, 'normal', (s) => s.boardHit());
      if (b.boards < before.boards) this.sfx.at(at, 'normal', (s) => s.boardBreak(false));
    } else if (fx === 'break') {
      this.splinters(g, 1);
      this.sfx.at(at, 'loud', (s) => s.boardBreak(true));
    }
    this.syncCollider(g);
  }

  /** Back to no barricades (a new match). */
  clear() {
    this.gaps.forEach((_, i) => this.set(i, { built: false, boards: 0, hp: 0 }, 'reset'));
  }

  private syncCollider(g: Gap) {
    const closed = g.state.boards > 0;
    if (closed && !g.collider) {
      const along = g.spot.largura / 2 + 0.05;
      const half = g.spot.eixo === 'x' ? { x: along, y: 1.2, z: 0.18 } : { x: 0.18, y: 1.2, z: along };
      g.collider = this.physics.world.createCollider(
        RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
          .setTranslation(g.center.x, g.center.y + 1.2, g.center.z)
          .setCollisionGroups(groups(GROUP.BLOCKER, GROUP.PLAYER | GROUP.PROJECTILE)),
        this.physics.staticBody,
      );
      this.physics.surfaces.set(g.collider.handle, { material: 'wood' });
    } else if (!closed && g.collider) {
      this.physics.world.removeCollider(g.collider, true);
      g.collider = null;
    }
  }

  /** Board `k` comes off and tumbles down on the outer side. */
  private drop(g: Gap, k: number) {
    const src = g.boards[k];
    if (!src) return;
    const mesh = src.clone();
    mesh.visible = true;
    src.getWorldPosition(mesh.position);
    src.getWorldQuaternion(mesh.quaternion);
    this.scene.add(mesh);
    const out = new THREE.Vector3(0, 0, 1).applyQuaternion(g.root.quaternion);
    this.falling.push({ mesh, v: out.multiplyScalar(1.2 + Math.random()).setY(1.5), spin: new THREE.Vector3(Math.random() * 4 - 2, Math.random() * 2, Math.random() * 6 - 3), life: 1.6 });
  }

  private splinters(g: Gap, boards: number) {
    const y = BOARD_Y[Math.max(0, Math.min(BOARD_Y.length - 1, boards - 1))];
    this.effects.burst('debris', g.center.clone().setY(g.center.y + y), UP, 10, 0x9a7a52);
  }

  update(dt: number) {
    this.time += dt;
    for (const g of this.gaps) {
      g.shake = Math.max(0, g.shake - dt * 4);
      g.slide = g.slide.map((s) => Math.min(1, s + dt * 4));
      g.pose(this.time);
    }
    this.falling = this.falling.filter((f) => {
      f.life -= dt;
      f.v.y -= 18 * dt;
      f.mesh.position.addScaledVector(f.v, dt);
      if (f.mesh.position.y < 0.05) {
        f.mesh.position.y = 0.05;
        f.v.set(f.v.x * 0.3, 0, f.v.z * 0.3);
        f.spin.multiplyScalar(0.3);
      }
      f.mesh.rotation.x += f.spin.x * dt;
      f.mesh.rotation.y += f.spin.y * dt;
      f.mesh.rotation.z += f.spin.z * dt;
      if (f.life > 0) return true;
      this.scene.remove(f.mesh);
      return false;
    });
  }

  dispose() {
    for (const g of this.gaps) {
      if (g.collider) this.physics.world.removeCollider(g.collider, true);
      this.scene.remove(g.root);
    }
    for (const f of this.falling) this.scene.remove(f.mesh);
  }
}
