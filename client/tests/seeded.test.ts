// seeded() (client/world/oriental.ts): the maps' deterministic randomness. Exposing its state (each map piece
// keeps the state it starts from: Peca.semente) must not change a single number it gives.
import { describe, expect, it } from 'bun:test';
import { installCanvasStandIn, loadClient } from '../../tools/headless';

/** The generator as it was before it exposed its state (mulberry32). */
function reference(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const restore = installCanvasStandIn();
const { seeded } = await loadClient('client/world/oriental.ts');
restore();

describe('seeded', () => {
  it('dá os mesmos números de antes, para as sementes dos mapas e outras', () => {
    for (const seed of [0, 1, 7, 1031, 4242, 4410, 5150, 8128, -12345, 2 ** 31 - 1]) {
      const a = seeded(seed);
      const b = reference(seed);
      for (let i = 0; i < 2000; i++) expect(a()).toBe(b());
    }
  });

  it('expõe o estado: seeded(r.state) continua com os números que r daria', () => {
    const r = seeded(1031);
    for (let i = 0; i < 37; i++) r();
    const copy = seeded(r.state);
    for (let i = 0; i < 500; i++) expect(copy()).toBe(r());
  });

  it('o estado é um inteiro de 32 bits e começa na semente', () => {
    expect(seeded(8128).state).toBe(8128);
    const r = seeded(-5);
    for (let i = 0; i < 100; i++) {
      r();
      expect(Number.isInteger(r.state)).toBe(true);
      expect(r.state).toBe(r.state | 0);
    }
  });

  it('o estado é só leitura', () => {
    const r = seeded(3);
    expect(() => {
      (r as { state: number }).state = 9;
    }).toThrow();
    expect(r.state).toBe(3);
  });
});
