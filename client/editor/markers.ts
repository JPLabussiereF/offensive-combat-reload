// What a map has besides its pieces, drawn as markers to see, pick and drag: the spawns (team A, team B, free
// for all), the training dummies, the collectibles, the witch's spot, the giant rats' places, the koi's loops
// and the zumbi layout (where the horde rises, the coffin, the bosses, the wall's corners and its gaps). Each
// marker has a key naming its place in the data ("spawn:a:0", "zumbi:chefe:noiva"...); the functions on keys
// are pure (client/tests/editorHistory.test.ts uses them).
import * as THREE from 'three';
import type { MapData, Vec3 } from '@shared/mapData';
import { BOSS_IDS, type BossId, type ZombieMapData } from '@shared/zombies';
import type { Rest } from './document';

type Data = Pick<MapData, 'spawns' | 'bonecos' | 'objetos' | 'zumbi'>;

/** What the palette adds. */
export type MarkerKind = 'spawnA' | 'spawnB' | 'spawnFfa' | 'boneco' | 'cereja' | 'biscoito' | 'rato' | 'peixe' | 'surgir' | 'barricada';

export interface Place {
  p: Vec3;
  /** Its facing (spawns, dummies, the coffin). */
  yaw?: number;
}

const r4 = (v: number) => {
  const x = Math.round(v * 1e4) / 1e4;
  return Object.is(x, -0) ? 0 : x;
};
const v3 = (p: Vec3): Vec3 => [r4(p[0]), r4(p[1]), r4(p[2])];
const SPAWN = { a: 'a', b: 'b', ffa: 'ffa' } as const;

/** Every marker key the data has, in drawing order. */
export function markerKeys(d: Data): string[] {
  const keys: string[] = [];
  for (const t of ['a', 'b', 'ffa'] as const) d.spawns[t].forEach((_, i) => keys.push(`spawn:${t}:${i}`));
  d.bonecos.forEach((_, i) => keys.push(`boneco:${i}`));
  d.objetos.coletaveis.forEach((_, i) => keys.push(`coletavel:${i}`));
  if (d.objetos.bruxa) keys.push('bruxa');
  d.objetos.ratos.forEach((_, i) => keys.push(`rato:${i}`));
  d.objetos.peixes.forEach((_, i) => keys.push(`peixe:${i}`));
  const z = d.zumbi;
  if (z) {
    z.surgir.forEach((_, i) => keys.push(`zumbi:surgir:${i}`));
    keys.push('zumbi:caixa');
    for (const b of BOSS_IDS) if (z.chefe[b]) keys.push(`zumbi:chefe:${b}`);
    z.barricadas.forEach((_, i) => keys.push(`zumbi:barricada:${i}`));
    keys.push('zumbi:dentro:0', 'zumbi:dentro:1');
  }
  return keys;
}

/** Where a marker stands (null: the key names nothing in this data). */
export function markerPlace(d: Data, key: string): Place | null {
  const [a, b, c] = key.split(':');
  const n = Number(c ?? b);
  if (a === 'spawn') {
    const s = d.spawns[SPAWN[b as keyof typeof SPAWN]]?.[n];
    return s ? { p: s.p, yaw: s.yaw } : null;
  }
  if (a === 'boneco') {
    const s = d.bonecos[Number(b)];
    return s ? { p: s.p, yaw: s.yaw } : null;
  }
  if (a === 'coletavel') return d.objetos.coletaveis[Number(b)] ? { p: d.objetos.coletaveis[Number(b)].p } : null;
  if (a === 'bruxa') return d.objetos.bruxa ? { p: d.objetos.bruxa } : null;
  if (a === 'rato') return d.objetos.ratos[Number(b)] ? { p: d.objetos.ratos[Number(b)].p } : null;
  if (a === 'peixe') {
    const f = d.objetos.peixes[Number(b)];
    return f ? { p: [f.volta[0], f.y, f.volta[1]] } : null;
  }
  const z = d.zumbi;
  if (a !== 'zumbi' || !z) return null;
  if (b === 'surgir') return z.surgir[n] ? { p: z.surgir[n] } : null;
  if (b === 'caixa') return { p: [z.caixa[0], z.caixa[1], z.caixa[2]], yaw: z.caixa[3] };
  if (b === 'chefe') return z.chefe[c as BossId] ? { p: z.chefe[c as BossId] } : null;
  if (b === 'barricada') return z.barricadas[n] ? { p: z.barricadas[n].centro } : null;
  if (b === 'dentro') return n === 0 ? { p: [z.dentro[0], 0, z.dentro[1]] } : { p: [z.dentro[2], 0, z.dentro[3]] };
  return null;
}

