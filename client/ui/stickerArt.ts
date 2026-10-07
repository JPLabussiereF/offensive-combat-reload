// The album's pictures: each sticker's die-cut art, baked by tools/bake-figurinhas.ts into public/figurinhas/
// (<id>.png 400 x 300 for the card, <id>-mini.png 128 x 128 for the badge) and listed in one manifest per
// studio domain (shared/data/figurinhas/<domain>.json). Builds the album card and the badge other players see
// (scoreboard, death card, profile) with the picture, or with the emoji while a sticker has none.
// DOM-free on purpose (strings only, no document), like strings.ts: the Bun tests and the sticker studio import it.
//
// Rules: a sticker shows its picture only when every sticker of its album page has one, so no page mixes
// emoji and pictures while the domains land one at a time; a hidden sticker not stuck in yet never gets a URL
// anywhere (no img, attribute or title); a picture that fails to load falls back to the emoji (the listener in
// album.ts reads data-icon).
import { finishOf, isHidden, PAGES, pageById, STICKERS, stickerById, type Finish, type Sticker, type StickerState } from '@shared/achievements';
import armas from '@shared/data/figurinhas/armas.json';
import jardim from '@shared/data/figurinhas/jardim.json';
import personagens from '@shared/data/figurinhas/personagens.json';
import rua from '@shared/data/figurinhas/rua.json';
import vila from '@shared/data/figurinhas/vila.json';
import zumbi from '@shared/data/figurinhas/zumbi.json';
import { getLang, t, type StringKey } from './strings';

/** A baked picture, as the manifests list it. */
export interface ArtEntry {
  /** Hash of the card PNG's bytes (the URL's ?v=, so the file can be cached for good). */
  v: string;
  /** Hash of the mini PNG's bytes. */
  vm: string;
  /** Hashes of the pictures' pixels (the bake rewrites a file only when its pixels change). */
  px: string;
  pxm: string;
  /** Sizes in KB: card, mini. */
  kb: [number, number];
}

export type ArtKind = 'card' | 'mini';
/** Where the pictures come from: the manifests, or a stand-in (tests, the studio). */
export type ArtLookup = (id: string) => ArtEntry | undefined;

export interface ArtOptions {
  lookup?: ArtLookup;
  /** This picture instead of the baked one (the studio's live render); null forces the emoji. */
  src?: string | null;
}

const isEntry = (e: unknown): e is ArtEntry => !!e && typeof e === 'object' && typeof (e as ArtEntry).v === 'string' && typeof (e as ArtEntry).vm === 'string';

const BAKED = new Map<string, ArtEntry>();
for (const manifest of [personagens, armas, rua, jardim, vila, zumbi] as Record<string, unknown>[])
  for (const [id, e] of Object.entries(manifest)) if (id !== '_doc' && isEntry(e)) BAKED.set(id, e);

/** The pictures the bake listed in the manifests. */
export const bakedArt: ArtLookup = (id) => BAKED.get(id);

const readyPages = new WeakMap<ArtLookup, Set<string>>();

/** The album pages whose every sticker has a picture (only those show pictures). */
export function pagesWithArt(lookup: ArtLookup = bakedArt): Set<string> {
  let pages = readyPages.get(lookup);
  if (!pages) {
    pages = new Set(PAGES.filter((p) => STICKERS.every((s) => s.pagina !== p.id || !!lookup(s.id))).map((p) => p.id));
    readyPages.set(lookup, pages);
  }
  return pages;
}

/** A sticker's picture URL, or null while it (or anything else on its page) has none. */
export function stickerArtUrl(id: string, kind: ArtKind, lookup: ArtLookup = bakedArt): string | null {
  const s = stickerById(id);
  const e = lookup(id);
  if (!s || !e || !pagesWithArt(lookup).has(s.pagina)) return null;
  return kind === 'card' ? `/figurinhas/${id}.png?v=${e.v}` : `/figurinhas/${id}-mini.png?v=${e.vm}`;
}

/** The inside of a sticker's .fig-art: its picture, or the emoji. */
export function artHtml(s: Sticker, kind: ArtKind, o: ArtOptions = {}): string {
  const src = o.src !== undefined ? o.src : stickerArtUrl(s.id, kind, o.lookup);
  if (!src) return `<span class="fig-icon">${s.icone}</span>`;
  return `<img class="fig-img" src="${src}" alt="" data-icon="${s.icone}" decoding="async" loading="lazy" draggable="false">`;
}

