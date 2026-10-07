// Sticker studio: one subject from build to its two pictures (produce), and the bake mode that hands them to
// tools/bake-figurinhas.ts. Determinism: Math.random is seeded from the sticker's id while build() runs (and
// restored after), each shot's before() runs seeded too (its own key), every stepped animation uses a fixed
// time step (kit.ts DT), and the subject is built once and thrown away before the real build, so every shared
// cache it touches already exists: a first-time cache fill draws extra random numbers (three.js gives every
// new object a random id) and would shift the sequence. The bake tool also gives every sticker a fresh page of
// its own, so no sticker ever depends on what was built before it; the warm-up keeps the review page (many
// stickers in one page) and the smoke's order check on the same pixels.
import { createPhysics, type Physics } from '../../../world/physics';
import { CARD, MARGIN, MINI, sidesWithin } from './dieCut';
import { Kit } from './kit';
import { bakePicture, cameraFor, fitTexts, lightRig, renderShot, studioRenderer, teardown, type Picture } from './render';
import { withSeed } from './seed';
import type { Built, Subject } from './types';

export interface Produced {
  id: string;
  card: Picture;
  mini: Picture;
  /** Warnings for the review and the bake's report. */
  avisos: string[];
  /** The texts' cap heights on the card (px of the 800 x 600 render). */
  texts: string[];
  ms: number;
}

let physics: Promise<Physics> | null = null;
/** The page's one physics world (MapBuilder registers colliders; it never steps). */
export const studioPhysics = () => (physics ??= createPhysics());

/** Builds a subject with Math.random seeded from its id, then finishes its builders. */
const seededBuild = (subject: Subject, k: Kit): Promise<Built> =>
  withSeed(subject.id, async () => {
    const built = await subject.build(k);
    k.finish();
    return built;
  });

/** The subject's two pictures: build (twice, see the header), light, render, die-cut, halve, encode. */
export async function produce(subject: Subject): Promise<Produced> {
  const t0 = performance.now();
  const renderer = studioRenderer();
  const world = await studioPhysics();
  const warm = new Kit(subject.id, renderer, world);
  try {
    const warmBuilt = await seededBuild(subject, warm);
    // The shots' before() too, with the same seeds as below: a cache first filled there would shift the real
    // run's sequence just the same.
    await withSeed(`${subject.id}:card`, () => warmBuilt?.card?.before?.());
    await withSeed(`${subject.id}:mini`, () => warmBuilt?.mini?.before?.());
  } finally {
    teardown(warm.group);
  }
  const k = new Kit(subject.id, renderer, world);
  try {
    const built = await seededBuild(subject, k);
    if (!built?.card || !built.mini) throw new Error('build(k) deve devolver { card, mini }');
    const rig = lightRig(built);
    k.group.add(rig.group);
    // Only the rig lights a sticker, unless the subject keeps its props' lights: renderShot switches the others
    // off right before each render (an effect first touched in a before() makes its lights there).
    const lights = { propLights: built.propLights };
    // The card: its before() (seeded: a stepped effect or a dice roll in it repeats), then the texts sized for
    // where they ended up, then the render.
    await withSeed(`${subject.id}:card`, () => built.card.before?.());
    fitTexts(k.texts, cameraFor(built.card, CARD.w / CARD.h), CARD.h);
    const card = await bakePicture(renderShot(k.group, built.card, CARD, rig, lights), CARD);
    await withSeed(`${subject.id}:mini`, () => built.mini.before?.());
    const mini = await bakePicture(renderShot(k.group, built.mini, MINI, rig, lights), MINI);
    const avisos: string[] = [];
    for (const [name, p, spec] of [
      ['card', card, CARD],
      ['mini', mini, MINI],
    ] as const) {
      if (!p.cut.box || !p.cut.outer) throw new Error(`${name}: a imagem saiu vazia (a câmera não vê nada?)`);
      const edgeOk = built.allowEdge === true || built.allowEdge === name;
      if (p.cut.edges.length && !edgeOk) avisos.push(`${name}: o recorte encosta na borda (${p.cut.edges.join(', ')}): afaste a câmera ou centralize`);
      // The card's whole cut, band included, stays inside the album's 6% margin (the sides already at the edge
      // were reported above).
      if (name === 'card' && !edgeOk) {
        const sides = sidesWithin(p.cut.outer, spec.w, spec.h, MARGIN).filter((s) => !p.cut.edges.includes(s));
        if (sides.length) avisos.push(`card: o recorte entra na margem de ${Math.round(MARGIN * 100)}% (${sides.join(', ')}): afaste um pouco a câmera (ocupa ${p.cut.fill.toFixed(2)}; o máximo costuma ficar entre 0.75 e 0.80)`);
      }
      if (p.cut.pieces > 1) avisos.push(`${name}: o recorte saiu em ${p.cut.pieces} pedaços: aproxime as partes ou junte-as numa ilha (k.island)`);
      if (p.cut.fill < 0.6) avisos.push(`${name}: o desenho ocupa só ${Math.round(p.cut.fill * 100)}% da maior dimensão (mínimo 60%)`);
    }
    const texts = k.texts.map((t) => `${t.label}: ${Math.round(t.px ?? 0)} px`);
    return { id: subject.id, card, mini, avisos, texts, ms: Math.round(performance.now() - t0) };
  } finally {
    teardown(k.group);
  }
}

// --- Bake mode -------------------------------------------------------------------------------------------------

/** What the page shares with the bake tool (tools/bake-figurinhas.ts). */
export interface StudioWindow {
  __done?: boolean;
  __erros: string[];
  /**
   * Modules that didn't load (the studio itself: the page's bootstrap in tools/estudio-figurinhas.html; a domain
   * file), also in __erros: the tool opens the page again a few seconds later, since a file someone is
   * halfway through editing (a syntax error, a missing export) is the usual cause.
   */
  __carga: string[];
  __avisos: string[];
  /** Problems that make every picture of this run wrong (fonts, renderer): the bake writes nothing at all. */
  __fatal: string[];
  __renderer?: string;
  __resumo?: unknown;
  /** Exposed by the tool: one call per picture. `meta` is JSON: { fill, avisos, textos, ms }. */
  salvarFigurinha?: (dominio: string, id: string, tipo: 'card' | 'mini', base64: string, pixels: string, meta: string) => Promise<void>;
}

export const studioWindow = () => window as unknown as StudioWindow;

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Bakes the entries in order and hands every picture to the tool; errors stay per subject. */
export async function runBake(entries: { domain: string; subject: Subject }[], log: (line: string) => void) {
  const w = studioWindow();
  for (const [i, { domain, subject }] of entries.entries()) {
    log(`(${i + 1}/${entries.length}) ${subject.id}`);
    try {
      const p = await produce(subject);
      for (const a of p.avisos) w.__avisos.push(`${p.id}: ${a}`);
      for (const [tipo, pic] of [
        ['card', p.card],
        ['mini', p.mini],
      ] as const) {
        const meta = JSON.stringify({ fill: Math.round(pic.cut.fill * 100) / 100, avisos: p.avisos.filter((a) => a.startsWith(tipo)), textos: tipo === 'card' ? p.texts : [], ms: p.ms });
        if (w.salvarFigurinha) await w.salvarFigurinha(domain, p.id, tipo, await base64(pic.png), pic.pixels, meta);
      }
    } catch (err) {
      w.__erros.push(`${subject.id}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    }
  }
}
