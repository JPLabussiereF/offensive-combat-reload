// Saving the map from the editor: its name, card (emoji and color), whether it's open to every mode or made for
// the zumbi mode only, and (a new map) whether it's official or community, official only for the staff (admin,
// moderator; the server checks it again). The data is checked here first (validateMapData, the same check the
// server makes) and then sent: a new map with POST /api/mapas, a new version of one with PUT /api/mapas/:id and
// the version it was opened at (baseVersao). What the server refuses is told as it is: someone saved meanwhile
// (409 versao_desatualizada), over the budget (orcamento_excedido), invalid data (mapa_invalido).
import { MAP_BUDGET, validateMapData, type MapData, type TipoMapa } from '@shared/mapData';
import { isEquipe, type Papel } from '@shared/roles';
import { ApiError, api } from '../net/api';
import { et } from './strings';

/** The map being edited on the server (id null: a new map, not saved yet). */
export interface MapTarget {
  id: string | null;
  /** The version it was opened at (or last saved as): PUT's baseVersao. */
  versao: number | null;
  tipo: TipoMapa;
}

export interface SaveMeta {
  nome: string;
  emoji: string;
  cor: string;
  zumbi: boolean;
  tipo: TipoMapa;
}

/** Why a save didn't happen: a sentence to show, and the problems it lists. */
export class SaveError extends Error {
  constructor(
    message: string,
    readonly erros: string[] = [],
    readonly code: string = '',
  ) {
    super(message);
  }
}

/** Whether this account may save an official map. */
export const canSaveOfficial = (papeis: readonly Papel[]) => isEquipe({ papeis });

export function metaOf(data: MapData, target: MapTarget): SaveMeta {
  return { nome: data.nome, emoji: data.cartao.emoji, cor: data.cartao.cor, zumbi: data.exclusivo === 'zumbi', tipo: target.tipo };
}

/** The map's data with the dialog's name, card and modes. */
export function withMeta(data: MapData, m: SaveMeta): MapData {
  const d: MapData = structuredClone(data);
  d.nome = m.nome.trim();
  d.cartao = { emoji: m.emoji.trim(), cor: m.cor };
  if (m.zumbi) d.exclusivo = 'zumbi';
  else delete d.exclusivo;
  return d;
}

/** The server's answer to a refused save, as a SaveError. */
export function saveErrorOf(err: unknown): SaveError {
  if (!(err instanceof ApiError)) return new SaveError(et('errOther', { e: String((err as Error)?.message ?? err) }));
  const x = err.extra;
  switch (err.code) {
    case 'versao_desatualizada':
      return new SaveError(et('errStale', { v: String(x.atual ?? '?') }), [], err.code);
    case 'orcamento_excedido': {
      const over = ((x.excedeu as string[]) ?? []).map((k) => (k === 'drawCalls' ? et('budgetDrawCalls') : et('budgetTriangles'))).join(', ');
      return new SaveError(et('errBudget', { o: over, dc: String(x.drawCalls ?? '?'), tri: Number(x.triangulos ?? 0).toLocaleString(), dcMax: MAP_BUDGET.drawCalls, triMax: MAP_BUDGET.triangulos.toLocaleString() }), [], err.code);
    }
    case 'mapa_invalido':
      return new SaveError(et('errInvalid'), (x.erros as string[]) ?? [], err.code);
    case 'sem_permissao':
      return new SaveError(et('errPermission'), [], err.code);
    case 'nao_autorizado':
      return new SaveError(et('errSignedOut'), [], err.code);
    case 'offline':
      return new SaveError(et('errOffline'), [], err.code);
    default:
      return new SaveError(et('errOther', { e: err.code }), [], err.code);
  }
}

/** Saves `data` as `target`: a new map or a new version. Throws a SaveError. */
export async function saveMap(data: MapData, target: MapTarget): Promise<{ id: string; versao: number }> {
  const check = validateMapData(data);
  if (!check.ok) throw new SaveError(et('invalid', { n: check.erros.length }), check.erros, 'local');
  try {
    if (!target.id) return await api<{ id: string; versao: number }>('POST', '/api/mapas', { tipo: target.tipo, dados: data });
    return await api<{ id: string; versao: number }>('PUT', `/api/mapas/${encodeURIComponent(target.id)}`, { dados: data, baseVersao: target.versao });
  } catch (err) {
    throw saveErrorOf(err);
  }
}

