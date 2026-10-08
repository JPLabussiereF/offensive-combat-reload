// The zombies' body (PF-15): stooped forward, never leaning back while they walk or run, with the arms reaching
// straight ahead; the bride's scream still throws the head and chest back (client/character/animator.ts zombie).
// The character faces -Z: ahead is a smaller z.
import * as THREE from 'three';
import { describe, expect, it } from 'bun:test';
import { CharacterAnimator, type ZombiePose } from '../character/animator';
import { Character } from '../character/character';

const pose = (over: Partial<ZombiePose> = {}): ZombiePose => ({ speed: 0, run: false, attack: null, fuse: null, spit: null, special: null, ...over });

/** A zombie-looking character posed for a second at 60 fps; the world positions of some of its bones. */
function posed(s: ZombiePose) {
  const c = new Character({ v: 1, sex: 'm', items: {}, colors: {}, eyes: { style: 'redondo' }, build: { height: 'medio', build: 'medio' }, pcd: { braco: '', perna: '' } });
  const anim = new CharacterAnimator(c);
  for (let f = 0; f < 60; f++) anim.zombie(1 / 60, s);
  c.root.updateMatrixWorld(true);
  const at = (b: keyof typeof c.bones) => new THREE.Vector3().setFromMatrixPosition(c.bones[b].matrixWorld);
  return { hips: at('hips'), neck: at('neck'), shoulder: at('upperArm_R'), hand: at('hand_R') };
}

describe('pose do zumbi', () => {
  it('parado ou andando, o tronco curva para a frente (o pescoço à frente do quadril)', () => {
    for (const speed of [0, 1.2]) {
      const b = posed(pose({ speed }));
      expect(b.neck.z).toBeLessThan(b.hips.z - 0.05);
    }
  });

  it('correndo, curva mais', () => {
    const walk = posed(pose({ speed: 1.2 }));
    const run = posed(pose({ speed: 4.5, run: true }));
    expect(run.neck.z - run.hips.z).toBeLessThan(walk.neck.z - walk.hips.z);
  });

  it('os braços esticados para a frente, quase na altura do ombro', () => {
    const b = posed(pose({ speed: 1.2 }));
    expect(b.hand.z).toBeLessThan(b.shoulder.z - 0.4);
    expect(Math.abs(b.hand.y - b.shoulder.y)).toBeLessThan(0.2);
  });

  it('o grito da noiva joga o peito para trás', () => {
    const b = posed(pose({ special: { kind: 'scream', t: 1 } }));
    expect(b.neck.z).toBeGreaterThan(b.hips.z + 0.03);
  });
});
