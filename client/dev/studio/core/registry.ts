// Sticker studio: which domain files load and what each may declare. The page imports only the domains a
// filter needs (lazily: another agent may be halfway through editing a domain file, and that must break that
// domain only). Every subject id must be a sticker of shared/data/conquistas.json owned by its domain in
// shared/data/figurinhas/dominios.json, and appear once among the loaded domains. With an ids filter only those
// stickers are checked: the bake gives each sticker a page of its own, and a sibling's problem (already reported
// by the bake's first page, which loads the whole domain) must not fail it. A domain file whose import throws
// is also listed apart (Loaded.unloaded): the bake opens the page again a few seconds later, in case someone was
// halfway through an edit.
import conquistas from '@shared/data/conquistas.json';
import dominios from '@shared/data/figurinhas/dominios.json';
import { withSeed } from './seed';
import { DOMAINS, type Domain, type DomainName, type Subject } from './types';

const STICKER_IDS = new Set(conquistas.figurinhas.map((f) => f.id));

/** Each sticker's domain. */
export const OWNER = new Map<string, DomainName>();
for (const d of DOMAINS) for (const id of (dominios as unknown as Record<DomainName, string[]>)[d] ?? []) OWNER.set(id, d);

export const isDomain = (s: string): s is DomainName => (DOMAINS as readonly string[]).includes(s);

/** What to load: domains by name, or the domains owning these ids (null: no filter). */
export interface Filter {
  domains: DomainName[] | null;
  ids: string[] | null;
}

export interface Entry {
  domain: DomainName;
  subject: Subject;
}

export interface Loaded {
  entries: Entry[];
  /** Problems: the bake fails on them. */
  errors: string[];
  /**
   * The errors of domain files whose import threw (a syntax error, a missing export, a throw at the top level,
   * in the file or in what it imports): the bake opens the page again, in case someone was mid-edit.
   */
  unloaded: string[];
  /** Information: domains without a file yet, stickers a domain doesn't draw yet. */
  notes: string[];
  /** Domains loaded whole and without problems (a bake of one may drop the PNGs its manifest no longer lists). */
  complete: DomainName[];
}

/** `files`: the lazy import.meta.glob('./studio/*.ts') of the entry (keys like './studio/zumbi.ts'). */
export async function loadDomains(files: Record<string, () => Promise<unknown>>, filter: Filter): Promise<Loaded> {
  const out: Loaded = { entries: [], errors: [], unloaded: [], notes: [], complete: [] };
  const byName = new Map<string, () => Promise<unknown>>();
  for (const [path, load] of Object.entries(files)) {
    const name = path.replace(/^.*\//, '').replace(/\.ts$/, '');
    // Never loaded: one stray file must not break the other domains' bakes.
    if (isDomain(name)) byName.set(name, load);
    else out.notes.push(`client/dev/studio/${name}.ts ignorado: não é um domínio (${DOMAINS.join(', ')}); cada domínio tem um arquivo só`);
  }
  for (const id of filter.ids ?? []) if (!STICKER_IDS.has(id)) out.errors.push(`${id}: não existe em shared/data/conquistas.json`);
  const explicit = filter.domains ?? (filter.ids ? [...new Set(filter.ids.map((id) => OWNER.get(id)).filter((d): d is DomainName => !!d))] : null);
  const wanted = explicit ?? DOMAINS.filter((d) => byName.has(d));
  const missing = DOMAINS.filter((d) => !byName.has(d) && (!explicit || explicit.includes(d)));
  if (missing.length) {
    const msg = `sem arquivo ainda: ${missing.map((d) => `client/dev/studio/${d}.ts`).join(', ')}`;
    if (explicit) out.errors.push(msg);
    else out.notes.push(msg);
  }
  const seen = new Map<string, DomainName>();
  const loaded = new Set<DomainName>();
  for (const d of wanted) {
    const load = byName.get(d);
    if (!load) continue;
    let mod: { default?: Domain };
    try {
      // Seeded too: randomness at a domain file's top level (and in what it imports first) repeats.
      mod = (await withSeed(`dominio:${d}`, load)) as { default?: Domain };
    } catch (err) {
      const msg = `${d}: o domínio não carregou: ${err instanceof Error ? err.message : String(err)}`;
      out.errors.push(msg);
      out.unloaded.push(msg);
      continue;
    }
    if (!mod.default || mod.default.name !== d || !Array.isArray(mod.default.subjects)) {
      out.errors.push(`${d}: o arquivo deve exportar por padrão defineDomain('${d}', [...])`);
      continue;
    }
    const domain = mod.default;
    loaded.add(d);
    let ok = true;
    const drawn = new Set<string>();
    for (const subject of domain.subjects) {
      const id = subject?.id;
      if (filter.ids && !filter.ids.includes(id)) continue;
      const problem =
        typeof id !== 'string' || typeof subject.build !== 'function'
          ? 'cada figurinha precisa de id e build(k)'
          : !STICKER_IDS.has(id)
            ? 'não existe em shared/data/conquistas.json'
            : OWNER.get(id) !== d
              ? `é do domínio ${OWNER.get(id)} (shared/data/figurinhas/dominios.json)`
              : seen.has(id)
                ? `aparece duas vezes (${seen.get(id)})`
                : null;
      if (problem) {
        out.errors.push(`${d}/${String(id)}: ${problem}`);
        ok = false;
        continue;
      }
      seen.set(id, d);
      drawn.add(id);
      out.entries.push({ domain: d, subject });
    }
    if (filter.ids) continue;
    const todo = [...OWNER].filter(([id, owner]) => owner === d && !drawn.has(id)).map(([id]) => id);
    if (todo.length) out.notes.push(`${d}: ainda sem desenho: ${todo.join(', ')}`);
    if (ok) out.complete.push(d);
  }
  for (const id of filter.ids ?? []) {
    const d = OWNER.get(id);
    if (d && loaded.has(d) && !out.entries.some((e) => e.subject.id === id) && !out.errors.some((e) => e.startsWith(`${d}/${id}:`)))
      out.errors.push(`${id}: o domínio ${d} ainda não desenha esta figurinha`);
  }
  return out;
}
