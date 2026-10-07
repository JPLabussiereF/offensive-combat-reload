// The editor's look (panels over the 3D view), added to the page when the editor opens.
const CSS = `
#editor { position: fixed; inset: 0; pointer-events: none; z-index: 50; font: 13px/1.35 system-ui, sans-serif; color: #eef2f6; }
#editor .ed-panel { pointer-events: auto; background: rgba(18, 22, 30, 0.92); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; box-shadow: 0 4px 18px rgba(0,0,0,0.35); }
#editor .ed-top { position: absolute; top: 8px; left: 8px; right: 8px; display: flex; gap: 6px; align-items: center; padding: 6px 8px; flex-wrap: wrap; }
#editor .ed-top .ed-title { font-weight: 700; margin-right: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 30vw; }
#editor .ed-top .ed-spacer { flex: 1; }
#editor button { font: inherit; color: inherit; background: #2a3342; border: 1px solid #3c4759; border-radius: 6px; padding: 4px 9px; cursor: pointer; }
#editor button:hover:not(:disabled) { background: #36435a; }
#editor button:disabled { opacity: 0.45; cursor: default; }
#editor button.ed-on { background: #2f6fd6; border-color: #4d8bf0; }
#editor button.ed-primary { background: #1f9d55; border-color: #2fbf6c; font-weight: 600; }
#editor button.ed-danger { background: #8f2a2a; border-color: #b53c3c; margin-top: 8px; }
#editor button.ed-mini { padding: 1px 6px; font-size: 12px; margin: 2px 0; }
#editor .ed-left { position: absolute; top: 58px; left: 8px; bottom: 64px; width: 230px; padding: 8px; overflow-y: auto; }
#editor .ed-right { position: absolute; top: 58px; right: 8px; bottom: 64px; width: 320px; padding: 8px 10px; overflow-y: auto; }
#editor .ed-bottom { position: absolute; left: 8px; right: 8px; bottom: 8px; padding: 6px 10px; display: flex; gap: 12px; align-items: center; min-height: 40px; }
#editor .ed-hint { opacity: 0.65; font-size: 12px; flex: 1; }
#editor .ed-status { font-weight: 600; max-width: 40vw; }
#editor .ed-status.ed-err { color: #ff8a8a; }
#editor .ed-search { width: 100%; box-sizing: border-box; margin-bottom: 6px; }
#editor .ed-cat { display: block; width: 100%; text-align: left; margin-top: 6px; font-weight: 700; background: transparent; border: none; padding: 3px 2px; color: #9fc4ff; }
#editor .ed-entry { display: block; width: 100%; text-align: left; margin: 1px 0; padding: 3px 8px; background: transparent; border-color: transparent; }
#editor .ed-entry:hover:not(:disabled) { background: #2a3342; }
#editor input, #editor select, #editor textarea { font: inherit; color: #eef2f6; background: #0f141c; border: 1px solid #3c4759; border-radius: 4px; padding: 2px 5px; }
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
#editor .ed-budget { flex: 0 1 auto; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
#editor .ed-budget.ed-over { color: #ffb0b0; }
#editor .ed-budget details { max-height: 30vh; overflow: auto; }
#editor .ed-meter { display: inline-block; width: 80px; height: 8px; background: #0f141c; border-radius: 4px; overflow: hidden; }
#editor .ed-meter i { display: block; height: 100%; background: #2fbf6c; }
#editor .ed-meter i.ed-meter-over { background: #ff5a5a; }
#editor .ed-modal { position: absolute; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; pointer-events: auto; }
#editor .ed-dialog { background: #161b24; border: 1px solid #3c4759; border-radius: 10px; padding: 14px 16px; width: min(440px, 92vw); max-height: 86vh; overflow: auto; }
#editor .ed-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
#editor .ed-msg.ed-err { color: #ff9a9a; }
#editor .ed-msg.ed-ok { color: #8ff0b0; }
#editor .ed-msg ul { margin: 4px 0; padding-left: 18px; max-height: 30vh; overflow: auto; font-size: 12px; }
#editor .ed-stale { display: grid; gap: 4px; margin-top: 8px; }
#editor .ed-stale[hidden] { display: none; }
#editor .ed-stale small { opacity: 0.75; font-size: 12px; margin-bottom: 6px; }
#editor .ed-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 18px; background: rgba(10,12,18,0.6); pointer-events: auto; }
`;

export function injectEditorStyle() {
  if (document.getElementById('editor-style')) return;
  const s = document.createElement('style');
  s.id = 'editor-style';
  s.textContent = CSS;
  document.head.append(s);
}
