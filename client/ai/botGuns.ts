// The gun a bot draws for each life in mata-mata (client/ai/bot.ts equips it). Pure, no meshes: the tests check
// the shares (client/tests/offlineModes.test.ts).
import { PRIMARIES, SECONDARIES, type GunId } from '@shared/progression';

/**
 * The gun a bot takes for a life (no upgrades): mostly a rifle (60%), any of them alike, otherwise a secondary,
 * any of them alike too. Bots have no account, so no weapon is locked for them.
 */
export function pickGun(rand: () => number = Math.random): GunId {
  const list = rand() < 0.6 ? PRIMARIES : SECONDARIES;
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
}
