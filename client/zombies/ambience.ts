// The zumbi mode's night in the haunted town and its pause-menu page:
// - the fog comes in closer and greener (you hear the horde before you see it; it also spares the GPU the far
//   half of the map), the moonlight dims a little, and on a boss wave the fog slowly turns blood red;
// - the pause menu shows what we carry from the Mystery Coffin and its odds, in place of the Arsenal.
import * as THREE from 'three';
import { BOX_ITEMS, itemOf, RARITIES, ZOMBIE, type ZItems } from '@shared/zombies';
import type { Atmosphere, RenderContext } from '../render/renderer';
import { t, type StringKey } from '../ui/strings';
import { RARITY_COLOR } from './coffin';

const ZOMBIE_FOG = new THREE.Color(0x2c3a30);
const BOSS_FOG = new THREE.Color(0x4a1414);

/** The map's night, made for the horde. */
export function zombieAtmosphere(a: Atmosphere): Atmosphere {
  return {
    ...a,
    background: 0x0b100d,
    fog: { color: ZOMBIE_FOG.getHex(), near: 10, far: 90 },
    hemi: { ...a.hemi, intensity: a.hemi.intensity * 0.85 },
    sun: { ...a.sun, intensity: a.sun.intensity * 0.85 },
  };
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

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const itemName = (id: string) => t(`zitem_${id}` as StringKey);

/** The pause menu's page: what we carry (by slot), then every rarity's odds and its weapons. */
export function renderZombieArsenal(el: HTMLElement, items: ZItems) {
  const carried = (['primaria', 'secundaria', 'faca'] as const)
    .map((slot) => {
      const it = itemOf(items[slot]);
      const icon = slot === 'faca' ? '🔪' : slot === 'primaria' ? '🔫' : '🌀';
      const name = it ? itemName(it.id) : slot === 'faca' ? t('arma_faca' as StringKey) : '—';
      const color = it ? RARITY_COLOR[it.raridade] : '#c8c8c8';
      return `<li style="border-left:8px solid ${color}"><span class="rung">${icon}</span><span class="icon"></span>
        <span>${esc(name)}</span><small>${it ? esc(t(`rar_${it.raridade}` as StringKey)) : ''}</small></li>`;
    })
    .join('');
  const weights = RARITIES.filter((r) => r !== 'inicial');
  const sum = weights.reduce((s, r) => s + ZOMBIE.raridades[r].peso, 0);
  const odds = weights
    .map((r) => {
      const names = BOX_ITEMS.filter((i) => i.raridade === r).map((i) => esc(itemName(i.id))).join(', ');
      const pct = Math.round((ZOMBIE.raridades[r].peso / sum) * 100);
      return `<li style="border-left:8px solid ${RARITY_COLOR[r]}"><span class="rung">${pct}%</span><span class="icon">×${ZOMBIE.raridades[r].dano}</span>
        <span>${esc(t(`rar_${r}` as StringKey))}<br><small>${names}</small></span><small></small></li>`;
    })
    .join('');
  el.innerHTML = `<h4 class="zars-title">${esc(t('zArsenalCarry'))}</h4><ol class="ladder-list">${carried}</ol>
    <h4 class="zars-title">${esc(t('zArsenalOdds'))} · $${ZOMBIE.caixa.custo}</h4><ol class="ladder-list">${odds}</ol>`;
}
