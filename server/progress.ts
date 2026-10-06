// A connected account's progress, kept in memory by the game server: points only come from events the
// server validated (kills, humiliations, time alive). The delta since the last write is flushed to the
// database every minute and when the player leaves a session (app.ts).
import { ACCOUNT_XP, accountLevel } from '@shared/accountLevel';
import type { Totals } from '@shared/account';
import { sourcesFromTotals, tiersOf, type Own } from '@shared/achievements';
import { levelForXp, PROG_WEAPONS, sanitizeChoice, type ArsenalChoice, type Levels, type ProgWeapon } from '@shared/progression';
import { resolveLoadout, type Loadout } from '@shared/arsenal';
import type { ServerMsg } from '@shared/protocol';
import type { ZStat } from '@shared/zombieMatch';
import { isBoss } from '@shared/zombies';
import { emptyDelta, type GameProfile, type ProgressDelta, type ZombieDelta } from './accounts';

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
  /** Each sticker's finish as the player last heard it: a higher one is news (stickerUps). */
  stickerTiers: Record<string, number>;
}

export function liveAccount(profile: GameProfile, chatMutedUntil = 0): LiveAccount {
  const a: LiveAccount = { profile, delta: emptyDelta(), participation: null, aliveCarry: 0, chatMutedUntil, stickerTiers: {} };
  // What the account already had when it connected isn't news.
  a.stickerTiers = tiersOf(liveSources(a), liveOwn(a));
  return a;
}

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
    else if (k === 'zumbi') mergeZombie(into.zumbi, d.zumbi);
    else if (k === 'album') {
      for (const [key, n] of Object.entries(d.album.add)) into.album.add[key] = (into.album.add[key] ?? 0) + n;
      for (const [key, n] of Object.entries(d.album.max)) into.album.max[key] = Math.max(into.album.max[key] ?? 0, n);
    }
    else into[k] += d[k];
  }
}

function mergeZombie(into: ZombieDelta, d: ZombieDelta) {
  for (const k of Object.keys(d) as (keyof ZombieDelta)[]) into[k] = k === 'bestWave' ? Math.max(into[k], d[k]) : into[k] + d[k];
}

export const deltaIsEmpty = (d: ProgressDelta) =>
  Object.entries(d).every(([k, v]) =>
    k === 'weaponXp'
      ? PROG_WEAPONS.every((w) => (v as Record<ProgWeapon, number>)[w] === 0)
      : k === 'zumbi'
        ? Object.values(v as ZombieDelta).every((n) => n === 0)
        : k === 'album'
          ? !Object.keys(d.album.add).length && !Object.keys(d.album.max).length
          : v === 0,
  );

// --- Sticker album (shared/achievements.ts) ---------------------------------------------------------------

/** One more for a sticker's own counter (a running total; "id:item" for a collection). */
export function stickerAdd(a: LiveAccount, key: string, n = 1) {
  const add = a.delta.album.add;
  add[key] = (add[key] ?? 0) + n;
}

/** A sticker's own record: kept if it beats what's there. */
export function stickerMax(a: LiveAccount, key: string, n: number) {
  const max = a.delta.album.max;
  if (n > (max[key] ?? 0)) max[key] = n;
}

/** Totals with a delta in them. */
function withDelta(t: Totals, d: ProgressDelta): Totals {
  const z = t.zumbi;
  const dz = d.zumbi;
  return {
    abates: t.abates + d.kills,
    mortes: t.mortes + d.deaths,
    cabeca: t.cabeca + d.headshots,
    passaro: t.passaro + d.groinKills,
    facadas: t.facadas + d.knifeKills,
    pelasCostas: t.pelasCostas + d.backstabs,
    granadas: t.granadas + d.grenadeKills,
    opressoes: t.opressoes + d.humiliations,
    segundosJogados: t.segundosJogados + Math.round(d.secondsPlayed),
    participacoes: t.participacoes,
    zumbi: {
      partidas: z.partidas + dz.matches,
      vitorias: z.vitorias + dz.wins,
      melhorOnda: Math.max(z.melhorOnda, dz.bestWave),
      ondas: z.ondas + dz.waves,
      abates: z.abates + dz.kills,
      cabeca: z.cabeca + dz.headshots,
      passaro: z.passaro + dz.groinKills,
      facadas: z.facadas + dz.knifeKills,
      granadas: z.granadas + dz.grenadeKills,
      chefes: z.chefes + dz.bosses,
      coveiro: z.coveiro + dz.coveiroKills,
      noiva: z.noiva + dz.noivaKills,
      prefeito: z.prefeito + dz.prefeitoKills,
      quedas: z.quedas + dz.downs,
      reanimacoes: z.reanimacoes + dz.revives,
      mortes: z.mortes + dz.deaths,
      caixao: z.caixao + dz.coffinRolls,
    },
  };
}

