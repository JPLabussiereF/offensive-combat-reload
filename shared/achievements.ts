// The sticker album (achievements): every sticker has one drawing and four finishes (common, shiny,
// holographic, gold), each one a bigger target of the same number. Past gold a counter keeps going as
// "repeats" (x2, x3...). Pages and stickers live in data/conquistas.json.
// The first stickers all come from numbers the account already keeps (player_stats, weapon_progress,
// zombie_stats), read here from the profile: nothing new is saved for them, and older accounts get theirs
// at once.
import data from './data/conquistas.json';
import type { ProfileResponse } from './account';
import { MAX_LEVELS, PROG_WEAPONS } from './progression';

export const FINISHES = ['comum', 'brilhante', 'holografica', 'dourada'] as const;
export type Finish = (typeof FINISHES)[number];

/** The numbers a sticker can count. */
export const SOURCES = [
  'nivel',
  'segundos',
  'entradas',
  'armasNoMaximo',
  'abates',
  'cabeca',
  'passaro',
  'facadas',
  'pelasCostas',
  'granadas',
  'opressoes',
  'mortes',
  'zumbiVitorias',
  'zumbiMelhorOnda',
  'zumbiAbates',
  'zumbiCadaChefe',
  'zumbiReanimacoes',
  'zumbiCaixao',
  'zumbiQuedas',
] as const;
export type Source = (typeof SOURCES)[number];
export type Sources = Record<Source, number>;

export interface Text {
  pt: string;
  en: string;
}

export interface AlbumPage {
  id: string;
  icone: string;
  /** The page's color (the stickers' background). */
  cor: string;
  nome: Text;
}

export interface Sticker {
  id: string;
  pagina: string;
  icone: string;
  /** contador: a running total (repeats past gold); recorde: a best or a level (no repeats). */
  tipo: 'contador' | 'recorde';
  fonte: Source;
  /** The four targets, one per finish, growing. */
  metas: number[];
  /** How the number reads: 'horas' for seconds shown as hours. */
  formato?: 'horas';
  nome: Text;
  /** How to get it; {meta} is the next target. */
  como: Text;
}

export const PAGES = data.paginas as AlbumPage[];
export const STICKERS = data.figurinhas as Sticker[];

/** How many targets `progress` reached: 0 (not stuck in yet) to 4 (gold). */
export const tierOf = (progress: number, metas: readonly number[]) => metas.filter((m) => progress >= m).length;

export interface StickerState {
  sticker: Sticker;
  progress: number;
  /** 0 to 4: the finish is FINISHES[tier - 1]. */
  tier: number;
  /** Times past the gold target, for counters (2 and up show as repeats); 0 for records. */
  repeats: number;
  /** The next target (the next finish, or the next repeat); null when a record is done. */
  next: number | null;
}

export function stickerState(sticker: Sticker, src: Sources): StickerState {
  const progress = Math.max(0, Math.floor(src[sticker.fonte] ?? 0));
  const tier = tierOf(progress, sticker.metas);
  const top = sticker.metas[sticker.metas.length - 1];
  const repeats = sticker.tipo === 'contador' ? Math.floor(progress / top) : 0;
  const next = tier < sticker.metas.length ? sticker.metas[tier] : sticker.tipo === 'contador' ? top * (repeats + 1) : null;
  return { sticker, progress, tier, repeats, next };
}

export const album = (src: Sources): StickerState[] => STICKERS.map((s) => stickerState(s, src));

/** Stickers stuck in (any finish) and finishes earned, out of the totals, for a page or the whole album. */
export function albumCount(states: StickerState[], page?: string) {
  const list = page ? states.filter((s) => s.sticker.pagina === page) : states;
  return {
    stuck: list.filter((s) => s.tier > 0).length,
    total: list.length,
    finishes: list.reduce((n, s) => n + s.tier, 0),
    finishesTotal: list.reduce((n, s) => n + s.sticker.metas.length, 0),
  };
}

/** The album's numbers, from what GET /api/perfil already sends. */
export function sourcesFromProfile(p: ProfileResponse): Sources {
  const t = p.totais;
  const z = t.zumbi;
  return {
    nivel: p.nivel,
    segundos: t.segundosJogados,
    entradas: t.participacoes,
    armasNoMaximo: PROG_WEAPONS.filter((w) => p.armas[w].nivel >= MAX_LEVELS[w]).length,
    abates: t.abates,
    cabeca: t.cabeca,
    passaro: t.passaro,
    facadas: t.facadas,
    pelasCostas: t.pelasCostas,
    granadas: t.granadas,
    opressoes: t.opressoes,
    mortes: t.mortes,
    zumbiVitorias: z.vitorias,
    zumbiMelhorOnda: z.melhorOnda,
    zumbiAbates: z.abates,
    // Every boss, as many times: the one hunted least counts.
    zumbiCadaChefe: Math.min(z.coveiro, z.noiva, z.prefeito),
    zumbiReanimacoes: z.reanimacoes,
    zumbiCaixao: z.caixao,
    zumbiQuedas: z.quedas,
  };
}

/** What's wrong with the album's data (checked by the tests): empty means fine. */
export function albumProblems(): string[] {
  const out: string[] = [];
  const pages = new Set(PAGES.map((p) => p.id));
  if (pages.size !== PAGES.length) out.push('páginas com id repetido');
  const ids = new Set<string>();
  for (const s of STICKERS) {
    if (ids.has(s.id)) out.push(`${s.id}: id repetido`);
    ids.add(s.id);
    if (!pages.has(s.pagina)) out.push(`${s.id}: página ${s.pagina} não existe`);
    if (!(SOURCES as readonly string[]).includes(s.fonte)) out.push(`${s.id}: fonte ${s.fonte} não existe`);
    if (s.tipo !== 'contador' && s.tipo !== 'recorde') out.push(`${s.id}: tipo ${s.tipo}`);
    if (s.metas.length !== FINISHES.length) out.push(`${s.id}: precisa de ${FINISHES.length} metas`);
    if (s.metas.some((m, i) => !Number.isInteger(m) || m <= 0 || (i > 0 && m <= s.metas[i - 1]))) out.push(`${s.id}: metas devem crescer`);
    for (const lang of ['pt', 'en'] as const) {
      if (!s.nome[lang] || !s.como[lang]) out.push(`${s.id}: falta texto em ${lang}`);
      if (!s.como[lang]?.includes('{meta}')) out.push(`${s.id}: "como" sem {meta} em ${lang}`);
    }
  }
  for (const p of PAGES) if (!STICKERS.some((s) => s.pagina === p.id)) out.push(`página ${p.id} vazia`);
  return out;
}
