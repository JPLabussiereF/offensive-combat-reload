// Corrida armada (gun game): the weapon ladder and its rules, as pure functions the server (online) and the
// bots manager (offline) both run. Every player climbs the same ladder (data/corrida_armada.json) with fixed
// stats per step, never their own upgrades, so it's fair:
// - GUN_GAME.killsPerStep kills with the step's weapon move a player up one step;
// - dying to a stab (knife or lightsaber) moves them down one step, with the kills of the step lost;
// - the last step is the lightsaber (the 'sabre' knife), always in hand (Loadout.soFaca): GUN_GAME.finalKills
//   kill(s) with it win the round, and everyone starts over from the first step.
import data from './data/corrida_armada.json';
import { isGun, isKnife, progOf, PROGRESSION, upgradeOf, type GunId, type KnifeId, type WeaponId } from './progression';
import type { Loadout } from './arsenal';
import type { KillKind } from './protocol';

export interface LadderStep {
  /** Unique; names are client strings (ladder_<id>). */
  id: string;
  /** A gun, or the knife ('faca') for the lightsaber step. */
  arma: GunId | 'faca';
  /** On the knife step: which knife (the lightsaber). */
  faca?: KnifeId;
  /** The upgrades that weapon has on this step (ids of its progression's tree). */
  melhorias: string[];
}

export const GUN_GAME = {
  killsPerStep: data.abatesPorArma,
  finalKills: data.abatesFinais,
  /** Seconds between a win and the next round. */
  restartSeconds: data.reinicioSegundos,
  /** Account XP for winning a round (kills give no weapon points in this mode). */
  winXp: data.xpVitoria,
};

export const LADDER = data.escada as LadderStep[];
export const FINAL_STEP = LADDER.length - 1;

/** Where a player is on the ladder: the step (0-based) and the kills made on it. */
export interface LadderPos {
  step: number;
  kills: number;
}

export const ladderStart = (): LadderPos => ({ step: 0, kills: 0 });

/** Kills a step needs: GUN_GAME.killsPerStep to move up, GUN_GAME.finalKills on the last one to win. */
export const killsForStep = (step: number) => (step >= FINAL_STEP ? GUN_GAME.finalKills : GUN_GAME.killsPerStep);

/** The weapon a step hands out (for names and icons): the gun, or the knife of the last step. */
export function stepWeapon(step: number): WeaponId {
  const s = LADDER[Math.min(Math.max(0, step), FINAL_STEP)];
  return s.arma === 'faca' ? (s.faca ?? 'faca') : s.arma;
}

/**
 * What a player carries on a step: that gun alone, with the step's upgrades, and a plain knife for quick
 * melee; on the last step only the lightsaber, held all the time.
 */
export function ladderLoadout(step: number): Loadout {
  const s = LADDER[Math.min(Math.max(0, step), FINAL_STEP)];
  const ativas: Loadout['ativas'] = { rifle: [], pistola: [], smg: [], faca: [], granada: [] };
  ativas[s.arma === 'faca' ? 'faca' : progOf(s.arma)] = [...s.melhorias];
  if (s.arma === 'faca') return { primaria: 'rifle', secundaria: null, faca: s.faca ?? 'faca', ativas, soFaca: true };
  return { primaria: s.arma, secundaria: null, faca: 'faca', ativas };
}

/** Whether a kill counts toward the killer's step: made with the step's weapon (the lightsaber: a stab). */
export function killCounts(step: number, kind: KillKind, weapon: WeaponId | null | undefined): boolean {
  const s = LADDER[Math.min(Math.max(0, step), FINAL_STEP)];
  if (s.arma === 'faca') return kind === 'knife';
  return (kind === 'gun' || kind === 'head' || kind === 'groin') && weapon === s.arma;
}

export type LadderEvent = 'kill' | 'advanced' | 'won';

/** The killer's position after a kill, and what it did (null: didn't count). Winning keeps the last step. */
export function afterKill(pos: LadderPos, kind: KillKind, weapon: WeaponId | null | undefined): { pos: LadderPos; event: LadderEvent | null } {
  if (!killCounts(pos.step, kind, weapon)) return { pos, event: null };
  const kills = pos.kills + 1;
  if (kills < killsForStep(pos.step)) return { pos: { step: pos.step, kills }, event: 'kill' };
  if (pos.step >= FINAL_STEP) return { pos: { step: pos.step, kills }, event: 'won' };
  return { pos: { step: pos.step + 1, kills: 0 }, event: 'advanced' };
}

/** The victim's position after dying: a stab sends them one step down and they lose the step's kills. */
export function afterDeath(pos: LadderPos, kind: KillKind): LadderPos {
  if (kind !== 'knife') return pos;
  return { step: Math.max(0, pos.step - 1), kills: 0 };
}

/** The ladder is consistent with the weapons (checked by the tests): known guns and upgrades, the lightsaber last. */
export function ladderProblems(): string[] {
  const out: string[] = [];
  LADDER.forEach((s, i) => {
    if (s.arma !== 'faca' && !isGun(s.arma)) return out.push(`${s.id}: arma desconhecida ${s.arma}`);
    if (s.faca !== undefined && !isKnife(s.faca)) out.push(`${s.id}: faca desconhecida ${s.faca}`);
    const prog = s.arma === 'faca' ? 'faca' : progOf(s.arma);
    if (!PROGRESSION[prog]) return;
    for (const u of s.melhorias) if (!upgradeOf(prog, u)) out.push(`${s.id}: melhoria desconhecida ${u}`);
    if ((s.arma === 'faca') !== (i === FINAL_STEP)) out.push(`${s.id}: o sabre é o último degrau, e só ele`);
  });
  if (LADDER[FINAL_STEP]?.faca !== 'sabre') out.push('o último degrau precisa ser o Sabre de Luz');
  if (new Set(LADDER.map((s) => s.id)).size !== LADDER.length) out.push('ids repetidos');
  return out;
}
