// The map editor inside the game (PF-6): opened instead of a match (boot() in client/main.ts calls runEditor and
// returns: no input, player or HUD). It loads a saved version of a map (or starts a new one), builds it with the
// game's own loader in its editor mode, and runs its own loop: a free camera, picking with a click, the gizmo
// (move, turn, scale on a 0.5 m and 15° grid; Shift held for free moves), undo and redo, the palette, the
// properties panel, the markers, the ends and holes of walls, GLB models from the computer, the live budget
// bar, testing the map (the training range, or the zumbi match on a zumbi-only map) and saving it.
// Revisions 01 lays it out as Unity's editor: a toolbar with Play in the middle, dockable panels (Hierarchy
// with groups, the Scene, the Inspector with its Transform, the Project) and a status bar; the pieces not
// selected are drawn from batches (P46). Every edit
// keeps a draft in IndexedDB (P40), offered back when the map opens again; saving forgets it. Leaving reloads
// the page.
import * as THREE from 'three';
import { MAP_FORMAT, type MapData, type Peca, type Vec3 } from '@shared/mapData';
import { OFFICIAL_MAPS, isOfficialMap } from '@shared/maps';
import { MAP_CATALOG } from '@shared/mapCatalog';
import type { Papel } from '@shared/roles';
import { applyAtmosphere, type RenderContext } from '../render/renderer';
import type { QualityManager } from '../render/quality';
import type { Physics } from '../world/physics';
import { atmosphereOf, loadOfficialMap } from '../world/mapLoader';
import { api, fetchMe } from '../net/api';
import { deleteDraft, fetchMapVersion, loadDraft, saveDraft } from '../net/maps';
import { EditorDocument, clone, newPieceId, type Rest } from './document';
import { groupMatrix, worldPoseMatrix } from '../world/pose';
import { duplicateTree, linkedRest, makeGroup, moveInto, moveTree, removalOf, scaleTree, subtree, topLevel } from './groups';
import { Hierarchy } from './hierarchy';
import { DockView } from './dock';
import { applyEdit, fieldsOf, matrixOf, type Fields } from './transformFields';
import { historyKey } from './history';
import { MapView } from './view';
import { FlyCamera, typing } from './flyCamera';
import { Selection, type Selected } from './selection';
import { Gizmo, GRID } from './gizmo';
import { Markers, addMarker, markerPlace, markerTurns, removeMarker, setMarkerPlace, type MarkerKind } from './markers';
import { LinearHandles, hasHandles, moveHandle } from './linearHandles';
import { Inspector, type TransformBinding } from './inspector';
import { Palette } from './palette';
import { BudgetBar } from './budgetBar';
import { applyHandle, handleBase, handleDelta, handleLocal, handleWorld, hasLinked, moveLinked, scalable } from './transform';
import { newPiece, removalRest, templatesFrom } from './create';
import { fileEntry, pickGlb, uploadGlb } from './glbImport';
import { showSaveDialog, type MapTarget } from './save';
import { draftKey, handOff, type EditorMap } from './launch';
import { draftIsNewer, recoveredBase, type Draft } from './recovery';
import { injectEditorStyle } from './style';
import { et, type EditorKey } from './strings';
import type { MapaResumo, TipoMapa } from '@shared/mapData';

