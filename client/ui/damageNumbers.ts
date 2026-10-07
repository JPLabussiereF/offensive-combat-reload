// Floating damage numbers: what our shots did, shown only to us (nothing goes over the network). A DOM layer
// over the game; each number is anchored where the shot landed, projected every frame, and rises and fades in
// well under a second. Yellow for a plain hit, orange for a critical (head damage), red for "No pássaro!".
import * as THREE from 'three';
import { critRegion, type HitRegion } from '@shared/weapons';

export type DamageTier = 'normal' | 'crit' | 'bird';

/** Seconds on screen. */
export const DAMAGE_NUMBER_LIFE = 0.7;
/** How far a number rises over its life (CSS px). */
const RISE_PX = 44;
/** Most numbers at once (a scattergun spraying a crowd): the oldest goes first. */
const MAX = 24;

/** Red in the bird, orange for head damage (a headshot, or any shot under the critical potion), else yellow. */
export function damageTier(region: HitRegion, crit: boolean): DamageTier {
  return region === 'virilha' ? 'bird' : critRegion(region, crit) === 'cabeca' ? 'crit' : 'normal';
}

const TIER_RANK: Record<DamageTier, number> = { normal: 0, crit: 1, bird: 2 };

/**
 * One shot's numbers: one per target however many pellets hit it, the damage added up (never past `cap`, what
 * the target can still lose), the strongest kind of hit, where the first pellet landed.
 */
export class ShotDamage<T> {
  private byTarget = new Map<T, { at: THREE.Vector3; amount: number; tier: DamageTier }>();

  add(target: T, at: THREE.Vector3, amount: number, tier: DamageTier, cap = Infinity) {
    const d = this.byTarget.get(target);
    if (!d) this.byTarget.set(target, { at: at.clone(), amount: Math.min(amount, cap), tier });
    else {
      d.amount = Math.min(d.amount + amount, cap);
      if (TIER_RANK[tier] > TIER_RANK[d.tier]) d.tier = tier;
    }
  }

  values() {
    return this.byTarget.values();
  }
}

/** A number `k` of the way through its life (0..1): px risen, scale (a pop in), opacity (fades over the last 40%). */
export function numberPose(k: number): { rise: number; scale: number; opacity: number } {
  return {
    rise: RISE_PX * (1 - (1 - k) * (1 - k)),
    scale: k < 0.12 ? 1.45 - (k / 0.12) * 0.45 : 1,
    opacity: k > 0.6 ? (1 - k) / 0.4 : 1,
  };
}

/** The bits of a DOM element a number uses (no DOM types here: the server's typecheck covers client/tests). */
export interface NumberEl {
  className: string;
  textContent: string | null;
  style: { opacity: string; transform: string };
  remove(): void;
}

/** Where the numbers go (`#dmg-numbers`), how a new one is made and how big the screen is (CSS px). */
export interface NumberLayer<E extends NumberEl> {
  root: { appendChild(el: E): unknown };
  create(): E;
  size(): { w: number; h: number };
}

interface Num<E> {
  el: E;
  at: THREE.Vector3;
  age: number;
  /** Sideways drift (px), so numbers landing on the same spot don't cover each other. */
  dx: number;
}

export class DamageNumbers<E extends NumberEl> {
  private live: Num<E>[] = [];
  private free: E[] = [];
  private p = new THREE.Vector3();

  constructor(private layer: NumberLayer<E>) {}

  show(at: THREE.Vector3, amount: number, tier: DamageTier) {
    const n = Math.round(amount);
    if (n <= 0) return;
    if (this.live.length >= MAX) this.drop(0);
    const el = this.free.pop() ?? this.layer.create();
    el.className = `dmg-num ${tier}`;
    el.textContent = String(n);
    el.style.opacity = '0';
    this.layer.root.appendChild(el);
    this.live.push({ el, at: at.clone(), age: 0, dx: (Math.random() - 0.5) * 30 });
  }

  update(dt: number, camera: THREE.Camera) {
    const { w, h } = this.layer.size();
    for (let i = this.live.length - 1; i >= 0; i--) {
      const n = this.live[i];
      n.age += dt;
      if (n.age >= DAMAGE_NUMBER_LIFE) {
        this.drop(i);
        continue;
      }
      const p = this.p.copy(n.at).project(camera);
      // Behind us (or past the far plane): hidden until it's in front again.
      if (p.z > 1) {
        n.el.style.opacity = '0';
        continue;
      }
      const k = n.age / DAMAGE_NUMBER_LIFE;
      const pose = numberPose(k);
      const x = (p.x * 0.5 + 0.5) * w + n.dx * k;
      const y = (-p.y * 0.5 + 0.5) * h - pose.rise;
      n.el.style.opacity = String(pose.opacity);
      n.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${pose.scale.toFixed(3)})`;
    }
  }

  private drop(i: number) {
    const [n] = this.live.splice(i, 1);
    n.el.remove();
    this.free.push(n.el);
  }
}
