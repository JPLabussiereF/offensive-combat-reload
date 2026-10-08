// The pet's card (PF-29), the same on the Galpão's 07 · PETS station (client/ui/galpao/petBoard.ts) and on the
// classic home's Pets tab (below): who it is, its zumbi ability with its numbers, "Levar este" (choosing a pet to look
// at is not taking it along), "Deixar no quintal", its name (only its owner sees it; the Amora's is hers), its coat
// and collar, and the PvP / PvE switches. Every change goes to the account (PATCH /api/perfil {pet}) through the
// home, which keeps the choice and undoes it if the server didn't save it.
import { COLLARS, PET_ABILITIES, PET_IDS, PET_NAME_MAX, petAllowed, petCooldown, petLook, petName, PETS, sanitizePetName, type PetChoice, type PetId } from '@shared/pets';
import { coatSwatch } from '../pets/species';
import { petPortraits } from '../pets/portrait';
import { getLang, t, type StringKey } from './strings';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export interface PetCardHooks {
  /** The account's pet choice as it is now. */
  choice(): PetChoice;
  /** Saves a new choice (it shows at once; the home undoes it if the server refuses). */
  save(next: PetChoice): void;
}

/** The numbers each ability's text names. */
function abilityParams(id: PetId): Record<string, number> {
  const A = PET_ABILITIES;
  switch (id) {
    case 'amora':
      return { r: A.amora.alcance, s: A.amora.segura };
    case 'bruxinha':
      return { r: A.bruxinha.alcance, s: A.bruxinha.duracao };
    case 'gato':
      return { s: A.gato.segundos };
    case 'fuinha':
      return { r: A.fuinha.alcance, s: A.fuinha.tabuaSegundos };
    case 'lontra':
      return { r: A.lontra.alcance };
    case 'iguana':
      return { r: A.iguana.raio, s: A.iguana.duracao };
  }
}

/** A pet's ability line for the cards: its name, what it does, and its cooldown (the cat: lifts per match). */
export function abilityOf(id: PetId) {
  const cd = petCooldown(id);
  return {
    name: t(`petAbility_${id}` as StringKey),
    desc: t(`petAbilityDesc_${id}` as StringKey, abilityParams(id)),
    foot: cd > 0 ? t('petCooldown', { s: cd }) : t('petCharges', { n: PET_ABILITIES.gato.cargas }),
  };
}

/** The pet's name for its owner (theirs for it, or the catalog's). */
export const displayName = (id: PetId, c: PetChoice | null) => petName(id, getLang(), c);

/** The card of one pet, in `root`. */
export class PetCard {
  private id: PetId | null = null;
  private nameTimer = 0;

  constructor(
    private root: HTMLElement,
    private hooks: PetCardHooks,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (!el.matches('[data-name]')) return;
      clearTimeout(this.nameTimer);
      this.nameTimer = window.setTimeout(() => this.saveName(el.value), 700);
    });
    root.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement;
      if (!el.matches('[data-name]')) return;
      clearTimeout(this.nameTimer);
      this.saveName(el.value);
    });
  }

  get shown(): PetId | null {
    return this.id;
  }

  show(id: PetId | null) {
    this.id = id;
    this.render();
  }

  /** Again from the choice (it changed elsewhere); a name being typed is kept. */
  render() {
    const id = this.id;
    if (!id) {
      this.root.innerHTML = '';
      return;
    }
    const focused = document.activeElement instanceof HTMLInputElement && this.root.contains(document.activeElement) ? document.activeElement.value : null;
    const c = this.hooks.choice();
    const def = PETS[id];
    const look = petLook(c, id);
    const lang = getLang();
    const allowed = petAllowed(id);
    const along = c.id === id;
    const ab = abilityOf(id);
    let state: string;
    if (!allowed) state = `<span class="gp-chip red">${esc(t('petLocked'))}</span><span>${esc(t('petLockedHow'))}</span>`;
    else if (along) state = `<span class="gp-chip green">${esc(t('petWithYou'))}</span><button type="button" class="pc-leave" data-leave>${esc(t('petLeave'))}</button>`;
    else state = `<button type="button" class="gp-equip" data-take>${esc(t('petTake'))}</button>`;
    const coats = def.pelagens
      .map((p) => `<button type="button" class="pc-swatch${look.cor === p.id ? ' on' : ''}" data-coat="${p.id}" aria-pressed="${look.cor === p.id}" title="${esc(p.nome[lang])}" style="--sw:${coatSwatch(id, p.id)}"><i></i><span>${esc(p.nome[lang])}</span></button>`)
      .join('');
    const collars = COLLARS.map((k) => `<button type="button" class="pc-swatch dot${look.coleira === k.id ? ' on' : ''}" data-collar="${k.id}" aria-pressed="${look.coleira === k.id}" title="${esc(k.nome[lang])}" aria-label="${esc(k.nome[lang])}" style="--sw:${hex(k.cor)}"><i></i></button>`).join('');
    const sw = (key: 'pvp' | 'pve', label: StringKey, sub: StringKey) =>
      `<button type="button" class="pc-switch${c[key] ? ' on' : ''}" data-switch="${key}" aria-pressed="${c[key]}"><span><b>${esc(t(label))}</b><small>${esc(t(sub))}</small></span><em>${esc(t(c[key] ? 'pmOn' : 'pmOff'))}</em></button>`;
    this.root.innerHTML = `
      <div class="gp-card-head pc-head">
        <span><small class="gp-kicker">${esc(def.especie[lang])}</small><b>${esc(displayName(id, c))}</b></span>
      </div>
      <div class="gp-card-state pc-state">${state}</div>
      <div class="pc-ability"><small class="gp-kicker">${esc(t('petAbilityTitle'))}</small><b>${esc(ab.name)}</b><p>${esc(ab.desc)}</p><small class="gp-mono">${esc(ab.foot)}</small></div>
      ${
        def.fixo
          ? `<p class="pc-note">${esc(t('petNameFixed'))}</p>`
          : `<label class="pc-row pc-name"><small class="gp-kicker">${esc(t('petNameLabel'))}</small><input type="text" data-name maxlength="${PET_NAME_MAX}" spellcheck="false" autocomplete="off" placeholder="${esc(def.nome[lang])}" value="${esc(focused ?? look.nome ?? '')}" /></label>`
      }
      ${coats ? `<div class="pc-row"><small class="gp-kicker">${esc(t(id === 'bruxinha' ? 'petRobe' : 'petCoat'))}</small><div class="pc-swatches">${coats}</div></div>` : ''}
      <div class="pc-row"><small class="gp-kicker">${esc(t('petCollar'))}</small><div class="pc-swatches">${collars}</div></div>
      <div class="pc-switches">${sw('pvp', 'petPvp', 'petPvpSub')}${sw('pve', 'petPve', 'petPveSub')}</div>`;
    if (focused !== null) {
      const input = this.root.querySelector<HTMLInputElement>('[data-name]');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }
  }

  /** The choice with `f` applied to a copy, saved. */
  private change(f: (c: PetChoice) => void) {
    const next = structuredClone(this.hooks.choice());
    f(next);
    this.hooks.save(next);
  }

  private lookOf(c: PetChoice, id: PetId) {
    return (c.cfg[id] ??= {});
  }

  private saveName(raw: string) {
    const id = this.id;
    if (!id || PETS[id].fixo) return;
    const nome = sanitizePetName(raw);
    if ((this.hooks.choice().cfg[id]?.nome ?? '') === nome) return;
    this.change((c) => {
      const l = this.lookOf(c, id);
      if (nome) l.nome = nome;
      else delete l.nome;
    });
  }

  private onClick(e: MouseEvent) {
    const el = e.target as HTMLElement;
    const id = this.id;
    if (!id) return;
    if (el.closest('[data-take]')) return this.change((c) => (c.id = id));
    if (el.closest('[data-leave]')) return this.change((c) => (c.id = null));
    const coat = el.closest<HTMLElement>('[data-coat]')?.dataset.coat;
    if (coat) return this.change((c) => (this.lookOf(c, id).cor = coat));
    const collar = el.closest<HTMLElement>('[data-collar]')?.dataset.collar;
    if (collar) return this.change((c) => (this.lookOf(c, id).coleira = collar as (typeof COLLARS)[number]['id']));
    const key = el.closest<HTMLElement>('[data-switch]')?.dataset.switch as 'pvp' | 'pve' | undefined;
    if (key) return this.change((c) => (c[key] = !c[key]));
  }
}

