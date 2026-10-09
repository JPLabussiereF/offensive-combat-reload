// A pet's face as a picture (PF-29): the HUD's round icon in the zumbi mode and the classic home's Pets tab. Drawn
// once per pet, coat and collar on a small WebGL canvas of its own (made for the batch and freed right after, like
// the character's portrait) and kept as a data URL.
import * as THREE from 'three';
import { COLLARS, type PetId } from '@shared/pets';
import { PetAnimator, restPose } from './anim';
import { makePet } from './species';

export interface PortraitReq {
  id: PetId;
  cor: string;
  coleira: string;
}

const cache = new Map<string, Promise<string>>();
const keyOf = (r: PortraitReq) => `${r.id}|${r.cor}|${r.coleira}`;

/** The faces of a few pets (in order), drawn together on one canvas. Empty strings where WebGL isn't there. */
export function petPortraits(list: PortraitReq[], size = 128): Promise<string[]> {
  const missing = list.filter((r) => !cache.has(keyOf(r)));
  if (missing.length) {
    const batch = drawBatch(missing, size);
    missing.forEach((r, i) => cache.set(keyOf(r), batch.then((urls) => urls[i] ?? '')));
  }
  return Promise.all(list.map((r) => cache.get(keyOf(r))!));
}

export const petPortrait = (r: PortraitReq, size = 128) => petPortraits([r], size).then((u) => u[0]);

async function drawBatch(list: PortraitReq[], size: number): Promise<string[]> {
  // After the current frame: never in the middle of whatever asked.
  await new Promise((r) => setTimeout(r, 0));
  let renderer: THREE.WebGLRenderer;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return list.map(() => '');
  }
  renderer.setSize(size, size, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x403840, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-1.2, 1.6, -2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 1.2);
  rim.position.set(1.5, 0.8, 1.5);
  scene.add(rim);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
  const out: string[] = [];
  for (const r of list) {
    const m = makePet(r.id, r.cor, COLLARS.find((c) => c.id === r.coleira)?.cor ?? COLLARS[0].cor, 'galpao');
    new PetAnimator(m).update(0, restPose());
    scene.add(m.root);
    m.root.updateMatrixWorld(true);
    // A three-quarter close-up of the head (the Bruxinha's hat too).
    const head = new THREE.Vector3().setFromMatrixPosition(m.bone('head').matrixWorld);
    const r0 = r.id === 'amora' ? 0.3 : r.id === 'bruxinha' ? 0.24 : r.id === 'iguana' ? 0.12 : 0.13;
    const at = head.clone().add(new THREE.Vector3(0, r.id === 'bruxinha' ? 0.07 : 0.01, 0));
    cam.position.copy(at).add(new THREE.Vector3(-0.55, 0.18, -1).normalize().multiplyScalar(r0 / Math.tan(THREE.MathUtils.degToRad(15)) * 1.15));
    cam.lookAt(at);
    renderer.render(scene, cam);
    out.push(renderer.domElement.toDataURL('image/png'));
    scene.remove(m.root);
    m.dispose();
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
