// The Gerenciamento tab of the home (PF-6), for admins and moderators only: find an account by name or tag and
// open its panel: sanctions (ban and mute with a reason and a duration, and lifting them), name, look (the
// character editor, saving to that account), body, progress (account XP, each weapon's XP) and roles (give
// and take away). What the panel offers follows the permissions GET /api/gestao/contas/:id returns for the one
// asking (client/ui/managementRules.ts): a moderator gets no buttons on an admin's account and can't make
// anyone an admin. The server checks every change again (server/gestao.ts).
import { NAME_MAX, TIPOS_SANCAO, type ContaGestao, type ContaResumo, type SancaoInfo, type TipoSancao } from '@shared/account';
import { PROG_WEAPONS, type ProgWeapon } from '@shared/progression';
import type { Papel } from '@shared/roles';
import { accountLevel } from '@shared/accountLevel';
import { api } from '../net/api';
import { errorText, formatDate } from './auth';
import { weaponName } from './arsenal';
import { showCustomizer, type CustomizerHandle } from './customize';
import { accountControls, DURACOES, progressPatch, sanctionBody } from './managementRules';
import { t, type StringKey } from './strings';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface ManagementOptions {
  setStatus(msg: string, error?: boolean): void;
}

/** The search and the open account, kept while the home is open. */
const state: { q: string; open: string | null } = { q: '', open: null };

/** The character editor of the open account, freed before the tab's content changes (PF-33). */
let editor: CustomizerHandle | null = null;
const closeEditor = () => {
  editor?.dispose();
  editor = null;
};

const roleName = (p: Papel) => t(`mgRole_${p}` as StringKey);
const roleTags = (papeis: Papel[]) => papeis.map((p) => `<span class="tag mg-role">${esc(roleName(p))}</span>`).join('');

/** The tags of an account's state: roles, active sanctions, suspended or being deleted. */
function stateTags(c: ContaResumo) {
  return [
    roleTags(c.papeis),
    c.banida ? `<span class="tag mg-bad">${esc(t('mgBanned'))}</span>` : '',
    c.silenciada ? `<span class="tag mg-warn">${esc(t('mgMuted'))}</span>` : '',
    c.status === 'suspended' ? `<span class="tag mg-bad">${esc(t('mgSuspended'))}</span>` : '',
    c.status === 'pending_deletion' ? `<span class="tag">${esc(t('mgPendingDeletion'))}</span>` : '',
  ].join('');
}

function sanctionLine(s: SancaoInfo) {
  const kind = TIPOS_SANCAO.includes(s.tipo as TipoSancao) ? t(`mgSanction_${s.tipo}` as StringKey) : s.tipo;
  const end = s.revogadaEm ? t('mgRevoked', { data: formatDate(s.revogadaEm) }) : s.fim ? t('mgUntil', { data: formatDate(s.fim) }) : t('mgForever');
  return `<li><b>${esc(kind)}</b> · ${esc(formatDate(s.inicio))} · ${esc(end)}${s.por ? ` · ${esc(t('mgBy', { tag: s.por }))}` : ''}<br /><small>${esc(s.motivo)}</small></li>`;
}

export function showManagement(root: HTMLElement, o: ManagementOptions) {
  // The tab takes the card's whole width (the character editor gives it back when it closes).
  root.closest('.home-card')?.classList.add('wide');
  if (state.open) return void openAccount(root, o, state.open);
  showSearch(root, o);
}

/** The search: accounts by name or tag, a page at a time. */
function showSearch(root: HTMLElement, o: ManagementOptions) {
  closeEditor();
  state.open = null;
  root.innerHTML = `
    <div class="mgmt">
      <h3>${esc(t('mgTitle'))}</h3>
      <p class="hint">${esc(t('mgHint'))}</p>
      <div class="session-create mg-search">
        <input id="mg-q" type="search" spellcheck="false" maxlength="40" placeholder="${esc(t('mgSearch'))}" />
        <button type="button" id="mg-find" class="small-btn">${esc(t('mgFind'))}</button>
      </div>
      <ul id="mg-list" class="mg-list"></ul>
      <button type="button" id="mg-more" class="small-btn alt hidden">${esc(t('mapsMore'))}</button>
    </div>`;
  const input = root.querySelector<HTMLInputElement>('#mg-q')!;
  const list = root.querySelector<HTMLElement>('#mg-list')!;
  const moreBtn = root.querySelector<HTMLElement>('#mg-more')!;
  input.value = state.q;
  let rows: ContaResumo[] = [];
  let page = 0;
  let asked = 0;

  const render = () => {
    list.innerHTML = rows.length
      ? rows
          .map(
            (c) => `<li class="mg-row"><span class="mg-who"><b>${esc(c.tag)}</b><span class="level-badge">${esc(t('levelShort', { level: c.nivel }))}</span>${stateTags(c)}</span>
            <button type="button" class="small-btn alt" data-id="${esc(c.id)}">${esc(t('mgOpen'))}</button></li>`,
          )
          .join('')
      : `<li class="empty">${esc(t('mgEmpty'))}</li>`;
  };
  const find = async (next = false) => {
    const mine = ++asked;
    state.q = input.value.trim();
    page = next ? page + 1 : 0;
    try {
      const r = await api<{ contas: ContaResumo[]; mais: boolean }>('GET', `/api/gestao/contas?q=${encodeURIComponent(state.q)}${page ? `&pagina=${page}` : ''}`);
      if (mine !== asked) return;
      rows = next ? [...rows, ...r.contas] : r.contas;
      moreBtn.classList.toggle('hidden', !r.mais);
      render();
    } catch (err) {
      o.setStatus(errorText(err), true);
    }
  };
  root.querySelector<HTMLElement>('#mg-find')!.onclick = () => void find();
  input.onkeydown = (e) => {
    if (e.key === 'Enter') void find();
  };
  moreBtn.onclick = () => void find(true);
  list.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
    if (b) void openAccount(root, o, b.dataset.id!);
  };
  void find();
}

