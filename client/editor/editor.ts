// The map editor inside the game (PF-6): opened instead of a match (boot() in client/main.ts calls runEditor and
// returns: no input, player or HUD). It loads a saved version of a map (or starts a new one), builds it with the
// game's own loader in its editor mode, and runs its own loop: a free camera, picking with a click, the gizmo
// (move, turn, scale on a 0.5 m and 15° grid; Shift held for free moves), undo and redo, the palette, the
// properties panel, the markers, the ends and holes of walls, GLB models from the computer, the live budget
// bar, testing the map (the training range, or the zumbi match on a zumbi-only map) and saving it. Every edit
// keeps a draft in IndexedDB (P40), offered back when the map opens again; saving forgets it. Leaving reloads
// the page.
import * as THREE from 'three';
import { MAP_FORMAT, type MapData, type Peca, type Vec3 } from '@shared/mapData';
import { OFFICIAL_MAPS, isOfficialMap } from '@shared/maps';
import { MAP_CATALOG } from '@shared/mapCatalog';
import type { Papel } from '@shared/roles';
import { applyAtmosphere, type RenderContext } from '../render/renderer';
import type { Physics } from '../world/physics';
import { atmosphereOf, loadOfficialMap } from '../world/mapLoader';
import { api, fetchMe } from '../net/api';
import { deleteDraft, fetchMapVersion, loadDraft, saveDraft } from '../net/maps';
import { EditorDocument, clone, newPieceId, type Rest } from './document';
import { historyKey } from './history';
import { MapView } from './view';
import { FlyCamera, typing } from './flyCamera';
import { Selection, type Selected } from './selection';
import { Gizmo, GRID } from './gizmo';
import { Markers, addMarker, markerPlace, markerTurns, removeMarker, setMarkerPlace, type MarkerKind } from './markers';
import { LinearHandles, hasHandles, moveHandle } from './linearHandles';
import { Inspector } from './inspector';
import { Palette } from './palette';
import { BudgetBar } from './budgetBar';
import { applyHandle, handleBase, handleDelta, handleWorld, hasLinked, moveLinked, scalable } from './transform';
import { duplicatePiece, newPiece, removalRest, templatesFrom } from './create';
import { fileEntry, pickGlb, uploadGlb } from './glbImport';
import { showSaveDialog, type MapTarget } from './save';
import { draftKey, handOff, type EditorMap } from './launch';
import { draftIsNewer, recoveredBase, type Draft } from './recovery';
import { injectEditorStyle } from './style';
import { et } from './strings';
import type { MapaResumo, TipoMapa } from '@shared/mapData';

export interface EditorOptions {
  ctx: RenderContext;
  physics: Physics;
  /** The saved version to open (versao 0: the current one), or null for a new map. */
  mapa: EditorMap;
  /** A draft to open instead (coming back from testing it). */
  rascunho?: { chave: string; tipo: TipoMapa };
}

/** A new map: a lawn, a sunny day with clouds, one spawn of each kind. */
export function blankMap(): MapData {
  return {
    formato: MAP_FORMAT,
    nome: et('newMap'),
    cartao: { emoji: '🗺️', cor: '#cfe8ff' },
    ambiente: { ceu: { cupula: { tipo: 'nuvens' } }, celula: 40, killY: -20 },
    pecas: [{ id: 'chao', tipo: 'caixa', p: [0, -0.5, 0], params: { tamanho: [40, 1, 40], superficie: 'grama', cor: 0x6cbf4a } }],
    arquivos: [],
    spawns: { a: [{ p: [0, 0, -15], yaw: Math.PI }], b: [{ p: [0, 0, 15], yaw: 0 }], ffa: [{ p: [10, 0, 0], yaw: Math.PI / 2 }] },
    bonecos: [],
    objetos: { coletaveis: [], bruxa: null, ratos: [], peixes: [] },
  };
}

