// Night over "Jardim do Dragão": a dark sky, hardly any stars, and a river of paper lanterns rising into
// it from the estate and the land around, hundreds of them (the floating lanterns of Tangled), the near ones
// big and glowing, the far ones specks of light. The map lives by their light and its own lanterns': every
// hanging lantern and stone lantern glows, and the ones nearest the camera light their surroundings.
import * as THREE from 'three';
import { mergeColoredParts } from '../../render/materials';
import type { Atmosphere } from '../../render/renderer';

export const NIGHT: Atmosphere = {
  background: 0x05060c,
  // A warm, dark haze: the lanterns' light caught in the air.
  fog: { color: 0x1c1418, near: 40, far: 165 },
  // A cool night from above, and the warm bounce of the lanterns from below.
  hemi: { sky: 0x8a82b8, ground: 0x8a5a3a, intensity: 1.6 },
  // No sun: the soft, warm light of the lanterns overhead, from high up (soft shadows).
  sun: { color: 0xffc080, intensity: 1.2, from: [15, 60, 25] },
  viewmodel: { sky: 0xb4a8d8, ground: 0x7a5038, hemi: 1.45, sun: 1.15, sunColor: 0xffc088 },
};

/** Soft round glow, white in the middle fading to nothing (tinted by the material). */
export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.15)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The night sky: a dome around the camera, near black overhead, a faint warm glow along the horizon (the
 * lanterns' light in the haze), and a few stars. Returns the per-frame update (it follows the camera).
 */
export function nightSky(scene: THREE.Scene): (camera: THREE.Vector3) => void {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(330, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x040509) },
        mid: { value: new THREE.Color(0x0b0a15) },
        horizon: { value: new THREE.Color(0x2a1812) },
        glow: { value: new THREE.Color(0x4a2410) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top, mid, horizon, glow;
        varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.28, h));
          c = mix(c, top, smoothstep(0.25, 0.85, h));
          // The haze over the horizon, lit by the lanterns all around.
          c += glow * (1.0 - smoothstep(-0.02, 0.22, h));
          // Under the horizon (only seen over the outer wall from up high): the dark land.
          c = mix(c, horizon * 0.35, smoothstep(0.0, -0.08, h));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  // A few faint stars, well above the haze (the lanterns are the sky's lights).
  const pts: number[] = [];
  for (let i = 0; i < 260; i++) {
    const y = 0.25 + Math.random() * 0.75;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    pts.push(Math.cos(a) * r * 320, y * 320, Math.sin(a) * r * 320);
  }
  const stars = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)),
    new THREE.PointsMaterial({ color: 0xfff4dc, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.45, depthWrite: false, fog: false }),
  );
  stars.renderOrder = -9;
  stars.frustumCulled = false;
  scene.add(dome, stars);
  return (camera) => {
    dome.position.copy(camera);
    stars.position.copy(camera);
  };
}

const SKY_N = 650;
const SKY_TOP = 170;

/**
 * Paper lanterns floating up into the night, a candle glowing in each: they rise slowly, drift with the
 * breeze and sway, from inside the estate (low, between the roofs) and from the land all around; one that
 * gets too high starts over from below. Unlit (they glow) and out of the fog; a halo around each.
 */
export class SkyLanterns {
  private mesh: THREE.InstancedMesh;
  private halos: THREE.Points;
  private pos = new Float32Array(SKY_N * 3);
  private speed = new Float32Array(SKY_N);
  private size = new Float32Array(SKY_N);
  private phase = new Float32Array(SKY_N);
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private t = 0;

  constructor(scene: THREE.Scene) {
    // A paper tube, wider at the top, lit from inside: brightest toward its open bottom where the candle
    // burns (the flame shows there), the paper deepening to orange toward the top.
    // 34 triangles (PF-35): six sides, the flame 4 × 3 (they float tens of meters up, by the hundred).
    const bodyGeo = new THREE.CylinderGeometry(0.42, 0.33, 0.95, 6, 1, true).toNonIndexed();
    const p = bodyGeo.getAttribute('position');
    const top = new THREE.Color(0xd8742c);
    const bottom = new THREE.Color(0xffe0a0);
    const colArr = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) colArr.set(c.copy(bottom).lerp(top, Math.pow((p.getY(i) + 0.475) / 0.95, 0.8)).toArray(), i * 3);
    bodyGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    const rim = mergeColoredParts([
      { geo: new THREE.CircleGeometry(0.42, 6).rotateX(-Math.PI / 2), color: 0x8a3a12, pos: [0, 0.475, 0] },
      { geo: new THREE.SphereGeometry(0.09, 4, 3), color: 0xfff6d8, pos: [0, -0.4, 0], scale: [1, 1.4, 1] },
    ]);
    const geo = mergeGeometriesSafe([bodyGeo, rim]);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }), SKY_N);
    this.mesh.frustumCulled = false;
    this.halos = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(this.pos, 3)),
      new THREE.PointsMaterial({ map: glowTexture(), color: 0xffa046, size: 4.5, sizeAttenuation: true, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    this.halos.frustumCulled = false;
    scene.add(this.mesh, this.halos);
    for (let i = 0; i < SKY_N; i++) this.spawn(i, 6 + Math.random() * (SKY_TOP - 6));
    this.update(0);
  }

  /** Lantern `i` starts at height `y`: a quarter over the estate, the rest over the land around it. */
  private spawn(i: number, y: number) {
    const inside = i % 4 === 0;
    const a = Math.random() * Math.PI * 2;
    const r = inside ? Math.sqrt(Math.random()) * 40 : 50 + Math.pow(Math.random(), 0.7) * 190;
    this.pos.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
    this.speed[i] = 0.3 + Math.random() * 0.45;
    this.size[i] = 0.85 + Math.random() * 0.55;
    this.phase[i] = Math.random() * Math.PI * 2;
  }

  update(dt: number) {
    this.t += dt;
    for (let i = 0; i < SKY_N; i++) {
      const k = i * 3;
      const ph = this.phase[i];
      this.pos[k] += (0.35 + 0.25 * Math.sin(this.t * 0.2 + ph)) * dt;
      this.pos[k + 1] += this.speed[i] * dt;
      this.pos[k + 2] += (0.18 + 0.2 * Math.cos(this.t * 0.17 + ph)) * dt;
      if (this.pos[k + 1] > SKY_TOP) this.spawn(i, 4 + Math.random() * 4);
      this.e.set(Math.sin(this.t * 0.9 + ph) * 0.08, ph, Math.cos(this.t * 0.7 + ph) * 0.08);
      this.q.setFromEuler(this.e);
      const s = this.size[i];
      this.m.compose(this.v.set(this.pos[k], this.pos[k + 1], this.pos[k + 2]), this.q, this.s.set(s, s, s));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.halos.geometry.getAttribute('position').needsUpdate = true;
  }
}

/** mergeGeometries for parts that may differ in attributes: keeps position and color only. */
function mergeGeometriesSafe(geos: THREE.BufferGeometry[]) {
  const pos: number[] = [];
  const col: number[] = [];
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const p = g.getAttribute('position');
    const c = g.getAttribute('color');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      col.push(c ? c.getX(i) : 1, c ? c.getY(i) : 1, c ? c.getZ(i) : 1);
    }
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)).setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
}

