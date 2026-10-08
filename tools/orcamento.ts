#!/usr/bin/env bun
// What the game costs to draw, measured without a screen (PF-35): every official map at both levels of object
// detail (Normal / Leve: the worst sample camera, the median one, the sun's shadow, the draw calls and the
// instances drawn at scale zero), the characters (200 random looks with a fixed seed, at each level of detail),
// the weapons in third person, the viewmodel and the combat effects (at rest and with every pool full). The
// triangles are counted as three.js counts them in a frame (renderer.info, client/world/budget.ts).
//
//   bun tools/orcamento.ts                    everything: a table, and the JSON in build/orcamento.json
//   bun tools/orcamento.ts jardim halloween   only those maps (and the rest)
//   bun tools/orcamento.ts --json saida.json  the JSON somewhere else
//   bun tools/orcamento.ts --so-mapas         only the maps
//
// client/tests/polyBudget.test.ts holds the game to the budgets with these same functions.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as THREE from 'three';
import type { MapData } from '@shared/mapData';
import { fakeRenderer, installCanvasStandIn, loadClient, ROOT, silentSfx } from './headless';
import { buildHeadless, OFFICIAL, type OfficialMap } from './snapshot-mapas';

export type Detalhe = 'normal' | 'leve';
export const DETALHES: Detalhe[] = ['normal', 'leve'];

interface Amostra {
  triangulos: number;
  chamadas: number;
}

export interface MapaMedido {
  mapa: string;
  detalhe: Detalhe;
  /** The worst sample camera (without the shadow). */
  piorCamera: Amostra;
  /** The median sample camera. */
  mediana: Amostra;
  /** The sun's shadow pass. */
  sombra: Amostra;
  /** Draw calls of the worst camera plus the shadow's (what MAP_BUDGET holds to 400). */
  chamadas: number;
  /** Triangles of the worst camera plus the shadow's (what MAP_BUDGET holds to 750 thousand). */
  total: number;
  /** Instances drawn at scale zero, and the meshes they're in. */
  fantasmas: { instancias: number; triangulos: number; malhas: { nome: string; instancias: number; triangulos: number }[] };
  amostras: number;
  /** Where the worst camera stands and looks (for the prints). */
  onde: { piorTriangulos: { onde: number[]; yaw: number }; piorChamadas: { onde: number[]; yaw: number } };
  ms: number;
}

/** An official map built as the game builds it, at a level of detail. */
export async function buildMapa(slug: OfficialMap, detalhe: Detalhe) {
  const { buildMapFromData, loadOfficialMap } = await loadClient('client/world/mapLoader.ts');
  const data = (await loadOfficialMap(slug)) as MapData;
  const built = await buildHeadless((physics, scene) => buildMapFromData(data, { physics, scene, renderer: fakeRenderer, sfx: silentSfx, modo: 'jogo', detalhe }));
  return { data, ...built };
}

export async function medirMapa(slug: OfficialMap, detalhe: Detalhe): Promise<MapaMedido> {
  const t0 = performance.now();
  const { measureMapBudget, ghostInstances } = await loadClient('client/world/budget.ts');
  const { data, scene } = await buildMapa(slug, detalhe);
  const r = measureMapBudget(scene, data);
  const g = ghostInstances(scene);
  return {
    mapa: slug,
    detalhe,
    piorCamera: { triangulos: r.camera.triangulos, chamadas: r.camera.drawCalls },
    mediana: { triangulos: r.camera.mediana.triangulos, chamadas: r.camera.mediana.drawCalls },
    sombra: { triangulos: r.sombra.triangulos, chamadas: r.sombra.drawCalls },
    chamadas: r.drawCalls,
    total: r.triangulos,
    fantasmas: { instancias: g.instancias, triangulos: g.triangulos, malhas: g.malhas },
    amostras: r.amostras,
    onde: { piorTriangulos: r.camera.piorTriangulos, piorChamadas: r.camera.piorChamadas },
    ms: Math.round(performance.now() - t0),
  };
}

/** What each kind of piece costs in a map: how many there are, the heaviest one's triangles and all of them together. */
export interface PecaMedida {
  tipo: string;
  quantas: number;
  maior: number;
  total: number;
}

