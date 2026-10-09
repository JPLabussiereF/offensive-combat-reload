// The map editor inside the game (PF-6): opened instead of a match (boot() in client/main.ts calls runEditor and
// returns: no input, player or HUD). It loads a saved version of a map (or starts a new one), builds it with the
// game's own loader in its editor mode, and runs its own loop: the Scene view's camera, picking with a click or a
// box, the gizmo (move, turn, scale; Ctrl or the grid button snaps), undo and redo, the Project panel, the
// properties panel, the markers, the ends and holes of walls, GLB models from the computer, the live budget
// bar, playing the map (the training range, or the zumbi match on a zumbi-only map) and saving it.
// Revisions 01 lays it out as Unity's editor: a toolbar with Play in the middle, dockable panels (Hierarchy
// with groups, the Scene, the Game, the Inspector with its Transform, the Project) and a status bar; the pieces not
// selected are drawn from batches (P46). Its etapa 3 brings Unity's Scene view: the camera (fly, orbit, pan,
// dolly, frame, the orientation gizmo, perspective or orthographic), the Q W E R T tools (the Rect tool: client/
// editor/rectTool.ts), Ctrl to snap and the grid button, Pivot/Center and Local/Global (client/editor/tools.ts),
// box selection, copy and paste (client/editor/clipboard.ts) and Unity's keys (client/editor/shortcuts.ts). Its etapa 4,
// the Project panel's thumbnails (client/editor/project.ts, thumbs.ts) dragged onto the Scene or the Hierarchy, and
// Play inside the editor (client/editor/playMode.ts, playHost.ts): ▶ plays the map being edited in the Game tab,
// ❚❚ freezes it, ■ ends it and gives the editor back as it was; the editor is read-only meanwhile. Every edit
// keeps a draft in IndexedDB (P40), offered back when the map opens again; saving forgets it. Leaving reloads
// the page.
import * as THREE from 'three';
import { MAP_FORMAT, type MapData, type Peca, type Vec3 } from '@shared/mapData';
import { isOfficialMap } from '@shared/maps';
import { MAP_CATALOG } from '@shared/mapCatalog';
import type { Papel } from '@shared/roles';
import { applyAtmosphere, type RenderContext } from '../render/renderer';
import type { QualityManager } from '../render/quality';
import type { Physics } from '../world/physics';
import { atmosphereOf, loadOfficialMap } from '../world/mapLoader';
import { api, fetchMe } from '../net/api';
import { deleteDraft, fetchMapVersion, loadDraft, saveDraft } from '../net/maps';
import { EditorDocument, clone, type Rest } from './document';
import { groupMatrix, worldPoseMatrix } from '../world/pose';
import { duplicateTree, linkedRest, makeGroup, moveInto, moveTree, removalOf, scaleTree, subtree, topLevel } from './groups';
import { Hierarchy } from './hierarchy';
import { DockView } from './dock';
import { applyEdit, fieldsOf, matrixOf, type Fields } from './transformFields';
import { MapView } from './view';
import { SceneCamera, typing } from './sceneCamera';
import { ViewGizmo } from './viewGizmo';
import { Selection, type Selected } from './selection';
import { Gizmo, type GizmoTarget } from './gizmo';
import { gizmoFrame, gizmoSpace, MOVE_RANGE, parseStep, PREFS_KEY, readPrefs, snapSteps, snapTo, TURN_RANGE, writePrefs, type Tool, type ToolPrefs } from './tools';
import { shortcutOf, type EditorAction } from './shortcuts';
import { piecesInRect } from './boxSelect';
import { cloneState, type CameraState } from './cameraMath';
import { clipAnchor, copyPieces, pastePieces, type Clip } from './clipboard';
import { applyStretch, dropAxis, stretchable, stretchBox, type RectFrame } from './rectTool';
import { RectOverlay } from './rectOverlay';
import { Markers, addMarker, markerPlace, markerTurns, removeMarker, setMarkerPlace, type MarkerKind } from './markers';
import { LinearHandles, hasHandles, moveHandle } from './linearHandles';
import { Inspector, type TransformBinding } from './inspector';
import { ProjectPanel, itemKey, type ProjectItem } from './project';
import { Thumbs } from './thumbs';
import { ASSET_MIME, dropPiece, ghostBox, hierarchySpot, sceneSpot, type DropSpot } from './dropPiece';
import { PlaySession, buttonsOf, cameraOn, editable as editableIn, pickingOn, shortcutAllowed, type PlayState } from './playMode';
import { launchGame, type GameFrame } from './playHost';
import { gamepad } from '../core/gamepad';
import { BudgetBar } from './budgetBar';
import { applyHandle, handleBase, handleDelta, handleLocal, handleWorld, hasLinked, moveLinked, scalable } from './transform';
import { removalRest } from './create';
import { fileEntry, pickGlb, uploadGlb } from './glbImport';
import { showSaveDialog, type MapTarget } from './save';
import { draftKey, handOff, type EditorMap } from './launch';
import { draftIsNewer, recoveredBase, type Draft } from './recovery';
import { injectEditorStyle } from './style';
import { locale } from '../ui/strings';
import { et, nameOf, type EditorKey } from './strings';
import type { MapaResumo, TipoMapa } from '@shared/mapData';

