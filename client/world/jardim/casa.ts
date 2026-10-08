// Pieces of the Casa Principal used by the catalog (catalog/gardenPieces.ts): the library's bookshelves and the
// Great Hall's ink landscape. The house itself is laid out piece by piece (conversao/jardimSetores.ts) in
// shared/data/mapas/jardim.json.
import * as THREE from 'three';
import { ORIENTAL as C } from '../oriental';
import { surfaceMaterial } from '../surfaces';
import type { Ctx } from './kit';

/** Bookshelf full of colored spines on both faces, `len` long along `along`, 2.2 m tall. */
export function gardenBookshelf(c: Ctx, x: number, z: number, along: 'x' | 'z', len: number) {
  const { b } = c;
  // The light object detail (PF-35 L6): a row's books as one dark block with their spines painted on both faces.
  const light = b.detalhe === 'leve';
  const d = 0.45;
  const [sx, sz] = along === 'x' ? [len, d] : [d, len];
  b.box(x, 1.1, z, sx, 2.2, sz, 'madeira', { tint: C.woodDark });
  const colors = [0x8a2a22, 0x2f5d8a, 0x4f8a3a, 0xc9a24a, 0x6b4a32, 0xe8dcc0];
  for (let shelf = 0; shelf < 4; shelf++) {
    const y = 0.3 + shelf * 0.5;
    let s = -len / 2 + 0.1;
    const row: { s: number; w: number; h: number; tint: number }[] = [];
    while (s < len / 2 - 0.15) {
      const w = 0.1 + c.rand() * 0.2;
      const h = 0.3 + c.rand() * 0.12;
      const tint = colors[Math.floor(c.rand() * colors.length)];
      const cx = along === 'x' ? x + s + w / 2 : x;
      const cz = along === 'x' ? z : z + s + w / 2;
      if (light) row.push({ s, w, h, tint });
      else b.box(cx, y + h / 2, cz, along === 'x' ? w - 0.02 : d + 0.04, h, along === 'x' ? d + 0.04 : w - 0.02, 'pintura', { tint, collide: false, castShadow: false });
      s += w;
    }
    if (!row.length) continue;
    const s0 = row[0].s;
    const s1 = s;
    const top = Math.max(...row.map((k) => k.h));
    const mid = (s0 + s1) / 2;
    b.box(along === 'x' ? x + mid : x, y + top / 2, along === 'x' ? z : z + mid, along === 'x' ? s1 - s0 : d + 0.03, top, along === 'x' ? d + 0.03 : s1 - s0, 'pintura', { tint: 0x241a16, collide: false, castShadow: false });
    const paint = surfaceMaterial('pintura');
    for (const k of row) {
      for (const face of [-1, 1]) {
        const off = face * (d / 2 + 0.02);
        const g = new THREE.PlaneGeometry(k.w - 0.02, k.h);
        if (along === 'x') g.rotateY(face < 0 ? Math.PI : 0).translate(x + k.s + k.w / 2, y + k.h / 2, z + off);
        else g.rotateY(face < 0 ? -Math.PI / 2 : Math.PI / 2).translate(x + off, y + k.h / 2, z + k.s + k.w / 2);
        b.addGeometry(g, paint, k.tint, false);
      }
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
