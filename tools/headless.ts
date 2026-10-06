// Running the client's map code in Bun, without a browser (tools/bake-navmesh.ts, tools/snapshot-mapas.ts,
// tools/converter-mapas.ts and client/tests/mapConversion.test.ts): canvas textures get a do-nothing stand-in
// (nothing is drawn, only geometry and colliders matter), glTF props load from public/ on disk, and the
// client's modules are imported through variable paths so the server's typecheck (no DOM types) doesn't
// follow them.
import { join } from 'node:path';

export const ROOT = join(import.meta.dir, '..');

/** Client modules, untyped on purpose (see the header). */
export const loadClient = (path: string): Promise<Record<string, any>> => import(join(ROOT, path));

/** Do-nothing sound effects (every call works and plays nothing). */
export const silentSfx: any = new Proxy({}, { get: () => () => {} });

/** What GLTFLoader's KTX2 setup asks a WebGL renderer (no compressed textures here). */
export const fakeRenderer: any = { extensions: { has: () => false, get: () => null } };

/** What canvas code gets headless: every call works and draws nothing. Returns the undo. */
export function installCanvasStandIn(): () => void {
  const g = globalThis as Record<string, unknown>;
  const had = { document: 'document' in g, window: 'window' in g, progress: 'ProgressEvent' in g };
  const anything: unknown = new Proxy(function () {}, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : anything),
    apply: () => anything,
    set: () => true,
  });
  const ctx2d = new Proxy(
    {},
    {
      get: (_t, k) => {
        if (k === 'getImageData' || k === 'createImageData') return (_x: number, _y: number, w = 1, h = 1) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(4, w * h * 4)) });
        if (k === 'measureText') return (s: string) => ({ width: String(s).length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
        if (k === 'canvas') return { width: 64, height: 64 };
        return typeof k === 'string' && /^[a-z]/.test(k) ? anything : undefined;
      },
      set: () => true,
    },
  );
  if (!had.document) g.document = { createElement: () => ({ width: 64, height: 64, style: {}, getContext: () => ctx2d, toDataURL: () => '' }) };
  if (!had.window) g.window = globalThis;
  // three's FileLoader reports progress with it (the doghouse's .glb).
  if (!had.progress)
    g.ProgressEvent = class {
      constructor(
        readonly type: string,
        o: object,
      ) {
        Object.assign(this, o);
      }
    };
  return () => {
    if (!had.document) delete g.document;
    if (!had.window) delete g.window;
    if (!had.progress) delete g.ProgressEvent;
  };
}

/** Site paths ("/models/x.glb") read from public/ on disk, for three's loaders. */
export async function servePublicFromDisk() {
  const THREE = await import('three');
  THREE.DefaultLoadingManager.setURLModifier((u: string) => (u.startsWith('/') ? 'file:///' + join(ROOT, 'public', u).replace(/\\/g, '/') : u));
}

/** Deterministic Math.random while `fn` runs (stars, clouds and fruit are drawn from it), then the real one back. */
export async function withSeededRandom<T>(seed: number, fn: () => Promise<T>): Promise<T> {
  const real = Math.random;
  let s = seed | 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    return await fn();
  } finally {
    Math.random = real;
  }
}
