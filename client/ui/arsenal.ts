// Arsenal panel (pause menu and the home's tab), drawn as a tree (client/ui/arsenalTree.ts): one row per slot
// (primary, secondary, knife, grenade) with its weapons in order, a locked one saying how many points the weapon
// before it still needs. Clicking a weapon shows its panel under the row: level, points to the next one, the
// gun's stats as they are now and its upgrades as a chain in level order, each with a switch (on/off) or a lock
// with the points still missing. "Equip" puts an unlocked weapon in its slot. During a match with a locked
// loadout (mata-mata) it is read-only: weapons can be looked at, nothing can be changed until the next match.
import { getLang, t, type StringKey } from './strings';
import { gunStats } from '@shared/arsenal';
import { isGun, PROGRESSION, upgradeOf, type Efeitos, type GunId, type ProgWeapon, type Upgrade } from '@shared/progression';
import type { Progress } from '../gameplay/progress';
import { arsenalTree, upgradeNodes, type RowId, type TreeRow, type UpgradeNode, type WeaponNode } from './arsenalTree';

const ROW: Record<RowId, StringKey> = { primaria: 'treeRow_primaria', secundaria: 'treeRow_secundaria', faca: 'treeRow_faca', granada: 'treeRow_granada' };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
// Weapon and upgrade texts are keyed by their ids (client/tests/arsenalText.test.ts checks they all exist).
const str = (key: string, params?: Record<string, string | number>) => t(key as StringKey, params);

export const weaponName = (w: ProgWeapon) => str(`arma_${w}`);
export const upgradeName = (w: ProgWeapon, id: string) => str(`upg_${w}_${id}`);

/** The upgrade that changes what a weapon is (the knife's form, the grenade's mode), if one is active. */
const formOf = (w: ProgWeapon, active: readonly string[]): Upgrade | undefined =>
  active.map((id) => upgradeOf(w, id)).find((u) => u && (u.efeitos.forma || u.efeitos.tipo));

/** The name a weapon goes by (kill feed, banners): the lightsaber or the land mine rather than "knife" or "grenade". */
export function weaponLabel(w: ProgWeapon, active: readonly string[] = []): string {
  const f = formOf(w, active);
  return f ? upgradeName(w, f.id) : weaponName(w);
}

export function weaponIcon(w: ProgWeapon, active: readonly string[] = []): string {
  return formOf(w, active)?.icone ?? PROGRESSION[w].icone;
}

/** Effects where a lower number is the better one. */
const LOWER_IS_BETTER = new Set<keyof Efeitos>(['recarga', 'dispersao', 'mirando', 'recuo', 'adsTempo', 'troca', 'intervalo', 'recargaGranada']);
const ADDED = new Set<keyof Efeitos>(['pente', 'golpe', 'investida', 'granadas']);

const num = (n: number, digits = 1) => n.toLocaleString(getLang() === 'en' ? 'en' : 'pt-BR', { maximumFractionDigits: digits });

/** What an upgrade changes, as short labeled chips (good in green, the price in red). */
export function effectChips(fx: Efeitos): { text: string; good: boolean }[] {
  const out: { text: string; good: boolean }[] = [];
  for (const [k, v] of Object.entries(fx) as [keyof Efeitos, Efeitos[keyof Efeitos]][]) {
    if (k === 'mira' || k === 'visual') continue;
    if (k === 'silenciador') out.push({ text: t('fx_silenciador'), good: true });
    else if (k === 'forma') out.push({ text: str(`fx_forma_${v}`), good: false });
    else if (k === 'tipo') out.push({ text: str(`fx_tipo_${v}`), good: true });
    else if (k === 'zoom') out.push({ text: t('fx_zoom', { v: num(1 / (v as number)) }), good: true });
    else if (ADDED.has(k)) out.push({ text: str(`fx_${k}`, { v: `+${num(v as number)}` }), good: true });
    else {
      const pct = Math.round(((v as number) - 1) * 100);
      if (!pct) continue;
      out.push({ text: str(`fx_${k}`, { v: `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%` }), good: pct > 0 !== LOWER_IS_BETTER.has(k) });
    }
  }
  return out;
}

export class Arsenal {
  /** The weapon shown under each row (clicked), null = the one in the player's hands. */
  private viewed: Partial<Record<RowId, ProgWeapon>> = {};
  /** Upgrade whose description is shown per weapon (hovered or focused), null = the weapon's own. */
  private preview: Partial<Record<ProgWeapon, string | null>> = {};

