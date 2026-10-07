// The player's weapon progression, owned by the account on the server: points only come from online kills
// the server validated (it sends 'progresso'), and every mode uses the account's levels and Arsenal choice
// (secondary gun, optional upgrades turned on, common ones turned off). Without an account everything stays at
// level 1 (the locked weapons stay locked), and the choice made in the Arsenal only lasts for this match.
// With one, every change is saved to the account, one save at a time; a save that fails puts back the last
// choice the server accepted and tells the onSaveError listeners.
import type { ProfileResponse } from '@shared/account';
import {
  DEFAULT_CHOICE,
  levelForXp,
  levelsOfXp,
  NO_XP,
  pointsToUnlock,
  PROG_WEAPONS,
  sanitizeChoice,
  upgradeOf,
  weaponUnlocked,
  type ArsenalChoice,
  type GunId,
  type Levels,
  type ProgWeapon,
  type WeaponXp,
} from '@shared/progression';
import { resolveLoadout, type Loadout } from '@shared/arsenal';
import type { ServerMsg } from '@shared/protocol';
import { api } from '../net/api';

export class Progress {
  private xpOf: WeaponXp = { ...NO_XP };
  private chosen: ArsenalChoice = DEFAULT_CHOICE;
  /** The last choice the account holds (what a failed save goes back to). */
  private confirmed: ArsenalChoice = DEFAULT_CHOICE;
  /** A save is on its way; `queued` is the newest choice made meanwhile (it carries every change before it). */
  private inFlight: Promise<void> | null = null;
  private queued: ArsenalChoice | null = null;
  private listeners = new Set<() => void>();
  private saveErrorListeners = new Set<() => void>();
  readonly signedIn: boolean;

  constructor(profile: ProfileResponse | null) {
    this.signedIn = !!profile;
    if (!profile) return;
    for (const w of PROG_WEAPONS) this.xpOf[w] = Math.max(0, Math.floor(profile.armas[w]?.xp ?? 0));
    this.chosen = this.confirmed = sanitizeChoice(profile.arsenal, this.xpOf);
  }

  private changed() {
    for (const f of this.listeners) f();
  }

  onChange(f: () => void) {
    this.listeners.add(f);
  }

  /** A change could not be saved: the choice already went back to the account's. */
  onSaveError(f: () => void) {
    this.saveErrorListeners.add(f);
  }

  xp(w: ProgWeapon): number {
    return this.xpOf[w];
  }

  /** The points of every weapon (a copy). */
  get weaponXp(): WeaponXp {
    return { ...this.xpOf };
  }

  /** Highest level unlocked for `w`. */
  level(w: ProgWeapon): number {
    return levelForXp(w, this.xpOf[w]);
  }

  get levels(): Levels {
    return levelsOfXp(this.xpOf);
  }

  /** Whether the player may carry `w` (the SMG waits for the pistol's level). */
  unlocked(w: ProgWeapon): boolean {
    return weaponUnlocked(w, this.xpOf);
  }

  /** Points still needed with the weapon before `w` to unlock it (0 when unlocked). */
  toUnlock(w: ProgWeapon): number {
    return pointsToUnlock(w, this.xpOf);
  }

  get choice(): ArsenalChoice {
    return this.chosen;
  }

  /** What the player plays with: the choice at the current levels. */
  get loadout(): Loadout {
    return resolveLoadout(this.chosen, this.levels);
  }

  /** Whether an upgrade is in effect (unlocked, not turned off, not replaced by an optional one of its group). */
  isOn(w: ProgWeapon, id: string): boolean {
    return this.loadout.ativas[w].includes(id);
  }

  /**
   * Turns an unlocked upgrade on or off. One per group: an optional one on replaces the group's common ones,
   * and turning a common one on turns the group's optional one off.
   */
  toggle(w: ProgWeapon, id: string, on: boolean): boolean {
    const u = upgradeOf(w, id);
    if (!u || u.nivel > this.level(w) || this.isOn(w, id) === on) return false;
    let ligadas = (this.chosen.ligadas[w] ?? []).filter((x) => x !== id);
    let desligadas = (this.chosen.desligadas?.[w] ?? []).filter((x) => x !== id);
    if (u.opcional) {
      if (on) ligadas = [...ligadas, id];
    } else if (on) {
      if (u.grupo) ligadas = ligadas.filter((x) => upgradeOf(w, x)?.grupo !== u.grupo);
    } else desligadas = [...desligadas, id];
    return this.choose({ ...this.chosen, ligadas: { ...this.chosen.ligadas, [w]: ligadas }, desligadas: { ...this.chosen.desligadas, [w]: desligadas } });
  }

  /** Puts another gun in the secondary slot (not a locked one). */
  setSecondary(gun: GunId): boolean {
    if (gun === this.chosen.secundaria || !this.unlocked(gun)) return false;
    return this.choose({ ...this.chosen, secundaria: gun });
  }

  /** Keeps a new choice (cleaned against the points) and saves it to the account. */
  private choose(next: ArsenalChoice): boolean {
    const clean = sanitizeChoice(next, this.xpOf);
    if (JSON.stringify(clean) === JSON.stringify(this.chosen)) return false;
    this.chosen = clean;
    if (this.signedIn) this.save(clean);
    else this.confirmed = clean;
    this.changed();
    return true;
  }

  /** Sends `choice` now, or after the save on its way (only the newest waiting choice is sent). */
  private save(choice: ArsenalChoice) {
    if (this.inFlight) {
      this.queued = choice;
      return;
    }
    this.inFlight = api('PATCH', '/api/perfil', { arsenal: choice }).then(
      () => {
        this.confirmed = choice;
      },
      () => {
        // A newer choice is waiting: it carries this change too, so it goes on. Otherwise back to the account's.
        if (this.queued) return;
        this.chosen = this.confirmed;
        this.changed();
        for (const f of this.saveErrorListeners) f();
      },
    ).finally(() => {
      this.inFlight = null;
      const next = this.queued;
      this.queued = null;
      if (next) this.save(next);
    });
  }

  /** Resolves once every change made so far was saved or put back. */
  async settled(): Promise<void> {
    while (this.inFlight) await this.inFlight;
  }

  /** Progress pushed by the game server. */
  applyServer(m: Pick<Extract<ServerMsg, { t: 'progresso' }>, 'armas' | 'escolha'>) {
    for (const w of PROG_WEAPONS) this.xpOf[w] = Math.max(0, Math.floor(m.armas[w]?.xp ?? 0));
    this.chosen = this.confirmed = sanitizeChoice(m.escolha, this.xpOf);
    this.changed();
  }
}
