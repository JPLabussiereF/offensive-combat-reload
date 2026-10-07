// The zumbi mode's night and its pause-menu page:
// - the mode's own map (the cemetery) already brings the night it was made for: the green fog stays pushed back so
//   the gaps in the wall and the grave field beyond them read from anywhere in the yard; on a boss wave the fog
//   slowly turns blood red;
// - the pause menu's Caixão tab, in place of the Arsenal: what we carry from the Mystery Coffin (damaged copies
//   tagged) beside its odds by rarity.
import * as THREE from 'three';
import { BOX_ITEMS, itemOf, RARITIES, ZOMBIE, type ZFlaw, type ZItems } from '@shared/zombies';
import type { Atmosphere, RenderContext } from '../render/renderer';
import { esc, num } from '../ui/arsenal';
import { t, type StringKey } from '../ui/strings';
import { RARITY_COLOR } from './coffin';

const ZOMBIE_FOG = new THREE.Color(0x2c3a30);
const BOSS_FOG = new THREE.Color(0x4a1414);

/** The map's night for the horde: its own distances (the cemetery keeps its gaps in sight), the mode's green. */
export function zombieAtmosphere(a: Atmosphere): Atmosphere {
  return { ...a, fog: { ...a.fog, color: ZOMBIE_FOG.getHex() } };
}

const want = new THREE.Color();

/** The fog drifts toward red during a boss wave, and back after. */
export function tintFog(ctx: RenderContext, boss: boolean, dt: number) {
  const fog = ctx.scene.fog as THREE.Fog | null;
  if (!fog) return;
  want.copy(boss ? BOSS_FOG : ZOMBIE_FOG);
  fog.color.lerp(want, 1 - Math.exp(-dt * 0.6));
  if (ctx.scene.background instanceof THREE.Color) ctx.scene.background.lerp(want.multiplyScalar(0.45), 1 - Math.exp(-dt * 0.6));
}

const itemName = (id: string) => t(`zitem_${id}` as StringKey);
const pct = (k: number) => Math.round(k * 100);

/** What a flaw takes away, with its numbers ("−40% magazine and −50% reserve", "−25% damage", or both). */
export function flawText(flaw: ZFlaw): string {
  const d = ZOMBIE.caixa.danificada;
  const ammo = t('zFlawAmmo', { p: pct(1 - d.pente), r: pct(1 - d.reserva) });
  const damage = t('zFlawDamage', { d: pct(1 - d.dano) });
  return flaw === 'municao' ? ammo : flaw === 'dano' ? damage : `${ammo} · ${damage}`;
}

/** The pause menu's Caixão tab: what we carry (by slot, in its rarity's color, a damaged copy's flaw), and every rarity's odds, damage, chance of coming damaged and weapons. */
export function renderCoffinTab(el: HTMLElement, items: ZItems) {
  const carried = (['primaria', 'secundaria', 'faca'] as const)
    .map((slot) => {
      const it = itemOf(items[slot]);
      const icon = slot === 'faca' ? '🔪' : slot === 'primaria' ? '🔫' : '🌀';
      const name = it ? itemName(it.id) : slot === 'faca' ? t('arma_faca' as StringKey) : '—';
      const color = it ? RARITY_COLOR[it.raridade] : '#c8c8c8';
      const flaw = it ? items.danificadas?.[slot] : undefined;
      const tag = flaw ? `<span class="fx bad">${esc(t('zDamaged'))}: ${esc(flawText(flaw))}</span>` : '';
      return `<div class="pz-carry" style="--rarity:${color}"><span class="pz-icon">${icon}</span>
        <span class="pz-what"><span class="pz-slot">${esc(t(`treeRow_${slot}` as StringKey))}</span><span class="pz-name">${esc(name)}</span>${tag}</span>
        <span class="pz-carry-rar">${it ? esc(t(`rar_${it.raridade}` as StringKey)) : ''}</span></div>`;
    })
    .join('');
  const weights = RARITIES.filter((r) => r !== 'inicial');
  const sum = weights.reduce((s, r) => s + ZOMBIE.raridades[r].peso, 0);
  const odds = weights
    .map((r) => {
      const names = BOX_ITEMS.filter((i) => i.raridade === r).map((i) => itemName(i.id)).join(', ');
      const chance = Math.round((ZOMBIE.raridades[r].peso / sum) * 100);
      return `<div class="pz-odds" style="--rarity:${RARITY_COLOR[r]}">
        <div class="pz-odds-top"><span class="pz-rar">${esc(t(`rar_${r}` as StringKey))}</span><div class="pz-bar"><div style="width:${Math.min(100, chance * 2)}%"></div></div><span class="pz-chance">${chance}%</span></div>
        <div class="pz-chips"><span class="fx good">${esc(t('pmCoffinMul', { m: num(ZOMBIE.raridades[r].dano, 2) }))}</span><span class="fx bad">${esc(t('pmCoffinBroken', { n: pct(ZOMBIE.caixa.danificada.chance[r]) }))}</span><span class="pz-items">${esc(names)}</span></div>
      </div>`;
    })
    .join('');
  el.innerHTML = `<div class="pz"><div class="pz-col"><div class="pz-title">${esc(t('zArsenalCarry'))}</div>${carried}</div>
    <div class="pz-col"><div class="pz-title">${esc(t('pmCoffinOdds', { cost: ZOMBIE.caixa.custo }))}</div>${odds}</div></div>`;
}
