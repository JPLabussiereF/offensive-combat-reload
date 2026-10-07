#!/usr/bin/env bun
// Bakes the album's sticker art (Game-Vault: Achievements): the sticker studio (tools/estudio-figurinhas.html,
// client/dev/studio) builds each sticker's scene with the game's own models; this tool serves it with Vite,
// drives it headless in Edge (or the Chrome in CHROME_PATH) on SwiftShader, and writes the die-cut pictures,
// public/figurinhas/<id>.png (400 x 300) and <id>-mini.png (128 x 128), plus one manifest per studio domain,
// shared/data/figurinhas/<domain>.json, which the album reads (client/ui/stickerArt.ts).
//
// SwiftShader (a CPU renderer), seeded randomness, a fixed time step and a fresh page per sticker give the same
// pixels on every run (for a given Edge version), whatever else is baked with it; a picture is rewritten only
// when its pixels change, so an unchanged sticker never churns git. The bake is a manual step, like
// bun run navmesh: run it after changing a model the art shows.
//
//   bun run figurinhas                       every domain that has a file (client/dev/studio/<domain>.ts)
//   bun run figurinhas caca-chefes divorcio  these stickers
//   bun run figurinhas --dominio zumbi       one domain (or a comma list); also drops the PNGs it no longer draws
//   --todos                                  every domain, explicitly (to combine with --revisao or --folha)
//   --revisao <out.png> [--dpr 2]            then a full-page screenshot of the review page (from the PNGs)
//   --folha <out.png>                        then a screenshot of the whole album's contact sheet
//   --sem-bake                               only the screenshots (also the default when --revisao or --folha
//                                            come without ids, --dominio or --todos)
//   --smoke <dir>                            the core's smoke subjects into <dir> (never public/ or the manifests)
//
// Each sticker is baked in a page of its own (after a first page that loads the domains and lists what to bake)
// and written only when its page had no error; fonts that didn't load or a renderer that isn't SwiftShader stop
// the run with nothing written. A domain asked for by name (or owning an asked id) without its file fails with a
// message; a full bake skips the domains that have no file yet.
//
// Several bakes can run at once (from different agents, while others edit game files): each has its own Vite
// server, port, cache folder and browser profile, and never reloads a page (no HMR). Its file watcher sees
// public/ only (watchIgnored: Vite's list of public files follows the watcher, and the screenshots need the PNGs
// the run just wrote), never the sources: the server keeps every module as it first compiled it, so an edit made
// meanwhile never reaches the run's later pages. A page whose modules don't load (someone halfway through an
// edit: a syntax error, a missing export) still finishes (the bootstrap in estudio-figurinhas.html) and is opened
// again up to 3 times, 5 s apart, with every module read from disk again; then its error is reported with its
// sticker, with Vite's own message. The server has no dependency optimizer (three.js and Rapier are served as
// the plain modules they are), so a half-edited studio file can never make it load a second copy of three.js;
// and each domain's PNGs and manifest are written under a lock, one bake at a time. vite and playwright-core are
// imported only when run, so the server's typecheck and the tests (client/tests/stickerArt.test.ts) can import
// the helpers below.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import conquistas from '@shared/data/conquistas.json';
import dominios from '@shared/data/figurinhas/dominios.json';

export const REPO = join(import.meta.dir, '..');
export const FIGURINHAS_DIR = join(REPO, 'public', 'figurinhas');
export const MANIFESTS_DIR = join(REPO, 'shared', 'data', 'figurinhas');
export const DOMAINS = ['personagens', 'armas', 'rua', 'jardim', 'vila', 'zumbi'] as const;
export type Domain = (typeof DOMAINS)[number];
/** Size limits per picture (KB), checked by the test: about 3-6 MB for the whole album. */
export const LIMITS = { card: 150, mini: 30 };
export const SIZES = { card: [400, 300], mini: [128, 128] } as const;

/** A manifest entry (client/ui/stickerArt.ts ArtEntry). */
export interface ArtEntry {
  v: string;
  vm: string;
  px: string;
  pxm: string;
  kb: [number, number];
}

export const MANIFEST_DOC =
  'Gerado por tools/bake-figurinhas.ts (bun run figurinhas); não edite. Por figurinha deste domínio: v e vm, o hash dos bytes de public/figurinhas/<id>.png (400 x 300) e <id>-mini.png (128 x 128), que vão na URL (?v=); px e pxm, o hash dos pixels (o bake só regrava a imagem quando eles mudam); kb, os tamanhos em KB (card, mini).';

export const STICKER_IDS = new Set(conquistas.figurinhas.map((f) => f.id));
/** Each domain's stickers (shared/data/figurinhas/dominios.json). */
export const DOMAIN_IDS = Object.fromEntries(DOMAINS.map((d) => [d, (dominios as unknown as Record<Domain, string[]>)[d] ?? []])) as Record<Domain, string[]>;
export const domainOf = (id: string): Domain | undefined => DOMAINS.find((d) => DOMAIN_IDS[d].includes(id));

/** 8 hex digits of Bun.hash (wyhash) of a file's bytes: the version in the picture's URL. */
export const hash8 = (bytes: Uint8Array) => Bun.hash(bytes).toString(16).padStart(16, '0').slice(0, 8);

