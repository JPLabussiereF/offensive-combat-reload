// "Rua dos Vizinhos" pieces: the enterable two-story house, street trees and bushes, the street lamps (their
// glowing heads merged into one mesh), the pun signs and a plain canopy.
import * as THREE from 'three';
import { fitText } from '../canvasText';
import { PALETTE, toon, toonGradient } from '../../render/materials';
import { MapBuilder, stairRun, type Opening } from '../mapBuilder';
import { surfaceMaterial } from '../surfaces';
import { at, P, scaleOf, yawOf, type Adapter } from './types';

export const street: Record<string, Adapter> = {
  casaRua(c, p) {
    const q = P<{ corParede: number; corTelhado: number }>(p);
    const [x, , z] = at(p);
    buildHouse(c.b, x, z, q.corParede, q.corTelhado);
  },

  /** Street tree: a tapering trunk (collides, muffles sound a little) and a canopy of blobs (visual only). */
  arvoreRua(c, p) {
    const [x, , z] = at(p);
    const scale = scaleOf(p);
    c.b.cylinder(x, 0, z, 0.2 * scale, 2.6 * scale, 'madeira', { tint: PALETTE.trunk, radiusTop: 0.14 * scale, segments: 8, occluder: 'trunk' });
    const pintura = surfaceMaterial('pintura');
    const greens = [0x4fa83a, 0x5dbb45, 0x44962f];
    const blobs: [number, number, number, number][] = [[0, 3.3, 0, 1.5], [0.8, 2.9, 0.4, 1.0], [-0.7, 3.0, -0.4, 1.1], [0.1, 4.1, 0.1, 1.0]];
    blobs.forEach(([ox, oy, oz, r], i) => {
      const g = new THREE.IcosahedronGeometry(r * scale, 0).translate(x + ox * scale, oy * scale, z + oz * scale);
      c.b.addGeometry(g, pintura, greens[i % greens.length]); // foliage: visual only (bullets pass)
    });
  },

  arbusto(c, p) {
    const [x, , z] = at(p);
    const w = P<{ largura: number }>(p).largura;
    const pintura = surfaceMaterial('pintura');
    for (let i = 0; i < 3; i++) {
      const g = new THREE.IcosahedronGeometry(0.45 + (i % 2) * 0.1, 0).scale(1.2, 0.8, 1).translate(x + (i - 1) * w * 0.33, 0.4, z + (i % 2) * 0.1);
      c.b.addGeometry(g, pintura, i % 2 ? 0x3f8a2e : 0x4e9e38);
    }
  },

  /** Lamp post on the sidewalk, its arm reaching over the street (`lado` +1: toward +Z). */
  posteRua(c, p) {
    const [x, , z] = at(p);
    const facing = P<{ lado: 1 | -1 }>(p).lado;
    c.b.cylinder(x, 0.15, z, 0.07, 4.2, 'metal', { tint: 0x3a3f47, segments: 8 });
    c.b.span(x - 0.04, 4.25, z, x + 0.04, 4.33, z + facing * 0.9, 'metal', { tint: 0x3a3f47, collide: false });
    c.s.c.streetLamps.push(new THREE.BoxGeometry(0.36, 0.14, 0.24).translate(x, 4.2, z + facing * 0.9));
  },

  /** Pun sign on two posts (a single post through the middle covered the text on both faces). */
  placaRua(c, p) {
    const q = P<{ linhas: string[]; fundo: string; texto: string; altura?: number }>(p);
    const [x, , z] = at(p);
    const yaw = yawOf(p);
    const height = q.altura ?? 1.3;
    for (const side of [-1, 1]) {
      const ox = Math.cos(yaw) * side * 0.6;
      const oz = -Math.sin(yaw) * side * 0.6;
      c.b.cylinder(x + ox, 0, z + oz, 0.045, height + 0.3, 'madeira', { tint: PALETTE.wood, segments: 6 });
    }
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 160;
    const g = cv.getContext('2d')!;
    g.fillStyle = q.fundo;
    g.fillRect(0, 0, 256, 160);
    g.strokeStyle = '#1b1530';
    g.lineWidth = 10;
    g.strokeRect(5, 5, 246, 150);
    g.fillStyle = q.texto;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    q.linhas.forEach((line, i) => fitText(g, line, 128, i === 0 ? 52 : 92 + (i - 1) * 28, 224, (px) => (i === 0 ? `400 ${px}px "Lilita One", system-ui, sans-serif` : `800 ${px}px Nunito, system-ui, sans-serif`), i === 0 ? 44 : 22));
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.05), [
      toon(0xb07a45), toon(0xb07a45), toon(0xb07a45), toon(0xb07a45),
      new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient() }),
      new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient() }),
    ]);
    board.position.set(x, height, z);
    board.rotation.y = yaw;
    board.castShadow = true;
    c.scene.add(board);
  },

  /** A plain low-poly canopy (the tree house's tree). */
  copaSimples(c, p) {
    const q = P<{ raio: number; cor: number }>(p);
    const [x, y, z] = at(p);
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(q.raio, 0), toon(q.cor));
    leaves.position.set(x, y, z);
    leaves.castShadow = true;
    c.scene.add(leaves);
  },
};

/**
 * 12 x 9 m two-story house centered at (cx, cz), front facing the street (+Z), with a gable roof.
 * Openings may stack (the front door sits under an upstairs window); the wall builder keeps every hole
 * clear. Ground-floor windows are tall enough to crouch-jump through (section 10: "casas atravessáveis
 * por janelas").
 */
