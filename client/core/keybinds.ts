// Remappable keys: each action has a primary and an alternate slot (either can be empty). Pure functions only
// (no DOM), so the rules are tested on their own (client/tests/keybinds.test.ts); input.ts turns the result into
// its BINDINGS table and the pause menu edits it. Action lives here, not in input.ts, so the tests (type-checked
// by server/tsconfig.json, without the DOM) never load the DOM code.
import { LANGS, type Lang } from '@shared/langs';

export type Action =
  | 'forward' | 'back' | 'left' | 'right'
  | 'jump' | 'crouch' | 'sprint' | 'reload'
  | 'fire' | 'ads' | 'melee' | 'grenade' | 'weapon1' | 'weapon2' | 'swapWeapon'
  | 'taunt' | 'donate' | 'refuse' | 'scoreboard' | 'chat' | 'debug' | 'hitboxes' | 'tuning';

/** Dev keys that stay where they are: not in the controls table, and no other action may take them. */
export type FixedAction = 'debug' | 'hitboxes' | 'tuning';
export type RebindableAction = Exclude<Action, FixedAction>;
/** 0 = primary, 1 = alternate. */
export type Slot = 0 | 1;
export type Binding = [string | null, string | null];
export type Keybinds = Record<RebindableAction, Binding>;

export const FIXED_KEYS: Record<FixedAction, string> = { debug: 'F3', hitboxes: 'F4', tuning: 'F6' };

/** Rebindable actions in the order of the controls table (also the order conflicts are settled in). */
export const REBINDABLE: RebindableAction[] = [
  'forward', 'back', 'left', 'right',
  'jump', 'crouch', 'sprint',
  'fire', 'ads', 'reload', 'melee', 'grenade',
  'weapon1', 'weapon2', 'swapWeapon',
  'taunt', 'donate', 'refuse', 'scoreboard', 'chat',
];

// Crouch is on C, not Ctrl: Ctrl+W closes the browser tab and cannot be intercepted outside fullscreen keyboard lock.
export const DEFAULT_KEYBINDS: Keybinds = {
  forward: ['KeyW', null],
  back: ['KeyS', null],
  left: ['KeyA', null],
  right: ['KeyD', null],
  jump: ['Space', null],
  crouch: ['KeyC', null],
  sprint: ['ShiftLeft', null],
  fire: ['Mouse0', null],
  ads: ['Mouse2', null],
  reload: ['KeyR', null],
  melee: ['KeyF', null],
  grenade: ['KeyG', null],
  // 1 and 2 pick a slot; either way on the wheel switches to the other gun.
  weapon1: ['Digit1', null],
  weapon2: ['Digit2', null],
  swapWeapon: ['WheelDown', 'WheelUp'],
  taunt: ['KeyE', null],
  // Zumbi: the weapon the coffin offers us, left there for the others or turned down.
  donate: ['KeyZ', null],
  refuse: ['KeyX', null],
  scoreboard: ['Tab', null],
  chat: ['Enter', 'KeyT'],
};

export type ForbiddenReason = 'ctrl' | 'fixed';
/** Also 'wheel': the mouse wheel on an action that is held. */
export type BindRefusal = ForbiddenReason | 'wheel';

const FIXED_CODES = new Set(Object.values(FIXED_KEYS));

/** Why a key can't be bound to any action, or null when it can. */
export function forbiddenReason(code: string): ForbiddenReason | null {
  if (code === 'ControlLeft' || code === 'ControlRight') return 'ctrl';
  if (FIXED_CODES.has(code)) return 'fixed';
  return null;
}

/**
 * Actions done with one press, the only ones the mouse wheel can trigger: a wheel step is a press that is never
 * held (sprinting or aiming for a frame does nothing), and the chat opens on a key event, not on Input's table.
 */
export const WHEEL_ACTIONS: ReadonlySet<RebindableAction> = new Set<RebindableAction>(['jump', 'fire', 'reload', 'melee', 'grenade', 'weapon1', 'weapon2', 'swapWeapon', 'taunt', 'donate', 'refuse']);

const isWheel = (code: string) => code === 'WheelUp' || code === 'WheelDown';

/** Why `code` can't be bound to `action`, or null when it can. */
export function bindRefusal(action: RebindableAction, code: string): BindRefusal | null {
  return forbiddenReason(code) ?? (isWheel(code) && !WHEEL_ACTIONS.has(action) ? 'wheel' : null);
}

/** The slot a key was taken from, so the menu can tell the player which action lost it. */
export interface Cleared {
  action: RebindableAction;
  slot: Slot;
}

export type AssignResult =
  | { ok: true; keybinds: Keybinds; cleared: Cleared | null }
  | { ok: false; reason: BindRefusal };

function copy(kb: Keybinds): Keybinds {
  return Object.fromEntries(REBINDABLE.map((a) => [a, [...kb[a]]])) as Keybinds;
}

/**
 * Puts `code` in one slot of `action`, returning new keybinds (`kb` is left as it was). A key already used
 * elsewhere leaves that slot empty; `cleared` names it when it belonged to another action (moving a key
 * between the two slots of the same action needs no warning).
 */
