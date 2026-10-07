// What a built map gives the game (client/world/mapLoader.ts builds it from the map data): spawns, training
// dummies, the colliders' gags, the sound's rooms, the animated props' per-frame update and the map's
// critters, collectibles and rewards.
import type * as THREE from 'three';
import type { PotionKind } from '@shared/constants';
import type { Atmosphere } from '../render/renderer';
import type { RoomVolume } from '../audio/spatial';
import type { MapBuilder, WallOpening } from './mapBuilder';
import type { PropBus } from './props';
import type { ChowChow, DogSfx } from './dog';
import type { HydrantSfx } from './hydrant';
import type { HauntedSfx } from './catalog/haunted';
import type { CemeterySfx } from './catalog/cemetery';
import type { GardenSfx } from './jardim/kit';

export interface SpawnPoint {
  position: THREE.Vector3;
  yaw: number;
}

export interface DummySpot {
  position: THREE.Vector3;
  /** Facing, same convention as the camera (yaw 0 faces -Z). */
  yaw: number;
  /** Strafe axis and amplitude in meters (omitted = stationary). */
  patrol?: { axis: 'x' | 'z'; amplitude: number; speed: number };
}

export interface MapFrame {
  /** Local player's feet (proximity gags). */
  feet: THREE.Vector3;
  /** Camera position (where sounds are heard from). */
  listener: THREE.Vector3;
  /** Throws the local player (hydrant). */
  launch(vx: number, vy: number, vz: number): void;
  /** Game clock (s): the simulation's offline, the server's online. Shared timing (the fish swim on it). */
  readonly time: number;
}

/** What a shot or a knife hit among the map's critters. */
export interface CritterHit {
  point: THREE.Vector3;
  /** A fish (its id in the map's objects): what killing it gives is the game's call. Null for fruit (the map handles it). */
  fish: { id: string; golden: boolean } | null;
}

/** Small things shots and the knife hit without a collider of their own: fish, the fruit on a tree. */
export interface MapCritters {
  /** The first one the shot from `o` along `dir` (unit) goes through within `dist`; fruit falls right away. */
  shot(o: THREE.Vector3, dir: THREE.Vector3, dist: number): CritterHit | null;
  /** The nearest one in reach of a knife swing from `eye` looking along `fwd` (unit). */
  stab(eye: THREE.Vector3, fwd: THREE.Vector3, reach: number): CritterHit | null;
}

/** The map's fish (MapData.objetos.peixes): the game tells them when they die and how they come back. */
export interface MapFish {
  /** Killed: dies now, back at `ready` (game clock), golden or not. */
  kill(id: string, ready: number, golden: boolean): void;
  /** How it is right now (joining a session): dead until `ready` (0: alive), golden when there. */
  set(id: string, ready: number, golden: boolean): void;
  isAlive(id: string): boolean;
}

/** The giant rats (MapData.objetos.ratos): the game says when one dies and when it's back. */
export interface MapRats {
  /** Dead now (an animation), back at `ready` (game clock). */
  kill(id: string, ready: number): void;
  /** As it is right now (joining a session): dead until `ready`. */
  set(id: string, ready: number): void;
}

/** Something to drink by pressing the taunt key nearby (the witch's potion): the game applies the effect. */
export interface MapPotion {
  /** Feet position to stand near. */
  at: THREE.Vector3;
  radius: number;
  /** Someone drank it (`kind`: what it did): the map reacts (the witch cackles). */
  drink(kind: PotionKind): void;
}

export interface MapRewards {
  /** We brought a giant rat down (our hits): the game claims its humanity (online, from the server). */
  ratDown: ((id: string) => void) | null;
  /** We knocked down the last target of a shooting gallery: the sharp-aim bonus. */
  aimBonus: (() => void) | null;
}

/** A collectible lying on the map (the cherry, the biscuit): the game decides who takes it and what it does; the map shows it. */
export interface MapPickup {
  readonly id: string;
  /** Feet position it's taken from. */
  readonly position: THREE.Vector3;
  /** There to be taken right now (not taken, not still falling back). */
  readonly available: boolean;
  /** Taken: it pops and disappears. */
  take(): void;
  /** Grown back: it comes back (the cherry falls from its tree). */
  restore(): void;
}

export interface GameMap {
  spawnsA: SpawnPoint[];
  spawnsB: SpawnPoint[];
  /** Neutral spawns spread over the map for free-for-all (section 10: 16-20 of them). */
  spawnsFFA: SpawnPoint[];
  dummies: DummySpot[];
  killY: number;
  stats: MapBuilder['stats'];
  /** Every hole left in a wall (doors and windows), for automated structure checks. */
  openings: WallOpening[];
  /** Enclosed places marked by hand (room pieces, ROOM_ boxes in glTF), for the sound's echo and muffling. */
  rooms: RoomVolume[];
  /** Gags synchronized between players online. */
  props: PropBus;
  /** Per-frame updates for animated props and proximity gags. */
  update(dt: number, frame: MapFrame): void;
  /** Amora, the doghouse's Chow Chow: bites (kills) anyone who steps in front of her door. */
  dog: ChowChow | null;
  /** Collectibles (positions match the map's objects, which the server checks against). */
  pickups?: MapPickup[];
  /** Half size (m) the sun's shadow must cover, when the map is bigger than the default. */
  shadowExtent?: number;
  critters?: MapCritters;
  fish?: MapFish;
  /** Giant rats: the game says when one dies and when it's back. */
  rats?: MapRats;
  /** The witch's potion (grenades become rubber ducks until death). */
  potion?: MapPotion;
  /** Rewards the map hands out; the game fills in what each one does (see main.ts). */
  rewards?: MapRewards;
  /** Its own sky and light (default: the sunny day of createRenderContext). */
  atmosphere?: Atmosphere;
}

/** Every sound a map's pieces may play. */
export interface MapSfx extends HydrantSfx, DogSfx, HauntedSfx, CemeterySfx, GardenSfx {
  iceCream(): void;
  squeak(): void;
}