// --- The dialog ----------------------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Asks for the name, card, modes and kind, then saves. Resolves with the saved meta, id and version, or null
 * when cancelled. `apply` puts the meta in the map being edited before it's sent (an undoable edit).
 */
export function showSaveDialog(o: { host: HTMLElement; data: () => MapData; target: MapTarget; papeis: readonly Papel[]; apply: (m: SaveMeta) => void }): Promise<{ id: string; versao: number } | null> {
  const { host, target } = o;
  const m = metaOf(o.data(), target);
  const staff = canSaveOfficial(o.papeis);
  const box = document.createElement('div');
  box.className = 'ed-modal';
  box.innerHTML = `
    <form class="ed-dialog">
      <h3>${esc(et('saveTitle'))}</h3>
      ${target.id && target.versao ? `<p class="ed-note">${esc(et('baseVersion', { v: target.versao }))}</p>` : ''}
      <label class="ed-row"><span>${esc(et('name'))}</span><input name="nome" maxlength="60" required></label>
      <label class="ed-row"><span>${esc(et('emoji'))}</span><input name="emoji" maxlength="16" required></label>
      <label class="ed-row"><span>${esc(et('color'))}</span><input name="cor" type="color"></label>
      <fieldset class="ed-obj"><legend>${esc(et('modes'))}</legend>
        <label><input type="radio" name="modo" value="aberto"> ${esc(et('modesOpen'))}</label><br>
        <label><input type="radio" name="modo" value="zumbi"> ${esc(et('modesZombie'))}</label>
      </fieldset>
      <fieldset class="ed-obj"><legend>${esc(et('kindLabel'))}</legend>
        <label><input type="radio" name="tipo" value="comunidade"> ${esc(et('community'))}</label>
        <label><input type="radio" name="tipo" value="oficial"> ${esc(et('official'))}</label>
        ${staff ? '' : `<p class="ed-note">${esc(et('officialOnlyStaff'))}</p>`}
      </fieldset>
      <div class="ed-msg"></div>
      <div class="ed-actions"><button type="button" class="ed-cancel">${esc(et('cancel'))}</button><button type="submit" class="ed-primary">${esc(et('saveConfirm'))}</button></div>
    </form>`;
  host.append(box);
  const form = box.querySelector('form')!;
  const field = (n: string) => form.elements.namedItem(n) as HTMLInputElement;
  field('nome').value = m.nome;
  field('emoji').value = m.emoji;
  field('cor').value = m.cor;
  for (const r of form.querySelectorAll<HTMLInputElement>('input[name=modo]')) r.checked = r.value === (m.zumbi ? 'zumbi' : 'aberto');
  for (const r of form.querySelectorAll<HTMLInputElement>('input[name=tipo]')) {
    r.checked = r.value === m.tipo;
    // An existing map keeps its kind; only the staff makes official ones.
    r.disabled = !!target.id || (r.value === 'oficial' && !staff);
  }
  const msg = box.querySelector<HTMLElement>('.ed-msg')!;
  const show = (text: string, erros: string[] = [], ok = false) => {
    msg.className = `ed-msg ${ok ? 'ed-ok' : 'ed-err'}`;
    msg.innerHTML = `<p>${esc(text)}</p>${erros.length ? `<ul>${erros.slice(0, 30).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}`;
  };
  return new Promise((resolve) => {
    const close = (v: { id: string; versao: number } | null) => {
      box.remove();
      resolve(v);
    };
    box.querySelector<HTMLButtonElement>('.ed-cancel')!.onclick = () => close(null);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const meta: SaveMeta = {
        nome: field('nome').value,
        emoji: field('emoji').value,
        cor: field('cor').value,
        zumbi: form.querySelector<HTMLInputElement>('input[name=modo]:checked')?.value === 'zumbi',
        tipo: (form.querySelector<HTMLInputElement>('input[name=tipo]:checked')?.value as TipoMapa) ?? 'comunidade',
      };
      if (meta.tipo === 'oficial' && !staff) meta.tipo = 'comunidade';
      o.apply(meta);
      target.tipo = meta.tipo;
      const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
      submit.disabled = true;
      show(et('saving'), [], true);
      try {
        const saved = await saveMap(o.data(), target);
        show(et('saved', { v: saved.versao }), [], true);
        setTimeout(() => close(saved), 900);
      } catch (err) {
        const e = err instanceof SaveError ? err : new SaveError(String(err));
        show(e.message, e.erros);
        submit.disabled = false;
      }
    };
  });
}
