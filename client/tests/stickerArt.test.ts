// The album's baked sticker art (tools/bake-figurinhas.ts, client/ui/stickerArt.ts): the six manifests stay
// well-formed and owned by their domains, every picture they list is on disk as the bake wrote it (PNG, size,
// hash, weight) with nothing extra, and the album never leaks a hidden sticker nor mixes emoji and pictures on a
// page. Data-driven: it holds with the manifests empty (today) and full. Also the studio's pure parts: the
// die-cut (client/dev/studio/core/dieCut.ts), what it counts and measures for the bake's warnings; the cast
// (core/cast.ts), plain neighbors and the sex every look carries; the bake's file watcher, public/ only.
import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PAGES, STICKERS, type Sticker, type StickerState } from '@shared/achievements';
import { catalogItem, REQUIRED_SLOTS } from '@shared/catalog';
import { DOMAIN_IDS, DOMAINS, hash8, LIMITS, listPictures, manifestPath, picturePath, pngSize, readManifest, REPO, SIZES, STICKER_IDS, watchIgnored } from '../../tools/bake-figurinhas';
import { dress, HERO, mood, neighbor, RIVAL, sexOf, strip, tweak, withSex } from '../dev/studio/core/cast';
import { CARD, dieCut, MARGIN, sidesWithin, type CutSpec } from '../dev/studio/core/dieCut';
import { bakedArt, cardHtml, pagesWithArt, stickerArtUrl, stickerBadge, type ArtEntry, type ArtLookup } from '../ui/stickerArt';
import { setLang } from '../ui/strings';

setLang('pt-BR');

const manifests = DOMAINS.map((d) => ({ domain: d, entries: readManifest(d) }));
const listed = manifests.flatMap(({ domain, entries }) => Object.keys(entries).map((id) => ({ domain, id, e: entries[id] })));

const state = (s: Sticker, tier: number): StickerState => ({ sticker: s, tier, progress: tier ? s.metas[tier - 1] : 0, repeats: 0, next: s.metas[tier] ?? null });
const fake: ArtEntry = { v: 'aaaaaaaa', vm: 'bbbbbbbb', px: '0123456789abcdef', pxm: 'fedcba9876543210', kb: [40, 8] };
/** Every sticker has a picture. */
const all: ArtLookup = () => fake;

describe('manifestos das figurinhas', () => {
  it('cada domínio tem o seu, com _doc primeiro e as figurinhas em ordem', () => {
    for (const d of DOMAINS) {
      const raw = JSON.parse(readFileSync(manifestPath(d), 'utf8')) as Record<string, unknown>;
      const keys = Object.keys(raw);
      expect(keys[0]).toBe('_doc');
      expect(typeof raw._doc).toBe('string');
      expect(keys.slice(1)).toEqual([...keys.slice(1)].sort());
    }
  });

  it('cada entrada tem hashes e tamanhos', () => {
    for (const { id, e } of listed) {
      expect({ id, v: /^[0-9a-f]{8}$/.test(e.v), vm: /^[0-9a-f]{8}$/.test(e.vm), px: /^[0-9a-f]{16}$/.test(e.px), pxm: /^[0-9a-f]{16}$/.test(e.pxm) }).toEqual({ id, v: true, vm: true, px: true, pxm: true });
      expect(e.kb.length).toBe(2);
    }
  });

  it('toda figurinha existe, está em um só manifesto e no do seu domínio', () => {
    const seen = new Map<string, string>();
    for (const { domain, id } of listed) {
      expect({ id, exists: STICKER_IDS.has(id) }).toEqual({ id, exists: true });
      expect({ id, also: seen.get(id) ?? null }).toEqual({ id, also: null });
      seen.set(id, domain);
      expect({ id, domain }).toEqual({ id, domain: DOMAINS.find((d) => DOMAIN_IDS[d].includes(id))! });
    }
  });

  it('o mapa de domínios cobre o álbum: cada figurinha em um domínio só', () => {
    const owners = STICKERS.map((s) => ({ id: s.id, n: DOMAINS.filter((d) => DOMAIN_IDS[d].includes(s.id)).length }));
    expect(owners.filter((o) => o.n !== 1)).toEqual([]);
    const ids = DOMAINS.flatMap((d) => DOMAIN_IDS[d]);
    expect(ids.filter((id) => !STICKER_IDS.has(id))).toEqual([]);
  });
});

