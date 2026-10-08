// The Caixão Misterioso (Mystery Coffin) of the zumbi mode: an old coffin with a glowing question mark and a
// pale beam of light over it, always on the same spot of the cemetery (by the east wall). Paid for (E), its lid
// creaks open and weapons spin up out of it, slowing down until one stays floating there, glowing in its rarity's
// color, for whoever paid to take. Now and then the weapon comes out damaged: it floats crooked and flickering,
// cracked, with a "DANIFICADA" plate, and the coffin plays a sour chord instead of its chime. The match
// (shared/zombieMatch.ts) decides all of it; this only draws and plays it.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { gunStats } from '@shared/arsenal';
import type { BoxInfo } from '@shared/protocol';
import { BOX_ITEMS, itemOf, ZOMBIE, type Rarity, type ZItem } from '@shared/zombies';
import { isGun } from '@shared/progression';
import { toon } from '../render/materials';
import { heldGun, heldKnife } from '../entities/heldWeapons';
import { WORLD_GROUPS, type Physics } from '../world/physics';
import { t } from '../ui/strings';
import type { Sfx } from '../audio/sfx';

/** Each rarity's color (the floating weapon's glow, the HUD's names). */
export const RARITY_COLOR: Record<Rarity, string> = { inicial: '#c8c8c8', comum: '#5fd35f', raro: '#4aa3ff', epico: '#b46bff', lendario: '#ffb02e' };

const UP = new THREE.Vector3(0, 1, 0);
const LID_OPEN = 1.9;

/** A coffin's outline (top view, the head end wider), extruded into its box. */
function coffinGeometry(height: number): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.24, -1);
  s.lineTo(0.24, -1);
  s.lineTo(0.38, 0.45);
  s.lineTo(0.26, 1);
  s.lineTo(-0.26, 1);
  s.lineTo(-0.38, 0.45);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false });
  // Lying flat: the shape's plane is the floor, the extrusion goes up.
  g.rotateX(-Math.PI / 2);
  return g;
}

