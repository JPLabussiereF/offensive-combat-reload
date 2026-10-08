// The seeded randomness of the map pieces (Peca.semente): the client draws trees and rocks with it, and the
// zombie match rebuilds the same tree trunks from it (shared/trees.ts), so both agree on where they stand.

/** A seeded PRNG and where it stands: seeded(r.state) goes on with the very numbers r would give next. */
export interface Seeded {
  (): number;
  readonly state: number;
}

/**
 * Deterministic PRNG: rocks and trees must collide the same way on every client. Its `state` is what the map
 * data keeps per piece (Peca.semente), so each piece draws the same numbers wherever it is built.
 */
export function seeded(seed: number): Seeded {
  const next = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Object.defineProperty(next, 'state', { get: () => seed | 0, enumerable: true }) as Seeded;
}
