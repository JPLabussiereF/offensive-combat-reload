// Builds a map from its data (shared/mapData.ts): every piece through its adapter (client/world/catalog), in
// order, then the shared systems (glow, lamp posts, pumpkins, lanterns...), the sky and the ambient sounds.
//
// 'jogo': what the game plays. Static geometry is merged across pieces into batches per material and cell
// (MapBuilder), the shared collections are finished once.
// 'editor': every piece in a group of its own (no batching across pieces), so the editor can select it and
// rebuild it alone; the piece's colliders are listed with it.
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { MapData, Peca } from '@shared/mapData';
import type { Atmosphere } from '../render/renderer';
import { skySpot } from '../audio/spatial';
import type { Physics } from './physics';
import { MapBuilder } from './mapBuilder';
import { PropBus } from './props';
import { seeded } from './oriental';
import { gltfLoader } from './gltfMap';
import { skyClouds } from './decor';
import { nightSky } from './halloween';
import { LanternLights, nightSky as gardenSky, SkyLanterns } from './jardim/luzes';
import { CATALOG } from './catalog';
import { Collections, Services, type ServiceHost } from './catalog/services';
import type { BuildCtx, MapOutputs } from './catalog/types';
import type { CritterHit, GameMap, MapFrame, MapSfx } from './gameMap';

export interface LoadOptions {
  physics: Physics;
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  sfx: MapSfx;
  modo: 'jogo' | 'editor';
}

/** A piece as the editor sees it: its group in the scene and the colliders it made. */
export interface EditorPiece {
  group: THREE.Group;
  colliders: number[];
}

export interface BuiltMap extends GameMap {
  /** Editor mode: every piece by id. */
  pieces?: Map<string, EditorPiece>;
}

const OFFICIAL: Record<string, () => Promise<{ default: unknown }>> = {
  cemiterio: () => import('@shared/data/mapas/cemiterio.json'),
};

/** One of the official maps, shipped with the client (training and bots work without the server). */
export async function loadOfficialMap(id: string): Promise<MapData> {
  const load = OFFICIAL[id];
  if (!load) throw new Error(`mapa oficial desconhecido "${id}"`);
  return (await load()).default as MapData;
}

/** The client's Atmosphere from the map data's sky. */
export function atmosphereOf(data: MapData): Atmosphere | undefined {
  const a = data.ambiente.ceu.atmosfera;
  if (!a) return undefined;
  return {
    background: a.fundo,
    fog: { color: a.neblina.cor, near: a.neblina.perto, far: a.neblina.longe },
    hemi: { sky: a.hemisferio.ceu, ground: a.hemisferio.chao, intensity: a.hemisferio.intensidade },
    sun: { color: a.sol.cor, intensity: a.sol.intensidade, from: a.sol.de },
    viewmodel: { sky: a.arma.ceu, ground: a.arma.chao, hemi: a.arma.hemisferio, sun: a.arma.sol, sunColor: a.arma.corSol },
  };
}

export async function buildMapFromData(data: MapData, o: LoadOptions): Promise<BuiltMap> {
  const build = startBuild(data, o);
  for (const peca of data.pecas) await build.piece(peca);
  return build.finish();
}

/** A map being built: its pieces go in one by one (`piece`), then `finish` closes it (tools/converter-mapas.ts drives it too). */
export interface MapBuild {
  readonly ctx: BuildCtx;
  piece(peca: Peca): Promise<void>;
  finish(): BuiltMap;
}

