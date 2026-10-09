// Text painted on canvas textures (signs, plaques, epitaphs) that always fits its board.

/**
 * Sets `font(px)` as the canvas font, shrinking the size until `text` is no wider than `maxWidth` (for text that is
 * also stroked, or drawn later). Returns the size it ended up with.
 */
export function fitFont(g: CanvasRenderingContext2D, text: string, maxWidth: number, font: (px: number) => string, px: number): number {
  let size = px;
  g.font = font(size);
  while (size > 8 && g.measureText(text).width > maxWidth) {
    size *= 0.93;
    g.font = font(size);
  }
  return size;
}

/**
 * Draws `text` at (x, y) with the current alignment in `font(px)`, shrinking the size until the line is no
 * wider than `maxWidth`. Returns the size it ended up with.
 */
export function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, font: (px: number) => string, px: number): number {
  const size = fitFont(g, text, maxWidth, font, px);
  g.fillText(text, x, y);
  return size;
}

/** A CSS font ('700 64px "Barlow Condensed", sans-serif') as a function of its size, and that size (PF-30). */
export function sizedFont(css: string): { font: (px: number) => string; px: number } {
  const m = /(\d+(?:\.\d+)?)px/.exec(css);
  return { font: (px) => css.replace(/\d+(?:\.\d+)?px/, `${px}px`), px: m ? Number(m[1]) : 16 };
}
