// The Arsenal tab of the pause menu (PF-11): the four slots in use (primary, secondary, knife, grenade) on the left
// and the picked slot's card: icon, slot and level, name, the points to the next level, the description, the gun's
// stats as they are now, the unlocked upgrades of its progression (on or off) and how many are still locked. In a
// match it shows what is in the player's hands, read-only (the loadout is locked; an upgrade unlocked meanwhile
// "applies next match"). On the shooting range it also lists the slot's unlocked weapons with Equipar and the
// upgrades switch on and off, saved to the account like the home's Arsenal and in the hands at once.
// Also the names, icons, stats and effect chips every Arsenal view shares (the home's canvas, the HUD, the kill
// feed).
import { getLang, t, type StringKey } from './strings';
import { gunStats, knifeOf, type Loadout } from '@shared/arsenal';
import { GUN_DATA_ID, isGun, isKnife, levelCount, progOf, PROGRESSION, upgradeOf, type Efeitos, type GunId, type Levels, type ProgWeapon, type Upgrade, type WeaponId } from '@shared/progression';
import { MELEE, WEAPONS } from '@shared/weapons';
import type { Progress } from '../gameplay/progress';
import { TREE_ROWS, weaponNode, type RowId } from './arsenalTree';
import { moreUpgradesText } from './pauseMenu';

const ROW: Record<RowId, StringKey> = { primaria: 'treeRow_primaria', secundaria: 'treeRow_secundaria', faca: 'treeRow_faca', granada: 'treeRow_granada' };

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
// Weapon and upgrade texts are keyed by their ids (client/tests/arsenalText.test.ts checks they all exist).
const str = (key: string, params?: Record<string, string | number>) => t(key as StringKey, params);

export const weaponName = (w: WeaponId) => str(`arma_${w}`);
export const upgradeName = (w: ProgWeapon, id: string) => str(`upg_${w}_${id}`);
/** A progression's short name, for "N points of rifle" (prog_<id>). */
export const progName = (w: ProgWeapon) => str(`prog_${w}`);

/** The upgrade that changes what the grenade does (the land mine, the double), if one is active. */
const formOf = (w: WeaponId, active: readonly string[]): Upgrade | undefined =>
  w === 'granada' ? active.map((id) => upgradeOf('granada', id)).find((u) => u?.efeitos.tipo) : undefined;

/** The name a weapon goes by (kill feed, banners): the land mine rather than "grenade". */
export function weaponLabel(w: WeaponId, active: readonly string[] = []): string {
  const f = formOf(w, active);
  return f ? upgradeName('granada', f.id) : weaponName(w);
}

export function weaponIcon(w: WeaponId, active: readonly string[] = []): string {
  const own = isGun(w) ? WEAPONS[GUN_DATA_ID[w]].icone : isKnife(w) ? MELEE[w].icone : undefined;
  return formOf(w, active)?.icone ?? own ?? PROGRESSION[progOf(w)].icone;
}

/** A gun's stats with the upgrades in effect, each 0.06 to 1 for a bar, and its "magazine / reserve" line. */
export function gunStatBars(w: GunId, active: readonly string[]): { bars: [StringKey, number][]; mag: string } {
  const g = gunStats(w, [...active]);
  const clamp = (x: number) => Math.max(0.06, Math.min(1, x));
  const bars: [StringKey, number][] = [
    ['statDamage', g.dano.max / 40],
    ['statRate', g.cadencia / 1100],
    ['statAccuracy', 1 - g.dispersao.parado / 1.6 - g.dispersao.mirando],
    ['statRange', g.dano.distMin / 60],
    ['statMobility', (g.movimento - 0.85) / 0.3],
  ];
  return { bars: bars.map(([k, v]) => [k, clamp(v)]), mag: t('statMag', { mag: g.pente, reserve: g.reserva }) };
}

/** Effects where a lower number is the better one. */
const LOWER_IS_BETTER = new Set<keyof Efeitos>(['recarga', 'dispersao', 'mirando', 'recuo', 'adsTempo', 'troca', 'intervalo', 'recargaGranada']);
const ADDED = new Set<keyof Efeitos>(['pente', 'golpe', 'investida', 'granadas']);

export const num = (n: number, digits = 1) => n.toLocaleString(getLang() === 'en' ? 'en' : 'pt-BR', { maximumFractionDigits: digits });

