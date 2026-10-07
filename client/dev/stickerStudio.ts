// Sticker studio (dev only, tools/estudio-figurinhas.html): the album's stickers drawn with the game's own
// models. The core lives in client/dev/studio/core; each domain adds one file, client/dev/studio/<domain>.ts.
// Modes (query string):
//   (default)  review: each sticker rendered live in the album's real markup, at real size (core/review.ts);
//              ?fonte=png shows the baked PNGs only (fast; bun run figurinhas --revisao), ?grade=1 the margins
//   ?folha=1   the contact sheet: every baked mini at 30 px, then each album page's cards side by side
//   ?bake=1    renders the filtered stickers and hands each picture to tools/bake-figurinhas.ts
//              (window.salvarFigurinha). The tool first opens ?bake=1&plano=1, which only lists what to bake,
//              then one fresh page per sticker (?bake=1&ids=<id>), so no sticker depends on another.
//   ?smoke=1   the core's smoke subjects instead of the stickers (core/smoke.ts); with ?bake=1, ?ids= picks
//              them in order, repeats allowed (the tool's order and teardown check)
// Filters: ?dominio=a,b, ?ids=x,y, ?pagina=<album page>. Only the domains a filter needs are imported.
// The page loads this module through a bootstrap (tools/estudio-figurinhas.html) that finishes the page even
// when it can't load; what didn't load goes to window.__carga, and the bake opens such a page again.
import { stickerById, type Sticker } from '@shared/achievements';
import { setLang } from '../ui/strings';
import { loadTextureOverrides } from '../world/surfaces';
import { produce, runBake, studioWindow } from './studio/core/bake';
import { fontGate } from './studio/core/fonts';
import { isDomain, loadDomains, OWNER } from './studio/core/registry';
import { prepareSurfaces, rendererName, studioRenderer } from './studio/core/render';
import { picturesReady, renderItem, renderSheet, reviewHeader, type ReviewItem } from './studio/core/review';
import { SMOKE } from './studio/core/smoke';
import type { Subject } from './studio/core/types';

// Lazy on purpose: a domain file another agent is halfway through editing breaks only that domain.
const files = import.meta.glob('./studio/*.ts');

const q = new URLSearchParams(location.search);
const list = (key: string) =>
  q
    .get(key)
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? null;

