// The MapBuilder's primitives as pieces: boxes, cylinders, walls with their openings and trim, stairs, gable
// roofs, the sound's rooms, any three.js shape, glowing shapes, light spots and slabs with holes.
import * as THREE from 'three';
import type { Opening } from '../mapBuilder';
import { surfaceMaterial } from '../surfaces';
import { slabWithHoles } from '../halloween';
import { slab } from '../jardim/kit';
import type { Rect } from '../oriental';
import { at, geometryOf, P, pieceOpts, surface, V, type Adapter } from './types';

type Opts = { cor?: number; colide?: boolean; sombra?: boolean; fisica?: any; oclusor?: any };

export const primitives: Record<string, Adapter> = {
  caixa(c, p) {
    const q = P<Opts & { tamanho: number[]; superficie: string; rot?: number[]; ordem?: THREE.EulerOrder }>(p);
    const [x, y, z] = at(p);
    const o = pieceOpts(q);
    if (q.rot) o.rot = new THREE.Euler(q.rot[0], q.rot[1], q.rot[2], q.ordem ?? 'XYZ');
    else if (p.yaw) o.rot = new THREE.Euler(0, p.yaw, 0);
    c.b.box(x, y, z, q.tamanho[0], q.tamanho[1], q.tamanho[2], surface(q.superficie, 'concreto'), o);
  },

  cilindro(c, p) {
    const q = P<Opts & { raio: number; altura: number; raioTopo?: number; segmentos?: number; superficie: string }>(p);
    const [x, y, z] = at(p);
    c.b.cylinder(x, y, z, q.raio, q.altura, surface(q.superficie, 'concreto'), { ...pieceOpts(q), radiusTop: q.raioTopo, segments: q.segmentos });
  },

  parede(c, p) {
    const q = P<Opts & { eixo: 'x' | 'z'; fixo: number; de: number; ate: number; espessura: number; altura: number; superficie: string; vaos: Opening[]; y0: number; moldura?: { superficie?: string; cor?: number; largura?: number } }>(p);
    const frame = q.moldura ? { surface: q.moldura.superficie as never, tint: q.moldura.cor, width: q.moldura.largura } : undefined;
    c.b.wall(q.eixo, q.fixo, q.de, q.ate, q.espessura, q.altura, surface(q.superficie, 'reboco'), q.vaos, q.y0, { ...pieceOpts(q), frame });
  },

  escada(c, p) {
    const q = P<Opts & { eixo: 'x' | 'z'; sentido: 1 | -1; inicio: number; de: number; ate: number; base: number; subida: number; superficie: string; suave?: boolean }>(p);
    c.b.stairs(q.eixo, q.sentido, q.inicio, q.de, q.ate, q.base, q.subida, surface(q.superficie, 'madeira'), { ...pieceOpts(q), gentle: q.suave });
  },

  telhado(c, p) {
    const q = P<Opts & { x0: number; z0: number; x1: number; z1: number; beiral: number; subida: number; superficie: string; aba?: number; cumeeira?: 'x' | 'z'; oitao?: string; corOitao?: number }>(p);
    c.b.gableRoof(q.x0, q.z0, q.x1, q.z1, q.beiral, q.subida, surface(q.superficie, 'telhado'), { ...pieceOpts(q), overhang: q.aba, ridgeAxis: q.cumeeira, gableSurface: q.oitao as never, gableTint: q.corOitao });
  },

  /** A room for the sound: a box (center and size) and how enclosed it is (1 closed, 0.3-0.6 a porch). */
  sala(c, p) {
    const q = P<{ tamanho: number[]; fechamento: number }>(p);
    const [x, y, z] = at(p);
    const [sx, sy, sz] = q.tamanho;
    c.b.room({ x: x - sx / 2, y: y - sy / 2, z: z - sz / 2 }, { x: x + sx / 2, y: y + sy / 2, z: z + sz / 2 }, q.fechamento);
  },

  forma(c, p) {
    const q = P<{ geo: string; args: number[]; ops: unknown[]; superficie: string; cor?: number; sombra?: boolean }>(p);
    const g = geometryOf(q.geo, q.args, q.ops);
    c.b.addGeometry(g, surfaceMaterial(surface(q.superficie, 'pintura')), q.cor, q.sombra ?? true);
    g.dispose();
  },

  brilho(c, p) {
    const q = P<{ geo: string; args: number[]; ops: unknown[]; cor: number }>(p);
    c.s.c.glow.add(geometryOf(q.geo, q.args, q.ops), q.cor);
  },

  /** A light spot (the pool lights the nearest ones for real); `lampada` also draws a glowing bulb there. */
  luz(c, p) {
    const q = P<{ cor?: number; intensidade?: number; alcance?: number; piscar?: number; lampada?: boolean }>(p);
    const [x, y, z] = at(p);
    c.s.lights.add({ at: V(x, y, z), color: new THREE.Color(q.cor ?? 0xffb46a), intensity: q.intensidade ?? 10, range: q.alcance ?? 10, flicker: q.piscar });
    if (q.lampada) c.s.c.glow.add(new THREE.SphereGeometry(0.1, 8, 6).translate(x, y, z), 0xffe0a8);
  },

  /** An invisible box collider (`meia`: half sizes), turned by `yaw`: a solid part of a prop drawn by other pieces. */
  colisor(c, p) {
    const q = P<{ meia: number[]; fisica: any; oclusor?: any }>(p);
    const q4 = new THREE.Quaternion();
    if (p.yaw) q4.setFromEuler(new THREE.Euler(0, p.yaw, 0));
    c.b.cuboidCollider(V(...at(p)), V(q.meia[0], q.meia[1], q.meia[2]), q4, q.fisica, undefined, q.oclusor);
  },

  lajeComFuros(c, p) {
    const q = P<Opts & { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number; furos: Rect[]; superficie: string }>(p);
    slabWithHoles(c.b, q.x0, q.z0, q.x1, q.z1, q.y0, q.y1, q.furos, surface(q.superficie, 'concreto'), pieceOpts(q));
  },

  laje(c, p) {
    const q = P<Opts & { area: Rect; furos: Rect[]; y0: number; y1: number; superficie: string }>(p);
    slab(c.b, q.area, q.furos, q.y0, q.y1, surface(q.superficie, 'grama'), pieceOpts(q));
  },
};
