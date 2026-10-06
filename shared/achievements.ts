// The sticker album (achievements): every sticker has one drawing and four finishes (common, shiny,
// holographic, gold), each one a bigger target of the same number. Past gold a counter keeps going as
// "repeats" (x2, x3...). Pages and stickers live in data/conquistas.json.
// Two kinds of stickers: the ones read from numbers the account already keeps (player_stats,
// weapon_progress, zombie_stats: `fonte` names the number; older accounts get them at once), and the ones
// with a counter of their own (`fonte: "propria"`), kept by the server in achievement_progress under the
// sticker's id, or one per item for a collection (`itens`: "id:item", the least collected item counts).
import data from './data/conquistas.json';
import type { ProfileResponse, Totals } from './account';
import { MAX_LEVELS, PROG_WEAPONS, type Levels } from './progression';

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
/** The stickers' own counters, by key (the sticker's id, or "id:item" for a collection). */
export type Own = Record<string, number>;

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
  /** The title the page gives: every sticker on it at TITLE_FINISH or better. */
  titulo: Text;
}

export interface Sticker {
  id: string;
  pagina: string;
  icone: string;
  /** contador: a running total (repeats past gold); recorde: a best or a level (no repeats). */
  tipo: 'contador' | 'recorde';
  /** A number the account keeps, or "propria": a counter of the sticker's own. */
  fonte: Source | 'propria';
  /** A collection (own counters only): one counter per item, the least collected counts. */
  itens?: { id: string; nome: Text }[];
  /**
   * The targets, growing: one to four, the last one is always gold (with fewer, the first finishes are
   * skipped: a single target is a gold sticker at once).
   */
  metas: number[];
  /** How the number reads: 'horas' for seconds shown as hours. */
  formato?: 'horas';
  nome: Text;
  /** How to get it: {meta} is the next target; {one|many} picks the word by it ("{vez|vezes}"). */
  como: Text;
}

export const PAGES = data.paginas as AlbumPage[];
export const STICKERS = data.figurinhas as Sticker[];

/** How many targets `progress` reached: 0 (not stuck in yet) up to the number of targets (gold). */
export const tierOf = (progress: number, metas: readonly number[]) => metas.filter((m) => progress >= m).length;

/** The finish a sticker has with `tier` targets reached (null: not stuck in); the last target is always gold. */
export const finishOf = (s: Sticker, tier: number): Finish | null => (tier > 0 ? FINISHES[FINISHES.length - s.metas.length + tier - 1] : null);

/** A "how to get it" text with its target: {meta} becomes `shown`, {one|many} the word for `meta`. */
export const fillHow = (template: string, meta: number, shown: string) =>
  template.replace(/\{([^{}|]*)\|([^{}|]*)\}/g, (_, one: string, many: string) => (meta === 1 ? one : many)).replace(/\{meta\}/g, shown);

/** How far each item of a collection went (in the sticker's order). */
export const itemProgress = (s: Sticker, own: Own) => (s.itens ?? []).map((item) => ({ item, progress: own[`${s.id}:${item.id}`] ?? 0 }));

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

/** The number a sticker counts: from the account's numbers or from its own counters. */
function progressOf(s: Sticker, src: Sources, own: Own): number {
  if (s.fonte !== 'propria') return src[s.fonte] ?? 0;
  if (s.itens) return Math.min(...itemProgress(s, own).map((i) => i.progress));
  return own[s.id] ?? 0;
}

export function stickerState(sticker: Sticker, src: Sources, own: Own = {}): StickerState {
  const progress = Math.max(0, Math.floor(progressOf(sticker, src, own)));
  const tier = tierOf(progress, sticker.metas);
  const top = sticker.metas[sticker.metas.length - 1];
  const repeats = sticker.tipo === 'contador' ? Math.floor(progress / top) : 0;
  const next = tier < sticker.metas.length ? sticker.metas[tier] : sticker.tipo === 'contador' ? top * (repeats + 1) : null;
  return { sticker, progress, tier, repeats, next };
}

export const album = (src: Sources, own: Own = {}): StickerState[] => STICKERS.map((s) => stickerState(s, src, own));