/** How many real lights the lanterns get (the nearest to the camera); the rest only glow. */
const LIGHTS = 6;
const LIGHT_RANGE = 10;

/**
 * The map's lights at night: a halo around every lantern (hanging ones follow their swing) and a few point
 * lights moved to the lanterns nearest the camera, fading in where they land, so the light around you comes
 * from the lanterns you see.
 */
export class LanternLights {
  private halos: THREE.Points;
  private haloPos: Float32Array;
  private lights: { light: THREE.PointLight; spot: number; level: number }[] = [];
  private pick = 0;
  private spots = 0;
  private swingingCount = 0;
  private fixedCount = 0;

  /**
   * `swinging`: the hanging lanterns' live positions (Services.lanternSpots); `fixed`: stone lanterns and lamps.
   * Both lists may grow or shrink later (the editor rebuilding a piece): the halos follow.
   */
  constructor(
    scene: THREE.Scene,
    private swinging: () => Float32Array,
    private fixed: THREE.Vector3[],
  ) {
    this.haloPos = new Float32Array(0);
    this.halos = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ map: glowTexture(), color: 0xff9a3c, size: 2.6, sizeAttenuation: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.layout(swinging().length / 3);
    this.halos.frustumCulled = false;
    scene.add(this.halos);
    for (let i = 0; i < LIGHTS; i++) {
      const light = new THREE.PointLight(0xffa24e, 0, LIGHT_RANGE, 1.7);
      scene.add(light);
      this.lights.push({ light, spot: -1, level: 0 });
    }
  }

  /** The halos' positions for `n` hanging lanterns, then the fixed ones; the lights pick again. */
  private layout(n: number) {
    this.swingingCount = n;
    this.fixedCount = this.fixed.length;
    this.spots = n + this.fixed.length;
    this.haloPos = new Float32Array(this.spots * 3);
    this.fixed.forEach((p, i) => this.haloPos.set([p.x, p.y, p.z], (n + i) * 3));
    this.halos.geometry.setAttribute('position', new THREE.BufferAttribute(this.haloPos, 3));
    for (const l of this.lights) l.spot = -1;
    this.pick = 0;
  }

  private spot(i: number, out: THREE.Vector3) {
    return out.fromArray(this.haloPos, i * 3);
  }

  update(dt: number, camera: THREE.Vector3) {
    const live = this.swinging();
    if (live.length !== this.swingingCount * 3 || this.fixed.length !== this.fixedCount) this.layout(live.length / 3);
    this.haloPos.set(live);
    this.halos.geometry.getAttribute('position').needsUpdate = true;
    // A few times a second: which lanterns are nearest. A light keeps its lantern while it's still among them.
    this.pick -= dt;
    if (this.pick <= 0) {
      this.pick = 0.25;
      const d = new Float32Array(this.spots);
      for (let i = 0; i < this.spots; i++) {
        const k = i * 3;
        d[i] = (this.haloPos[k] - camera.x) ** 2 + (this.haloPos[k + 1] - camera.y) ** 2 + (this.haloPos[k + 2] - camera.z) ** 2;
      }
      const nearest = [...d.keys()].sort((a, b) => d[a] - d[b]).slice(0, LIGHTS);
      const taken = new Set(this.lights.map((l) => l.spot).filter((s) => nearest.includes(s)));
      const free = nearest.filter((s) => !taken.has(s));
      for (const l of this.lights) {
        if (nearest.includes(l.spot)) continue;
        l.spot = free.shift() ?? -1;
        l.level = 0;
      }
    }
    for (const l of this.lights) {
      if (l.spot < 0) {
        l.light.intensity = 0;
        continue;
      }
      l.level = Math.min(1, l.level + dt * 2.5);
      this.spot(l.spot, l.light.position);
      // A candle's flicker.
      l.light.intensity = 4.5 * l.level * (0.92 + 0.08 * Math.sin(performance.now() * 0.011 + l.spot));
    }
  }
}
