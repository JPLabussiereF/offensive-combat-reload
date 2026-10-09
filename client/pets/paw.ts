// The signature of every pet ability (PF-29): a paw in the owner's collar color floating over its target (a zombie,
// a barricade, the iguana's tail, a teammate the cat is lifting) for a moment. Seen through walls like the downed
// cross, never on the ground (no rings or bands there, nothing green, red cross or skull: those belong to the
// mode's own warnings). client/pets/manager.ts and client/zombies/client.ts put them up.
import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

/** A paw print (pad and four toes) drawn in `color`, with a dark outline to read over anything, on a 64 px canvas. */
export function pawTexture(color: THREE.ColorRepresentation): THREE.CanvasTexture {
  const css = '#' + new THREE.Color(color).getHexString();
  const hit = cache.get(css);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const shape = () => {
    g.beginPath();
    g.ellipse(32, 40, 13, 11, 0, 0, Math.PI * 2);
    for (const [x, y, rx, ry] of [[16, 25, 5.5, 7], [26, 17, 5.5, 7.5], [38, 17, 5.5, 7.5], [48, 25, 5.5, 7]] as const) {
      g.moveTo(x + rx, y);
      g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    }
  };
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(10,10,14,0.85)';
  g.lineWidth = 6;
  shape();
  g.stroke();
  g.fillStyle = css;
  shape();
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(css, tex);
  return tex;
}

/** A paw sprite (its texture is shared by color: dispose only the material). */
export function pawSprite(color: THREE.ColorRepresentation): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: pawTexture(color), depthTest: false, depthWrite: false, transparent: true }));
  s.scale.set(0.42, 0.42, 1);
  s.renderOrder = 11;
  return s;
}

/** Paws over targets, each following its target until its time is up. */
export class PawMarks {
  private list: { sprite: THREE.Sprite; until: number; at: () => THREE.Vector3 | null; born: number }[] = [];

  constructor(private scene: THREE.Scene) {}

  /** A paw over `at()` (followed every frame; null: the target is gone) from `now` until `until` (ms, one clock). */
  add(color: THREE.ColorRepresentation, at: () => THREE.Vector3 | null, now: number, until: number) {
    const sprite = pawSprite(color);
    const p = at();
    if (p) sprite.position.copy(p);
    this.scene.add(sprite);
    this.list.push({ sprite, until, at, born: now });
  }

  update(now: number) {
    this.list = this.list.filter((p) => {
      const at = p.at();
      if (!at || now >= p.until) {
        this.scene.remove(p.sprite);
        p.sprite.material.dispose();
        return false;
      }
      // Pops in, bobs, fades out at the end.
      const k = Math.min(1, (now - p.born) / 150);
      p.sprite.position.copy(at).setY(at.y + Math.sin(now / 160) * 0.04);
      p.sprite.material.opacity = Math.min(k, Math.max(0, (p.until - now) / 250));
      return true;
    });
  }

  clear() {
    for (const p of this.list) {
      this.scene.remove(p.sprite);
      p.sprite.material.dispose();
    }
    this.list = [];
  }
}