describe('PNGs das figurinhas', () => {
  it('cada figurinha listada tem os dois PNGs como o bake gravou (tamanho, hash, peso)', () => {
    for (const { id, e } of listed) {
      for (const kind of ['card', 'mini'] as const) {
        const path = picturePath(id, kind);
        expect({ path, exists: existsSync(path) }).toEqual({ path, exists: true });
        const bytes = readFileSync(path);
        const [w, h] = SIZES[kind];
        expect({ path, size: pngSize(bytes) }).toEqual({ path, size: { w, h } });
        expect({ path, hash: hash8(bytes) }).toEqual({ path, hash: kind === 'card' ? e.v : e.vm });
        expect({ path, ok: bytes.length <= LIMITS[kind] * 1024 }).toEqual({ path, ok: true });
      }
    }
  });

  it('não sobra PNG fora dos manifestos', () => {
    const expected = new Set(listed.flatMap(({ id }) => [`${id}.png`, `${id}-mini.png`]));
    expect(listPictures().filter((f) => !expected.has(f))).toEqual([]);
  });

  it('o leitor de PNG reconhece a assinatura e o IHDR', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 1, 0x90, 0, 0, 1, 0x2c]);
    expect(pngSize(png)).toEqual({ w: 400, h: 300 });
    expect(pngSize(new Uint8Array(24))).toBeNull();
  });
});

describe('arte das figurinhas no álbum', () => {
  it('figurinha oculta não colada nunca mostra a URL; colada, mostra', () => {
    for (const s of STICKERS.filter((x) => x.oculta)) {
      for (const lookup of [all, bakedArt]) {
        const hidden = cardHtml(state(s, 0), false, { lookup });
        expect(hidden).toContain('???');
        expect(hidden).not.toContain('/figurinhas/');
        expect(hidden).not.toContain(s.id + '.png');
        expect(stickerBadge([s.id, 0], { lookup })).toBe('');
      }
      expect(cardHtml(state(s, 1), false, { lookup: all })).toContain(`/figurinhas/${s.id}.png?v=${fake.v}`);
      const url = stickerArtUrl(s.id, 'card');
      expect(cardHtml(state(s, 1), false)).toContain(url ?? `<span class="fig-icon">${s.icone}</span>`);
    }
  });

  it('o emblema traz o mini quando há arte e o emoji quando não', () => {
    for (const s of STICKERS) {
      expect(stickerBadge([s.id, 1], { lookup: all })).toContain(`/figurinhas/${s.id}-mini.png?v=${fake.vm}`);
      const url = stickerArtUrl(s.id, 'mini');
      const badge = stickerBadge([s.id, 1]);
      if (url) expect(badge).toContain(url);
      else {
        expect(badge).toContain(`<span class="fig-icon">${s.icone}</span>`);
        expect(badge).not.toContain('/figurinhas/');
      }
    }
  });

  it('uma página só ganha arte com todas as suas figurinhas desenhadas (nunca emoji e arte juntos)', () => {
    const page = PAGES[0].id;
    const missing = STICKERS.find((s) => s.pagina === page)!.id;
    const partial: ArtLookup = (id) => (id === missing ? undefined : fake);
    expect(pagesWithArt(partial).has(page)).toBe(false);
    expect(pagesWithArt(all).size).toBe(PAGES.length);
    for (const s of STICKERS) {
      const art = s.pagina !== page;
      expect({ id: s.id, card: cardHtml(state(s, s.metas.length), false, { lookup: partial }).includes('/figurinhas/') }).toEqual({ id: s.id, card: art });
      expect({ id: s.id, mini: stickerBadge([s.id, s.metas.length], { lookup: partial }).includes('/figurinhas/') }).toEqual({ id: s.id, mini: art });
    }
    // The manifests themselves: a page shows pictures only when complete.
    for (const p of PAGES) {
      const complete = STICKERS.filter((s) => s.pagina === p.id).every((s) => bakedArt(s.id));
      expect({ page: p.id, art: pagesWithArt().has(p.id) }).toEqual({ page: p.id, art: complete });
    }
  });

  it('sem arte, o cartão é o de sempre (o emoji)', () => {
    const s = STICKERS.find((x) => !x.oculta)!;
    const html = cardHtml(state(s, 1), false, { src: null });
    expect(html).toContain(`<span class="fig-art"><span class="fig-icon">${s.icone}</span>`);
    expect(html).not.toContain('fig-img');
  });
});

