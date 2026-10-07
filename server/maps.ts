// Maps on the server (PF-6): every map, official or the community's, is a row of `map` with its saved versions
// in `map_version` (server/migrations/004_mapas.sql). A version never changes once written, so what a session
// needs of it (MapRuntime: the data, its zumbi layout and navmesh) is cached for good by `map@version`.
//
// Saving goes through the map builder thread (server/mapWorker.ts): the map is built headless, its draw cost
// measured against MAP_BUDGET and, for a zumbi map, its navmesh baked. seedOfficialMaps writes version 1 of the
// official maps from shared/data/mapas/*.json the first time the server meets a database.
import { join } from 'node:path';
import { MAP_FORMAT, validateMapData, type MapData } from '@shared/mapData';
import { OFFICIAL_MAPS, type MapId } from '@shared/maps';
import { modeAllowsMap, type GameModeId } from '@shared/modes';
import { CONFIG } from './config';
import { transaction, type Db, type Queryable } from './db';
import type { MapJob, MapJobResult } from './mapWorker';

const ROOT = join(import.meta.dir, '..');
/** Resolves to <repo>/shared/data both from server/maps.ts (dev) and from build/server.js (production). */
const DATA = join(ROOT, 'shared', 'data');

/** What a session plays: one version of one map, as saved. */
export interface MapRuntime {
  id: MapId;
  versao: number;
  nome: string;
  /** The mode it was made for (zumbi), or null: an open map. */
  exclusivo: GameModeId | null;
  data: MapData;
  /** The baked navmesh (zumbi maps). */
  navmesh: Uint8Array | null;
}

/** A map's row: what decides whether it can be played and which version is played now. */
export interface MapRow {
  id: string;
  kind: 'official' | 'community';
  name: string;
  author_id: string | null;
  current_version: number;
  exclusive_mode: GameModeId | null;
  forked_from: string | null;
  hidden_at: Date | null;
  hidden_reason: string | null;
  deleted_at: Date | null;
  play_count: string;
  created_at: Date;
  updated_at: Date;
}

export async function mapRow(db: Queryable, id: string): Promise<MapRow | null> {
  if (typeof id !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(id)) return null;
  const { rows } = await db.query<MapRow>('SELECT * FROM map WHERE id = $1', [id]);
  return rows[0] ?? null;
}

/** Whether new sessions may open on it: neither hidden nor deleted. */
export const playable = (m: MapRow | null): m is MapRow => !!m && !m.hidden_at && !m.deleted_at;

/** Whether a mode can be played on the map (shared/modes.ts modeAllowsMap). */
export const allows = (m: MapRow, mode: GameModeId) => modeAllowsMap(mode, m.exclusive_mode);

/** The first official map a mode is played on (where a new session falls back to). */
export async function defaultMapFor(db: Queryable, mode: GameModeId): Promise<MapRow | null> {
  const { rows } = await db.query<MapRow>('SELECT * FROM map WHERE id = ANY($1) AND hidden_at IS NULL AND deleted_at IS NULL', [OFFICIAL_MAPS]);
  return OFFICIAL_MAPS.map((id) => rows.find((r) => r.id === id)).find((r): r is MapRow => !!r && allows(r, mode)) ?? null;
}

/** The versions sessions are playing, by "map@version": loaded once, never changed. */
export class MapStore {
  private cache = new Map<string, Promise<MapRuntime>>();

  constructor(private db: Db) {}

  runtime(id: string, versao: number): Promise<MapRuntime> {
    const key = `${id}@${versao}`;
    let p = this.cache.get(key);
    if (!p) {
      p = this.load(id, versao);
      this.cache.set(key, p);
      // A failed load (the database was down) is tried again next time.
      p.catch(() => this.cache.delete(key));
    }
    return p;
  }

  private async load(id: string, versao: number): Promise<MapRuntime> {
    const { rows } = await this.db.query<{ data: MapData; navmesh: Buffer | null }>('SELECT data, navmesh FROM map_version WHERE map_id = $1 AND version = $2', [id, versao]);
    const v = rows[0];
    if (!v) throw new Error(`mapa ${id} sem a versão ${versao}`);
    return runtimeOf(id, versao, v.data, v.navmesh ? new Uint8Array(v.navmesh) : null);
  }
}

export const runtimeOf = (id: string, versao: number, data: MapData, navmesh: Uint8Array | null): MapRuntime => ({
  id,
  versao,
  nome: data.nome,
  exclusivo: data.exclusivo ?? null,
  data,
  navmesh,
});

// --- Official maps ------------------------------------------------------------------------------------------