/**
 * The cost piece by piece: the map built as the editor builds it (each piece in its own group, with its own
 * batches and collections), every piece's triangles (an instanced mesh's times its count). Heaviest first.
 */
export async function medirPecas(slug: OfficialMap, detalhe: Detalhe): Promise<PecaMedida[]> {
  const { buildMapFromData, loadOfficialMap } = await loadClient('client/world/mapLoader.ts');
  const data = (await loadOfficialMap(slug)) as MapData;
  const built = await buildHeadless((physics, scene) => buildMapFromData(data, { physics, scene, renderer: fakeRenderer, sfx: silentSfx, modo: 'editor', detalhe }));
  const byType = new Map<string, PecaMedida>();
  for (const [id, piece] of built.map.pieces as Map<string, { group: THREE.Object3D }>) {
    const tipo = data.pecas.find((p) => p.id === id)!.tipo;
    let n = 0;
    piece.group.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || o.userData.ajuda) return;
      const inst = o as THREE.InstancedMesh;
      n += triangles(m.geometry) * (inst.isInstancedMesh ? inst.count : 1);
    });
    const row = byType.get(tipo) ?? { tipo, quantas: 0, maior: 0, total: 0 };
    row.quantas++;
    row.maior = Math.max(row.maior, Math.round(n));
    row.total += Math.round(n);
    byType.set(tipo, row);
  }
  return [...byType.values()].sort((a, b) => b.total - a.total);
}

// --- Characters ---------------------------------------------------------------------------------------------

export interface PersonagensMedidos {
  visuais: number;
  semente: number;
  /** Triangles of each level of detail (0, 1, 2): median, 90th percentile and the most. */
  lod: { mediana: number; p90: number; maximo: number }[];
  /** Each look's LOD1/LOD0 and LOD2/LOD0, at the 90th percentile and the most. */
  razao: { lod1: { p90: number; maximo: number }; lod2: { p90: number; maximo: number } };
  /** The default look (no account) and the bare body. */
  padrao: number[];
}

const pct = (values: number[], p: number) => {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
};
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Triangles of each baked level of a character. */
function lodTriangles(character: { root: THREE.Object3D; bake(): void }): number[] {
  character.bake();
  const lod = character.root.getObjectByName('baked') as THREE.LOD;
  return lod.levels.map((l) => (l.object as THREE.Mesh).geometry.getAttribute('position').count / 3);
}

export async function medirPersonagens(visuais = 200, semente = 35): Promise<PersonagensMedidos> {
  const restore = installCanvasStandIn();
  try {
    const { Character } = await loadClient('client/character/character.ts');
    const { appearanceToConfig } = await loadClient('client/entities/avatar.ts');
    const { defaultAppearance, randomAppearance } = await loadClient('shared/appearance.ts');
    const { seeded } = await loadClient('shared/seeded.ts');
    const rnd = seeded(semente);
    const rows: number[][] = [];
    for (let i = 0; i < visuais; i++) {
      const sex = rnd() < 0.5 ? 'm' : 'f';
      rows.push(lodTriangles(new Character(appearanceToConfig(randomAppearance(sex, rnd), sex))));
    }
    const at = (k: number) => rows.map((r) => r[k]);
    const r1 = rows.map((r) => r[1] / r[0]);
    const r2 = rows.map((r) => r[2] / r[0]);
    return {
      visuais,
      semente,
      lod: [0, 1, 2].map((k) => ({ mediana: pct(at(k), 0.5), p90: pct(at(k), 0.9), maximo: Math.max(...at(k)) })),
      razao: { lod1: { p90: r3(pct(r1, 0.9)), maximo: r3(Math.max(...r1)) }, lod2: { p90: r3(pct(r2, 0.9)), maximo: r3(Math.max(...r2)) } },
      padrao: lodTriangles(new Character(appearanceToConfig(defaultAppearance('m'), 'm'))),
    };
  } finally {
    restore();
  }
}

// --- Weapons ------------------------------------------------------------------------------------------------

export interface ArmasMedidas {
  /** Each gun in third person: its heaviest look (sight, magazine, silencer) and the plain one. */
  terceiraPessoa: { arma: string; triangulos: number; base: number }[];
  facas: { faca: string; triangulos: number }[];
  granada: number;
  /** The first-person view (arms and gun) with each gun's heaviest look. */
  viewmodel: { arma: string; triangulos: number }[];
}

