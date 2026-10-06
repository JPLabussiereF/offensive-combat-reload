// A connected account's progress, kept in memory by the game server: points only come from events the
// server validated (kills, humiliations, time alive). The delta since the last write is flushed to the
// database every minute and when the player leaves a session (app.ts).
import { ACCOUNT_XP, accountLevel } from '@shared/accountLevel';
import { levelForXp, PROG_WEAPONS, sanitizeChoice, type ArsenalChoice, type Levels, type ProgWeapon } from '@shared/progression';
import { resolveLoadout, type Loadout } from '@shared/arsenal';
import type { ServerMsg } from '@shared/protocol';
import { emptyDelta, type GameProfile, type ProgressDelta } from './accounts';

export interface LiveAccount {
  profile: GameProfile;
  /** Earned since the last database write. */
  delta: ProgressDelta;
  /** Participation row of the current session (opened asynchronously on join). */
  participation: Promise<string | null> | null;
  /** Seconds alive toward the next "minute alive" award. */
  aliveCarry: number;
  /** Chat mute (accounts.chatMutedUntil): ms since the epoch, 0 = can chat. Reloaded on MUTE_CHANNEL. */
  chatMutedUntil: number;
}

export const liveAccount = (profile: GameProfile, chatMutedUntil = 0): LiveAccount => ({ profile, delta: emptyDelta(), participation: null, aliveCarry: 0, chatMutedUntil });

export const accountLevelOf = (a: LiveAccount) => accountLevel(a.profile.xp).level;

/** The level of every weapon, from the points earned with it. */
export const levelsOf = (a: LiveAccount): Levels => Object.fromEntries(PROG_WEAPONS.map((w) => [w, levelForXp(w, a.profile.weapons[w].xp)])) as Levels;

/** What the account plays with: its Arsenal choice at its weapon levels (common upgrades on as they unlock). */
export const loadoutOf = (a: LiveAccount): Loadout => resolveLoadout(a.profile.arsenal, levelsOf(a));

export type LevelUp = { tipo: ProgWeapon | 'conta'; nivel: number };

/** Adds weapon points; returns the new level when it goes up (its upgrade is on at once if it's a common one). */
export function addWeaponXp(a: LiveAccount, w: ProgWeapon, points: number): LevelUp | null {
  if (points <= 0) return null;
  const pts = Math.round(points);
  const wp = a.profile.weapons[w];
  const before = levelForXp(w, wp.xp);
  wp.xp += pts;
  a.delta.weaponXp[w] += pts;
  const after = levelForXp(w, wp.xp);
  return after === before ? null : { tipo: w, nivel: after };
}

export function addAccountXp(a: LiveAccount, xp: number): LevelUp | null {
  if (xp <= 0) return null;
  const before = accountLevelOf(a);
  a.profile.xp += xp;
  a.delta.accountXp += xp;
  const after = accountLevelOf(a);
  return after > before ? { tipo: 'conta', nivel: after } : null;
}

/** Time in a session; every full minute alive earns account XP. Returns a level-up, if any. */
export function addTime(a: LiveAccount, dt: number, alive: boolean): LevelUp | null {
  a.delta.secondsPlayed += dt;
  if (!alive) return null;
  a.aliveCarry += dt;
  if (a.aliveCarry < 60) return null;
  a.aliveCarry -= 60;
  return addAccountXp(a, ACCOUNT_XP.perMinuteAlive);
}

/** A new Arsenal choice from the player: upgrades not unlocked yet are dropped. */
export function equip(a: LiveAccount, raw: unknown): ArsenalChoice {
  a.profile.arsenal = sanitizeChoice(raw, levelsOf(a));
  return a.profile.arsenal;
}

export function progressMsg(a: LiveAccount, subiu?: LevelUp | null): Extract<ServerMsg, { t: 'progresso' }> {
  const armas = {} as Extract<ServerMsg, { t: 'progresso' }>['armas'];
  for (const w of PROG_WEAPONS) {
    const xp = a.profile.weapons[w].xp;
    armas[w] = { xp, nivel: levelForXp(w, xp) };
  }
  return { t: 'progresso', armas, escolha: a.profile.arsenal, conta: { xp: a.profile.xp, nivel: accountLevelOf(a) }, ...(subiu ? { subiu } : {}) };
}

/** Puts a delta that failed to be written back, so the next flush retries it. */
export function mergeDelta(into: ProgressDelta, d: ProgressDelta) {
  for (const k of Object.keys(d) as (keyof ProgressDelta)[]) {
    if (k === 'weaponXp') for (const w of PROG_WEAPONS) into.weaponXp[w] += d.weaponXp[w];
    else into[k] += d[k];
  }
}

export const deltaIsEmpty = (d: ProgressDelta) =>
  Object.entries(d).every(([k, v]) => (k === 'weaponXp' ? PROG_WEAPONS.every((w) => (v as Record<ProgWeapon, number>)[w] === 0) : v === 0));
