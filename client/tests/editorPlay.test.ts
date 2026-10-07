// Play inside the editor without a screen (PF-6 Revisions 01, etapa 4): the toolbar's ▶ ❚❚ ■ (editing → playing →
// paused → playing → stopped), what each state allows (no edits, no shortcuts and no camera while playing; paused,
// the camera, the selection and the keys that only look), the editor given back at ■ exactly as it was at ▶ (the
// selection, the camera, the history and the map), and every game started let go once: at ■, at its own Exit, when
// it failed to start or when ■ came while it was loading, so playing and stopping again and again leaves no
// geometry or texture behind.
import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { MAP_FORMAT, type MapData } from '@shared/mapData';
import { EditorDocument, clone } from '../editor/document';
import { buttonsOf, cameraOn, editable, PlaySession, pickingOn, shortcutAllowed, transition, type GameRun, type PlayState } from '../editor/playMode';
import { shortcutOf, type EditorAction } from '../editor/shortcuts';

function map(): MapData {
  return {
    formato: MAP_FORMAT,
    nome: 'Play',
    cartao: { emoji: '🧪', cor: '#aabbcc' },
    ambiente: { ceu: {}, celula: 40, killY: -20 },
    pecas: [
      { id: 'chao', tipo: 'caixa', p: [0, -0.5, 0], params: { tamanho: [30, 1, 30], superficie: 'grama' } },
      { id: 'muro', tipo: 'caixa', p: [3, 0.5, 0], params: { tamanho: [1, 1, 4], superficie: 'concreto' } },
    ],
    arquivos: [],
    spawns: { a: [{ p: [0, 0.2, 0], yaw: 0 }], b: [{ p: [5, 0.2, 0], yaw: 0 }], ffa: [{ p: [0, 0.2, 5], yaw: 0 }] },
    bonecos: [],
    objetos: { coletaveis: [], bruxa: null, ratos: [], peixes: [] },
  };
}

/** A small editor: its document (locked while it plays), its selection and its camera. */
function editor() {
  const doc = new EditorDocument(map());
  const state = { selection: ['muro'] as string[], camera: { position: [1, 2, 3], yaw: 0.5, pitch: -0.3, distance: 10, ortho: false } };
  let play: PlayState = 'editando';
  return {
    doc,
    state,
    get play() {
      return play;
    },
    setPlay(s: PlayState) {
      play = s;
      doc.locked = !editable(s);
    },
    snapshot: {
      take: () => ({ selection: [...state.selection], camera: clone(state.camera), history: doc.history.size, data: JSON.stringify(doc.data) }),
      restore: (s: { selection: string[]; camera: typeof state.camera }) => {
        state.selection = [...s.selection];
        state.camera = clone(s.camera);
      },
    },
  };
}

/**
 * Games that make geometries and textures and let them go at dispose, counted as a renderer's info.memory does
 * (each object counted until its 'dispose' event).
 */
function games() {
  const memory = { geometries: 0, textures: 0 };
  const runs: (GameRun & { log: string[]; disposed: number })[] = [];
  const launch = async (): Promise<GameRun> => {
    const geos = [new THREE.BoxGeometry(), new THREE.SphereGeometry()];
    const tex = [new THREE.DataTexture(new Uint8Array(4), 1, 1)];
    for (const g of geos) {
      memory.geometries++;
      g.addEventListener('dispose', () => memory.geometries--);
    }
    for (const t of tex) {
      memory.textures++;
      t.addEventListener('dispose', () => memory.textures--);
    }
    const run = {
      log: [] as string[],
      disposed: 0,
      pause: () => run.log.push('pause'),
      resume: () => run.log.push('resume'),
      dispose: () => {
        run.disposed++;
        run.log.push('dispose');
        for (const g of geos) g.dispose();
        for (const t of tex) t.dispose();
      },
    };
    runs.push(run);
    return run;
  };
  return { memory, runs, launch };
}