// --- The album card and the badge -------------------------------------------------------------------------------

export const FINISH_KEY: Record<Finish, StringKey> = {
  comum: 'finishComum',
  brilhante: 'finishBrilhante',
  holografica: 'finishHolografica',
  dourada: 'finishDourada',
};
/** The CSS class of each finish (fig-t0: not stuck in). */
export const FINISH_CLASS: Record<Finish, number> = { comum: 1, brilhante: 2, holografica: 3, dourada: 4 };

export const text = (x: { pt: string; en: string }) => (getLang() === 'en' ? x.en : x.pt);

export const finishName = (s: Sticker, tier: number) => {
  const f = finishOf(s, tier);
  return f ? t(FINISH_KEY[f]) : t('finishNone');
};

/** A sticker's number as it reads (hours for time). */
export const amount = (s: Sticker, n: number) => (s.formato === 'horas' ? `${Math.floor(n / 3600)} h` : n.toLocaleString(getLang() === 'en' ? 'en' : 'pt-BR'));

/** How full the bar is toward the next target, counted from zero (300 of 1,000: 30%), and its label. */
export function bar(st: StickerState) {
  const s = st.sticker;
  if (st.next === null) return { pct: 100, label: t('albumDone') };
  return { pct: Math.min(100, Math.round((st.progress / Math.max(1, st.next)) * 100)), label: `${amount(s, st.progress)} / ${amount(s, st.next)}` };
}

export const barHtml = (pct: number) => `<span class="xp-bar fig-bar"><span class="xp-fill" style="width:${pct}%"></span></span>`;

/** A sticker's card in the album grid (`selected`: its detail is open below the grid). */
export function cardHtml(st: StickerState, selected: boolean, o: ArtOptions = {}): string {
  const s = st.sticker;
  // A hidden one: no drawing, no name, no numbers until it's stuck in.
  if (isHidden(st))
    return `
      <button type="button" class="fig fig-t0 fig-hidden" style="--c:#888" data-id="${s.id}" aria-pressed="${selected}" aria-label="${t('albumHidden')}">
        <span class="fig-art"><span class="fig-icon">❓</span></span>
        <b class="fig-name">???</b>
        <small class="fig-count">${t('albumHidden')}</small>
      </button>`;
  const color = PAGES.find((p) => p.id === s.pagina)?.cor ?? '#888';
  const f = finishOf(s, st.tier);
  const b = bar(st);
  const pips = s.metas.map((_, i) => `<i class="${i < st.tier ? 'on' : ''}"></i>`).join('');
  return `
      <button type="button" class="fig fig-t${f ? FINISH_CLASS[f] : 0}" style="--c:${color}" data-id="${s.id}" aria-pressed="${selected}" aria-label="${text(s.nome)}: ${finishName(s, st.tier)}">
        <span class="fig-art">${artHtml(s, 'card', o)}${st.repeats > 1 ? `<span class="fig-rep">×${st.repeats}</span>` : ''}</span>
        <b class="fig-name">${text(s.nome)}</b>
        <span class="fig-pips">${pips}</span>
        ${barHtml(b.pct)}
        <small class="fig-count">${b.label}</small>
      </button>`;
}

/** A sticker's badge at `tier` (its finish); '' while it isn't stuck in, so a hidden one never shows before it's found. */
export function badgeHtml(s: Sticker, tier: number, o: ArtOptions = {}): string {
  const f = finishOf(s, tier);
  if (!f) return '';
  const color = pageById(s.pagina)?.cor ?? '#888';
  return `<span class="fig-mini fig-t${FINISH_CLASS[f]}" style="--c:${color}" title="${text(s.nome)} · ${t(FINISH_KEY[f])}"><span class="fig-art">${artHtml(s, 'mini', o)}</span></span>`;
}

/** A small sticker as others see it (scoreboard, death card, profile): its drawing with its finish; '' for none. */
export function stickerBadge(fig: [id: string, nivel: number] | undefined | null, o: ArtOptions = {}): string {
  const s = fig ? stickerById(fig[0]) : undefined;
  return s ? badgeHtml(s, fig![1], o) : '';
}