/**
 * The classic home's Pets tab (no Galpão): the six pets as a list with their faces (2D portraits), the chosen one's
 * big portrait and its card. `onChange` rebinds when the choice changes (the home calls `refresh`).
 */
export class PetsTab {
  private card: PetCard;
  private shown: PetId;
  private faces = new Map<string, string>();

  constructor(
    private root: HTMLElement,
    private hooks: PetCardHooks,
  ) {
    root.innerHTML = `
      <div class="pets-head"><h3>${esc(t('petsTitle'))}</h3><p class="hint">${esc(t('petsSub'))}</p></div>
      <div class="pets-body">
        <div class="pets-list" role="listbox"></div>
        <div class="pets-detail"><div class="pets-portrait"><img alt="" /></div><div class="pets-card gp-card"></div></div>
      </div>`;
    this.card = new PetCard(root.querySelector('.pets-card')!, hooks);
    this.shown = hooks.choice().id ?? 'amora';
    root.querySelector('.pets-list')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-pet]');
      if (!b) return;
      this.shown = b.dataset.pet as PetId;
      this.refresh();
    });
    this.refresh();
  }

  /** Everything again (the choice changed). */
  refresh() {
    const c = this.hooks.choice();
    const list = this.root.querySelector<HTMLElement>('.pets-list')!;
    list.innerHTML = PET_IDS.map((id) => {
      const look = petLook(c, id);
      const key = `${id}|${look.cor}|${look.coleira}`;
      const tag = !petAllowed(id) ? `<span class="gp-chip red">${esc(t('petLocked'))}</span>` : c.id === id ? `<span class="gp-chip green">${esc(t('petTagWith'))}</span>` : '';
      return `<button type="button" class="pets-item${this.shown === id ? ' on' : ''}" data-pet="${id}" role="option" aria-selected="${this.shown === id}">
        <img alt="" data-face="${key}" src="${this.faces.get(key) ?? ''}" /><span><b>${esc(displayName(id, c))}</b><small>${esc(t(`petAbility_${id}` as StringKey))}</small></span>${tag}</button>`;
    }).join('');
    this.card.show(this.shown);
    const reqs = PET_IDS.map((id) => ({ id, cor: petLook(c, id).cor, coleira: petLook(c, id).coleira }));
    void petPortraits(reqs, 128).then((urls) => {
      reqs.forEach((r, i) => this.faces.set(`${r.id}|${r.cor}|${r.coleira}`, urls[i]));
      for (const img of this.root.querySelectorAll<HTMLImageElement>('[data-face]')) {
        const url = this.faces.get(img.dataset.face!);
        if (url && img.getAttribute('src') !== url) img.src = url;
      }
      const big = this.root.querySelector<HTMLImageElement>('.pets-portrait img')!;
      const look = petLook(this.hooks.choice(), this.shown);
      const url = this.faces.get(`${this.shown}|${look.cor}|${look.coleira}`);
      if (url) big.src = url;
    });
  }
}