describe('Play dentro do editor: os estados', () => {
  it('▶ joga, ❚❚ pausa, ▶ (ou ❚❚ de novo) continua, ■ para; o que não faz nada em cada estado', () => {
    expect(transition('editando', 'play')).toBe('jogando');
    expect(transition('jogando', 'pause')).toBe('pausado');
    expect(transition('pausado', 'play')).toBe('jogando');
    expect(transition('pausado', 'pause')).toBe('jogando');
    expect(transition('jogando', 'stop')).toBe('editando');
    expect(transition('pausado', 'stop')).toBe('editando');
    expect(transition('jogando', 'play')).toBeNull();
    expect(transition('editando', 'pause')).toBeNull();
    expect(transition('editando', 'stop')).toBeNull();
    expect(buttonsOf('editando')).toEqual({ play: { on: false, enabled: true }, pause: { on: false, enabled: false }, stop: { on: false, enabled: false } });
    expect(buttonsOf('jogando')).toEqual({ play: { on: true, enabled: false }, pause: { on: false, enabled: true }, stop: { on: false, enabled: true } });
    expect(buttonsOf('pausado')).toEqual({ play: { on: true, enabled: true }, pause: { on: true, enabled: true }, stop: { on: false, enabled: true } });
  });

  it('jogando: sem edição, sem atalhos e sem câmera do editor; pausado: câmera, seleção e as teclas que só olham', () => {
    const all: EditorAction[] = ['undo', 'redo', 'hand', 'translate', 'rotate', 'scale', 'rect', 'focus', 'rename', 'remove', 'clear', 'duplicate', 'copy', 'paste', 'selectAll', 'group'];
    expect(all.every((a) => shortcutAllowed('editando', a))).toBe(true);
    expect(all.some((a) => shortcutAllowed('jogando', a))).toBe(false);
    expect(all.filter((a) => shortcutAllowed('pausado', a)).sort()).toEqual(['clear', 'copy', 'focus', 'selectAll']);
    expect([editable('editando'), editable('jogando'), editable('pausado')]).toEqual([true, false, false]);
    expect([cameraOn('editando'), cameraOn('jogando'), cameraOn('pausado')]).toEqual([true, false, true]);
    expect([pickingOn('editando'), pickingOn('jogando'), pickingOn('pausado')]).toEqual([true, false, true]);
    // Ctrl+Z and Delete while paused: the key is read, but the state says no.
    const key = (code: string, ctrl = false) => shortcutOf({ code, key: '', ctrlKey: ctrl, metaKey: false, shiftKey: false, altKey: false }, { typing: false, flying: false })!;
    expect(shortcutAllowed('pausado', key('KeyZ', true))).toBe(false);
    expect(shortcutAllowed('pausado', key('Delete'))).toBe(false);
    expect(shortcutAllowed('pausado', key('KeyF'))).toBe(true);
  });
});