/** Whether the gizmo may turn it. */
export const markerTurns = (key: string) => key.startsWith('spawn:') || key.startsWith('boneco:') || key === 'zumbi:caixa';

/** Moves a marker (and turns it, where it turns) in a copy of the data. */
export function setMarkerPlace(r: Rest, key: string, place: Place) {
  const [a, b, c] = key.split(':');
  const n = Number(c ?? b);
  const p = v3(place.p);
  const yaw = place.yaw === undefined ? undefined : r4(Math.atan2(Math.sin(place.yaw), Math.cos(place.yaw)));
  if (a === 'spawn') {
    const s = r.spawns[SPAWN[b as keyof typeof SPAWN]][n];
    s.p = p;
    if (yaw !== undefined) s.yaw = yaw;
  } else if (a === 'boneco') {
    const s = r.bonecos[Number(b)];
    s.p = p;
    if (yaw !== undefined) s.yaw = yaw;
  } else if (a === 'coletavel') r.objetos.coletaveis[Number(b)].p = p;
  else if (a === 'bruxa') r.objetos.bruxa = p;
  else if (a === 'rato') r.objetos.ratos[Number(b)].p = p;
  else if (a === 'peixe') {
    const f = r.objetos.peixes[Number(b)];
    f.volta = [p[0], p[2], f.volta[2]];
    f.y = p[1];
  } else if (a === 'zumbi' && r.zumbi) {
    const z = r.zumbi;
    if (b === 'surgir') z.surgir[n] = p;
    else if (b === 'caixa') z.caixa = [p[0], p[1], p[2], yaw ?? z.caixa[3]];
    else if (b === 'chefe') z.chefe[c as BossId] = p;
    else if (b === 'barricada') z.barricadas[n].centro = onWall(z, z.barricadas[n].eixo, p);
    else if (b === 'dentro') moveCorner(z, n, p);
  }
}

/** A gap sits on the wall's line: along X on z0 or z1, along Z on x0 or x1 (the nearest), inside its ends. */
function onWall(z: ZombieMapData, eixo: 'x' | 'z', p: Vec3): Vec3 {
  const [x0, z0, x1, z1] = z.dentro;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi - 0.5, Math.max(lo + 0.5, v));
  if (eixo === 'x') return [clamp(p[0], x0, x1), p[1], Math.abs(p[2] - z0) < Math.abs(p[2] - z1) ? z0 : z1];
  return [Math.abs(p[0] - x0) < Math.abs(p[0] - x1) ? x0 : x1, p[1], clamp(p[2], z0, z1)];
}

/** A wall corner moved: the gaps on the lines it moved go with them. */
function moveCorner(z: ZombieMapData, n: number, p: Vec3) {
  const before = [...z.dentro];
  if (n === 0) [z.dentro[0], z.dentro[1]] = [p[0], p[2]];
  else [z.dentro[2], z.dentro[3]] = [p[0], p[2]];
  for (const g of z.barricadas) {
    if (g.eixo === 'x') {
      if (g.centro[2] === before[1]) g.centro = [g.centro[0], g.centro[1], z.dentro[1]];
      else if (g.centro[2] === before[3]) g.centro = [g.centro[0], g.centro[1], z.dentro[3]];
    } else if (g.centro[0] === before[0]) g.centro = [z.dentro[0], g.centro[1], g.centro[2]];
    else if (g.centro[0] === before[2]) g.centro = [z.dentro[2], g.centro[1], g.centro[2]];
  }
}

/** Takes a marker away (the witch's spot can't: it goes with the witch; the coffin, the bosses and the corners neither). */
export function removeMarker(r: Rest, key: string): boolean {
  const [a, b, c] = key.split(':');
  const n = Number(c ?? b);
  if (a === 'spawn') r.spawns[SPAWN[b as keyof typeof SPAWN]].splice(n, 1);
  else if (a === 'boneco') r.bonecos.splice(n, 1);
  else if (a === 'coletavel') r.objetos.coletaveis.splice(n, 1);
  else if (a === 'rato') r.objetos.ratos.splice(n, 1);
  else if (a === 'peixe') r.objetos.peixes.splice(n, 1);
  else if (a === 'zumbi' && r.zumbi && b === 'surgir') r.zumbi.surgir.splice(n, 1);
  else if (a === 'zumbi' && r.zumbi && b === 'barricada') r.zumbi.barricadas.splice(n, 1);
  else return false;
  return true;
}

