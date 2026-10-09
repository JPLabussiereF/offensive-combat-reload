#!/usr/bin/env bun
// Before/after prints of the official maps (PF-35): the same points, the same direction, at each level of
// object detail, so a change in the maps' geometry can be approved by eye. The points are fixed in
// client/dev/benchPontos.json (the worst cameras of the budget, the spawns, a view from above and a close look at
// the props a change touches) and drawn by the dev bench (`/?bench=<map>`, client/dev/bench.ts) in a real
// Chrome with the GPU, through a Vite of its own (no game server).
//
//   bun tools/prints-mapas.ts --pontos                       (re)writes the points (do it once, before a change)
//   bun tools/prints-mapas.ts --rotulo antes                 prints of every map, Normal detail
//   bun tools/prints-mapas.ts --rotulo depois --detalhe normal,leve jardim
//   bun tools/prints-mapas.ts --lado-a-lado                  joins antes-normal | depois-normal | depois-leve
//
// Options: --saida <dir> (default build/prints), --porta <n> (default 5291), --chrome <path>, --fps <ms> (measures
// each point's frame rate for that long; the numbers go to <saida>/<map>/bench_<rotulo>-<detalhe>.json).
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as THREE from 'three';
import type { MapData } from '@shared/mapData';
import { fakeRenderer, loadClient, ROOT, silentSfx } from './headless';
import { buildHeadless, OFFICIAL, type OfficialMap } from './snapshot-mapas';

const POINTS_FILE = join(ROOT, 'client', 'dev', 'benchPontos.json');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const EYE = 1.6;

interface Point {
  nome: string;
  p: [number, number, number];
  yaw: number;
  pitch: number;
}

/** The props each map's prints look at closely (the pieces the PF-35 cuts touch). */
const CLOSE_UPS: Record<OfficialMap, string[]> = {
  rua: ['carro', 'van', 'caminhaoSorvete', 'flamingo', 'cachorro', 'hidrante', 'arvoreRua', 'arbusto'],
  jardim: ['dragaoDecorativo', 'leaoPedra', 'panda', 'cerejeiraDragao', 'bosqueBambu', 'lanternaPapel', 'varalLanternas', 'telhadoCurvo', 'sebeJardim', 'pinheiro', 'estanteJardim', 'cereja', 'carrinho', 'fonteDragao'],
  halloween: ['abobora', 'grade', 'arvoreMorta', 'bruxa', 'trailerCirco', 'rodaGigante', 'carrinhosBateBate', 'estante', 'estantePocoes', 'carro', 'casaAssombrada', 'espantalho'],
  cemiterio: ['muroCemiterio', 'arvoreMorta', 'arcoPortao', 'lapide', 'telhado'],
};

const round = (v: number) => Math.round(v * 1000) / 1000;
const yawTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);

