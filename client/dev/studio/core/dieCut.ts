// Sticker studio: the die-cut, like vinyl stickers. From the alpha of a full-size render it finds the sticker's
// shape C: the art (alpha >= 0.15), closed by a disk (so stars, confetti and bubbles near the figure join it
// in one shape) and with its enclosed holes filled. Then, bottom to top: a cream band and an ink line around C,
// an opaque cream backing under the whole of C (translucent art, ghosts, veils, glows and the closed gaps show
// cream, never the page color behind the card), and the art itself. The two outer edges are anti-aliased from
// the distance field. Distances are exact (Felzenszwalb's squared distance transform, one pass per row and
// column). It also measures what the bake warns about: how much of the picture C fills, which canvas edges the
// cut reaches, how far into the album's 6% margin it goes, and how many separate pieces it came out in.
// Pure functions over typed arrays: no DOM, no three.js.

export interface CutSpec {
  /** Render size (pixels). */
  w: number;
  h: number;
  /** Ink line and cream band widths, and the closing radius (pixels at render size). */
  ink: number;
  cream: number;
  close: number;
  /** Baked size (half the render size). */
  outW: number;
  outH: number;
}

// Sizes chosen for what players see (CSS px): the card's art box is ~105-135 px wide, so ink 8 and cream 22
// at 800 x 600 come out ~1.2 and ~3 px there; the badge is 30-48 px, so ink 6 and cream 13 at 256 come out
// ~1 and ~2 px on a 40 px badge.
export const CARD: CutSpec = { w: 800, h: 600, ink: 8, cream: 22, close: 30, outW: 400, outH: 300 };
export const MINI: CutSpec = { w: 256, h: 256, ink: 6, cream: 13, close: 11, outW: 128, outH: 128 };

/** Art below this alpha is not part of the shape (soft glow edges, faint smoke). */
export const ALPHA_MIN = 0.15;
/**
 * The album card's safe margin (fraction of each side): the whole die-cut, band included, stays inside it, clear
 * of the art box's rounded border and the drop shadow (review mode's ?grade=1 draws it).
 */
export const MARGIN = 0.06;
export const CREAM = [0xff, 0xf8, 0xec] as const;
export const INK = [0x1b, 0x15, 0x30] as const;

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface CutResult {
  /** The die-cut sticker, RGBA not premultiplied (ImageData order), at render size. */
  rgba: Uint8ClampedArray<ArrayBuffer>;
  /** C's bounding box in pixels (null: an empty picture). */
  box: Box | null;
  /** The whole die-cut's bounding box, band included (null: an empty picture). */
  outer: Box | null;
  /** How much of the limiting dimension C's box fills (0..1). */
  fill: number;
  /** Canvas edges the die-cut reaches: 'topo', 'base', 'esquerda', 'direita'. */
  edges: string[];
  /**
   * Separate pieces of the finished die-cut, band included (one is a sticker; more are figures or chips that
   * neither the closing nor the band joined).
   */
  pieces: number;
}

/**
 * The sides of a `w` x `h` picture where `box` comes into a margin of `frac` of each side (of the height at the
 * top and bottom, of the width at the left and right, as CSS's inset: 6% draws it).
 */
export function sidesWithin(box: Box, w: number, h: number, frac: number): string[] {
  const mx = frac * w;
  const my = frac * h;
  const sides: string[] = [];
  if (box.y0 < my) sides.push('topo');
  if (box.y1 + 1 > h - my) sides.push('base');
  if (box.x0 < mx) sides.push('esquerda');
  if (box.x1 + 1 > w - mx) sides.push('direita');
  return sides;
}

const FAR = 1e20;

/** One line of the squared distance transform (Felzenszwalb & Huttenlocher): d[q] = min_p (q - p)^2 + f[p]. */
function line(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -FAR;
  z[1] = FAR;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = FAR;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

/** Squared distance (pixels) from every pixel to the nearest pixel where `inside` is 1 (huge where there is none). */
export function squaredDistance(inside: Uint8Array, w: number, h: number): Float64Array {
  const out = new Float64Array(w * h);
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = inside[y * w + x] ? 0 : FAR;
    line(f, h, d, v, z);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) f[x] = out[row + x];
    line(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[row + x] = d[x];
  }
  return out;
}

