// Sticker studio: the core's smoke subjects (not stickers). They exercise the whole chain at real size: the
// light rig, the die-cut around separate pieces (a burst of stars near a head, a speech bubble, a body on its
// island), a muzzle flash, translucency over the cream backing, the inner ink line on a tall white subject, the
// three pose presets, a label and a bubble grown to legible size. `bun run figurinhas --smoke <dir>` bakes each in
// a page of its own, then all of them in one page in reverse order and the first of those again (poses on the
// sidewalk before the scene on grass, the teardown between them): the same pixels prove the order and the
// teardown change nothing. A second run into the same <dir> compares with the first (pixels.json).
import { HERO, RIVAL } from './cast';
import type { Subject } from './types';

export const SMOKE: Subject[] = [
  {
    id: 'smoke-cena',
    build(k) {
      // The HERO on the left fires at a zombie on the right; the RIVAL lies face down between them.
      const hero = k.avatar(HERO, 'm', { armed: true });
      hero.root.position.set(1.35, 0, 0.2);
      k.face(hero, [-1, 0, -0.6]);
      k.settle(hero, { pitch: 0.05 }, 40);
      hero.fire();
      k.settle(hero, { pitch: 0.05 }, 1);
      k.muzzleFlash(hero);
      const pow = k.label('POW!', [0.2, 0.95, -0.4], { tilt: 0.2, height: 0.4 });

      const zombie = k.zombie('comum', 0, { speed: 0 });
      zombie.root.position.set(-1.3, 0, 0.4);
      k.face(zombie, [1, 0, -0.2]);
      // Hit stars by its head, not on it; its complaint beside it (grown to a legible size by the core).
      k.stars(k.at(zombie.character.bones.head, [0.1, 0.3, -0.1]), { count: 8, spread: 0.26 });
      const bubble = k.bubble('UI!', [-0.55, 1.75, 0.4]);

      const rival = k.avatar(RIVAL, 'f');
      k.lying(rival, -1, [0.05, 0, -0.75]);
      const island = k.island('grama', 2.5, 1.15, [0.05, 0, -0.75]);
      return {
        card: { pos: [0, 1.9, -9.2], target: [0, 1.32, 0], fov: 30 },
        // The mini: the zombie and its stars alone.
        mini: { pos: [-1.0, 1.25, -5.0], target: [-1.25, 1.12, 0.4], fov: 30, hide: [bubble, pow, rival.root, island, hero.root] },
      };
    },
  },
  {
    id: 'smoke-branco',
    build(k) {
      // A tall white subject: the Bride screaming, her veil see-through over the cream backing.
      const bride = k.zombie('noiva', 0, { special: { kind: 'scream', t: 1 } });
      bride.root.rotation.y = 0.35;
      return {
        card: { pos: [0.6, 1.3, -6.4], target: [0, 1.22, 0], fov: 30 },
        mini: { pos: [0.6, 1.35, -6.6], target: [0, 1.2, 0], fov: 30 },
        rim: 1.2,
      };
    },
  },
  {
    id: 'smoke-poses',
    build(k) {
      // The core's three presets, left to right on screen: ouch, flail (with the saber: an additive sheath,
      // rendered normal-blended), panic.
      const names = ['ouch', 'flail', 'panic'] as const;
      const people = names.map((name, i) => {
        const av = k.avatar(HERO, 'm');
        av.root.position.set(1.3 - i * 1.3, 0, 0);
        av.root.rotation.y = 0.5;
        k.poses[name](av);
        if (name === 'flail') k.saber(av);
        return av.root;
      });
      // One sticker, not three: the island joins them (sidewalk: another surface than the scene's grass, for the
      // smoke's order check).
      const island = k.island('calcada', 3.6, 1.2, [0, 0, 0.1]);
      return {
        card: { pos: [0, 1.2, -6.7], target: [0, 0.9, 0], fov: 30 },
        // The mini: ouch alone.
        mini: { pos: [1.2, 1.0, -4.6], target: [1.3, 0.85, 0], fov: 30, hide: [...people.slice(1), island] },
      };
    },
  },
];