const triangles = (geo: THREE.BufferGeometry) => (geo.index ? geo.index.count : (geo.getAttribute('position')?.count ?? 0)) / 3;

/** What three.js would draw of an object: its visible meshes' triangles. */
function visibleTriangles(root: THREE.Object3D): number {
  let n = 0;
  root.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && (m.material as THREE.Material).visible !== false) n += triangles(m.geometry);
  });
  return Math.round(n);
}

export async function medirArmas(): Promise<ArmasMedidas> {
  const restore = installCanvasStandIn();
  try {
    const { heldGun, heldKnife, heldGrenade } = await loadClient('client/entities/heldWeapons.ts');
    const { Viewmodel } = await loadClient('client/render/viewmodel.ts');
    const { gunModelKey } = await loadClient('client/render/weaponModels.ts');
    const { gunStats } = await loadClient('shared/arsenal.ts');
    const { GUN_IDS, KNIVES, PROGRESSION, progOf } = await loadClient('shared/progression.ts');
    const { defaultAppearance } = await loadClient('shared/appearance.ts');
    const vmScene = new THREE.Scene();
    const vm = new Viewmodel(vmScene);
    vm.setBody(defaultAppearance('m'), 'm');
    const out: ArmasMedidas = { terceiraPessoa: [], facas: [], granada: 0, viewmodel: [] };
    for (const gun of GUN_IDS as string[]) {
      // Every look the gun can have: plain, every upgrade, and each upgrade alone (a sight, the silencer...).
      const ids: string[] = PROGRESSION[progOf(gun)].melhorias.map((u: { id: string }) => u.id);
      const looks = new Map<string, unknown>();
      for (const ups of [[], ids, ...ids.map((id) => [id])]) {
        const s = gunStats(gun, ups);
        looks.set(gunModelKey(s), s);
      }
      let worst = 0;
      let worstVm = 0;
      for (const s of looks.values()) {
        worst = Math.max(worst, triangles((heldGun(s) as THREE.Mesh).geometry));
        vm.setGun(s);
        worstVm = Math.max(worstVm, visibleTriangles(vmScene));
      }
      out.terceiraPessoa.push({ arma: gun, triangulos: Math.round(worst), base: Math.round(triangles((heldGun(gunStats(gun)) as THREE.Mesh).geometry)) });
      out.viewmodel.push({ arma: gun, triangulos: worstVm });
    }
    for (const knife of KNIVES as string[]) out.facas.push({ faca: knife, triangulos: visibleTriangles(heldKnife(knife)) });
    out.granada = visibleTriangles(heldGrenade());
    return out;
  } finally {
    restore();
  }
}

// --- Combat effects -----------------------------------------------------------------------------------------

export interface EfeitosMedidos {
  /** Drawn with nothing going on (empty pools). */
  repouso: number;
  /** With every pool full at once (decals, particles, tracers, fireballs, smoke, rings). */
  pico: number;
}

export async function medirEfeitos(): Promise<EfeitosMedidos> {
  const restore = installCanvasStandIn();
  try {
    const { Effects } = await loadClient('client/render/effects.ts');
    const scene = new THREE.Scene();
    const fx = new Effects(scene);
    const drawn = () => {
      let n = 0;
      scene.traverseVisible((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const inst = o as THREE.InstancedMesh;
        n += triangles(m.geometry) * (inst.isInstancedMesh ? inst.count : 1);
      });
      return Math.round(n);
    };
    const repouso = drawn();
    // Every pool full: as many explosions as there are fireballs, shots until the decals and the particles wrap.
    const p = new THREE.Vector3(0, 1, 0);
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 4; i++) fx.explosion(p, { point: new THREE.Vector3(0, 0, 0), normal: up }, 5);
    for (let i = 0; i < 400; i++) {
      fx.decal(p, up);
      fx.burst('debris', p, up, 2);
      fx.tracer(new THREE.Vector3(0, 1, 10), p);
    }
    fx.update(1 / 60);
    return { repouso, pico: drawn() };
  } finally {
    restore();
  }
}

// --- The report ---------------------------------------------------------------------------------------------