/**
 * Where the map comes from: the draft being tested, a saved version, an official map shipped with the game, or a
 * new one. A draft kept from an earlier visit and newer than the version (P40) is offered back first (`ask`:
 * true to recover it); turned down, or older than the version, it's forgotten.
 */
async function openMap(o: EditorOptions, ask: (d: Draft, isNew: boolean) => Promise<boolean>): Promise<{ data: MapData; target: MapTarget; restored: boolean }> {
  if (o.rascunho) {
    const draft = await loadDraft(o.rascunho.chave);
    if (draft) return { data: draft.dados, target: { id: o.mapa?.id ?? null, versao: o.mapa?.versao ?? null, tipo: o.rascunho.tipo }, restored: true };
  }
  const key = draftKey(o.mapa);
  const kept = await loadDraft(key);
  /** The kept draft, if it's newer than `current` and the editor wants it back. */
  const recover = async (current: { atualizadoEm: string } | null) => {
    if (kept && draftIsNewer(kept, current) && (await ask(kept, !o.mapa))) return kept;
    if (kept) void deleteDraft(key);
    return null;
  };
  if (!o.mapa) {
    const d = await recover(null);
    return { data: d ? clone(d.dados) : blankMap(), target: { id: null, versao: null, tipo: 'comunidade' }, restored: !!d };
  }
  const { id } = o.mapa;
  let tipo: TipoMapa = isOfficialMap(id) ? 'oficial' : 'comunidade';
  let versao = o.mapa.versao;
  let s: MapaResumo;
  try {
    s = await api<MapaResumo>('GET', `/api/mapas/${encodeURIComponent(id)}`);
  } catch (err) {
    // Without the server, an official map still opens from the game's own copy (to look at and test; saving needs the server).
    if (!isOfficialMap(id)) throw err;
    const d = await recover(null);
    return { data: clone(d ? d.dados : await loadOfficialMap(id)), target: { id, versao: versao || 1, tipo }, restored: !!d };
  }
  tipo = s.tipo;
  if (!versao) versao = s.versao;
  const d = await recover(s);
  // A recovered draft saves over the version it was edited from: if another was saved since, the 409 says so.
  if (d) return { data: clone(d.dados), target: { id, versao: recoveredBase(d, versao), tipo }, restored: true };
  return { data: clone(await fetchMapVersion(id, versao)), target: { id, versao, tipo }, restored: false };
}

/** A question over the editor with two answers: resolves true for the first. */
function choose(host: HTMLElement, title: string, text: string, yes: string, no: string): Promise<boolean> {
  const box = document.createElement('div');
  box.className = 'ed-modal';
  const dialog = document.createElement('div');
  dialog.className = 'ed-dialog';
  const h = document.createElement('h3');
  h.textContent = title;
  const p = document.createElement('p');
  p.textContent = text;
  const actions = document.createElement('div');
  actions.className = 'ed-actions';
  const noBtn = document.createElement('button');
  noBtn.textContent = no;
  const yesBtn = document.createElement('button');
  yesBtn.className = 'ed-primary';
  yesBtn.textContent = yes;
  actions.append(noBtn, yesBtn);
  dialog.append(h, p, actions);
  box.append(dialog);
  host.append(box);
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      box.remove();
      resolve(v);
    };
    yesBtn.onclick = () => done(true);
    noBtn.onclick = () => done(false);
  });
}

const snap = (v: number) => Math.round(v / GRID) * GRID;
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

