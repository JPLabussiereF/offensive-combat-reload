// Sticker studio: Math.random, seeded. While a sticker builds (and while a domain file first runs), Math.random is a
// seeded generator keyed by the sticker's id (or the domain's name), so the props' own dice, the kit's stars and
// confetti and any module-level randomness come out the same on every run. The generator is the maps' own
// (world/oriental.ts seeded, mulberry32), written here again so this module and the cast (cast.ts neighbor) stay
// free of the map code: the tests import them under Bun, without a DOM.

/** A seeded random in [0, 1): mulberry32, the same sequence as world/oriental.ts seeded for the same seed. */
export function seeded(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A 32-bit FNV-1a hash of a string (the seed). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const realRandom = Math.random;

/** Runs `f` with Math.random seeded from `key`, then gives the real one back. */
export async function withSeed<T>(key: string, f: () => T | Promise<T>): Promise<T> {
  Math.random = seeded(hashString(key));
  try {
    return await f();
  } finally {
    Math.random = realRandom;
  }
}
