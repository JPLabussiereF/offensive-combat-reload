// The player's weapon progression, owned by the account on the server: points only come from online kills
// the server validated (it sends 'progresso'), and every mode uses the account's levels and Arsenal choice
// (secondary gun, optional upgrades turned on). Without an account everything stays at level 1, and the
// choice made in the Arsenal only lasts for this match.
import type { ProfileResponse } from '@shared/account';
import { DEFAULT_CHOICE, levelForXp, PROG_WEAPONS, sanitizeChoice, upgradeOf, type ArsenalChoice, type GunId, type Levels, type ProgWeapon } from '@shared/progression';
import { resolveLoadout, type Loadout } from '@shared/arsenal';
import type { ServerMsg } from '@shared/protocol';
import { api } from '../net/api';

export class Progress {
  private xpOf: Record<ProgWeapon, number> = { rifle: 0, pistola: 0, smg: 0, faca: 0, granada: 0 };
  private chosen: ArsenalChoice = DEFAULT_CHOICE;
  private listeners = new Set<() => void>();
  readonly signedIn: boolean;

  constructor(profile: ProfileResponse | null) {
    this.signedIn = !!profile;
    if (!profile) return;
    for (const w of PROG_WEAPONS) this.xpOf[w] = Math.max(0, Math.floor(profile.armas[w]?.xp ?? 0));
    this.chosen = sanitizeChoice(profile.arsenal, this.levels);
  }

  private changed() {
    for (const f of this.listeners) f();
  }

  onChange(f: () => void) {
    this.listeners.add(f);
  }

  xp(w: ProgWeapon): number {
    return this.xpOf[w];
  }

  /** Highest level unlocked for `w`. */
  level(w: ProgWeapon): number {
    return levelForXp(w, this.xpOf[w]);
  }

  get levels(): Levels {
    return Object.fromEntries(PROG_WEAPONS.map((w) => [w, this.level(w)])) as Levels;
  }

  get choice(): ArsenalChoice {
    return this.chosen;
  }

  /** What the player plays with: the choice at the current levels. */
  get loadout(): Loadout {
    return resolveLoadout(this.chosen, this.levels);
  }

  /** Whether an optional upgrade is turned on. */
  isOn(w: ProgWeapon, id: string): boolean {
    return this.chosen.ligadas[w]?.includes(id) ?? false;
  }

  /** Turns an optional upgrade on or off (one per group: turning one on turns its group's other off). */
  toggle(w: ProgWeapon, id: string, on: boolean): boolean {
    const u = upgradeOf(w, id);
    if (!u?.opcional || u.nivel > this.level(w) || this.isOn(w, id) === on) return false;
    const list = (this.chosen.ligadas[w] ?? []).filter((x) => x !== id);
    return this.choose({ ...this.chosen, ligadas: { ...this.chosen.ligadas, [w]: on ? [...list, id] : list } });
  }

  /** Puts another gun in the secondary slot. */
  setSecondary(gun: GunId): boolean {
    if (gun === this.chosen.secundaria) return false;
    return this.choose({ ...this.chosen, secundaria: gun });
  }

  /** Keeps a new choice (cleaned against the levels) and saves it to the account. */
  private choose(next: ArsenalChoice): boolean {
    const clean = sanitizeChoice(next, this.levels);
    if (JSON.stringify(clean) === JSON.stringify(this.chosen)) return false;
    this.chosen = clean;
    if (this.signedIn) api('PATCH', '/api/perfil', { arsenal: clean }).catch(() => {});
    this.changed();
    return true;
  }

  /** Progress pushed by the game server. */
  applyServer(m: Pick<Extract<ServerMsg, { t: 'progresso' }>, 'armas' | 'escolha'>) {
    for (const w of PROG_WEAPONS) this.xpOf[w] = Math.max(0, Math.floor(m.armas[w]?.xp ?? 0));
    this.chosen = sanitizeChoice(m.escolha, this.levels);
    this.changed();
  }
}
