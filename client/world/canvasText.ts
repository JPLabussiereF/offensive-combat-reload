// Text painted on canvas textures (signs, plaques, epitaphs) that always fits its board.

/**
 * Draws `text` at (x, y) with the current alignment in `font(px)`, shrinking the size until the line is no
 * wider than `maxWidth`. Returns the size it ended up with.
 */
export function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, font: (px: number) => string, px: number): number {
  let size = px;
  g.font = font(size);
  while (size > 8 && g.measureText(text).width > maxWidth) {
    size *= 0.93;
    g.font = font(size);
  }
  g.fillText(text, x, y);
  return size;
}