describe('Play dentro do editor: a sessão', () => {
  it('editando → jogando → pausado → jogando → parado, e o jogo recebe pausa, continuação e fim', async () => {
    const ed = editor();
    const g = games();
    const s = new PlaySession(ed.snapshot, g.launch);
    const seen: PlayState[] = [];
    s.onState = (st) => {
      seen.push(st);
      ed.setPlay(st);
    };
    await s.press('play');
    expect(s.state).toBe('jogando');
    expect(g.runs).toHaveLength(1);
    await s.press('play'); // already playing: nothing
    await s.press('pause');
    await s.press('play');
    await s.press('pause');
    await s.press('pause');
    await s.press('stop');
    expect(seen).toEqual(['jogando', 'pausado', 'jogando', 'pausado', 'jogando', 'editando']);
    expect(g.runs[0].log).toEqual(['pause', 'resume', 'pause', 'resume', 'dispose']);
    expect(s.game).toBeNull();
  });

  it('o ■ devolve o editor como estava no ▶: seleção, câmera, histórico e o mapa (as edições tentadas no Play não entram)', async () => {
    const ed = editor();
    const g = games();
    const s = new PlaySession(ed.snapshot, g.launch);
    s.onState = (st) => ed.setPlay(st);
    ed.doc.editPiece({ ...ed.doc.piece('muro')!, p: [4, 0.5, 0] });
    const at = ed.snapshot.take();
    await s.press('play');
    // Playing: an edit from any path is refused by the document.
    ed.doc.editPiece({ ...ed.doc.piece('muro')!, p: [9, 9, 9] });
    ed.doc.removePieces(['chao']);
    expect(ed.doc.undo()).toBe(false);
    await s.press('pause');
    // Paused: the camera moves and the selection changes (to look), still no edits.
    ed.state.camera = { position: [50, 60, 70], yaw: 2, pitch: -1, distance: 3, ortho: true };
    ed.state.selection = ['chao'];
    ed.doc.setPieces([]);
    expect(ed.doc.history.size).toBe(1);
    await s.press('stop');
    expect(ed.snapshot.take()).toEqual(at);
    // Editing again: edits and undo work.
    expect(ed.doc.locked).toBe(false);
    expect(ed.doc.undo()).toBe(true);
    expect(ed.doc.piece('muro')!.p).toEqual([3, 0.5, 0]);
  });

  it('Play e Stop várias vezes: cada jogo é solto uma vez e a memória volta a zero (sem vazamento)', async () => {
    const ed = editor();
    const g = games();
    const s = new PlaySession(ed.snapshot, g.launch);
    s.onState = (st) => ed.setPlay(st);
    for (let i = 0; i < 6; i++) {
      await s.press('play');
      expect(g.memory).toEqual({ geometries: 2, textures: 1 });
      if (i % 2) await s.press('pause');
      await s.press('stop');
      expect(g.memory).toEqual({ geometries: 0, textures: 0 });
    }
    expect(g.runs).toHaveLength(6);
    expect(g.runs.every((r) => r.disposed === 1)).toBe(true);
  });

  it('■ enquanto o jogo carrega: o jogo pronto depois é solto na hora; ❚❚ enquanto carrega: começa pausado', async () => {
    const ed = editor();
    const g = games();
    let release: () => void = () => {};
    const signals: AbortSignal[] = [];
    const slow = (signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<void>((r) => (release = r)).then(g.launch);
    };
    const s = new PlaySession(ed.snapshot, slow);
    s.onState = (st) => ed.setPlay(st);
    const started = s.press('play');
    await s.press('stop');
    expect(s.state).toBe('editando');
    // The page still loading is told to go (the Game tab removes it).
    expect(signals[0].aborted).toBe(true);
    release();
    await started;
    expect(g.runs).toHaveLength(1);
    expect(g.runs[0].disposed).toBe(1);
    expect(g.memory).toEqual({ geometries: 0, textures: 0 });

    const again = s.press('play');
    await s.press('pause');
    expect(s.state).toBe('pausado');
    release();
    await again;
    expect(signals[1].aborted).toBe(false);
    expect(g.runs[1].log).toEqual(['pause']);
    await s.press('play');
    expect(g.runs[1].log).toEqual(['pause', 'resume']);
    await s.press('stop');
    expect(g.runs[1].disposed).toBe(1);
  });

  it('o jogo que não sobe volta a editar (com o editor restaurado); o Sair do próprio jogo é um ■', async () => {
    const ed = editor();
    const s = new PlaySession(ed.snapshot, async () => {
      throw new Error('sem WebGL');
    });
    const errors: unknown[] = [];
    s.onError = (e) => errors.push(e);
    s.onState = (st) => ed.setPlay(st);
    await s.press('play');
    expect(s.state).toBe('editando');
    expect(ed.doc.locked).toBe(false);
    expect(String(errors[0])).toContain('sem WebGL');

    const g = games();
    const s2 = new PlaySession(ed.snapshot, g.launch);
    s2.onState = (st) => ed.setPlay(st);
    await s2.press('play');
    s2.ended();
    expect(s2.state).toBe('editando');
    expect(g.runs[0].disposed).toBe(1);
    s2.ended();
    expect(g.runs[0].disposed).toBe(1);
  });
});
