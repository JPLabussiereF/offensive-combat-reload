// Undo and redo in the map editor: every edit is a patch (client/editor/document.ts) kept on a stack; undoing
// applies it backwards, redoing forwards again, and a new edit drops what could still be redone.
import type { Patch } from './document';

/** How many edits are kept to undo. */
export const HISTORY_LIMIT = 200;

export class History {
  private done: Patch[] = [];
  private undone: Patch[] = [];

  constructor(private readonly limit = HISTORY_LIMIT) {}

  push(p: Patch) {
    this.done.push(p);
    if (this.done.length > this.limit) this.done.shift();
    this.undone.length = 0;
  }

  /** The edit to apply backwards (null: nothing to undo). */
  undo(): Patch | null {
    const p = this.done.pop();
    if (!p) return null;
    this.undone.push(p);
    return p;
  }

  /** The edit to apply forwards again (null: nothing to redo). */
  redo(): Patch | null {
    const p = this.undone.pop();
    if (!p) return null;
    this.done.push(p);
    return p;
  }

  get canUndo() {
    return this.done.length > 0;
  }
  get canRedo() {
    return this.undone.length > 0;
  }
  /** Edits made since the last save point (markSaved). */
  get size() {
    return this.done.length;
  }

  clear() {
    this.done.length = 0;
    this.undone.length = 0;
  }
}

/** Ctrl+Z undoes; Ctrl+Y and Ctrl+Shift+Z redo (Cmd on a Mac). */
export function historyKey(e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): 'undo' | 'redo' | null {
  if (!(e.ctrlKey || e.metaKey)) return null;
  const k = e.key.toLowerCase();
  if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (k === 'y') return 'redo';
  return null;
}
