// The pause menu's rules (pure, no DOM): what the rail says in each place and mode (the chip, the line under the
// map, the red online / green paused banner, the mode's tab, the exit and what its confirmation warns about), the
// level Esc and ◯ go back to (the dialog, then the tab, then the game), who leads the corrida armada, the "N more
// upgrades" line of the Arsenal tab and the map's name on a glTF preview. client/ui/menu.ts and client/main.ts
// draw it; client/tests/pauseMenu.test.ts checks it.
import type { PlayerInfo } from '@shared/protocol';
import type { GameModeId } from '@shared/modes';
import { WAVES } from '@shared/zombies';
import { levelForXp, PROGRESSION, type ProgWeapon } from '@shared/progression';
import type { RebindableAction } from '../core/keybinds';
import { getLang, t, type StringKey } from './strings';

// No DOM here (the tests type-check without it): the names come straight from the strings, as in client/ui/arsenal.ts.
const upgradeName = (w: ProgWeapon, id: string) => t(`upg_${w}_${id}` as StringKey);
const progName = (w: ProgWeapon) => t(`prog_${w}` as StringKey);
const points = (n: number) => n.toLocaleString(getLang() === 'en' ? 'en' : 'pt-BR', { maximumFractionDigits: 0 });

export type PausePlace = 'online' | 'bots' | 'range';
export type BotSkill = 'facil' | 'normal' | 'dificil';

/** What the game knows about the match the menu sits on. */
export interface PauseFacts {
  place: PausePlace;
  /** The game mode (null on the shooting range). */
  mode: GameModeId | null;
  /** Online: the session's name, the players in it (us too) and its limit. */
  session?: { name: string; players: number; max: number };
  /** Against bots: how many and how hard. */
  bots?: { count: number; skill: BotSkill };
  /** Zumbi: the wave on (0 before the first). */
  wave?: number;
}

/** The mode's tab: the Arsenal, corrida armada's ladder, or the zumbi mode's Mystery Coffin. */
export type ModeTab = 'arsenal' | 'escada' | 'caixao';
export type PauseCase = 'mata-online' | 'mata-bots' | 'corrida-online' | 'corrida-bots' | 'zumbi-team' | 'zumbi-alone' | 'zumbi-solo' | 'range';

export interface PauseContext {
  case: PauseCase;
  chip: string;
  /** The chip's color, the mode's own. */
  color: string;
  /** The line under the map's name. */
  line: string;
  /** Online: the world goes on (red banner); otherwise it waits (green). */
  live: boolean;
  banner: string;
  tab: ModeTab;
  /** The Arsenal can only be looked at (every match; the range edits it). */
  readOnly: boolean;
  exit: string;
  confirm: string;
}

/** Each mode's color (chip, rail accent). */
export const MODE_COLOR: Record<GameModeId | 'range', string> = {
  'mata-mata': '#ff7a1a',
  'corrida-armada': '#1fb5a8',
  zumbi: '#3fae4a',
  range: '#2f9bff',
};

const SKILL: Record<BotSkill, StringKey> = { facil: 'skillEasy', normal: 'skillNormal', dificil: 'skillHard' };

export function pauseContext(f: PauseFacts): PauseContext {
  if (f.place === 'range' || !f.mode) {
    return {
      case: 'range',
      chip: t('modeRange'),
      color: MODE_COLOR.range,
      line: t('pmLineRange'),
      live: false,
      banner: t('pmPaused'),
      tab: 'arsenal',
      readOnly: false,
      exit: t('pmExitRange'),
      confirm: t('pmConfirmRange'),
    };
  }
  const online = f.place === 'online';
  const s = f.session ?? { name: '', players: 1, max: 1 };
  const base = { chip: t(`gameMode_${f.mode}` as StringKey), color: MODE_COLOR[f.mode], live: online, readOnly: true };
  const sessionLine = t('pmLineSession', { name: s.name, n: s.players, max: s.max });
  const botsLine = t('pmLineBots', { n: f.bots?.count ?? 0, skill: t(SKILL[f.bots?.skill ?? 'normal']) });
  if (f.mode === 'zumbi') {
    // Before the first wave: the HUD's countdown title ("A HORDA VEM AÍ") rather than "Onda 0/12".
    const n = f.wave ?? 0;
    const wave = { wave: n > 0 ? t('pmLineWave', { n, total: WAVES }) : t('zCountdown') };
    const tab = { tab: 'caixao' as const, exit: t('pmExitMatch') };
    if (!online) return { ...base, ...tab, case: 'zumbi-solo', line: t('pmLineWaveSolo', wave), banner: t('pmPaused'), confirm: t('pmConfirmZombieSolo') };
    if (s.players > 1) {
      return { ...base, ...tab, case: 'zumbi-team', line: t('pmLineWaveTeam', { ...wave, players: s.players }), banner: t('pmLiveHorde'), confirm: t('pmConfirmZombieTeam') };
    }
    return { ...base, ...tab, case: 'zumbi-alone', line: t('pmLineWaveAlone', wave), banner: t('pmLiveOnline'), confirm: t('pmConfirmZombieAlone') };
  }
  if (f.mode === 'corrida-armada') {
    return online
      ? { ...base, case: 'corrida-online', line: sessionLine, banner: t('pmLiveOnline'), tab: 'escada', exit: t('pmExitRace'), confirm: t('pmConfirmRace') }
      : { ...base, case: 'corrida-bots', line: botsLine, banner: t('pmPausedBots'), tab: 'escada', exit: t('pmExitMatch'), confirm: t('pmConfirmRaceBots') };
  }
  return online
    ? { ...base, case: 'mata-online', line: sessionLine, banner: t('pmLiveOnline'), tab: 'arsenal', exit: t('pmExitSession'), confirm: t('pmConfirmSession', { name: s.name }) }
    : { ...base, case: 'mata-bots', line: botsLine, banner: t('pmPausedBots'), tab: 'arsenal', exit: t('pmExitMatch'), confirm: t('pmConfirmBots') };
}

