// The game's side of Play inside the editor (PF-6 Revisions 01, etapa 4): a page opened by the editor in its Game
// tab ("?jogoEditor=<token>", client/editor/playBridge.ts). boot() (client/main.ts) asks editorPlay() first: in
// such a page it skips the home and plays the editor's map (the document being edited, not saved) in the mode the
// old "Testar" opened (P41): the zumbi match alone against the horde on a zumbi-only map, the training range on
// any other; the player's name and look come from their account, if signed in. Paused by the editor (❚❚), the game
// is frozen under a veil that takes the clicks (a click must not take the mouse back while it's frozen).
import type { MapData } from '@shared/mapData';
import { DEFAULT_MAP } from '@shared/maps';
import type { HomeChoice } from '../ui/home';
import { fetchMe, fetchProfile } from '../net/api';
import { testGame } from './recovery';
import { BRIDGES, PLAY_PARAM, type BridgeWindow, type PlayBridge, type PlayControls } from './playBridge';
import { et } from './strings';

export interface EditorPlay {
  /** The map to play. */
  data: MapData;
  /** Frozen by the editor's ❚❚: no simulation, no drawing. */
  frozen: boolean;
  /** What the game plays (P41), as the home would have answered. */
  choice(): Promise<HomeChoice>;
  ready(c: PlayControls): void;
  failed(err: unknown): void;
  /** The game's own Exit: back to editing. */
  exit(): void;
  /** Shows or hides the veil over the frozen game. */
  veil(on: boolean): void;
}

/** The editor's game, when this page is one (null: the game as always). */
export function editorPlay(): EditorPlay | null {
  const token = new URLSearchParams(location.search).get(PLAY_PARAM);
  if (!token || window.parent === window) return null;
  let bridge: PlayBridge | undefined;
  try {
    bridge = (window.parent as BridgeWindow)[BRIDGES]?.get(token);
  } catch {
    return null;
  }
  if (!bridge) return null;
  const b = bridge;
  const data = JSON.parse(b.json) as MapData;
  let veil: HTMLElement | null = null;
  return {
    data,
    frozen: false,
    choice: () => playChoice(data, b.mapa),
    ready: (c) => b.ready(c),
    failed: (err) => b.failed(String((err as Error)?.message ?? err)),
    exit: () => b.exit(),
    veil(on) {
      if (on && !veil) {
        veil = document.createElement('div');
        veil.id = 'editor-pause';
        Object.assign(veil.style, {
          position: 'fixed',
          inset: '0',
          zIndex: '100000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(10, 14, 24, 0.35)',
          color: '#fff',
          font: '700 18px system-ui, sans-serif',
          textShadow: '0 1px 3px #000',
          cursor: 'default',
        });
        veil.textContent = et('playPausedVeil');
        document.body.append(veil);
      } else if (!on && veil) {
        veil.remove();
        veil = null;
      }
    },
  };
}

/** P41: the zumbi match alone against the horde on a zumbi-only map, the training range on any other. */
export async function playChoice(data: MapData, mapa: string | null): Promise<HomeChoice> {
  const { me } = await fetchMe();
  const account = me ? await fetchProfile().catch(() => null) : null;
  const base = { name: me?.tag ?? 'Recruta', sex: account?.sexo ?? me?.sexo ?? 'm', account, map: mapa ?? DEFAULT_MAP };
  return testGame(data) === 'zumbi' ? { ...base, mode: 'bots', game: 'zumbi', count: 0, skill: 'normal' } : { ...base, mode: 'offline', variant: 'range' };
}
