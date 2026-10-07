// Fresh test database and Redis db before the run (bunfig.toml preloads this once, before any test file), and
// the uploaded map models in a temporary folder of their own (never the repository's dados/).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setDefaultTimeout } from 'bun:test';
import pg from 'pg';
import { Redis } from 'ioredis';
import { TEST_DATABASE_URL, TEST_REDIS_URL } from './env';

const url = new URL(TEST_DATABASE_URL);
const dbName = url.pathname.slice(1);
const admin = new URL(TEST_DATABASE_URL);
admin.pathname = '/postgres';
const c = new pg.Client({ connectionString: admin.toString() });
await c.connect();
await c.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
await c.query(`CREATE DATABASE ${dbName}`);
await c.end();
const r = new Redis(TEST_REDIS_URL);
await r.flushdb();
r.disconnect();
process.env.MAPAS_DIR = mkdtempSync(join(tmpdir(), 'oc-mapas-teste-'));

// Bun ignores bunfig's [test] timeout (checked on 1.4.2: a 6 s test failed at 5 s), so the server tests,
// which wait for real messages, respawn delays and round restarts, got the default 5 s and failed now and then
// on a busy machine. The same limit as bunfig's, set where Bun does apply it; tests with their own keep it.
setDefaultTimeout(20_000);