export function assign(kb: Keybinds, action: RebindableAction, slot: Slot, code: string): AssignResult {
  const reason = bindRefusal(action, code);
  if (reason) return { ok: false, reason };
  const next = copy(kb);
  let cleared: Cleared | null = null;
  for (const a of REBINDABLE) {
    for (const s of [0, 1] as const) {
      if (next[a][s] !== code || (a === action && s === slot)) continue;
      next[a][s] = null;
      if (a !== action) cleared = { action: a, slot: s };
    }
  }
  next[action][slot] = code;
  return { ok: true, keybinds: next, cleared };
}

/** Empties one slot (the × next to a key), returning new keybinds. */
export function clearSlot(kb: Keybinds, action: RebindableAction, slot: Slot): Keybinds {
  const next = copy(kb);
  next[action][slot] = null;
  return next;
}

/**
 * Saved keybinds (whatever is in storage) over the defaults, action by action: an action missing from the save
 * (added to the game later) gets its default, a slot the player emptied stays empty, and anything malformed,
 * forbidden or already used is dropped. The player's own choices are settled first, so they win over a default.
 */
export function mergeKeybinds(saved: unknown): Keybinds {
  const src = typeof saved === 'object' && saved !== null && !Array.isArray(saved) ? (saved as Record<string, unknown>) : {};
  const used = new Set<string>();
  const take = (a: RebindableAction, c: unknown): string | null => {
    if (typeof c !== 'string' || bindRefusal(a, c) || used.has(c)) return null;
    used.add(c);
    return c;
  };
  const out = {} as Keybinds;
  const missing: RebindableAction[] = [];
  for (const a of REBINDABLE) {
    const v = src[a];
    if (Array.isArray(v) && v.length === 2) out[a] = [take(a, v[0]), take(a, v[1])];
    else missing.push(a);
  }
  for (const a of missing) out[a] = [take(a, DEFAULT_KEYBINDS[a][0]), take(a, DEFAULT_KEYBINDS[a][1])];
  return out;
}

/** The table Input reads: each action's keys without the empty slots, plus the fixed dev keys. */
export function toBindings(kb: Keybinds): Record<Action, string[]> {
  const b = {} as Record<Action, string[]>;
  for (const a of REBINDABLE) b[a] = kb[a].filter((c): c is string => c !== null);
  for (const [a, c] of Object.entries(FIXED_KEYS) as [FixedAction, string][]) b[a] = [c];
  return b;
}

/** What the browser says is printed on a key (navigator.keyboard.getLayoutMap(), Chrome and Edge). */
export interface LayoutMap {
  get(code: string): string | undefined;
}

// Names by key code: one string for every language, or one per language in the order of LANGS (pt-BR, en, es, de).
const NAMES: Record<string, string | [string, string, string, string]> = {
  Space: ['Espaço', 'Space', 'Espacio', 'Leertaste'],
  ShiftLeft: ['Shift esquerdo', 'Left Shift', 'Shift izquierdo', 'Shift links'],
  ShiftRight: ['Shift direito', 'Right Shift', 'Shift derecho', 'Shift rechts'],
  AltLeft: ['Alt esquerdo', 'Left Alt', 'Alt izquierdo', 'Alt links'],
  AltRight: ['Alt direito', 'Right Alt', 'Alt derecho', 'Alt rechts'],
  ArrowUp: ['Seta para cima', 'Up Arrow', 'Flecha arriba', 'Pfeil hoch'],
  ArrowDown: ['Seta para baixo', 'Down Arrow', 'Flecha abajo', 'Pfeil runter'],
  ArrowLeft: ['Seta para a esquerda', 'Left Arrow', 'Flecha izquierda', 'Pfeil links'],
  ArrowRight: ['Seta para a direita', 'Right Arrow', 'Flecha derecha', 'Pfeil rechts'],
  Mouse0: ['Botão esquerdo', 'Left click', 'Clic izquierdo', 'Linksklick'],
  Mouse1: ['Botão do meio', 'Middle click', 'Clic central', 'Mittelklick'],
  Mouse2: ['Botão direito', 'Right click', 'Clic derecho', 'Rechtsklick'],
  WheelUp: ['Roda para cima', 'Wheel up', 'Rueda arriba', 'Mausrad hoch'],
  WheelDown: ['Roda para baixo', 'Wheel down', 'Rueda abajo', 'Mausrad runter'],
  Tab: 'Tab',
  CapsLock: 'Caps Lock',
  Enter: 'Enter',
  NumpadEnter: ['Enter (numérico)', 'Numpad Enter', 'Enter (teclado numérico)', 'Enter (Ziffernblock)'],
  Backspace: 'Backspace',
  Insert: 'Insert',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
  // US layout punctuation, for browsers without the layout map.
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
};

/**
 * A readable name for a key code. What is printed on the player's keyboard comes first: the browser's layout
 * map, else the character learned when the player pressed that key to bind it (`learned`, for Firefox). Without
 * either, letters and digits are named as on a QWERTY keyboard.
 */
export function keyLabel(code: string, lang: Lang, layout?: LayoutMap, learned?: Record<string, string>): string {
  const printed = layout?.get(code) ?? learned?.[code];
  if (printed && printed.trim()) return printed.toUpperCase();
  const named = NAMES[code];
  if (named) return typeof named === 'string' ? named : named[LANGS.indexOf(lang)];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  if (/^F\d{1,2}$/.test(code)) return code;
  const mouse = /^Mouse(\d+)$/.exec(code);
  if (mouse) return `Mouse ${Number(mouse[1]) + 1}`;
  return code;
}
