// Play inside the editor (PF-6 Revisions 01, etapa 4), without a screen: the toolbar's ▶ ❚❚ ■ as in Unity. ▶ plays
// the map being edited (not saved) in the Game tab; ❚❚ freezes the game and frees the mouse (▶, or ❚❚ again, goes
// on); ■ ends it, lets go of everything the game made and puts the editor back exactly where it was (the
// selection, the camera, the history). While it plays the editor can't edit: its shortcuts and its camera are
// off; paused, the camera and the selection work again (to look around the Scene and read the Hierarchy and the
// Inspector) but nothing changes the map. The game itself is client/editor/playHost.ts (a page of its own in
// the Game tab); here, the states, what each one allows and the session that starts and ends it.
// client/tests/editorPlay.test.ts runs it as is.
import type { EditorAction } from './shortcuts';

export type PlayState = 'editando' | 'jogando' | 'pausado';
export type PlayButton = 'play' | 'pause' | 'stop';

/** Where a button takes the editor from a state (null: the button does nothing there). */
export function transition(s: PlayState, b: PlayButton): PlayState | null {
  if (b === 'play') return s === 'jogando' ? null : 'jogando';
  if (b === 'pause') return s === 'jogando' ? 'pausado' : s === 'pausado' ? 'jogando' : null;
  return s === 'editando' ? null : 'editando';
}

/** The map can be changed (anything else is read-only). */
export const editable = (s: PlayState) => s === 'editando';

/** The Scene view's camera listens (flying, orbiting, framing). */
export const cameraOn = (s: PlayState) => s !== 'jogando';

/** Clicking and boxing in the Scene view pick things. */
export const pickingOn = (s: PlayState) => s !== 'jogando';

/** The keys that only look (never change the map): paused, they still work. */
const LOOKING: ReadonlySet<EditorAction> = new Set<EditorAction>(['focus', 'clear', 'copy', 'selectAll']);

/** Whether an editor shortcut works in a state: all while editing, the looking ones paused, none while playing. */
export function shortcutAllowed(s: PlayState, a: EditorAction): boolean {
  if (s === 'editando') return true;
  return s === 'pausado' && LOOKING.has(a);
}

/** How each toolbar button shows: pressed (`on`) and usable (`enabled`). */
export function buttonsOf(s: PlayState): Record<PlayButton, { on: boolean; enabled: boolean }> {
  return {
    play: { on: s !== 'editando', enabled: s !== 'jogando' },
    pause: { on: s === 'pausado', enabled: s !== 'editando' },
    stop: { on: false, enabled: s !== 'editando' },
  };
}

/** A game running in the Game tab. */
export interface GameRun {
  /** Freezes it and frees the mouse. */
  pause(): void;
  /** Goes on (called from the button's click: the game may take the mouse back at once). */
  resume(): void;
  /** Ends it and lets go of everything it made. */
  dispose(): void;
}

/** What the editor keeps at ▶ and gets back at ■. */
export interface EditorSnapshot<S> {
  take(): S;
  restore(s: S): void;
}

/**
 * The play session: its state, the editor's snapshot taken at ▶ (given back at ■) and the game running. Every
 * game started is disposed exactly once: at ■, when it ends by itself (its own Exit), or as soon as it's ready if
 * ■ came while it was still loading.
 */
export class PlaySession<S> {
  state: PlayState = 'editando';
  private snap: S | null = null;
  private run: GameRun | null = null;
  /** Bumped by every ▶ from the editing state and every ■: a game that's ready late for its session is let go. */
  private token = 0;
  /** ❚❚ pressed while the game was loading: it starts paused. */
  private pauseOnReady = false;
  /** Aborted by ■ while the game is still loading (its page goes at once). */
  private loading: AbortController | null = null;
  /** The state changed. */
  onState: (s: PlayState) => void = () => {};
  /** The game couldn't start (the session is back to editing). */
  onError: (err: unknown) => void = () => {};

  constructor(
    private readonly editor: EditorSnapshot<S>,
    private readonly launch: (signal: AbortSignal) => Promise<GameRun>,
  ) {}

  /** A toolbar button (synchronous up to the game's resume: the click's user activation reaches it). */
  press(b: PlayButton): Promise<void> {
    const next = transition(this.state, b);
    if (!next) return Promise.resolve();
    if (b === 'stop') {
      this.stop();
      return Promise.resolve();
    }
    if (this.state === 'editando') return this.start();
    if (next === 'pausado') {
      if (this.run) this.run.pause();
      else this.pauseOnReady = true;
    } else {
      this.pauseOnReady = false;
      this.run?.resume();
    }
    this.set(next);
    return Promise.resolve();
  }

  /** The game ended by itself (its menu's Exit): back to editing, as ■. */
  ended() {
    if (this.state !== 'editando') this.stop();
  }

  /** The game running (null: editing, or still loading). */
  get game() {
    return this.run;
  }

  private async start() {
    this.snap = this.editor.take();
    const token = ++this.token;
    this.pauseOnReady = false;
    this.set('jogando');
    const loading = (this.loading = new AbortController());
    let run: GameRun;
    try {
      run = await this.launch(loading.signal);
    } catch (err) {
      if (token !== this.token) return;
      this.stop();
      this.onError(err);
      return;
    }
    if (token !== this.token) {
      // ■ came while it loaded: it goes at once.
      run.dispose();
      return;
    }
    this.run = run;
    this.loading = null;
    if (this.pauseOnReady) {
      this.pauseOnReady = false;
      run.pause();
    }
  }

  private stop() {
    this.token++;
    this.loading?.abort();
    this.loading = null;
    const run = this.run;
    this.run = null;
    this.pauseOnReady = false;
    run?.dispose();
    const snap = this.snap;
    this.snap = null;
    if (snap !== null) this.editor.restore(snap);
    this.set('editando');
  }

  private set(s: PlayState) {
    if (s === this.state) return;
    this.state = s;
    this.onState(s);
  }
}

/**
 * P52: whether the game, its map built, starts at once (takes the mouse and starts the sound, as its "Jogar" card
 * would): while the ▶ click's user activation still counts in its page (the UserActivation API; a browser without it:
 * the card asks for a click).
 */
export function autoStarts(nav: { userActivation?: { isActive: boolean } | null }): boolean {
  return nav.userActivation?.isActive ?? false;
}