  /**
   * `grid`: where the tree goes (the pause menu's, or the home's Arsenal tab); `onChange`: the loadout changed;
   * `readOnly`: shown but not editable (a match with a locked loadout).
   */
  constructor(
    private progress: Progress,
    private onChange: () => void,
    private grid: HTMLElement,
    private readOnly = false,
  ) {
    this.grid.classList.add('arsenal-tree');
    this.grid.classList.toggle('read-only', readOnly);
    this.grid.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      // Looking at a weapon changes nothing: it works read-only too.
      const view = el.closest<HTMLButtonElement>('[data-view]');
      if (view) {
        this.viewed[view.dataset.row as RowId] = view.dataset.view as ProgWeapon;
        this.render();
        return;
      }
      if (this.readOnly) return;
      const toggle = el.closest<HTMLButtonElement>('[data-toggle]');
      if (toggle && !toggle.disabled) {
        if (this.progress.toggle(toggle.dataset.w as ProgWeapon, toggle.dataset.id!, toggle.getAttribute('aria-pressed') !== 'true')) this.onChange();
        return;
      }
      const equip = el.closest<HTMLButtonElement>('[data-equip]');
      if (equip && this.progress.setSecondary(equip.dataset.equip as GunId)) this.onChange();
    });
    const hover = (e: Event) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.upg');
      if (!row) return;
      const w = row.dataset.w as ProgWeapon;
      if (this.preview[w] === row.dataset.id) return;
      this.preview[w] = row.dataset.id!;
      this.renderDetail(w);
    };
    this.grid.addEventListener('mouseover', hover);
    this.grid.addEventListener('focusin', hover);
    this.grid.addEventListener('mouseleave', () => {
      for (const w of Object.keys(this.preview) as ProgWeapon[]) {
        if (!this.preview[w]) continue;
        this.preview[w] = null;
        this.renderDetail(w);
      }
    });
    progress.onChange(() => this.render());
    this.render();
  }

  render() {
    // Keep the focus where it was (a controller or the keyboard moving through the tree).
    const focused = document.activeElement as HTMLElement | null;
    const key = focused && this.grid.contains(focused) ? focused.dataset.key : undefined;
    this.grid.innerHTML = arsenalTree(this.progress.weaponXp, this.progress.choice)
      .map((r) => this.row(r))
      .join('');
    if (key) this.grid.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus();
  }

  /** The weapon shown under a row: the one clicked, else the one in hand, else the first. */
  private shown(r: TreeRow): WeaponNode {
    return r.armas.find((n) => n.arma === this.viewed[r.id]) ?? r.armas.find((n) => n.equipada) ?? r.armas[0];
  }

  private row(r: TreeRow): string {
    const shown = this.shown(r);
    const weapons = r.armas.map((n, i) => `${i ? '<span class="tree-link" aria-hidden="true"></span>' : ''}${this.weaponButton(r.id, n, n === shown)}`).join('');
    return `<section class="tree-row" data-row="${r.id}">
      <h4 class="tree-slot">${t(ROW[r.id])}</h4>
      <div class="tree-weapons">${weapons}</div>
      ${this.panel(shown)}
    </section>`;
  }

  private weaponButton(row: RowId, n: WeaponNode, shown: boolean): string {
    const sub = !n.liberada
      ? `🔒 ${t('treeWeaponLocked', { xp: num(n.faltamLiberar, 0), weapon: weaponName(n.liberaCom!) })}`
      : n.equipada
        ? `✓ ${t('treeEquipped')}`
        : `${t('level')} ${n.nivel}/${n.max}`;
    const cls = `tree-weapon${shown ? ' shown' : ''}${n.equipada ? ' equipped' : ''}${n.liberada ? '' : ' locked'}`;
    return `<button type="button" class="${cls}" data-view="${n.arma}" data-row="${row}" data-key="view-${n.arma}" aria-pressed="${shown}">
      <span class="tw-icon">${weaponIcon(n.arma, n.ativas)}</span>
      <span class="tw-text"><span class="tw-name">${esc(weaponName(n.arma))}</span><span class="tw-sub">${esc(sub)}</span></span>
    </button>`;
  }

  /** The panel of the weapon shown in a row: its level, how to get it, its stats and its upgrade chain. */
  private panel(n: WeaponNode): string {
    const w = n.arma;
    let action = '';
    if (!n.liberada) action = `<div class="tree-lock">🔒 ${esc(t('treeWeaponLockedLong', { xp: num(n.faltamLiberar, 0), weapon: weaponName(n.liberaCom!), level: n.liberaNivel }))}</div>`;
    else if (n.equipada) action = `<div class="tree-in-hand">✓ ${t('treeEquipped')}</div>`;
    else if (!this.readOnly) action = `<button type="button" class="tree-equip" data-equip="${w}" data-key="equip-${w}">${t('treeEquip')}</button>`;
    const xpText = n.faltamNivel === null ? t('maxLevel', { xp: num(n.xp, 0) }) : t('xpToNext', { xp: num(n.faltamNivel, 0), level: n.nivel + 1 });
    const chain = upgradeNodes(w, this.progress.weaponXp, this.progress.choice)
      .map((u) => this.upgrade(w, u))
      .join('');
    return `<div class="tree-panel${n.liberada ? '' : ' locked'}" data-w="${w}">
      <div class="arsenal-head"><span class="arsenal-icon">${weaponIcon(w, n.ativas)}</span><div class="tree-title">
        <div class="arsenal-weapon">${t('level')} ${n.nivel}/${n.max}</div>
        <div class="arsenal-name">${esc(weaponName(w))}</div></div>${action}</div>
      <div class="xp-bar"><div class="xp-fill" style="width:${(n.progresso * 100).toFixed(1)}%"></div></div>
      <div class="xp-text">${esc(xpText)}</div>
      ${isGun(w) ? this.stats(w, n.ativas) : ''}
      <ol class="upgrades tree-upgrades">${chain}</ol>
      <div class="upg-detail">${this.detail(w)}</div>
    </div>`;
  }

  /** The gun's stats with the upgrades in effect, as bars. */
  private stats(w: GunId, active: string[]): string {
    const g = gunStats(w, active);
    const clamp = (x: number) => Math.max(0.06, Math.min(1, x));
    const bars: [StringKey, number][] = [
      ['statDamage', g.dano.max / 40],
      ['statRate', g.cadencia / 1100],
      ['statAccuracy', 1 - g.dispersao.parado / 1.6 - g.dispersao.mirando],
      ['statRange', g.dano.distMin / 60],
      ['statMobility', (g.movimento - 0.85) / 0.3],
    ];
    return `<div class="gun-stats">${bars
      .map(([k, v]) => `<span>${t(k)}</span><div class="stat-bar"><div style="width:${(clamp(v) * 100).toFixed(0)}%"></div></div>`)
      .join('')}<small>${t('statMag', { mag: g.pente, reserve: g.reserva })}</small></div>`;
  }

  /** One link of the upgrade chain: locked (with the points missing) or a switch. */
  private upgrade(w: ProgWeapon, n: UpgradeNode): string {
    const u = upgradeOf(w, n.id)!;
    let state: string;
    if (n.estado === 'trancada') {
      state = `<span class="upg-state" title="${esc(t('unlockAt', { xp: num(n.faltam, 0) }))}">🔒 ${t('unlockShort', { xp: num(n.faltam, 0) })}</span>`;
    } else {
      const on = n.estado === 'ligada';
      state = `<button type="button" class="upg-toggle" data-toggle data-w="${w}" data-id="${u.id}" data-key="${w}-${u.id}" aria-pressed="${on}"${this.readOnly ? ' disabled' : ''}>${t(on ? 'upgradeOn' : 'upgradeOff')}</button>`;
    }
    const cls = n.estado === 'trancada' ? 'locked' : n.estado === 'ligada' ? 'on' : 'off';
    const chips = effectChips(u.efeitos)
      .map((c) => `<span class="fx ${c.good ? 'good' : 'bad'}">${esc(c.text)}</span>`)
      .join('');
    const replaced = n.substituidaPor ? `<span class="fx opt">${esc(t('upgradeReplacedBy', { upgrade: upgradeName(w, n.substituidaPor) }))}</span>` : '';
    return `<li class="upg tree-node ${cls}" data-w="${w}" data-id="${u.id}">
      <div class="upg-top"><span class="upg-icon">${u.icone}</span><span class="upg-lvl">${u.nivel}</span><span class="upg-name">${esc(upgradeName(w, u.id))}</span></div>
      <div class="upg-switch">${state}</div>
      <div class="upg-fx">${u.opcional ? `<span class="fx opt">${t('upgradeOptional')}</span>` : ''}${replaced}${chips}</div>
    </li>`;
  }

  private detail(w: ProgWeapon): string {
    const id = this.preview[w];
    if (!id) return esc(str(`armaDesc_${w}`));
    const u = upgradeOf(w, id)!;
    return `<b>${u.icone} ${esc(upgradeName(w, id))}</b><br>${esc(str(`upgDesc_${w}_${id}`))}`;
  }

  private renderDetail(w: ProgWeapon) {
    const el = this.grid.querySelector(`.tree-panel[data-w="${w}"] .upg-detail`);
    if (el) el.innerHTML = this.detail(w);
  }
}
