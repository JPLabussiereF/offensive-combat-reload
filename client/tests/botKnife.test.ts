// A bot's knife (client/ai/botKnife.ts): it hesitates before swinging, and each approach gives it one swing at a
// target, given back only after it backs off past KNIFE_REARM.
import { describe, expect, it } from 'bun:test';
import { BotKnife, KNIFE_REARM } from '../ai/botKnife';

const DT = 0.12;

/** Ticks `knife` against target `id` at `dist` with the swing allowed, from `t0` for `seconds`: the swings' times. */
function run(knife: BotKnife, id: number, dist: number, t0: number, seconds: number, delay = 0.2): number[] {
  const swings: number[] = [];
  for (let t = t0; t < t0 + seconds; t += DT) if (knife.shouldSwing(t, id, dist, true, delay)) swings.push(t);
  return swings;
}

describe('faca dos bots', () => {
  it('hesita antes do golpe e não golpeia sem poder (fora do alcance, de costas, na recarga)', () => {
    const k = new BotKnife();
    expect(k.shouldSwing(0, 1, 1.5, true, 0.2)).toBe(false);
    expect(k.shouldSwing(0.12, 1, 1.5, true, 0.2)).toBe(false);
    expect(k.shouldSwing(0.24, 1, 1.5, true, 0.2)).toBe(true);
    const never = new BotKnife();
    for (let t = 0; t < 3; t += DT) expect(never.shouldSwing(t, 1, 1.5, false, 0.2)).toBe(false);
  });

  it('a espera recomeça quando o alvo sai do alcance ou da frente', () => {
    const k = new BotKnife();
    k.shouldSwing(0, 1, 1.5, true, 0.3);
    k.shouldSwing(0.12, 1, 1.5, false, 0.3);
    expect(k.shouldSwing(0.36, 1, 1.5, true, 0.3)).toBe(false);
    expect(k.shouldSwing(0.66, 1, 1.5, true, 0.3)).toBe(true);
  });

  it('dá uma só facada por aproximação, acertando ou errando', () => {
    const k = new BotKnife();
    expect(run(k, 1, 1.5, 0, 10)).toHaveLength(1);
    expect(k.hasChance(1, 1.5)).toBe(false);
    // Backing off a little isn't enough.
    expect(run(k, 1, KNIFE_REARM - 0.5, 10, 5)).toHaveLength(0);
  });

  it('ganha outra chance depois de se afastar e voltar', () => {
    const k = new BotKnife();
    run(k, 1, 1.5, 0, 2);
    expect(k.hasChance(1, KNIFE_REARM + 0.5)).toBe(true);
    expect(run(k, 1, 1.5, 2, 2)).toHaveLength(1);
  });

  it('a chance é por alvo, e uma vida nova devolve todas', () => {
    const k = new BotKnife();
    run(k, 1, 1.5, 0, 2);
    expect(run(k, 2, 1.5, 2, 2)).toHaveLength(1);
    expect(k.hasChance(1, 1.5)).toBe(false);
    k.reset();
    expect(k.hasChance(1, 1.5)).toBe(true);
    expect(k.hasChance(2, 1.5)).toBe(true);
  });
});
