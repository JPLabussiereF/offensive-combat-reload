// The Galpão's Arsenal station: the weapons hang on a pegboard (client/ui/galpao/scene.ts builds them), each with a
// tag pinned under it (level, equipped or locked, the bar to the next level or to unlocking) and, for the weapon
// clicked, an inspection card next to it: equip, progress, stats, a knife's passive, description and every upgrade
// of its progression with its switch. The land mine hangs beside the grenade as the grenade's mine upgrade.
// The data is the Arsenal tree's (client/ui/arsenalTree.ts) and saving is Progress's, as in the classic home's
// canvas (client/ui/arsenalCanvas.ts): same rules, another look.
import { isGun, isKnife, KNIVES, PRIMARIES, progOf, SECONDARIES, upgradeOf, type WeaponId } from '@shared/progression';
import type { Progress } from '../../gameplay/progress';
import { esc, num, passiveText, progName, upgradeName, weaponName, weaponStatBars } from '../arsenal';
import { upgradeNodes, weaponNode, type RowId } from '../arsenalTree';
import { t, type StringKey } from '../strings';

const str = (key: string, params?: Record<string, string | number>) => t(key as StringKey, params);

/** The board's sections, in the scene's order: the guns and knives in unlock order, the grenade and its mine. */
export const BOARD: Record<RowId, readonly string[]> = { primaria: PRIMARIES, secundaria: SECONDARIES, faca: KNIVES, granada: ['granada', 'mina'] };
const ROW_OF = new Map<string, RowId>(Object.entries(BOARD).flatMap(([row, ids]) => ids.map((id) => [id, row as RowId] as const)));
/** The mine is a prop for the grenade's `mina` upgrade: picking it opens the grenade's card. */
export const cardWeapon = (id: string): WeaponId => (id === 'mina' ? 'granada' : (id as WeaponId));

const GREEN = '#3f8a4a';
const RED = '#9b2a21';
const GREY = '#9a917e';

export class ArsenalBoard {
  private progress: Progress | null = null;
  private sel: WeaponId | null = null;
  private hover: string | null = null;
  private zoomed = false;
  /** One button per board id, made once (the scene keeps pinning these same elements). */
  readonly tags = new Map<string, HTMLButtonElement>();

  constructor(
    tagsRoot: HTMLElement,
    private card: HTMLElement,
    private onPick: (id: string | null) => void,
  ) {
    for (const id of ROW_OF.keys()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gp-tag';
      b.onclick = () => onPick(id);
      b.onpointerenter = () => this.setHover(id);
      b.onpointerleave = () => this.setHover(null);
      b.onfocus = () => this.setHover(id);
      b.onblur = () => this.setHover(null);
      tagsRoot.appendChild(b);
      this.tags.set(id, b);
    }
    card.addEventListener('click', (e) => this.onCardClick(e));
  }

  setProgress(p: Progress | null) {
    this.progress = p;
    p?.onChange(() => this.render());
    this.render();
  }

  /** The weapon whose card is open (null: none). */
  get selected(): WeaponId | null {
    return this.sel;
  }

  select(id: string | null) {
    this.sel = id ? cardWeapon(id) : null;
    this.render();
  }

  /** Close enough to the board for every tag to show its name. */
  setZoom(full: boolean) {
    if (full === this.zoomed) return;
    this.zoomed = full;
    this.renderTags();
  }

  private setHover(id: string | null) {
    if (id === this.hover) return;
    this.hover = id;
    this.renderTags();
  }

  render() {
    this.renderTags();
    this.renderCard();
  }

  private renderTags() {
    const p = this.progress;
    for (const [id, b] of this.tags) {
      if (!p) {
        b.innerHTML = '';
        continue;
      }
      const w = cardWeapon(id);
      const n = weaponNode(w, p.weaponXp, p.choice);
      let level: string;
      let dot: string;
      let pct: number;
      let locked: boolean;
      let name: string;
      if (id === 'mina') {
        const u = upgradeNodes('granada', p.weaponXp, p.choice).find((x) => x.id === 'mina');
        locked = !u || u.estado === 'trancada';
        const on = u?.estado === 'ligada';
        level = locked ? t('gpTagLocked') : t(on ? 'gpTagOn' : 'gpTagOff');
        dot = locked ? RED : on ? GREEN : GREY;
        pct = locked && u ? Math.min(1, n.xp / (n.xp + u.faltam)) : 1;
        name = upgradeName('granada', 'mina');
      } else {
        locked = !n.liberada;
        level = locked ? t('gpTagLocked') : t('gpTagLevel', { level: n.nivel });
        dot = locked ? RED : n.equipada ? GREEN : GREY;
        pct = locked ? Math.min(1, 1 - n.faltamLiberar / Math.max(1, n.liberaPontos)) : n.progresso;
        name = weaponName(w);
      }
      const open = this.sel === w && (id !== 'mina' || this.sel === 'granada');
      const full = this.zoomed || open || this.hover === id;
      b.classList.toggle('full', full);
      b.classList.toggle('locked', locked);
      b.classList.toggle('sel', open);
      b.setAttribute('aria-label', `${name} · ${level}`);
      b.innerHTML = full
        ? `<span class="gp-tag-line"><i style="background:${dot}"></i><b>${esc(name)}</b><small>${esc(level)}</small></span><span class="gp-tag-bar"><span style="width:${Math.round(pct * 100)}%"></span></span>`
        : `<i style="background:${dot}"></i>${esc(level)}`;
    }
  }

