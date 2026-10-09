// Sticker studio, review mode (the page's default) and the contact sheet (?folha=1): the pictures where players
// will see them, at real size. Per sticker: the album card's real markup (stickerArt.ts cardHtml) in every finish
// fig-t0..fig-t4, marking the ones it can actually reach (a one-target sticker is only ever gold); the badge's
// real markup at 30/40/46/48 px over the light panels and in a dark scoreboard row; the baked PNG beside the live
// render when there is one; the 1:1 PNGs. ?grade=1 draws the 6% margin (the whole die-cut, border included, stays
// inside it: the bake warns otherwise) and, for counters (they show the ×N repeats tag), the top-right corner to
// keep clear. The contact sheet puts every baked mini at 30 px in one grid,
// then each album page's cards side by side, to catch look-alikes across domains.
import { FINISHES, PAGES, STICKERS, type Sticker, type StickerState } from '@shared/achievements';
import { badgeHtml, bakedArt, cardHtml, text } from '../../../ui/stickerArt';

export interface Live {
  card: string;
  mini: string;
  avisos: string[];
  texts: string[];
  fill: [number, number];
  ms: number;
}

export interface ReviewItem {
  sticker: Sticker;
  /** Its studio domain (or 'smoke'). */
  domain: string;
  /** The live render (object URLs), its failure, or null when showing baked PNGs only. */
  live: Live | { error: string } | null;
}

const pageOf = (s: Sticker) => PAGES.find((p) => p.id === s.pagina);

/** The baked PNGs of a sticker, read straight from the manifests (no page gate: the studio shows what exists). */
export function bakedOf(id: string): { card: string; mini: string } | null {
  const e = bakedArt(id);
  return e ? { card: `/figurinhas/${id}.png?v=${e.v}`, mini: `/figurinhas/${id}-mini.png?v=${e.vm}` } : null;
}

/** A display state at a finish class (1 comum … 4 dourada; 0 not stuck in), padding the targets when unreachable. */
function stateAt(s: Sticker, finish: number): { st: StickerState; reachable: boolean } {
  const n = s.metas.length;
  const reachable = finish === 0 || finish >= FINISHES.length + 1 - n;
  const sticker = reachable ? s : { ...s, metas: [1, 2, 3, 4].map((i) => i * (s.metas[0] ?? 1)) };
  const metas = sticker.metas;
  const tier = finish === 0 ? 0 : finish - FINISHES.length + metas.length;
  const top = metas[metas.length - 1];
  const gold = finish === FINISHES.length;
  const repeats = gold && s.tipo === 'contador' ? 3 : 0;
  return {
    st: {
      sticker,
      tier,
      progress: tier ? metas[tier - 1] : Math.round(metas[0] / 3),
      repeats,
      next: tier < metas.length ? metas[tier] : s.tipo === 'contador' ? top * (repeats + 1) : null,
    },
    reachable,
  };
}

const FINISH_LABEL = ['vazia', 'comum', 'brilhante', 'holográfica', 'dourada'];

function cardCell(st: StickerState, src: string | null, caption: string, off = false) {
  return `<div class="est-cell${off ? ' est-off' : ''}">${cardHtml(st, false, { src })}<small>${caption}</small></div>`;
}

/** The badge in its real homes: the profile (40), the album's showcase (46), the death card (48), the scoreboard (30). */
function minis(s: Sticker, src: string | null) {
  const n = s.metas.length;
  const first = FINISHES.length + 1 - n;
  const tiers = [...new Set([1, n])];
  const light = tiers
    .map((tier) => {
      const badge = badgeHtml(s, tier, { src });
      return `
        <div class="est-mini-set">
          <span class="est-30">${badge}</span>
          <div class="profile-showcase">${badge}</div>
          <div class="album-shown">${badge}</div>
          <div id="death-showcase">${badge}</div>
          <small>${FINISH_LABEL[first + tier - 1]}: 30 · 40 · 46 · 48 px</small>
        </div>`;
    })
    .join('');
  const dark = `
    <table class="est-placar"><tbody>
      <tr><td class="sb-name">${badgeHtml(s, 1, { src })}Vizinho#4821<small class="sb-title">${text(pageOf(s)?.titulo ?? { pt: '', en: '', es: '', de: '' })}</small></td><td>12</td><td>3</td></tr>
      <tr><td class="sb-name">${badgeHtml(s, n, { src })}Amora#0001</td><td>9</td><td>5</td></tr>
    </tbody></table>`;
  return `<div class="est-minis">${light}${dark}</div>`;
}