/** What an upgrade changes, as short labeled chips (good in green, the price in red). */
export function effectChips(fx: Efeitos): { text: string; good: boolean }[] {
  const out: { text: string; good: boolean }[] = [];
  for (const [k, v] of Object.entries(fx) as [keyof Efeitos, Efeitos[keyof Efeitos]][]) {
    if (k === 'mira') continue;
    if (k === 'silenciador') out.push({ text: t('fx_silenciador'), good: true });
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

/** The weapon a loadout has in a slot (null: none there). */
function inSlot(lo: Loadout, slot: RowId): WeaponId | null {
  return slot === 'primaria' ? lo.primaria : slot === 'secundaria' ? lo.secundaria : slot === 'faca' ? knifeOf(lo) : 'granada';
}

export interface ArsenalPanelOptions {
  /** The shooting range: weapons and upgrades change here (saved to the account), in the hands at once. */
  editable: boolean;
  /** What the player holds in the match (its loadout, locked as it began). */
  inUse: () => Loadout;
  /** The levels the match began with: what unlocked after them waits for the next match. */
  startLevels: Levels;
  /** The range changed the loadout (put it in the hands). */
  onChange: () => void;
}

export class ArsenalPanel {
  private slot: RowId = 'primaria';

  constructor(
    private progress: Progress,
    private el: HTMLElement,
    private opts: ArsenalPanelOptions,
  ) {
    el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const pick = target.closest<HTMLElement>('[data-slot]');
      if (pick) {
        this.slot = pick.dataset.slot as RowId;
        this.render();
        return;
      }
      if (!this.opts.editable) return;
      const toggle = target.closest<HTMLElement>('[data-toggle]');
      if (toggle) {
        if (this.progress.toggle(toggle.dataset.w as ProgWeapon, toggle.dataset.id!, toggle.getAttribute('aria-pressed') !== 'true')) this.opts.onChange();
        return;
      }
      const equip = target.closest<HTMLElement>('[data-equip]');
      if (equip && this.equip(equip.dataset.equip as WeaponId)) this.opts.onChange();
    });
    progress.onChange(() => this.render());
  }

  /** Puts `w` in the picked slot (the grenade has nothing to choose). */
  private equip(w: WeaponId): boolean {
    if (this.slot === 'primaria' && isGun(w)) return this.progress.setPrimary(w);
    if (this.slot === 'secundaria' && isGun(w)) return this.progress.setSecondary(w);
    if (this.slot === 'faca' && isKnife(w)) return this.progress.setKnife(w);
    return false;
  }

  /** The loadout shown: the range's choice as it is now, a match's locked one. */
  private get loadout(): Loadout {
    return this.opts.editable ? this.progress.loadout : this.opts.inUse();
  }

  render() {
    // Keep the focus where it was (a controller or the keyboard moving through the panel).
    const focused = document.activeElement as HTMLElement | null;
    const key = focused && this.el.contains(focused) ? focused.dataset.key : undefined;
    const lo = this.loadout;
    const slots = TREE_ROWS.map((r) => r.id).filter((s) => inSlot(lo, s));
    if (!slots.includes(this.slot)) this.slot = slots[0];
    const list = slots.map((s) => this.slotButton(s, inSlot(lo, s)!, lo)).join('');
    this.el.innerHTML = `<div class="pa"><div class="pa-slots">${list}</div>${this.card(inSlot(lo, this.slot)!, lo)}</div>`;
    if (key) this.el.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus();
  }

  private level(w: WeaponId): string {
    const n = weaponNode(w, this.progress.weaponXp, this.progress.choice);
    return `${t('level')} ${n.nivel}/${n.max}`;
  }

  private slotButton(s: RowId, w: WeaponId, lo: Loadout): string {
    const active = lo.ativas[progOf(w)];
    return `<button type="button" class="pa-slot${s === this.slot ? ' sel' : ''}" data-slot="${s}" data-key="slot-${s}" aria-pressed="${s === this.slot}">
      <span class="pa-slot-icon">${weaponIcon(w, active)}</span>
      <span class="pa-slot-text"><span class="pa-slot-kind">${esc(t(ROW[s]))}</span><span class="pa-slot-name">${esc(weaponLabel(w, active))}</span><span class="pa-slot-lvl">${esc(this.level(w))}</span></span>
    </button>`;
  }

  /** The picked slot's card. */
  private card(w: WeaponId, lo: Loadout): string {
    const prog = progOf(w);
    const active = lo.ativas[prog];
    const n = weaponNode(w, this.progress.weaponXp, this.progress.choice);
    const xpText = n.faltamNivel === null ? t('maxLevel', { xp: num(n.xp, 0) }) : t('xpToNext', { xp: num(n.faltamNivel, 0), level: n.nivel + 1 });
    const ups = PROGRESSION[prog].melhorias.filter((u) => u.nivel <= n.nivel);
    const more = moreUpgradesText(prog, n.xp);
    return `<div class="pa-card">
      <div class="pa-head"><span class="pa-icon">${weaponIcon(w, active)}</span>
        <div class="pa-title"><div class="pa-kicker">${esc(`${t(ROW[this.slot])} · ${this.level(w)}`)}</div><div class="pa-name">${esc(weaponLabel(w, active))}</div></div>
        <span class="pa-equipped">✓ ${esc(t('treeEquipped'))}</span></div>
      <div class="pa-xp"><div class="xp-bar"><div class="xp-fill" style="width:${(n.progresso * 100).toFixed(1)}%"></div></div><div>${esc(xpText)}</div></div>
      <div class="pa-desc">${esc(str(`armaDesc_${w}`))}</div>
      ${isGun(w) ? this.stats(w, active) : ''}
      <div class="pa-section">${esc(t('pmUpgradesUnlocked'))}</div>
      <div class="pa-list">${ups.length ? ups.map((u) => this.upgrade(prog, u, active)).join('') : `<div class="pa-none">${esc(t('pmNoUpgrades'))}</div>`}</div>
      ${more ? `<div class="pa-locked">${esc(more)}</div>` : ''}
      ${this.opts.editable && this.slot !== 'granada' ? this.weapons(w) : ''}
    </div>`;
  }

  /** The gun's stats with the upgrades in effect, as bars two by two, and the magazine line. */
  private stats(w: GunId, active: readonly string[]): string {
    const { bars, mag } = gunStatBars(w, active);
    return `<div class="pa-stats">${bars
      .map(([k, v]) => `<span>${esc(t(k))}</span><div class="pa-bar"><div style="width:${(v * 100).toFixed(0)}%"></div></div>`)
      .join('')}<small>${esc(mag)}</small></div>`;
  }

  /** One unlocked upgrade: on or off (a switch on the range), what it changes, what replaces it. */
  private upgrade(prog: ProgWeapon, u: Upgrade, active: readonly string[]): string {
    const on = active.includes(u.id);
    const all = PROGRESSION[prog].melhorias;
    const by = !u.opcional && u.grupo ? all.find((o) => o.opcional && o.grupo === u.grupo && active.includes(o.id)) : undefined;
    // Unlocked during the match: it waits for the next one (the loadout is locked).
    const later = !this.opts.editable && u.nivel > this.opts.startLevels[prog];
    const chips = [
      ...(by ? [`<span class="fx opt">${esc(t('upgradeReplacedBy', { upgrade: upgradeName(prog, by.id) }))}</span>`] : []),
      ...(later ? [`<span class="fx opt">${esc(t('pmNextMatch'))}</span>`] : []),
      ...(u.opcional ? [`<span class="fx opt">${esc(t('upgradeOptional'))}</span>`] : []),
      ...effectChips(u.efeitos).map((c) => `<span class="fx ${c.good ? 'good' : 'bad'}">${esc(c.text)}</span>`),
    ].join('');
    const label = esc(t(on ? 'upgradeOn' : 'upgradeOff'));
    const state = this.opts.editable
      ? `<button type="button" class="pa-state${on ? ' on' : ''}" data-toggle data-w="${prog}" data-id="${u.id}" data-key="upg-${prog}-${u.id}" aria-pressed="${on}">${label}</button>`
      : `<span class="pa-state${on ? ' on' : ''}">${label}</span>`;
    return `<div class="pa-upg${on ? ' on' : ''}">
      <span class="pa-upg-icon">${u.icone}</span><span class="pa-upg-lvl">${u.nivel}</span>
      <div class="pa-upg-main"><span class="pa-upg-name">${esc(upgradeName(prog, u.id))}</span><div class="pa-chips">${chips}</div></div>${state}
    </div>`;
  }

  /** The range only: the slot's unlocked weapons, each with Equipar (the one in hand marked). */
  private weapons(held: WeaponId): string {
    const row = TREE_ROWS.find((r) => r.id === this.slot)!;
    const rows = row.armas
      .filter((w) => this.progress.unlocked(w))
      .map((w) => {
        const prog = progOf(w);
        const action =
          w === held
            ? `<span class="pa-state on">✓ ${esc(t('treeEquipped'))}</span>`
            : `<button type="button" class="pa-state" data-equip="${w}" data-key="equip-${w}">${esc(t('treeEquip'))}</button>`;
        return `<div class="pa-upg pa-weapon${w === held ? ' on' : ''}">
          <span class="pa-upg-icon">${weaponIcon(w, this.progress.loadout.ativas[prog])}</span>
          <div class="pa-upg-main"><span class="pa-upg-name">${esc(weaponName(w))}</span><span class="pa-weapon-lvl">${esc(`${t('level')} ${this.progress.level(prog)}/${levelCount(prog)}`)}</span></div>${action}
        </div>`;
      })
      .join('');
    return `<div class="pa-section">${esc(t('pmWeaponsUnlocked'))}</div><div class="pa-list">${rows}</div>`;
  }
}
