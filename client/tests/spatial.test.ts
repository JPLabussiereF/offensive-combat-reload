import { describe, expect, it } from 'bun:test';
import {
  BodySounds,
  distanceGain,
  echoSends,
  Enclosure,
  enclosureCutoff,
  occluderWeight,
  pathOcclusion,
  RoomVolumes,
  selfSends,
  SPATIAL_KINDS,
  voiceParams,
  type CastFn,
  type Vec,
  type Walker,
} from '../audio/spatial';

const walker = (x: number, over: Partial<Walker> = {}): Walker => ({
  feet: { x, y: 0, z: 0 },
  alive: true,
  grounded: true,
  sprint: false,
  crouch: false,
  slide: false,
  reload: false,
  ...over,
});

/** Walks someone along x at `speed` m/s for `seconds`, collecting the sounds. */
function walk(sounds: BodySounds, speed: number, seconds: number, over: Partial<Walker> = {}) {
  const out = [];
  const dt = 1 / 60;
  for (let t = 0, x = 0; t < seconds; t += dt, x += speed * dt) out.push(...sounds.update(1, walker(x, over), dt));
  return out;
}

describe('spatial sound', () => {
  it('a wall muffles and lowers a sound without silencing it; thin paper barely does', () => {
    const clear = voiceParams(10, 0);
    const wall = voiceParams(10, 1);
    const two = voiceParams(10, 2);
    const paper = voiceParams(10, 0.25);
    expect(clear.gain).toBe(1);
    expect(wall.gain).toBeLessThan(0.7);
    expect(wall.cutoff).toBeLessThan(2000);
    expect(two.gain).toBeLessThan(wall.gain);
    expect(two.gain).toBeGreaterThan(0);
    expect(paper.gain).toBeGreaterThan(0.85);
    expect(paper.cutoff).toBeGreaterThan(wall.cutoff * 3);
  });

  it('far sounds are duller (air) and quieter', () => {
    expect(voiceParams(100, 0).cutoff).toBeLessThan(voiceParams(5, 0).cutoff);
    const gun = SPATIAL_KINDS.gun;
    expect(distanceGain(2, gun)).toBe(1);
    expect(distanceGain(60, gun)).toBeLessThan(distanceGain(20, gun));
    // A gunshot carries much farther than a footstep.
    expect(distanceGain(30, gun)).toBeGreaterThan(distanceGain(30, SPATIAL_KINDS.step) * 2);
  });

  it('a spot under a roof with walls around is enclosed; an open field is not', () => {
    const room: CastFn = () => 3;
    const field: CastFn = () => null;
    expect(new Enclosure(room).at({ x: 0, y: 0, z: 0 })).toBeGreaterThan(0.9);
    expect(new Enclosure(field).at({ x: 0, y: 0, z: 0 })).toBe(0);
    // Cached per cell: the second lookup casts no rays.
    let casts = 0;
    const counting = new Enclosure(() => (casts++, null));
    counting.at({ x: 0.5, y: 0, z: 0.5 });
    const first = casts;
    counting.at({ x: 1.2, y: 0.3, z: 1.1 });
    expect(casts).toBe(first);
  });

  it('a point inside a marked room takes its enclosure; overlapping rooms, the most enclosed', () => {
    const rooms = new RoomVolumes([
      { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 4, z: 8 }, enclosure: 1 },
      { min: { x: 10, y: 0, z: 0 }, max: { x: 13, y: 3, z: 8 }, enclosure: 0.4 },
    ]);
    expect(rooms.at({ x: 5, y: 1.6, z: 4 })).toBe(1);
    expect(rooms.at({ x: 12, y: 1.6, z: 4 })).toBe(0.4);
    expect(rooms.at({ x: 10, y: 1.6, z: 4 })).toBe(1);
    expect(rooms.at({ x: 20, y: 1.6, z: 4 })).toBeNull();
    expect(rooms.at({ x: 5, y: 5, z: 4 })).toBeNull();
    // The marked room wins over the rays, even where they would see nothing around.
    const enc = new Enclosure(() => null, [{ min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 3, z: 4 }, enclosure: 0.5 }]);
    expect(enc.at({ x: 2, y: 1.5, z: 2 })).toBe(0.5);
    expect(enc.at({ x: 8, y: 1.5, z: 2 })).toBe(0);
  });

  it('outside the marked rooms: a ray starting inside a collider (hit at 0) is not a wall', () => {
    expect(new Enclosure(() => 0).at({ x: 0, y: 0, z: 0 })).toBe(0);
    expect(new Enclosure(() => 0).at({ x: 0, y: 0, z: 0 })).not.toBe(1);
  });

  it('a lone wall 10 m away barely encloses; a high roof or a roof without walls around is no ceiling', () => {
    const wallEast: CastFn = (_o, d) => (d.x > 0.9 ? 10 : null);
    expect(new Enclosure(wallEast).at({ x: 0, y: 0, z: 0 })).toBeLessThan(0.3);
    // An eave overhead with only one wall nearby (standing beside a house): not inside.
    const eave: CastFn = (_o, d) => (d.y > 0.5 ? 2 : d.x > 0.9 ? 1 : null);
    expect(new Enclosure(eave).at({ x: 0, y: 0, z: 0 })).toBeLessThan(0.3);
    // Walls around but the "roof" is 10 m up (a tree, a high balcony): only the walls count.
    let maxUp = 0;
    const highRoof: CastFn = (_o, d, max) => {
      if (d.y > 0.5) {
        maxUp = max;
        return 10 <= max ? 10 : null;
      }
      return 3;
    };
    expect(new Enclosure(highRoof).at({ x: 0, y: 0, z: 0 })).toBeLessThanOrEqual(0.4 + 1e-9);
    expect(maxUp).toBeLessThanOrEqual(8);
  });

  it('measures from the real position, not the middle of its 2 m cell', () => {
    const origins: Vec[] = [];
    new Enclosure((o) => (origins.push({ ...o }), null)).at({ x: 0.3, y: 1, z: 1.7 });
    expect(origins.length).toBeGreaterThan(0);
    for (const o of origins) {
      expect(o.x).toBeCloseTo(0.3);
      expect(o.z).toBeCloseTo(1.7);
    }
  });

  it('a shot 20 m away in the open with a clear view: no room echo and no muffling', () => {
    const enc = new Enclosure(() => null).at({ x: 20, y: 1.4, z: 0 });
    const sends = echoSends('gun', enc, 20);
    expect(sends.room).toBe(0);
    expect(sends.open).toBeGreaterThan(0);
    const cutoff = Math.min(voiceParams(20, 0).cutoff, enclosureCutoff(enc));
    expect(cutoff).toBeGreaterThan(12000);
  });

  it('inside is lightly muffled and echoes like a room; outside echoes short and open', () => {
    expect(enclosureCutoff(0)).toBe(20000);
    expect(enclosureCutoff(1)).toBe(6000);
    expect(enclosureCutoff(0.5)).toBeGreaterThan(6000);
    expect(enclosureCutoff(0.5)).toBeLessThan(20000);
    const inside = echoSends('gun', 1, 5);
    expect(inside.open).toBe(0);
    expect(inside.room).toBeGreaterThan(0);
    // A porch is between the street and a room.
    const porch = echoSends('gun', 0.4, 5);
    expect(porch.room).toBeGreaterThan(0);
    expect(porch.room).toBeLessThan(inside.room);
    expect(porch.open).toBeGreaterThan(0);
    expect(selfSends(0)).toEqual({ room: 0, open: 0.05 });
    expect(selfSends(1).open).toBe(0);
    // Footsteps follow the same rules: room echo inside, muffled the same way.
    expect(echoSends('step', 1, 3).room).toBeGreaterThan(0);
    expect(echoSends('step', 0, 3).room).toBe(0);
  });

  it('an obstacle blocks by its thickness and kind: a wall fully, a thin fence a third, a car or trunk little', () => {
    expect(occluderWeight('concrete', 0.3)).toBeCloseTo(1);
    expect(occluderWeight('concrete', 0.6)).toBeCloseTo(1);
    expect(occluderWeight('concrete', 0.1)).toBeCloseTo(0.33, 2);
    expect(occluderWeight('metal', 1.8, 'vehicle')).toBeCloseTo(0.4);
    expect(occluderWeight('wood', 0.8, 'trunk')).toBeCloseTo(0.7 * 0.4);
    expect(occluderWeight('concrete', null)).toBe(1);
    // A car between two players muffles a lot less than a house wall.
    expect(voiceParams(20, occluderWeight('metal', 1.8, 'vehicle')).cutoff).toBeGreaterThan(voiceParams(20, occluderWeight('concrete', 0.3)).cutoff * 2);
  });

  it('the ray there and the ray back give the thickness of what is in between', () => {
    const seen: (number | null)[] = [];
    const weight = (_h: number, t: number | null) => (seen.push(t), occluderWeight('concrete', t));
    // 10 m path, a 0.3 m wall entered at 4.85 m: the return ray (from 9.75 m) meets its far face 4.6 m back.
    expect(pathOcclusion(10, { handle: 1, toi: 4.85 }, { handle: 1, toi: 4.6 }, weight)).toBeCloseTo(1);
    expect(seen[0]).toBeCloseTo(0.3);
    expect(pathOcclusion(10, { handle: 1, toi: 4.85 }, { handle: 1, toi: 4.8 }, weight)).toBeCloseTo(0.33, 2);
    // Nothing in between, or two different walls.
    expect(pathOcclusion(10, null, null, weight)).toBe(0);
    expect(pathOcclusion(10, { handle: 1, toi: 2 }, { handle: 2, toi: 2 }, weight)).toBeCloseTo(2);
  });

  it('others make footsteps walking, louder sprinting, none crouching', () => {
    const steps = (over: Partial<Walker>, speed: number) => walk(new BodySounds(), speed, 3, over).filter((e) => e.kind === 'step');
    const walking = steps({}, 4);
    const sprinting = steps({ sprint: true }, 6.5);
    expect(walking.length).toBeGreaterThanOrEqual(4);
    expect(sprinting.every((e) => e.kind === 'step' && e.loud > 1)).toBe(true);
    expect(steps({ crouch: true }, 2)).toHaveLength(0);
  });

  it('landing after a fall, starting a slide and starting a reload each make one sound', () => {
    const s = new BodySounds();
    s.update(1, walker(0), 1 / 60);
    for (let i = 0; i < 40; i++) s.update(1, walker(0, { grounded: false }), 1 / 60);
    expect(s.update(1, walker(0), 1 / 60)).toEqual([{ kind: 'land', hard: false }]);
    expect(s.update(1, walker(0, { slide: true }), 1 / 60)).toEqual([{ kind: 'slide' }]);
    expect(s.update(1, walker(0, { slide: true }), 1 / 60)).toEqual([]);
    expect(s.update(1, walker(0, { reload: true }), 1 / 60)).toEqual([{ kind: 'reload' }]);
    expect(s.update(1, walker(0, { reload: true }), 1 / 60)).toEqual([]);
  });

  it('a respawn across the map is not a footstep', () => {
    const s = new BodySounds();
    s.update(1, walker(0), 1 / 60);
    expect(s.update(1, walker(40), 1 / 60)).toEqual([]);
  });
});
