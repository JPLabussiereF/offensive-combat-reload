// The Galpão's 07 · PETS station (PF-29), in the mold of the Arsenal's board (arsenalBoard.ts): a DOM tag under each
// hook of the collar rack (the pet's name; green "COM VOCÊ" for the one taken along, whose hook is empty; red "APOIO"
// with how to unlock it for a support-pack pet, none for now), at least 44 px to touch and reachable with a
// controller, and the card of the pet called in (client/ui/pets.ts PetCard, the classic tab's too), on the right of
// the screen, clear of the pet on the doormat. Calling a pet in is only looking: "Levar este" takes it along.
import { PET_IDS, petAllowed, type PetChoice, type PetId } from '@shared/pets';
import { displayName, PetCard, type PetCardHooks } from '../pets';
import { t } from '../strings';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export class PetBoard {
  /** One button per hook (the scene's PetStage keeps them under their hooks). */
  readonly tags = new Map<PetId, HTMLButtonElement>();
  private readonly card: PetCard;

  constructor(
    tagsRoot: HTMLElement,
    cardRoot: HTMLElement,
    private hooks: PetCardHooks,
    /** A tag clicked: that pet is called in (the stage) and its card opens. */
    private onCall: (id: PetId) => void,
  ) {
    for (const id of PET_IDS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gp-tag gp-pettag';
      b.onclick = () => this.onCall(id);
      tagsRoot.appendChild(b);
      this.tags.set(id, b);
    }
    // (on a phone and in portrait the tags are hidden: the card's row of faces calls a pet in)
    this.card = new PetCard(cardRoot, hooks, (id) => this.onCall(id));
  }

  /** The pet whose card is open (the one on the mat). */
  show(id: PetId | null) {
    this.card.show(id);
    this.renderTags();
  }

  get shown() {
    return this.card.shown;
  }

  /** Again from the account's choice (it changed). */
  render() {
    this.card.render();
    this.renderTags();
  }

  private renderTags() {
    const c: PetChoice = this.hooks.choice();
    for (const [id, b] of this.tags) {
      const locked = !petAllowed(id);
      const along = c.id === id;
      const state = locked ? t('petLocked') : along ? t('petTagWith') : '';
      b.classList.toggle('locked', locked);
      b.classList.toggle('along', along);
      b.classList.toggle('sel', this.card.shown === id);
      b.setAttribute('aria-pressed', String(this.card.shown === id));
      const name = displayName(id, c);
      b.setAttribute('aria-label', state ? `${name} · ${state}` : name);
      b.innerHTML = `<span class="gp-tag-line"><i></i><b>${esc(name)}</b></span>${state ? `<small>${esc(state)}</small>` : ''}`;
    }
  }
}
