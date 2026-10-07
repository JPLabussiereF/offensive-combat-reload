// The Arsenal canvas of the home's Arsenal tab as pure geometry (no DOM): one frame per row of the tree, the row's
// weapons side by side and, under the weapon shown in that row, its progression's upgrades as a chain, with the links
// between them; and the camera (pan and zoom) that looks at it. The measures are the design's (Arsenal Canvas.dc.html,
// PF-9). client/ui/arsenalCanvas.ts draws it; client/tests/arsenalCanvasLayout.test.ts checks it.
import type { WeaponId } from '@shared/progression';
import type { RowId, TreeRow, UpgradeNode, WeaponNode } from './arsenalTree';

/** Weapon node size and the gap between two weapons of a row. */
export const WW = 256;
export const WH = 76;
export const WG = 56;
/** Upgrade node size, the gap between two upgrades, and where the chain starts right of the weapon shown. */
export const UW = 220;
export const UH = 74;
export const UG = 34;
export const UX0 = 92;
/** A frame's left edge (the weapons start at 0). */
export const FX = -36;
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 2;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Frame extends Rect {
  id: RowId;
}

export interface WeaponBox {
  row: RowId;
  node: WeaponNode;
  x: number;
  y: number;
}

export interface UpgradeBox {
  row: RowId;
  /** The weapon the chain hangs from (its progression's upgrades). */
  arma: WeaponId;
  node: UpgradeNode;
  x: number;
  y: number;
  /** Locked: not unlocked yet, or the weapon itself is locked. */
  locked: boolean;
  on: boolean;
}

/** A link: between two weapons of a row, or along an upgrade chain (orange when the upgrade is on, dotted when locked). */
export interface Link {
  d: string;
  kind: 'weapon' | 'upgrade';
  on: boolean;
  locked: boolean;
}

export interface CanvasLayout {
  frames: Frame[];
  weapons: WeaponBox[];
  upgrades: UpgradeBox[];
  links: Link[];
  /** Right end of each row's content (weapons or chain). */
  branchEnd: Record<RowId, number>;
  bounds: Rect;
}

/**
 * Lays out the rows top to bottom. `shown` is the weapon whose upgrades hang under each row (the one clicked, else
 * the one in hand); `upgrades` are that weapon's upgrade nodes.
 */
export function canvasLayout(rows: TreeRow[], shown: Partial<Record<RowId, WeaponId>>, upgrades: Partial<Record<RowId, UpgradeNode[]>>): CanvasLayout {
  const frames: Frame[] = [];
  const weapons: WeaponBox[] = [];
  const ups: UpgradeBox[] = [];
  const links: Link[] = [];
  const branchEnd = {} as Record<RowId, number>;
  let y = 0;
  let maxR = 0;
  for (const row of rows) {
    const top = y;
    const wy = top + 56;
    let right = 0;
    let sw: WeaponBox | undefined;
    row.armas.forEach((node, i) => {
      const x = i * (WW + WG);
      const box = { row: row.id, node, x, y: wy };
      weapons.push(box);
      if (i) links.push({ d: `M ${x - WG} ${wy + WH / 2} H ${x}`, kind: 'weapon', on: false, locked: !node.liberada });
      if (node.arma === shown[row.id]) sw = box;
      right = x + WW;
    });
    sw ??= weapons.find((b) => b.row === row.id);
    const by = wy + WH + 50;
    const cy = by + UH / 2;
    const ex = sw!.x + 38;
    (upgrades[row.id] ?? []).forEach((node, j) => {
      const ux = sw!.x + UX0 + j * (UW + UG);
      const locked = node.estado === 'trancada' || !sw!.node.liberada;
      const on = !locked && node.estado === 'ligada';
      links.push({
        d: j === 0 ? `M ${ex} ${wy + WH} V ${cy - 16} Q ${ex} ${cy} ${ex + 16} ${cy} H ${ux}` : `M ${ux - UG} ${cy} H ${ux}`,
        kind: 'upgrade',
        on,
        locked,
      });
      ups.push({ row: row.id, arma: sw!.node.arma, node, x: ux, y: by, locked, on });
      right = Math.max(right, ux + UW);
    });
    branchEnd[row.id] = right;
    const bottom = by + UH + 34;
    frames.push({ id: row.id, x: FX, y: top, w: right - FX + 36, h: bottom - top });
    maxR = Math.max(maxR, right + 36);
    y = bottom + 56;
  }
  return { frames, weapons, upgrades: ups, links, branchEnd, bounds: { x: FX, y: 0, w: maxR - FX, h: y - 56 } };
}