/** A free id with a number ("koi:3"): fish ids always have one. */
function numbered(used: Set<string>, base: string) {
  for (let n = 0; n < 1000; n++) if (!used.has(`${base}:${n}`)) return `${base}:${n}`;
  return `${base}:999`;
}

const objectIds = (r: Rest) => new Set([...r.objetos.coletaveis.map((c) => c.id), ...r.objetos.ratos.map((x) => x.id), ...r.objetos.peixes.map((f) => f.id)]);

/** Adds a marker at `at` and returns its key (null: it needs the zumbi data first). */
export function addMarker(r: Rest, kind: MarkerKind, at: Vec3): string | null {
  const p = v3(at);
  switch (kind) {
    case 'spawnA':
    case 'spawnB':
    case 'spawnFfa': {
      const t = kind === 'spawnA' ? 'a' : kind === 'spawnB' ? 'b' : 'ffa';
      r.spawns[t].push({ p, yaw: 0 });
      return `spawn:${t}:${r.spawns[t].length - 1}`;
    }
    case 'boneco':
      r.bonecos.push({ p, yaw: 0 });
      return `boneco:${r.bonecos.length - 1}`;
    case 'cereja':
    case 'biscoito': {
      const used = objectIds(r);
      const id = used.has(kind) ? numbered(used, kind) : kind;
      r.objetos.coletaveis.push({ id, tipo: kind, p });
      return `coletavel:${r.objetos.coletaveis.length - 1}`;
    }
    case 'rato': {
      const used = objectIds(r);
      r.objetos.ratos.push({ id: used.has('rato') ? numbered(used, 'rato') : 'rato', p });
      return `rato:${r.objetos.ratos.length - 1}`;
    }
    case 'peixe':
      r.objetos.peixes.push({ id: numbered(objectIds(r), 'koi'), lago: 'lago', volta: [p[0], p[2], 1.2], y: p[1] });
      return `peixe:${r.objetos.peixes.length - 1}`;
    case 'surgir':
      if (!r.zumbi) return null;
      r.zumbi.surgir.push(p);
      return `zumbi:surgir:${r.zumbi.surgir.length - 1}`;
    case 'barricada': {
      if (!r.zumbi) return null;
      const used = new Set(r.zumbi.barricadas.map((g) => g.id));
      let id = 'brecha';
      for (let n = 1; used.has(id); n++) id = `brecha${n}`;
      r.zumbi.barricadas.push({ id, eixo: 'x', centro: onWall(r.zumbi, 'x', p), largura: 2.4 });
      return `zumbi:barricada:${r.zumbi.barricadas.length - 1}`;
    }
  }
}

/** A starting zumbi layout around `c` (the map's middle): a yard 24 m across, with what the mode needs to check out. */
export function zombieTemplate(c: Vec3): ZombieMapData {
  const [x, , z] = c.map((v) => Math.round(v)) as Vec3;
  const h = 12;
  const out = 20;
  return {
    dentro: [x - h, z - h, x + h, z + h],
    surgir: [0, 1, 2, 3, 4, 5].map((k): Vec3 => {
      const a = (k / 6) * Math.PI * 2;
      return [r4(x + Math.cos(a) * out), 0, r4(z + Math.sin(a) * out)];
    }),
    caixa: [x, 0, z, 0],
    chefe: { coveiro: [x, 0, z - out], noiva: [x - out, 0, z], prefeito: [x + out, 0, z] },
    barricadas: [
      { id: 'norte', eixo: 'x', centro: [x, 0, z - h], largura: 2.4 },
      { id: 'sul', eixo: 'x', centro: [x, 0, z + h], largura: 2.4 },
    ],
  };
}

// --- Drawing -------------------------------------------------------------------------------------------------

const COLORS: Record<string, number> = { a: 0x3d7bff, b: 0xff4040, ffa: 0xe8e8e8, boneco: 0xffcf3a, cereja: 0xff2a4a, biscoito: 0xb07a3a, bruxa: 0x9a4dff, rato: 0x8a8a8a, peixe: 0xff9a2a, surgir: 0x5ddc4a, caixa: 0x7a4a2a, chefe: 0xff5ad0, barricada: 0xffe14a, dentro: 0xffffff };
const mat = new Map<number, THREE.MeshBasicMaterial>();
const material = (c: number) => {
  let m = mat.get(c);
  if (!m) mat.set(c, (m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, depthTest: false })));
  return m;
};