describe('recorte das figurinhas (dieCut)', () => {
  // The card's line, band and closing on a smaller canvas (fast): 8 + 22 px of border, closing radius 30.
  const spec: CutSpec = { ...CARD, w: 400, h: 300, outW: 200, outH: 150 };
  /** A render of opaque white disks: RGBA premultiplied, top row first, as the studio reads it. */
  const render = (disks: [x: number, y: number, r: number][]) => {
    const art = new Uint8Array(spec.w * spec.h * 4);
    for (let y = 0; y < spec.h; y++)
      for (let x = 0; x < spec.w; x++) if (disks.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r)) art.fill(255, (y * spec.w + x) * 4, (y * spec.w + x + 1) * 4);
    return art;
  };

  it('partes que só a borda une contam como um pedaço; afastadas, como dois', () => {
    // 55 px apart: too far for the closing to join two small disks, close enough for their bands to meet.
    expect(dieCut(render([[150, 150, 20], [245, 150, 20]]), spec).pieces).toBe(1);
    expect(dieCut(render([[110, 150, 20], [290, 150, 20]]), spec).pieces).toBe(2);
  });

  it('mede quanto ocupa, as bordas que encosta e a margem de 6%', () => {
    const centered = dieCut(render([[200, 150, 60]]), spec);
    expect(centered.box).toEqual({ x0: 140, y0: 90, x1: 260, y1: 210 });
    expect(centered.fill).toBeCloseTo(121 / 300, 5);
    expect(centered.edges).toEqual([]);
    expect(sidesWithin(centered.outer!, spec.w, spec.h, MARGIN)).toEqual([]);
    // 15 px from the top: the band runs off the canvas there; 40 px from the right: the band enters the margin.
    const off = dieCut(render([[340, 35, 20]]), spec);
    expect(off.edges).toEqual(['topo']);
    expect(sidesWithin(off.outer!, spec.w, spec.h, MARGIN)).toEqual(['topo', 'direita']);
    expect(dieCut(new Uint8Array(spec.w * spec.h * 4), spec).box).toBeNull();
  });
});

