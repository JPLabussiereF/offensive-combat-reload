// One-shot conversion of the maps built in code into map data (PF-6; tools/converter-mapas.ts runs it). Each
// map's script here is its old builder with every call turned into a piece: `place(kind, params)` builds the
// piece right away with its adapter (so the script's own random draws keep coming in the same order) and
// records it; the MapBuilder primitives are recorded through `b`, a builder look-alike. A piece that draws
// random numbers keeps the generator's state from just before it (Peca.semente).
//
// The map data (shared/data/mapas/*.json) is the source of truth from now on: these scripts only document
// and reproduce the conversion.
import * as THREE from 'three';
import type { MapData, Peca } from '@shared/mapData';
import type { Opening, PieceOpts } from '../mapBuilder';
import type { Seeded } from '../oriental';
import { CATALOG } from '../catalog';
import type { BuildCtx } from '../catalog/types';

type Extra = Pick<Peca, 'p' | 'yaw' | 'escala' | 'prop' | 'coletavel' | 'semente'>;

/** The map data besides its pieces. */
export type MapMeta = Omit<MapData, 'pecas'>;

/** Drops undefined values (JSON has no undefined), recursively. */
function clean<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clean) as T;
  if (v && typeof v === 'object' && !(v instanceof THREE.Vector3)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = clean(x);
    return out as T;
  }
  return v;
}

const num = (v: unknown, what: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${what}: esperado um número, veio ${String(v)}`);
  return v;
};

export class Recorder {
  readonly pecas: Peca[] = [];
  private counts = new Map<string, number>();
  /** The MapBuilder's primitives, recorded as pieces. */
  readonly b: RecordingBuilder;

  constructor(
    readonly ctx: BuildCtx,
    /** The map's shared generator, as the old builder drew from it. */
    readonly rand: Seeded,
  ) {
    this.b = new RecordingBuilder(this);
  }

  /** Records a piece and builds it now. Async kinds (a model) return the promise: await it. */
  place(tipo: string, params: Record<string, unknown> = {}, extra: Extra = {}): void | Promise<void> {
    const adapter = CATALOG[tipo];
    if (!adapter) throw new Error(`tipo de peça desconhecido "${tipo}"`);
    const n = (this.counts.get(tipo) ?? 0) + 1;
    this.counts.set(tipo, n);
    const peca: Peca = clean({ id: `${tipo}-${n}`, tipo, ...extra, params });
    this.pecas.push(peca);
    const before = this.rand.state;
    this.ctx.rand = this.rand;
    const done = () => {
      if (this.rand.state !== before) peca.semente = before;
    };
    const r = adapter(this.ctx, peca);
    if (r instanceof Promise) return r.then(done);
    done();
  }

  /** A three.js geometry by name and its operations ('forma' and 'brilho' pieces). */
  shape(superficie: string, cor: number | undefined, geo: string, args: number[], ops: unknown[][] = [], sombra?: boolean) {
    this.place('forma', { geo, args, ops, superficie, cor, sombra });
  }

  glow(cor: number, geo: string, args: number[], ops: unknown[][] = []) {
    this.place('brilho', { geo, args, ops, cor });
  }
}

const OPTS = new Set(['tint', 'collide', 'castShadow', 'physics', 'occluder', 'rot']);

/** PieceOpts → piece params; anything a primitive piece can't carry (a gag's onShot) must go through its own adapter. */
function opts(o: PieceOpts & Record<string, unknown>, also: string[] = []) {
  for (const k of Object.keys(o)) if (!OPTS.has(k) && !also.includes(k)) throw new Error(`opção "${k}" sem lugar numa peça primitiva`);
  if (o.tint !== undefined && typeof o.tint !== 'number') throw new Error('cor deve ser um número');
  return { cor: o.tint as number | undefined, colide: o.collide, sombra: o.castShadow, fisica: o.physics, oclusor: o.occluder };
}

/** Rotation of a box: a plain yaw, or the whole Euler. */
function rotation(rot: THREE.Euler | undefined): { yaw?: number; rot?: number[]; ordem?: string } {
  if (!rot || (rot.x === 0 && rot.y === 0 && rot.z === 0)) return {};
  if (rot.x === 0 && rot.z === 0) return { yaw: rot.y };
  return { rot: [rot.x, rot.y, rot.z], ordem: rot.order === 'XYZ' ? undefined : rot.order };
}

/** What a map script calls `b`: the MapBuilder's primitives, each one recorded as a piece. */
export class RecordingBuilder {
  constructor(private r: Recorder) {}

  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, surface: string, o: PieceOpts = {}) {
    const { yaw, rot, ordem } = rotation(o.rot);
    this.r.place('caixa', { tamanho: [sx, sy, sz], superficie: surface, ...opts(o as never), rot, ordem }, { p: [cx, cy, cz], yaw });
  }

  /** Box from min/max corners: recorded as its center and size, the very numbers MapBuilder.span hands box(). */
  span(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, surface: string, o: PieceOpts = {}) {
    this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, surface, o);
  }

  cylinder(cx: number, y0: number, cz: number, r: number, h: number, surface: string, o: PieceOpts & { radiusTop?: number; segments?: number } = {}) {
    if (o.rot) throw new Error('cilindro não gira');
    this.r.place('cilindro', { raio: r, altura: h, raioTopo: o.radiusTop, segmentos: o.segments, superficie: surface, ...opts(o as never, ['radiusTop', 'segments']) }, { p: [cx, y0, cz] });
  }

  room(min: { x: number; y: number; z: number }, max: { x: number; y: number; z: number }, enclosure = 1) {
    const p: [number, number, number] = [(min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2];
    this.r.place('sala', { tamanho: [Math.abs(max.x - min.x), Math.abs(max.y - min.y), Math.abs(max.z - min.z)], fechamento: enclosure }, { p });
  }

  wall(axis: 'x' | 'z', fixed: number, a: number, b: number, t: number, h: number, surface: string, openings: Opening[] = [], y0 = 0, o: PieceOpts & { frame?: { surface?: string; tint?: number; width?: number } } = {}) {
    const f = o.frame;
    this.r.place('parede', {
      eixo: axis,
      fixo: fixed,
      de: a,
      ate: b,
      espessura: t,
      altura: h,
      superficie: surface,
      vaos: openings.map((op) => op.map((v) => num(v, 'vão'))),
      y0,
      ...opts(o as never, ['frame']),
      moldura: f ? { superficie: f.surface, cor: f.tint, largura: f.width } : undefined,
    });
  }

  stairs(axis: 'x' | 'z', dir: 1 | -1, start: number, across0: number, across1: number, baseY: number, rise: number, surface: string, o: PieceOpts & { gentle?: boolean } = {}) {
    this.r.place('escada', { eixo: axis, sentido: dir, inicio: start, de: across0, ate: across1, base: baseY, subida: rise, superficie: surface, ...opts(o as never, ['gentle']), suave: o.gentle });
  }

  gableRoof(x0: number, z0: number, x1: number, z1: number, eaveY: number, rise: number, surface: string, o: PieceOpts & { overhang?: number; ridgeAxis?: 'x' | 'z'; gableSurface?: string; gableTint?: number } = {}) {
    this.r.place('telhado', { x0, z0, x1, z1, beiral: eaveY, subida: rise, superficie: surface, ...opts(o as never, ['overhang', 'ridgeAxis', 'gableSurface', 'gableTint']), aba: o.overhang, cumeeira: o.ridgeAxis, oitao: o.gableSurface, corOitao: o.gableTint });
  }

  addGeometry(): never {
    throw new Error('geometria solta: use r.shape(...) ou uma peça com adaptador');
  }
}