/** The fixed points of a map (see the header). */
async function pointsOf(slug: OfficialMap): Promise<Point[]> {
  const { buildMapFromData, loadOfficialMap } = await loadClient('client/world/mapLoader.ts');
  const { measureMapBudget } = await loadClient('client/world/budget.ts');
  const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
  const data = (await loadOfficialMap(slug)) as MapData;
  const game = await buildHeadless((physics, scene) => buildMapFromData(data, { physics, scene, renderer: fakeRenderer, sfx: silentSfx, modo: 'jogo' }));
  const r = measureMapBudget(game.scene, data);
  const out: Point[] = [];
  const view = (nome: string, v: { onde: number[]; yaw: number }) => out.push({ nome, p: v.onde.map(round) as Point['p'], yaw: round(v.yaw), pitch: 0 });
  view('pior-triangulos', r.camera.piorTriangulos);
  view('pior-chamadas', r.camera.piorChamadas);
  for (const [team, list] of [['a', data.spawns.a], ['b', data.spawns.b]] as const) {
    const s = list[0] ?? data.spawns.ffa[0];
    if (s) out.push({ nome: `spawn-${team}`, p: [round(s.p[0]), round(s.p[1] + EYE), round(s.p[2])], yaw: round(s.yaw), pitch: 0 });
  }
  // The map from above, from one corner toward the middle.
  const bounds = new THREE.Box3();
  game.scene.traverse((o) => {
    if (!o.name.startsWith('static:')) return;
    const geo = (o as THREE.Mesh).geometry;
    geo.computeBoundingBox();
    bounds.union(geo.boundingBox!.clone().applyMatrix4(o.matrixWorld));
  });
  const c = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  {
    const from = new THREE.Vector3(c.x + size.x * 0.42, Math.max(22, size.x * 0.3), c.z + size.z * 0.42);
    const d = Math.hypot(c.x - from.x, c.z - from.z);
    out.push({ nome: 'alto', p: [round(from.x), round(from.y), round(from.z)], yaw: round(yawTo(c.x - from.x, c.z - from.z)), pitch: round(-Math.atan2(from.y - 2, d)) });
  }
  if (data.ambiente.ceu.cupula?.tipo === 'oriental') {
    // The sky lanterns: looking up from a spawn where nothing of the map is in the way.
    const statics: THREE.Object3D[] = [];
    game.scene.traverse((o) => o.name.startsWith('static:') && statics.push(o));
    const ray = new THREE.Raycaster();
    ray.far = 150;
    const pitch = 0.5;
    search: for (const s of [...data.spawns.a, ...data.spawns.b, ...data.spawns.ffa]) {
      for (let k = 0; k < 8; k++) {
        const yaw = (k / 8) * Math.PI * 2;
        const eye = new THREE.Vector3(s.p[0], s.p[1] + EYE, s.p[2]);
        ray.set(eye, new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)));
        if (ray.intersectObjects(statics, false).length) continue;
        out.push({ nome: 'ceu', p: [round(eye.x), round(eye.y), round(eye.z)], yaw: round(yaw), pitch });
        break search;
      }
    }
  }

  // A close look at each prop: from the side facing the middle of the map, where nothing is in the way.
  const editor = await buildHeadless((physics, scene) => buildMapFromData(data, { physics, scene, renderer: fakeRenderer, sfx: silentSfx, modo: 'editor' }));
  const world = editor.physics.world;
  world.step();
  const pieces = editor.map.pieces as Map<string, { group: THREE.Group }>;
  for (const tipo of CLOSE_UPS[slug]) {
    const peca = data.pecas.find((p) => p.tipo === tipo);
    const piece = peca && pieces.get(peca.id);
    if (!piece) continue;
    piece.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(piece.group);
    if (box.isEmpty()) continue;
    const at = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    const dist = Math.min(30, Math.max(4, Math.max(s.x, s.y, s.z) * 1.3 + 2));
    const eyeY = Math.max(box.min.y + EYE, Math.min(at.y, box.min.y + 6));
    const toMiddle = Math.atan2(c.z - at.z, c.x - at.x);
    let best: Point | null = null;
    for (let k = 0; k < 16 && !best; k++) {
      const a = toMiddle + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
      const cam = new THREE.Vector3(at.x + Math.cos(a) * dist, eyeY, at.z + Math.sin(a) * dist);
      const dir = new THREE.Vector3().subVectors(cam, at);
      const len = dir.length();
      dir.normalize();
      // From the prop's own surface outward (start past its box), nothing between it and the camera.
      const start = at.clone().addScaledVector(dir, Math.min(len - 0.5, Math.max(s.x, s.z) * 0.6 + 0.3));
      const hit = world.castRay(new RAPIER.Ray(start, dir), cam.distanceTo(start), true);
      if (hit) continue;
      best = { nome: `perto-${tipo}`, p: [round(cam.x), round(cam.y), round(cam.z)], yaw: round(yawTo(at.x - cam.x, at.z - cam.z)), pitch: round(Math.atan2(at.y - cam.y, Math.hypot(at.x - cam.x, at.z - cam.z))) };
    }
    if (best) out.push(best);
    else console.error(`${slug}: sem um ponto livre para ${tipo}`);
  }
  return out;
}