function section(item: ReviewItem, o: { grid: boolean; baked: boolean }) {
  const s = item.sticker;
  const page = pageOf(s);
  const live = item.live && 'card' in item.live ? item.live : null;
  const failed = item.live && 'error' in item.live ? item.live.error : null;
  const baked = o.baked ? bakedOf(s.id) : null;
  const src = live ? live.card : baked ? baked.card : null;
  const miniSrc = live ? live.mini : baked ? baked.mini : null;
  const cells = [0, 1, 2, 3, 4].map((f) => {
    const { st, reachable } = stateAt(s, f);
    return cardCell(st, src, reachable ? FINISH_LABEL[f] : `${FINISH_LABEL[f]} (não alcança)`, !reachable);
  });
  if (live && baked) cells.push(cardCell(stateAt(s, FINISHES.length + 1 - s.metas.length).st, baked.card, 'PNG gravado'));
  const avisos = [...(failed ? [`erro: ${failed}`] : []), ...(live?.avisos ?? [])];
  const facts = [
    page ? `${page.icone} ${text(page.nome)}` : s.pagina,
    item.domain,
    s.tipo,
    `${s.metas.length} ${s.metas.length === 1 ? 'meta' : 'metas'}`,
    s.oculta ? 'oculta' : '',
    live ? `ocupa ${Math.round(live.fill[0] * 100)}% / ${Math.round(live.fill[1] * 100)}%` : '',
    live?.texts.length ? `texto ${live.texts.join(', ')}` : '',
    live ? `${(live.ms / 1000).toFixed(1)} s` : '',
  ].filter(Boolean);
  return `
    <section class="est-fig${o.grid ? ' est-grade' : ''}${s.tipo === 'contador' ? ' est-contador' : ''}" data-id="${s.id}" style="--c:${page?.cor ?? '#888'}">
      <header><b>${s.icone} ${text(s.nome)}</b> <code>${s.id}</code> <span>${facts.join(' · ')}</span></header>
      ${avisos.length ? `<ul class="est-avisos">${avisos.map((a) => `<li>${a}</li>`).join('')}</ul>` : ''}
      ${src ? '' : `<p class="est-vazio">${failed ? 'sem imagem (veja o erro)' : 'ainda sem PNG gravado'}</p>`}
      <div class="fig-grid est-cards">${cells.join('')}</div>
      ${minis(s, miniSrc)}
      ${src ? `<div class="est-png"><img src="${src}" width="400" height="300" alt=""><img src="${miniSrc}" width="128" height="128" alt=""><small>PNG 1:1 sobre a cor da página</small></div>` : ''}
    </section>`;
}

/** Overlays for ?grade=1: the 6% margin on every card picture; the repeats tag's corner on counters. */
function addGrid(root: HTMLElement) {
  for (const art of root.querySelectorAll<HTMLElement>('.est-grade .est-cards .fig-art')) {
    art.insertAdjacentHTML('beforeend', '<span class="est-margem"></span>');
    if (art.closest('.est-contador')) art.insertAdjacentHTML('beforeend', '<span class="est-canto"></span>');
  }
}

/** Waits until every picture is decoded (lazy loading off: a full-page screenshot needs them all). */
export async function picturesReady(root: ParentNode = document) {
  const imgs = [...root.querySelectorAll('img')];
  for (const img of imgs) img.loading = 'eager';
  await Promise.all(imgs.map((img) => img.decode().catch(() => undefined)));
  await document.fonts.ready;
}

export function reviewHeader(title: string, notes: string[]) {
  const q = new URLSearchParams(location.search);
  const link = (key: string, value: string | null, label: string) => {
    const p = new URLSearchParams(q);
    if (value === null) p.delete(key);
    else p.set(key, value);
    return `<a href="?${p}">${label}</a>`;
  };
  return `
    <header class="est-topo">
      <h1>${title}</h1>
      <nav>
        ${q.get('grade') === '1' ? link('grade', null, 'sem grade') : link('grade', '1', 'grade (6% e canto do ×N)')}
        ${q.get('fonte') === 'png' ? link('fonte', null, 'render ao vivo') : link('fonte', 'png', 'só PNGs gravados')}
        ${link('folha', '1', 'folha do álbum')}
      </nav>
      ${notes.length ? `<ul class="est-notas">${notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
    </header>`;
}

/** Shows one sticker's review in `el` (again when its live render arrives). */
export function renderItem(el: HTMLElement, item: ReviewItem, o: { grid: boolean; baked: boolean }) {
  el.innerHTML = section(item, o);
  if (o.grid) addGrid(el);
}

/** The contact sheet: every baked mini at 30 px, then each page's cards at real size, side by side. */
export function renderSheet(root: HTMLElement, pageFilter: string | null) {
  const pages = PAGES.filter((p) => !pageFilter || p.id === pageFilter);
  const stickers = STICKERS.filter((s) => pages.some((p) => p.id === s.pagina));
  const withArt = stickers.filter((s) => bakedOf(s.id));
  const minis = withArt
    .map((s) => {
      const b = bakedOf(s.id)!;
      // At its first finish: the page's color behind it, as most players will see it (one-target ones are gold).
      return `<div class="est-folha-mini">${badgeHtml(s, 1, { src: b.mini })}<small>${s.id}</small></div>`;
    })
    .join('');
  const cards = pages
    .map((p) => {
      const list = stickers.filter((s) => s.pagina === p.id);
      const cells = list.map((s) => {
        const b = bakedOf(s.id);
        const { st } = stateAt(s, FINISHES.length + 1 - s.metas.length);
        return cardCell(st, b ? b.card : null, b ? s.id : `${s.id} (sem PNG)`);
      });
      return `<h2>${p.icone} ${text(p.nome)} <small>${list.filter((s) => bakedOf(s.id)).length}/${list.length} com PNG</small></h2><div class="fig-grid est-folha-cartas">${cells.join('')}</div>`;
    })
    .join('');
  root.innerHTML = `
    <h2>Minis a 30 px <small>${withArt.length}/${stickers.length} com PNG</small></h2>
    <div class="est-folha-minis">${minis || '<p class="est-vazio est-tudo">nenhuma figurinha gravada ainda</p>'}</div>
    ${cards}`;
}
