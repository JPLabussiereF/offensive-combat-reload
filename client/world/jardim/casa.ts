// Pieces of the Casa Principal used by the catalog (catalog/gardenPieces.ts): the library's bookshelves and the
// Great Hall's ink landscape. The house itself is laid out piece by piece (conversao/jardimSetores.ts) in
// shared/data/mapas/jardim.json.
import { ORIENTAL as C } from '../oriental';
import type { Ctx } from './kit';

/** Bookshelf full of colored spines on both faces, `len` long along `along`, 2.2 m tall. */
export function gardenBookshelf(c: Ctx, x: number, z: number, along: 'x' | 'z', len: number) {
  const { b } = c;
  const d = 0.45;
  const [sx, sz] = along === 'x' ? [len, d] : [d, len];
  b.box(x, 1.1, z, sx, 2.2, sz, 'madeira', { tint: C.woodDark });
  const colors = [0x8a2a22, 0x2f5d8a, 0x4f8a3a, 0xc9a24a, 0x6b4a32, 0xe8dcc0];
  for (let shelf = 0; shelf < 4; shelf++) {
    const y = 0.3 + shelf * 0.5;
    let s = -len / 2 + 0.1;
    while (s < len / 2 - 0.15) {
      const w = 0.1 + c.rand() * 0.2;
      const h = 0.3 + c.rand() * 0.12;
      const tint = colors[Math.floor(c.rand() * colors.length)];
      const cx = along === 'x' ? x + s + w / 2 : x;
      const cz = along === 'x' ? z : z + s + w / 2;
      b.box(cx, y + h / 2, cz, along === 'x' ? w - 0.02 : d + 0.04, h, along === 'x' ? d + 0.04 : w - 0.02, 'pintura', { tint, collide: false, castShadow: false });
      s += w;
    }
  }
}

/** Ink landscape: misty mountains, a pine and a red seal. */
export function inkLandscape(g: CanvasRenderingContext2D, w: number, h: number) {
  g.fillStyle = '#f3ead6';
  g.fillRect(0, 0, w, h);
  const ridge = (base: number, amp: number, color: string, seed: number) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) g.lineTo(x, base - amp * Math.abs(Math.sin(x * 0.012 + seed) + 0.5 * Math.sin(x * 0.031 + seed * 2)));
    g.lineTo(w, h);
    g.fill();
  };
  ridge(h * 0.62, h * 0.35, '#c9c2b0', 1);
  ridge(h * 0.78, h * 0.3, '#8f8a80', 3);
  ridge(h * 0.95, h * 0.18, '#3a3f4b', 5);
  g.fillStyle = '#c0352b';
  g.fillRect(w - 50, 22, 26, 34);
  g.fillStyle = '#1b1530';
  g.font = `700 ${Math.round(h * 0.11)}px "Microsoft YaHei", serif`;
  g.fillText('山水', w - 120, 50);
}
