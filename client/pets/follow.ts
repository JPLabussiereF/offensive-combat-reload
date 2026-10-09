// Where a pet walks (PF-29), as pure rules (client/tests/pets.test.ts checks them). Nothing of a pet travels over the
// network: every game draws each pet from its owner's position, which already does.
// - Zumbi (its ability, PvE): it follows its owner's path about 1.2 m behind and 0.8 m to one side, staying out of
//   the 60° cone in front of them closer than 3 m (where the owner aims). Going to act (and coming back), it never
//   cuts across that cone: out to the side first, then on (routeAround).
// - PvP (a look only): a short leash, at most 0.7 m from the edge of its owner's body, always on the same side and
//   behind (no dashes from side to side), so it never gives a position away more than its owner does.
export type V2 = { x: number; z: number };

/** The owner's body radius (m): the PvP leash counts from its edge. */
export const BODY_RADIUS = 0.35;
/** PvP: the farthest from the edge of the owner's body. */
export const PVP_LEASH = 0.7;
/** PvE: how far behind on the owner's path, and to the side. */
export const PVE_BEHIND = 1.2;
export const PVE_SIDE = 0.8;
/** PvE: the cone in front of the owner kept clear (half angle, rad) closer than this (m). */
export const FRONT_CONE = Math.PI / 6;
export const FRONT_RANGE = 3;
/** Going around that cone: the waypoint out to the side, this far ahead of the owner and to the side (m). */
const AROUND_AHEAD = 2.6;
const AROUND_SIDE = 1.75;
/** Inside the cone, it steps out sideways to this far beyond the cone's edge (m). */
const STEP_OUT = 0.5;
/** Farther than this from its target (a respawn, a teleport) it appears there instead of running. */
const SNAP = 8;

export interface FollowState {
  x: number;
  y: number;
  z: number;
  /** Facing (the game's yaw: 0 looks down -Z). */
  yaw: number;
  speed: number;
  /** The owner's path: breadcrumbs every 0.25 m, newest last. */
  trail: { x: number; y: number; z: number }[];
}

export interface Owner {
  x: number;
  y: number;
  z: number;
  /** Where they look (the game's yaw). */
  yaw: number;
}

export const newFollow = (o: Owner, side: 1 | -1): FollowState => {
  const f = { x: o.x, y: o.y, z: o.z, yaw: o.yaw, speed: 0, trail: [{ x: o.x, y: o.y, z: o.z }] };
  const t = behindSpot(o, 'pvp', side);
  return { ...f, x: t.x, z: t.z };
};

/** The owner's forward and right (the game's yaw: forward -Z at 0). */
const axes = (yaw: number) => ({ fx: -Math.sin(yaw), fz: -Math.cos(yaw), rx: Math.cos(yaw), rz: -Math.sin(yaw) });

/** The spot just behind and beside the owner (PvP: on the leash; PvE: the fallback without a path yet). */
export function behindSpot(o: Owner, mode: 'pvp' | 'pve', side: 1 | -1): V2 {
  const a = axes(o.yaw);
  const back = mode === 'pvp' ? 0.5 : PVE_BEHIND;
  const lat = mode === 'pvp' ? 0.42 : PVE_SIDE;
  return { x: o.x - a.fx * back + a.rx * lat * side, z: o.z - a.fz * back + a.rz * lat * side };
}

/** Whether a point is in the cone in front of the owner, closer than FRONT_RANGE. */
export function inFrontCone(o: Owner, p: V2): boolean {
  const dx = p.x - o.x;
  const dz = p.z - o.z;
  const d = Math.hypot(dx, dz);
  if (d > FRONT_RANGE || d < 1e-3) return false;
  const a = axes(o.yaw);
  return (dx * a.fx + dz * a.fz) / d > Math.cos(FRONT_CONE);
}

/** Where the pet should be now. */
export function followTarget(f: FollowState, o: Owner, mode: 'pvp' | 'pve', side: 1 | -1): V2 {
  if (mode === 'pvp') return behindSpot(o, 'pvp', side);
  // PvE: back along the owner's path, PVE_BEHIND m, then out to the side of the path's direction.
  let left = PVE_BEHIND;
  let px = o.x;
  let pz = o.z;
  let dirx = 0;
  let dirz = 0;
  for (let i = f.trail.length - 1; i >= 0 && left > 0; i--) {
    const c = f.trail[i];
    const dx = c.x - px;
    const dz = c.z - pz;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) continue;
    const step = Math.min(d, left);
    px += (dx / d) * step;
    pz += (dz / d) * step;
    dirx = -dx / d;
    dirz = -dz / d;
    left -= step;
  }
  if (left > PVE_BEHIND - 0.3) {
    // Not enough path yet (standing still): just behind and beside.
    const t = behindSpot(o, 'pve', side);
    return clearCone(o, t, side);
  }
  // To the side of the path, keeping the side it's on.
  // (the path's right: (-dir.z, dir.x), the same side as behindSpot's)
  const t = { x: px - dirz * PVE_SIDE * side, z: pz + dirx * PVE_SIDE * side };
  return clearCone(o, t, side);
}

/** A target in the cone in front of the owner moves out of it (behind and beside them instead). */
function clearCone(o: Owner, t: V2, side: 1 | -1): V2 {
  return inFrontCone(o, t) ? behindSpot(o, 'pve', side) : t;
}

