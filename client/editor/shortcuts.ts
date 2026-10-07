// The editor's keyboard as in Unity (PF-6 Revisions 01, etapa 3), without a screen: Q W E R T pick the hand, move,
// rotate, scale and rect tools; F frames the selection; F2 renames; Delete deletes; Esc clears the selection;
// Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z undo and redo; Ctrl+D duplicates, Ctrl+C and Ctrl+V copy and paste, Ctrl+A
// selects everything, Ctrl+G groups. Nothing fires while a text field has the keyboard (typing a name isn't a
// shortcut), and the letters are the camera's while it flies (right button held: WASD and Q/E move it).
// client/tests/editorShortcuts.test.ts runs it as is.
import { historyKey } from './history';

export type EditorAction =
  | 'undo'
  | 'redo'
  | 'hand'
  | 'translate'
  | 'rotate'
  | 'scale'
  | 'rect'
  | 'focus'
  | 'rename'
  | 'remove'
  | 'clear'
  | 'duplicate'
  | 'copy'
  | 'paste'
  | 'selectAll'
  | 'group';

export interface KeyInput {
  code: string;
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Ctrl (Cmd on a Mac) with a key. */
const WITH_CTRL: Record<string, EditorAction> = { KeyD: 'duplicate', KeyC: 'copy', KeyV: 'paste', KeyA: 'selectAll', KeyG: 'group' };

/** A key alone. */
const PLAIN: Record<string, EditorAction> = {
  KeyQ: 'hand',
  KeyW: 'translate',
  KeyE: 'rotate',
  KeyR: 'scale',
  KeyT: 'rect',
  KeyF: 'focus',
  F2: 'rename',
  Delete: 'remove',
  Backspace: 'remove',
  Escape: 'clear',
};

/**
 * What a key press does in the editor (null: nothing, the key goes on its way). `typing`: a text field has
 * the keyboard; `flying`: the camera flies (the right button is held).
 */
export function shortcutOf(e: KeyInput, s: { typing: boolean; flying: boolean }): EditorAction | null {
  if (s.typing) return null;
  if (e.ctrlKey || e.metaKey) {
    if (e.altKey) return null;
    const h = historyKey(e);
    if (h) return h;
    return e.shiftKey ? null : (WITH_CTRL[e.code] ?? null);
  }
  if (e.altKey || e.shiftKey || s.flying) return null;
  return PLAIN[e.code] ?? null;
}

/** The parts of an element that say whether it takes typing. */
export interface FieldLike {
  tagName: string;
  type?: string;
  isContentEditable?: boolean;
}

/** Inputs that don't take text (a checkbox, a color, a button...): shortcuts work while they have the focus. */
const NOT_TEXT = new Set(['checkbox', 'radio', 'range', 'color', 'button', 'submit', 'reset', 'file', 'image']);

/** Whether an element takes typing (a text or number field, a text area, a list, something editable). */
export function isTextField(el: FieldLike | null | undefined): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName.toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return tag === 'INPUT' && !NOT_TEXT.has((el.type ?? 'text').toLowerCase());
}
