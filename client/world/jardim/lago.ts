// Pieces of the Lago de Lótus used by the catalog (catalog/gardenPieces.ts): the bridges' lantern posts and the
// dragon fountain (it breathes fire when shot). The lake itself is laid out piece by piece
// (conversao/jardimSetores.ts) in shared/data/mapas/jardim.json.
import * as THREE from 'three';
import { column, dragonGeometry, dragonMaterial, FireBreath, ORIENTAL as C, rock, type DragonColors } from '../oriental';
import { surfaceMaterial } from '../surfaces';
import type { Ctx } from './kit';

/** The fountain dragon's colors. */
export const JADE: DragonColors = { body: 0x2fae7a, bodyDark: 0x23895f, belly: 0xf2d98a, spikes: 0xe7b847, horns: 0xf2d98a };

export function lanternPost(c: Ctx, x: number, z: number, ax: number, az: number) {
  column(c.b, x, z, 0, 3.3, 0.09);
  c.b.box(x + ax * 0.42, 3.22, z + az * 0.42, ax ? 0.9 : 0.08, 0.08, az ? 0.9 : 0.08, 'pintura', { tint: C.lacquer, collide: false });
  c.lanterns.hang(new THREE.Vector3(x + ax * 0.78, 3.18, z + az * 0.78), 0.75);
}

/**
 * Rock islet with a round basin and the jade dragon coiled up its pillar, looking west at the island. It
 * spits water into the basin; shot, it roars fire (synchronized online through the prop bus).
 */
export function dragonFountain(c: Ctx, cx: number, cz: number, id = 'dragao') {
  const { b } = c;
  b.span(cx - 2.2, -1.1, cz - 2.4, cx + 2.2, 0.3, cz + 2.4, 'pedra', { tint: C.rock });
  for (const [x, z] of [[-1.8, -2.0], [1.8, -2.0], [1.8, 2.0], [-1.8, 2.0]]) rock(b, cx + x, 0.3, cz + z, 0.5, 0.55, 0.5, c.rand);
  // The stepping stone from the east bank.
  b.cylinder(cx + 2.9, -0.8, cz, 0.5, 0.95, 'pedra', { tint: C.stoneDark, segments: 9 });
  const r = 1.55;
  const y0 = 0.3;
  const h = 0.5;
  const segs = 16;
  for (let k = 0; k < segs; k++) {
    const a = (k / segs) * Math.PI * 2;
    b.box(cx + Math.cos(a) * r, y0 + h / 2, cz + Math.sin(a) * r, 0.32, h, ((2 * Math.PI * r) / segs) * 1.08, 'pedra', { tint: C.stone, rot: new THREE.Euler(0, -a, 0) });
  }
  b.addGeometry(new THREE.TorusGeometry(r, 0.19, 5, segs * 2).rotateX(Math.PI / 2).translate(cx, y0 + h, cz), surfaceMaterial('pedra'), C.stone);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(r - 0.1, 28).rotateX(-Math.PI / 2), c.water);
  pool.position.set(cx, 0.68, cz);
  c.scene.add(pool);
  b.cylinder(cx, y0, cz, 0.3, 2.1, 'pedra', { tint: C.stoneDark, segments: 10 });

  const fountain = dragonGeometry(dragonCoil(cx, cz), 0.19, JADE);
  const dragon = new THREE.Mesh(fountain.geo, dragonMaterial());
  dragon.castShadow = true;
  c.scene.add(dragon);
  const fire = new FireBreath(c.scene);
  const shot = c.props.register(id, () => {
    if (!fire.active) c.sfx.at(fountain.mouth, 'loud', (s) => s.roar());
    fire.start(fountain.mouth, fountain.forward.clone().setY(0.12));
  });
  b.cuboidCollider(new THREE.Vector3(cx, 1.4, cz), new THREE.Vector3(0.9, 1.1, 0.9), new THREE.Quaternion(), 'concrete', shot);
  b.ballCollider(fountain.mouth.clone().addScaledVector(fountain.forward, -0.35), 0.45, 'concrete', shot);
  let spout = 0;
  c.animate((dt) => {
    fire.update(dt);
    if (fire.active) return;
    spout += dt * 40;
    const f = fountain.forward;
    while (spout >= 1) {
      spout--;
      c.drops.emit(fountain.mouth, f.x * 0.4 + (Math.random() - 0.5) * 0.25, 2.6 + Math.random() * 0.8, f.z * 0.4 + (Math.random() - 0.5) * 0.25, 0.68);
    }
  });
}

/**
 * The fountain dragon's path (tail first, head last) for dragonGeometry: coiled up its pillar at (cx, cz),
 * turning so the head ends up looking west (-X).
 */
export function dragonCoil(cx: number, cz: number): THREE.Vector3[] {
  const coil: THREE.Vector3[] = [];
  const turns = 1.6;
  const a0 = Math.PI - turns * Math.PI * 2 - 1.2;
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    const a = a0 + u * turns * Math.PI * 2;
    coil.push(new THREE.Vector3(cx + Math.cos(a) * 0.7, 0.55 + u * 1.8, cz + Math.sin(a) * 0.7));
  }
  const aEnd = a0 + turns * Math.PI * 2;
  const look = aEnd + 1.2;
  coil.push(
    new THREE.Vector3(cx + Math.cos(aEnd + 0.6) * 0.75, 2.75, cz + Math.sin(aEnd + 0.6) * 0.75),
    new THREE.Vector3(cx + Math.cos(look) * 0.3, 3.25, cz + Math.sin(look) * 0.3),
    new THREE.Vector3(cx + Math.cos(look) * 0.65, 3.35, cz + Math.sin(look) * 0.65),
  );
  return coil;
}