/** One account's panel: what the staff member may do to it, and nothing else. */
async function openAccount(root: HTMLElement, o: ManagementOptions, id: string) {
  closeEditor();
  let c: ContaGestao;
  try {
    c = await api<ContaGestao>('GET', `/api/gestao/contas/${encodeURIComponent(id)}`);
  } catch (err) {
    o.setStatus(errorText(err), true);
    return showSearch(root, o);
  }
  state.open = id;
  const can = accountControls(c);
  const weaponRows = PROG_WEAPONS.map(
    (w) => `<label class="mg-field"><span>${esc(weaponName(w))} <small>${esc(t('levelShort', { level: c.armas[w]?.nivel ?? 1 }))}</small></span><input type="number" min="0" step="1" data-w="${w}" value="${c.armas[w]?.xp ?? 0}" ${can.editar ? '' : 'disabled'} /></label>`,
  ).join('');
  const roles = [
    ...can.rebaixar.map((p) => `<button type="button" class="small-btn alt" data-demote="${p}">${esc(t('mgDemote', { papel: roleName(p) }))}</button>`),
    ...can.promover.map((p) => `<button type="button" class="small-btn" data-promote="${p}">${esc(t('mgPromote', { papel: roleName(p) }))}</button>`),
  ].join('');

  root.innerHTML = `
    <div class="mgmt mg-account">
      <div class="profile-head"><b class="profile-tag">${esc(c.tag)}</b><span class="level-badge">${esc(t('levelShort', { level: c.nivel }))}</span></div>
      <p class="mg-tags">${stateTags(c) || `<span class="tag">${esc(t('mgPlayer'))}</span>`}</p>
      ${can.editar ? '' : `<p class="profile-warn">${esc(t('mgReadOnly'))}</p>`}

      <h3>${esc(t('mgSanctions'))}</h3>
      ${
        can.punir
          ? `<div class="mg-sanction">
              <div class="seg" id="mg-kind">${TIPOS_SANCAO.map((k, i) => `<button type="button" class="seg-btn" data-v="${k}" aria-pressed="${i === 0}">${esc(t(k === 'banimento' ? 'mgBan' : 'mgMute'))}</button>`).join('')}</div>
              <label class="mg-field"><span>${esc(t('mgReason'))}</span><input id="mg-reason" type="text" maxlength="200" spellcheck="false" /></label>
              <label class="mg-field"><span>${esc(t('mgDuration'))}</span><select id="mg-duration">${DURACOES.map((d) => `<option value="${d}" ${d === '1d' ? 'selected' : ''}>${esc(t(`mgDur_${d}` as StringKey))}</option>`).join('')}</select></label>
              <button type="button" id="mg-apply" class="small-btn">${esc(t('mgApply'))}</button>
            </div>
            <div class="mg-row-btns">
              ${can.retirarBanimento ? `<button type="button" class="small-btn alt" data-lift="banimento">${esc(t('mgUnban'))}</button>` : ''}
              ${can.retirarSilencio ? `<button type="button" class="small-btn alt" data-lift="silencio">${esc(t('mgUnmute'))}</button>` : ''}
            </div>`
          : `<p class="hint">${esc(t('mgNoPunish'))}</p>`
      }
      <h4>${esc(t('mgHistory'))}</h4>
      ${c.sancoes.length ? `<ul class="mg-history">${c.sancoes.map(sanctionLine).join('')}</ul>` : `<p class="hint">${esc(t('mgNoSanctions'))}</p>`}

      ${
        can.editar
          ? `<h3>${esc(t('mgName'))}</h3>
            <div class="session-create mg-name">
              <input id="mg-name" type="text" spellcheck="false" maxlength="${NAME_MAX}" value="${esc(c.nome)}" />
              <button type="button" id="mg-name-save" class="small-btn">${esc(t('save'))}</button>
            </div>
            <p class="hint">${esc(t('mgNameHint'))}</p>

            <h3>${esc(t('mgLook'))}</h3>
            <div class="sex-toggle" role="radiogroup">
              ${(['m', 'f'] as const).map((s) => `<button type="button" class="sex-btn" role="radio" data-sex="${s}" aria-checked="${c.sexo === s}">${esc(t(s === 'f' ? 'sexFemale' : 'sexMale'))}</button>`).join('')}
            </div>
            <button type="button" id="mg-look" class="small-btn wide-btn">${esc(t('mgEditLook'))}</button>

            <h3>${esc(t('mgProgress'))}</h3>
            <label class="mg-field"><span>${esc(t('mgAccountXp', { n: accountLevel(c.xp).level }))}</span><input id="mg-xp" type="number" min="0" step="1" value="${c.xp}" /></label>
            <h4>${esc(t('mgWeaponXp'))}</h4>
            <div class="mg-weapons">${weaponRows}</div>
            <button type="button" id="mg-progress" class="small-btn">${esc(t('mgSaveProgress'))}</button>`
          : ''
      }

      <h3>${esc(t('mgRoles'))}</h3>
      <p class="mg-tags">${roleTags(c.papeis) || `<span class="tag">${esc(t('mgPlayer'))}</span>`}</p>
      ${roles ? `<div class="mg-row-btns">${roles}</div>` : `<p class="hint">${esc(t('mgRolesNone'))}</p>`}

      <div class="profile-actions"><button type="button" id="mg-back" class="link-btn" data-pad-back>${esc(t('back'))}</button></div>
    </div>`;

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T | null;
  const base = `/api/gestao/contas/${encodeURIComponent(id)}`;
  /** Runs a change, says so, and shows the account again (as the server has it now). */
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      o.setStatus(t('mgDone'));
    } catch (err) {
      o.setStatus(errorText(err), true);
    }
    await openAccount(root, o, id);
  };

  $('#mg-back')!.onclick = () => showSearch(root, o);

  // Sanctions.
  let kind: TipoSancao = 'banimento';
  const kinds = $('#mg-kind');
  if (kinds)
    kinds.onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-v]');
      if (!b) return;
      kind = b.dataset.v as TipoSancao;
      for (const x of kinds.querySelectorAll('[data-v]')) x.setAttribute('aria-pressed', String(x === b));
    };
  const apply = $('#mg-apply');
  if (apply)
    apply.onclick = () => {
      const s = sanctionBody(kind, $<HTMLInputElement>('#mg-reason')!.value, $<HTMLSelectElement>('#mg-duration')!.value);
      if (!s.ok) return o.setStatus(t(s.erro === 'motivo' ? 'mgNeedReason' : 'errBadInput'), true);
      void act(() => api('POST', `${base}/sancoes`, s.body));
    };
  for (const b of root.querySelectorAll<HTMLElement>('[data-lift]')) b.onclick = () => void act(() => api('DELETE', `${base}/sancoes/${b.dataset.lift}`));

  // Name, body, look and progress.
  const nameSave = $('#mg-name-save');
  if (nameSave) nameSave.onclick = () => void act(() => api('PATCH', base, { nome: $<HTMLInputElement>('#mg-name')!.value }));
  for (const b of root.querySelectorAll<HTMLElement>('.sex-btn')) {
    b.onclick = () => {
      if (b.getAttribute('aria-checked') === 'true') return;
      void act(() => api('PATCH', base, { sexo: b.dataset.sex }));
    };
  }
  const look = $('#mg-look');
  if (look)
    look.onclick = () => {
      closeEditor();
      editor = showCustomizer(root, {
        look: c.aparencia,
        sex: c.sexo,
        setStatus: o.setStatus,
        // Saved to this account, not to the staff member's own.
        onSave: async (a) => {
          await api('PATCH', base, { aparencia: a });
        },
        onClose: () => {
          root.closest('.home-card')?.classList.add('wide');
          void openAccount(root, o, id);
        },
      });
    };
  const progress = $('#mg-progress');
  if (progress)
    progress.onclick = () => {
      const armas: Partial<Record<ProgWeapon, string>> = {};
      for (const input of root.querySelectorAll<HTMLInputElement>('input[data-w]')) armas[input.dataset.w as ProgWeapon] = input.value;
      const patch = progressPatch(c, $<HTMLInputElement>('#mg-xp')!.value, armas);
      if (!patch) return o.setStatus(t('mgBadNumber'), true);
      if (patch.xp === undefined && !patch.armas) return o.setStatus(t('mgDone'));
      void act(() => api('PATCH', base, patch));
    };

  // Roles.
  for (const b of root.querySelectorAll<HTMLElement>('[data-promote]')) b.onclick = () => void act(() => api('PUT', `${base}/papeis/${b.dataset.promote}`));
  for (const b of root.querySelectorAll<HTMLElement>('[data-demote]')) b.onclick = () => void act(() => api('DELETE', `${base}/papeis/${b.dataset.demote}`));
}
