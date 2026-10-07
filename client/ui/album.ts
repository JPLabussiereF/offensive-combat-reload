// Album tab on the home card: the account's stickers by page, each with its finish (common, shiny,
// holographic, gold) and the way to the next target. Read from the profile (shared/achievements.ts).
// The cards and the badges show each sticker's baked picture (stickerArt.ts) or its emoji.
import { album, albumCount, fillHow, finishOf, isHidden, itemProgress, pageById, PAGES, sourcesFromProfile, stickerById, titleProgress, titlesOf, type Own, type StickerState } from '@shared/achievements';
import { api, fetchProfile } from '../net/api';
import { errorText } from './auth';
import { amount, bar, barHtml, cardHtml, FINISH_KEY, finishName, stickerBadge, text } from './stickerArt';
import { t } from './strings';

// Scoreboard, death card and profile import the badge from here.
export { stickerBadge };

// A sticker picture that fails to load (a file missing on the server) becomes its emoji, wherever it is: the
// album, the scoreboard, the death card, the profile. The error event doesn't bubble, so it is caught on the way
// down (capture), once for the whole page.
if (typeof document !== 'undefined')
  document.addEventListener(
    'error',
    (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || !img.classList.contains('fig-img')) return;
      const icon = document.createElement('span');
      icon.className = 'fig-icon';
      icon.textContent = img.dataset.icon ?? '';
      img.replaceWith(icon);
    },
    true,
  );

/** The in-game line for a sticker that went up to `tier` (null: a sticker this client doesn't know). */
export function stickerUpText(id: string, tier: number): string | null {
  const s = stickerById(id);
  const finish = s && finishOf(s, tier);
  if (!s || !finish) return null;
  // A hidden one is news of its own the first time.
  if (s.oculta && tier === 1) return t('stickerSecret', { icon: s.icone, name: text(s.nome) });
  return t('stickerUp', { icon: s.icone, finish: t(FINISH_KEY[finish]), name: text(s.nome) });
}

/** How to get the next target (or, done, the last one). */
const howTo = (st: StickerState) => {
  const meta = st.next ?? st.sticker.metas[st.sticker.metas.length - 1];
  return fillHow(text(st.sticker.como), meta, amount(st.sticker, meta));
};

/** A title (a page id) as it reads; '' for none or one this client doesn't know. */
export const titleText = (page: string | null | undefined) => {
  const p = page ? pageById(page) : undefined;
  return p ? text(p.titulo) : '';
};

interface Options {
  setStatus(msg: string, error?: boolean): void;
  onBack(): void;
}

/** The page last opened, kept while the home is open. */
let page = PAGES[0].id;

export async function showAlbum(root: HTMLElement, o: Options) {
  let states: StickerState[];
  let own: Own;
  let featured: string | null;
  let title: string | null;
  try {
    const p = await fetchProfile();
    own = p.album;
    states = album(sourcesFromProfile(p), own);
    featured = p.destaque;
    title = p.titulo;
  } catch (err) {
    o.setStatus(errorText(err), true);
    return o.onBack();
  }
  let selected: string | null = null;

  const card = (st: StickerState) => cardHtml(st, selected === st.sticker.id);

  const detail = (st: StickerState) => {
    const s = st.sticker;
    if (isHidden(st))
      return `
      <div class="fig-detail">
        <div class="pane-head"><h3>❓ ???</h3><span class="hint">${t('albumHidden')}</span></div>
        <p>💡 ${text(s.dica!)}</p>
      </div>`;
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
        ${st.tier > 0 ? `<button id="al-feature" type="button" class="small-btn${featured === s.id ? ' alt' : ''}">${t(featured === s.id ? 'albumUnfeature' : 'albumFeature')}</button>` : ''}
      </div>`;
  };

  /** What others see: the sticker shown and the title worn (only the titles earned can be picked). */
  const showcase = () => {
    const shown = states.find((s) => s.sticker.id === featured);
    const earned = titlesOf(states);
    const options = [`<option value="">${t('albumNoTitle')}</option>`, ...earned.map((id) => `<option value="${id}" ${id === title ? 'selected' : ''}>${titleText(id)}</option>`)].join('');
    const titles = PAGES.map((p) => {
      const tp = titleProgress(states, p.id);
      const done = tp.done === tp.total;
      return `<li class="${done ? 'done' : ''}"><b>${text(p.titulo)}</b><span>${p.icone} ${text(p.nome)}</span><small>${done ? '✓' : `${tp.done}/${tp.total}`}</small></li>`;
    }).join('');
    return `
      <div class="album-showcase">
        <div class="album-shown">${shown ? stickerBadge([shown.sticker.id, shown.tier]) : '<span class="fig-mini empty"></span>'}<div><span class="hint">${t('albumShowcase')}</span><b>${shown ? text(shown.sticker.nome) : t('albumNoShowcase')}</b></div></div>
        <label class="album-title-pick"><span class="hint">${t('albumTitleLabel')}</span><select id="al-title" ${earned.length ? '' : 'disabled'}>${options}</select></label>
      </div>
      <details class="album-titles"><summary>${t('albumTitlesSummary', { got: earned.length, total: PAGES.length })}</summary><p class="hint">${t('albumTitlesHint')}</p><ul>${titles}</ul></details>`;
  };

  const save = async (body: { destaque?: string | null; titulo?: string | null }) => {
    try {
      const p = await api<{ destaque: string | null; titulo: string | null }>('PATCH', '/api/perfil', body);
      featured = p.destaque;
      title = p.titulo;
    } catch (err) {
      o.setStatus(errorText(err), true);
    }
    render();
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
        ${showcase()}
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
    const feature = root.querySelector<HTMLButtonElement>('#al-feature');
    if (feature) feature.onclick = () => void save({ destaque: featured === selected ? null : selected });
    const pick = root.querySelector<HTMLSelectElement>('#al-title');
    if (pick) pick.onchange = () => void save({ titulo: pick.value || null });
  };
  render();
}