/** Own counters with a delta in them. */
function withOwn(own: Own, d: ProgressDelta): Own {
  const out = { ...own };
  for (const [k, n] of Object.entries(d.album.add)) out[k] = (out[k] ?? 0) + n;
  for (const [k, n] of Object.entries(d.album.max)) out[k] = Math.max(out[k] ?? 0, n);
  return out;
}

/** The album's numbers right now: what was written plus what is still in the delta. */
export const liveSources = (a: LiveAccount) => sourcesFromTotals(accountLevelOf(a), levelsOf(a), withDelta(a.profile.totals, a.delta));
export const liveOwn = (a: LiveAccount) => withOwn(a.profile.album, a.delta);

/** A delta made it to the database: it joins what the live numbers start from. */
export function settle(a: LiveAccount, d: ProgressDelta) {
  a.profile.totals = withDelta(a.profile.totals, d);
  a.profile.album = withOwn(a.profile.album, d);
}

/** Joining a session counts an entry (player_stats.matches_played, written by openParticipation). */
export function countEntry(a: LiveAccount) {
  a.profile.totals.participacoes++;
}

/** The stickers whose finish went up since the player last heard (each one told once). */
export function stickerUps(a: LiveAccount): { id: string; nivel: number }[] {
  const ups: { id: string; nivel: number }[] = [];
  for (const [id, tier] of Object.entries(tiersOf(liveSources(a), liveOwn(a)))) {
    if (tier <= (a.stickerTiers[id] ?? 0)) continue;
    a.stickerTiers[id] = tier;
    ups.push({ id, nivel: tier });
  }
  return ups;
}

/** One zumbi event (shared/zombieMatch.ts ZStat) into the account's zumbi stats. */
export function addZombieStat(a: LiveAccount, s: ZStat) {
  const z = a.delta.zumbi;
  switch (s.e) {
    case 'kill':
      z.kills++;
      if (s.how === 'head') z.headshots++;
      else if (s.how === 'groin') z.groinKills++;
      else if (s.how === 'knife') z.knifeKills++;
      else if (s.how === 'grenade') z.grenadeKills++;
      if (isBoss(s.kind)) {
        z.bosses++;
        z[`${s.kind}Kills`]++;
      }
      // Album: the Mayor's vote cancelled (below the belt), the Bride left at the altar again (a stab).
      if (s.kind === 'prefeito' && s.how === 'groin') stickerAdd(a, 'voto-nulo');
      if (s.kind === 'noiva' && s.how === 'knife') stickerAdd(a, 'divorcio');
      return;
    case 'chain':
      stickerMax(a, 'churrasco-coletivo', s.kills);
      return;
    case 'board':
      stickerAdd(a, 'marceneiro');
      return;
    case 'down':
      z.downs++;
      return;
    case 'death':
      z.deaths++;
      return;
    case 'revive':
      z.revives++;
      return;
    case 'wave':
      z.waves++;
      return;
    case 'coffin':
      z.coffinRolls++;
      return;
    case 'end':
      z.matches++;
      if (s.won) z.wins++;
      z.bestWave = Math.max(z.bestWave, s.wave);
      if (s.won && s.dead) stickerAdd(a, 'vitoria-do-alem');
      return;
  }
}
