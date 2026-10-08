// Menus with a controller (home, character editor, settings, pause): the D-pad or the left stick moves the focus
// to the nearest visible control in that direction, ✕/A presses it (a checkbox toggles, a select cycles, a
// slider moves with left/right), ◯/B goes back, L1/R1 switch tabs, the right stick scrolls (or pans a canvas: the
// home's Arsenal). Works on whatever is on top: a control counts only if it's visible and not covered by another layer.
// An open dialog (aria-modal) keeps the focus inside it. A screen marked data-pad-explicit (the pause menu) names its
// back button on each level (data-pad-back), so ◯/B never guesses by the text there ("Sair da sessão" is no "back").
// Sub-tabs (data-pad-subtabs, the settings') switch with L1/R1 only where no other tab bar is on screen.
// Custom sliders (role="slider", the color picker's: client/ui/colorPicker.ts) get the keys their keyboard uses: a
// one-way slider moves with the D-pad along it and ✕ confirms (Enter); a two-way one (data-slider-2d, the color square)
// takes ✕ to enter an adjust mode where the D-pad moves its cursor, ✕ again confirms (Enter) and ◯ undoes (Esc).

import type { GamepadInput } from '../core/gamepad';

export const FOCUSABLE = 'button, a[href], input, select, textarea, [role="slider"], [tabindex]:not([tabindex="-1"]), .cz-card';
/** Buttons that go back (◯/B), by attribute or by their text. */
const BACK_TEXT = /^(voltar|cancelar|fechar|sair|back|cancel|close)\b/i;
const REPEAT_DELAY = 0.38;
const REPEAT_EVERY = 0.11;

export type Dir = 'up' | 'down' | 'left' | 'right';

const ARROW: Record<Dir, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

/** A custom slider as the controller sees it. */
export interface PadSlider {
  /** Two-way (the color square): adjusted only in adjust mode. */
  twoD: boolean;
  vertical: boolean;
}

/** The arrow key a D-pad direction sends to a slider, or null when it moves the focus instead. */
export function sliderKey(s: PadSlider, adjusting: boolean, dir: Dir): string | null {
  if (s.twoD) return adjusting ? ARROW[dir] : null;
  const along = s.vertical ? dir === 'up' || dir === 'down' : dir === 'left' || dir === 'right';
  return along ? ARROW[dir] : null;
}

/** ✕ on a slider: a two-way one enters adjust mode (or leaves it, confirming); a one-way one confirms. */
export function sliderPress(s: PadSlider, adjusting: boolean): { key: 'Enter' | null; adjusting: boolean } {
  if (s.twoD && !adjusting) return { key: null, adjusting: true };
  return { key: 'Enter', adjusting: false };
}

/** ◯ while adjusting a slider undoes (Esc) and leaves adjust mode; otherwise it goes back as always (null). */
export const sliderBack = (adjusting: boolean): 'Escape' | null => (adjusting ? 'Escape' : null);

const sliderOf = (el: Element | null): PadSlider | null =>
  el?.getAttribute('role') === 'slider' ? { twoD: el.hasAttribute('data-slider-2d'), vertical: el.getAttribute('aria-orientation') === 'vertical' } : null;

/** A key the slider's own keyboard handler takes. */
const sendKey = (el: HTMLElement, key: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

/** A control the player can reach now: visible, enabled, and the topmost thing at its center. */
function reachable(el: HTMLElement): boolean {
  if ((el as HTMLButtonElement).disabled || el.closest('[hidden], .hidden')) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) {
    // Off screen but inside a scrolling list: still reachable (it scrolls into view).
    return !!el.closest('.cz-content, .menu-card, .home-card, [data-pad-scroll]');
  }
  const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2));
  const y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
  const top = document.elementFromPoint(x, y);
  return !!top && (el === top || el.contains(top) || top.contains(el) || !!top.closest('.menu-card, .home-card, .sticker, .screen'));
}

export class PadNav {
  private focused: HTMLElement | null = null;
  private held: Dir | null = null;
  private heldT = 0;
  /** The two-way slider in adjust mode (the D-pad moves its cursor), if any. */
  private adjusting: HTMLElement | null = null;

  constructor(pad: GamepadInput) {
    pad.onMenu = (p, dt) => this.update(p, dt);
    // The mouse or a touch takes over: drop the focus ring.
    window.addEventListener('pointerdown', () => this.clear(), true);
  }

  private candidates(): HTMLElement[] {
    // A dialog on screen: only its controls (the pause menu's exit confirmation).
    const modal = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')].find((m) => !m.closest('[hidden], .hidden') && m.getClientRects().length > 0);
    return [...(modal ?? document).querySelectorAll<HTMLElement>(FOCUSABLE)].filter(reachable);
  }

  private clear() {
    this.adjust(null);
    this.focused?.classList.remove('pad-focus');
    this.focused = null;
  }

  /** Enters (or leaves, with null) a two-way slider's adjust mode. */
  private adjust(el: HTMLElement | null) {
    this.adjusting?.classList.remove('pad-adjust');
    this.adjusting = el;
    el?.classList.add('pad-adjust');
  }