async function writePoints(only: string[]) {
  const all: Record<string, Point[]> = existsSync(POINTS_FILE) ? await Bun.file(POINTS_FILE).json() : {};
  for (const slug of OFFICIAL) {
    if (only.length && !only.includes(slug)) continue;
    all[slug] = await pointsOf(slug);
    console.log(`${slug}: ${all[slug].length} pontos (${all[slug].map((p) => p.nome).join(', ')})`);
  }
  const lines = Object.entries(all).map(([k, v]) => `  ${JSON.stringify(k)}: [\n${v.map((p) => `    ${JSON.stringify(p)}`).join(',\n')}\n  ]`);
  await Bun.write(POINTS_FILE, `{\n${lines.join(',\n')}\n}\n`);
}

// --- The browser ------------------------------------------------------------------------------------------

/**
 * A Vite of its own for the prints: the project's config without hot reload nor file watching (an edit while the
 * prints run must not reload the page under them).
 */
async function startVite(port: number): Promise<() => void> {
  const config = join(ROOT, 'build', 'vite.prints.config.mjs');
  mkdirSync(dirname(config), { recursive: true });
  await Bun.write(config, `import base from '../vite.config.ts';
export default { ...base, server: { ...base.server, hmr: false, watch: null } };
`);
  const proc = Bun.spawn(['bun', join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--config', config, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return () => proc.kill();
    } catch {
      /* not up yet */
    }
    await Bun.sleep(500);
  }
  proc.kill();
  throw new Error(`o Vite não subiu na porta ${port}`);
}

async function launchChrome(path: string) {
  const { chromium } = await import('playwright-core');
  return chromium.launch({
    executablePath: path,
    headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
  });
}

async function shoot(o: { port: number; chrome: string; rotulo: string; detalhes: string[]; maps: string[]; saida: string; fps: number; qualidade: string }) {
  const stopVite = await startVite(o.port);
  const browser = await launchChrome(o.chrome);
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => console.error('[página]', e.message));
    for (const slug of o.maps) {
      for (const detalhe of o.detalhes) {
        const t0 = performance.now();
        await page.goto(`http://127.0.0.1:${o.port}/?bench=${slug}&detalhe=${detalhe}&qualidade=${o.qualidade}`);
        await page.waitForFunction(() => (globalThis as any).__ocBench?.pronto, null, { timeout: 180_000 });
        const info = await page.evaluate(() => {
          const b = (globalThis as any).__ocBench;
          return { pontos: b.pontos as Point[], gpu: b.gpu as string, buildMs: b.buildMs as number };
        });
        const dir = join(o.saida, slug);
        mkdirSync(dir, { recursive: true });
        const samples: unknown[] = [];
        for (let i = 0; i < info.pontos.length; i++) {
          const s = await page.evaluate((k) => (globalThis as any).__ocBench.ir(k), i);
          await page.screenshot({ path: join(dir, `${String(i).padStart(2, '0')}-${info.pontos[i].nome}_${o.rotulo}-${detalhe}.png`) });
          samples.push(o.fps ? await page.evaluate(([k, ms]) => (globalThis as any).__ocBench.medir(k, ms), [i, o.fps] as const) : s);
        }
        await Bun.write(join(dir, `bench_${o.rotulo}-${detalhe}.json`), JSON.stringify({ mapa: slug, detalhe, rotulo: o.rotulo, gpu: info.gpu, buildMs: info.buildMs, qualidade: o.qualidade, pontos: samples }, null, 2));
        console.log(`${slug} ${detalhe}: ${info.pontos.length} prints em ${((performance.now() - t0) / 1000).toFixed(1)} s (montagem ${info.buildMs} ms, ${info.gpu})`);
      }
    }
  } finally {
    await browser.close();
    stopVite();
  }
}

