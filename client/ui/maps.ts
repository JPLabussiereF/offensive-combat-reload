// The Mapas tab of the home (PF-6): the official maps and the community's, with search (by name or by author),
// order (most played, most recent) and, for the staff, the hidden maps too (P34). Each map's card (name, emoji
// and color from its current version) shows what the one looking may do with it (client/ui/mapsRules.ts):
// play it online (in a mode it's played in) or, a map open to every mode, against bots and on the training
// range on its current version (P43), edit it in the editor, start a new map, duplicate it, delete it,
// hide it or show it again, and see its saved versions to go back to one. The server checks every action again.
import type { MeResponse } from '@shared/account';
import type { MapaResumo, VersaoMapa } from '@shared/mapData';
import type { GameModeId } from '@shared/modes';
import { isEquipe } from '@shared/roles';
import { api } from '../net/api';
import { errorText, formatDate } from './auth';
import { botGame, canCreateMap, mapActions, mapsUrl, playMode, playModes, type MapsQuery, type MapsTab, type Viewer } from './mapsRules';
import { t, type StringKey } from './strings';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface MapsOptions {
  me: MeResponse;
  setStatus(msg: string, error?: boolean): void;
  /** The mode "Jogar" starts with (the Play tab's), and where the choice goes back. */
  game: GameModeId;
  setGame(g: GameModeId): void;
  /** Jogar: the 'play' message for the map in that mode (online). */
  play(map: string, mode: GameModeId): void;
  /** Contra bots and Campo de tiro (P43): offline on that version of the map (the bots' difficulty and count are the Play tab's). */
  bots(mapa: { id: string; versao: number }, game: GameModeId): void;
  range(mapa: { id: string; versao: number }): void;
  /** Editar (a saved map at its current version) and Novo mapa (null): the home opens the editor. */
  edit(mapa: { id: string; versao: number } | null): void;
}

/** The list's search, order and tab, kept while the home is open. */
const query: MapsQuery = { tab: 'oficial', q: '', by: 'nome', order: 'jogados', hidden: false, page: 0 };

const seg = (items: { label: string; on: boolean; data: string }[]) =>
  items.map((i) => `<button type="button" class="seg-btn" data-v="${esc(i.data)}" aria-pressed="${i.on}">${esc(i.label)}</button>`).join('');

const gameName = (m: GameModeId) => t(`gameMode_${m}` as StringKey);

