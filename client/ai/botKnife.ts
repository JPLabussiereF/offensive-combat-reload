// When a bot swings its knife. A bot only starts a swing with the target in reach and in front of it (the
// knife's cone, like the player's, see client/weapons/melee.ts), after a short hesitation of its skill, and it
// gets one chance per approach: after a swing, hit or miss, it can't swing at that target again until it has
// backed off past KNIFE_REARM. Pure (no scene, no physics), so it's unit-tested.

/** Horizontal distance (m) a bot must open from a target it swung at before it gets a new chance at it. */
export const KNIFE_REARM = 5;

export class BotKnife {
  /** Targets already swung at on this approach. */
  private spent = new Set<number>();
  /** The target in reach and when the hesitation ends (null: nobody in reach). */
  private pending: { id: number; at: number } | null = null;

  /** Whether the bot still has its chance at target `id`, now `dist` m away (backing off gives it back). */
  hasChance(id: number, dist: number): boolean {
    if (dist > KNIFE_REARM) this.spent.delete(id);
    return !this.spent.has(id);
  }

  /**
   * One engage tick against target `id`, `dist` m away: true when the swing starts now (the chance is then
   * spent). `ready`: the knife can swing (cooldown and reaction over, not mid-swing) and the target is in reach
   * and in front; once it is, the bot still waits `delay` s, and the wait starts over whenever that stops.
   */
  shouldSwing(t: number, id: number, dist: number, ready: boolean, delay: number): boolean {
    const chance = this.hasChance(id, dist);
    if (!ready || !chance) {
      this.pending = null;
      return false;
    }
    if (this.pending?.id !== id) this.pending = { id, at: t + delay };
    if (t < this.pending.at) return false;
    this.pending = null;
    this.spent.add(id);
    return true;
  }

  /** A new life: every chance back. */
  reset() {
    this.spent.clear();
    this.pending = null;
  }
}
