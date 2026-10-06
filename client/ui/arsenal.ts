// Arsenal panel (pause menu and the home's tab): a card per weapon (the primary, every secondary, the knife and
// the grenade) with its level, the points toward the next one, the gun's stats as they are now, and every
// upgrade: locked (with the points it needs), active, or — the optional ones, which have a trade-off — a switch
// to turn it on or off. A secondary's card also puts it in the secondary slot.
import { getLang, t, type StringKey } from './strings';
import { gunStats } from '@shared/arsenal';
import { isGun, levelCount, PROG_WEAPONS, PROGRESSION, SECONDARIES, upgradeOf, xpForLevel, type Efeitos, type GunId, type ProgWeapon, type Upgrade } from '@shared/progression';
import type { Progress } from '../gameplay/progress';

const SLOT: Record<ProgWeapon, StringKey> = { rifle: 'slotPrimary', pistola: 'slotSecondary', smg: 'slotSecondary', faca: 'slotMelee', granada: 'slotThrow' };

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
  /** Upgrade whose description is shown per weapon (hovered or focused), null = the weapon's own. */
  private preview: Partial<Record<ProgWeapon, string | null>> = {};

  /** `grid`: where the cards go (the pause menu's, or the home's Arsenal tab); `onChange`: the loadout changed. */
  constructor(
    private progress: Progress,
    private onChange: () => void,
    private grid: HTMLElement,
  ) {
    this.grid.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const toggle = el.closest<HTMLButtonElement>('[data-toggle]');
      if (toggle && !toggle.disabled) {
        if (this.progress.toggle(toggle.dataset.w as ProgWeapon, toggle.dataset.id!, toggle.getAttribute('aria-pressed') !== 'true')) this.onChange();
        return;
      }
      const take = el.closest<HTMLButtonElement>('[data-secondary]');
      if (take && this.progress.setSecondary(take.dataset.secondary as GunId)) this.onChange();
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
      for (const w of PROG_WEAPONS) {
        if (!this.preview[w]) continue;
        this.preview[w] = null;
        this.renderDetail(w);
      }
    });
    progress.onChange(() => this.render());
    this.render();
  }

  render() {
    // Keep the focus where it was (a controller or the keyboard toggling upgrades).
    const focused = document.activeElement as HTMLElement | null;
    const key = focused && this.grid.contains(focused) ? focused.dataset.key : undefined;
    this.grid.innerHTML = PROG_WEAPONS.map((w) => this.card(w)).join('');
    if (key) this.grid.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus();
  }

  private card(w: ProgWeapon): string {
    const level = this.progress.level(w);
    const max = levelCount(w);
    const xp = this.progress.xp(w);
    const active = this.progress.loadout.ativas[w];
    const prevXp = xpForLevel(w, level);
    const nextXp = level < max ? xpForLevel(w, level + 1) : null;
    const frac = nextXp === null ? 1 : Math.min(1, (xp - prevXp) / (nextXp - prevXp));
    const xpText = nextXp === null ? t('maxLevel', { xp }) : t('xpToNext', { xp, next: nextXp, level: level + 1 });
    const secondary = SECONDARIES.includes(w as GunId);
    const carried = !secondary || this.progress.choice.secundaria === w;
    const take = !secondary
      ? ''
      : carried
        ? `<div class="in-secondary">✓ ${t('inSecondary')}</div>`
        : `<button type="button" class="take-secondary" data-secondary="${w}" data-key="take-${w}">${t('takeSecondary')}</button>`;
    return `<div class="arsenal-card${carried ? '' : ' spare'}" data-w="${w}">
      <div class="arsenal-head"><span class="arsenal-icon">${PROGRESSION[w].icone}</span><div>
        <div class="arsenal-weapon">${t(SLOT[w])} · ${t('level')} ${level}/${max}</div>
        <div class="arsenal-name">${esc(weaponName(w))}</div></div></div>
      ${take}
      <div class="xp-bar"><div class="xp-fill" style="width:${(frac * 100).toFixed(1)}%"></div></div>
      <div class="xp-text">${xpText}</div>
      ${isGun(w) ? this.stats(w, active) : ''}
      <ul class="upgrades">${PROGRESSION[w].melhorias.map((u) => this.row(w, u, level, active)).join('')}</ul>
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

  private row(w: ProgWeapon, u: Upgrade, level: number, active: string[]): string {
    const open = u.nivel <= level;
    const on = active.includes(u.id);
    let state: string;
    let cls: string;
    if (!open) {
      cls = 'locked';
      state = `<span class="upg-state" title="${esc(t('unlockAt', { xp: u.xp }))}">🔒 ${t('unlockShort', { xp: u.xp })}</span>`;
    } else if (u.opcional) {
      cls = on ? 'on' : 'off';
      state = `<button type="button" class="upg-toggle" data-toggle data-w="${w}" data-id="${u.id}" data-key="${w}-${u.id}" aria-pressed="${on}">${t(on ? 'upgradeOn' : 'upgradeOff')}</button>`;
    } else {
      cls = on ? 'active' : 'replaced';
      state = `<span class="upg-state">${on ? '✓ ' + t('upgradeActive') : t('upgradeReplaced')}</span>`;
    }
    const chips = effectChips(u.efeitos)
      .map((c) => `<span class="fx ${c.good ? 'good' : 'bad'}">${esc(c.text)}</span>`)
      .join('');
    return `<li class="upg ${cls}" data-w="${w}" data-id="${u.id}">
      <div class="upg-top"><span class="upg-icon">${u.icone}</span><span class="upg-lvl">${u.nivel}</span><span class="upg-name">${esc(upgradeName(w, u.id))}</span>${state}</div>
      <div class="upg-fx">${u.opcional ? `<span class="fx opt">${t('upgradeOptional')}</span>` : ''}${chips}</div>
    </li>`;
  }

  private detail(w: ProgWeapon): string {
    const id = this.preview[w];
    if (!id) return esc(str(`armaDesc_${w}`));
    const u = upgradeOf(w, id)!;
    return `<b>${u.icone} ${esc(upgradeName(w, id))}</b><br>${esc(str(`upgDesc_${w}_${id}`))}`;
  }

  private renderDetail(w: ProgWeapon) {
    const el = this.grid.querySelector(`.arsenal-card[data-w="${w}"] .upg-detail`);
    if (el) el.innerHTML = this.detail(w);
  }
}
