// A model made in Blender (.glb) placed on the map: batched, its COL_ colliders and ROOM_ boxes added, and its
// GAG_ markers wired (GAG_LATIDO: a dog barks at whoever comes near). Conventions: docs/MAPAS.md.
import { addGltfToMap } from '../gltfMap';
import { P, scaleOf, vec, yawOf, type Adapter } from './types';

export const glb: Record<string, Adapter> = {
  async glb(c, p) {
    const file = P<{ arquivo: string }>(p).arquivo;
    try {
      const gltf = await c.loadGltf(file);
      const markers = addGltfToMap(gltf, c.b, { position: vec(p), yaw: yawOf(p), scale: scaleOf(p) });
      for (const gag of markers.gags) {
        if (gag.name !== 'LATIDO') continue;
        let cooldown = 0;
        c.animate((dt, { feet }) => {
          cooldown -= dt;
          if (cooldown <= 0 && feet.distanceTo(gag.position) < 3.5) {
            cooldown = 4;
            c.sfx.at(gag.position, 'normal', (s) => s.bark());
          }
        });
      }
    } catch (err) {
      console.warn(`[mapa] modelo ${file} não carregado:`, err);
    }
  },
};