export interface EditorOptions {
  ctx: RenderContext;
  /** The game's graphics settings: the editor's frames refresh the sun's shadow as the match's do. */
  quality: Pick<QualityManager, 'beforeRender'>;
  physics: Physics;
  /** The saved version to open (versao 0: the current one), or null for a new map. */
  mapa: EditorMap;
  /** A draft to open instead (a handoff of the old Testar, written before Play ran inside the editor). */
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

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

/** The toolbar's buttons and their texts (the full text is the tooltip; the button shows it without the key). */
const LABEL: Record<string, EditorKey> = {
  undo: 'undo',
  redo: 'redo',
  hand: 'hand',
  translate: 'move',
  rotate: 'rotate',
  scale: 'scale',
  rect: 'rect',
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
  // The slots: Pivot/Center and Local/Global, and the grid button with its steps.
  const root = document.createElement('div');
  root.id = 'editor';
  root.innerHTML = `
    <div class="ed-toolbar">
      <span class="ed-title"></span>
      <div class="ed-tgroup"><button data-a="undo"></button><button data-a="redo"></button></div>
      <div class="ed-tgroup"><button data-a="hand"></button><button data-a="translate"></button><button data-a="rotate"></button><button data-a="scale"></button><button data-a="rect"></button></div>
      <div class="ed-tgroup ed-slot" data-slot="pivo"><button data-a="pivotMode"></button><button data-a="spaceMode"></button></div>
      <div class="ed-tgroup ed-slot" data-slot="grade"><button data-a="grid"></button><button data-a="gridMenu" class="ed-caret">▾</button><div class="ed-menu ed-gridmenu" hidden>
        <b class="ed-gridtitle"></b>
        <label class="ed-row"><span class="ed-gridmove"></span><input type="text" inputmode="decimal" data-step="move"></label>
        <label class="ed-row"><span class="ed-gridturn"></span><input type="text" inputmode="decimal" data-step="turn"></label>
      </div></div>
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
  // Pause and Stop wait for Play (Play inside the editor, etapa 4).
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
  // The Game tab: the game's page is laid over it while the map is played (client/editor/playHost.ts).
  const gameEl = panel('ed-game');
  gameEl.textContent = et('gameIdle');
  const dock = new DockView($('.ed-dock'), {
    hierarchy: { title: et('panelHierarchy'), el: hierEl },
    scene: { title: et('panelScene'), el: sceneEl },
    game: { title: et('panelGame'), el: gameEl },
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
  /** Play inside the editor (etapa 4): editing, or the map played (read-only) or paused (read-only). */
  let play: PlayState = 'editando';
  const editable = () => editableIn(play);

  // --- The map --------------------------------------------------------------------------------------------
  let opened: Awaited<ReturnType<typeof openMap>>;
  const askDraft = (d: Draft, isNew: boolean) => {
    const quando = new Date(d.em).toLocaleString(locale());
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

  // The Scene view's camera (Unity's) and its orientation gizmo in the corner.
  const cam = new SceneCamera(camera, canvas);
  {
    const box = view.bounds();
    const sp = doc.data.spawns.ffa[0]?.p ?? [0, 0, 0];
    if (box.isEmpty()) cam.place(new THREE.Vector3(sp[0], sp[1] + 12, sp[2] + 18), new THREE.Vector3(...sp));
    else {
      const c = box.getCenter(new THREE.Vector3());
      cam.place(new THREE.Vector3(c.x, Math.min(60, box.max.y + 20), box.max.z + 10), c);
    }
  }
  const viewGizmo = new ViewGizmo(sceneEl, { persp: et('viewPersp'), ortho: et('viewOrtho'), tip: et('viewTip') });
  viewGizmo.onAxis = (a) => cam.view(a);
  viewGizmo.onToggle = () => cam.toggleProjection();
  const markers = new Markers(ctx.scene);
  markers.draw(doc.data);
  const handles = new LinearHandles(ctx.scene);
  const gizmo = new Gizmo(camera, canvas, ctx.scene);
  cam.onProjection = (c) => gizmo.setCamera(c);
  /** The tool picked (Unity's Q W E R T). */
  let tool: Tool = 'translate';
  cam.hand = () => tool === 'hand';

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
  const selection = new Selection(
    ctx.scene,
    () => cam.active,
    canvas,
    () => [handles.group, markers.group, view.root],
    () => gizmo.hot(),
    boundsOf,
    // Alt + left drag orbits and the hand tool pans: those presses aren't the selection's.
    (e) => e.altKey || tool === 'hand',
  );
  /** Box selection: the pieces whose drawing touches the box. */
  selection.boxPick = (r) => {
    const all: [string, THREE.Object3D][] = [];
    for (const p of doc.data.pecas) {
      const g = view.group(p.id);
      if (g) all.push([p.id, g]);
    }
    return piecesInRect(cam.active, r, all);
  };
  /** The box around everything selected (null: nothing with a box). */
  const selectionBox = (): THREE.Box3 | null => {
    const box = new THREE.Box3();
    for (const x of selection.items) {
      const b = boundsOf(x);
      if (b) box.union(b);
    }
    return box.isEmpty() ? null : box;
  };
  // Alt + left drag orbits about the selection's middle (or the point ahead).
  cam.orbitCenter = () => (selection.pieceIds.length || selection.current ? (selectionBox()?.getCenter(new THREE.Vector3()) ?? null) : null);
  // Clicking the 3D view takes the keyboard back from the panels.
  canvas.addEventListener('pointerdown', () => (document.activeElement as HTMLElement | null)?.blur?.());
  /** Where the mouse is over the Scene panel (null: elsewhere), for pasting where it points. */
  let pointer: { x: number; y: number } | null = null;
  sceneEl.addEventListener('pointermove', (e) => (pointer = { x: e.clientX, y: e.clientY }));
  sceneEl.addEventListener('pointerleave', () => (pointer = null));

  // --- The handle settings: Pivot/Center, Local/Global and the snapping (kept in the browser) --------------
  let prefs: ToolPrefs = (() => {
    try {
      return readPrefs(localStorage.getItem(PREFS_KEY));
    } catch {
      return readPrefs(null);
    }
  })();
  /** Ctrl held: snapping while it's down (Unity). */
  let ctrlHeld = false;
  const applySnap = () => gizmo.setSnap(snapSteps(prefs, ctrlHeld));
  const setCtrl = (on: boolean) => {
    if (on === ctrlHeld) return;
    ctrlHeld = on;
    applySnap();
  };
  window.addEventListener('keydown', (e) => setCtrl(e.ctrlKey || e.metaKey));
  window.addEventListener('keyup', (e) => setCtrl(e.ctrlKey || e.metaKey));
  window.addEventListener('pointermove', (e) => setCtrl(e.ctrlKey || e.metaKey));
  window.addEventListener('blur', () => setCtrl(false));
  // Alt held: the left button orbits, the gizmo lets it through.
  const setAlt = (on: boolean) => gizmo.setEnabled(!on);
  window.addEventListener('keydown', (e) => setAlt(e.altKey));
  window.addEventListener('keyup', (e) => setAlt(e.altKey));
  window.addEventListener('blur', () => setAlt(false));

  // --- The Rect tool (T) -------------------------------------------------------------------------------------
  const rect = new RectOverlay(sceneEl, canvas, () => cam.active, () => snapSteps(prefs, ctrlHeld).move);
  /** The rectangle's box for the selection (its plane comes from the camera, syncRect). */
  let rectBase: Omit<RectFrame, 'drop'> | null = null;
  let rectDrop: RectFrame['drop'] | null = null;
  const rectFrameOf = (pieces: Peca[]): Omit<RectFrame, 'drop'> | null => {
    const tops = topLevel(doc.data, pieces.map((p) => p.id)).map(find).filter((p): p is Peca => !!p);
    if (tops.length === 1 && stretchable(tops[0])) return { ...stretchBox(tops[0], groupMatrix(tops[0], find)), mode: 'stretch' };
    const box = selectionBox();
    if (!box) return null;
    return { world: new THREE.Matrix4(), min: box.min.clone(), max: box.max.clone(), mode: tops.some(scalable) ? 'uniform' : 'move' };
  };
  /** The rectangle on the face that looks at the camera most (`force`: drawn again anyway). */
  const syncRect = (force = false) => {
    if (!rectBase) {
      rectDrop = null;
      return rect.set(null);
    }
    if (rect.dragging) return;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.active.getWorldQuaternion(new THREE.Quaternion()));
    const drop = dropAxis(rectBase.world, dir);
    if (!force && drop === rectDrop) return;
    rectDrop = drop;
    rect.set({ ...rectBase, drop });
  };

  /** The pieces selected (that still exist), the active one last. */
  const selectedPieces = (): Peca[] => selection.pieceIds.map(find).filter((p): p is Peca => !!p);
  const pivotOf = (p: Peca) => view.pivot(p);

  // Read-only while the map is played: everything in it sits in a fieldset that's disabled then.
  const inspWrap = document.createElement('fieldset');
  inspWrap.className = 'ed-insp-wrap';
  inspEl.append(inspWrap);
  const inspector = new Inspector(inspWrap, {
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

  /** The gizmo on a target, unless the hand tool is on (Unity hides the handles then). */
  const showGizmo = (t: GizmoTarget) => gizmo.attach(tool === 'hand' || !editable() ? null : t);
  const attach = () => {
    const s = selection.current;
    const pieces = selectedPieces();
    hierarchy.setSelection(pieces.map((p) => p.id), s?.kind === 'marcador' ? s.key : null);
    view.setOut(drawnApart());
    if (gizmo.dragging || rect.dragging) return;
    // Pieces gone (an undo, a delete) leave the selection.
    if (pieces.length !== selection.pieceIds.length) return selection.setMany(pieces.map((p) => ({ kind: 'peca', id: p.id })));
    gizmo.setSpace(gizmoSpace(prefs));
    rectBase = null;
    syncRect();
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
      showGizmo({ world: m, rotate: markerTurns(s.key), scale: false });
      inspector.showMarker(s.key, doc.data);
      return;
    }
    const peca = find(s.id);
    if (!peca) return selection.set(null);
    const parent = groupMatrix(peca, find);
    // The handles (ends and holes of walls) are for editing: hidden while the map is played.
    handles.show(pieces.length === 1 && hasHandles(peca) && editable() ? peca : null, worldPoseMatrix(peca, find));
    if (s.kind === 'ponta') {
      const h = handles.world(s.key);
      if (!h) return selection.set({ kind: 'peca', id: s.id });
      showGizmo({ world: h.world, rotate: false, scale: false, axis: h.axis ?? undefined });
    } else {
      base = handleBase(peca, pivotOf(peca));
      if (tool === 'rect' && editable()) {
        // The Rect tool instead of the gizmo.
        gizmo.attach(null);
        rectBase = rectFrameOf(pieces.length ? pieces : [peca]);
        syncRect(true);
      } else {
        // Pivot: on the active piece; Center: in the middle of the selection (the point it turns and scales about).
        const at = gizmoFrame(handleWorld(peca, base, parent), prefs.center ? selectionBox() : null, prefs);
        showGizmo({ world: at, rotate: true, scale: pieces.some(scalable) });
      }
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

  // The Rect tool: a drag previews like the gizmo, then becomes one edit (a stretch, an even scale or a move).
  rect.onPreview = (delta) => previewDeltas(new Map(topLevel(doc.data, selection.pieceIds).map((id) => [id, delta])));
  rect.onCancel = () => clearPreview();
  rect.onClick = (x, y, e) => selection.clickAt(x, y, e.ctrlKey || e.metaKey || e.shiftKey);
  rect.onCommit = (f, d) => {
    clearPreview();
    const ids = selection.pieceIds;
    let next: Peca[];
    if (f.mode === 'stretch') {
      const p = find(topLevel(doc.data, ids)[0]);
      if (!p) return;
      const moved = applyStretch(p, groupMatrix(p, find), d.min, d.max);
      next = doc.data.pecas.map((x) => (x.id === moved.id ? moved : x));
    } else if (d.k !== undefined && d.anchor) next = scaleTree(doc.data, ids, d.anchor.clone().applyMatrix4(f.world), d.k, pivotOf);
    else {
      // A move in the box's axes, turned into the world's.
      const t = d.min.clone().sub(f.min).applyMatrix3(new THREE.Matrix3().setFromMatrix4(f.world));
      next = moveTree(doc.data, ids, new THREE.Matrix4().makeTranslation(t.x, t.y, t.z));
    }
    doc.setPieces(next, linkedRest(doc.data, next));
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
  let project: ProjectPanel;
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
    project.render();
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

  /** Where new things land: what's under the middle of the 3D view (the point ahead when it's hidden), on the grid. */
  const centerSpot = (): DropSpot => {
    const r = canvas.getBoundingClientRect();
    const p = r.width && r.height ? selection.dropPoint(r.left + r.width / 2, r.top + r.height / 2, view.root) : cam.pivot;
    return sceneSpot(p, prefs.move);
  };
  const dropPoint = (): Vec3 => centerSpot().at;

  /**
   * A new piece of `tipo` where `spot` says (in its group, at the end of its children): one edit with the server's
   * places it brings (and `extra`: an imported model's file), then selected.
   */
  const placePiece = async (tipo: string, spot: DropSpot, params?: Record<string, unknown>, extra?: (r: Rest) => void) => {
    if (!editable()) return;
    // P53: the catalog's defaults (the same the thumbnails show).
    const made = await dropPiece(doc.data, tipo, spot, { params, probe: (p) => view.probe(p) });
    if (!made) return status(et('limitReached', { nome: MAP_CATALOG[tipo] ? nameOf(MAP_CATALOG[tipo].nome) : tipo }), true);
    if (!editable()) return;
    if (spot.pai) hierarchy.expand(spot.pai);
    const rest = made.rest;
    doc.setPieces(made.pecas, rest && extra ? (r) => (rest(r), extra(r)) : (rest ?? extra));
    await view.idle();
    selection.set({ kind: 'peca', id: made.id });
  };

  /** A marker at a point of the world (markers aren't pieces: no group). */
  const addMarkerAt = (kind: MarkerKind, at: Vec3 = dropPoint()) => {
    if (!editable()) return;
    let key = null as string | null;
    doc.editRest((r) => (key = addMarker(r, kind, at)));
    if (key) selection.set({ kind: 'marcador', key });
  };

  const addPiece = (tipo: string) => placePiece(tipo, centerSpot());

  const importGlb = async (picked?: File) => {
    if (!editable()) return;
    const file = picked ?? (await pickGlb());
    if (!file) return;
    status(et('glbUploading', { nome: file.name }));
    try {
      const up = await uploadGlb(file);
      const { id, isNew } = fileEntry(doc.data, file.name, up);
      await placePiece('glb', centerSpot(), { arquivo: id }, isNew ? (r) => r.arquivos.push({ id, url: up.url, sha256: up.sha256, bytes: up.bytes }) : undefined);
      status(et('glbDone', { nome: file.name }));
    } catch (err) {
      status(String((err as Error)?.message ?? err), true);
    }
  };

  /** A Project item made at a spot (dropped on the Scene or the Hierarchy, or double-clicked). */
  const makeItem = (item: ProjectItem, spot: DropSpot) => {
    if (item.kind === 'marcador') return addMarkerAt(item.marker, spot.world);
    if (item.kind === 'glb') return void placePiece('glb', spot, { arquivo: item.file });
    void placePiece(item.tipo, spot);
  };

  // --- The Project panel: thumbnails, dragged onto the Scene or the Hierarchy (etapa 4) ------------------------
  const thumbs = new Thumbs(ctx.renderer, () => doc.data.arquivos);
  /** The Project item being dragged (a drag's own data can't be read before the drop). */
  let dragItem: ProjectItem | null = null;
  // The ghost while a thumbnail is dragged over the Scene: the box of what it builds, where it would land.
  const ghostLines = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(0x7fe0ff));
  (ghostLines.material as THREE.LineBasicMaterial).depthTest = false;
  ghostLines.renderOrder = 30;
  const ghostFill = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.16, depthWrite: false }));
  ghostLines.visible = ghostFill.visible = false;
  ctx.scene.add(ghostLines, ghostFill);
  const showGhost = (b: THREE.Box3 | null) => {
    ghostLines.visible = ghostFill.visible = !!b;
    if (!b) return;
    ghostLines.box.copy(b);
    b.getCenter(ghostFill.position);
    const size = b.getSize(new THREE.Vector3());
    ghostFill.scale.set(Math.max(size.x, 0.02), Math.max(size.y, 0.02), Math.max(size.z, 0.02));
  };
  const carriesAsset = (e: DragEvent) => !!dragItem && !!e.dataTransfer && [...e.dataTransfer.types].includes(ASSET_MIME);
  /** Where a thumbnail over the Scene would land (the SVG of the Rect tool is over the canvas: the Scene panel hears it). */
  const sceneDrop = (e: DragEvent) => sceneSpot(selection.dropPoint(e.clientX, e.clientY, view.root), prefs.move);
  sceneEl.addEventListener('dragover', (e) => {
    if (!carriesAsset(e) || !editable()) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
    const spot = sceneDrop(e);
    const at = { x: spot.at[0], y: spot.at[1], z: spot.at[2] };
    showGhost(ghostBox(at, dragItem!.kind === 'marcador' ? [-0.3, 0, -0.3, 0.3, 1.6, 0.3] : thumbs.box(itemKey(dragItem!))));
  });
  sceneEl.addEventListener('dragleave', (e) => {
    if (!sceneEl.contains(e.relatedTarget as Node | null)) showGhost(null);
  });
  sceneEl.addEventListener('drop', (e) => {
    if (!carriesAsset(e)) return;
    e.preventDefault();
    showGhost(null);
    const item = dragItem!;
    dragItem = null;
    if (editable()) makeItem(item, sceneDrop(e));
  });

  project = new ProjectPanel(
    projEl,
    {
      add: (item) => makeItem(item, centerSpot()),
      importGlb: () => void importGlb(),
      dragStart: (item) => (dragItem = item),
      dragEnd: () => {
        dragItem = null;
        showGhost(null);
      },
    },
    () => doc.data,
    thumbs,
  );
  // The cache forgets the kinds the catalog no longer has.
  void thumbs.prune(new Set(Object.keys(MAP_CATALOG).map((t) => `peca:${t}`)));

  const selectPieces = (ids: string[], active: string | null = ids[ids.length - 1] ?? null) =>
    selection.setMany(
      ids.map((id) => ({ kind: 'peca', id })),
      active ? { kind: 'peca', id: active } : null,
    );

  /** A new group: empty at the middle of the view, or around the selection (at its middle). */
  const group = async (around: boolean) => {
    if (!editable()) return;
    const ids = around ? selection.pieceIds : [];
    let at = dropPoint();
    if (ids.length) {
      const box = new THREE.Box3();
      for (const id of ids) box.union(pieceBounds(id));
      if (!box.isEmpty()) {
        const c = box.getCenter(new THREE.Vector3());
        at = [r4(snapTo(c.x, prefs.move)), r4(box.min.y), r4(snapTo(c.z, prefs.move))];
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
      focusMarker: (key) => {
        const m = markers.get(key);
        if (m) cam.frame(new THREE.Box3().setFromObject(m));
      },
      rename: (id, nome) => rename(id, nome),
      focus: (id) => cam.frame(pieceBounds(id)),
      move: (ids, pai, slot) => {
        const next = moveInto(doc.data, ids, pai, slot);
        if (!next) return status(et('cantMove'), true);
        doc.setPieces(next, linkedRest(doc.data, next));
      },
      newGroup: () => void group(false),
      groupSelection: () => void group(true),
      // A Project thumbnail dropped on a row: in that row's group, at its origin (below the rows: the top).
      dropAsset: (row) => {
        const item = dragItem;
        dragItem = null;
        showGhost(null);
        if (item && editable()) makeItem(item, hierarchySpot(doc.data, row));
      },
    },
    () => doc.data,
  );
  hierarchy.render();

  const duplicate = async () => {
    const ids = selection.pieceIds;
    if (!ids.length || !editable()) return;
    const made = duplicateTree(doc.data, ids);
    if (made.skipped.length) {
      const p = find(made.skipped[0]);
      status(et('limitReached', { nome: p ? (MAP_CATALOG[p.tipo] ? nameOf(MAP_CATALOG[p.tipo].nome) : p.tipo) : made.skipped[0] }), true);
    }
    if (!made.copies.length) return;
    doc.setPieces(made.pecas, made.rest);
    await view.idle();
    selectPieces(made.copies);
  };

  const remove = () => {
    const s = selection.current;
    if (!s || !editable()) return;
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

  /** F: the selection framed in the Scene view (nothing selected: the whole map). */
  const focus = () => {
    if (!selection.current) return cam.frame(view.bounds());
    const box = selectionBox();
    if (box) cam.frame(box);
  };

  // --- Copy and paste ------------------------------------------------------------------------------------------
  /** What Ctrl+C kept (the editor's own clipboard: it lasts while the editor is open). */
  let clip: Clip | null = null;
  const copy = () => {
    const ids = selection.pieceIds;
    if (!ids.length) return;
    const box = new THREE.Box3();
    for (const id of ids) box.union(pieceBounds(id));
    clip = copyPieces(doc.data, ids, box);
    if (clip) status(et('copied', { n: clip.pecas.length }));
  };
  /** Ctrl+V: where the mouse points in the Scene view, or (the mouse elsewhere) in the same place with an offset. */
  const paste = async () => {
    if (!editable()) return;
    if (!clip) return status(et('pasteEmpty'));
    const anchor = clipAnchor(clip);
    const d = new THREE.Vector3(1, 0, 1);
    if (pointer && anchor) {
      d.copy(selection.dropPoint(pointer.x, pointer.y, view.root)).sub(anchor);
      // With the grid button on, the copies keep to the grid (they move by whole steps).
      if (prefs.grid) d.set(snapTo(d.x, prefs.move), d.y, snapTo(d.z, prefs.move));
      d.set(r4(d.x), r4(d.y), r4(d.z));
    }
    const made = pastePieces(doc.data, clip, new THREE.Matrix4().makeTranslation(d.x, d.y, d.z));
    if (made.skipped.length) {
      const p = clip.pecas.find((x) => x.id === made.skipped[0]);
      status(et('limitReached', { nome: p ? (MAP_CATALOG[p.tipo] ? nameOf(MAP_CATALOG[p.tipo].nome) : p.tipo) : made.skipped[0] }), true);
    }
    if (!made.copies.length) return;
    doc.setPieces(made.pecas, made.rest);
    await view.idle();
    selectPieces(made.copies);
  };

  // --- Play inside the editor (etapa 4) and save ---------------------------------------------------------------
  /** The game in the Game tab while the map is played (client/editor/playHost.ts). */
  let game: GameFrame | null = null;
  /** What ▶ keeps and ■ gives back: the selection and the camera (the history and the map can't change meanwhile). */
  type Snap = { items: Selected[]; cam: CameraState; ortho: boolean };
  const session = new PlaySession<Snap>(
    {
      take: () => ({ items: selection.items.map((s) => ({ ...s })), cam: cloneState(cam.state), ortho: cam.orthographic }),
      restore: (s) => {
        cam.restore(s.cam, s.ortho);
        selection.setMany(s.items, s.items[s.items.length - 1] ?? null);
      },
    },
    (signal) => {
      gameEl.textContent = et('gameLoading');
      dock.show('game');
      return launchGame({
        host: root,
        panel: gameEl,
        data: doc.data,
        mapa: target.id,
        signal,
        // The game's own Exit, from inside its page: stopped once its click is over.
        onExit: () => setTimeout(() => session.ended(), 0),
      }).then((g) => (game = g));
    },
  );
  session.onError = (err) => {
    const m = String((err as Error)?.message ?? err);
    if (m !== 'abort') status(et('playFailed', { e: m }), true);
  };
  /** The controller's menu navigation, set aside while the game plays. */
  let padMenu: typeof gamepad.onMenu = null;
  /** The buttons that change the map (off while it's played). */
  const EDITING = ['undo', 'redo', 'hand', 'translate', 'rotate', 'scale', 'rect', 'pivotMode', 'spaceMode', 'grid', 'gridMenu', 'duplicate', 'remove', 'save'];
  /** The editor as the play state wants it: read-only (the camera too while it plays), the toolbar tinted. */
  const setPlay = (s: PlayState) => {
    play = s;
    const edit = editableIn(s);
    doc.locked = !edit;
    cam.enabled = cameraOn(s);
    selection.enabled = pickingOn(s);
    if (!edit) {
      selection.cancelBox();
      rect.cancel();
      gridMenu.hidden = true;
    }
    hierarchy.setReadOnly(!edit);
    project.setReadOnly(!edit);
    inspWrap.disabled = !edit;
    root.classList.toggle('ed-playing', s === 'jogando');
    root.classList.toggle('ed-paused', s === 'pausado');
    const b = buttonsOf(s);
    for (const k of ['play', 'pause', 'stop'] as const) {
      button(k).disabled = !b[k].enabled;
      button(k).classList.toggle('ed-on', b[k].on);
    }
    for (const k of EDITING) button(k).disabled = !edit;
    button('focus').disabled = !cameraOn(s);
    // The thumbnails wait while the game plays (it has the GPU).
    thumbs.hold(s === 'jogando');
    // A controller plays the game: the editor's menus don't follow it meanwhile (the Gamepad API is the whole browser's).
    if (s === 'jogando' && gamepad.onMenu) {
      padMenu = gamepad.onMenu;
      gamepad.onMenu = null;
    } else if (s !== 'jogando' && padMenu) {
      gamepad.onMenu = padMenu;
      padMenu = null;
    }
    if (edit) {
      game = null;
      gameEl.textContent = et('gameIdle');
      button('undo').disabled = !doc.history.canUndo;
      button('redo').disabled = !doc.history.canRedo;
      button('save').disabled = !budget.fits;
      dock.show('scene');
    } else status(et(s === 'jogando' ? 'playing' : 'paused'));
    attach();
  };
  session.onState = (s) => setPlay(s);

  const save = async () => {
    if (!editable()) return;
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

  budget.onChange = () => (button('save').disabled = !budget.fits || !editable());
  button('save').disabled = true;

  /** Leaving on purpose (the Exit button asked already). */
  let leaving = false;

  // --- Buttons and keys ---------------------------------------------------------------------------------------
  const TOOLS: Tool[] = ['hand', 'translate', 'rotate', 'scale', 'rect'];
  /** Q W E R T: the hand pans (no gizmo), move, rotate and scale are the gizmo's, the rect is the Rect tool. */
  const setTool = (t: Tool) => {
    tool = t;
    if (t === 'translate' || t === 'rotate' || t === 'scale') gizmo.setMode(t);
    for (const k of TOOLS) button(k).classList.toggle('ed-on', k === t);
    attach();
  };
  /** The handle settings shown on their buttons, kept in the browser and applied. */
  const showPrefs = () => {
    const pv = button('pivotMode');
    pv.textContent = et(prefs.center ? 'center' : 'pivot');
    pv.title = et('pivotTip');
    const sp = button('spaceMode');
    sp.textContent = et(prefs.global ? 'global' : 'local');
    sp.title = et('spaceTip');
    const g = button('grid');
    g.textContent = `▦ ${et('grid')}`;
    g.title = et('gridTip');
    g.classList.toggle('ed-on', prefs.grid);
    applySnap();
  };
  const setPrefs = (p: Partial<ToolPrefs>) => {
    prefs = { ...prefs, ...p };
    try {
      localStorage.setItem(PREFS_KEY, writePrefs(prefs));
    } catch {
      // Private window without storage: the settings last while the editor is open.
    }
    showPrefs();
    attach();
  };
  const gridMenu = $<HTMLElement>('.ed-gridmenu');
  $('.ed-gridtitle').textContent = et('gridMenu');
  $('.ed-gridmove').textContent = et('gridMove');
  $('.ed-gridturn').textContent = et('gridTurn');
  for (const input of gridMenu.querySelectorAll<HTMLInputElement>('input[data-step]')) {
    const which = input.dataset.step as 'move' | 'turn';
    input.value = String(prefs[which]);
    input.onchange = () => {
      const v = parseStep(input.value, which === 'move' ? MOVE_RANGE : TURN_RANGE);
      input.classList.toggle('ed-bad', v === null);
      if (v !== null) setPrefs({ [which]: v });
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        input.blur();
        if (e.key === 'Escape') gridMenu.hidden = true;
      }
    };
  }
  document.addEventListener('pointerdown', (e) => {
    if (!gridMenu.contains(e.target as Node) && e.target !== button('gridMenu')) gridMenu.hidden = true;
  });
  showPrefs();

  const actions: Record<string, () => void> = {
    undo: () => doc.undo(),
    redo: () => doc.redo(),
    hand: () => setTool('hand'),
    translate: () => setTool('translate'),
    rotate: () => setTool('rotate'),
    scale: () => setTool('scale'),
    rect: () => setTool('rect'),
    pivotMode: () => setPrefs({ center: !prefs.center }),
    spaceMode: () => setPrefs({ global: !prefs.global }),
    grid: () => setPrefs({ grid: !prefs.grid }),
    gridMenu: () => (gridMenu.hidden = !gridMenu.hidden),
    focus,
    duplicate: () => void duplicate(),
    remove,
    // ▶ ❚❚ ■ as Unity's (the session is client/editor/playMode.ts); a map that can't be built isn't played.
    play: () => {
      if (play === 'editando' && budget.state.kind === 'invalido') return status(et('testInvalid'), true);
      // Going on from the pause: the game in front again (it takes the mouse back).
      if (play === 'pausado') dock.show('game');
      void session.press('play');
    },
    pause: () => {
      // Going on (❚❚ again) brings the Game tab back to the front, as ▶ does.
      if (play === 'pausado') dock.show('game');
      void session.press('pause');
    },
    stop: () => void session.press('stop'),
    layout: () => (layoutMenu.hidden = !layoutMenu.hidden),
    layoutReset: () => {
      layoutMenu.hidden = true;
      dock.restore();
    },
    save: () => void save(),
    exit: () => {
      if ((doc.dirty || restored) && !confirm(et('exitConfirm'))) return;
      void session.press('stop');
      leaving = true;
      // Leaving on purpose throws the unsaved edits away (the question said so): the draft goes with them.
      void forgetDraft(keyNow()).finally(() => location.reload());
    },
  };
  for (const [a, f] of Object.entries(actions)) button(a).onclick = f;
  button('undo').disabled = button('redo').disabled = true;
  setTool('translate');

  /** What each of Unity's keys does (client/editor/shortcuts.ts says which key is which). */
  const keyActions: Record<EditorAction, () => void> = {
    undo: actions.undo,
    redo: actions.redo,
    hand: actions.hand,
    translate: actions.translate,
    rotate: actions.rotate,
    scale: actions.scale,
    rect: actions.rect,
    focus,
    remove,
    duplicate: actions.duplicate,
    clear: () => selection.set(null),
    copy,
    paste: () => void paste(),
    selectAll: () => selectPieces(doc.data.pecas.map((p) => p.id)),
    group: () => void group(true),
    rename: () => {
      const id = selection.pieceIds.pop();
      if (!id) return;
      dock.show('hierarchy');
      hierarchy.rename(id);
    },
  };
  window.addEventListener('keydown', (e) => {
    if (root.querySelector('.ed-modal')) return;
    // Esc first gives up a box or a Rect drag under way.
    if (e.code === 'Escape' && !typing() && (selection.cancelBox() || rect.cancel())) {
      e.preventDefault();
      return;
    }
    const a = shortcutOf(e, { typing: typing(), flying: cam.flying });
    // While the map is played, no shortcut; paused, only the ones that look (F, Esc, Ctrl+C, Ctrl+A).
    if (!a || !shortcutAllowed(play, a)) return;
    e.preventDefault();
    if (gizmo.dragging || rect.dragging || selection.boxing) return;
    keyActions[a]();
  });
  // Closing the tab with unsaved edits asks first (leaving by the Exit button, or to the current version, asked already).
  window.addEventListener('beforeunload', (e) => {
    if (doc.dirty && !leaving) e.preventDefault();
  });

  title();
  attach();
  budget.schedule();
  if (restored && !o.rascunho) status(et('draftRecovered'));

  // Dev-only handle for automated smoke tests and console poking (like the game's __oc).
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __ocEditor: {
        THREE, doc, selection, gizmo, markers, handles, budget, target, actions, keyActions, addPiece, addMarkerAt, importGlb, dock, hierarchy, inspector, renderer: ctx.renderer, cam, rect, setTool, copy, paste,
        project, thumbs, session, makeItem, placePiece, sceneSpot, hierarchySpot,
        get game() {
          return game;
        },
        get play() {
          return play;
        },
        get prefs() {
          return prefs;
        },
        get tool() {
          return tool;
        },
        get clip() {
          return clip;
        },
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
  let frameNo = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // The game's page follows the Game panel wherever it's docked.
    game?.place();
    fit();
    cam.update(dt);
    view.update(dt, camera.position);
    if (tool === 'rect') {
      syncRect();
      rect.update();
    }
    viewGizmo.update(cam.state.yaw, cam.state.pitch, cam.orthographic);
    // Drawn while the Scene shows (another tab over it: nothing to draw); while the map is played, a frame in four
    // (the game has the GPU).
    if (sceneEl.clientWidth > 0 && sceneEl.clientHeight > 0 && (play !== 'jogando' || frameNo++ % 4 === 0)) {
      // The shadow map is refreshed on demand: without this it was never drawn (PF-6 Revisions 01).
      o.quality.beforeRender();
      ctx.render(cam.active);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
