// The toolbar's handle settings as in Unity (PF-6 Revisions 01, etapa 3), without a screen: Pivot or Center (the
// gizmo on the active piece, or in the middle of the selection's box, which is then the point the selection turns
// and scales about), Local or Global (the gizmo's axes turned with the active piece, or the world's), and the
// snapping: free by default, Ctrl held snaps, the grid button keeps it on; the steps (0.5 m and 15°) can be
// changed. The settings are kept in the browser (localStorage, read back here with anything broken left at its
// default). client/tests/editorTools.test.ts runs it as is.
import * as THREE from 'three';

export interface ToolPrefs {
  /** Center: the gizmo in the middle of the selection's box (false: Pivot, on the active piece). */
  center: boolean;
  /** Global: the gizmo's axes are the world's (false: Local, the active piece's). */
  global: boolean;
  /** The grid button: snapping always on (off: only while Ctrl is held). */
  grid: boolean;
  /** The move step (m) and the turn step (degrees). */
  move: number;
  turn: number;
}

export const PREFS_KEY = 'oc.editor.ferramentas.v1';
/** What the editor did before Revisions 01's etapa 3: the gizmo on the active piece, in the world's axes. */
export const DEFAULT_PREFS: ToolPrefs = { center: false, global: true, grid: false, move: 0.5, turn: 15 };
export const MOVE_RANGE = [0.01, 100] as const;
export const TURN_RANGE = [0.1, 180] as const;
/** The scale snaps in tenths when snapping. */
export const SCALE_STEP = 0.1;

const inRange = (v: unknown, [lo, hi]: readonly [number, number]) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** The settings kept in the browser (null or broken: the defaults; each bad field: its default). */
export function readPrefs(raw: string | null): ToolPrefs {
  let o: Record<string, unknown> = {};
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v === 'object' && !Array.isArray(v)) o = v;
  } catch {
    // Broken: the defaults.
  }
  const bool = (k: keyof ToolPrefs) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : (DEFAULT_PREFS[k] as boolean));
  return {
    center: bool('center'),
    global: bool('global'),
    grid: bool('grid'),
    move: inRange(o.move, MOVE_RANGE) ? (o.move as number) : DEFAULT_PREFS.move,
    turn: inRange(o.turn, TURN_RANGE) ? (o.turn as number) : DEFAULT_PREFS.turn,
  };
}

export const writePrefs = (p: ToolPrefs) => JSON.stringify(p);

/** A step typed in the grid's menu: a number in range (a comma works as the decimal point), or null. */
export function parseStep(text: string, range: readonly [number, number]): number | null {
  const v = Number(text.trim().replace(',', '.'));
  return inRange(v, range) ? v : null;
}

export interface SnapSteps {
  /** Metres (null: free). */
  move: number | null;
  /** Radians (null: free). */
  turn: number | null;
  scale: number | null;
}

/** What the gizmo snaps to now: the grid button on, or Ctrl held, snaps; otherwise it's free (Unity). */
export function snapSteps(p: ToolPrefs, ctrl: boolean): SnapSteps {
  if (!p.grid && !ctrl) return { move: null, turn: null, scale: null };
  return { move: p.move, turn: THREE.MathUtils.degToRad(p.turn), scale: SCALE_STEP };
}

/** A value on the step's grid (no step: as it is). */
export const snapTo = (v: number, step: number | null) => (step ? Math.round(v / step) * step : v);

/**
 * Where the gizmo's handle goes: on the active piece's handle (Pivot) or in the middle of the selection's box
 * (Center, when there is one), turned and scaled as the active piece's handle. Its axes are the handle's when
 * Local and the world's when Global (gizmoSpace): the handle keeps its turn either way, so switching shows it.
 */
export function gizmoFrame(active: THREE.Matrix4, box: THREE.Box3 | null, p: Pick<ToolPrefs, 'center'>): THREE.Matrix4 {
  if (!p.center || !box || box.isEmpty()) return active.clone();
  const t = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  active.decompose(t, q, s);
  return new THREE.Matrix4().compose(box.getCenter(new THREE.Vector3()), q, s);
}

/** The gizmo's axes: a wall's end slides along its own axis whatever is chosen; otherwise Local or Global. */
export const gizmoSpace = (p: Pick<ToolPrefs, 'global'>, axis?: string): 'local' | 'world' => (axis ? 'local' : p.global ? 'world' : 'local');

/** The gizmo's three axes in the world (unit), as they show: the handle's own when Local, the world's when Global. */
export function gizmoAxes(handle: THREE.Matrix4, space: 'local' | 'world'): [THREE.Vector3, THREE.Vector3, THREE.Vector3] {
  const axes: [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  if (space === 'world') return axes;
  const q = new THREE.Quaternion();
  handle.decompose(new THREE.Vector3(), q, new THREE.Vector3());
  for (const a of axes) a.applyQuaternion(q);
  return axes;
}

/** The editor's tools, Unity's Q W E R T: the hand (pans), move, rotate, scale and the rect. */
export type Tool = 'hand' | 'translate' | 'rotate' | 'scale' | 'rect';
