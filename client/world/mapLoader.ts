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
import { isOfficialMap, type OfficialMapId } from '@shared/maps';
import type { Atmosphere } from '../render/renderer';
import { skySpot } from '../audio/spatial';
import type { Physics } from './physics';
import { MapBuilder, type ObjectDetail } from './mapBuilder';
import { SCULPTED_PROPS, simplifierReady, simplifyGathered, simplifyObject } from './simplify';
import { PropBus } from './props';
import { seeded } from './oriental';
import { gltfLoader } from './gltfMap';
import { skyClouds } from './decor';
import { nightSky } from './halloween';
import { LanternLights, nightSky as gardenSky, SkyLanterns } from './jardim/luzes';
import { CATALOG } from './catalog';
import { Services, type ServiceHost } from './catalog/services';
import type { BuildCtx, MapOutputs } from './catalog/types';
import { pieceView, type PieceTrace } from './catalog/posed';
import { poseColliders, poseOpening, poseRoom, worldPoseMatrix, type FindPiece } from './pose';
import type { RoomVolume } from '../audio/spatial';
import type { WallOpening } from './mapBuilder';
import type { CritterHit, GameMap, MapFrame, MapSfx } from './gameMap';

export interface LoadOptions {
  physics: Physics;
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  sfx: MapSfx;
  modo: 'jogo' | 'editor';
  /**
   * The object detail (PF-35, MapBuilder's ObjectDetail): the player's setting in the game. Absent: 'normal' (the
   * map editor and the server never pass it; tools/orcamento.ts measures pieces with it).
   */
  detalhe?: ObjectDetail;
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

const OFFICIAL: Record<OfficialMapId, () => Promise<{ default: unknown }>> = {
  rua: () => import('@shared/data/mapas/rua.json'),
  jardim: () => import('@shared/data/mapas/jardim.json'),
  halloween: () => import('@shared/data/mapas/halloween.json'),
  cemiterio: () => import('@shared/data/mapas/cemiterio.json'),
};

/**
 * The official maps' names, cards and the mode each is made for, for the home's pickers before any map data is
 * loaded or the server answers (the same as their JSON says: client/tests/mapData.test.ts checks it). Online,
 * the server's current version of each replaces this (the staff edits the official maps).
 */
export const OFFICIAL_INFO: Record<OfficialMapId, { nome: string; cartao: { emoji: string; cor: string }; exclusivo?: 'zumbi' }> = {
  rua: { nome: 'Rua dos Vizinhos', cartao: { emoji: '🏡', cor: '#cfe8ff' } },
  jardim: { nome: 'Jardim do Dragão', cartao: { emoji: '🏮', cor: '#ffe2b8' } },
  halloween: { nome: 'Vila Assombrada', cartao: { emoji: '🎃', cor: '#e3dbff' } },
  cemiterio: { nome: 'Cemitério da Capela', cartao: { emoji: '⚰️', cor: '#c9f5b0' }, exclusivo: 'zumbi' },
};

/** One of the official maps, shipped with the client (training and bots work without the server). */
export async function loadOfficialMap(id: string): Promise<MapData> {
  const load = isOfficialMap(id) ? OFFICIAL[id] : undefined;
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
  /** Editor: takes a built piece away (its id), to build it again or delete it. */
  remove(id: string): void;
}

export function startBuild(data: MapData, o: LoadOptions): MapBuild {
  const { physics, scene, renderer, sfx, modo } = o;
  const b = new MapBuilder(physics, scene, data.ambiente.celula);
  b.detalhe = o.detalhe ?? 'normal';
  const animated: ((dt: number, frame: MapFrame) => void)[] = [];
  const clock = { now: 0 };
  animated.push((dt) => (clock.now += dt));
  const animate = (f: (dt: number, frame: MapFrame) => void) => animated.push(f);
  const props = new PropBus();
  const out: MapOutputs = { dog: null, pickups: [], potion: null, rats: [], fish: null, fruit: [], stabbable: [], rewards: null };
  const host: ServiceHost = { scene, b, props, sfx, out, lightCount: data.servicos?.luzes ?? 10, animate };
  const s = new Services(host);
  const ctx: BuildCtx = {
    modo,
    detalhe: b.detalhe,
    seg: (normal, leve) => b.seg(normal, leve),
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
    local: (v) => v,
    loadGltf: (file): Promise<GLTF> => {
      // Read when asked: the editor adds files to the map it is building.
      const url = data.arquivos.find((f) => f.id === file)?.url;
      if (!url) return Promise.reject(new Error(`arquivo "${file}" não está em arquivos`));
      return gltfLoader(renderer).loadAsync(url);
    },
  };

  const pieces = modo === 'editor' ? new Map<string, EditorPiece>() : undefined;
  // A group's children (Peca.pai) look their groups up: the game's data never changes, the editor's does.
  const index = pieces ? null : new Map(data.pecas.map((p) => [p.id, p]));
  const find: FindPiece = (id) => (index ? index.get(id) : data.pecas.find((p) => p.id === id));
  const traces = new Map<string, { trace: PieceTrace; rooms: RoomVolume[]; openings: WallOpening[] }>();
  /** Colliders seen so far: what a piece made is what's new after it. */
  const known = new Set<number>();
  const fresh = () => {
    const list: number[] = [];
    physics.world.forEachCollider((col) => {
      if (known.has(col.handle)) return;
      known.add(col.handle);
      list.push(col.handle);
    });
    return list;
  };
  const piece = async (peca: Peca) => {
    // A group builds nothing: in the game it's only its children's frame (the editor shows a stand-in for it).
    if (!pieces && peca.tipo === 'grupo') return;
    // The piece's pose, inside its groups' frame (Revisions 01): a piece without groups has just its own.
    const pose = worldPoseMatrix(peca, find);
    if (!pieces && !pose) return sculpted(peca, scene, () => runPiece(ctx, peca));
    // A posed piece (P32) builds in its own frame: its objects in a group the pose carries, its colliders,
    // rooms and holes carried after it (see pose.ts). In the editor, every piece builds in its own group, with
    // its own collections and batches, finished with it.
    if (!pieces) fresh();
    const group = pieces ? new THREE.Group() : null;
    if (group) {
      group.name = `peca:${peca.id}`;
      group.userData.peca = peca.id;
      scene.add(group);
      b.target = group;
    }
    let root: THREE.Object3D = group ?? scene;
    if (pose) {
      const posed = new THREE.Group();
      posed.name = `pose:${peca.id}`;
      posed.matrixAutoUpdate = false;
      posed.matrix.copy(pose);
      root.add(posed);
      root = posed;
    }
    const view = pieceView(ctx, root, pose);
    const mark = { rooms: b.rooms.length, openings: b.openings.length };
    b.pose = pose;
    try {
      await sculpted(peca, root, () => runPiece(view.ctx, peca));
      view.collections.finish(root);
      view.settle();
      if (pieces) b.finish();
    } finally {
      b.pose = null;
      b.target = scene;
    }
    const colliders = fresh();
    const rooms = b.rooms.slice(mark.rooms);
    const openings = b.openings.slice(mark.openings);
    if (pose) {
      poseColliders(physics, colliders, pose);
      for (const r of rooms) poseRoom(r, pose);
      for (const o of openings) poseOpening(o, pose);
    }
    if (pieces && group) {
      pieces.set(peca.id, { group, colliders });
      traces.set(peca.id, { trace: view.trace, rooms, openings });
    }
  };

  /**
   * Builds a piece; a sculpted prop with the light detail (PF-35 L5) comes out simplified: its static geometry as
   * one mesh per material (gathered while it builds), the objects it put under `root` one by one. Its colliders are
   * made from the full geometry by then.
   */
  const sculpted = async (peca: Peca, root: THREE.Object3D, build: () => Promise<void>) => {
    const error = SCULPTED_PROPS.get(peca.tipo);
    if (b.detalhe !== 'leve' || error === undefined) return build();
    await simplifierReady();
    const before = new Set(root.children);
    b.gather();
    try {
      await build();
    } finally {
      b.releaseGathered(simplifyGathered(error));
    }
    for (const o of root.children) if (!before.has(o)) simplifyObject(o, error);
  };

  /** Editor: takes a piece's group, colliders, updates, light spots, rooms and holes away (to rebuild or delete it). */
  const remove = (id: string) => {
    const p = pieces?.get(id);
    if (!p) return;
    p.group.removeFromParent();
    p.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    for (const h of p.colliders) {
      const col = physics.world.getCollider(h);
      if (col) physics.world.removeCollider(col, false);
      physics.surfaces.delete(h);
      known.delete(h);
    }
    const t = traces.get(id);
    if (t) {
      const gone = new Set<unknown>([...t.trace.updates, ...t.rooms, ...t.openings]);
      const keep = <T>(list: T[]) => {
        const left = list.filter((x) => !gone.has(x));
        list.length = 0;
        list.push(...left);
      };
      keep(animated);
      keep(b.rooms);
      keep(b.openings);
      if (t.trace.lights.length) s.lights.remove(...t.trace.lights);
      const lit = t.trace.lanterns;
      if (lit) s.lanternSources.splice(s.lanternSources.indexOf(lit), 1);
    }
    pieces!.delete(id);
    traces.delete(id);
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
      // Fewer in the light detail (PF-35 L3).
      const floating = new SkyLanterns(scene, b.seg(650, 250));
      // Every paper lantern's light, a posed piece's where its pose takes it (P42).
      const lights = new LanternLights(scene, () => s.lanternSpots(), s.all.cores);
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

  return { ctx, piece, finish, remove };
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