/** Whether the straight way from `p` to `t` cuts across the cone in front of the owner. */
function crossesCone(o: Owner, p: V2, t: V2): boolean {
  for (let i = 1; i < 12; i++) {
    const k = i / 12;
    if (inFrontCone(o, { x: p.x + (t.x - p.x) * k, z: p.z + (t.z - p.z) * k })) return true;
  }
  return false;
}

/**
 * Where to head for now on the way to `t` (PvE), never across the cone in front of the owner (where they aim):
 * inside it (it acted there), straight out to the side first; a way that would cut across it goes by a waypoint
 * out to the side and ahead, beyond the cone, then on. A target in the cone itself (a zombie right in front) is
 * gone to straight (the pet is faded there: client/pets/manager.ts).
 */
export function routeAround(o: Owner, p: V2, t: V2, side: 1 | -1): V2 {
  if (inFrontCone(o, t)) return t;
  const a = axes(o.yaw);
  const dx = p.x - o.x;
  const dz = p.z - o.z;
  const lat = dx * a.rx + dz * a.rz;
  const fwd = dx * a.fx + dz * a.fz;
  // Which side to go round: the one the target is on, else the one the pet is on, else its own.
  const tl = (t.x - o.x) * a.rx + (t.z - o.z) * a.rz;
  const s = Math.abs(tl) > 0.3 ? Math.sign(tl) : Math.abs(lat) > 0.05 ? Math.sign(lat) : side;
  if (inFrontCone(o, p)) {
    // Out sideways, to beyond the cone's edge at its distance ahead.
    const out = fwd * Math.tan(FRONT_CONE) + STEP_OUT;
    return { x: o.x + a.fx * fwd + a.rx * out * s, z: o.z + a.fz * fwd + a.rz * out * s };
  }
  if (!crossesCone(o, p, t)) return t;
  const w = { x: o.x + a.fx * AROUND_AHEAD + a.rx * AROUND_SIDE * s, z: o.z + a.fz * AROUND_AHEAD + a.rz * AROUND_SIDE * s };
  // At the waypoint (or past it): on to the target.
  return Math.hypot(w.x - p.x, w.z - p.z) < 0.3 ? t : w;
}

/** Whether a point is in the middle of the owner's view (±15°) closer than FRONT_RANGE: the pet is faded there. */
export function inSightLine(o: Owner, p: V2): boolean {
  const dx = p.x - o.x;
  const dz = p.z - o.z;
  const d = Math.hypot(dx, dz);
  if (d > FRONT_RANGE || d < 1e-3) return false;
  const a = axes(o.yaw);
  return (dx * a.fx + dz * a.fz) / d > Math.cos(Math.PI / 12);
}

/** The PvP leash: a point farther than PVP_LEASH from the owner's body edge is pulled back onto it. */
export function leash(o: Owner, p: V2): V2 {
  const dx = p.x - o.x;
  const dz = p.z - o.z;
  const d = Math.hypot(dx, dz);
  const max = BODY_RADIUS + PVP_LEASH;
  if (d <= max) return p;
  return { x: o.x + (dx / d) * max, z: o.z + (dz / d) * max };
}

/**
 * One step: the owner's path grows, the pet walks (or trots) toward its target, faces where it goes (or the way its
 * owner looks when still). `acting`: going somewhere for its ability (`to`), free of the cone and the path.
 */
export function stepFollow(f: FollowState, o: Owner, dt: number, mode: 'pvp' | 'pve', side: 1 | -1, to?: V2 | null) {
  const last = f.trail[f.trail.length - 1];
  if (!last || Math.hypot(o.x - last.x, o.z - last.z) > 0.25) {
    f.trail.push({ x: o.x, y: o.y, z: o.z });
    if (f.trail.length > 24) f.trail.shift();
  }
  const goal = to ?? followTarget(f, o, mode, side);
  // PvE: around the cone in front of the owner, not across it (acting and coming back).
  const t = mode === 'pve' ? routeAround(o, f, goal, side) : goal;
  const dx = t.x - f.x;
  const dz = t.z - f.z;
  const d = Math.hypot(dx, dz);
  if (d > SNAP) {
    f.x = t.x;
    f.z = t.z;
    f.speed = 0;
  } else {
    // Faster the farther it lags; it settles without overshooting.
    const want = d < 0.08 ? 0 : Math.min(mode === 'pvp' ? 6.5 : 8, d * 6 + 0.6);
    f.speed += (want - f.speed) * Math.min(1, dt * 8);
    const step = Math.min(d, f.speed * dt);
    if (d > 1e-4) {
      f.x += (dx / d) * step;
      f.z += (dz / d) * step;
    }
  }
  if (mode === 'pvp') {
    const p = leash(o, f);
    f.x = p.x;
    f.z = p.z;
  }
  // Height: the owner's (on a slope or a stair the path's would lag a step).
  f.y += (o.y - f.y) * Math.min(1, dt * 10);
  const moving = f.speed > 0.25 && d > 0.1;
  const face = moving ? Math.atan2(-dx, -dz) : to ? Math.atan2(-(t.x - f.x), -(t.z - f.z)) : o.yaw;
  let dy = face - f.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  f.yaw += dy * Math.min(1, dt * (moving ? 10 : 4));
}
