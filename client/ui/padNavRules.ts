// The controller on menus without a screen (PF-33): what counts as a control, and what the D-pad, ✕ and ◯ do on a custom
// slider (role="slider", the color picker's: client/ui/colorPicker.ts). A one-way slider moves with the D-pad along it
// and ✕ confirms (Enter); a two-way one (data-slider-2d, the color square) takes ✕ to enter an adjust mode where the
// D-pad moves its cursor, ✕ again confirms (Enter) and ◯ undoes (Esc). client/ui/padNav.ts uses them;
// client/tests/colorPicker.test.ts runs them (this file stays free of the DOM: the server's typecheck reaches it).

/** What the controller can focus. */
export const FOCUSABLE = 'button, a[href], input, select, textarea, [role="slider"], [tabindex]:not([tabindex="-1"]), .cz-card';

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
