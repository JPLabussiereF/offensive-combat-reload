// The language saved in the settings (PF-30): loadSettings keeps one of the game's languages and drops anything
// else (the browser's then applies). settings.ts reaches the DOM through client/core/device.ts, so the test gives it
// a tiny browser for the import and a storage of its own, and takes them back afterwards; the import goes through a
// variable so the server's typecheck (no DOM) doesn't follow it.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

type Loaded = { idioma?: string; volume: number; keybinds: unknown };
type SettingsModule = { loadSettings: () => Loaded };

const g = globalThis as Record<string, unknown>;
const STUBS = ['document', 'location', 'matchMedia', 'localStorage'] as const;
const before = new Map<string, PropertyDescriptor | undefined>(STUBS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
const stored = new Map<string, string>();
let settings: SettingsModule;

beforeAll(async () => {
  const stub = (k: string, v: unknown) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  stub('document', { documentElement: { classList: { toggle() {} } }, addEventListener() {} });
  stub('location', { search: '' });
  stub('matchMedia', () => ({ matches: false, addEventListener() {} }));
  stub('localStorage', { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => void stored.set(k, v) });
  const path = '../core/settings';
  settings = (await import(path)) as SettingsModule;
});

afterAll(() => {
  for (const k of STUBS) {
    const d = before.get(k);
    if (d) Object.defineProperty(globalThis, k, d);
    else delete g[k];
  }
});

const load = (saved: unknown) => {
  stored.set('oc.settings.v1', JSON.stringify(saved));
  return settings.loadSettings();
};

describe('idioma salvo nas configurações', () => {
  it('guarda um dos quatro idiomas do jogo', () => {
    for (const idioma of ['pt-BR', 'en', 'es', 'de']) expect(load({ idioma }).idioma).toBe(idioma);
  });

  it('descarta um idioma inválido e mantém o resto das configurações', () => {
    for (const idioma of ['fr', 'pt', 'PT-BR', 'es-MX', '', 42, null, { pt: 1 }]) {
      const s = load({ idioma, volume: 0.3 });
      expect({ idioma, got: s.idioma }).toEqual({ idioma, got: undefined });
      expect(s.volume).toBe(0.3);
    }
  });

  it('sem idioma salvo fica sem (vale o do navegador)', () => {
    expect(load({ volume: 0.5 }).idioma).toBeUndefined();
    stored.clear();
    expect(settings.loadSettings().idioma).toBeUndefined();
  });
});