  private focus(el: HTMLElement) {
    if (el !== this.adjusting) this.adjust(null);
    this.focused?.classList.remove('pad-focus');
    this.focused = el;
    el.classList.add('pad-focus');
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /** The focused control if it's still reachable; otherwise the first big button, or the first control. */
  private current(): HTMLElement | null {
    if (this.focused && document.contains(this.focused) && reachable(this.focused)) return this.focused;
    const list = this.candidates();
    const first = list.find((e) => e.classList.contains('big-btn')) ?? list[0] ?? null;
    if (first) this.focus(first);
    return first;
  }

  private move(dir: Dir) {
    const from = this.current();
    if (!from) return;
    const a = from.getBoundingClientRect();
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const el of this.candidates()) {
      if (el === from || el.contains(from) || from.contains(el)) continue;
      const b = el.getBoundingClientRect();
      const dx = b.left + b.width / 2 - ax;
      const dy = b.top + b.height / 2 - ay;
      const along = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
      const across = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
      if (along <= 4) continue;
      // Straight ahead first: sideways offset costs more than distance.
      const score = along + across * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) this.focus(best);
  }

  /** ✕/A on the focused control. */
  private activate() {
    const el = this.current();
    if (!el) return;
    const slider = sliderOf(el);
    if (slider) {
      const r = sliderPress(slider, this.adjusting === el);
      this.adjust(r.adjusting ? el : null);
      if (r.key) sendKey(el, r.key);
    } else if (el instanceof HTMLSelectElement) {
      el.selectedIndex = (el.selectedIndex + 1) % el.options.length;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el instanceof HTMLInputElement && el.type === 'range') {
      // Sliders move with left/right; ✕ does nothing.
    } else if (el instanceof HTMLInputElement && (el.type === 'text' || el.type === 'search' || el.type === 'email' || el.type === 'password')) {
      el.focus();
    } else el.click();
  }

  /** Left/right on a slider: one step (a twentieth of the range for fine sliders). */
  private nudge(el: HTMLInputElement, sign: number) {
    const min = Number(el.min || 0);
    const max = Number(el.max || 100);
    const step = Math.max(Number(el.step) || 1, (max - min) / 20);
    el.value = String(Math.min(max, Math.max(min, Number(el.value) + sign * step)));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /** ◯/B: the screen's back/close/cancel button, if any. */
  private back() {
    const undo = this.adjusting && document.contains(this.adjusting) ? sliderBack(true) : null;
    if (undo) {
      sendKey(this.adjusting!, undo);
      return this.adjust(null);
    }
    const list = this.candidates();
    const btn =
      list.find((e) => e.hasAttribute('data-pad-back')) ??
      list.find((e) => e.tagName === 'BUTTON' && !e.closest('[data-pad-explicit]') && BACK_TEXT.test((e.textContent ?? '').trim()));
    btn?.click();
  }

  /** L1/R1: the previous/next tab of the tab bar on screen (sub-tabs only when they are the only bar). */
  private tab(sign: number) {
    const all = this.candidates().filter((e) => e.getAttribute('role') === 'tab');
    const outer = all.filter((e) => !e.closest('[data-pad-subtabs]'));
    const tabs = outer.length ? outer : all;
    if (!tabs.length) return;
    const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    const next = tabs[(Math.max(0, i) + sign + tabs.length) % tabs.length];
    next.click();
    this.focus(next);
  }

  private update(p: GamepadInput, dt: number) {
    if (p.device !== 'pad') return;
    // Direction from the D-pad or the stick, with key-repeat.
    const [sx, sy] = p.stick;
    const dir: Dir | null = p.down('up') || sy < -0.5 ? 'up' : p.down('down') || sy > 0.5 ? 'down' : p.down('left') || sx < -0.5 ? 'left' : p.down('right') || sx > 0.5 ? 'right' : null;
    if (dir !== this.held) {
      this.held = dir;
      this.heldT = 0;
      if (dir) this.step(dir);
    } else if (dir) {
      this.heldT += dt;
      if (this.heldT > REPEAT_DELAY) {
        this.heldT -= REPEAT_EVERY;
        this.step(dir);
      }
    }
    if (p.pressed('a')) this.activate();
    if (p.pressed('b')) this.back();
    if (p.pressed('lb')) this.tab(-1);
    if (p.pressed('rb')) this.tab(1);
    // Right stick: scroll the list under the focus, or pan the canvas under it (data-pad-pan: the home's Arsenal).
    const [rx, ry] = p.look;
    if (rx || ry) {
      const box = this.focused?.closest<HTMLElement>('.cz-content, .menu-card, .home-card, [data-pad-scroll], [data-pad-pan]');
      if (box?.hasAttribute('data-pad-pan')) box.dispatchEvent(new CustomEvent('pad-pan', { detail: { dx: -rx * 900 * dt, dy: -ry * 900 * dt } }));
      else if (ry) box?.scrollBy({ top: ry * 900 * dt });
    }
  }

  private step(dir: Dir) {
    const el = this.current();
    const slider = sliderOf(el);
    const key = slider && el ? sliderKey(slider, this.adjusting === el, dir) : null;
    if (key) sendKey(el!, key);
    else if (el instanceof HTMLInputElement && el.type === 'range' && (dir === 'left' || dir === 'right')) this.nudge(el, dir === 'left' ? -1 : 1);
    else this.move(dir);
  }
}
