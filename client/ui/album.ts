// Album tab on the home card: the account's stickers by page, each with its finish (common, shiny,
// holographic, gold) and the way to the next target. Read from the profile (shared/achievements.ts).
import { album, albumCount, FINISHES, PAGES, sourcesFromProfile, type Sticker, type StickerState } from '@shared/achievements';
import { fetchProfile } from '../net/api';
import { errorText } from './auth';
import { getLang, t, type StringKey } from './strings';

const FINISH_KEY: Record<(typeof FINISHES)[number], StringKey> = {
  comum: 'finishComum',
  brilhante: 'finishBrilhante',
  holografica: 'finishHolografica',
  dourada: 'finishDourada',
};

const text = (x: { pt: string; en: string }) => (getLang() === 'en' ? x.en : x.pt);

/** A sticker's number as it reads (hours for time). */
const amount = (s: Sticker, n: number) => (s.formato === 'horas' ? `${Math.floor(n / 3600)} h` : n.toLocaleString(getLang() === 'en' ? 'en' : 'pt-BR'));

const howTo = (st: StickerState) => text(st.sticker.como).replace('{meta}', amount(st.sticker, st.next ?? st.sticker.metas[st.sticker.metas.length - 1]));

interface Options {
  setStatus(msg: string, error?: boolean): void;
  onBack(): void;
}

/** The page last opened, kept while the home is open. */
let page = PAGES[0].id;

export async function showAlbum(root: HTMLElement, o: Options) {
  let states: StickerState[];
  try {
    states = album(sourcesFromProfile(await fetchProfile()));
  } catch (err) {
    o.setStatus(errorText(err), true);
    return o.onBack();
  }
  let selected: string | null = null;

  const card = (st: StickerState) => {
    const s = st.sticker;
    const color = PAGES.find((p) => p.id === s.pagina)?.cor ?? '#888';
    const finish = st.tier ? t(FINISH_KEY[FINISHES[st.tier - 1]]) : t('finishNone');
    // The bar runs from the last target reached to the next one.
    const from = st.tier === 0 ? 0 : st.tier < s.metas.length ? s.metas[st.tier - 1] : s.metas[s.metas.length - 1] * Math.max(1, st.repeats);
    const pct = st.next === null ? 100 : Math.min(100, Math.round(((st.progress - from) / Math.max(1, st.next - from)) * 100));
    const pips = s.metas.map((_, i) => `<i class="${i < st.tier ? 'on' : ''}"></i>`).join('');
    return `
      <button type="button" class="fig fig-t${st.tier}" style="--c:${color}" data-id="${s.id}" aria-pressed="${selected === s.id}" aria-label="${text(s.nome)}: ${finish}">
        <span class="fig-art"><span class="fig-icon">${s.icone}</span>${st.repeats > 1 ? `<span class="fig-rep">×${st.repeats}</span>` : ''}</span>
        <b class="fig-name">${text(s.nome)}</b>
        <span class="fig-pips">${pips}</span>
        <span class="xp-bar fig-bar"><span class="xp-fill" style="width:${pct}%"></span></span>
        <small class="fig-count">${st.next === null ? t('albumDone') : `${amount(s, st.progress)} / ${amount(s, st.next)}`}</small>
      </button>`;
  };

  const detail = (st: StickerState) => {
    const s = st.sticker;
    const rows = s.metas
      .map((m, i) => `<li class="${i < st.tier ? 'done' : ''}"><span>${t(FINISH_KEY[FINISHES[i]])}</span><b>${amount(s, m)}</b></li>`)
      .join('');
    return `
      <div class="fig-detail">
        <div class="pane-head"><h3>${s.icone} ${text(s.nome)}</h3><span class="hint">${st.tier ? t(FINISH_KEY[FINISHES[st.tier - 1]]) : t('finishNone')}</span></div>
        <p>${st.next === null ? t('albumDone') : howTo(st)}</p>
        <ol class="fig-tiers">${rows}</ol>
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