/** An official map's shipped data and baked navmesh (shared/data), as version 1. */
export async function officialRuntime(id: string): Promise<MapRuntime> {
  const data = (await Bun.file(join(DATA, 'mapas', `${id}.json`)).json()) as MapData;
  const baked = Bun.file(join(DATA, 'navmesh', `${id}.json`));
  const navmesh = (await baked.exists()) ? new Uint8Array(Buffer.from(((await baked.json()) as { dados: string }).dados, 'base64')) : null;
  return runtimeOf(id, 1, data, navmesh);
}

/**
 * Version 1 of every official map (shared/data/mapas/*.json; the *.golden.json files are the conversion's
 * snapshots, not maps) the database doesn't have yet, with the baked navmesh of the zumbi ones. Runs after
 * migrate(); a map already there (seeded before, or changed since through the editor) is left alone.
 */
export async function seedOfficialMaps(db: Db, builder: MapBuilderPool) {
  const files = (await Array.fromAsync(new Bun.Glob('*.json').scan(join(DATA, 'mapas')))).filter((f) => !f.endsWith('.golden.json')).sort();
  for (const file of files) {
    const id = file.replace(/\.json$/, '');
    if (await mapRow(db, id)) continue;
    const rt = await officialRuntime(id);
    const check = validateMapData(rt.data);
    if (!check.ok) throw new Error(`mapa oficial ${id} inválido: ${check.erros.slice(0, 3).join('; ')}`);
    if (rt.exclusivo === 'zumbi' && !rt.navmesh) throw new Error(`mapa oficial ${id} sem a malha de navegação (rode bun run navmesh)`);
    const built = await builder.build(rt.data, false);
    if (!built.ok) throw new Error(`mapa oficial ${id} não monta: ${built.erro}`);
    await transaction(db, async (c) => {
      const ins = await c.query(
        `INSERT INTO map (id, kind, name, current_version, exclusive_mode) VALUES ($1, 'official', $2, 1, $3) ON CONFLICT (id) DO NOTHING`,
        [id, rt.nome, rt.exclusivo],
      );
      // Another server seeded it meanwhile.
      if (!ins.rowCount) return;
      await c.query(
        `INSERT INTO map_version (map_id, version, data, format, draw_calls, triangles, colliders, navmesh) VALUES ($1, 1, $2, $3, $4, $5, $6, $7)`,
        [id, JSON.stringify(rt.data), MAP_FORMAT, built.drawCalls, built.triangulos, built.colliders, rt.navmesh ? Buffer.from(rt.navmesh) : null],
      );
    });
    console.log(`[mapas] mapa oficial ${id} criado (versão 1)`);
  }
}

// --- The map builder thread -------------------------------------------------------------------------------

/** How long one build may take before the thread is restarted. */
const BUILD_TIMEOUT_MS = 120_000;

/**
 * Talks to server/mapWorker.ts: one thread, started on the first build, jobs one after another. A job that
 * hangs past BUILD_TIMEOUT_MS takes the thread down with it; the next job starts a fresh one.
 */
export class MapBuilderPool {
  private worker: Worker | null = null;
  private nextId = 1;
  private queue: Promise<unknown> = Promise.resolve();

  build(data: MapData, navmesh: boolean): Promise<MapJobResult> {
    const run = this.queue.then(() => this.run(data, navmesh));
    this.queue = run.catch(() => {});
    return run;
  }

  private run(data: MapData, navmesh: boolean): Promise<MapJobResult> {
    if (!this.worker) {
      this.worker = new Worker(join(ROOT, 'server', 'mapWorker.ts'));
      // An idle builder doesn't keep the process up.
      this.worker.unref();
    }
    const worker = this.worker;
    const job: MapJob = { id: this.nextId++, data, navmesh, assetsDir: CONFIG.mapAssetsDir };
    return new Promise((resolve) => {
      const done = (r: MapJobResult) => {
        clearTimeout(timer);
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        resolve(r);
      };
      const restart = () => {
        worker.terminate();
        if (this.worker === worker) this.worker = null;
      };
      const onMessage = (ev: MessageEvent<MapJobResult>) => {
        if (ev.data?.id === job.id) done(ev.data);
      };
      const onError = (ev: ErrorEvent) => {
        restart();
        done({ id: job.id, ok: false, erro: `a montagem falhou: ${ev.message}` });
      };
      const timer = setTimeout(() => {
        restart();
        done({ id: job.id, ok: false, erro: 'a montagem demorou demais' });
      }, BUILD_TIMEOUT_MS);
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.postMessage(job);
    });
  }

  close() {
    this.worker?.terminate();
    this.worker = null;
  }
}

/** The process's map builder (every server of the process shares its thread). */
export const mapBuilder = new MapBuilderPool();
