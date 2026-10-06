// How the zombie side (client.ts) talks to its match: the server's connection online, the local match solo
// (local.ts). Kept apart from client.ts, which needs the browser, so the solo match can run (and be tested) without it.
import type { ClientMsg, ServerMsg } from '@shared/protocol';

export interface ZombieLink {
  readonly online: boolean;
  send(msg: ClientMsg): void;
  on<T extends ServerMsg['t']>(type: T, fn: (msg: Extract<ServerMsg, { t: T }>) => void): void;
  /** The match clock (ms). */
  now(): number;
  /** The match time zombies are drawn at (a little in the past, between two snapshots). */
  renderTime(): number;
}