/** A soft round glow (white in the middle, clear at the edge), tinted by the sprite's color. */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function questionTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.font = '900 104px Nunito, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(20,10,0,0.85)';
  g.fillStyle = '#ffd76a';
  g.strokeText('?', 64, 70);
  g.fillText('?', 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The plate over a damaged weapon: a crack and the word, in the player's language. */
function damagedTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 72;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(30,12,8,0.82)';
  g.beginPath();
  g.roundRect(4, 6, 248, 60, 14);
  g.fill();
  g.strokeStyle = '#ff6a3d';
  g.lineWidth = 4;
  g.stroke();
  // The crack.
  g.beginPath();
  g.moveTo(26, 14);
  g.lineTo(18, 32);
  g.lineTo(30, 38);
  g.lineTo(20, 58);
  g.strokeStyle = '#ffb08a';
  g.lineWidth = 5;
  g.stroke();
  g.font = '900 30px Nunito, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffd0b8';
  g.fillText(t('zDamaged').toUpperCase(), 140, 38);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Coffin {
  readonly root = new THREE.Group();
  private lid = new THREE.Group();
  private beam: THREE.Mesh;
  private mark: THREE.Sprite;
  private display = new THREE.Group();
  private glow: THREE.Sprite;
  private plate: THREE.Sprite;
  private models = new Map<string, THREE.Object3D>();
  private shown: THREE.Object3D | null = null;
  private collider: RAPIER.Collider;
  private info: BoxInfo = { state: 'idle', by: null, item: null, flaw: null, until: 0 };
  /** When the current state began (match clock, ms). */
  private since = 0;
  private lidAngle = 0;
  private cycleIn = 0;
  private time = 0;
  readonly position = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    private physics: Physics,
    spot: [number, number, number, number],
    private sfx: Sfx,
  ) {
    const wood = toon(0x4a2e1e);
    const body = new THREE.Mesh(coffinGeometry(0.42), wood);
    body.castShadow = body.receiveShadow = true;
    // The lid hinges on one long side.
    const lidMesh = new THREE.Mesh(coffinGeometry(0.08), toon(0x63402a));
    lidMesh.position.set(0.38, 0, 0);
    lidMesh.castShadow = true;
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.8), toon(0xe6c23a, { emissive: 0x4a3a0a }));
    cross.position.set(0.38, 0.09, -0.1);
    const crossBar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.07), toon(0xe6c23a, { emissive: 0x4a3a0a }));
    crossBar.position.set(0.38, 0.09, -0.3);
    this.lid.add(lidMesh, cross, crossBar);
    this.lid.position.set(-0.38, 0.42, 0);
    // Candles at the head end.
    const glow = glowTexture();
    const candles = new THREE.Group();
    for (const x of [-0.42, 0.42]) {
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.32, 8), toon(0xe8e2d6));
      candle.position.set(x, 0.16, -1.05);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffc35a, blending: THREE.AdditiveBlending, depthWrite: false }));
      flame.scale.set(0.12, 0.18, 1);
      flame.position.set(x, 0.38, -1.05);
      candles.add(candle, flame);
    }
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.75, 34, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xcfe8a8, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.beam.position.y = 17;
    this.mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: questionTexture(), depthWrite: false }));
    this.mark.scale.set(0.7, 0.7, 1);
    this.mark.position.y = 1.4;
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.glow.scale.set(1.6, 1.6, 1);
    this.plate = new THREE.Sprite(new THREE.SpriteMaterial({ map: damagedTexture(), depthWrite: false, transparent: true }));
    this.plate.scale.set(1.1, 0.31, 1);
    this.plate.position.y = 0.62;
    this.plate.visible = false;
    this.display.add(this.glow, this.plate);
    this.display.position.y = 1.1;
    this.root.add(body, this.lid, candles, this.beam, this.mark, this.display);
    scene.add(this.root);
    // Its spot never changes: placed once, with its collider (players don't walk through it).
    const [x, y, z, yaw] = spot;
    this.position.set(x, y, z);
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    this.collider = physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.36, 0.25, 1).setTranslation(x, y + 0.25, z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setCollisionGroups(WORLD_GROUPS),
      physics.staticBody,
    );
    physics.surfaces.set(this.collider.handle, { material: 'wood' });
  }

  /** The model of an item (a gun with its upgrades, or the saber), shown floating over the coffin. */
  private model(it: ZItem): THREE.Object3D {
    let m = this.models.get(it.id);
    if (m) return m;
    const g = new THREE.Group();
    const inner = isGun(it.arma) ? heldGun(gunStats(it.arma, it.melhorias)) : heldKnife(it.faca ?? 'sabre');
    inner.position.set(0, 0, 0);
    g.add(inner);
    // Sideways, so it reads from the front; bigger than in a hand.
    g.rotation.set(0, Math.PI / 2, 0);
    g.scale.setScalar(isGun(it.arma) ? 1.5 : 2.4);
    this.models.set(it.id, (m = g));
    return m;
  }

  private show(it: ZItem | null, damaged = false) {
    if (this.shown) {
      this.display.remove(this.shown);
      this.shown.rotation.z = 0;
    }
    this.shown = it ? this.model(it) : null;
    if (this.shown) this.display.add(this.shown);
    // A damaged weapon glows dimmer and redder than its rarity, and floats crooked under its plate.
    const glow = this.glow.material as THREE.SpriteMaterial;
    glow.color.set(it ? RARITY_COLOR[it.raridade] : '#ffffff');
    if (it && damaged) glow.color.lerp(new THREE.Color('#ff4a2a'), 0.45);
    this.plate.visible = !!it && damaged;
    if (this.shown && damaged) this.shown.rotation.z = 0.35;
  }

  /** The match says the coffin changed (`now`: match clock, ms). */
  set(info: BoxInfo, now: number) {
    this.info = { ...info };
    this.since = now;
    const at = this.position.clone().setY(this.position.y + 1);
    switch (info.state) {
      case 'rolling':
        this.sfx.at(at, 'normal', (s) => s.coffinOpen());
        this.cycleIn = 0;
        break;
      case 'offer': {
        const it = itemOf(info.item);
        this.show(it ?? null, !!info.flaw);
        if (info.open) break;
        if (it && info.flaw) this.sfx.at(at, 'normal', (s) => s.coffinBroken());
        else if (it) this.sfx.at(at, 'normal', (s) => s.coffinReveal(it.raridade === 'lendario' ? 2 : it.raridade === 'epico' ? 1 : 0));
        break;
      }
      case 'idle':
        this.show(null);
        break;
    }
  }

  update(dt: number, now: number) {
    this.time += dt;
    const st = this.info.state;
    const open = st === 'rolling' || st === 'offer';
    this.lidAngle += ((open ? LID_OPEN : 0) - this.lidAngle) * (1 - Math.exp(-8 * dt));
    this.lid.rotation.z = this.lidAngle;
    this.mark.visible = st === 'idle';
    this.mark.position.y = 1.4 + Math.sin(this.time * 2) * 0.08;
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.07 + 0.04 * Math.sin(this.time * 1.5);
    this.display.visible = open;
    const k = (now - this.since) / 1000;
    if (st === 'rolling') {
      // Weapons cycling, faster at first, slowing down toward the end; rising out of the coffin.
      const total = ZOMBIE.caixa.girarSegundos;
      this.cycleIn -= dt;
      if (this.cycleIn <= 0) {
        this.show(BOX_ITEMS[Math.floor(Math.random() * BOX_ITEMS.length)]);
        this.cycleIn = 0.06 + 0.3 * Math.min(1, k / total) ** 2;
        this.sfx.at(this.position, 'step', (s) => s.coffinTick());
      }
      this.display.position.y = 0.3 + 0.8 * Math.min(1, k / 0.8);
      this.display.rotation.y += dt * 6;
    } else if (st === 'offer') {
      this.display.position.y = 1.1 + Math.sin(this.time * 2.4) * 0.06;
      this.display.rotation.y += dt * 1.2;
      if (this.info.flaw) {
        // Flickering like a bad bulb, and slower to turn.
        const flick = Math.sin(this.time * 23) > 0.6 ? 0.25 : 0.8;
        (this.glow.material as THREE.SpriteMaterial).opacity = flick;
        this.display.rotation.y -= dt * 0.6;
      } else (this.glow.material as THREE.SpriteMaterial).opacity = 0.8;
    }
  }

  /** The state, for prompts. */
  get state(): BoxInfo {
    return this.info;
  }

  dispose() {
    this.physics.world.removeCollider(this.collider, true);
    this.scene.remove(this.root);
  }
}
