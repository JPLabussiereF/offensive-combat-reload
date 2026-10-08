// The map bench (dev only, PF-35): `/?bench=<map>` builds an official map alone, no home, player or HUD, and
// draws it from fixed points (client/dev/benchPontos.json: the same places before and after a change). Each
// point's renderer.info.render and frame rate go to the console and to window.__ocBench, which
// tools/prints-mapas.ts drives for the before/after prints. Query: &detalhe=normal|leve (the map's object
// detail; the setting's when absent), &qualidade=baixa|media|alta (default alta), &ponto=<n> (start there).
import * as THREE from 'three';
import { isOfficialMap } from '@shared/maps';
import { applyAtmosphere, createRenderContext } from '../render/renderer';
import { QualityManager, type Quality } from '../render/quality';
import { createPhysics } from '../world/physics';
import { loadOfficialMap, startBuild, type LoadOptions } from '../world/mapLoader';
import { seeded } from '@shared/seeded';
import { loadTextureOverrides } from '../world/surfaces';
import { zombieAtmosphere } from '../zombies/ambience';
import { loadSettings, objectDetail, type ObjectDetail } from '../core/settings';
import POINTS from './benchPontos.json';

export interface BenchPoint {
  nome: string;
  /** Where the eye is. */
  p: [number, number, number];
  yaw: number;
  pitch: number;
}

export interface BenchSample {
  ponto: string;
  chamadas: number;
  triangulos: number;
  /** Frames per second over the measure (the frame rate isn't capped by the bench: see tools/prints-mapas.ts). */
  fps: number;
  /** Mean time of a frame's render call (CPU side), ms. */
  msRender: number;
}

const DEG = Math.PI / 180;

export async function runBench(slug: string) {
  if (!isOfficialMap(slug)) throw new Error(`bench: mapa oficial desconhecido "${slug}"`);
  const q = new URLSearchParams(location.search);
  const asked = q.get('detalhe');
  const detalhe: ObjectDetail = asked === 'leve' || asked === 'normal' ? asked : objectDetail(loadSettings());
  const quality = (q.get('qualidade') ?? 'alta') as Quality;
  // Only the canvas: the home, menus and HUD stay hidden.
  const style = document.createElement('style');
  style.textContent = 'body > *:not(#game) { display: none !important; } body { cursor: default; }';
  document.head.appendChild(style);

  const physics = await createPhysics();
  const ctx = createRenderContext(document.getElementById('game')!);
  const qm = new QualityManager(ctx);
  qm.set(quality);
  await loadTextureOverrides(ctx.renderer);
  const data = await loadOfficialMap(slug);
  // What the build draws at random, the same before and after a change: the pieces' a constant (as
  // tools/headless.ts does), the sky's (clouds, stars, sky lanterns) a seeded sequence of its own, started when
  // the pieces are done (so it doesn't depend on how many objects they made).
  const random = Math.random;
  const t0 = performance.now();
  let map;
  try {
    Math.random = () => 0.37;
    const build = startBuild(data, { physics, scene: ctx.scene, renderer: ctx.renderer, sfx: silentSfx, modo: 'jogo', detalhe });
    for (const peca of data.pecas) await build.piece(peca);
    Math.random = seeded(35);
    map = build.finish();
  } finally {
    Math.random = random;
  }
  const buildMs = performance.now() - t0;
  if (map.atmosphere) applyAtmosphere(ctx, data.exclusivo === 'zumbi' ? zombieAtmosphere(map.atmosphere) : map.atmosphere);
  if (map.shadowExtent) {
    const sc = ctx.sun.shadow.camera;
    sc.left = sc.bottom = -map.shadowExtent;
    sc.right = sc.top = map.shadowExtent;
    sc.far = 150;
    sc.updateProjectionMatrix();
  }

  const points = ((POINTS as unknown as Record<string, BenchPoint[]>)[slug] ?? []).slice();
  const cam = ctx.camera;
  const feet = new THREE.Vector3();
  const frame = { feet, listener: cam.position, launch() {}, time: 0 };
  /** Two seconds of the map's life (the lights picked, the lanterns afloat), the same every time. */
  const settle = () => {
    Math.random = () => 0.37;
    try {
      for (let i = 0; i < 120; i++) {
        frame.time = i / 60;
        map.update(1 / 60, frame);
      }
    } finally {
      Math.random = random;
    }
  };
  const go = (i: number) => {
    const pt = points[i];
    if (!pt) throw new Error(`bench: ponto ${i} não existe (${points.length} pontos)`);
    cam.position.set(...pt.p);
    feet.set(pt.p[0], pt.p[1] - 1.6, pt.p[2]);
    cam.rotation.set(pt.pitch, pt.yaw, 0);
    cam.updateMatrixWorld(true);
    settle();
    ctx.renderer.shadowMap.needsUpdate = true;
    ctx.render();
    ctx.renderer.shadowMap.needsUpdate = true;
    ctx.render();
    const info = ctx.renderer.info.render;
    return { ponto: pt.nome, chamadas: info.calls, triangulos: info.triangles };
  };
  /** Draws point `i` for `ms`, every frame like the game would (the shadow map on the preset's schedule). */
  const measure = (i: number, ms = 1500): Promise<BenchSample> =>
    new Promise((done) => {
      const first = go(i);
      let frames = 0;
      let renderMs = 0;
      const start = performance.now();
      const tick = () => {
        const now = performance.now();
        if (now - start >= ms) {
          done({ ...first, fps: Math.round((frames / (now - start)) * 1000 * 10) / 10, msRender: Math.round((renderMs / Math.max(1, frames)) * 100) / 100 });
          return;
        }
        qm.beforeRender();
        const r0 = performance.now();
        ctx.render();
        renderMs += performance.now() - r0;
        frames++;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

  const bench = {
    mapa: slug,
    detalhe,
    qualidade: quality,
    gpu: qm.gpu,
    buildMs: Math.round(buildMs),
    pontos: points,
    pronto: true,
    ir: go,
    medir: measure,
    async medirTodos(ms = 1500) {
      const out: BenchSample[] = [];
      for (let i = 0; i < points.length; i++) out.push(await measure(i, ms));
      console.table(out);
      return out;
    },
    renderer: ctx.renderer,
    scene: ctx.scene,
    camera: cam,
    /** A free look around (dev): yaw and pitch in degrees. */
    olhar(x: number, y: number, z: number, yawDeg: number, pitchDeg = 0) {
      points.push({ nome: 'livre', p: [x, y, z], yaw: yawDeg * DEG, pitch: pitchDeg * DEG });
      return go(points.length - 1);
    },
  };
  Object.assign(window, { __ocBench: bench });
  const start = Number(q.get('ponto') ?? 0);
  if (points.length) console.log('[bench]', slug, bench.detalhe, go(Math.min(start, points.length - 1)));
}

/** Map sounds play nothing on the bench. */
const silentSfx = new Proxy({}, { get: () => () => {} }) as LoadOptions['sfx'];
