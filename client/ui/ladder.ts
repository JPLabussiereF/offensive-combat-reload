// Corrida armada's ladder as the player sees it: the step names (strings ladder_<id>), and the list shown in
// the pause menu in place of the Arsenal (the mode hands out the weapons), with the player's step lit.
import { FINAL_STEP, killsForStep, LADDER, type LadderPos } from '@shared/gunGame';
import { gunStats } from '@shared/arsenal';
import { isGun, progOf, PROGRESSION, upgradeOf } from '@shared/progression';
import { MELEE } from '@shared/weapons';
import { t, type StringKey } from './strings';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** A step's name ("Rifle com Luneta", "Sabre de Luz"). */
export const stepName = (step: number) => t(`ladder_${LADDER[Math.min(Math.max(0, step), FINAL_STEP)].id}` as StringKey);

/** The step's icon: the knife's (the lightsaber), a scope's or a silencer's, or the gun's own. */
function stepIcon(step: number): string {
  const s = LADDER[step];
  if (s.arma === 'faca') return MELEE[s.faca ?? 'faca']?.icone ?? PROGRESSION.faca.icone;
  const prog = progOf(s.arma);
  const form = s.melhorias.map((id) => upgradeOf(prog, id)).find((u) => u?.efeitos.mira?.startsWith('luneta') || u?.efeitos.silenciador);
  return form?.icone ?? PROGRESSION[prog].icone;
}

/** Fills `el` with the ladder, `pos` marking where the player is (null: not known yet). */
export function renderLadder(el: HTMLElement, pos: LadderPos | null) {
  el.innerHTML = `<ol class="ladder-list">${LADDER.map((s, i) => {
    const need = killsForStep(i);
    const gun = isGun(s.arma) ? gunStats(s.arma, s.melhorias) : null;
    const what = i === FINAL_STEP ? t('ladderFinalKills') : t('ladderKills', { n: need });
    const mine = pos?.step === i;
    return `<li class="${i === FINAL_STEP ? 'final' : ''}${mine ? ' me' : ''}">
      <span class="rung">${i + 1}</span><span class="icon">${stepIcon(i)}</span>
      <span>${esc(stepName(i))}${mine ? ` <small>· ${t('ladderYou')} ${pos!.kills}/${need}</small>` : ''}${gun ? `<br><small>${gun.pente} · ${gun.cadencia} rpm</small>` : ''}</span>
      <small>${esc(what)}</small></li>`;
  }).join('')}</ol>`;
}
