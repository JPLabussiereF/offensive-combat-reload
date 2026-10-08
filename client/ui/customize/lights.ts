// The character editor's light (style guide): shared by the big stage, the cards (client/ui/customize/itemThumbs.ts)
// and the sticker studio (client/dev/studio), so a piece looks the same on its card and on the character.
import * as THREE from 'three';

/**
 * Lighting that shows the facets (style guide): a strong warm key light and a weak cool hemisphere; the
 * temperature difference between lit and shadowed faces is what makes the style read. Returns the lights: the
 * sticker studio (client/dev/studio) aims the same rig at each of its shots.
 */
export function setupScene(parent: THREE.Object3D) {
  const hemi = new THREE.HemisphereLight(0xc4d8ff, 0x5a4c40, 1.6);
  parent.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2bd, 2.8);
  sun.position.set(2.5, 4, -3);
  parent.add(sun);
  const rim = new THREE.DirectionalLight(0x9db8ff, 0.8);
  rim.position.set(-3, 2.5, 3);
  parent.add(rim);
  return { hemi, sun, rim };
}