/** The sticker's shape: the art's mask, closed by a disk of radius r, with every enclosed hole filled. */
export function shapeOf(alpha: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const n = w * h;
  const min = Math.ceil(ALPHA_MIN * 255);
  const art = new Uint8Array(n);
  for (let i = 0; i < n; i++) art[i] = alpha[i] >= min ? 1 : 0;
  // Closing: dilate (within r of the art), then erode (farther than r from the outside of the dilation).
  const r2 = r * r;
  const near = squaredDistance(art, w, h);
  const outside = new Uint8Array(n);
  for (let i = 0; i < n; i++) outside[i] = near[i] <= r2 ? 0 : 1;
  const fromOutside = squaredDistance(outside, w, h);
  const closed = new Uint8Array(n);
  for (let i = 0; i < n; i++) closed[i] = fromOutside[i] > r2 ? 1 : 0;
  // Holes: background not connected to the canvas border joins the shape (a flood fill from the border).
  const shape = new Uint8Array(n).fill(1);
  const stack = new Int32Array(n);
  let top = 0;
  const seed = (i: number) => {
    if (closed[i] || !shape[i]) return;
    shape[i] = 0;
    stack[top++] = i;
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (top > 0) {
    const i = stack[--top];
    const x = i % w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (i >= w) seed(i - w);
    if (i < n - w) seed(i + w);
  }
  return shape;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** How many separate pieces a shape has (8-connected). */
export function countPieces(shape: Uint8Array, w: number, h: number): number {
  const n = w * h;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  let pieces = 0;
  for (let start = 0; start < n; start++) {
    if (!shape[start] || seen[start]) continue;
    pieces++;
    let top = 0;
    seen[start] = 1;
    stack[top++] = start;
    while (top > 0) {
      const i = stack[--top];
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (shape[j] && !seen[j]) {
            seen[j] = 1;
            stack[top++] = j;
          }
        }
    }
  }
  return pieces;
}

/**
 * The die-cut of a render: `art` is RGBA premultiplied by alpha (as WebGL's readPixels gives it), top row
 * first, `spec.w` x `spec.h`.
 */
export function dieCut(art: Uint8Array, spec: CutSpec): CutResult {
  const { w, h, ink, cream } = spec;
  const n = w * h;
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) alpha[i] = art[i * 4 + 3];
  const shape = shapeOf(alpha, w, h, spec.close);
  const dist2 = squaredDistance(shape, w, h);
  const out = new Uint8ClampedArray(n * 4);
  // Edges at pixel-center distances from the shape: the ink line ends at `ink`, the cream band at `ink + cream`;
  // each pixel takes the share of it inside the edge (+0.5: a pixel's half width), which anti-aliases both.
  const inkEdge = ink + 0.5;
  const cutEdge = ink + cream + 0.5;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0; i < n; i++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    let keep = 1;
    if (shape[i]) {
      // The cream backing under the art.
      r = CREAM[0];
      g = CREAM[1];
      b = CREAM[2];
      a = 1;
      const x = i % w;
      const y = (i - x) / w;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    } else {
      const d = Math.sqrt(dist2[i]);
      keep = clamp01(cutEdge - d);
      if (keep > 0) {
        // Cream band, then the ink line over it (premultiplied).
        r = CREAM[0] * keep;
        g = CREAM[1] * keep;
        b = CREAM[2] * keep;
        a = keep;
        const k = clamp01(inkEdge - d);
        if (k > 0) {
          r = INK[0] * k + r * (1 - k);
          g = INK[1] * k + g * (1 - k);
          b = INK[2] * k + b * (1 - k);
          a = k + a * (1 - k);
        }
      }
    }
    // The art over it all, cut at the sticker's outer edge (nothing exists past the die-cut).
    const p = i * 4;
    const aa = (art[p + 3] / 255) * keep;
    if (aa > 0) {
      r = art[p] * keep + r * (1 - aa);
      g = art[p + 1] * keep + g * (1 - aa);
      b = art[p + 2] * keep + b * (1 - aa);
      a = aa + a * (1 - aa);
    }
    if (a > 0) {
      out[p] = r / a;
      out[p + 1] = g / a;
      out[p + 2] = b / a;
      out[p + 3] = a * 255;
    }
  }
  const edges: string[] = [];
  const touches = (i: number) => out[i * 4 + 3] > 0;
  let top = false;
  let bottom = false;
  let left = false;
  let right = false;
  for (let x = 0; x < w; x++) {
    top ||= touches(x);
    bottom ||= touches((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    left ||= touches(y * w);
    right ||= touches(y * w + w - 1);
  }
  if (top) edges.push('topo');
  if (bottom) edges.push('base');
  if (left) edges.push('esquerda');
  if (right) edges.push('direita');
  // The finished cut (C and its full band, without the anti-aliased fringe): its box and its pieces. Counting C
  // instead would warn about parts the band already joins into one closed outline.
  const band2 = (ink + cream) * (ink + cream);
  const cut = new Uint8Array(n);
  let ox0 = w;
  let oy0 = h;
  let ox1 = -1;
  let oy1 = -1;
  for (let i = 0; i < n; i++) {
    if (dist2[i] > band2) continue;
    cut[i] = 1;
    const x = i % w;
    const y = (i - x) / w;
    if (x < ox0) ox0 = x;
    if (x > ox1) ox1 = x;
    if (y < oy0) oy0 = y;
    if (y > oy1) oy1 = y;
  }
  const box = x1 >= 0 ? { x0, y0, x1, y1 } : null;
  const outer = ox1 >= 0 ? { x0: ox0, y0: oy0, x1: ox1, y1: oy1 } : null;
  const fill = box ? Math.max((box.x1 - box.x0 + 1) / w, (box.y1 - box.y0 + 1) / h) : 0;
  return { rgba: out, box, outer, fill, edges, pieces: countPieces(cut, w, h) };
}