export function showMaps(root: HTMLElement, o: MapsOptions) {
  const viewer: Viewer = { signedIn: true, papeis: o.me.papeis };
  const staff = isEquipe(viewer);
  let maps: MapaResumo[] = [];
  let more = false;
  /** Cards with a panel open below them (versions, hide, delete). */
  const open = new Map<string, 'versoes' | 'ocultar' | 'apagar'>();
  let loading = 0;

  root.innerHTML = `
    <div class="maps-screen">
      <div class="maps-head">
        <nav class="maps-tabs" role="tablist">
          <button type="button" role="tab" data-mt="oficial">${esc(t('mapsOfficial'))}</button>
          <button type="button" role="tab" data-mt="comunidade">${esc(t('mapsCommunity'))}</button>
        </nav>
        ${canCreateMap(viewer) ? `<button type="button" id="maps-new" class="small-btn">${esc(t('mapsNew'))}</button>` : ''}
      </div>
      <div class="maps-tools">
        <input id="maps-q" type="search" spellcheck="false" maxlength="60" placeholder="${esc(t('mapsSearch'))}" />
        <div><h4>${esc(t('mapsSearchBy'))}</h4><div id="maps-by" class="seg"></div></div>
        <div><h4>${esc(t('mapsOrder'))}</h4><div id="maps-order" class="seg"></div></div>
        ${staff ? `<label class="maps-hidden"><input id="maps-hidden" type="checkbox" /> ${esc(t('mapsShowHidden'))}</label>` : ''}
      </div>
      <ul id="maps-list" class="maps-list"></ul>
      <button type="button" id="maps-more" class="small-btn alt hidden">${esc(t('mapsMore'))}</button>
    </div>`;
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const list = $('#maps-list');
  const search = $<HTMLInputElement>('#maps-q');
  search.value = query.q;
  const hiddenBox = root.querySelector<HTMLInputElement>('#maps-hidden');
  if (hiddenBox) hiddenBox.checked = query.hidden;

  const renderTools = () => {
    for (const b of root.querySelectorAll<HTMLElement>('[data-mt]')) b.setAttribute('aria-selected', String(b.dataset.mt === query.tab));
    $('#maps-by').innerHTML = seg([
      { label: t('mapsByName'), on: query.by === 'nome', data: 'nome' },
      { label: t('mapsByAuthor'), on: query.by === 'autor', data: 'autor' },
    ]);
    $('#maps-order').innerHTML = seg([
      { label: t('mapsOrderPlayed'), on: query.order === 'jogados', data: 'jogados' },
      { label: t('mapsOrderRecent'), on: query.order === 'recentes', data: 'recentes' },
    ]);
  };

  /** One map's card: its look, what it is, and the buttons the viewer gets. */
  const card = (m: MapaResumo) => {
    const can = mapActions(m, viewer);
    const modes = playModes(m.exclusivo);
    const mode = playMode(m.exclusivo, o.game);
    const plays = m.jogadas === 1 ? t('mapsPlaysOne') : t('mapsPlays', { n: m.jogadas });
    const who = m.autor ? t('mapsBy', { autor: m.autor }) : t('mapsOfficialBy');
    const tags = [
      m.exclusivo === 'zumbi' ? `<span class="tag" style="background:#c9f5b0">${esc(t('mapsZombieOnly'))}</span>` : '',
      m.oculto ? `<span class="tag maps-hidden-tag" title="${esc(m.oculto.motivo ?? '')}">${esc(m.oculto.motivo ? t('mapsHiddenWhy', { motivo: m.oculto.motivo }) : t('mapsHiddenTag'))}</span>` : '',
    ].join('');
    const actions = [
      can.jogar && modes.length > 1
        ? `<select class="maps-mode" title="${esc(t('gameModeTitle'))}">${modes.map((g) => `<option value="${g}" ${g === mode ? 'selected' : ''}>${esc(gameName(g))}</option>`).join('')}</select>`
        : '',
      can.jogar ? `<button type="button" class="small-btn" data-act="jogar">${esc(t('mapsPlay'))}${modes.length === 1 ? ` · ${esc(gameName(mode))}` : ''}</button>` : '',
      can.bots ? `<button type="button" class="small-btn alt" data-act="bots">${esc(t('mapsBots'))}</button>` : '',
      can.treino ? `<button type="button" class="small-btn alt" data-act="treino">${esc(t('mapsRange'))}</button>` : '',
      can.editar ? `<button type="button" class="small-btn alt" data-act="editar">${esc(t('mapsEdit'))}</button>` : '',
      can.duplicar ? `<button type="button" class="small-btn alt" data-act="duplicar">${esc(t('mapsDuplicate'))}</button>` : '',
      can.versoes ? `<button type="button" class="link-btn" data-act="versoes" aria-expanded="${open.get(m.id) === 'versoes'}">${esc(t('mapsVersions'))}</button>` : '',
      can.ocultar ? `<button type="button" class="link-btn" data-act="ocultar">${esc(t('mapsHide'))}</button>` : '',
      can.desocultar ? `<button type="button" class="link-btn" data-act="desocultar">${esc(t('mapsUnhide'))}</button>` : '',
      can.apagar ? `<button type="button" class="link-btn danger" data-act="apagar">${esc(t('mapsDelete'))}</button>` : '',
    ].join('');
    return `<li class="maps-card${m.oculto ? ' is-hidden' : ''}" data-id="${esc(m.id)}">
      <span class="map-thumb" style="--tint:${esc(m.cartao.cor)}">${esc(m.cartao.emoji)}</span>
      <span class="maps-text"><b>${esc(m.nome)}</b><small>${esc(who)} · ${esc(plays)} · ${esc(t('mapsVersion', { v: m.versao }))} · ${esc(formatDate(m.atualizadoEm))}</small><span class="maps-tags">${tags}</span></span>
      <span class="maps-actions">${actions}</span>
      <div class="maps-panel hidden"></div>
    </li>`;
  };

  const render = () => {
    renderTools();
    list.innerHTML = maps.length ? maps.map(card).join('') : `<li class="empty">${esc(loading ? t('mapsLoading') : t('mapsEmpty'))}</li>`;
    $('#maps-more').classList.toggle('hidden', !more);
    for (const [id, kind] of open) {
      const m = maps.find((x) => x.id === id);
      if (m) void openPanel(m, kind);
      // (while the list loads again the card isn't there yet: its panel opens once it is)
      else if (!loading) open.delete(id);
    }
  };

  /** Loads the list again from the first page (`append`: the next page after the ones shown). */
  const load = async (append = false) => {
    const mine = ++loading;
    query.page = append ? query.page + 1 : 0;
    if (!append) {
      maps = [];
      render();
    }
    try {
      const r = await api<{ mapas: MapaResumo[]; mais: boolean }>('GET', mapsUrl(query, staff));
      if (mine !== loading) return;
      maps = append ? [...maps, ...r.mapas.filter((m) => !maps.some((x) => x.id === m.id))] : r.mapas;
      more = r.mais;
    } catch (err) {
      if (mine !== loading) return;
      o.setStatus(errorText(err), true);
    }
    loading = 0;
    render();
  };

  const panelOf = (id: string) => list.querySelector<HTMLElement>(`.maps-card[data-id="${CSS.escape(id)}"] .maps-panel`);

  /** The panel under a card: the saved versions, the hide form or the delete question. */
  const openPanel = async (m: MapaResumo, kind: 'versoes' | 'ocultar' | 'apagar') => {
    const panel = panelOf(m.id);
    if (!panel) return;
    open.set(m.id, kind);
    panel.classList.remove('hidden');
    const close = () => {
      open.delete(m.id);
      panel.classList.add('hidden');
      panel.innerHTML = '';
    };
    if (kind === 'apagar') {
      panel.innerHTML = `<p>${esc(t('mapsDeleteConfirm', { nome: m.nome }))}</p>
        <div class="maps-row"><button type="button" class="small-btn danger-btn" data-p="ok">${esc(t('mapsDelete'))}</button><button type="button" class="link-btn" data-p="no">${esc(t('mapsCancel'))}</button></div>`;
      panel.querySelector<HTMLElement>('[data-p="no"]')!.onclick = close;
      panel.querySelector<HTMLElement>('[data-p="ok"]')!.onclick = () =>
        void act(() => api('DELETE', `/api/mapas/${encodeURIComponent(m.id)}`), t('mapsDeleted'), () => open.delete(m.id));
      return;
    }
    if (kind === 'ocultar') {
      panel.innerHTML = `<p>${esc(t('mapsHideConfirm', { nome: m.nome }))}</p>
        <div class="maps-row session-create"><input type="text" maxlength="200" spellcheck="false" placeholder="${esc(t('mapsHideReason'))}" />
        <button type="button" class="small-btn" data-p="ok">${esc(t('mapsHide'))}</button><button type="button" class="link-btn" data-p="no">${esc(t('mapsCancel'))}</button></div>`;
      panel.querySelector<HTMLElement>('[data-p="no"]')!.onclick = close;
      panel.querySelector<HTMLElement>('[data-p="ok"]')!.onclick = () => {
        const motivo = panel.querySelector<HTMLInputElement>('input')!.value.trim();
        void act(() => api('POST', `/api/mapas/${encodeURIComponent(m.id)}/ocultar`, motivo ? { motivo } : {}), t('mapsHidden'), () => open.delete(m.id));
      };
      return;
    }
    panel.innerHTML = `<p class="hint">${esc(t('mapsLoading'))}</p>`;
    try {
      const { versoes } = await api<{ versoes: VersaoMapa[] }>('GET', `/api/mapas/${encodeURIComponent(m.id)}/versoes`);
      if (open.get(m.id) !== 'versoes') return;
      panel.innerHTML = `<h4>${esc(t('mapsVersionsTitle'))}</h4><ul class="maps-versions">${versoes
        .map(
          (v) => `<li><span><b>v${v.versao}</b> · ${esc(formatDate(v.criadoEm))}${v.autor ? ` · ${esc(v.autor)}` : ''}${v.drawCalls !== null ? ` · ${v.drawCalls} dc` : ''}</span>
          ${v.atual ? `<span class="tag">${esc(t('mapsCurrent'))}</span>` : `<button type="button" class="small-btn alt" data-v="${v.versao}">${esc(t('mapsRestore'))}</button>`}</li>`,
        )
        .join('')}</ul><button type="button" class="link-btn" data-p="no">${esc(t('mapsClose'))}</button>`;
      panel.querySelector<HTMLElement>('[data-p="no"]')!.onclick = () => {
        close();
        render();
      };
      for (const b of panel.querySelectorAll<HTMLElement>('[data-v]')) {
        const v = Number(b.dataset.v);
        b.onclick = () => void act(() => api('POST', `/api/mapas/${encodeURIComponent(m.id)}/restaurar`, { versao: v }), t('mapsRestored', { v }));
      }
    } catch (err) {
      close();
      o.setStatus(errorText(err), true);
    }
  };

  /** Runs an action, says it worked (or why not) and loads the list again. */
  const act = async (fn: () => Promise<unknown>, done: string, after?: () => void) => {
    try {
      await fn();
      after?.();
      o.setStatus(done);
    } catch (err) {
      o.setStatus(errorText(err), true);
    }
    await load();
  };

  list.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    const li = b?.closest<HTMLElement>('.maps-card');
    const m = li && maps.find((x) => x.id === li.dataset.id);
    if (!b || !li || !m) return;
    switch (b.dataset.act) {
      case 'jogar': {
        const picked = li.querySelector<HTMLSelectElement>('.maps-mode')?.value as GameModeId | undefined;
        const mode = playMode(m.exclusivo, picked ?? o.game);
        if (picked) o.setGame(mode);
        o.play(m.id, mode);
        return;
      }
      case 'bots': {
        // The match type picked in the card (bots play mata-mata and corrida armada).
        const picked = li.querySelector<HTMLSelectElement>('.maps-mode')?.value as GameModeId | undefined;
        return o.bots({ id: m.id, versao: m.versao }, botGame(picked ?? o.game));
      }
      case 'treino':
        return o.range({ id: m.id, versao: m.versao });
      case 'editar':
        return o.edit({ id: m.id, versao: m.versao });
      case 'duplicar':
        return void act(
          async () => {
            const r = await api<{ id: string }>('POST', `/api/mapas/${encodeURIComponent(m.id)}/duplicar`);
            // The copy is the viewer's community map: the list shows it on top.
            query.tab = 'comunidade';
            query.order = 'recentes';
            query.q = search.value = '';
            return r;
          },
          t('mapsDuplicated', { nome: m.nome }),
        );
      case 'desocultar':
        return void act(() => api('DELETE', `/api/mapas/${encodeURIComponent(m.id)}/ocultar`), t('mapsUnhidden'));
      case 'versoes':
      case 'ocultar':
      case 'apagar': {
        const kind = b.dataset.act;
        if (open.get(m.id) === kind) {
          open.delete(m.id);
          return render();
        }
        // One panel per card.
        open.set(m.id, kind);
        render();
        return;
      }
    }
  };

  for (const b of root.querySelectorAll<HTMLElement>('[data-mt]')) {
    b.onclick = () => {
      if (query.tab === b.dataset.mt) return;
      query.tab = b.dataset.mt as MapsTab;
      open.clear();
      void load();
    };
  }
  const segClick = (id: string, apply: (v: string) => void) => {
    $(id).onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-v]');
      if (!b) return;
      apply(b.dataset.v!);
      void load();
    };
  };
  segClick('#maps-by', (v) => (query.by = v === 'autor' ? 'autor' : 'nome'));
  segClick('#maps-order', (v) => (query.order = v === 'recentes' ? 'recentes' : 'jogados'));
  let typing = 0;
  search.oninput = () => {
    clearTimeout(typing);
    typing = window.setTimeout(() => {
      query.q = search.value;
      void load();
    }, 300);
  };
  search.onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    clearTimeout(typing);
    query.q = search.value;
    void load();
  };
  if (hiddenBox)
    hiddenBox.onchange = () => {
      query.hidden = hiddenBox.checked;
      void load();
    };
  $('#maps-more').onclick = () => void load(true);
  const newBtn = root.querySelector<HTMLElement>('#maps-new');
  if (newBtn) newBtn.onclick = () => o.edit(null);

  renderTools();
  void load();
}
