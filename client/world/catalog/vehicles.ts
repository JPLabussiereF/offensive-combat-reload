// Vehicles as pieces: cars (one that honks back), the moving van, the ice cream truck with its jingle, the
// park's bumper cars and the circus trailers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonGradient } from '../../render/materials';
import { buildCar, buildIceCreamTruck, buildVan } from '../vehicles';
import { iceCreamTopper } from '../decor';
import { bumperCarGeometry, circusTrailer, SpeechBubble } from '../halloween';
import { at, P, V, yawOf, type Adapter, type BuildCtx } from './types';

/** A speech bubble floating at `pos` (the ghost's neighbour, the bell's complaint). */
export function bubbleAt(c: BuildCtx, pos: THREE.Vector3, width = 3) {
  const bubble = new SpeechBubble(width);
  bubble.sprite.position.copy(pos);
  c.scene.add(bubble.sprite);
  c.animate((dt) => bubble.update(dt));
  return bubble;
}

export const vehicles: Record<string, Adapter> = {
  carro(c, p) {
    const [x, , z] = at(p);
    buildCar(c.b, x, z, P<{ cor: number }>(p).cor, yawOf(p));
  },

  /**
   * A car whose horn honks when shot, longer and longer; the sixth honk in a row gets the neighbour (a bubble
   * at `vizinho`) to complain.
   */
  carroBuzina(c, p) {
    const q = P<{ cor: number; vizinho: [number, number, number]; fala: string }>(p);
    const [x, , z] = at(p);
    const [nx, ny, nz] = q.vizinho;
    let honks: number[] = [];
    const neighbour = bubbleAt(c, V(nx, ny, nz), 3.4);
    const horn = c.props.register(p.prop ?? 'buzina', () => {
      const now = c.clock.now;
      honks = honks.filter((t) => now - t < 6);
      honks.push(now);
      c.sfx.at({ x, y: 1, z }, 'loud', (s) => s.carHorn(0.25 + 0.3 * Math.min(8, honks.length - 1)));
      if (honks.length === 6) {
        neighbour.say(q.fala, 3);
        c.sfx.at({ x: nx, y: ny - 1.6, z: nz }, 'normal', (s) => s.grumble());
      }
    });
    buildCar(c.b, x, z, q.cor, yawOf(p), horn);
  },

  van(c, p) {
    const q = P<{ cor: number; faixa: number }>(p);
    const [x, , z] = at(p);
    buildVan(c.b, x, z, q.cor, q.faixa);
  },

  /** The ice cream truck in the middle of the street: breaks the long sightline and plays a jingle when shot. */
  caminhaoSorvete(c, p) {
    const q = P<{ cor: number; detalhe: number }>(p);
    let lastJingle = -10;
    const jingle = () => {
      const now = performance.now() / 1000;
      if (now - lastJingle > 4) {
        lastJingle = now;
        c.sfx.at({ x: 1, y: 1.5, z: 0 }, 'loud', (s) => s.iceCream());
      }
    };
    const truckShot = c.props.register(p.prop ?? 'caminhao', jingle);
    buildIceCreamTruck(c.b, q.cor, q.detalhe, truckShot);
    c.scene.add(iceCreamTopper(new THREE.Vector3(1.6, 2.75, 0)));
  },

  /** Bumper cars: one merged mesh, a box collider each (muffles sound like a vehicle). */
  carrinhosBateBate(c, p) {
    const cars = P<{ carros: { p: [number, number]; cor: number; detalhe: number; yaw: number }[] }>(p).carros;
    const carGeo = mergeGeometries(cars.map(({ p: [x, z], cor, detalhe, yaw }) => bumperCarGeometry(cor, detalhe).rotateY(yaw).translate(x, 0, z)), false)!;
    const carMesh = new THREE.Mesh(carGeo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }));
    carMesh.castShadow = true;
    c.scene.add(carMesh);
    for (const { p: [x, z], yaw } of cars) c.b.cuboidCollider(V(x, 0.5, z), V(0.85, 0.5, 0.62), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), 'metal', undefined, 'vehicle');
  },

  trailerCirco(c, p) {
    const q = P<{ cor: number; faixa: number; texto: string }>(p);
    const [x, , z] = at(p);
    circusTrailer(c.b, c.scene, c.s.c.glow, x, z, yawOf(p), q.cor, q.faixa, q.texto);
  },
};
