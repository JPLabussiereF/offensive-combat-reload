// Watching a teammate while out of the wave (zumbi, online): who is watched, and how D/F switch.
import { describe, expect, it } from 'bun:test';
import { MOVE } from '@shared/constants';
import { FLAG } from '@shared/protocol';
import { DOWNED_EYE, pickSpectate, spectateEye } from '../zombies/spectate';

describe('quem assistir', () => {
  it('ninguém de pé: ninguém', () => {
    expect(pickSpectate([], null, 0)).toBeNull();
    expect(pickSpectate([], 4, 1)).toBeNull();
  });

  it('começa pelo primeiro por id e fica nele sem tecla', () => {
    expect(pickSpectate([7, 3, 5], null, 0)).toBe(3);
    expect(pickSpectate([7, 3, 5], 5, 0)).toBe(5);
  });

  it('F vai para o próximo e D para o anterior, dando a volta', () => {
    expect(pickSpectate([3, 5, 7], 3, 1)).toBe(5);
    expect(pickSpectate([3, 5, 7], 7, 1)).toBe(3);
    expect(pickSpectate([3, 5, 7], 3, -1)).toBe(7);
    expect(pickSpectate([3, 5, 7], 5, -2)).toBe(7);
    // Only one up: switching stays on them.
    expect(pickSpectate([4], 4, 1)).toBe(4);
  });

  it('quem assistíamos morreu ou saiu: passa para o seguinte por id (ou o primeiro), sem contar a tecla', () => {
    expect(pickSpectate([3, 7], 5, 0)).toBe(7);
    expect(pickSpectate([3, 7], 5, -1)).toBe(7);
    expect(pickSpectate([3, 7], 9, 1)).toBe(3);
  });
});

describe('altura dos olhos de quem assistimos', () => {
  it('de pé, agachado e caído', () => {
    expect(spectateEye(0, false)).toBe(MOVE.eyeStand);
    expect(spectateEye(FLAG.crouch | FLAG.grounded, false)).toBe(MOVE.eyeCrouch);
    expect(spectateEye(FLAG.crouch, true)).toBe(MOVE.eyeStand * DOWNED_EYE);
  });
});
