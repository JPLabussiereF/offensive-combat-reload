// Zumbi, online: out until the break (bled out, or joined during a wave), we watch a teammate through their eyes,
// switching with D and F. Pure functions only (no DOM, no three.js): main.ts moves the camera and the
// client tests check the rules (client/tests/zombieSpectate.test.ts).
import { FLAG } from '@shared/protocol';
import { MOVE } from '@shared/constants';

/** Seconds after dying before the view goes to a teammate (the death itself is seen first). */
export const SPECTATE_DELAY = 2;

/** A downed player's eyes, as a fraction of standing (the same as our own view when down). */
export const DOWNED_EYE = 0.32;

/**
 * Who to watch among the teammates that can be watched (`ids`, alive ones): `current` moved `step` places along
 * them by id (wrapping around), or `current` itself with no step. When `current` can't be watched any more (gone
 * down for good, left) or there's none yet, the one after it by id, or the first, whatever the step.
 */
export function pickSpectate(ids: readonly number[], current: number | null, step: number): number | null {
  if (!ids.length) return null;
  const list = [...ids].sort((a, b) => a - b);
  const i = current === null ? -1 : list.indexOf(current);
  if (i < 0) {
    const after = current === null ? -1 : list.findIndex((id) => id > current);
    return list[after < 0 ? 0 : after];
  }
  const n = list.length;
  return list[(((i + step) % n) + n) % n];
}

/** The watched teammate's eye height over their feet, from their flags (crouched) and whether they're down. */
export function spectateEye(flags: number, downed: boolean): number {
  if (downed) return MOVE.eyeStand * DOWNED_EYE;
  return flags & FLAG.crouch ? MOVE.eyeCrouch : MOVE.eyeStand;
}