/** The before and after prints of each point side by side (and every point of a map in one sheet). */
async function sideBySide(o: { chrome: string; saida: string; maps: string[] }) {
  const COLS = ['antes-normal', 'depois-normal', 'depois-leve'];
  const browser = await launchChrome(o.chrome);
  try {
    const page = await browser.newPage();
    for (const slug of o.maps) {
      const dir = join(o.saida, slug);
      if (!existsSync(dir)) continue;
      const files = readdirSync(dir).filter((f) => f.endsWith('.png'));
      const points = [...new Set(files.map((f) => f.split('_')[0]))].sort();
      const out = join(dir, 'lado-a-lado');
      mkdirSync(out, { recursive: true });
      const rows: (string | null)[][] = [];
      for (const pt of points) {
        const row = COLS.map((c) => {
          const f = join(dir, `${pt}_${c}.png`);
          return existsSync(f) ? `data:image/png;base64,${readFileSync(f).toString('base64')}` : null;
        });
        rows.push(row);
        const png = await page.evaluate(compose, { rows: [row], cols: COLS, names: [pt], w: 640, h: 360 });
        await Bun.write(join(out, `${pt}.png`), Buffer.from(png.split(',')[1], 'base64'));
      }
      const sheet = await page.evaluate(compose, { rows, cols: COLS, names: points, w: 480, h: 270 });
      await Bun.write(join(out, `_${slug}-todos.png`), Buffer.from(sheet.split(',')[1], 'base64'));
      console.log(`${slug}: ${points.length} pontos lado a lado em ${out}`);
    }
  } finally {
    await browser.close();
  }
}

/** Runs in the page: draws the images in a grid with their labels; returns a PNG data URL. */
async function compose(a: { rows: (string | null)[][]; cols: string[]; names: string[]; w: number; h: number }): Promise<string> {
  const head = 28;
  const canvas = (globalThis as any).document.createElement('canvas');
  canvas.width = a.cols.length * a.w;
  canvas.height = a.rows.length * (a.h + head);
  const g = canvas.getContext('2d');
  g.fillStyle = '#16131f';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.font = 'bold 16px sans-serif';
  for (let r = 0; r < a.rows.length; r++) {
    for (let c = 0; c < a.cols.length; c++) {
      const x = c * a.w;
      const y = r * (a.h + head);
      g.fillStyle = '#ffd23f';
      g.fillText(`${a.names[r]} · ${a.cols[c]}`, x + 8, y + 20);
      const src = a.rows[r][c];
      if (!src) {
        g.fillStyle = '#888';
        g.fillText('(sem print)', x + a.w / 2 - 40, y + head + a.h / 2);
        continue;
      }
      const img = new (globalThis as any).Image();
      img.src = src;
      await img.decode();
      g.drawImage(img, x, y + head, a.w, a.h);
    }
  }
  return canvas.toDataURL('image/png');
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const opt = (name: string, fallback: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  const valued = new Set(['--rotulo', '--detalhe', '--saida', '--porta', '--chrome', '--fps', '--qualidade']);
  const maps = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));
  const chosen = maps.length ? OFFICIAL.filter((m) => maps.includes(m)) : [...OFFICIAL];
  const saida = opt('--saida', join(ROOT, 'build', 'prints'));
  const chrome = opt('--chrome', CHROME);
  if (args.includes('--pontos')) await writePoints(maps);
  else if (args.includes('--lado-a-lado')) await sideBySide({ chrome, saida, maps: chosen });
  else
    await shoot({
      port: Number(opt('--porta', '5291')),
      chrome,
      rotulo: opt('--rotulo', 'antes'),
      detalhes: opt('--detalhe', 'normal').split(','),
      maps: chosen,
      saida,
      fps: Number(opt('--fps', '0')),
      qualidade: opt('--qualidade', 'alta'),
    });
  process.exit(0);
}
