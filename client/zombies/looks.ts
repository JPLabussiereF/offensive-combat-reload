// How the zumbi mode's zombies look: the neighborhood's own people, dead. Built with the same character system
// as the players (catalog items, colors, body, face, even the PCD mode for a zombie that lost an arm), with a
// green-gray skin and droopy yellow or red eyes, so they read as "the neighbors" from a distance:
// - plain zombies: the neighbor in pajamas, the tourist in a Hawaiian shirt, the mechanic, the office guy in a
//   tie, the rocker, the grandma in her cardigan;
// - the runner is a jogger in a track suit and headband; the bloater, the barbecue uncle in a tank top; the
//   brute, a nightclub bouncer in black with sunglasses; the spitter, the gossiping aunt;
// - bosses: the Gravedigger (overalls, straw hat, a shovel), the Bride (white dress, flower crown, a veil)
//   and the Mayor (suit, tie, fedora, the mayor's sash), each a prop or two made here.
import * as THREE from 'three';
import { choice, DEFAULT_FACE, type Appearance, type Build, type EyeStyle, type Height, type ItemChoice } from '@shared/appearance';
import { catalogItem, type Slot } from '@shared/catalog';
import type { Sex } from '@shared/protocol';
import type { ZKind } from '@shared/zombies';
import { toon } from '../render/materials';
import type { Avatar } from '../entities/avatar';

const SKINS = ['#8fa37a', '#7f9670', '#9aa58a', '#8a9a90', '#a0a77e', '#86947e'];
const EYES = ['#c9a227', '#b3312a'];

interface Spec {
  sex: Sex;
  items: [id: string, colors: string[]][];
  hair: [id: string, color: string];
  beard?: string;
  build?: Build;
  height?: Height;
  eyes?: EyeStyle;
  skin?: string;
  /** Lost an arm (the PCD mode does the rest: no arm, no hitbox there). */
  noArm?: boolean;
}

function build(s: Spec, seed: number): Appearance {
  const itens: Partial<Record<Slot, ItemChoice>> = {};
  for (const [id, colors] of s.items) {
    const it = catalogItem(id);
    if (it) itens[it.slots[0]] = choice(it, colors);
  }
  return {
    v: 2,
    altura: s.height ?? 'medio',
    biotipo: s.build ?? 'medio',
    pele: s.skin ?? SKINS[seed % SKINS.length],
    olhos: EYES[seed % EYES.length],
    olhosEstilo: s.eyes ?? (seed % 2 ? 'caido' : 'grande'),
    rosto: { ...DEFAULT_FACE, formato: seed % 3 ? 'longo' : 'oval', boca: 'fina', marcas: seed % 2 ? 'cicatriz' : 'nenhuma' },
    cabelo: { id: s.hair[0], cor: s.hair[1] },
    barba: s.beard ?? '',
    itens,
    pcd: { braco: s.noArm ? 'bracoEsq' : '', perna: '' },
  };
}

/** The plain zombies: a few neighbors, picked in turn. */
const PLAIN: Spec[] = [
  { sex: 'm', items: [['listrada', ['#3e5878', '#e8e2d6']], ['pijama', ['#3e5878', '#e8e2d6']], ['chinelo', ['#1f2226', '#3a3d42']]], hair: ['curto', '#bdb8ae'], beard: 'barbaPorFazer' },
  { sex: 'm', items: [['havaiana', ['#9a4a2a', '#e6c23a']], ['bermudaXadrez', ['#5c6435', '#3a3d42']], ['chinelo', ['#1f2226', '#3a3d42']], ['bucket', ['#cdbb9a', '#5e4330']]], hair: ['raspado', '#45301f'] },
  { sex: 'm', items: [['mecanico', ['#1f2a44', '#3e5878', '#e8e2d6']], ['calcaTrabalho', ['#1f2a44', '#3a3d42']], ['botaTrabalho', ['#5a3e2a', '#3b2a1e']]], hair: ['degrade', '#151211'], beard: 'bigode', noArm: true },
  { sex: 'm', items: [['socialLonga', ['#e8e2d6', '#9aa3aa', '#1f2226']], ['gravata', ['#5e1f2a']], ['calcaTerno', ['#3a3d42']], ['sapatoSocial', ['#1f2226', '#3a3d42']]], hair: ['repartido', '#633f25'] },
  { sex: 'f', items: [['rasgada', ['#1f2226']], ['jeansRasgada', ['#3e5878', '#1f2226']], ['botaCanoLongo', ['#1f2226']]], hair: ['longo', '#2b211d'] },
  { sex: 'f', items: [['cardiga', ['#7a5436', '#e8e2d6']], ['saiaLonga', ['#5e4330']], ['chinelo', ['#1f2226', '#3a3d42']], ['redondos', ['#9aa3aa']]], hair: ['coque', '#bdb8ae'] },
];