/** The menu's open levels, top first. */
export interface MenuLevels {
  /** The exit's confirmation is open. */
  confirm: boolean;
  /** The open tab (null: only the rail, the game in view). */
  tab: string | null;
}

/** What Esc (and ◯/B) does: close the dialog, else close the tab, else back to the game. */
export type BackStep = 'close-dialog' | 'close-tab' | 'resume';
export const backStep = (m: MenuLevels): BackStep => (m.confirm ? 'close-dialog' : m.tab ? 'close-tab' : 'resume');

/**
 * The scoreboard's order (client/ui/scoreboard.ts), here so the leader below uses the same: in corrida armada
 * (`ladder`) the step and the kills on it first, then points, kills and fewer deaths.
 */
export function standingsOrder(players: Iterable<PlayerInfo>, ladder: boolean): PlayerInfo[] {
  const step = (p: PlayerInfo) => (p.ladder ? p.ladder.step * 100 + p.ladder.kills : 0);
  return [...players].sort((a, b) => (ladder ? step(b) - step(a) : 0) || b.score - a.score || b.kills - a.kills || a.deaths - b.deaths);
}

/**
 * Who leads the corrida armada (the scoreboard's first): us, someone else, or nobody (no one else in the match, or
 * the first tied with the second: same step and same kills on it).
 */
export type Leader = { you: true } | { you: false; name: string; step: number } | null;

export function ladderLeader(players: Iterable<PlayerInfo>, me: number): Leader {
  const list = [...players];
  if (!list.some((p) => p.id !== me)) return null;
  const [top, second] = standingsOrder(list, true);
  const pos = (p: PlayerInfo) => p.ladder ?? { step: 0, kills: 0 };
  if (second && pos(top).step === pos(second).step && pos(top).kills === pos(second).kills) return null;
  return top.id === me ? { you: true } : { you: false, name: top.name, step: pos(top).step };
}

/**
 * The Arsenal tab's line under a weapon's upgrades: how many of its progression's are still locked, the next one
 * and the points it needs (null once every one is unlocked).
 */
export function moreUpgradesText(prog: ProgWeapon, xp: number): string | null {
  const level = levelForXp(prog, xp);
  const locked = PROGRESSION[prog].melhorias.filter((u) => u.nivel > level).sort((a, b) => a.nivel - b.nivel);
  if (!locked.length) return null;
  const next = locked[0];
  const params = { n: locked.length, upgrade: upgradeName(prog, next.id), xp: points(Math.max(0, next.xp - xp)), prog: progName(prog) };
  return t(locked.length === 1 ? 'pmMoreUpgrade' : 'pmMoreUpgrades', params);
}

/** The Keys sub-tab: every remappable action, grouped (the order of each group is the table's). */
export const KEY_GROUPS: readonly [StringKey, readonly RebindableAction[]][] = [
  ['keyGroupMove', ['forward', 'back', 'left', 'right', 'jump', 'crouch', 'sprint']],
  ['keyGroupCombat', ['fire', 'ads', 'reload', 'melee', 'grenade', 'weapon1', 'weapon2', 'swapWeapon']],
  ['keyGroupOther', ['taunt', 'scoreboard', 'chat']],
];

/** The rail's map line on a ?mapa=/maps/arquivo.glb preview: the file's name. */
export function previewMapName(url: string): string {
  const file = url.split(/[?#]/)[0].split(/[\\/]/).filter(Boolean).pop() ?? url;
  return t('pmPreview', { file });
}
