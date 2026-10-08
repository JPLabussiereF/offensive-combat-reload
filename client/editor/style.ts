// The editor's look, added to the page when the editor opens: Unity's window (Revisions 01): the toolbar on top,
// the dockable panels (client/editor/dock.ts) filling the middle, the status bar below.
const CSS = `
#editor { position: fixed; inset: 0; z-index: 50; display: flex; flex-direction: column; font: 13px/1.35 system-ui, sans-serif; color: #eef2f6; background: #1b2029; user-select: none; }
#editor button { font: inherit; color: inherit; background: #2a3342; border: 1px solid #3c4759; border-radius: 5px; padding: 3px 9px; cursor: pointer; }
#editor button:hover:not(:disabled) { background: #36435a; }
#editor button:disabled { opacity: 0.45; cursor: default; }
#editor button.ed-on { background: #2f6fd6; border-color: #4d8bf0; }
#editor button.ed-primary { background: #1f9d55; border-color: #2fbf6c; font-weight: 600; }
#editor button.ed-danger { background: #8f2a2a; border-color: #b53c3c; margin-top: 8px; }
#editor button.ed-mini { padding: 1px 6px; font-size: 12px; margin: 2px 0; }
#editor button.ed-icon { min-width: 34px; }

/* Toolbar */
#editor .ed-toolbar { flex: 0 0 auto; display: flex; gap: 8px; align-items: center; padding: 5px 8px; background: #232a35; border-bottom: 1px solid #10141b; }
#editor .ed-title { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 26vw; }
#editor .ed-tgroup { display: flex; gap: 2px; align-items: center; position: relative; }
#editor .ed-slot:empty { display: none; }
#editor .ed-spacer { flex: 1; }
#editor .ed-play button { padding: 3px 10px; }
#editor .ed-menu { position: absolute; top: 100%; right: 0; margin-top: 4px; display: flex; flex-direction: column; gap: 2px; padding: 4px; background: #161b24; border: 1px solid #3c4759; border-radius: 6px; z-index: 20; min-width: 180px; box-shadow: 0 6px 18px rgba(0,0,0,0.4); }
#editor .ed-menu[hidden] { display: none; }
#editor .ed-menu button { text-align: left; background: transparent; border-color: transparent; white-space: nowrap; }
#editor .ed-menu button:hover { background: #2a3342; }

/* Docking */
#editor .ed-dock { flex: 1 1 auto; position: relative; min-height: 0; display: flex; }
#editor .ed-dock > .ed-split, #editor .ed-dock > .ed-stack { flex: 1; }
#editor .ed-split { display: flex; min-width: 0; min-height: 0; width: 100%; height: 100%; }
#editor .ed-split.ed-split-row { flex-direction: row; }
#editor .ed-split.ed-split-col { flex-direction: column; }
#editor .ed-pane { display: flex; min-width: 0; min-height: 0; overflow: hidden; }
#editor .ed-splitter { flex: 0 0 4px; background: #10141b; }
#editor .ed-splitter-row { cursor: col-resize; }
#editor .ed-splitter-col { cursor: row-resize; }
#editor .ed-splitter:hover { background: #2f6fd6; }
#editor .ed-stack { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; background: #1f252f; }
#editor .ed-tabs { flex: 0 0 auto; display: flex; gap: 1px; background: #161b23; padding: 2px 2px 0; overflow: hidden; }
#editor .ed-tab { border-radius: 5px 5px 0 0; border-bottom: none; background: #1a2029; padding: 3px 12px; font-size: 12px; opacity: 0.75; cursor: grab; }
#editor .ed-tab.ed-tab-on { background: #262e3a; opacity: 1; font-weight: 600; }
#editor .ed-tab.ed-tab-drag { opacity: 0.5; cursor: grabbing; }
#editor .ed-stack-body { flex: 1; min-height: 0; position: relative; background: #262e3a; }
#editor .ed-panel-body { position: absolute; inset: 0; overflow: auto; padding: 6px 8px; }
#editor .ed-panel-body[hidden] { display: none; }
#editor .ed-scene { padding: 0; overflow: hidden; background: #000; }
#editor .ed-boxsel { position: absolute; border: 1px solid #8fb8ff; background: rgba(77,139,240,0.18); pointer-events: none; z-index: 5; }
#editor .ed-boxsel[hidden] { display: none; }
#editor .ed-rect { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 4; overflow: visible; }
#editor .ed-rect-body { fill: rgba(255,255,255,0.04); stroke: #f0f4ff; stroke-width: 1.5; pointer-events: all; cursor: move; }
#editor .ed-rect-body.ed-rect-move { stroke-dasharray: 5 4; }
#editor .ed-rect-handle { fill: #2f6fd6; stroke: #fff; stroke-width: 1.2; pointer-events: all; cursor: crosshair; }
#editor .ed-viewgizmo { position: absolute; top: 6px; right: 6px; display: flex; flex-direction: column; align-items: center; z-index: 6; user-select: none; }
#editor .ed-viewgizmo svg { overflow: visible; }
#editor .ed-vg-axis, #editor .ed-vg-middle { cursor: pointer; }
#editor .ed-vg-axis:hover { stroke: #fff; stroke-width: 2; }
#editor .ed-vg-middle { fill: #d9dee6; stroke: #5b6576; }
#editor .ed-vg-middle:hover { fill: #fff; }
#editor .ed-vg-text { font: 700 10px system-ui, sans-serif; fill: #10141b; pointer-events: none; }
#editor button.ed-vg-label { padding: 0 6px; font-size: 11px; background: rgba(22,27,36,0.75); border-color: transparent; }
#editor .ed-gridmenu { min-width: 200px; padding: 6px 8px; left: 0; right: auto; }
#editor button.ed-caret { padding: 3px 4px; min-width: 0; }
#editor .ed-gridmenu .ed-row > span:first-child { flex: 0 0 100px; }
#editor .ed-gridmenu input { width: 64px; flex: 0 0 auto; }
#editor .ed-drop { position: absolute; background: rgba(47,111,214,0.28); border: 2px solid #4d8bf0; border-radius: 4px; pointer-events: none; z-index: 30; }
#editor .ed-drop[hidden] { display: none; }

/* Hierarchy */
#editor .ed-hierarchy { display: flex; flex-direction: column; padding: 0; }
#editor .ed-hier-bar { display: flex; gap: 4px; padding: 4px 6px; position: relative; border-bottom: 1px solid #1a1f27; }
#editor .ed-hier-bar input { flex: 1; min-width: 0; }
#editor .ed-hier-bar .ed-menu { left: 6px; right: auto; }
#editor .ed-hier-list { flex: 1; overflow: auto; padding: 2px 0 40px; outline: none; }
#editor .ed-hrow { display: flex; gap: 4px; align-items: center; padding: 1px 6px; white-space: nowrap; cursor: default; border-top: 2px solid transparent; border-bottom: 2px solid transparent; }
#editor .ed-hrow:hover { background: #2c3544; }
#editor .ed-hrow.ed-hsel { background: #2c5aa8; }
#editor .ed-harrow { flex: 0 0 12px; text-align: center; opacity: 0.8; cursor: pointer; }
#editor .ed-hname { overflow: hidden; text-overflow: ellipsis; }
#editor .ed-hgroup .ed-hname { color: #d9c4ff; }
#editor .ed-hkind { margin-left: auto; padding-left: 8px; opacity: 0.45; font-size: 11px; }
#editor .ed-hmarkers { margin-top: 6px; color: #9fc4ff; font-weight: 600; cursor: pointer; }
#editor .ed-hrow.ed-hdrop-before { border-top-color: #4d8bf0; }
#editor .ed-hrow.ed-hdrop-after { border-bottom-color: #4d8bf0; }
#editor .ed-hrow.ed-hdrop-into { background: #2f6fd6; }
#editor .ed-hrename { flex: 1; min-width: 0; padding: 0 3px; }

/* Inspector */
#editor .ed-ihead { margin-bottom: 6px; }
#editor .ed-iname { width: 100%; box-sizing: border-box; font-weight: 600; }
#editor .ed-comp { margin: 8px 0; }
#editor .ed-comp > legend { font-weight: 700; color: #9fc4ff; padding: 0 4px; }
#editor .ed-trow > span:first-child { flex: 0 0 74px; }
#editor .ed-axisfield { display: inline-flex; align-items: center; gap: 2px; }
#editor .ed-axis { cursor: ew-resize; padding: 0 3px; opacity: 0.8; font-weight: 700; }
#editor .ed-axis:hover { color: #4d8bf0; opacity: 1; }
#editor .ed-trow input[type=number] { width: 64px; }
#editor .ed-mixed > span:first-child::after { content: ' ≠'; color: #ffcf6a; }

/* Project (Unity's asset browser: folders, thumbnails) */
#editor .ed-search { width: 100%; box-sizing: border-box; margin-bottom: 6px; }
#editor .ed-proj { display: flex; flex-direction: column; padding: 0; overflow: hidden; }
#editor .ed-proj-bar { flex: 0 0 auto; display: flex; gap: 8px; align-items: center; padding: 4px 6px; border-bottom: 1px solid #1a1f27; }
#editor .ed-proj-bar .ed-search { margin: 0; flex: 0 1 260px; width: auto; min-width: 80px; }
#editor .ed-proj-progress { flex: 1; opacity: 0.6; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#editor .ed-proj-size { width: 110px; flex: 0 0 auto; }
#editor .ed-proj-main { flex: 1; display: flex; min-height: 0; }
#editor .ed-proj-tree { flex: 0 0 170px; overflow: auto; border-right: 1px solid #1a1f27; padding: 4px; display: flex; flex-direction: column; gap: 1px; }
#editor button.ed-folder { display: flex; gap: 5px; text-align: left; background: transparent; border-color: transparent; white-space: nowrap; }
#editor button.ed-folder.ed-folder-on { background: #2c5aa8; }
#editor .ed-folder-n { margin-left: auto; opacity: 0.5; font-size: 11px; }
#editor .ed-proj-grid { flex: 1; overflow: auto; padding: 6px; display: grid; grid-template-columns: repeat(auto-fill, minmax(calc(var(--tile) + 10px), 1fr)); gap: 4px; align-content: start; }
#editor .ed-tile { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 4px; border-radius: 6px; border: 1px solid transparent; cursor: grab; outline: none; min-width: 0; }
#editor button.ed-tile { background: transparent; border-color: transparent; cursor: pointer; }
#editor .ed-tile:hover { background: #2c3544; }
#editor .ed-tile.ed-tile-on, #editor .ed-tile:focus-visible { background: #2c5aa8; border-color: #4d8bf0; }
#editor .ed-tile.ed-tile-off { opacity: 0.4; cursor: not-allowed; }
#editor .ed-thumb { width: var(--tile); height: var(--tile); display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at 50% 38%, #3b475b, #20262f 72%); border-radius: 5px; overflow: hidden; pointer-events: none; }
#editor .ed-thumb img { width: 100%; height: 100%; object-fit: contain; }
#editor .ed-thumb-glyph { font-size: calc(var(--tile) * 0.42); line-height: 1; }
#editor .ed-thumb-wait { width: 28%; height: 28%; border-radius: 50%; border: 3px solid #4d8bf0; border-top-color: transparent; animation: ed-spin 0.9s linear infinite; opacity: 0.7; }
@keyframes ed-spin { to { transform: rotate(360deg); } }
#editor .ed-tile-name { font-size: 11px; text-align: center; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#editor .ed-proj-empty { opacity: 0.6; padding: 8px; grid-column: 1 / -1; }

/* Game (Play inside the editor): the game's page is laid over this panel */
#editor .ed-game { display: flex; align-items: center; justify-content: center; text-align: center; background: #0d1117; color: #9aa6b8; padding: 20px; }
#editor .ed-gameframe { position: absolute; border: 0; z-index: 10; background: #000; }
#editor .ed-dock.ed-docking ~ .ed-gameframe { pointer-events: none; }
/* Playing and paused: the toolbar tinted, as Unity's play mode */
#editor.ed-playing .ed-toolbar { background: #2b3d63; }
#editor.ed-paused .ed-toolbar { background: #4d4326; }
#editor fieldset.ed-insp-wrap { border: 0; margin: 0; padding: 0; min-width: 0; }

/* Forms */
#editor input, #editor select, #editor textarea { font: inherit; color: #eef2f6; background: #0f141c; border: 1px solid #3c4759; border-radius: 4px; padding: 2px 5px; user-select: text; }
#editor input[type=number] { width: 72px; }
#editor input[type=color] { padding: 0; width: 42px; height: 24px; }
#editor textarea { width: 100%; box-sizing: border-box; font-family: ui-monospace, monospace; font-size: 11px; }
#editor .ed-bad { border-color: #ff5a5a; }
#editor h3 { margin: 2px 0 8px; font-size: 14px; }
#editor .ed-row { display: flex; gap: 6px; align-items: flex-start; margin: 4px 0; }
#editor .ed-row > span:first-child { flex: 0 0 96px; opacity: 0.8; padding-top: 3px; overflow-wrap: anywhere; }
#editor .ed-row > .ed-param, #editor .ed-row > input, #editor .ed-row > select { flex: 1; min-width: 0; }
#editor .ed-vec { display: inline-flex; gap: 3px; flex-wrap: wrap; }
#editor .ed-vec input { width: 62px; }
#editor .ed-obj { border: 1px solid #3c4759; border-radius: 6px; padding: 4px 6px; margin: 6px 0; }
#editor .ed-list { display: flex; flex-direction: column; gap: 2px; }
#editor .ed-item { display: flex; gap: 4px; align-items: flex-start; border-left: 2px solid #3c4759; padding-left: 4px; }
#editor .ed-kind, #editor .ed-note { opacity: 0.75; font-size: 12px; margin: 2px 0 6px; }

/* Status bar */
#editor .ed-statusbar { flex: 0 0 auto; display: flex; gap: 12px; align-items: center; padding: 4px 10px; min-height: 30px; background: #232a35; border-top: 1px solid #10141b; }
#editor .ed-hint { opacity: 0.6; font-size: 12px; flex: 1; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#editor .ed-status { font-weight: 600; max-width: 40vw; }
#editor .ed-status.ed-err { color: #ff8a8a; }
#editor .ed-budget { flex: 0 1 auto; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
#editor .ed-budget.ed-over { color: #ffb0b0; }
#editor .ed-budget .ed-budget-warn { color: #ffd27a; }
#editor .ed-budget details { max-height: 30vh; overflow: auto; }
#editor .ed-meter { display: inline-block; width: 80px; height: 8px; background: #0f141c; border-radius: 4px; overflow: hidden; }
#editor .ed-meter i { display: block; height: 100%; background: #2fbf6c; }
#editor .ed-meter i.ed-meter-over { background: #ff5a5a; }

/* Dialogs */
#editor .ed-modal { position: absolute; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 60; }
#editor .ed-dialog { background: #161b24; border: 1px solid #3c4759; border-radius: 10px; padding: 14px 16px; width: min(440px, 92vw); max-height: 86vh; overflow: auto; }
#editor .ed-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
#editor .ed-msg.ed-err { color: #ff9a9a; }
#editor .ed-msg.ed-ok { color: #8ff0b0; }
#editor .ed-msg ul { margin: 4px 0; padding-left: 18px; max-height: 30vh; overflow: auto; font-size: 12px; }
#editor .ed-stale { display: grid; gap: 4px; margin-top: 8px; }
#editor .ed-stale[hidden] { display: none; }
#editor .ed-stale small { opacity: 0.75; font-size: 12px; margin-bottom: 6px; }
#editor .ed-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 18px; background: rgba(10,12,18,0.85); z-index: 45; }
`;

export function injectEditorStyle() {
  if (document.getElementById('editor-style')) return;
  const s = document.createElement('style');
  s.id = 'editor-style';
  s.textContent = CSS;
  document.head.append(s);
}