const w = studioWindow();
w.__erros = [];
w.__carga = [];
w.__avisos = [];
w.__fatal = [];
window.addEventListener('error', (e) => w.__erros.push(`erro na página: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => w.__erros.push(`promessa rejeitada: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`));

const status = document.createElement('p');
status.className = 'est-status';
document.body.append(status);
const log = (line: string) => {
  status.textContent = line;
  console.info(`[estúdio] ${line}`);
};

/** The smoke subjects as album stickers, for the real markup (a counter on Zumbi, a gold-only record, a counter on Vexames). */
const SMOKE_STICKERS: Sticker[] = SMOKE.map((s, i) => ({
  id: s.id,
  pagina: ['zumbi', 'proezas', 'vexames'][i] ?? 'zumbi',
  icone: '🧪',
  tipo: i === 1 ? 'recorde' : 'contador',
  fonte: 'propria',
  metas: i === 1 ? [1] : [1, 5, 10, 25],
  nome: { pt: `Teste: ${s.id.replace('smoke-', '')}`, en: s.id },
  como: { pt: '', en: '' },
}));

interface Chosen {
  entries: { domain: string; subject: Subject }[];
  notes: string[];
  /** Domains loaded whole and without problems (a bake of one may drop the PNGs its manifest no longer lists). */
  complete: string[];
}

/** What the filters pick: smoke subjects, or the stickers of the domain files they need. */
async function choose(smoke: boolean): Promise<Chosen> {
  const ids = list('ids');
  if (smoke) {
    const subjects = (ids ?? SMOKE.map((s) => s.id)).map((id) => SMOKE.find((s) => s.id === id) ?? id);
    for (const s of subjects) if (typeof s === 'string') w.__erros.push(`${s}: não é um tema do smoke (${SMOKE.map((x) => x.id).join(', ')})`);
    return { entries: subjects.filter((s): s is Subject => typeof s !== 'string').map((subject) => ({ domain: 'smoke', subject })), notes: [], complete: [] };
  }
  const asked = list('dominio');
  for (const d of asked ?? []) if (!isDomain(d)) w.__erros.push(`domínio desconhecido: ${d}`);
  const loaded = await loadDomains(files, { domains: asked ? asked.filter(isDomain) : null, ids });
  w.__erros.push(...loaded.errors);
  w.__carga.push(...loaded.unloaded);
  const page = q.get('pagina');
  return {
    entries: page ? loaded.entries.filter((e) => stickerById(e.subject.id)?.pagina === page) : loaded.entries,
    notes: loaded.notes,
    complete: page ? [] : loaded.complete,
  };
}

/**
 * The filters' stickers straight from dominios.json, importing no domain file: ?fonte=png only needs the
 * manifests and the PNGs, so it still works while some agent's domain file doesn't parse.
 */
function chooseBaked(): Chosen {
  const ids = list('ids');
  const asked = list('dominio');
  const page = q.get('pagina');
  const pngOnly = () => {
    throw new Error('?fonte=png não desenha');
  };
  const entries = [...OWNER]
    .filter(([id, d]) => (!ids || ids.includes(id)) && (!asked || asked.includes(d)) && (!page || stickerById(id)?.pagina === page))
    .map(([id, domain]) => ({ domain, subject: { id, build: pngOnly } }));
  return { entries, notes: [], complete: [] };
}

async function main() {
  // Canvas text is painted once, at build time: the language and the fonts must be right before anything.
  setLang('pt-BR');
  const smoke = q.get('smoke') === '1';
  const mode = q.get('bake') === '1' ? (q.get('plano') === '1' ? 'plano' : 'bake') : q.get('folha') === '1' ? 'folha' : 'revisao';
  document.title = `Estúdio de figurinhas · ${smoke ? 'smoke' : mode}`;

  if (mode === 'plano') {
    // The bake's first page: what to bake, checked; no fonts, renderer or rendering.
    const chosen = await choose(smoke);
    w.__resumo = { modo: mode, entradas: chosen.entries.map((e) => ({ dominio: e.domain, id: e.subject.id })), dominiosCompletos: chosen.complete, notas: chosen.notes };
    log('pronto');
    return;
  }

  log('carregando as fontes…');
  const fontProblems = await fontGate();
  if (mode === 'folha') {
    w.__erros.push(...fontProblems);
    const root = document.body.appendChild(document.createElement('main'));
    root.innerHTML = reviewHeader('Folha do álbum', []);
    renderSheet(root.appendChild(document.createElement('div')), q.get('pagina'));
    await picturesReady();
    log('pronto');
    return;
  }
  // Rendering (the bake, the live review): the renderer, then every map surface painted in a fixed order.
  const live = mode === 'bake' || q.get('fonte') !== 'png';
  if (live) w.__renderer = rendererName();
  if (mode === 'bake') {
    // Nothing is built with fallback fonts or off SwiftShader: every picture would come out wrong.
    const fatal = [...fontProblems, ...(/swiftshader/i.test(w.__renderer ?? '') ? [] : [`o renderer não é o SwiftShader (${w.__renderer}): o bake só aceita ele`])];
    if (fatal.length) {
      w.__fatal.push(...fatal);
      w.__erros.push(...fatal);
      log('parado: veja os erros');
      return;
    }
  } else w.__erros.push(...fontProblems);
  if (live) {
    prepareSurfaces();
    await loadTextureOverrides(studioRenderer());
  }

  const { entries, notes, complete } = live || smoke ? await choose(smoke) : chooseBaked();
  w.__resumo = { modo: mode, smoke, ids: entries.map((e) => e.subject.id), dominiosCompletos: complete, notas: notes };
  for (const n of notes) console.info(`[estúdio] ${n}`);

  if (mode === 'bake') {
    await runBake(entries, log);
    log('pronto');
    return;
  }

  // Review.
  const root = document.body.appendChild(document.createElement('main'));
  const opts = { grid: q.get('grade') === '1', baked: !smoke };
  root.innerHTML = reviewHeader(smoke ? 'Estúdio de figurinhas: smoke' : 'Estúdio de figurinhas', [
    ...notes,
    ...w.__erros.map((e) => `erro: ${e}`),
    ...(entries.length ? [] : ['nada a mostrar com este filtro']),
  ]);
  const items: ReviewItem[] = entries.map((e) => ({
    sticker: smoke ? SMOKE_STICKERS.find((s) => s.id === e.subject.id)! : stickerById(e.subject.id)!,
    domain: e.domain,
    live: null,
  }));
  const els = items.map(() => root.appendChild(document.createElement('div')));
  items.forEach((item, i) => renderItem(els[i], item, opts));
  if (live)
    for (const [i, e] of entries.entries()) {
      log(`renderizando (${i + 1}/${entries.length}) ${e.subject.id}…`);
      try {
        const p = await produce(e.subject);
        items[i].live = { card: URL.createObjectURL(p.card.png), mini: URL.createObjectURL(p.mini.png), avisos: p.avisos, texts: p.texts, fill: [p.card.cut.fill, p.mini.cut.fill], ms: p.ms };
        for (const a of p.avisos) w.__avisos.push(`${p.id}: ${a}`);
      } catch (err) {
        items[i].live = { error: err instanceof Error ? err.message : String(err) };
        w.__erros.push(`${e.subject.id}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
      }
      renderItem(els[i], items[i], opts);
    }
  await picturesReady();
  log(`pronto: ${items.length} ${items.length === 1 ? 'figurinha' : 'figurinhas'}`);
}

main()
  .catch((err) => w.__erros.push(`estúdio: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`))
  .finally(() => {
    w.__done = true;
  });