export interface EditorOptions {
  ctx: RenderContext;
  /** The game's graphics settings: the editor's frames refresh the sun's shadow as the match's do. */
  quality: Pick<QualityManager, 'beforeRender'>;
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

/** The toolbar's buttons and their texts (the full text is the tooltip; the button shows it without the key). */
const LABEL: Record<string, EditorKey> = {
  undo: 'undo',
  redo: 'redo',
  translate: 'move',
  rotate: 'rotate',
  scale: 'scale',
  play: 'play',
  pause: 'pause',
  stop: 'stop',
  focus: 'focus',
  duplicate: 'duplicate',
  remove: 'remove',
  layout: 'layout',
  layoutReset: 'layoutReset',
  save: 'save',
  exit: 'exit',
};

export async function runEditor(o: EditorOptions): Promise<void> {
  const { ctx, physics } = o;
  injectEditorStyle();
  // Unity's window (Revisions 01): the toolbar on top (Play in the middle), the dockable panels, the status bar.
  // The empty slots hold what comes next: Pivot/Center and Local/Global, and the grid button.
  const root = document.createElement('div');
  root.id = 'editor';
  root.innerHTML = `
    <div class="ed-toolbar">
      <span class="ed-title"></span>
      <div class="ed-tgroup"><button data-a="undo"></button><button data-a="redo"></button></div>
      <div class="ed-tgroup"><button data-a="translate"></button><button data-a="rotate"></button><button data-a="scale"></button></div>
      <div class="ed-tgroup ed-slot" data-slot="pivo"></div>
      <div class="ed-tgroup ed-slot" data-slot="grade"></div>
      <span class="ed-spacer"></span>
      <div class="ed-tgroup ed-play"><button data-a="play"></button><button data-a="pause"></button><button data-a="stop"></button></div>
      <span class="ed-spacer"></span>
      <div class="ed-tgroup"><button data-a="focus"></button><button data-a="duplicate"></button><button data-a="remove"></button></div>
      <div class="ed-tgroup ed-layoutmenu"><button data-a="layout"></button><div class="ed-menu" hidden><button data-a="layoutReset"></button></div></div>
      <button data-a="save" class="ed-primary"></button><button data-a="exit"></button>
    </div>
    <div class="ed-dock"></div>
    <div class="ed-statusbar"><div class="ed-budget"></div><span class="ed-status"></span><span class="ed-hint"></span></div>
    <div class="ed-loading"></div>`;
  document.body.append(root);
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const button = (a: string) => $<HTMLButtonElement>(`button[data-a="${a}"]`);
  for (const [a, k] of Object.entries(LABEL)) {
    const b = button(a);
    const text = et(k);
    b.textContent = text.replace(/ \(.*\)$/, '');
    b.title = text;
  }
  for (const a of ['play', 'pause', 'stop']) button(a).classList.add('ed-icon');
  button('play').textContent = '▶';
  button('pause').textContent = '❚❚';
  button('stop').textContent = '■';
  // Pause and Stop wait for Play inside the editor; Play opens the test as Testar did.
  button('pause').disabled = button('stop').disabled = true;
  $('.ed-hint').textContent = et('hint');
  const loading = $<HTMLElement>('.ed-loading');
  loading.textContent = et('loading');

  // The panels, docked as the layout kept in the browser says (or Unity's).
  const panel = (cls: string) => {
    const el = document.createElement('div');
    el.className = `ed-panel-body ${cls}`;
    return el;
  };
  const hierEl = panel('ed-hierarchy');
  const sceneEl = panel('ed-scene');
  const inspEl = panel('ed-inspector');
  const projEl = panel('ed-project');
  const dock = new DockView($('.ed-dock'), {
    hierarchy: { title: et('panelHierarchy'), el: hierEl },
    scene: { title: et('panelScene'), el: sceneEl },
    inspector: { title: et('panelInspector'), el: inspEl },
    project: { title: et('panelProject'), el: projEl },
  });
  const canvas = ctx.renderer.domElement;
  canvas.style.display = 'block';
  sceneEl.append(canvas);
  const camera = ctx.camera;
  /** The 3D view fills the Scene panel, wherever it's docked and however big. */
  const size = new THREE.Vector2();
  const fit = () => {
    const w = sceneEl.clientWidth;
    const h = sceneEl.clientHeight;
    if (!w || !h) return;
    ctx.renderer.getSize(size);
    if (size.x === w && size.y === h) return;
    ctx.renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  dock.onLayout = fit;
  fit();
  const layoutMenu = $<HTMLElement>('.ed-layoutmenu .ed-menu');
  document.addEventListener('pointerdown', (e) => {
    if (!layoutMenu.contains(e.target as Node) && e.target !== button('layout')) layoutMenu.hidden = true;
  });

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
  const find = (id: string) => doc.piece(id);
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

  /** What a piece builds, with everything inside it when it's a group. */
  const pieceBounds = (id: string) => {
    const box = new THREE.Box3();
    for (const x of subtree(doc.data, [id])) {
      const g = view.group(x);
      if (g) box.union(new THREE.Box3().setFromObject(g));
    }
    return box;
  };
  const boundsOf = (s: Selected): THREE.Box3 | null => {
    if (s.kind === 'peca') return pieceBounds(s.id);
    if (s.kind === 'marcador') {
      const m = markers.get(s.key);
      return m ? new THREE.Box3().setFromObject(m) : null;
    }
    const mesh = handles.group.children.find((c) => c.userData.ponta === s.key);
    return mesh ? new THREE.Box3().setFromObject(mesh) : null;
  };
  const selection = new Selection(ctx.scene, camera, canvas, () => [handles.group, markers.group, view.root], () => gizmo.hot(), boundsOf);
  // Clicking the 3D view takes the keyboard back from the panels.
  canvas.addEventListener('pointerdown', () => (document.activeElement as HTMLElement | null)?.blur?.());

  /** The pieces selected (that still exist), the active one last. */
  const selectedPieces = (): Peca[] => selection.pieceIds.map(find).filter((p): p is Peca => !!p);
  const pivotOf = (p: Peca) => view.pivot(p);

  const inspector = new Inspector(inspEl, {
    editPiece: (next, rest) => commitPiece(next, rest),
    editPieces: (next) => doc.setPieces(doc.data.pecas.map((p) => next.find((n) => n.id === p.id) ?? p), linkedRestFor(next)),
    editRest: (f) => doc.editRest(f),
    markerRemoved: () => selection.set(null),
    rename: (id, nome) => rename(id, nome),
    clearPose: (ids) => {
      const next = doc.data.pecas.map((p) => {
        if (!ids.includes(p.id) || !p.pose) return p;
        const n = clone(p);
        delete n.pose;
        return n;
      });
      doc.setPieces(next, linkedRest(doc.data, next));
    },
  });
  const budget = new BudgetBar($('.ed-budget'), () => doc.data, ctx.renderer);

  /** The rest of the map after `next` pieces replace theirs: the server's places tied to them follow. */
  const linkedRestFor = (next: Peca[]) => linkedRest(doc.data, doc.data.pecas.map((p) => next.find((n) => n.id === p.id) ?? p));

  const rename = (id: string, nome: string | null) => {
    const p = find(id);
    if (!p) return;
    const n = clone(p);
    if (nome) n.nome = nome.slice(0, 60);
    else delete n.nome;
    doc.editPiece(n);
  };

  // --- Selection, the gizmo and the Transform ---------------------------------------------------------------
  /** Where the gizmo's handle sat on the active piece before its pose (fixed for one drag). */
  let base = new THREE.Matrix4();
  /** The rotation last typed for each piece (200° stays 200°, as in Unity). */
  const hints = new Map<string, Fields>();

  /** The pieces drawn by their own meshes (P46): the selection and everything inside the selected groups. */
  const drawnApart = () => subtree(doc.data, selection.pieceIds);

  /** While dragging: every selected piece (and what's in its groups) shown moved by its delta. */
  let previewing: string[] = [];
  const previewDeltas = (deltas: Map<string, THREE.Matrix4>) => {
    previewing = [];
    for (const [top, delta] of deltas)
      for (const id of subtree(doc.data, [top])) {
        const g = view.group(id);
        if (!g) continue;
        g.matrixAutoUpdate = false;
        g.matrix.copy(delta);
        g.matrixWorldNeedsUpdate = true;
        previewing.push(id);
      }
    selection.refresh();
  };
  const clearPreview = () => {
    for (const id of previewing) {
      const g = view.group(id);
      if (!g) continue;
      g.matrix.identity();
      g.matrixWorldNeedsUpdate = true;
    }
    previewing = [];
    selection.refresh();
  };

  /** The Transform component's binding for the selected pieces (the ones not inside another selected group). */
  const transformBinding = (pieces: Peca[]): TransformBinding => {
    const top = new Set(topLevel(doc.data, pieces.map((p) => p.id)));
    const items = pieces
      .filter((p) => top.has(p.id))
      .map((p) => {
        const b = handleBase(p, pivotOf(p));
        const parent = groupMatrix(p, find);
        const fields = fieldsOf(handleLocal(p, b), hints.get(p.id));
        return { p, base: b, parent, fields };
      });
    const worldOf = (it: (typeof items)[number], f: Fields) => {
      const m = matrixOf(f);
      return it.parent ? it.parent.clone().multiply(m) : m;
    };
    return {
      fields: items.map((i) => i.fields),
      scales: items.map((i) => scalable(i.p)),
      preview: (e) => previewDeltas(new Map(items.map((it) => [it.p.id, worldOf(it, applyEdit(it.fields, e)).multiply(worldOf(it, it.fields).invert())]))),
      cancel: () => clearPreview(),
      commit: (e) => {
        clearPreview();
        let next = doc.data.pecas;
        for (const it of items) {
          const f = applyEdit(it.fields, e);
          if (e.c === 's') {
            // The scale: a scalable piece grows, a group scales its children (its own frame keeps no scale).
            if (!scalable(it.p) || !it.fields.s) continue;
            const pivot = new THREE.Vector3().setFromMatrixPosition(worldOf(it, it.fields));
            next = scaleTree({ ...doc.data, pecas: next }, [it.p.id], pivot, f.s / it.fields.s, pivotOf);
            continue;
          }
          if (e.c === 'r') hints.set(it.p.id, f);
          const cur = next.find((p) => p.id === it.p.id)!;
          const moved = applyHandle(cur, it.base, worldOf(it, f), it.parent);
          next = next.map((p) => (p.id === moved.id ? moved : p));
        }
        doc.setPieces(next, linkedRest(doc.data, next));
      },
    };
  };

  const attach = () => {
    const s = selection.current;
    const pieces = selectedPieces();
    hierarchy.setSelection(pieces.map((p) => p.id), s?.kind === 'marcador' ? s.key : null);
    view.setOut(drawnApart());
    if (gizmo.dragging) return;
    // Pieces gone (an undo, a delete) leave the selection.
    if (pieces.length !== selection.pieceIds.length) return selection.setMany(pieces.map((p) => ({ kind: 'peca', id: p.id })));
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
    const peca = find(s.id);
    if (!peca) return selection.set(null);
    const parent = groupMatrix(peca, find);
    handles.show(pieces.length === 1 && hasHandles(peca) ? peca : null, worldPoseMatrix(peca, find));
    if (s.kind === 'ponta') {
      const h = handles.world(s.key);
      if (!h) return selection.set({ kind: 'peca', id: s.id });
      gizmo.attach({ world: h.world, rotate: false, scale: false, axis: h.axis ?? undefined });
    } else {
      base = handleBase(peca, pivotOf(peca));
      gizmo.attach({ world: handleWorld(peca, base, parent), rotate: true, scale: pieces.some(scalable) });
    }
    inspector.showPieces(pieces.length ? pieces : [peca], doc.data, transformBinding(pieces.length ? pieces : [peca]));
  };
  selection.onChange = () => attach();

  gizmo.onDrag = (world, start) => {
    const s = selection.current;
    if (!s) return;
    if (s.kind === 'peca') {
      const delta = world.clone().multiply(start.clone().invert());
      previewDeltas(new Map(topLevel(doc.data, selection.pieceIds).map((id) => [id, delta])));
    } else if (s.kind === 'marcador') {
      const m = markers.get(s.key);
      if (m) world.decompose(m.position, m.quaternion, new THREE.Vector3());
    } else {
      const local = handles.toLocal(world);
      const mesh = handles.group.children.find((c) => c.userData.ponta === s.key);
      mesh?.position.set(...local);
    }
  };
  gizmo.onEnd = (start, world) => {
    const s = selection.current;
    if (!s) return;
    if (s.kind === 'peca') clearPreview();
    if (start.equals(world)) return attach();
    if (s.kind === 'peca') {
      const ids = selection.pieceIds;
      let next: Peca[];
      if (gizmo.controls.mode === 'scale') {
        // Scaled about the active piece's handle: the selection spreads from it and what scales grows.
        const a = new THREE.Vector3().setFromMatrixScale(start);
        const b = new THREE.Vector3().setFromMatrixScale(world);
        const ratio = (b.x + b.y + b.z) / (a.x + a.y + a.z);
        next = scaleTree(doc.data, ids, new THREE.Vector3().setFromMatrixPosition(start), ratio, pivotOf);
      } else next = moveTree(doc.data, ids, handleDelta(start, world));
      doc.setPieces(next, linkedRest(doc.data, next));
    } else if (s.kind === 'marcador') {
      const t = new THREE.Vector3();
      const q = new THREE.Quaternion();
      world.decompose(t, q, new THREE.Vector3());
      const yaw = markerTurns(s.key) ? new THREE.Euler().setFromQuaternion(q, 'YXZ').y : undefined;
      doc.editRest((r) => setMarkerPlace(r, s.key, { p: [t.x, t.y, t.z], yaw }));
    } else {
      const peca = find(s.id);
      if (peca) doc.editPiece(moveHandle(peca, s.key, handles.toLocal(world)));
    }
  };

  /** A piece edited in the panel: the server's places tied to it follow when it moves. */
  const commitPiece = (next: Peca, rest?: (r: Rest) => void) => {
    const peca = find(next.id);
    if (peca && !rest && hasLinked(peca, doc.data)) {
      const pivot = pivotOf(peca);
      const parent = groupMatrix(peca, find);
      const from = handleWorld(peca, handleBase(peca, pivot), parent);
      const to = handleWorld(next, handleBase(next, pivot), parent);
      const delta = handleDelta(from, to);
      rest = (r) => moveLinked(r, peca, delta);
    }
    doc.editPiece(next, rest);
  };

  // --- Edits reach the scene ---------------------------------------------------------------------------------
  let ambiente = JSON.stringify(doc.data.ambiente);
  let palette: Palette;
  let hierarchy: Hierarchy;
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
    hierarchy.render();
    if (amb !== ambiente) {
      // The sky and the shared systems are the map's: it's built again whole.
      ambiente = amb;
      void reloadView();
    } else if (c.ids.size) void view.rebuild(subtree(doc.data, c.ids)); // A group's children move with it.
    if (c.resto) markers.draw(doc.data);
    if (!c.ids.size) attach();
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

  // --- Adding, duplicating, grouping and deleting ------------------------------------------------------------
  let templates: Map<string, Peca> | null = null;
  const templatesReady = Promise.all(OFFICIAL_MAPS.map((id) => loadOfficialMap(id))).then((maps) => (templates = templatesFrom(maps)));

  /** Where new things land: what's under the middle of the 3D view, on the grid. */
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

  // The Project panel: the palette as a list until its thumbnails come.
  palette = new Palette(projEl, { piece: (t) => void addPiece(t), marker: addMarkerAt, importGlb: () => void importGlb(), glbPiece: (f) => void glbPiece(f) }, () => doc.data);

  const selectPieces = (ids: string[], active: string | null = ids[ids.length - 1] ?? null) =>
    selection.setMany(
      ids.map((id) => ({ kind: 'peca', id })),
      active ? { kind: 'peca', id: active } : null,
    );

  /** A new group: empty at the middle of the view, or around the selection (at its middle). */
  const group = async (around: boolean) => {
    const ids = around ? selection.pieceIds : [];
    let at = dropPoint();
    if (ids.length) {
      const box = new THREE.Box3();
      for (const id of ids) box.union(pieceBounds(id));
      if (!box.isEmpty()) {
        const c = box.getCenter(new THREE.Vector3());
        at = [snap(c.x), r4(box.min.y), snap(c.z)];
      }
    }
    const made = makeGroup(doc.data, ids, at);
    hierarchy.expand(made.id);
    doc.setPieces(made.pecas);
    await view.idle();
    selection.set({ kind: 'peca', id: made.id });
    hierarchy.rename(made.id);
  };

  hierarchy = new Hierarchy(
    hierEl,
    {
      select: (ids, active) => selectPieces(ids, active),
      marker: (key) => selection.set({ kind: 'marcador', key }),
      rename: (id, nome) => rename(id, nome),
      move: (ids, pai, slot) => {
        const next = moveInto(doc.data, ids, pai, slot);
        if (!next) return status(et('cantMove'), true);
        doc.setPieces(next, linkedRest(doc.data, next));
      },
      newGroup: () => void group(false),
      groupSelection: () => void group(true),
    },
    () => doc.data,
  );
  hierarchy.render();

  const duplicate = async () => {
    const ids = selection.pieceIds;
    if (!ids.length) return;
    const made = duplicateTree(doc.data, ids);
    if (made.skipped.length) {
      const p = find(made.skipped[0]);
      status(et('limitReached', { nome: p ? (MAP_CATALOG[p.tipo]?.nome.pt ?? p.tipo) : made.skipped[0] }), true);
    }
    if (!made.copies.length) return;
    doc.setPieces(made.pecas, made.rest);
    await view.idle();
    selectPieces(made.copies);
  };

  const remove = () => {
    const s = selection.current;
    if (!s) return;
    if (s.kind === 'marcador') {
      const probe = clone(doc.data);
      if (!removeMarker(probe, s.key)) return;
      doc.editRest((r) => removeMarker(r, s.key));
    } else {
      // A group goes with everything inside it.
      const ids = removalOf(doc.data, selection.pieceIds);
      doc.removePieces(ids, removalRest(doc.data, ids));
    }
    selection.set(null);
  };

  const focus = () => {
    const s = selection.current;
    if (!s) return fly.frame(view.bounds());
    const box = new THREE.Box3();
    for (const x of selection.items) {
      const b = boundsOf(x);
      if (b) box.union(b);
    }
    if (!box.isEmpty()) fly.frame(box);
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
    // Until Play runs inside the editor, it's the test of the map (Testar).
    play: () => void test(),
    pause: () => {},
    stop: () => {},
    layout: () => (layoutMenu.hidden = !layoutMenu.hidden),
    layoutReset: () => {
      layoutMenu.hidden = true;
      dock.restore();
    },
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
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyG') {
      e.preventDefault();
      void group(true);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Digit1') setMode('translate');
    else if (e.code === 'Digit2') setMode('rotate');
    else if (e.code === 'Digit3') setMode('scale');
    else if (e.code === 'Delete' || e.code === 'Backspace') remove();
    else if (e.code === 'KeyF') focus();
    else if (e.code === 'F2') {
      const id = selection.pieceIds.pop();
      if (id) {
        e.preventDefault();
        dock.show('hierarchy');
        hierarchy.rename(id);
      }
    } else if (e.code === 'Escape') selection.set(null);
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
        THREE, doc, selection, gizmo, markers, handles, budget, target, actions, addPiece, addMarkerAt, importGlb, dock, hierarchy, inspector, renderer: ctx.renderer,
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
    fit();
    fly.update(dt);
    view.update(dt, camera.position);
    // The shadow map is refreshed on demand: without this it was never drawn (PF-6 Revisions 01).
    o.quality.beforeRender();
    ctx.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
