// The Project panel's thumbnails without a screen (PF-6 Revisions 01, etapa 4): the cache's keys and signatures
// (a kept picture is used while the catalog's entry, the new piece's params, the game's version and the drawing's
// format are the same; any of them changed, it's drawn again), forgetting kinds the catalog lost, and the drawing
// line (one at a time, in the page's spare moments, the folder on screen first, the same asset once, a failure not
// stopping the rest, held while the map is played).
import { describe, expect, it } from 'bun:test';
import { MAP_CATALOG } from '@shared/mapCatalog';
import { ThumbCache, hashText, memoryThumbStore, stableJson, thumbKey, thumbSignature, THUMB_FORMAT, type ThumbRecord } from '../editor/thumbCache';
import { ThumbQueue } from '../editor/thumbQueue';

const rec = (sig: string): ThumbRecord => ({ sig, blob: null, em: 1 });

describe('cache das miniaturas', () => {
  it('a chave diz o que a miniatura mostra: um tipo do catálogo, um modelo GLB pelo hash, um marcador', () => {
    expect(thumbKey({ kind: 'peca', tipo: 'caixa' })).toBe('peca:caixa');
    expect(thumbKey({ kind: 'glb', sha256: 'ab12' })).toBe('glb:ab12');
    expect(thumbKey({ kind: 'marcador', marker: 'spawnA' })).toBe('marcador:spawnA');
  });

  it('a assinatura não depende da ordem das chaves, e muda com o catálogo, os parâmetros, a versão e o formato', () => {
    expect(stableJson({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe(stableJson({ a: [1, { c: 3, d: 2 }], b: 1 }));
    const entry = MAP_CATALOG.caixa;
    const params = { tamanho: [1, 1, 1], superficie: 'concreto' };
    const sig = thumbSignature({ entry, params }, 'abc123');
    expect(thumbSignature({ params, entry }, 'abc123')).toBe(sig);
    // The catalog's entry changed (a new param, another default).
    expect(thumbSignature({ entry: { ...entry, nome: { pt: 'Caixote', en: 'Crate' } }, params }, 'abc123')).not.toBe(sig);
    // The new piece's params changed (another example in the official maps).
    expect(thumbSignature({ entry, params: { ...params, tamanho: [2, 1, 1] } }, 'abc123')).not.toBe(sig);
    // Another version of the game, another way of drawing.
    expect(thumbSignature({ entry, params }, 'def456')).not.toBe(sig);
    expect(thumbSignature({ entry, params }, 'abc123', THUMB_FORMAT + 1)).not.toBe(sig);
    expect(hashText('a')).not.toBe(hashText('b'));
  });

  it('acerto só com a assinatura de agora: a guardada com outra conta como ausente e é trocada', async () => {
    const store = memoryThumbStore();
    const cache = new ThumbCache(store);
    expect(await cache.lookup('peca:caixa', 's1')).toBeNull();
    await cache.save('peca:caixa', { ...rec('s1'), box: [-0.5, 0, -0.5, 0.5, 1, 0.5] });
    expect(await cache.lookup('peca:caixa', 's1')).toMatchObject({ sig: 's1', box: [-0.5, 0, -0.5, 0.5, 1, 0.5] });
    // The catalog or the game changed: stale.
    expect(await cache.lookup('peca:caixa', 's2')).toBeNull();
    await cache.save('peca:caixa', rec('s2'));
    expect(store.map.size).toBe(1);
    expect(await cache.lookup('peca:caixa', 's2')).not.toBeNull();
    expect(await cache.lookup('peca:caixa', 's1')).toBeNull();
  });

  it('tipos que saíram do catálogo são esquecidos; modelos GLB ficam (o mapa pode voltar a usá-los)', async () => {
    const store = memoryThumbStore();
    const cache = new ThumbCache(store);
    for (const k of ['peca:caixa', 'peca:sumiu', 'marcador:spawnA', 'glb:ff00']) await cache.save(k, rec('s'));
    expect(await cache.prune(new Set(['peca:caixa', 'marcador:spawnA']))).toBe(1);
    expect([...store.map.keys()].sort()).toEqual(['glb:ff00', 'marcador:spawnA', 'peca:caixa']);
  });
});

/** A line whose spare moments are given by hand, and whose drawings end when the test says. */
function line() {
  const slots: (() => void)[] = [];
  const drawing: { key: string; end: (ok: boolean) => void }[] = [];
  const started: string[] = [];
  const q = new ThumbQueue<string>(
    (key) =>
      new Promise<void>((resolve, reject) => {
        started.push(key);
        drawing.push({ key, end: (ok) => (ok ? resolve() : reject(new Error('falhou'))) });
      }),
    (run) => slots.push(run),
  );
  /** Gives the page a spare moment (runs what was waiting for one). */
  const idle = async () => {
    const run = slots.shift();
    run?.();
    await Promise.resolve();
  };
  /** The drawing under way ends. */
  const finish = async (ok = true) => {
    drawing.shift()?.end(ok);
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  return { q, slots, drawing, started, idle, finish };
}

describe('fila de geração das miniaturas', () => {
  it('uma de cada vez, cada uma num momento livre da página; a mesma pedida duas vezes é desenhada uma vez', async () => {
    const { q, slots, started, idle, finish } = line();
    q.request('a');
    q.request('b');
    q.request('a');
    expect(started).toEqual([]);
    expect(slots.length).toBe(1);
    await idle();
    expect(started).toEqual(['a']);
    // Nothing else starts while one is being drawn.
    expect(slots.length).toBe(0);
    q.request('c');
    expect(slots.length).toBe(0);
    await finish();
    expect(q.done.has('a')).toBe(true);
    expect(slots.length).toBe(1);
    await idle();
    await finish();
    await idle();
    await finish();
    expect(started).toEqual(['a', 'b', 'c']);
    // Drawn already: asked again, nothing.
    q.request('a');
    expect(q.pending).toBe(0);
    expect(slots.length).toBe(0);
  });

  it('a pasta na tela vai primeiro; trocar de pasta baixa as outras de volta', async () => {
    const { q, started, idle, finish } = line();
    for (const k of ['a', 'b', 'c', 'd']) q.request(k);
    q.focus(['c', 'd']);
    await idle();
    expect(started).toEqual(['c']);
    q.lower();
    q.focus(['b']);
    await finish();
    await idle();
    await finish();
    await idle();
    expect(started).toEqual(['c', 'b', 'a']);
  });

  it('uma falha não para a fila; pedir de novo depois de mudar o asset (retry) desenha outra vez', async () => {
    const { q, started, idle, finish } = line();
    const seen: [string, boolean][] = [];
    q.onDone = (k, ok) => seen.push([k, ok]);
    q.request('a');
    q.request('b');
    await idle();
    await finish(false);
    await idle();
    await finish(true);
    expect(seen).toEqual([
      ['a', false],
      ['b', true],
    ]);
    expect(q.failed.has('a')).toBe(true);
    q.request('a');
    expect(q.pending).toBe(0);
    q.retry('a');
    await idle();
    expect(started).toEqual(['a', 'b', 'a']);
  });

  it('segura durante o Play (o desenho em curso termina) e continua depois', async () => {
    const { q, slots, started, idle, finish } = line();
    q.request('a');
    q.request('b');
    await idle();
    q.hold(true);
    await finish();
    expect(slots.length).toBe(0);
    expect(q.pending).toBe(1);
    q.request('c');
    expect(slots.length).toBe(0);
    q.hold(false);
    expect(slots.length).toBe(1);
    await idle();
    expect(started).toEqual(['a', 'b']);
    q.clear();
    await finish();
    expect(q.pending).toBe(0);
    expect(slots.length).toBe(0);
  });
});