describe('elenco do estúdio (cast)', () => {
  /** The slots a look's pieces take (a hood-up hoodie: the top and the head). */
  const covered = (a: ReturnType<typeof neighbor>) => Object.values(a.itens).flatMap((it) => catalogItem(it!.id)?.slots ?? ['?']);

  it('neighbor é simples por padrão: só roupa obrigatória, nada que cubra mais, sem PCD, a mesma para o mesmo n', () => {
    for (const sex of ['m', 'f'] as const)
      for (let n = 0; n < 300; n++) {
        const a = neighbor(n, { sex });
        expect({ sex, n, extra: covered(a).filter((s) => !REQUIRED_SLOTS.includes(s as never)) }).toEqual({ sex, n, extra: [] });
        expect({ sex, n, missing: REQUIRED_SLOTS.filter((s) => !a.itens[s]) }).toEqual({ sex, n, missing: [] });
        expect({ sex, n, pcd: a.pcd }).toEqual({ sex, n, pcd: { braco: '', perna: '' } });
        expect({ sex, n, sex2: sexOf(a) }).toEqual({ sex, n, sex2: sex });
        expect(neighbor(n, { sex })).toEqual(a);
      }
  });

  it('keep traz de volta só o que pede: uma peça fica quando todo slot dela é obrigatório ou pedido', () => {
    let hats = 0;
    for (let n = 0; n < 300; n++) {
      const a = neighbor(n, { keep: ['cabeca'] });
      const slots = covered(a);
      if (slots.includes('cabeca')) hats++;
      expect({ n, extra: slots.filter((s) => !REQUIRED_SLOTS.includes(s as never) && s !== 'cabeca') }).toEqual({ n, extra: [] });
    }
    expect(hats).toBeGreaterThan(0);
  });

  it('cada visual lembra o sexo; uma cópia feita à mão não, e os ajudantes a recusam', () => {
    expect([sexOf(HERO), sexOf(RIVAL)]).toEqual(['m', 'f']);
    expect([sexOf(dress(RIVAL, 'bone')), sexOf(strip(RIVAL, 'cabeca')), sexOf(mood(RIVAL, 'caido', 'fina')), sexOf(tweak(RIVAL, { pele: '#8d5a3b' }))]).toEqual(['f', 'f', 'f', 'f']);
    expect([sexOf({ ...RIVAL }), sexOf(structuredClone(RIVAL))]).toEqual([undefined, undefined]);
    expect(() => dress({ ...RIVAL }, 'bone')).toThrow('não diz o sexo');
    expect(() => strip(structuredClone(RIVAL), 'cabeca')).toThrow('não diz o sexo');
    expect(() => tweak({ ...HERO }, { pele: '#000000' })).toThrow('não diz o sexo');
    expect(sexOf(withSex({ ...RIVAL }, 'f'))).toBe('f');
    // tweak merges the hair and the face, and never touches the frozen original.
    const t = tweak(RIVAL, { pele: '#8d5a3b', cabelo: { cor: '#d8d2c4' } });
    expect([t.pele, t.cabelo]).toEqual(['#8d5a3b', { id: 'rabo', cor: '#d8d2c4' }]);
    expect([RIVAL.pele, RIVAL.cabelo.cor]).toEqual(['#c48a5e', '#151211']);
  });

  it('dress põe cabelo e barba (itens sem slot) no lugar deles, sem criar uma chave "undefined"', () => {
    const a = dress(HERO, 'raspado', 'bigode');
    expect([a.cabelo, a.barba]).toEqual([{ id: 'raspado', cor: HERO.cabelo.cor }, 'bigode']);
    expect(Object.keys(a.itens).sort()).toEqual(Object.keys(HERO.itens).sort());
    expect(dress(RIVAL, { id: 'penteadoTras', cores: ['#d8d2c4'] }).cabelo).toEqual({ id: 'penteadoTras', cor: '#d8d2c4' });
  });
});

describe('observador de arquivos do bake', () => {
  it('vê só public/: uma edição nas fontes nunca chega a um bake no meio', () => {
    for (const path of [REPO, join(REPO, 'public'), join(REPO, 'public', 'figurinhas', 'x.png')]) expect({ path, ignored: watchIgnored(path) }).toEqual({ path, ignored: false });
    for (const rel of ['client/dev/studio/zumbi.ts', 'client/world/hydrant.ts', 'shared/data/figurinhas/zumbi.json', 'server/index.ts', 'tools/bake-figurinhas.ts', 'vite.config.ts', 'package.json', 'publico/x.png'])
      for (const path of [join(REPO, rel), `${REPO.replace(/\\/g, '/')}/${rel}`]) expect({ path, ignored: watchIgnored(path) }).toEqual({ path, ignored: true });
  });
});