/** Each sticker's finish (0 to 4), by id: what the server compares to tell a player a sticker went up. */
export const tiersOf = (src: Sources, own: Own = {}): Record<string, number> => Object.fromEntries(album(src, own).map((s) => [s.sticker.id, s.tier]));

export const stickerById = (id: string) => STICKERS.find((s) => s.id === id);
export const pageById = (id: string) => PAGES.find((p) => p.id === id);

// --- Showcase: the sticker a player shows and the title they wear --------------------------------------------

/** A page's title is earned with every sticker on it at this finish or better. */
export const TITLE_FINISH: Finish = 'holografica';

/** Whether a sticker reached a finish (a gold-only sticker counts for any). */
const reached = (st: StickerState, f: Finish) => {
  const got = finishOf(st.sticker, st.tier);
  return !!got && FINISHES.indexOf(got) >= FINISHES.indexOf(f);
};

/** How many stickers of a page already count toward its title, out of how many. */
export function titleProgress(states: StickerState[], page: string) {
  const list = states.filter((s) => s.sticker.pagina === page);
  return { done: list.filter((s) => reached(s, TITLE_FINISH)).length, total: list.length };
}

/** The pages whose title the account wears if it wants. */
export const titlesOf = (states: StickerState[]) =>
  PAGES.filter((p) => {
    const t = titleProgress(states, p.id);
    return t.total > 0 && t.done === t.total;
  }).map((p) => p.id);

/** A sticker can be shown once it's stuck in (any finish). */
export const canFeature = (states: StickerState[], id: string) => states.some((s) => s.sticker.id === id && s.tier > 0);

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
  return sourcesFromTotals(p.nivel, Object.fromEntries(PROG_WEAPONS.map((w) => [w, p.armas[w].nivel])) as Levels, p.totais);
}

/** The album's numbers from the account level, the weapon levels and the totals (the server's live copy too). */
export function sourcesFromTotals(level: number, levels: Levels, t: Totals): Sources {
  const z = t.zumbi;
  return {
    nivel: level,
    segundos: t.segundosJogados,
    entradas: t.participacoes,
    armasNoMaximo: PROG_WEAPONS.filter((w) => levels[w] >= MAX_LEVELS[w]).length,
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
    if (s.fonte !== 'propria' && !(SOURCES as readonly string[]).includes(s.fonte)) out.push(`${s.id}: fonte ${s.fonte} não existe`);
    if (s.itens && (s.fonte !== 'propria' || !s.itens.length || new Set(s.itens.map((i) => i.id)).size !== s.itens.length)) out.push(`${s.id}: itens só em fonte própria, sem repetir`);
    if (s.itens && s.tipo !== 'recorde') out.push(`${s.id}: coleção é recorde (sem repetidas)`);
    for (const i of s.itens ?? []) if (!i.nome?.pt || !i.nome?.en) out.push(`${s.id}: item ${i.id} sem nome`);
    if (s.tipo !== 'contador' && s.tipo !== 'recorde') out.push(`${s.id}: tipo ${s.tipo}`);
    if (s.metas.length < 1 || s.metas.length > FINISHES.length) out.push(`${s.id}: de 1 a ${FINISHES.length} metas`);
    if (s.metas.some((m, i) => !Number.isInteger(m) || m <= 0 || (i > 0 && m <= s.metas[i - 1]))) out.push(`${s.id}: metas devem crescer`);
    for (const lang of ['pt', 'en'] as const) {
      if (!s.nome[lang] || !s.como[lang]) out.push(`${s.id}: falta texto em ${lang}`);
      // One target: the text can say it ("Caia para fora do mapa"); more: it must show the next one.
      if (s.metas.length > 1 && !s.como[lang]?.includes('{meta}')) out.push(`${s.id}: "como" sem {meta} em ${lang}`);
    }
  }
  for (const p of PAGES) {
    if (!STICKERS.some((s) => s.pagina === p.id)) out.push(`página ${p.id} vazia`);
    if (!p.titulo?.pt || !p.titulo?.en) out.push(`página ${p.id} sem título`);
  }
  return out;
}