const KINDS: Partial<Record<ZKind, Spec>> = {
  corredor: { sex: 'm', items: [['agasalho', ['#5e1f2a', '#e8e2d6']], ['shortCorrida', ['#1f2226', '#e8e2d6']], ['tenisCorrida', ['#e8e2d6', '#c0392f', '#1f2226']], ['faixaCabeca', ['#c0392f', '#e8e2d6']]], hair: ['buzzCut', '#45301f'] },
  inchado: { sex: 'm', build: 'gordo', items: [['regataCavada', ['#e8e2d6', '#3a3d42']], ['bermudaPraia', ['#1f4f5a', '#e0702a']], ['chinelo', ['#1f2226', '#3a3d42']]], hair: ['raspado', '#45301f'], beard: 'barbaCheia' },
  brutamontes: { sex: 'm', build: 'gordo', height: 'alto', items: [['camisetaTatica', ['#1f2226', '#3a3d42', '#1f2226']], ['calcaTerno', ['#1f2226']], ['botaTatica', ['#1f2226', '#3a3d42']], ['escuros', ['#1f2226', '#9aa3aa']]], hair: ['raspado', '#151211'], beard: 'cavanhaque' },
  cuspidor: { sex: 'f', items: [['bata', ['#9c6a3a', '#e8e2d6']], ['saiaLonga', ['#5e4330']], ['chinelo', ['#1f2226', '#3a3d42']], ['lencoPescoco', ['#2fb0a8', '#e8e2d6']]], hair: ['coque', '#8a5a33'], eyes: 'marcante' },
  coveiro: { sex: 'm', build: 'gordo', height: 'alto', skin: '#7a8a6a', items: [['flanela', ['#5e1f2a', '#1f2226', '#e8e2d6']], ['jardineira', ['#3e5878', '#5e4330', '#b8923e']], ['botaTrabalho', ['#3b2a1e', '#1f2226']], ['palha', ['#cdbb9a', '#5e4330']]], hair: ['curto', '#bdb8ae'], beard: 'barbaLonga' },
  noiva: { sex: 'f', skin: '#c3ccd0', items: [['golaCanoa', ['#e8e2d6']], ['saiaLonga', ['#e8e2d6']], ['descalco', []], ['coroaFlores', ['#e8e2d6', '#c0392f', '#9ccb3b']]], hair: ['longo', '#e8e4da'], eyes: 'grande' },
  prefeito: { sex: 'm', build: 'gordo', skin: '#7f8f60', items: [['socialLonga', ['#e8e2d6', '#9aa3aa', '#1f2226']], ['paleto', ['#1f2226', '#3a3d42', '#b8923e']], ['gravata', ['#c0392f']], ['calcaTerno', ['#1f2226']], ['sapatoSocial', ['#1f2226', '#3a3d42']], ['fedora', ['#1f2226', '#5e1f2a']]], hair: ['penteadoTras', '#bdb8ae'], beard: 'bigode' },
};

/** A zombie's look (`n`: which plain neighbor, in turn). */
export function zombieLook(kind: ZKind, n: number): { look: Appearance; sex: Sex; noArm: boolean } {
  const s = KINDS[kind] ?? PLAIN[n % PLAIN.length];
  return { look: build(s, n + kind.length), sex: s.sex, noArm: !!s.noArm };
}

/** The bosses' props, on the avatar's sockets (they ride on its skeleton like a hat would). */
export function addBossProps(kind: ZKind, avatar: Avatar) {
  const sockets = avatar.character.sockets;
  if (kind === 'coveiro') {
    // The shovel: a long wooden handle and a dented steel blade, held down by the right hand.
    const shovel = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.1, 6), toon(0x7a5436));
    handle.position.y = -0.25;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.03), toon(0x8a9096));
    blade.position.y = -0.95;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.03), toon(0x5a3e2a));
    grip.position.y = 0.3;
    shovel.add(handle, blade, grip);
    shovel.rotation.z = Math.PI / 2;
    sockets.hand_R.add(shovel);
  } else if (kind === 'noiva') {
    // The veil: a pale see-through cone from the crown down the back.
    const veil = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 1.1, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xf2f0ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
    );
    veil.position.set(0, -0.32, 0.12);
    veil.rotation.x = 0.18;
    sockets.head.add(veil);
  } else if (kind === 'prefeito') {
    // The mayor's sash, green and yellow, across the chest; a brass badge.
    const chest = avatar.character.root.getObjectByName('chest');
    if (chest) {
      const sash = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 0.02), toon(0x2e8b4a));
      sash.position.set(0, 0.08, -0.16);
      sash.rotation.z = 0.75;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.62, 0.025), toon(0xe6c23a));
      stripe.position.copy(sash.position);
      stripe.rotation.copy(sash.rotation);
      const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10), toon(0xb8923e, { emissive: 0x3a2a0a }));
      badge.rotation.x = Math.PI / 2;
      badge.position.set(-0.08, 0.16, -0.18);
      chest.add(sash, stripe, badge);
    }
  }
}
