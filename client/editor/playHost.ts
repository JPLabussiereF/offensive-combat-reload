// The editor's Game tab (PF-6 Revisions 01, etapa 4): ▶ opens the game in a page of its own (an iframe of the same
// origin, "?jogoEditor=<token>": client/editor/playBridge.ts and playEmbed.ts), laid over the Game panel wherever
// it's docked and as big as it is. The page is the whole game as it always runs (boot() in client/main.ts) with
// its own renderer, physics world and sounds, so the editor's scene, physics and history are never touched; ■
// asks the game to let go of its mouse, sounds and WebGL context, then removes the page, and the browser frees
// everything it made. The page stays out of the dock's tree (moving an iframe in the page reloads it): it's placed
// over the panel at every frame, and hidden while another tab covers the panel.
import type { MapData } from '@shared/mapData';
import { BRIDGES, PLAY_PARAM, type BridgeWindow, type PlayBridge, type PlayControls } from './playBridge';
import type { GameRun } from './playMode';
import { et } from './strings';

/** How long a game may take to start before ▶ gives up. */
const START_TIMEOUT_MS = 120_000;

/** A game in the Game tab. */
export interface GameFrame extends GameRun {
  readonly frame: HTMLIFrameElement;
  /** Puts the page over the Game panel (called at every frame of the editor). */
  place(): void;
  /** The game's renderer's memory (null: not ready). */
  memory(): { geometries: number; textures: number } | null;
}

export interface LaunchOptions {
  /** Where the page goes (the editor's window), positioned over `panel`. */
  host: HTMLElement;
  /** The Game panel's body. */
  panel: HTMLElement;
  /** The map to play (sent as JSON: later edits don't reach the game). */
  data: MapData;
  /** The map's id on the server (null: a new map). */
  mapa: string | null;
  /** Aborted by ■ while the game is still starting: the page goes at once. */
  signal: AbortSignal;
  /** The game's own Exit (its pause menu). */
  onExit(): void;
}

let seq = 0;

/** Opens the game in the Game tab; resolves once its first frame is drawn. */
export function launchGame(o: LaunchOptions): Promise<GameFrame> {
  const w = window as BridgeWindow;
  const bridges: Map<string, PlayBridge> = (w[BRIDGES] ??= new Map<string, PlayBridge>());
  const token = `${Date.now().toString(36)}${(seq++).toString(36)}`;
  const frame = document.createElement('iframe');
  frame.className = 'ed-gameframe';
  frame.title = et('panelGame');
  frame.setAttribute('allow', 'autoplay; gamepad');
  const url = new URL(location.href);
  url.search = `?${PLAY_PARAM}=${token}`;
  url.hash = '';
  frame.src = url.href;

  let controls: PlayControls | null = null;
  let gone = false;
  const place = () => {
    if (gone) return;
    const r = o.panel.getBoundingClientRect();
    const h = o.host.getBoundingClientRect();
    const shown = o.panel.isConnected && !o.panel.hidden && r.width > 0 && r.height > 0;
    frame.style.visibility = shown ? 'visible' : 'hidden';
    if (!shown) return;
    const s = frame.style;
    const left = `${r.left - h.left}px`;
    const top = `${r.top - h.top}px`;
    const width = `${r.width}px`;
    const height = `${r.height}px`;
    if (s.left !== left || s.top !== top || s.width !== width || s.height !== height) Object.assign(s, { left, top, width, height });
  };
  const resize = new ResizeObserver(place);
  /** Lets go of the game: its own disposal first (mouse, sounds, WebGL context), then the page. */
  const dispose = () => {
    if (gone) return;
    gone = true;
    resize.disconnect();
    bridges.delete(token);
    try {
      controls?.dispose();
    } catch {
      /* the page is going anyway */
    }
    controls = null;
    frame.remove();
  };

  return new Promise<GameFrame>((resolve, reject) => {
    const fail = (message: string) => {
      clearTimeout(timer);
      dispose();
      reject(new Error(message));
    };
    const timer = setTimeout(() => fail(et('playTimeout')), START_TIMEOUT_MS);
    if (o.signal.aborted) return fail('abort');
    o.signal.addEventListener('abort', () => fail('abort'), { once: true });
    const run: GameFrame = {
      frame,
      place,
      pause: () => controls?.pause(),
      resume: () => {
        // The keyboard to the game, and its resume inside this click (the browser lets it take the mouse back).
        frame.focus();
        frame.contentWindow?.focus();
        controls?.resume();
      },
      dispose,
      memory: () => controls?.memory() ?? null,
    };
    bridges.set(token, {
      json: JSON.stringify(o.data),
      mapa: o.mapa,
      ready: (c) => {
        if (gone) return c.dispose();
        clearTimeout(timer);
        controls = c;
        frame.focus();
        frame.contentWindow?.focus();
        resolve(run);
      },
      failed: (m) => fail(m),
      exit: () => o.onExit(),
    });
    o.host.append(frame);
    resize.observe(o.panel);
    place();
  });
}
