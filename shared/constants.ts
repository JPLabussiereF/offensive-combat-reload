// Movement feel (section 4, proposed values). Shared so the server can run the same simulation.
export const MOVE = {
  walkSpeed: 5.5,
  sprintSpeed: 8.0,
  crouchSpeed: 2.8,
  adsSpeed: 3.5,
  jumpHeight: 1.1,
  gravity: 22,
  groundAccel: 60,
  airControl: 0.3,
  eyeStand: 1.65,
  eyeCrouch: 1.05,
  stepHeight: 0.4,
  maxSlopeDeg: 45,
  fallDamageHeight: 6,
  fallDamagePerMeter: 15,
  /** Player collider is an upright cylinder: flat sides give Rapier horizontal contact normals, which autostep needs. */
  radius: 0.35,
  heightStand: 1.8,
  heightCrouch: 1.2,
  crouchTransition: 10,
  /** Slide (sprint + crouch): burst of speed that bleeds off; you can aim and shoot while sliding. */
  slideBoost: 2.2,
  slideMaxSpeed: 10.5,
  slideFriction: 7.5,
  slideMaxTime: 0.9,
  slideMinSpeed: 3.4,
  slideCooldown: 0.5,
  /** How fast the slide direction turns toward the movement keys (rad/s). */
  slideSteer: 1.2,
} as const;

export const HEALTH = {
  max: 100,
  regenDelay: 4,
  regenPerSecond: 25,
  lowThreshold: 30,
} as const;

/**
 * The Dragon Cherry (courtyard of "Jardim do Dragão"): picking it up raises the maximum health by
 * `extraHealth` for `duration` seconds and heals that much at once. A new one falls from the tree
 * `respawn` seconds later. `radius`: how close the feet must be (the server allows some lag on top).
 */
export const CHERRY = {
  extraHealth: 50,
  duration: 30,
  respawn: 45,
  radius: 1.2,
} as const;

/**
 * The Scooby biscuit (the mansion kitchen's cabinet in "Vila Assombrada"): heals to full health. Another
 * one is in the cabinet `respawn` seconds later. `radius`: how close the feet must be.
 */
export const BISCUIT = {
  respawn: 60,
  radius: 1.1,
} as const;

/**
 * The giant rat at the end of the sewer's dead end ("Vila Assombrada", RATS in maps.ts). It goes down after
 * `hits` bullets (a stab counts `stab`); whoever brings it down gets a humanity, as in Dark Souls:
 * `extraHealth` more max health until they die (one at a time). It's back `respawn` seconds later.
 * `range`: how far from it the killer may be (the server checks their last position).
 */
/**
 * The witch's potions ("Vila Assombrada", WITCHES in maps.ts): each drink is a random effect. The duck
 * (grenades look and sound like rubber ducks) is only a look and lasts until death; the others change the
 * balance and last `duration` seconds: faster or slower movement, every bullet a critical (head damage),
 * or drunk (worse spread and recoil, a swaying view). One drink every `cooldown` seconds; `radius`: how
 * close to the witch.
 */
export const POTION = {
  kinds: ['pato', 'veloz', 'lerdo', 'critico', 'bebado'],
  duration: 60,
  cooldown: 60,
  fastSpeed: 1.3,
  slowSpeed: 0.7,
  drunkSpread: 2.5,
  drunkRecoil: 1.8,
  radius: 2.4,
} as const;

export type PotionKind = (typeof POTION.kinds)[number];

export const RAT = {
  hits: 14,
  stab: 4,
  respawn: 120,
  extraHealth: 50,
  range: 30,
} as const;

/**
 * The koi of "Jardim do Dragão" (FISH in maps.ts): shot or stabbed, a fish gives `xp` account XP and
 * comes back `respawn` seconds later (a random time in the range). Each one that comes back has a
 * `goldenChance` of being a golden carp, which glows: it gives `goldenXp` and, for `goldenDuration`
 * seconds or until the player dies, sharper aim (spread and recoil multiplied by `spreadMul`/`recoilMul`).
 * `range`: how far from its loop the shooter can be (the server checks it against their last position).
 */
export const KOI = {
  xp: 1,
  goldenXp: 100,
  goldenChance: 0.05,
  respawn: [25, 45],
  goldenDuration: 60,
  spreadMul: 0.5,
  recoilMul: 0.6,
  range: 80,
} as const;

/** Points per action (section 6). Computed server-side once multiplayer exists. */
export const SCORE = {
  kill: 100,
  headshot: 50,
  longShot: 50,
  longShotDistance: 50,
  knife: 50,
  backstab: 50,
  groin: 100,
  // Tripled: dancing on a body leaves you exposed for 3 s, it has to pay off.
  humiliation: 150,
} as const;

/** Humiliation (section 8): the corpse can be taunted for a few seconds after the kill. */
export const HUMILIATION = {
  window: 6,
  radius: 2,
  duration: 3.2,
} as const;

export const SIM = {
  dt: 1 / 60,
  maxStepsPerFrame: 5,
} as const;

// Rapier interaction groups: (membership << 16) | filter.
export const GROUP = {
  WORLD: 0x0001,
  PLAYER: 0x0002,
  HITBOX: 0x0004,
  BULLET: 0x0008,
  BLOCKER: 0x0010,
  PROJECTILE: 0x0020,
} as const;

export const groups = (membership: number, filter: number) => ((membership & 0xffff) << 16) | (filter & 0xffff);