export function buildHouse(b: MapBuilder, cx: number, cz: number, wallTint: number, roofTint: number) {
  const hw = 6;
  const hd = 4.5;
  const t = 0.3;
  const floorH = 3;
  const wallH = floorH * 2 + 0.2; // up to the roof, so the siding meets the eaves
  const x0 = cx - hw;
  const x1 = cx + hw;
  const z0 = cz - hd;
  const z1 = cz + hd;
  const DOOR_W = 1.6;
  const DOOR_H = 2.3;
  const door = (c: number): Opening => [c - DOOR_W / 2, c + DOOR_W / 2, 0, DOOR_H];
  const win = (c: number, w: number, bottom: number, top: number): Opening => [c - w / 2, c + w / 2, bottom, top];
  const walls = { tint: wallTint, frame: { tint: 0xf7f3ea } };

  // Front: door, ground window, two upstairs windows (the right one right above the door). Back: door and
  // two upstairs windows. Sides: doors so the row can be crossed lengthwise, plus upstairs side windows.
  const frontDoor = cx + 2;
  const backDoor = cx + 3;
  const sideDoor = cz + 1.5;
  b.wall('x', z1, x0, x1, t, wallH, 'reboco', [door(frontDoor), win(cx - 3, 2.2, 0.9, 2.3), win(cx - 3, 2.4, 3.9, 5.2), win(cx + 3, 2.4, 3.9, 5.2)], 0, walls);
  b.wall('x', z0, x0, x1, t, wallH, 'reboco', [door(backDoor), win(cx - 2, 2, 3.9, 5.2), win(cx + 3, 1.6, 3.9, 5.2)], 0, walls);
  b.wall('z', x0, z0 + t / 2, z1 - t / 2, t, wallH, 'reboco', [door(sideDoor), win(cz - 1.5, 2, 3.9, 5.2)], 0, walls);
  b.wall('z', x1, z0 + t / 2, z1 - t / 2, t, wallH, 'reboco', [door(sideDoor), win(cz - 1.5, 2, 3.9, 5.2)], 0, walls);

  // Door leaves swung open into the house (visual only, never block the doorway).
  const leaf = { tint: 0x8a5a3a, collide: false };
  b.span(frontDoor - DOOR_W / 2, 0, z1 - t / 2 - DOOR_W, frontDoor - DOOR_W / 2 + 0.05, DOOR_H - 0.05, z1 - t / 2, 'madeira', leaf);
  b.span(backDoor + DOOR_W / 2 - 0.05, 0, z0 + t / 2, backDoor + DOOR_W / 2, DOOR_H - 0.05, z0 + t / 2 + DOOR_W, 'madeira', leaf);
  b.span(x0 + t / 2, 0, sideDoor - DOOR_W / 2, x0 + t / 2 + DOOR_W, DOOR_H - 0.05, sideDoor - DOOR_W / 2 + 0.05, 'madeira', leaf);
  b.span(x1 - t / 2 - DOOR_W, 0, sideDoor + DOOR_W / 2 - 0.05, x1 - t / 2, DOOR_H - 0.05, sideDoor + DOOR_W / 2, 'madeira', leaf);

  // Porch step and a small awning over the front door.
  b.span(frontDoor - 1, 0, z1 + t / 2, frontDoor + 1, 0.15, z1 + t / 2 + 0.8, 'concreto', { tint: 0xd6d1c4 });
  b.span(frontDoor - 1.1, DOOR_H + 0.25, z1 + t / 2, frontDoor + 1.1, DOOR_H + 0.35, z1 + t / 2 + 0.9, 'telhado', { tint: roofTint, collide: false });

  // Interior floor, second floor slab with a stair hole along the back wall, ceiling inside the walls.
  const ix0 = x0 + t / 2;
  const ix1 = x1 - t / 2;
  const iz0 = z0 + t / 2;
  const iz1 = z1 - t / 2;
  b.span(ix0, 0, iz0, ix1, 0.02, iz1, 'piso', { tint: 0xc9a27a, collide: false, castShadow: false });
  const hx0 = ix0 + 0.8;
  const hx1 = hx0 + stairRun(floorH);
  const hz1 = iz0 + 1.3;
  const slabY0 = floorH - 0.25;
  const floor = { tint: 0xc9a27a };
  b.span(ix0, slabY0, hz1, ix1, floorH, iz1, 'piso', floor);
  b.span(ix0, slabY0, iz0, hx0, floorH, hz1, 'piso', floor);
  b.span(hx1, slabY0, iz0, ix1, floorH, hz1, 'piso', floor);
  b.stairs('x', 1, hx0, iz0, hz1, 0, floorH, 'madeira', { tint: PALETTE.wood });
  // Railing between the stair hole and the upstairs room.
  b.span(hx0, floorH, hz1, hx1 - 1.2, floorH + 1.0, hz1 + 0.08, 'madeira', { tint: PALETTE.wood });
  b.span(ix0, floorH * 2, iz0, ix1, wallH, iz1, 'concreto', { tint: 0xe8e4da });
  // Both floors are one closed room for the sound.
  b.room({ x: ix0, y: 0, z: iz0 }, { x: ix1, y: floorH * 2, z: iz1 }, 1);

  // Gable roof with the ridge along the street, and a brick chimney.
  b.gableRoof(x0, z0, x1, z1, wallH, 2.2, 'telhado', { tint: roofTint, ridgeAxis: 'x', gableSurface: 'reboco', gableTint: wallTint });
  b.span(cx + 3, wallH, cz + 0.6, cx + 3.8, wallH + 3.0, cz + 1.4, 'tijolo', { tint: PALETTE.brick, collide: false });
}
