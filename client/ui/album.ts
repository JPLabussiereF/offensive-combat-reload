// Album tab on the home card: the account's stickers by page, each with its finish (common, shiny,
// holographic, gold) and the way to the next target. Read from the profile (shared/achievements.ts).
import { album, albumCount, fillHow, finishOf, itemProgress, PAGES, sourcesFromProfile, stickerById, type Finish, type Own, type Sticker, type StickerState } from '@shared/achievements';
import { fetchProfile } from '../net/api';
import { errorText } from './auth';
import { getLang, t, type StringKey } from './strings';

const FINISH_KEY: Record<Finish, StringKey> = {
  comum: 'finishComum',
  brilhante: 'finishBrilhante',
  holografica: 'finishHolografica',
  dourada: 'finishDourada',
};
/** The CSS class of each finish (fig-t0: not stuck in). */
const FINISH_CLASS: Record<Finish, number> = { comum: 1, brilhante: 2, holografica: 3, dourada: 4 };

const text = (x: { pt: string; en: string }) => (getLang() === 'en' ? x.en : x.pt);

const finishName = (s: Sticker, tier: number) => {
  const f = finishOf(s, tier);
  return f ? t(FINISH_KEY[f]) : t('finishNone');
};

/** The in-game line for a sticker that went up to `tier` (null: a sticker this client doesn't know). */
export function stickerUpText(id: string, tier: number): string | null {
  const s = stickerById(id);
  const finish = s && finishOf(s, tier);
  if (!s || !finish) return null;
  return t('stickerUp', { icon: s.icone, finish: t(FINISH_KEY[finish]), name: text(s.nome) });
}

/** A sticker's number as it reads (hours for time). */
const amount = (s: Sticker, n: number) => (s.formato === 'horas' ? `${Math.floor(n / 3600)} h` : n.toLocaleString(getLang() === 'en' ? 'en' : 'pt-BR'));

/** How to get the next target (or, done, the last one). */
const howTo = (st: StickerState) => {
  const meta = st.next ?? st.sticker.metas[st.sticker.metas.length - 1];
  return fillHow(text(st.sticker.como), meta, amount(st.sticker, meta));
};

/** Where the bar is between the last target reached and the next one (0..100), and its label. */
function bar(st: StickerState) {
  const s = st.sticker;
  if (st.next === null) return { pct: 100, label: t('albumDone') };
  const top = s.metas[s.metas.length - 1];
  const from = st.tier === 0 ? 0 : st.tier < s.metas.length ? s.metas[st.tier - 1] : top * Math.max(1, st.repeats);
  return { pct: Math.min(100, Math.round(((st.progress - from) / Math.max(1, st.next - from)) * 100)), label: `${amount(s, st.progress)} / ${amount(s, st.next)}` };
}

const barHtml = (pct: number) => `<span class="xp-bar fig-bar"><span class="xp-fill" style="width:${pct}%"></span></span>`;

interface Options {
  setStatus(msg: string, error?: boolean): void;
  onBack(): void;
}

/** The page last opened, kept while the home is open. */
let page = PAGES[0].id;

export async function showAlbum(root: HTMLElement, o: Options) {
  let states: StickerState[];
  let own: Own;
  try {
    const p = await fetchProfile();
    own = p.album;
    states = album(sourcesFromProfile(p), own);
  } catch (err) {
    o.setStatus(errorText(err), true);
    return o.onBack();
  }
  let selected: string | null = null;

  const card = (st: StickerState) => {
    const s = st.sticker;
    const color = PAGES.find((p) => p.id === s.pagina)?.cor ?? '#888';
    const f = finishOf(s, st.tier);
    const b = bar(st);
    const pips = s.metas.map((_, i) => `<i class="${i < st.tier ? 'on' : ''}"></i>`).join('');
    return `
      <button type="button" class="fig fig-t${f ? FINISH_CLASS[f] : 0}" style="--c:${color}" data-id="${s.id}" aria-pressed="${selected === s.id}" aria-label="${text(s.nome)}: ${finishName(s, st.tier)}">
        <span class="fig-art"><span class="fig-icon">${s.icone}</span>${st.repeats > 1 ? `<span class="fig-rep">×${st.repeats}</span>` : ''}</span>
        <b class="fig-name">${text(s.nome)}</b>
        <span class="fig-pips">${pips}</span>
        ${barHtml(b.pct)}
        <small class="fig-count">${b.label}</small>
      </button>`;
  };

  const detail = (st: StickerState) => {
    const s = st.sticker;
    const b = bar(st);
    const rows = s.metas.map((m, i) => `<li class="${i < st.tier ? 'done' : ''}"><span>${finishName(s, i + 1)}</span><b>${amount(s, m)}</b></li>`).join('');
    // A collection: how far each item went, toward the next target.
    const goal = st.next ?? s.metas[s.metas.length - 1];
    const items = itemProgress(s, own)
      .map(({ item, progress }) => `<li><span>${text(item.nome)}</span>${barHtml(Math.min(100, Math.round((progress / goal) * 100)))}<b>${Math.min(progress, goal)} / ${goal}</b></li>`)
      .join('');
    return `
      <div class="fig-detail">
        <div class="pane-head"><h3>${s.icone} ${text(s.nome)}</h3><span class="hint">${finishName(s, st.tier)}</span></div>
        <p>${howTo(st)}</p>
        <div class="fig-progress">${barHtml(b.pct)}<b>${b.label}</b></div>
        ${items ? `<ul class="fig-items">${items}</ul>` : ''}
        <ol class="fig-tiers" style="--n:${s.metas.length}">${rows}</ol>
        ${st.repeats > 1 ? `<p class="hint">${t('albumRepeats', { n: st.repeats })}</p>` : ''}
      </div>`;
  };

  const render = () => {
    const all = albumCount(states);
    const tabs = PAGES.map((p) => {
      const c = albumCount(states, p.id);
      return `<button type="button" class="seg-btn" data-page="${p.id}" aria-pressed="${p.id === page}">${p.icone} ${text(p.nome)} <small>${c.stuck}/${c.total}</small></button>`;
    }).join('');
    const list = states.filter((s) => s.sticker.pagina === page);
    const chosen = list.find((s) => s.sticker.id === selected);
    root.innerHTML = `
      <div class="album">
        <div class="pane-head"><h3>${t('albumTitle')}</h3><span class="hint">${t('albumCount', { stuck: all.stuck, total: all.total, finishes: all.finishes, finishesTotal: all.finishesTotal })}</span></div>
        <p class="hint">${t('albumHint')}</p>
        <div class="seg album-pages">${tabs}</div>
        <div class="fig-grid">${list.map(card).join('')}</div>
        ${chosen ? detail(chosen) : ''}
      </div>`;
    for (const b of root.querySelectorAll<HTMLElement>('[data-page]'))
      b.onclick = () => {
        page = b.dataset.page!;
        selected = null;
        render();
      };
    for (const b of root.querySelectorAll<HTMLElement>('.fig'))
      b.onclick = () => {
        selected = selected === b.dataset.id ? null : b.dataset.id!;
        render();
      };
  };
  render();
}