export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A PNG's size from its IHDR (bytes 16-23, big-endian), or null when it isn't a PNG. */
export function pngSize(bytes: Uint8Array): { w: number; h: number } | null {
  if (bytes.length < 24 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
}

export const manifestPath = (d: Domain) => join(MANIFESTS_DIR, `${d}.json`);
export const picturePath = (id: string, kind: 'card' | 'mini') => join(FIGURINHAS_DIR, kind === 'card' ? `${id}.png` : `${id}-mini.png`);

/** A domain's manifest (its _doc dropped). */
export function readManifest(d: Domain): Record<string, ArtEntry> {
  const raw = JSON.parse(readFileSync(manifestPath(d), 'utf8')) as Record<string, unknown>;
  delete raw._doc;
  return raw as Record<string, ArtEntry>;
}

/** A manifest's text: the _doc line first, then one line per sticker, ids sorted. */
export function manifestText(entries: Record<string, ArtEntry>): string {
  const lines = [`  "_doc": ${JSON.stringify(MANIFEST_DOC)}`];
  for (const id of Object.keys(entries).sort()) {
    const e = entries[id];
    lines.push(`  ${JSON.stringify(id)}: ${JSON.stringify({ v: e.v, vm: e.vm, px: e.px, pxm: e.pxm, kb: e.kb })}`);
  }
  return `{\n${lines.join(',\n')}\n}\n`;
}

const kb = (n: number) => Math.round((n / 1024) * 10) / 10;

/** The files in public/figurinhas (none before the first bake). */
export const listPictures = () => (existsSync(FIGURINHAS_DIR) ? readdirSync(FIGURINHAS_DIR) : []);

/**
 * What the bake's file watcher ignores: everything but the repo folder itself and public/ (chokidar asks about
 * every path it meets, from the watched roots down). An ignore function rather than `watch: null`, which Vite's
 * config merge drops (a null override is skipped), leaving a watcher on the whole repo.
 */
export function watchIgnored(path: string): boolean {
  const rel = relative(REPO, path);
  return !(rel === '' || rel === 'public' || rel.startsWith(`public${sep}`));
}

/** The tallest picture one screenshot can take (device px): past ~16,000 Chromium repeats the page's top. */
export const SHOT_LIMIT = 14_000;

/**
 * Where to cut a page taller than one screenshot (CSS px, [top, bottom) per part): at section tops, so a
 * sticker's section is never split, and only through a section taller than a whole part.
 */
export function splitPage(height: number, tops: number[], max: number): [number, number][] {
  const parts: [number, number][] = [];
  let start = 0;
  let last = 0;
  for (const p of [...new Set([...tops.filter((t) => t > 0 && t < height), height])].sort((a, b) => a - b)) {
    while (p - start > max) {
      const end = last > start ? last : start + max;
      parts.push([start, end]);
      start = end;
    }
    last = p;
  }
  if (height > start) parts.push([start, height]);
  return parts;
}

/**
 * The screenshots a page needs: `out` alone when it fits, else `out`, `<out>-2.png`, `<out>-3.png`… (cut between
 * the review's sections), with the stale parts of an earlier, longer capture removed.
 */
async function screenshotParts(page: { evaluate(expr: string): Promise<unknown> }, out: string, dpr: number) {
  const { height, width, tops } = JSON.parse(
    String(await page.evaluate("JSON.stringify({ height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth, tops: [...document.querySelectorAll('.est-fig, main > h2')].map((e) => Math.floor(e.getBoundingClientRect().top + scrollY)) })")),
  ) as { height: number; width: number; tops: number[] };
  const ranges = splitPage(height, tops, Math.floor(SHOT_LIMIT / dpr));
  const pathOf = (i: number) => (i === 0 ? out : out.replace(/(\.png)?$/i, `-${i + 1}.png`));
  for (let i = ranges.length; existsSync(pathOf(i)) && i > 0; i++) unlinkSync(pathOf(i));
  return ranges.map(([top, bottom], i) => [ranges.length > 1 ? `${i + 1}/${ranges.length}` : '', { x: 0, y: top, width, height: bottom - top }, pathOf(i)] as const);
}

// --- The run -------------------------------------------------------------------------------------------------------

/** The bake's working files (gitignored): one Vite cache folder per run, and the domains' write locks. */
const STATE_DIR = join(REPO, 'node_modules', '.vite-figurinhas');

interface Args {
  ids: string[];
  domains: string[] | null;
  todos: boolean;
  revisao: string | null;
  folha: string | null;
  dpr: number;
  semBake: boolean;
  smoke: string | null;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { ids: [], domains: null, todos: false, revisao: null, folha: null, dpr: 1, semBake: false, smoke: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new Error(`${arg} precisa de um valor`);
      return v;
    };
    if (arg === '--dominio') a.domains = [...(a.domains ?? []), ...value().split(',').filter(Boolean)];
    else if (arg === '--todos') a.todos = true;
    else if (arg === '--revisao') a.revisao = resolve(value());
    else if (arg === '--folha') a.folha = resolve(value());
    else if (arg === '--dpr') a.dpr = Number(value());
    else if (arg === '--sem-bake') a.semBake = true;
    else if (arg === '--smoke') a.smoke = resolve(value());
    else if (arg.startsWith('--')) throw new Error(`opção desconhecida: ${arg}`);
    else a.ids.push(...arg.split(',').filter(Boolean));
  }
  if (!(a.dpr >= 1 && a.dpr <= 4)) throw new Error('--dpr vai de 1 a 4');
  if (a.smoke && (a.ids.length || a.domains || a.todos || a.revisao || a.folha || a.semBake)) throw new Error('--smoke não se combina com ids, --dominio, --todos, --revisao, --folha nem --sem-bake');
  if (a.todos && (a.ids.length || a.domains)) throw new Error('--todos já é tudo: tire os ids e o --dominio');
  return a;
}

