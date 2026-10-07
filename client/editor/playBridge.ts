// What crosses between the editor and the game it plays in its Game tab (PF-6 Revisions 01, etapa 4). The game runs
// in a page of its own inside the tab (an iframe of the same origin, client/editor/playHost.ts): the same boot()
// as always, with its own renderer, physics and sounds, so stopping it lets go of all of them at once. The page is
// opened as "?jogoEditor=<token>"; it finds its bridge on the editor's window by that token, takes the map from it
// (as JSON: the editor's objects stay on its side), and hands back what the editor drives it with.

/** The query parameter that makes a page the editor's game. */
export const PLAY_PARAM = 'jogoEditor';

/** What the game hands the editor once it's ready (the editor's ▶ ❚❚ ■). */
export interface PlayControls {
  /** Freezes the game (no simulation, no drawing) and frees the mouse. */
  pause(): void;
  /** Goes on: takes the mouse back if the browser allows (the click on ▶ reaches the game's page). */
  resume(): void;
  /** Ends it: lets go of the mouse, the sounds and the renderer's context (the editor then removes the page). */
  dispose(): void;
  /** The game's renderer's memory (for the checks of Play and Stop over and over). */
  memory(): { geometries: number; textures: number };
}

/** The editor's side of the bridge, kept on its window by token. */
export interface PlayBridge {
  /** The map to play, as JSON (the document being edited, not saved). */
  json: string;
  /** The map's id on the server (null: a new map). */
  mapa: string | null;
  /** The game is ready (its first frame drawn). */
  ready(c: PlayControls): void;
  /** The game didn't start. */
  failed(message: string): void;
  /** The game's own Exit (its pause menu): the editor stops it, as ■. */
  exit(): void;
}

/** The editor's window keeps the bridges here, by token. */
export const BRIDGES = '__ocPlayBridges';

export type BridgeWindow = Window & { [BRIDGES]?: Map<string, PlayBridge> };