export interface Orcamento {
  quando: string;
  mapas: MapaMedido[];
  personagens?: PersonagensMedidos;
  armas?: ArmasMedidas;
  efeitos?: EfeitosMedidos;
}

const k = (n: number) => `${(n / 1000).toFixed(1)}k`;

export function tabela(o: Orcamento): string {
  const lines: string[] = [];
  lines.push('mapa        detalhe  pior câmera        mediana            sombra            chamadas  fantasmas');
  for (const m of o.mapas) {
    lines.push(
      [
        m.mapa.padEnd(11),
        m.detalhe.padEnd(8),
        `${k(m.piorCamera.triangulos)} (${m.piorCamera.chamadas})`.padEnd(18),
        `${k(m.mediana.triangulos)} (${m.mediana.chamadas})`.padEnd(18),
        `${k(m.sombra.triangulos)} (${m.sombra.chamadas})`.padEnd(17),
        String(m.chamadas).padEnd(9),
        `${m.fantasmas.instancias} inst. / ${k(m.fantasmas.triangulos)}`,
      ].join(' '),
    );
  }
  if (o.personagens) {
    const p = o.personagens;
    lines.push('', `personagens (${p.visuais} visuais, semente ${p.semente}): LOD0/1/2 mediana ${p.lod.map((l) => l.mediana).join(' / ')}, p90 ${p.lod.map((l) => l.p90).join(' / ')}, máximo ${p.lod.map((l) => l.maximo).join(' / ')}`);
    lines.push(`  razão LOD1/LOD0 p90 ${p.razao.lod1.p90} (máx. ${p.razao.lod1.maximo}), LOD2/LOD0 p90 ${p.razao.lod2.p90} (máx. ${p.razao.lod2.maximo}); visual padrão ${p.padrao.join(' / ')}`);
  }
  if (o.armas) {
    const a = o.armas;
    lines.push('', 'arma        3ª pessoa (pior / base)  viewmodel');
    for (const g of a.terceiraPessoa) lines.push(`${g.arma.padEnd(11)} ${`${g.triangulos} / ${g.base}`.padEnd(24)} ${a.viewmodel.find((v) => v.arma === g.arma)?.triangulos ?? '-'}`);
    lines.push(`facas: ${a.facas.map((f) => `${f.faca} ${f.triangulos}`).join(', ')}; granada ${a.granada}`);
  }
  if (o.efeitos) lines.push('', `efeitos: repouso ${o.efeitos.repouso}, pico ${o.efeitos.pico}`);
  return lines.join('\n');
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const jsonAt = args.includes('--json') ? args[args.indexOf('--json') + 1] : join(ROOT, 'build', 'orcamento.json');
  const onlyMaps = args.includes('--so-mapas');
  const only = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--json');
  if (args.includes('--pecas')) {
    // The heaviest kinds of piece of each map (bun tools/orcamento.ts --pecas jardim).
    for (const slug of OFFICIAL) {
      if (only.length && !only.includes(slug)) continue;
      for (const d of DETALHES) {
        console.log(`\n${slug} (${d}): tipo, quantas, a maior, total`);
        for (const p of (await medirPecas(slug, d)).slice(0, 40)) console.log(`  ${p.tipo.padEnd(20)} ${String(p.quantas).padStart(4)} ${String(p.maior).padStart(8)} ${String(p.total).padStart(9)}`);
      }
    }
    process.exit(0);
  }
  const o: Orcamento = { quando: new Date().toISOString(), mapas: [] };
  for (const slug of OFFICIAL) {
    if (only.length && !only.includes(slug)) continue;
    for (const d of DETALHES) {
      const m = await medirMapa(slug, d);
      o.mapas.push(m);
      console.error(`${slug} ${d}: ${m.ms} ms`);
    }
  }
  if (!onlyMaps) {
    o.personagens = await medirPersonagens();
    o.armas = await medirArmas();
    o.efeitos = await medirEfeitos();
  }
  mkdirSync(dirname(jsonAt), { recursive: true });
  await Bun.write(jsonAt, JSON.stringify(o, null, 2));
  console.log(tabela(o));
  console.log(`\nJSON: ${jsonAt}`);
  process.exit(0);
}