export function startBuild(data: MapData, o: LoadOptions): MapBuild {
  const { physics, scene, renderer, sfx, modo } = o;
  const b = new MapBuilder(physics, scene, data.ambiente.celula);
  const animated: ((dt: number, frame: MapFrame) => void)[] = [];
  const clock = { now: 0 };
  animated.push((dt) => (clock.now += dt));
  const animate = (f: (dt: number, frame: MapFrame) => void) => animated.push(f);
  const props = new PropBus();
  const out: MapOutputs = { dog: null, pickups: [], potion: null, rats: [], fish: null, fruit: [], stabbable: [], rewards: null };
  const host: ServiceHost = { scene, b, props, sfx, out, lightCount: data.servicos?.luzes ?? 10, animate };
  const s = new Services(host);
  const files = new Map(data.arquivos.map((f) => [f.id, f.url]));
  const ctx: BuildCtx = {
    modo,
    b,
    scene,
    physics,
    renderer,
    sfx,
    props,
    data,
    rand: seeded(0),
    animate,
    clock,
    s,
    out,
    rewards: () => (out.rewards ??= { ratDown: null, aimBonus: null }),
    loadGltf: (file): Promise<GLTF> => {
      const url = files.get(file);
      if (!url) return Promise.reject(new Error(`arquivo "${file}" não está em arquivos`));
      return gltfLoader(renderer).loadAsync(url);
    },
  };

  const pieces = modo === 'editor' ? new Map<string, EditorPiece>() : undefined;
  const known = new Set<number>();
  const piece = async (peca: Peca) => {
    if (!pieces) return runPiece(ctx, peca);
    // Editor: the piece's own group, collections and batches, finished with it.
    const group = new THREE.Group();
    group.name = `peca:${peca.id}`;
    group.userData.peca = peca.id;
    scene.add(group);
    ctx.scene = group as unknown as THREE.Scene;
    b.target = group;
    s.c = new Collections({ ...host, scene: group as unknown as THREE.Scene }, s);
    try {
      await runPiece(ctx, peca);
      s.c.finish(group);
      b.finish();
    } finally {
      ctx.scene = scene;
      b.target = scene;
      s.c = s.all;
    }
    const colliders: number[] = [];
    physics.world.forEachCollider((col) => {
      if (known.has(col.handle)) return;
      known.add(col.handle);
      colliders.push(col.handle);
    });
    pieces.set(peca.id, { group, colliders });
  };

  const finish = (): BuiltMap => {
    s.all.finish(scene);

    // The sky, then the ambient sounds.
    const cupula = data.ambiente.ceu.cupula;
    if (cupula?.tipo === 'nuvens') {
      const clouds = skyClouds(scene);
      animate((dt) => clouds(dt));
    } else if (cupula?.tipo === 'lua') nightSky(scene, new THREE.Vector3(...cupula.lua));
    else if (cupula?.tipo === 'oriental') {
      const sky = gardenSky(scene);
      const floating = new SkyLanterns(scene);
      const lanterns = s.all.lanterns;
      const lights = new LanternLights(scene, () => lanterns.at, s.all.cores);
      animate((dt, { listener }) => {
        sky(listener);
        floating.update(dt);
        lights.update(dt, listener);
      });
    }
    for (const som of data.ambiente.sons ?? []) {
      let timer = som.primeiro;
      const [min, max] = som.intervalo;
      const play = som.som === 'passaro' ? (x: MapSfx) => x.ambientBird() : som.som === 'corvo' ? (x: MapSfx) => x.ambientCrow() : (x: MapSfx) => x.ambientHowl();
      animate((dt, { listener }) => {
        timer -= dt;
        if (timer <= 0) {
          timer = min + Math.random() * (max - min);
          sfx.at(skySpot(listener), 'ambient', play);
        }
      });
    }

    if (modo === 'jogo') b.finish();

    const spawn = (p: { p: [number, number, number]; yaw: number }) => ({ position: new THREE.Vector3(...p.p), yaw: p.yaw });
    const map: BuiltMap = {
      spawnsA: data.spawns.a.map(spawn),
      spawnsB: data.spawns.b.map(spawn),
      spawnsFFA: data.spawns.ffa.map(spawn),
      dummies: data.bonecos.map((d) => ({ position: new THREE.Vector3(...d.p), yaw: d.yaw, ...(d.patrulha ? { patrol: { axis: d.patrulha.eixo, amplitude: d.patrulha.amplitude, speed: d.patrulha.velocidade } } : {}) })),
      killY: data.ambiente.killY,
      stats: b.stats,
      openings: b.openings,
      rooms: b.rooms,
      props,
      update(dt, frame) {
        for (const f of animated) f(dt, frame);
      },
      dog: out.dog,
      pickups: out.pickups,
      pieces,
    };
    if (data.ambiente.sombra !== undefined) map.shadowExtent = data.ambiente.sombra;
    const atmosphere = atmosphereOf(data);
    if (atmosphere) map.atmosphere = atmosphere;
    if (out.potion) map.potion = out.potion;
    if (out.rewards) map.rewards = out.rewards;
    if (out.fish) map.fish = out.fish;
    if (out.rats.length) {
      const rat = (id: string) => out.rats.find((r) => r.id === id);
      map.rats = { kill: (id, ready) => rat(id)?.kill(ready), set: (id, ready) => rat(id)?.set(ready) };
    }
    if (out.fish || out.fruit.length || out.stabbable.length) map.critters = critters(out);
    return map;
  };

  return { ctx, piece, finish };
}
/** Builds one piece with its own seeded randomness. */
export async function runPiece(ctx: BuildCtx, peca: Peca) {
  const adapter = CATALOG[peca.tipo];
  if (!adapter) throw new Error(`peça ${peca.id}: tipo desconhecido "${peca.tipo}"`);
  ctx.rand = seeded(peca.semente ?? 0);
  await adapter(ctx, peca);
}

/**
 * Shots and knife swings among the critters: the nearest of a fish and the fruit sets (fruit is cut at once);
 * a knife swing that hits none of them may hit what's stabbable (the rat, the cabinet, pumpkins).
 */
function critters(out: MapOutputs): NonNullable<GameMap['critters']> {
  type Hit = { d: number; point: THREE.Vector3 };
  const nearest = (f: (Hit & { id: string; golden: boolean }) | null, fruits: [(Hit & { k: number }) | null, MapOutputs['fruit'][number]][], dir: THREE.Vector3): CritterHit | null => {
    let best: [Hit & { k: number }, MapOutputs['fruit'][number]] | null = null;
    for (const [h, set] of fruits) if (h && (!best || h.d < best[0].d)) best = [h, set];
    if (best && (!f || best[0].d < f.d)) {
      best[1].hit(best[0].k, dir);
      return { point: best[0].point, fish: null };
    }
    return f ? { point: f.point, fish: { id: f.id, golden: f.golden } } : null;
  };
  return {
    shot: (o, dir, dist) => nearest(out.fish?.shot(o, dir, dist) ?? null, out.fruit.map((s) => [s.shot(o, dir, dist), s]), dir),
    stab(eye, fwd, reach) {
      const hit = nearest(out.fish?.stab(eye, fwd, reach) ?? null, out.fruit.map((s) => [s.stab(eye, fwd, reach), s]), fwd);
      if (hit) return hit;
      for (const f of out.stabbable) {
        const point = f(eye, fwd, reach);
        if (point) return { point, fish: null };
      }
      return null;
    },
  };
}