/** A picture the page handed over. */
interface Shot {
  bytes: Uint8Array;
  pixels: string;
  meta: { fill: number; avisos: string[]; textos: string[]; ms: number };
}
interface Result {
  domain: string;
  card?: Shot;
  mini?: Shot;
}

/** Whether a process is alive (a lock or a cache folder left by a bake that crashed is stale). */
function alive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** This run's own Vite cache folder (removed at the end); the folders of bakes that died are cleared first. */
function runCache(): string {
  mkdirSync(STATE_DIR, { recursive: true });
  for (const name of readdirSync(STATE_DIR)) {
    const m = /^run-(\d+)$/.exec(name);
    if (m && !alive(Number(m[1]))) rmSync(join(STATE_DIR, name), { recursive: true, force: true });
  }
  return join(STATE_DIR, `run-${process.pid}`);
}

/**
 * Takes a domain's write lock (node_modules/.vite-figurinhas/gravando-<domain>.lock), waiting while another live
 * bake holds it: concurrent bakes write a domain's PNGs and manifest one at a time (each read-compare-write is
 * a few milliseconds). The lock of a bake that died is taken over. Returns the release.
 */
async function lockDomain(d: Domain): Promise<() => void> {
  const file = join(STATE_DIR, `gravando-${d}.lock`);
  /** The lock's holder: its pid; 0 while the file is being written (or if a crash left it empty); null: no lock. */
  const holder = () => {
    try {
      return Number(readFileSync(file, 'utf8')) || 0;
    } catch {
      return null;
    }
  };
  const t0 = Date.now();
  for (;;) {
    try {
      writeFileSync(file, String(process.pid), { flag: 'wx' });
      return () => rmSync(file, { force: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
    const pid = holder();
    if (pid === null) continue;
    let stale = pid > 0 && !alive(pid);
    if (pid === 0)
      try {
        stale = Date.now() - statSync(file).mtimeMs > 5000;
      } catch {
        continue;
      }
    if (stale) {
      // Read again right before removing it: never remove a lock another bake has just taken over.
      if (holder() === pid) rmSync(file, { force: true });
      continue;
    }
    if (Date.now() - t0 > 120_000) throw new Error(`o domínio ${d} está sendo gravado por outro bake (pid ${pid}) há mais de 2 min; se esse processo não existe mais, apague ${file}`);
    await Bun.sleep(150);
  }
}

if (import.meta.main) {
  const t0 = performance.now();
  const errors: string[] = [];
  const fail = (msg: string) => {
    if (errors.includes(msg)) return;
    errors.push(msg);
    console.error(`ERRO: ${msg}`);
  };
  /** Problems that make every picture of the run wrong: nothing is written. */
  const fatal: string[] = [];
  const stop = (msg: string) => {
    if (!fatal.includes(msg)) fatal.push(msg);
    fail(msg);
  };
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`ERRO: ${(err as Error).message}`);
    process.exit(1);
  }

  // What to bake, checked before starting anything.
  const studioFile = (d: string) => join(REPO, 'client', 'dev', 'studio', `${d}.ts`);
  for (const d of args.domains ?? []) if (!(DOMAINS as readonly string[]).includes(d)) fail(`domínio desconhecido: ${d} (${DOMAINS.join(', ')})`);
  for (const id of args.ids) if (!STICKER_IDS.has(id)) fail(`${id}: não existe em shared/data/conquistas.json`);
  const asked = (args.domains ?? []).filter((d): d is Domain => (DOMAINS as readonly string[]).includes(d));
  const owners = [...new Set(args.ids.map(domainOf).filter((d): d is Domain => !!d))];
  const named = [...new Set([...asked, ...owners])];
  for (const d of named) if (!existsSync(studioFile(d))) fail(`o domínio ${d} ainda não tem arquivo: crie client/dev/studio/${d}.ts (export default defineDomain('${d}', [...]))`);
  const present = DOMAINS.filter((d) => existsSync(studioFile(d)));
  if (errors.length) process.exit(1);
  const smoke = args.smoke;
  const screenshots = !!(args.revisao || args.folha);
  // A bake of everything is either the plain command or --todos: --revisao and --folha alone only take screenshots
  // (during parallel work, asking for the contact sheet must never rebake the other agents' domains).
  const filtered = named.length > 0;
  const wantsBake = !args.semBake && (smoke !== null || filtered || args.todos || !screenshots);
  if (!args.semBake && !wantsBake) console.log('Só as capturas (sem ids, --dominio nem --todos, --revisao e --folha não fazem bake).');
  const baking = wantsBake && (smoke !== null || filtered || present.length > 0);
  if (wantsBake && !baking) console.log('Nenhum domínio tem arquivo ainda (client/dev/studio/<domínio>.ts): nada a gravar.');
  if (args.semBake && !screenshots) console.log('Nada a fazer: --sem-bake sem --revisao nem --folha.');
  if (!baking && !screenshots) process.exit(0);

  const filter = new URLSearchParams();
  if (smoke) filter.set('smoke', '1');
  else {
    if (asked.length) filter.set('dominio', asked.join(','));
    if (args.ids.length) filter.set('ids', args.ids.join(','));
  }

  const cacheDir = runCache();
  const { createServer, createLogger } = await import('vite');
  const { chromium } = await import('playwright-core');
  // The optimizer is off (below). Should Vite ever scan or pre-bundle anyway, a page could hold two copies of
  // three.js (a Vector3 of one is not an instanceof the other's): the run stops with nothing written.
  const OPTIMIZER = /dependency scan|optimized dependenc|new dependencies|pre-bundl|Multiple instances of Three/i;
  /** Vite's errors about a module (it doesn't compile, an import doesn't resolve), for the page that asked for it. */
  const viteErrors: { t: number; text: string }[] = [];
  const ANSI = /\x1b\[[0-9;]*m/g;
  /** One line, without the colors: the file, the message, and where (Vite's frame names it). */
  const describe = (err: { message: string; id?: string }) => {
    const message = err.message.replace(ANSI, '');
    const lines = message
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const headline = lines.find((l) => !/^Transform failed with \d+ errors?:?$/i.test(l)) ?? lines[0] ?? '(sem mensagem)';
    const where = /([\w@~.-]+(?:[\\/][\w@~.-]+)+\.\w+:\d+:\d+)/.exec(message)?.[1];
    const file = err.id ? relative(REPO, err.id.split('?')[0]).replace(/\\/g, '/') : (where?.replace(/:\d+:\d+$/, '') ?? 'um módulo');
    return `Vite: ${file}: ${headline}${where ? ` (${where})` : ''}`;
  };
  const logger = createLogger('warn', { allowClearScreen: false });
  for (const level of ['info', 'warn', 'warnOnce'] as const) {
    const print = logger[level].bind(logger);
    logger[level] = (msg, options) => {
      if (OPTIMIZER.test(msg)) stop(`Vite: ${msg.split('\n')[0]}`);
      print(msg, options);
    };
  }
  const printError = logger.error.bind(logger);
  logger.error = (msg, options) => {
    if (OPTIMIZER.test(msg)) stop(`Vite: ${msg.split('\n')[0]}`);
    // A module's error is reported with the page (the sticker) that asked for it, in one plain line, rather
    // than as a colored block between the sticker lines.
    if (options?.error) viteErrors.push({ t: Date.now(), text: describe(options.error) });
    else printError(msg, options);
  };
  const server = await createServer({
    root: REPO,
    configFile: join(REPO, 'vite.config.ts'),
    cacheDir,
    customLogger: logger,
    clearScreen: false,
    // Its own port from 5199 on (concurrent bakes take the next free one), local only (vite.config.ts says
    // host: true), no HMR (nothing ever reloads a page mid-bake) and a watcher on public/ only (watchIgnored,
    // checked below): the sources are compiled once per run. The pages' console stays out of Vite's log: the
    // tool reports it, with the sticker it came from.
    server: { host: '127.0.0.1', port: 5199, strictPort: false, hmr: false, watch: { ignored: [watchIgnored] }, forwardConsole: false },
    // No dependency optimizer: three, its addons and Rapier are already ES modules and load as they are. The
    // optimizer's scanner reads every file the studio's glob reaches, and one that doesn't parse (another
    // agent's domain file mid-edit) makes it skip pre-bundling and find the dependencies at runtime instead,
    // which serves three.js twice, as two different modules.
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  await server.listen();
  const quit = async (msg: string): Promise<never> => {
    await server.close().catch(() => {});
    rmSync(cacheDir, { recursive: true, force: true });
    console.error(`ERRO: ${msg}`);
    process.exit(1);
  };
  const base = server.resolvedUrls?.local[0]?.replace(/\/$/, '');
  if (!base) await quit('o Vite não informou a URL do servidor');
  // The watcher, checked rather than assumed: our ignore function reached chokidar, and once its first scan is
  // done nothing outside public/ is watched (the repo folder itself and the folders above it are, for their
  // own entries, which the function filters).
  const ignored = server.watcher.options.ignored;
  if (!(Array.isArray(ignored) ? ignored : [ignored]).includes(watchIgnored)) await quit('o observador de arquivos do Vite não recebeu watchIgnored: ele veria as edições dos outros no meio do bake');
  await new Promise<void>((done) => {
    const watcher = server.watcher as typeof server.watcher & { _readyEmitted?: boolean };
    if (watcher._readyEmitted) return done();
    watcher.once('ready', () => done());
    setTimeout(done, 10_000);
  });
  const watched = Object.keys(server.watcher.getWatched()).filter((dir) => {
    const up = relative(dir, REPO);
    const repoOrAbove = !up.startsWith('..') && !isAbsolute(up);
    return !repoOrAbove && watchIgnored(dir);
  });
  if (watched.length) await quit(`o observador de arquivos do Vite vê ${watched.slice(0, 3).join(', ')}${watched.length > 3 ? '…' : ''}: só public/ deveria estar lá`);
  const executablePath = process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  if (!existsSync(executablePath)) await quit(`navegador não encontrado em ${executablePath} (defina CHROME_PATH)`);
  // A fresh temporary profile per launch (Playwright's default), SwiftShader as the GPU.
  const browser = await chromium
    .launch({ executablePath, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
    .catch((err: Error) => quit(`o navegador não abriu: ${err.message}`));
  const cleanup = async () => {
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
    rmSync(cacheDir, { recursive: true, force: true });
  };
  process.on('SIGINT', () => void cleanup().then(() => process.exit(130)));
  console.log(`Estúdio em ${base} (Vite sem otimizador de dependências), ${executablePath.replace(/^.*[\\/]/, '')}`);

  type Context = Awaited<ReturnType<typeof browser.newContext>>;
  type Page = Awaited<ReturnType<Context['newPage']>>;
  interface PageState {
    erros: string[];
    carga: string[];
    avisos: string[];
    fatal: string[];
    renderer: string;
    resumo: { entradas?: { dominio: string; id: string }[]; dominiosCompletos?: string[]; notas?: string[] };
  }
  interface Visit {
    page: Page;
    /** Console errors, page errors, crashes and the page's own __erros. */
    errors: string[];
    fatal: string[];
    /** What didn't load: modules the server failed (5xx), the page's own __carga (the studio, a domain file). */
    unloaded: string[];
    /** Still not loaded after the retries (its screenshot is worth nothing). */
    failedToLoad: boolean;
    state: PageState | null;
  }
  /** The last sign of life from a page (a log line, a picture): the stall watchdog reads it. */
  let activity = Date.now();
  /** A page whose modules didn't load is opened again this many times, this far apart. */
  const RETRIES = 3;
  const RETRY_WAIT = 5000;

  /**
   * Opens a studio page in `context`, collects its errors and waits for window.__done (tolerating one reload).
   * A page whose modules didn't load (the usual cause: someone halfway through editing a file the page imports)
   * is opened again RETRIES times, RETRY_WAIT apart, with every module read from disk again; after that, what
   * didn't load joins its errors, with Vite's message. `onPage` runs on every new page (expose functions there,
   * and start its results afresh). The caller closes the page; `label` names it in the log.
   */
  async function visit(context: Context, query: string, label: string, onPage?: (p: Page) => Promise<unknown>): Promise<Visit> {
    for (let attempt = 0; ; attempt++) {
      const t = Date.now();
      const v = await visitOnce(context, query, onPage);
      const vite = [...new Set(viteErrors.filter((e) => e.t >= t).map((e) => e.text))];
      if (!v.unloaded.length) {
        // A module error that didn't stop the page (nothing asked for that module after all): still worth a line.
        for (const e of vite) console.log(`  (${label}: ${e})`);
        return v;
      }
      const why = [...new Set([...vite, ...v.unloaded])];
      if (attempt === RETRIES) {
        v.errors.push(`os módulos não carregaram, nem em ${RETRIES} novas tentativas a cada ${RETRY_WAIT / 1000} s: ${why.join('; ')}`);
        v.failedToLoad = true;
        return v;
      }
      await v.page.close().catch(() => {});
      console.log(`  (${label}: ${why[0]}; nova tentativa em ${RETRY_WAIT / 1000} s, ${attempt + 1}/${RETRIES})`);
      await Bun.sleep(RETRY_WAIT);
      // Every module from disk again: one compiled before may no longer fit one edited since (a missing export).
      server.environments.client.moduleGraph.invalidateAll();
    }
  }

  async function visitOnce(context: Context, query: string, onPage?: (p: Page) => Promise<unknown>): Promise<Visit> {
    const page = await context.newPage();
    const v: Visit = { page, errors: [], fatal: [], unloaded: [], failedToLoad: false, state: null };
    activity = Date.now();
    page.on('console', (m) => {
      activity = Date.now();
      // A module the server failed is reported from its response (below), with its path.
      if (m.type() === 'error' && !/the server responded with a status of 5\d\d/.test(m.text())) v.errors.push(`console da página: ${m.text()}`);
      // three.js warns when a page loads it twice: every picture of the run may be wrong.
      if (/Multiple instances of Three\.js/i.test(m.text())) v.fatal.push(`a página carregou duas cópias do three.js: ${m.text()}`);
    });
    page.on('response', (r) => {
      if (r.status() >= 500 && r.url().startsWith(`${base}/`)) v.unloaded.push(`${new URL(r.url()).pathname} respondeu ${r.status()}`);
    });
    page.on('pageerror', (e) => v.errors.push(`erro na página: ${e.message}`));
    page.on('crash', () => v.errors.push('a página travou (crash)'));
    let loads = 0;
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) loads++;
    });
    try {
      if (onPage) await onPage(page);
      const res = await page.goto(`${base}/tools/estudio-figurinhas.html?${query}`, { timeout: 180_000 });
      if (res && res.status() >= 400) {
        if (res.status() < 500) v.errors.push(`a página respondeu ${res.status()}`);
        return v;
      }
      // No progress for this long (a subject, a reload) means it's stuck.
      const STALL = 240_000;
      for (let attempt = 0; ; attempt++) {
        let timer: ReturnType<typeof setInterval> | undefined;
        try {
          const stalled = new Promise<never>((_, reject) => {
            timer = setInterval(() => {
              if (Date.now() - activity > STALL) reject(new Error(`a página parou de responder por ${STALL / 1000} s`));
            }, 2000);
          });
          await Promise.race([page.waitForFunction('window.__done === true', undefined, { timeout: 0, polling: 250 }), stalled]);
          break;
        } catch (err) {
          // Nothing should reload a page any more (no optimizer, no HMR); one reload is still waited out.
          if (attempt === 0 && /context was destroyed|navigat/i.test((err as Error).message)) {
            console.log('  (a página recarregou; esperando de novo)');
            await page.waitForLoadState('load');
            continue;
          }
          throw err;
        } finally {
          clearInterval(timer);
        }
      }
      v.state = JSON.parse(String(await page.evaluate('JSON.stringify({ erros: window.__erros, carga: window.__carga, avisos: window.__avisos, fatal: window.__fatal, renderer: window.__renderer, resumo: window.__resumo })'))) as PageState;
      // What didn't load is reported once, by visit(), after the retries.
      const carga = v.state.carga ?? [];
      v.unloaded.push(...carga);
      v.errors.push(...(v.state.erros ?? []).filter((e) => !carga.includes(e)));
      v.fatal.push(...(v.state.fatal ?? []));
      if (loads > 1) console.log(`  (a página ${query} carregou ${loads} vezes)`);
    } catch (err) {
      v.errors.push(err instanceof Error ? err.message : String(err));
    }
    return v;
  }

  /** The bake of a list of subjects, each in a fresh page of `context`: what each page handed over, or its errors. */
  async function bakeEach(context: Context, entries: { dominio: string; id: string }[], query: (id: string) => string) {
    const out = new Map<string, Result & { errors: string[] }>();
    for (const [i, { dominio, id }] of entries.entries()) {
      const r: Result & { errors: string[] } = { domain: dominio, errors: [] };
      const t = performance.now();
      const v = await visit(context, query(id), id, (page) => {
        // A page opened again (its modules didn't load) starts over.
        r.errors = [];
        delete r.card;
        delete r.mini;
        return page.exposeFunction('salvarFigurinha', (domain: string, got: string, kind: 'card' | 'mini', base64: string, pixels: string, meta: string) => {
          activity = Date.now();
          if (got !== id || domain !== dominio) r.errors.push(`a página de ${id} entregou ${domain}/${got}`);
          else r[kind] = { bytes: new Uint8Array(Buffer.from(base64, 'base64')), pixels, meta: JSON.parse(meta) };
        });
      });
      await v.page.close().catch(() => {});
      for (const f of v.fatal) stop(f);
      r.errors.push(...v.errors.filter((e) => !v.fatal.includes(e)));
      if (!r.errors.length && (!r.card || !r.mini)) r.errors.push(`faltou ${r.card ? 'o mini' : 'o card'}`);
      for (const e of r.errors) fail(e.startsWith(`${id}:`) ? e : `${id}: ${e}`);
      out.set(id, r);
      console.log(`  [${i + 1}/${entries.length}] ${id} ${((performance.now() - t) / 1000).toFixed(1)} s${r.errors.length ? ' (erro: não gravada)' : ''}`);
      if (fatal.length) break;
    }
    return out;
  }

  /** The sticker's report lines: sizes, how much it fills, its texts and warnings. */
  const report = (id: string, sizes: [number, number], r: Result, what: string) => {
    const lines = [`  ${id.padEnd(26)} card ${String(sizes[0]).padStart(5)} KB  mini ${String(sizes[1]).padStart(5)} KB  ocupa ${r.card!.meta.fill.toFixed(2)}/${r.mini!.meta.fill.toFixed(2)}  pixels ${what}`];
    for (const t of r.card!.meta.textos) lines.push(`      texto ${t}`);
    for (const a of [...r.card!.meta.avisos, ...r.mini!.meta.avisos]) lines.push(`      aviso: ${a}`);
    return lines;
  };

  try {
    if (baking) {
      console.log(smoke ? `Smoke → ${smoke}` : `Bake: ${named.length ? named.join(', ') : present.join(', ')}${args.ids.length ? ` (${args.ids.join(', ')})` : ''}`);
      // One browser context for the run (its HTTP cache spares the reloads); a fresh page, so a fresh JavaScript
      // world, three.js caches and WebGL context, for every sticker.
      const context = await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1, locale: 'pt-BR' });
      const plan = await visit(context, `bake=1&plano=1&${filter}`, 'lista');
      await plan.page.close().catch(() => {});
      for (const e of plan.errors) fail(e);
      for (const f of plan.fatal) stop(f);
      // The studio itself never ran (its error is above): nothing to bake, and every other page would fail alike.
      if (!plan.state?.resumo) fatal.push('a página da lista não carregou');
      const entries = plan.state?.resumo?.entradas ?? [];
      for (const n of plan.state?.resumo?.notas ?? []) console.log(`  · ${n}`);
      const complete = new Set(plan.state?.resumo?.dominiosCompletos ?? []);
      const results = fatal.length ? new Map<string, Result & { errors: string[] }>() : await bakeEach(context, entries, (id) => `bake=1&${smoke ? 'smoke=1&' : ''}ids=${encodeURIComponent(id)}`);
      const clean = [...results].filter(([, r]) => !r.errors.length && r.card && r.mini);

      const lines: string[] = [];
      if (fatal.length) lines.push('  nada foi gravado (veja os erros)');
      else if (smoke) {
        mkdirSync(smoke, { recursive: true });
        const pixelsFile = join(smoke, 'pixels.json');
        const before = existsSync(pixelsFile) ? (JSON.parse(readFileSync(pixelsFile, 'utf8')) as Record<string, [string, string]>) : null;
        const now: Record<string, [string, string]> = {};
        for (const [id, r] of clean) {
          writeFileSync(join(smoke, `${id}.png`), r.card!.bytes);
          writeFileSync(join(smoke, `${id}-mini.png`), r.mini!.bytes);
          now[id] = [r.card!.pixels, r.mini!.pixels];
          const same = before?.[id] ? (before[id][0] === r.card!.pixels && before[id][1] === r.mini!.pixels ? 'iguais à rodada anterior' : 'DIFERENTES da rodada anterior') : 'primeira rodada';
          lines.push(...report(id, [kb(r.card!.bytes.length), kb(r.mini!.bytes.length)], r, `${r.card!.pixels}/${r.mini!.pixels} (${same})`));
          if (before?.[id] && same !== 'iguais à rodada anterior') fail(`${id}: os pixels mudaram desde a rodada anterior em ${pixelsFile} (se o núcleo mudou de propósito, apague esse arquivo)`);
        }
        // The next run's baseline, only from a complete run (a failed subject must not erase its line).
        if (clean.length === entries.length) writeFileSync(pixelsFile, JSON.stringify(now, null, 2) + '\n');
        else lines.push(`  ${pixelsFile} mantido: nem todos os temas saíram`);
        // Order and teardown: every subject again in ONE page, in reverse and the first of those once more, so each
        // comes after others (another surface painted, other subjects built and torn down). The same pixels as
        // its page of its own prove the in-page review shows what the bake writes, and that teardown frees only
        // what three.js uploads again.
        const ids = entries.map((e) => e.id);
        if (ids.length > 1 && clean.length === ids.length) {
          const sequence = [...ids].reverse();
          sequence.push(sequence[0]);
          const runs: { id: string; pixels: [string, string] }[] = [];
          const v = await visit(context, `bake=1&smoke=1&ids=${sequence.join(',')}`, 'sequência', (page) => {
            runs.length = 0;
            return page.exposeFunction('salvarFigurinha', (_d: string, id: string, kind: 'card' | 'mini', _b: string, pixels: string) => {
              activity = Date.now();
              if (kind === 'card') runs.push({ id, pixels: [pixels, ''] });
              else if (runs.at(-1)?.id === id) runs.at(-1)!.pixels[1] = pixels;
            });
          });
          await v.page.close().catch(() => {});
          for (const e of v.errors) fail(`sequência: ${e}`);
          const wrong = runs.filter((r, i) => r.id !== sequence[i] || r.pixels[0] !== now[r.id][0] || r.pixels[1] !== now[r.id][1]);
          if (runs.length !== sequence.length) fail(`sequência: ${runs.length} de ${sequence.length} temas renderizados`);
          for (const r of wrong) fail(`${r.id}: na sequência ${sequence.join(' → ')}, os pixels saíram ${r.pixels.join('/')} e sozinha ${now[r.id]?.join('/')}: a ordem ou o teardown mudou o desenho`);
          if (runs.length === sequence.length && !wrong.length) lines.push(`  ordem e teardown: ${sequence.join(' → ')} numa página só → os mesmos pixels de cada uma sozinha`);
        }
      } else {
        const byDomain = new Map<Domain, [string, Result][]>();
        for (const [id, r] of clean) {
          const d = r.domain as Domain;
          // Ownership: a domain writes only its own stickers, into its own manifest.
          if (!STICKER_IDS.has(id)) fail(`${id}: não existe em shared/data/conquistas.json; não gravado`);
          else if (domainOf(id) !== d) fail(`${id}: o domínio ${d} tentou gravar uma figurinha de ${domainOf(id)}; não gravado`);
          else byDomain.set(d, [...(byDomain.get(d) ?? []), [id, r]]);
        }
        // A domain baked whole (no ids) and every one of its stickers clean: what its file no longer draws leaves
        // the manifest and the disk.
        const prunable = (d: Domain) => !args.ids.length && complete.has(d) && entries.every((e) => e.dominio !== d || clean.some(([id]) => id === e.id));
        for (const d of DOMAINS.filter((x) => byDomain.has(x) || prunable(x))) {
          const release = await lockDomain(d);
          try {
            // Read under the lock: another bake may have written this domain since this one started.
            const m = readManifest(d);
            let touched = false;
            mkdirSync(FIGURINHAS_DIR, { recursive: true });
            for (const [id, r] of (byDomain.get(d) ?? []).sort(([a], [b]) => a.localeCompare(b))) {
              const old = m[id];
              const write = (kind: 'card' | 'mini', shot: Shot, oldPixels: string | undefined, oldHash: string | undefined) => {
                const path = picturePath(id, kind);
                const intact = oldHash !== undefined && existsSync(path) && hash8(readFileSync(path)) === oldHash;
                if (oldPixels === shot.pixels && intact) return { hash: oldHash!, changed: false };
                writeFileSync(path, shot.bytes);
                return { hash: hash8(shot.bytes), changed: true };
              };
              const card = write('card', r.card!, old?.px, old?.v);
              const mini = write('mini', r.mini!, old?.pxm, old?.vm);
              const sizes: [number, number] = [card.changed ? kb(r.card!.bytes.length) : old!.kb[0], mini.changed ? kb(r.mini!.bytes.length) : old!.kb[1]];
              const entry = { v: card.hash, vm: mini.hash, px: r.card!.pixels, pxm: r.mini!.pixels, kb: sizes };
              if (JSON.stringify(entry) !== JSON.stringify(old)) touched = true;
              m[id] = entry;
              const what = !old ? 'novos' : card.changed || mini.changed ? `mudaram (${[card.changed && 'card', mini.changed && 'mini'].filter(Boolean).join(', ')})` : 'iguais';
              lines.push(...report(id, sizes, r, what));
              if (sizes[0] > LIMITS.card) fail(`${id}: card com ${sizes[0]} KB passa do limite de ${LIMITS.card} KB (o teste falha)`);
              if (sizes[1] > LIMITS.mini) fail(`${id}: mini com ${sizes[1]} KB passa do limite de ${LIMITS.mini} KB (o teste falha)`);
            }
            if (prunable(d)) {
              const drawn = new Set(entries.filter((e) => e.dominio === d).map((e) => e.id));
              for (const id of Object.keys(m))
                if (!drawn.has(id)) {
                  delete m[id];
                  touched = true;
                  lines.push(`  ${id.padEnd(26)} removida (o domínio ${d} não a desenha mais)`);
                }
              for (const id of DOMAIN_IDS[d])
                for (const kind of ['card', 'mini'] as const)
                  if (!m[id] && existsSync(picturePath(id, kind))) {
                    unlinkSync(picturePath(id, kind));
                    lines.push(`  ${picturePath(id, kind).replace(REPO, '.')} apagada (fora do manifesto)`);
                  }
            }
            if (touched) {
              writeFileSync(manifestPath(d), manifestText(m));
              lines.push(`  manifesto: shared/data/figurinhas/${d}.json`);
            }
          } finally {
            release();
          }
        }
        for (const [id] of results) if (!clean.some(([c]) => c === id)) lines.push(`  ${id.padEnd(26)} não gravada (erro)`);
      }
      await context.close();
      console.log(lines.join('\n') || '  (nada gravado)');
    }

    /**
     * Before a screenshot from the PNGs: the six manifests read again on the next request (the server doesn't
     * watch shared/, and other bakes write their domains' meanwhile), then every PNG they list served (the
     * server's list of public files follows its watcher, a few milliseconds behind the disk).
     */
    const freshPictures = async () => {
      const graph = server.environments.client.moduleGraph;
      const manifests = new Set(DOMAINS.map((d) => manifestPath(d).replace(/\\/g, '/').toLowerCase()));
      for (const [file, mods] of graph.fileToModulesMap) if (manifests.has(file.toLowerCase())) for (const mod of mods) graph.invalidateModule(mod);
      let missing = DOMAINS.flatMap((d) => Object.entries(readManifest(d)).flatMap(([id, e]) => [`/figurinhas/${id}.png?v=${e.v}`, `/figurinhas/${id}-mini.png?v=${e.vm}`]));
      const t = Date.now();
      while (missing.length && Date.now() - t < 5000) {
        const status = await Promise.all(missing.map((url) => fetch(base + url, { method: 'HEAD' }).then((r) => r.status, () => 0)));
        missing = missing.filter((_, i) => status[i] !== 200);
        if (missing.length) await Bun.sleep(100);
      }
      for (const url of missing) fail(`captura: o servidor não serve ${url.replace(/\?.*$/, '')}, que um manifesto lista`);
    };

    // Screenshots: from the PNGs (fast) for the review and the contact sheet; live for the smoke subjects.
    const screenshot = async (query: string, out: string, dpr: number) => {
      const context = await browser.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: dpr, locale: 'pt-BR' });
      const v = await visit(context, query, 'captura');
      for (const e of v.errors) fail(`captura: ${e}`);
      for (const f of v.fatal) fail(`captura: ${f}`);
      try {
        // A page whose modules never loaded shows only that error: an earlier screenshot at `out` stays.
        if (v.failedToLoad) return;
        await v.page.addStyleTag({ content: '.est-status { display: none !important; }' });
        mkdirSync(join(out, '..'), { recursive: true });
        for (const [i, part, path] of await screenshotParts(v.page, out, dpr)) {
          await v.page.screenshot({ path, fullPage: true, clip: part, animations: 'disabled' });
          console.log(`Captura: ${path}${i ? ` (parte ${i})` : ''}`);
        }
      } finally {
        await context.close();
      }
    };
    if (!fatal.length) {
      if (smoke) await screenshot('smoke=1', join(smoke, args.dpr > 1 ? `revisao@${args.dpr}x.png` : 'revisao.png'), args.dpr);
      if (args.revisao || args.folha) await freshPictures();
      if (args.revisao) await screenshot(`fonte=png&${filter}`, args.revisao, args.dpr);
      if (args.folha) await screenshot('folha=1', args.folha, args.dpr);
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  } finally {
    await cleanup();
  }
  const secs = ((performance.now() - t0) / 1000).toFixed(0);
  if (errors.length) {
    console.error(`\n${errors.length} ${errors.length === 1 ? 'erro' : 'erros'} (${secs} s).`);
    process.exit(1);
  }
  console.log(`Pronto em ${secs} s.`);
  process.exit(0);
}
