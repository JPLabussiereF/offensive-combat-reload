// Corrida armada's ladder as the player sees it: the step names (strings ladder_<id>), and the pause menu's Escada
// tab in place of the Arsenal (the mode hands out the weapons, PF-11): every rung on a line with the player's lit
// ("Você · N/3"), the weapon now and the next one, the mode's rules, who leads and, between rounds, the winner
// with the countdown.
import { FINAL_STEP, GUN_GAME, killsForStep, LADDER, type LadderPos } from '@shared/gunGame';
import { gunStats } from '@shared/arsenal';
import { isGun, progOf, upgradeOf } from '@shared/progression';
import { esc, weaponIcon } from './arsenal';
import type { Leader } from './pauseMenu';
import { t, type StringKey } from './strings';

/** A step's name ("Rifle com Luneta", "Sabre de Luz"). */
export const stepName = (step: number) => t(`ladder_${LADDER[Math.min(Math.max(0, step), FINAL_STEP)].id}` as StringKey);

/** The step's icon: the knife's (the lightsaber), a scope's or a silencer's, or the gun's own (as the Arsenal shows it). */
function stepIcon(step: number): string {
  const s = LADDER[step];
  if (s.arma === 'faca') return weaponIcon(s.faca ?? 'faca');
  const prog = progOf(s.arma);
  const form = s.melhorias.map((id) => upgradeOf(prog, id)).find((u) => u?.efeitos.mira?.startsWith('luneta') || u?.efeitos.silenciador);
  return form?.icone ?? weaponIcon(s.arma);
}

/** The step's gun with its upgrades (null on the lightsaber). */
const stepGun = (step: number) => {
  const s = LADDER[step];
  return isGun(s.arma) ? gunStats(s.arma, s.melhorias) : null;
};

/** The rail's line under the tab: "Degrau 3 de 7 · 1/3 abates". */
export const ladderTabSub = (pos: LadderPos) => t('pmTabLadderSub', { n: pos.step + 1, total: FINAL_STEP + 1, k: pos.kills, need: killsForStep(pos.step) });

export interface LadderView {
  pos: LadderPos;
  leader: Leader;
  /** Between rounds: who won and when the next starts ("Nova rodada em 4…"). */
  round: { title: string; next: string } | null;
}

/** The pause menu's Escada tab. */
export function renderLadderTab(el: HTMLElement, v: LadderView) {
  const { step, kills } = v.pos;
  const need = killsForStep(step);
  const final = step >= FINAL_STEP;
  const rungs = LADDER.map((_, i) => {
    const gun = stepGun(i);
    const sub = gun ? `${gun.pente} · ${gun.cadencia} rpm` : t('ladderFinalKills');
    const cls = `pl-rung${i === step ? ' me' : ''}${i < step ? ' done' : ''}${i > step ? ' ahead' : ''}${i === FINAL_STEP ? ' final' : ''}`;
    return `<div class="${cls}">
      ${i === step ? `<span class="pl-you">${esc(t('pmLadderYou', { k: kills, need }))}</span>` : ''}
      <div class="pl-dot">${stepIcon(i)}<span class="pl-n">${i + 1}</span>${i < step ? '<span class="pl-check">✓</span>' : ''}</div>
      <div class="pl-name">${esc(stepName(i))}</div><div class="pl-sub">${esc(sub)}</div>
    </div>`;
  }).join('');
  const pips = Array.from({ length: need }, (_, i) => `<i${i < kills ? ' class="on"' : ''}></i>`).join('');
  const left = need - kills;
  const toGo = final ? t(left === 1 ? 'pmLadderToWinOne' : 'pmLadderToWin', { n: left }) : t(left === 1 ? 'pmLadderToGoOne' : 'pmLadderToGo', { n: left });
  const now = `<div class="pl-card now"><span class="pl-card-icon">${stepIcon(step)}</span><div class="pl-card-text">
      <span class="pl-kicker">${esc(t('pmLadderNow', { n: step + 1 }))}</span><span class="pl-card-name">${esc(stepName(step))}</span>
      <span class="pl-pips">${pips}${esc(toGo)}</span></div></div>`;
  const finalLine = t(GUN_GAME.finalKills === 1 ? 'pmLadderFinalOne' : 'pmLadderFinalMany', { n: GUN_GAME.finalKills, weapon: stepName(FINAL_STEP) });
  let next: string;
  if (final) {
    // On the last step there is no next weapon: the card says how the round is won.
    next = `<div class="pl-card"><span class="pl-card-icon">${stepIcon(FINAL_STEP)}</span><div class="pl-card-text">
      <span class="pl-kicker">${esc(t('pmLadderFinal'))}</span><span class="pl-card-name">${esc(finalLine)}</span></div></div>`;
  } else {
    const gun = stepGun(step + 1);
    const sub = gun ? [t('pmLadderGun', { mag: gun.pente, rpm: gun.cadencia }), ...(gun.silenciador ? [t('pmLadderSilenced')] : [])].join(' · ') : t('ladderFinalKills');
    next = `<div class="pl-card"><span class="pl-card-icon">${stepIcon(step + 1)}</span><div class="pl-card-text">
      <span class="pl-kicker">${esc(t('pmLadderNext', { n: step + 2 }))}</span><span class="pl-card-name">${esc(stepName(step + 1))}</span>
      <span class="pl-card-sub">${esc(sub)}</span></div></div>`;
  }
  const rule = (icon: string, text: string, cls = '') => `<div class="pl-rule${cls}"><span class="pl-rule-icon">${icon}</span><span>${esc(text)}</span></div>`;
  const rules = [
    rule('🎯', t('pmRuleClimb', { n: GUN_GAME.killsPerStep })),
    rule('🔪', t('pmRuleStab')),
    rule(stepIcon(FINAL_STEP), t(GUN_GAME.finalKills === 1 ? 'pmRuleFinalOne' : 'pmRuleFinalMany', { n: GUN_GAME.finalKills, weapon: stepName(FINAL_STEP) }), ' final'),
  ].join('');
  const l = v.leader;
  const leader = l
    ? `<div class="pl-leader"><span class="pl-leader-chip">${esc(t('pmLeader'))}</span>${esc(l.you ? t('pmLeaderYou') : t('pmLeaderOther', { name: l.name, n: l.step + 1, weapon: stepName(l.step) }))}</div>`
    : '';
  const round = v.round ? `<div class="pl-round"><b>${esc(v.round.title)}</b><span>${esc(v.round.next)}</span></div>` : '';
  el.innerHTML = `<div class="pl">${round}
    <div class="pl-rungs" style="--rungs:${LADDER.length}"><div class="pl-line"></div>${rungs}</div>
    <div class="pl-cards">${now}${next}</div>
    <div class="pl-rules">${rules}</div>${leader}</div>`;
}