// --- Camera: the world is drawn at translate(x, y) scale(z) inside the viewport. ---

export interface Cam {
  x: number;
  y: number;
  z: number;
}

export const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Zoom to `z` around the viewport point (px, py): the world point under it stays put. */
export function zoomAt(cam: Cam, px: number, py: number, z: number): Cam {
  const nz = clampZoom(z);
  const wx = (px - cam.x) / cam.z;
  const wy = (py - cam.y) / cam.z;
  return { z: nz, x: px - wx * nz, y: py - wy * nz };
}

/** The first view: everything centered if it fits at 72% or more (up to 100%), else the top left at 72%. */
export function homeView(b: Rect, vw: number, vh: number): Cam {
  const fz = Math.min((vw - 80) / b.w, (vh - 130) / b.h);
  if (fz >= 0.72) {
    const z = Math.min(fz, 1);
    return { z, x: (vw - b.w * z) / 2 - b.x * z, y: (vh - b.h * z) / 2 - b.y * z + 24 };
  }
  return { z: 0.72, x: 40 - b.x * 0.72, y: 76 - b.y * 0.72 };
}

/** "Show all": every frame in the free width `aw` (the viewport minus the open panel). */
export function fitView(b: Rect, aw: number, vh: number): Cam {
  const z = clamp(Math.min((aw - 60) / b.w, (vh - 150) / b.h), ZOOM_MIN, 1);
  return { z, x: (aw - b.w * z) / 2 - b.x * z, y: (vh - b.h * z) / 2 - b.y * z + 10 };
}

/** Jump to one row's frame. */
export function rowView(f: Rect, aw: number, vh: number): Cam {
  const z = clamp(Math.min((aw - 80) / f.w, (vh - 150) / f.h), 0.6, 1);
  const x = f.w * z <= aw - 80 ? (aw - f.w * z) / 2 - f.x * z : 40 - f.x * z;
  return { z, x, y: (vh - f.h * z) / 2 - f.y * z + 14 };
}

/** A weapon picked: its row from the weapon to the end of its chain, at the current zoom kept between 72% and 100%. */
export function weaponView(cam: Cam, wx: number, f: Rect, branchEnd: number, aw: number, vh: number): Cam {
  const z = clamp(cam.z, 0.72, 1);
  const sl = wx - 24;
  const sr = branchEnd + 24;
  const x = (sr - sl) * z <= aw - 60 ? (aw - (sr - sl) * z) / 2 - sl * z : 44 - sl * z;
  const y = f.h * z <= vh - 140 ? (vh - f.h * z) / 2 - f.y * z + 14 : 76 - f.y * z;
  return { z, x, y };
}

/** The smallest pan that brings the world rect `r` inside the visible area (`aw` × `vh`, with a margin). */
export function revealView(cam: Cam, r: Rect, aw: number, vh: number, margin = 48): Cam {
  const l = cam.x + r.x * cam.z;
  const t = cam.y + r.y * cam.z;
  const rr = l + r.w * cam.z;
  const b = t + r.h * cam.z;
  let dx = 0;
  let dy = 0;
  if (l < margin) dx = margin - l;
  else if (rr > aw - margin) dx = Math.max(margin - l, aw - margin - rr);
  if (t < margin) dy = margin - t;
  else if (b > vh - margin) dy = Math.max(margin - t, vh - margin - b);
  return { ...cam, x: cam.x + dx, y: cam.y + dy };
}