  private renderCard() {
    const p = this.progress;
    const w = this.sel;
    if (!p || !w) {
      this.card.innerHTML = '';
      return;
    }
    const row = ROW_OF.get(w)!;
    const n = weaponNode(w, p.weaponXp, p.choice);
    const prog = n.prog;
    const ups = upgradeNodes(w, p.weaponXp, p.choice);
    let state: string;
    if (!n.liberada) state = `<span class="gp-chip dark">${esc(t('gpLockedChip'))}</span>`;
    else if (n.equipada) state = `<span class="gp-chip green">✓ ${esc(t(row === 'secundaria' ? 'cvYourSecondary' : row === 'granada' ? 'cvAlwaysEquipped' : 'treeEquipped'))}</span>`;
    else state = `<button type="button" class="gp-equip" data-equip>${esc(t(row === 'secundaria' ? 'cvEquipSecondary' : 'treeEquip'))}</button>`;
    // A weapon that shares its progression (an old rifle, a newer secondary, every knife) says whose points it uses.
    const status = !n.liberada
      ? t('treeWeaponLockedLong', { xp: num(n.faltamLiberar, 0), total: num(n.liberaPontos, 0), prog: progName(n.liberaCom!) })
      : prog !== w && prog !== 'granada'
        ? t('gpSharesProg', { prog: progName(prog) })
        : '';
    const xpLine = n.faltamNivel === null ? t('maxLevel', { xp: num(n.xp, 0) }) : t('xpToNext', { xp: num(n.faltamNivel, 0), level: n.nivel + 1 });
    const stats = weaponStatBars(w, n.ativas);
    const statsHtml = stats
      ? `<div class="gp-stats">${stats.bars.map(([k, v]) => `<span>${esc(t(k))}</span><i><b style="width:${Math.round(v * 100)}%"></b></i>`).join('')}</div>${stats.mag ? `<small class="gp-mono">${esc(stats.mag)}</small>` : ''}`
      : '';
    const passive = isKnife(w) ? passiveText(w) : null;
    const upRows = ups
      .map((u) => {
        const locked = u.estado === 'trancada' || !n.liberada;
        const on = !locked && u.estado === 'ligada';
        const note = locked
          ? t('treeWeaponLocked', { xp: num(u.faltam, 0), prog: progName(prog) })
          : u.substituidaPor
            ? t('upgradeReplacedBy', { upgrade: upgradeName(prog, u.substituidaPor) })
            : u.opcional
              ? t('upgradeOptional')
              : t('gpAutoOn');
        const icon = upgradeOf(prog, u.id)?.icone ?? '';
        const label = locked ? t('gpTagLocked') : t(on ? 'upgradeOn' : 'upgradeOff');
        return `<div class="gp-up${locked ? ' locked' : ''}">
          <span class="gp-mono">${esc(t('gpTagLevel', { level: u.nivel }))}</span>
          <span class="gp-up-name"><b>${icon} ${esc(upgradeName(prog, u.id))}</b><small>${esc(note)}</small></span>
          <button type="button" class="gp-switch${on ? ' on' : ''}" data-toggle="${esc(u.id)}" aria-pressed="${on}" ${locked ? 'disabled' : ''}>${esc(label)}</button>
        </div>`;
      })
      .join('');
    this.card.innerHTML = `
      <div class="gp-card-head">
        <span><small class="gp-kicker">${esc(str(`cvSlot_${row}`))} · ${esc(t('level'))} ${n.nivel}/${n.max}</small><b>${esc(weaponName(w))}</b></span>
        <button type="button" class="gp-close" data-close data-pad-back title="${esc(t('cvClose'))}">✕</button>
      </div>
      <div class="gp-card-state">${state}${status ? `<span>${esc(status)}</span>` : ''}</div>
      <div class="gp-card-xp"><i><b style="width:${(n.progresso * 100).toFixed(1)}%"></b></i><small class="gp-mono">${esc(xpLine)}</small></div>
      <p>${esc(str(`armaDesc_${w}`))}</p>
      ${passive ? `<div class="gp-passive"><b>${esc(t('knifePassive', { name: passive.name }))}.</b> ${esc(passive.desc)}</div>` : ''}
      ${statsHtml}
      <div class="gp-ups"><small class="gp-kicker">${esc(t('gpUpgradesOf', { prog: progName(prog) }))}</small>${upRows}</div>`;
  }

  private onCardClick(e: MouseEvent) {
    const el = e.target as HTMLElement;
    const p = this.progress;
    const w = this.sel;
    if (el.closest('[data-close]')) return this.onPick(null);
    if (!p || !w) return;
    const toggle = el.closest<HTMLButtonElement>('[data-toggle]');
    if (toggle) {
      p.toggle(progOf(w), toggle.dataset.toggle!, toggle.getAttribute('aria-pressed') !== 'true');
      return;
    }
    if (el.closest('[data-equip]')) {
      const row = ROW_OF.get(w);
      if (row === 'primaria' && isGun(w)) p.setPrimary(w);
      else if (row === 'secundaria' && isGun(w)) p.setSecondary(w);
      else if (row === 'faca' && isKnife(w)) p.setKnife(w);
    }
  }
}