export async function runEditor(o: EditorOptions): Promise<void> {
  const { ctx, physics } = o;
  injectEditorStyle();
  const root = document.createElement('div');
  root.id = 'editor';
  root.innerHTML = `
    <div class="ed-panel ed-top">
      <span class="ed-title"></span>
      <button data-a="undo"></button><button data-a="redo"></button>
      <button data-a="translate"></button><button data-a="rotate"></button><button data-a="scale"></button>
      <button data-a="focus"></button><button data-a="duplicate"></button><button data-a="remove"></button>
      <span class="ed-spacer"></span>
      <button data-a="test"></button><button data-a="save" class="ed-primary"></button><button data-a="exit"></button>
    </div>
    <div class="ed-panel ed-left"></div>
    <div class="ed-panel ed-right"></div>
    <div class="ed-panel ed-bottom"><div class="ed-budget"></div><span class="ed-status"></span><span class="ed-hint"></span></div>
    <div class="ed-loading"></div>`;
  document.body.append(root);
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const button = (a: string) => $<HTMLButtonElement>(`button[data-a="${a}"]`);
  const LABEL: Record<string, Parameters<typeof et>[0]> = { undo: 'undo', redo: 'redo', translate: 'move', rotate: 'rotate', scale: 'scale', focus: 'focus', duplicate: 'duplicate', remove: 'remove', test: 'test', save: 'save', exit: 'exit' };
  for (const [a, k] of Object.entries(LABEL)) {
    const b = button(a);
    const text = et(k);
    b.textContent = text.replace(/ \(.*\)$/, '');
    b.title = text;
  }
  $('.ed-hint').textContent = et('hint');
  const loading = $<HTMLElement>('.ed-loading');
  loading.textContent = et('loading');

  let statusTimer: ReturnType<typeof setTimeout> | null = null;
  const status = (text: string, bad = false) => {
    const el = $<HTMLElement>('.ed-status');
    el.textContent = text;
    el.className = `ed-status${bad ? ' ed-err' : ''}`;
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => (el.textContent = ''), 6000);
  };

  // --- The map --------------------------------------------------------------------------------------------
  let opened: Awaited<ReturnType<typeof openMap>>;
  const askDraft = (d: Draft, isNew: boolean) => {
    const quando = new Date(d.em).toLocaleString();
    return choose(root, et('draftTitle'), et(isNew ? 'draftTextNew' : 'draftText', { quando }), et('draftRecover'), et('draftDiscard'));
  };
  try {
    opened = await openMap(o, askDraft);
  } catch (err) {
    loading.textContent = et('loadFailed', { erro: String((err as Error)?.message ?? err) });
    const back = document.createElement('button');
    back.textContent = et('exit');
    back.onclick = () => location.reload();
    loading.append(document.createElement('br'), back);
    return;
  }
  const target = opened.target;
  let restored = opened.restored;
  const doc = new EditorDocument(opened.data);
  /** The draft's key now (a new map's changes to its id once saved). */
  const keyNow = () => draftKey(target.id ? { id: target.id, versao: target.versao ?? 0 } : null);
  const papeis: Papel[] = (await fetchMe()).me?.papeis ?? [];
  const title = () => ($('.ed-title').textContent = `${et('title')} · ${doc.data.cartao.emoji} ${doc.data.nome}${target.id ? ` (${target.id} v${target.versao})` : ''}${doc.dirty || restored ? ' •' : ''}`);

  const sky = () => {
    const a = atmosphereOf(doc.data);
    if (a) applyAtmosphere(ctx, a);
    const ext = doc.data.ambiente.sombra ?? 48;
    const sc = ctx.sun.shadow.camera;
    sc.left = sc.bottom = -ext;
    sc.right = sc.top = ext;
    sc.far = 150;
    sc.updateProjectionMatrix();
  };
  sky();
  let view = new MapView(ctx.scene, physics, ctx.renderer, doc);
  view.onError = (id, err) => status(et('buildFailed', { id, e: String((err as Error)?.message ?? err) }), true);
  await view.init();
  loading.remove();

  const camera = ctx.camera;
  const canvas = ctx.renderer.domElement;
  const fly = new FlyCamera(camera, canvas);
  {
    const box = view.bounds();
    const sp = doc.data.spawns.ffa[0]?.p ?? [0, 0, 0];
    if (box.isEmpty()) fly.place(new THREE.Vector3(sp[0], sp[1] + 12, sp[2] + 18), new THREE.Vector3(...sp));
    else {
      const c = box.getCenter(new THREE.Vector3());
      fly.place(new THREE.Vector3(c.x, Math.min(60, box.max.y + 20), box.max.z + 10), c);
    }
  }
  const markers = new Markers(ctx.scene);
  markers.draw(doc.data);
  const handles = new LinearHandles(ctx.scene);
  const gizmo = new Gizmo(camera, canvas, ctx.scene);
  const selection = new Selection(
    ctx.scene,
    camera,
    canvas,
    () => [handles.group, markers.group, view.root],
    () => gizmo.hot(),
    (s) => (s.kind === 'marcador' ? markers.get(s.key) : view.group(s.kind === 'peca' ? s.id : s.id)),
  );
  // Clicking the 3D view takes the keyboard back from the panels.
  canvas.addEventListener('pointerdown', () => (document.activeElement as HTMLElement | null)?.blur?.());

  const inspector = new Inspector($('.ed-right'), {
    editPiece: (next, rest) => commitPiece(next, rest),
    editRest: (f) => doc.editRest(f),
    markerRemoved: () => selection.set(null),
  });
  const budget = new BudgetBar($('.ed-budget'), () => doc.data, ctx.renderer);

  // --- Selection and the gizmo -------------------------------------------------------------------------------
  /** Where the gizmo's handle sat on the selected piece before its pose (fixed for one drag). */
  let base = new THREE.Matrix4();
  const selectedPiece = (): Peca | undefined => {
    const s = selection.current;
    return s && s.kind !== 'marcador' ? doc.piece(s.id) : undefined;
  };

  const attach = () => {
    const s = selection.current;
    if (gizmo.dragging) return;
    if (!s) {
      handles.show(null);
      gizmo.attach(null);
      inspector.showMap(doc.data);
      return;
    }
    if (s.kind === 'marcador') {
      handles.show(null);
      const at = markerPlace(doc.data, s.key);
      if (!at) return selection.set(null);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(...at.p), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), at.yaw ?? 0), new THREE.Vector3(1, 1, 1));
      gizmo.attach({ world: m, rotate: markerTurns(s.key), scale: false });
      inspector.showMarker(s.key, doc.data);
      return;
    }
    const peca = doc.piece(s.id);
    if (!peca) return selection.set(null);
    handles.show(hasHandles(peca) ? peca : null);
    if (s.kind === 'ponta') {
      const h = handles.world(s.key);
      if (!h) return selection.set({ kind: 'peca', id: s.id });
      gizmo.attach({ world: h.world, rotate: false, scale: false, axis: h.axis ?? undefined });
    } else {
      base = handleBase(peca, view.pivot(peca));
      gizmo.attach({ world: handleWorld(peca, base), rotate: true, scale: scalable(peca) });
    }
    inspector.showPiece(peca, doc.data);
  };
  selection.onChange = () => attach();

  const preview = (s: Selected, world: THREE.Matrix4, start: THREE.Matrix4) => {
    if (s.kind === 'peca') {
      const g = view.group(s.id);
      if (!g) return;
      g.matrixAutoUpdate = false;
      g.matrix.copy(world.clone().multiply(start.clone().invert()));
      g.matrixWorldNeedsUpdate = true;
      selection.refresh();
    } else if (s.kind === 'marcador') {
      const m = markers.get(s.key);
      if (m) world.decompose(m.position, m.quaternion, new THREE.Vector3());
    } else {
      const local = handles.toLocal(world);
      const mesh = handles.group.children.find((c) => c.userData.ponta === s.key);
      mesh?.position.set(...local);
    }
  };
  gizmo.onDrag = (world, start) => selection.current && preview(selection.current, world, start);
  gizmo.onEnd = (start, world) => {
    const s = selection.current;
    if (!s) return;
    if (s.kind === 'peca') {
      const g = view.group(s.id);
      if (g) {
        g.matrix.identity();
        g.matrixWorldNeedsUpdate = true;
      }
    }
    if (start.equals(world)) return attach();
    if (s.kind === 'peca') {
      const peca = doc.piece(s.id);
      if (!peca) return;
      const next = applyHandle(peca, base, world);
      const delta = handleDelta(start, world);
      doc.editPiece(next, hasLinked(peca, doc.data) ? (r) => moveLinked(r, peca, delta) : undefined);
    } else if (s.kind === 'marcador') {
      const t = new THREE.Vector3();
      const q = new THREE.Quaternion();
      world.decompose(t, q, new THREE.Vector3());
      const yaw = markerTurns(s.key) ? new THREE.Euler().setFromQuaternion(q, 'YXZ').y : undefined;
      doc.editRest((r) => setMarkerPlace(r, s.key, { p: [t.x, t.y, t.z], yaw }));
    } else {
      const peca = doc.piece(s.id);
      if (peca) doc.editPiece(moveHandle(peca, s.key, handles.toLocal(world)));
    }
  };

  /** A piece edited in the panel: the server's places tied to it follow when it moves. */
  const commitPiece = (next: Peca, rest?: (r: Rest) => void) => {
    const peca = doc.piece(next.id);
    if (peca && !rest && hasLinked(peca, doc.data)) {
      const pivot = view.pivot(peca);
      const from = handleWorld(peca, handleBase(peca, pivot));
      const to = handleWorld(next, handleBase(next, pivot));
      const delta = handleDelta(from, to);
      rest = (r) => moveLinked(r, peca, delta);
    }
    doc.editPiece(next, rest);
  };

  // --- Edits reach the scene ---------------------------------------------------------------------------------
  let ambiente = JSON.stringify(doc.data.ambiente);
  let palette: Palette;
  view.onRebuilt = () => {
    selection.refresh();
    attach();
  };
  // P40: every edit keeps the draft (a moment after it, so a burst of edits writes once); back at the saved
  // state, it's forgotten.
  let draftTimer: ReturnType<typeof setTimeout> | null = null;
  const keepDraft = () => {
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      draftTimer = null;
      if (doc.dirty || restored) void saveDraft(keyNow(), doc.data, target.versao);
      else void deleteDraft(keyNow());
    }, 150);
  };
  const forgetDraft = (...keys: string[]) => {
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = null;
    return Promise.all(keys.map((k) => deleteDraft(k)));
  };
  doc.onChange((c) => {
    title();
    keepDraft();
    budget.schedule();
    const amb = JSON.stringify(doc.data.ambiente);
    if (amb !== ambiente) {
      // The sky and the shared systems are the map's: it's built again whole.
      ambiente = amb;
      void reloadView();
    } else if (c.ids.size) void view.rebuild(c.ids);
    if (c.resto) {
      markers.draw(doc.data);
      if (!c.ids.size) attach();
    }
    palette.render();
    button('undo').disabled = !doc.history.canUndo;
    button('redo').disabled = !doc.history.canRedo;
  });

  const reloadView = async () => {
    await view.idle();
    // Takes the old map out of the scene and the physics world, then builds the new one.
    view.dispose();
    sky();
    view = new MapView(ctx.scene, physics, ctx.renderer, doc);
    view.onError = (id, err) => status(et('buildFailed', { id, e: String((err as Error)?.message ?? err) }), true);
    view.onRebuilt = () => {
      selection.refresh();
      attach();
    };
    await view.init();
    selection.refresh();
    attach();
  };

  // --- Adding, duplicating and deleting ----------------------------------------------------------------------
  let templates: Map<string, Peca> | null = null;
  const templatesReady = Promise.all(OFFICIAL_MAPS.map((id) => loadOfficialMap(id))).then((maps) => (templates = templatesFrom(maps)));

  /** Where new things land: what's under the middle of the screen, on the grid. */
  const dropPoint = (): Vec3 => {
    const r = canvas.getBoundingClientRect();
    const p = selection.dropPoint(r.left + r.width / 2, r.top + r.height / 2, view.root);
    return [snap(p.x), r4(p.y), snap(p.z)];
  };

  const addPiece = async (tipo: string) => {
    await templatesReady;
    const at = dropPoint();
    const made = newPiece(doc.data, tipo, at, templates?.get(tipo));
    if (!made) return status(et('limitReached', { nome: MAP_CATALOG[tipo]?.nome.pt ?? tipo }), true);
    if (made.byPose) {
      // Its example builds where it was in its map: find where, and pose it so its middle stands on the drop point.
      const box = await view.probe(made.peca);
      if (box) {
        const c = box.getCenter(new THREE.Vector3());
        made.peca.pose = { p: [r4(at[0] - c.x), r4(at[1] - box.min.y), r4(at[2] - c.z)], r: [0, 0, 0] };
      }
    }
    doc.addPieces([made.peca], made.rest);
    await view.idle();
    selection.set({ kind: 'peca', id: made.peca.id });
  };

  const addMarkerAt = (kind: MarkerKind) => {
    let key = null as string | null;
    const at = dropPoint();
    doc.editRest((r) => (key = addMarker(r, kind, at)));
    if (key) selection.set({ kind: 'marcador', key });
  };

  const importGlb = async (picked?: File) => {
    const file = picked ?? (await pickGlb());
    if (!file) return;
    status(et('glbUploading', { nome: file.name }));
    try {
      const up = await uploadGlb(file);
      const { id, isNew } = fileEntry(doc.data, file.name, up);
      const peca: Peca = { id: newPieceId(doc.data, 'glb'), tipo: 'glb', p: dropPoint(), params: { arquivo: id } };
      doc.addPieces([peca], isNew ? (r) => r.arquivos.push({ id, url: up.url, sha256: up.sha256, bytes: up.bytes }) : undefined);
      status(et('glbDone', { nome: file.name }));
      await view.idle();
      selection.set({ kind: 'peca', id: peca.id });
    } catch (err) {
      status(String((err as Error)?.message ?? err), true);
    }
  };

  const glbPiece = async (file: string) => {
    const peca: Peca = { id: newPieceId(doc.data, 'glb'), tipo: 'glb', p: dropPoint(), params: { arquivo: file } };
    doc.addPieces([peca]);
    await view.idle();
    selection.set({ kind: 'peca', id: peca.id });
  };

  palette = new Palette($('.ed-left'), { piece: (t) => void addPiece(t), marker: addMarkerAt, importGlb: () => void importGlb(), glbPiece: (f) => void glbPiece(f) }, () => doc.data);

  const duplicate = async () => {
    const peca = selectedPiece();
    if (!peca) return;
    const made = duplicatePiece(doc.data, peca);
    if (!made) return status(et('limitReached', { nome: MAP_CATALOG[peca.tipo]?.nome.pt ?? peca.tipo }), true);
    doc.addPieces([made.peca], made.rest, doc.indexOf(peca.id) + 1);
    await view.idle();
    selection.set({ kind: 'peca', id: made.peca.id });
  };

  const remove = () => {
    const s = selection.current;
    if (!s) return;
    if (s.kind === 'marcador') {
      const probe = clone(doc.data);
      if (!removeMarker(probe, s.key)) return;
      doc.editRest((r) => removeMarker(r, s.key));
    } else doc.removePieces([s.id], removalRest(doc.data, [s.id]));
    selection.set(null);
  };

  const focus = () => {
    const s = selection.current;
    if (!s) return fly.frame(view.bounds());
    const o = s.kind === 'marcador' ? markers.get(s.key) : view.group(s.id);
    if (o) fly.frame(new THREE.Box3().setFromObject(o));
  };

  // --- Test and save ------------------------------------------------------------------------------------------
  const test = async () => {
    if (budget.state.kind === 'invalido') return status(et('testInvalid'), true);
    status(et('testing'));
    const chave = keyNow();
    if (draftTimer) clearTimeout(draftTimer);
    if (!(await saveDraft(chave, doc.data, target.versao))) return status(et('errOther', { e: 'IndexedDB' }), true);
    handOff({ acao: 'testar', mapa: target.id ? { id: target.id, versao: target.versao ?? 0 } : null, tipo: target.tipo, chave });
    location.reload();
  };

  const save = async () => {
    if (!budget.fits) return;
    const saved = await showSaveDialog({
      host: root,
      data: () => doc.data,
      target,
      papeis,
      apply: (m) =>
        doc.editRest((r) => {
          r.nome = m.nome.trim();
          r.cartao = { emoji: m.emoji.trim(), cor: m.cor };
          if (m.zumbi) r.exclusivo = 'zumbi';
          else delete r.exclusivo;
        }),
    });
    if (!saved) return;
    if (saved === 'abrirAtual') {
      // P39: the edits are dropped (the draft too) and the editor opens the version saved meanwhile.
      leaving = true;
      await forgetDraft(keyNow());
      handOff({ acao: 'abrir', mapa: { id: target.id!, versao: 0 }, tipo: target.tipo, chave: keyNow() });
      location.reload();
      return;
    }
    const before = keyNow();
    target.id = saved.id;
    target.versao = saved.versao;
    restored = false;
    doc.markSaved();
    // Saved: the draft has nothing the server doesn't (a new map's, kept as "novo", goes too).
    void forgetDraft(before, keyNow());
    title();
    status(et('saved', { v: saved.versao }));
  };

  budget.onChange = () => (button('save').disabled = !budget.fits);
  button('save').disabled = true;

  /** Leaving on purpose (the Exit button asked already). */
  let leaving = false;

  // --- Buttons and keys ---------------------------------------------------------------------------------------
  const setMode = (m: 'translate' | 'rotate' | 'scale') => {
    gizmo.setMode(m);
    for (const k of ['translate', 'rotate', 'scale']) button(k).classList.toggle('ed-on', k === m);
  };
  setMode('translate');
  const actions: Record<string, () => void> = {
    undo: () => doc.undo(),
    redo: () => doc.redo(),
    translate: () => setMode('translate'),
    rotate: () => setMode('rotate'),
    scale: () => setMode('scale'),
    focus,
    duplicate: () => void duplicate(),
    remove,
    test: () => void test(),
    save: () => void save(),
    exit: () => {
      if ((doc.dirty || restored) && !confirm(et('exitConfirm'))) return;
      leaving = true;
      // Leaving on purpose throws the unsaved edits away (the question said so): the draft goes with them.
      void forgetDraft(keyNow()).finally(() => location.reload());
    },
  };
  for (const [a, f] of Object.entries(actions)) button(a).onclick = f;
  button('undo').disabled = button('redo').disabled = true;

  window.addEventListener('keydown', (e) => {
    if (typing() || root.querySelector('.ed-modal')) return;
    const h = historyKey(e);
    if (h) {
      e.preventDefault();
      if (!gizmo.dragging) actions[h]();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD') {
      e.preventDefault();
      actions.duplicate();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Digit1') setMode('translate');
    else if (e.code === 'Digit2') setMode('rotate');
    else if (e.code === 'Digit3') setMode('scale');
    else if (e.code === 'Delete' || e.code === 'Backspace') remove();
    else if (e.code === 'KeyF') focus();
    else if (e.code === 'Escape') selection.set(null);
  });
  // Closing the tab with unsaved edits asks first (leaving by the Exit button already asked; testing keeps the draft).
  window.addEventListener('beforeunload', (e) => {
    if (doc.dirty && !leaving && !sessionStorage.getItem('oc.editor')) e.preventDefault();
  });

  title();
  attach();
  budget.schedule();
  if (restored && !o.rascunho) status(et('draftRecovered'));

  // Dev-only handle for automated smoke tests and console poking (like the game's __oc).
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __ocEditor: {
        THREE, doc, selection, gizmo, markers, handles, budget, target, actions, addPiece, addMarkerAt, importGlb,
        get view() {
          return view;
        },
        get base() {
          return base;
        },
      },
    });
  }

  // --- The loop -----------------------------------------------------------------------------------------------
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    fly.update(dt);
    view.update(dt, camera.position);
    ctx.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