export class Markers {
  readonly group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    this.group.name = 'marcadores';
    this.group.renderOrder = 15;
    scene.add(this.group);
  }

  /** Draws every marker of the data again (cheap: a few dozen meshes). */
  draw(d: Data) {
    for (const o of [...this.group.children]) {
      o.removeFromParent();
      o.traverse((x) => (x as THREE.Mesh).geometry?.dispose());
    }
    for (const key of markerKeys(d)) {
      const at = markerPlace(d, key);
      if (!at) continue;
      const o = this.shape(key, d);
      o.position.set(...at.p);
      if (at.yaw !== undefined) o.rotation.y = at.yaw;
      o.userData.marcador = key;
      o.traverse((x) => (x.renderOrder = 15));
      this.group.add(o);
    }
    const z = d.zumbi;
    if (z) {
      // The wall's line, drawn (not picked: its corners are).
      const [x0, z0, x1, z1] = z.dentro;
      const pts = [new THREE.Vector3(x0, 0.08, z0), new THREE.Vector3(x1, 0.08, z0), new THREE.Vector3(x1, 0.08, z1), new THREE.Vector3(x0, 0.08, z1)];
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }));
      this.group.add(line);
    }
  }

  private shape(key: string, d: Data): THREE.Object3D {
    const [a, b, c] = key.split(':');
    const g = new THREE.Group();
    const mesh = (geo: THREE.BufferGeometry, color: number, y = 0) => {
      const m = new THREE.Mesh(geo, material(color));
      m.position.y = y;
      g.add(m);
      return m;
    };
    if (a === 'spawn') {
      mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 16), COLORS[b], 0.03);
      // The arrow points where it faces (yaw 0: toward -Z).
      mesh(new THREE.ConeGeometry(0.22, 0.6, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.45), COLORS[b], 0.25);
      mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 8), COLORS[b], 0.8);
    } else if (a === 'boneco') {
      mesh(new THREE.CapsuleGeometry(0.3, 1.1, 4, 8), COLORS.boneco, 0.85);
      mesh(new THREE.ConeGeometry(0.15, 0.4, 6).rotateX(-Math.PI / 2).translate(0, 0, -0.4), COLORS.boneco, 1.3);
    } else if (a === 'coletavel') {
      const tipo = d.objetos.coletaveis[Number(b)]?.tipo;
      mesh(tipo === 'cereja' ? new THREE.SphereGeometry(0.22, 12, 8) : new THREE.BoxGeometry(0.3, 0.12, 0.3), COLORS[tipo ?? 'cereja']);
    } else if (a === 'bruxa') mesh(new THREE.ConeGeometry(0.4, 1.2, 10), COLORS.bruxa, 0.6);
    else if (a === 'rato') mesh(new THREE.SphereGeometry(0.4, 12, 8), COLORS.rato, 0.4);
    else if (a === 'peixe') {
      const f = d.objetos.peixes[Number(b)];
      mesh(new THREE.SphereGeometry(0.15, 10, 6), COLORS.peixe);
      if (f) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(f.volta[2], 0.03, 4, 32).rotateX(Math.PI / 2).scale(1, 1, 0.7), material(COLORS.peixe));
        g.add(ring);
      }
    } else if (a === 'zumbi') {
      if (b === 'surgir') mesh(new THREE.SphereGeometry(0.35, 10, 6), COLORS.surgir, 0.35);
      else if (b === 'caixa') {
        mesh(new THREE.BoxGeometry(0.8, 0.6, 2), COLORS.caixa, 0.3);
        mesh(new THREE.ConeGeometry(0.15, 0.4, 6).rotateX(-Math.PI / 2).translate(0, 0, -1.2), COLORS.caixa, 0.3);
      } else if (b === 'chefe') mesh(new THREE.OctahedronGeometry(0.6), COLORS.chefe, 0.8);
      else if (b === 'barricada') {
        const gap = d.zumbi!.barricadas[Number(c)];
        const w = gap?.largura ?? 2.4;
        mesh(gap?.eixo === 'z' ? new THREE.BoxGeometry(0.25, 2, w) : new THREE.BoxGeometry(w, 2, 0.25), COLORS.barricada, 1);
      } else if (b === 'dentro') mesh(new THREE.SphereGeometry(0.3, 10, 6), COLORS.dentro, 0.1);
    }
    return g;
  }

  /** A marker's object (to box it when selected). */
  get(key: string) {
    return this.group.children.find((o) => o.userData.marcador === key);
  }

  dispose() {
    this.group.removeFromParent();
  }
}
