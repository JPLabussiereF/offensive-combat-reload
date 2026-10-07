// The home's Arsenal tab as a canvas (PF-9, design "Arsenal Canvas"): a world the player drags around and zooms (the
// wheel, a pinch, the − / + buttons; 25% to 200%), with one frame per slot, the slot's weapons linked side by side
// and, under the weapon shown, its progression's upgrades in labeled rows by kind (sights, grenade modes, the rest;
// PF-9 revision 01). Each upgrade turns on and off right on its node; clicking a weapon opens a panel on the right
// (equip, progress, stats, description, the upgrade picked). Jump buttons, a minimap and "show all" move the camera.
// The data is the tree's (client/ui/arsenalTree.ts) and saving is Progress's, as in the pause menu's tree
// (client/ui/arsenal.ts), which stays as it is. With a controller the focus
// moves from node to node and the camera follows it; the right stick pans (client/ui/padNav.ts, `pad-pan`).
// The geometry and the camera math are client/ui/arsenalCanvasLayout.ts.
import { isGun, isKnife, progOf, upgradeOf, type ProgWeapon, type WeaponId } from '@shared/progression';
import type { Progress } from '../gameplay/progress';
import { effectChips, esc, gunStatBars, num, progName, upgradeName, weaponIcon, weaponName } from './arsenal';
import { arsenalTree, upgradeNodes, type RowId, type TreeRow, type UpgradeNode, type WeaponNode } from './arsenalTree';
import {
  canvasLayout,
  clampZoom,
  fitView,
  homeView,
  revealView,
  rowView,
  UH,
  UW,
  weaponView,
  WH,
  WW,
  zoomAt,
  type Cam,
  type CanvasLayout,
} from './arsenalCanvasLayout';
import { t, type StringKey } from './strings';

const str = (key: string, params?: Record<string, string | number>) => t(key as StringKey, params);

/** The icon tile's tint per slot (the design's). */
const TINT: Record<RowId, string> = { primaria: '#ffe2b8', secundaria: '#cfe8ff', faca: '#dff5d3', granada: '#fff0b8' };
/** The details panel's width (the free width for the camera is the viewport minus this when it is open). */
const PW = 340;
const MINI_W = 184;
const MINI_H = 108;
const INK = '#1b1530';

interface Pointer {
  x: number;
  y: number;
}

export class ArsenalCanvas {
  private progress: Progress | null = null;
  private cam: Cam = { x: 40, y: 76, z: 0.8 };
  /** The first view was set (the tab may start hidden, with no size). */
  private homed = false;
  /** The weapon whose chain hangs under each row (clicked), else the one in hand. */
  private viewed: Partial<Record<RowId, WeaponId>> = {};
  /** The weapon whose panel is open, and the upgrade picked in it. */
  private sel: WeaponId | null = null;
  private selUpg: string | null = null;
  /** The panel keeps showing the last weapon while it slides out. */
  private lastSel: WeaponId | null = null;
  private L: CanvasLayout | null = null;
  private mini = { bx: 0, by: 0, s: 1, ox: 0, oy: 0 };
  private flyId = 0;
  private pointers = new Map<number, Pointer>();
  private drag: { id: number; sx: number; sy: number; cx: number; cy: number; moved: boolean } | null = null;
  private pinch: { d: number; m: Pointer; cam: Cam } | null = null;
  private justDragged = false;
  private miniDrag = false;
  private hideTimer = 0;

  private readonly vp: HTMLElement;
  private readonly world: HTMLElement;
  private readonly frames: HTMLElement;
  private readonly links: SVGSVGElement;
  private readonly nodes: HTMLElement;
  private readonly jumps: HTMLElement;
  private readonly miniEl: HTMLElement;
  private readonly miniBox: HTMLElement;
  private readonly miniRects: HTMLElement;
  private readonly miniVp: HTMLElement;
  private readonly tools: HTMLElement;
  private readonly zoomLbl: HTMLElement;
  private readonly panel: HTMLElement;

  constructor(private root: HTMLElement) {
    root.classList.add('cv');
    root.innerHTML = `<div class="cv-viewport" data-pad-pan>
      <div class="cv-world"><div class="cv-frames"></div><svg class="cv-links" width="1" height="1"></svg><div class="cv-nodes"></div></div>
      <div class="cv-jumps" data-ui></div>
      <div class="cv-mini" data-ui><div class="cv-mini-box"><div class="cv-mini-rects"></div><div class="cv-mini-vp"></div></div></div>
      <div class="cv-tools" data-ui>
        <button type="button" class="cv-tool" data-zoom="0.8" data-t-title="cvZoomOut">−</button>
        <span class="cv-zoom"></span>
        <button type="button" class="cv-tool" data-zoom="1.25" data-t-title="cvZoomIn">+</button>
        <i class="cv-sep"></i>
        <button type="button" class="cv-tool cv-fit" data-fit></button>
      </div>
      <aside class="cv-panel" data-ui hidden></aside>
    </div>`;
    const q = <T extends Element = HTMLElement>(s: string) => root.querySelector(s) as T;
    this.vp = q('.cv-viewport');
    this.world = q('.cv-world');
    this.frames = q('.cv-frames');
    this.links = q<SVGSVGElement>('.cv-links');
    this.nodes = q('.cv-nodes');
    this.jumps = q('.cv-jumps');
    this.miniEl = q('.cv-mini');
    this.miniBox = q('.cv-mini-box');
    this.miniRects = q('.cv-mini-rects');
    this.miniVp = q('.cv-mini-vp');
    this.tools = q('.cv-tools');
    this.zoomLbl = q('.cv-zoom');
    this.panel = q('.cv-panel');

    this.vp.addEventListener('pointerdown', (e) => this.onDown(e));
    this.vp.addEventListener('pointermove', (e) => this.onMove(e));
    this.vp.addEventListener('pointerup', (e) => this.onUp(e));
    this.vp.addEventListener('pointercancel', (e) => this.onUp(e));
    this.vp.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.vp.addEventListener('click', (e) => this.onClick(e));
    // The keyboard or a controller reaching a node: the camera follows it. Focusing never scrolls the viewport.
    this.vp.addEventListener('focusin', (e) => this.onFocus(e.target as HTMLElement));
    this.vp.addEventListener('scroll', () => {
      this.vp.scrollLeft = 0;
      this.vp.scrollTop = 0;
    });
    this.vp.addEventListener('pad-pan', (e) => {
      const { dx, dy } = (e as CustomEvent<{ dx: number; dy: number }>).detail;
      this.stopFly();
      this.cam = { ...this.cam, x: this.cam.x + dx, y: this.cam.y + dy };
      this.apply();
    });
    this.miniEl.addEventListener('pointerdown', (e) => {
      this.miniDrag = true;
      try {
        this.miniEl.setPointerCapture(e.pointerId);
      } catch {
        /* the pointer is gone */
      }
      this.miniJump(e);
    });
    this.miniEl.addEventListener('pointermove', (e) => {
      if (this.miniDrag) this.miniJump(e);
    });
    const miniUp = () => (this.miniDrag = false);
    this.miniEl.addEventListener('pointerup', miniUp);
    this.miniEl.addEventListener('pointercancel', miniUp);
    window.addEventListener('keydown', (e) => this.onKey(e));
    new ResizeObserver(() => this.resized()).observe(this.vp);
    this.texts();
  }

  /** The account's progress (a new one after every account load); null without an account. */
  attach(progress: Progress | null) {
    this.progress = progress;
    progress?.onChange(() => {
      if (this.progress === progress) this.render();
    });
    this.render();
  }

  /** The tab was opened: the first time it has a size, frame everything (the camera then stays as the player left it). */
  shown() {
    this.resized();
  }

  // ---- drawing

  private texts() {
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-t-title]')) el.title = str(el.dataset.tTitle!);
    this.root.querySelector<HTMLElement>('[data-fit]')!.textContent = t('cvFitAll');
    this.root.querySelector<HTMLElement>('[data-fit]')!.title = t('cvFitTitle');
  }

  /** The weapon whose chain hangs under a row: the one clicked, else the one in hand, else the first. */
  private shownOf(r: TreeRow): WeaponNode {
    return r.armas.find((n) => n.arma === this.viewed[r.id]) ?? r.armas.find((n) => n.equipada) ?? r.armas[0];
  }

  render() {
    const p = this.progress;
    if (!p) {
      this.frames.innerHTML = this.nodes.innerHTML = this.links.innerHTML = this.jumps.innerHTML = this.miniRects.innerHTML = '';
      this.L = null;
      return;
    }
    // Keep the focus where it was (a controller or the keyboard moving through the canvas).
    const focused = document.activeElement as HTMLElement | null;
    const key = focused && this.root.contains(focused) ? focused.dataset.key : undefined;

    this.texts();
    const rows = arsenalTree(p.weaponXp, p.choice);
    const shown: Partial<Record<RowId, WeaponId>> = {};
    const ups: Partial<Record<RowId, UpgradeNode[]>> = {};
    for (const r of rows) {
      const w = this.shownOf(r).arma;
      shown[r.id] = w;
      ups[r.id] = upgradeNodes(w, p.weaponXp, p.choice);
    }
    const L = canvasLayout(rows, shown, ups);
    this.L = L;

    this.frames.innerHTML = L.frames
      .map((f) => {
        const r = rows.find((x) => x.id === f.id)!;
        const eq = r.armas.find((n) => n.equipada);
        const sub = f.id === 'granada' ? t('cvAlwaysEquipped') : eq ? t('cvFrameEquipped', { weapon: weaponName(eq.arma) }) : '';
        return `<div class="cv-frame" style="left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px">
          <div class="cv-frame-head"><span class="cv-frame-label">${esc(str(`cvRow_${f.id}`))}</span><span class="cv-frame-sub">${esc(sub)}</span></div>
        </div>`;
      })
      .join('');
    this.links.innerHTML = L.links
      .map((l) => `<path class="cv-link${l.on ? ' on' : ''}${l.locked ? ' locked' : ''}${l.kind === 'weapon' ? ' w' : ''}" d="${l.d}"></path>`)
      .join('');
    this.nodes.innerHTML =
      L.labels.map((l) => `<span class="cv-row-label" style="left:${l.x}px;top:${l.y}px">${esc(str(`cvUpgRow_${l.kind}`))}</span>`).join('') +
      L.upgrades.map((u) => this.upgradeNode(u.row, u.arma, u.node, u.x, u.y, u.locked, u.on)).join('') +
      L.weapons.map((b) => this.weaponNode(b.row, b.node, b.x, b.y)).join('');

    const selRow = this.sel ? L.weapons.find((b) => b.node.arma === this.sel)?.row : null;
    this.jumps.innerHTML = rows
      .map((r) => `<button type="button" class="cv-jump${selRow === r.id ? ' on' : ''}" data-jump="${r.id}" data-key="cj-${r.id}">${esc(str(`cvRow_${r.id}`))}</button>`)
      .join('');
    this.renderMini();
    this.renderPanel();
    this.apply();
    if (key) this.root.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus({ preventScroll: true });
  }

  private weaponNode(row: RowId, n: WeaponNode, x: number, y: number): string {
    const lv = `${t('level')} ${n.nivel}/${n.max}`;
    const sub = !n.liberada
      ? `🔒 ${t('treeWeaponLocked', { xp: num(n.faltamLiberar, 0), prog: progName(n.liberaCom!) })}`
      : n.equipada
        ? `✓ ${t('treeEquipped')} · ${lv}`
        : lv;
    const cls = `cv-weapon${this.sel === n.arma ? ' sel' : ''}${n.liberada ? '' : ' locked'}${n.equipada ? ' equipped' : ''}`;
    return `<button type="button" class="${cls}" style="left:${x}px;top:${y}px" data-pick-w="${n.arma}" data-row="${row}" data-key="cw-${n.arma}">
      <span class="cv-tile" style="background:${TINT[row]}">${weaponIcon(n.arma, n.ativas)}</span>
      <span class="cv-wtext"><span class="cv-wname">${esc(weaponName(n.arma))}</span><span class="cv-wsub">${esc(sub)}</span></span>
    </button>`;
  }

  private upgradeNode(row: RowId, w: WeaponId, n: UpgradeNode, x: number, y: number, locked: boolean, on: boolean): string {
    const prog = progOf(w);
    const u = upgradeOf(prog, n.id)!;
    const weaponLocked = locked && n.estado !== 'trancada';
    const pill = locked
      ? `<span class="cv-pill locked">🔒 ${esc(weaponLocked ? t('cvWeaponLocked') : t('unlockShort', { xp: num(n.faltam, 0) }))}</span>`
      : `<button type="button" class="cv-pill${on ? ' on' : ''}" data-toggle data-prog="${prog}" data-id="${n.id}" aria-pressed="${on}" data-key="ct-${w}-${n.id}">${t(on ? 'upgradeOn' : 'upgradeOff')}</button>`;
    const isSel = this.sel === w && this.selUpg === n.id;
    const cls = `cv-upg ${locked ? 'locked' : on ? 'on' : 'off'}${isSel ? ' sel' : ''}`;
    return `<div class="${cls}" style="left:${x}px;top:${y}px" data-pick-u="${n.id}" data-w="${w}" data-row="${row}">
      <button type="button" class="cv-upg-main" data-key="cu-${w}-${n.id}">
        <span class="cv-upg-icon">${u.icone}</span><span class="cv-lvl">${u.nivel}</span><span class="cv-upg-name">${esc(upgradeName(prog, n.id))}</span>
      </button>
      <div class="cv-upg-foot">${pill}${n.opcional && !locked ? `<span class="cv-opt">${t('cvOptional')}</span>` : ''}</div>
    </div>`;
  }

  private renderMini() {
    const L = this.L!;
    const b = L.bounds;
    const s = Math.min(MINI_W / b.w, MINI_H / b.h);
    const ox = (MINI_W - b.w * s) / 2;
    const oy = (MINI_H - b.h * s) / 2;
    this.mini = { bx: b.x, by: b.y, s, ox, oy };
    const rect = (x: number, y: number, w: number, h: number, bg: string, r: number) =>
      `<i style="left:${ox + (x - b.x) * s}px;top:${oy + (y - b.y) * s}px;width:${Math.max(1.5, w * s)}px;height:${Math.max(1.5, h * s)}px;background:${bg};border-radius:${r}px"></i>`;
    this.miniRects.innerHTML = [
      ...L.frames.map((f) => rect(f.x, f.y, f.w, f.h, 'rgba(27,21,48,.08)', 4)),
      ...L.upgrades.map((u) => rect(u.x, u.y, UW, UH, u.on ? '#ffb13d' : u.locked ? '#ddd6cb' : '#a49db0', 2)),
      ...L.weapons.map((w) => rect(w.x, w.y, WW, WH, this.sel === w.node.arma ? '#ff7a1a' : w.node.liberada ? INK : '#c9c2b6', 2)),
    ].join('');
  }

  private renderPanel() {
    const open = !!this.sel;
    clearTimeout(this.hideTimer);
    if (open) {
      this.panel.hidden = false;
      // Let the hidden → shown change paint before sliding in.
      this.frame(() => this.panel.classList.toggle('open', !!this.sel));
    } else {
      this.panel.classList.remove('open');
      // Out of the way of the keyboard and the controller once it has slid out.
      this.hideTimer = window.setTimeout(() => (this.panel.hidden = !this.sel), 360);
    }
    const id = this.sel ?? this.lastSel;
    const box = id && this.L ? this.L.weapons.find((b) => b.node.arma === id) : undefined;
    if (!box) {
      this.panel.innerHTML = '';
      return;
    }
    const p = this.progress!;
    const n = box.node;
    const row = box.row;
    const w = n.arma;
    const prog = n.prog;
    const ups = upgradeNodes(w, p.weaponXp, p.choice);
    let action = '';
    if (!n.liberada) {
      action = `<div class="cv-lock">🔒 ${esc(t('treeWeaponLockedLong', { xp: num(n.faltamLiberar, 0), total: num(n.liberaPontos, 0), prog: progName(n.liberaCom!) }))}</div>`;
    } else if (n.equipada) {
      const label = row === 'secundaria' ? t('cvYourSecondary') : row === 'granada' ? t('cvAlwaysEquipped') : t('treeEquipped');
      action = `<div class="cv-equipped">✓ ${esc(label)}</div>`;
    } else {
      const label = row === 'secundaria' ? t('cvEquipSecondary') : t('treeEquip');
      action = `<button type="button" class="cv-equip" data-equip="${w}" data-row="${row}" data-key="ce-${w}">${esc(label)}</button>`;
    }
    const xpText = n.faltamNivel === null ? t('maxLevel', { xp: num(n.xp, 0) }) : t('xpToNext', { xp: num(n.faltamNivel, 0), level: n.nivel + 1 });
    const stats = isGun(w) ? gunStatBars(w, n.ativas) : null;
    const statsHtml = stats
      ? `<div class="cv-stats">${stats.bars.map(([k, v]) => `<span>${t(k)}</span><div class="cv-bar"><div style="width:${(v * 100).toFixed(0)}%"></div></div>`).join('')}<small>${esc(stats.mag)}</small></div>`
      : '';
    const onCount = n.liberada ? ups.filter((u) => u.estado === 'ligada').length : 0;
    const su = this.sel === w && this.selUpg ? ups.find((u) => u.id === this.selUpg) : undefined;
    let upgHtml: string;
    if (su) {
      const u = upgradeOf(prog, su.id)!;
      const locked = su.estado === 'trancada' || !n.liberada;
      const on = !locked && su.estado === 'ligada';
      const chips = effectChips(u.efeitos)
        .map((c) => `<span class="cv-fx ${c.good ? 'good' : 'bad'}">${esc(c.text)}</span>`)
        .join('');
      const replaced = su.substituidaPor ? `<span class="cv-fx opt">${esc(t('upgradeReplacedBy', { upgrade: upgradeName(prog, su.substituidaPor) }))}</span>` : '';
      const control = locked
        ? `<div class="cv-su-lock">🔒 ${esc(!n.liberada ? t('cvUnlockWeaponFirst') : t('treeWeaponLocked', { xp: num(su.faltam, 0), prog: progName(prog) }))}</div>`
        : `<button type="button" class="cv-su-toggle${on ? ' on' : ''}" data-toggle data-prog="${prog}" data-id="${su.id}" aria-pressed="${on}" data-key="cs-${w}-${su.id}">${esc(t(on ? 'cvToggleOn' : 'cvToggleOff'))}</button>`;
      upgHtml = `<div class="cv-su">
        <div class="cv-su-head"><span class="cv-su-icon">${u.icone}</span><span class="cv-lvl">${u.nivel}</span><b>${esc(upgradeName(prog, su.id))}</b></div>
        <p>${esc(str(`upgDesc_${prog}_${su.id}`))}</p>
        <div class="cv-fxs">${u.opcional ? `<span class="cv-fx opt">${t('upgradeOptional')}</span>` : ''}${replaced}${chips}</div>
        ${control}
      </div>`;
    } else {
      upgHtml = `<p class="cv-hint">${esc(t('cvPickUpgrade'))}</p>`;
    }
    this.panel.innerHTML = `<div class="cv-p-head">
        <div class="cv-p-tile${n.liberada ? '' : ' locked'}" style="background:${TINT[row]}">${weaponIcon(w, n.ativas)}</div>
        <div class="cv-p-title"><div class="cv-p-kicker">${esc(str(`cvSlot_${row}`))} · ${t('level')} ${n.nivel}/${n.max}</div><div class="cv-p-name">${esc(weaponName(w))}</div></div>
        <button type="button" class="cv-close" data-close data-pad-back title="${esc(t('cvClose'))}" data-key="cx">✕</button>
      </div>
      <div class="cv-p-body" data-pad-scroll>
        ${action}
        <div class="cv-progress">
          <div class="cv-p-row"><span>${t('cvProgress')}</span><span class="dim">${t('level')} ${n.nivel}/${n.max}</span></div>
          <div class="cv-xp"><div style="width:${(n.progresso * 100).toFixed(1)}%"></div></div>
          <div class="cv-xp-text">${esc(xpText)}</div>
        </div>
        ${statsHtml}
        <p class="cv-desc">${esc(str(`armaDesc_${w}`))}</p>
        <div class="cv-p-upgrades">
          <div class="cv-p-row"><span>${t('cvUpgrades')}</span><span class="dim">${esc(t('cvOnCount', { n: onCount, total: ups.length }))}</span></div>
          ${upgHtml}
        </div>
      </div>`;
  }

  // ---- camera

  private apply() {
    const { x, y, z } = this.cam;
    // Whole pixels and no will-change: the browser draws the text again at each zoom instead of stretching a picture.
    this.world.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) scale(${z})`;
    const g = 24 * z;
    this.vp.style.backgroundSize = `${g}px ${g}px`;
    this.vp.style.backgroundPosition = `${x}px ${y}px`;
    this.zoomLbl.textContent = `${Math.round(z * 100)}%`;
    // Small canvas: no minimap, the zoom bar moves to the corner.
    const compact = this.vp.clientHeight < 440 || this.vp.clientWidth < 640;
    this.miniEl.classList.toggle('hidden', compact);
    this.tools.classList.toggle('alone', compact);
    const m = this.mini;
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    const l = (-x / z - m.bx) * m.s + m.ox;
    const tp = (-y / z - m.by) * m.s + m.oy;
    const r = l + (this.vp.clientWidth / z) * m.s;
    const b = tp + (this.vp.clientHeight / z) * m.s;
    const L = clamp(l, 0, MINI_W);
    const T = clamp(tp, 0, MINI_H);
    this.miniVp.style.left = `${L}px`;
    this.miniVp.style.top = `${T}px`;
    this.miniVp.style.width = `${Math.max(0, clamp(r, 0, MINI_W) - L)}px`;
    this.miniVp.style.height = `${Math.max(0, clamp(b, 0, MINI_H) - T)}px`;
  }

  private visible() {
    return this.vp.isConnected && this.vp.clientWidth > 0 && this.vp.clientHeight > 0;
  }

  private resized() {
    if (!this.visible() || !this.L) return;
    if (!this.homed) {
      this.homed = true;
      this.cam = homeView(this.L.bounds, this.vp.clientWidth, this.vp.clientHeight);
    }
    this.apply();
  }

  /** The width the camera frames into: the viewport minus the open panel. */
  private availW() {
    return this.vp.clientWidth - (this.sel ? PW + 28 : 0);
  }

  private stopFly() {
    this.flyId++;
  }

  /** The next animation frame, or 34 ms later where frames are throttled (as in the design): flights always end. */
  private frame(fn: (now: number) => void) {
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      fn(performance.now());
    };
    requestAnimationFrame(run);
    setTimeout(run, 34);
  }

  private flyTo(to: Cam, dur = 420) {
    this.stopFly();
    const id = this.flyId;
    const from = { ...this.cam };
    const t0 = performance.now();
    const step = (now: number) => {
      if (id !== this.flyId) return;
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      this.cam = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, z: from.z + (to.z - from.z) * e };
      this.apply();
      if (k < 1) this.frame(step);
    };
    this.frame(step);
  }

  private zoomBy(k: number) {
    const px = this.availW() / 2;
    const py = this.vp.clientHeight / 2;
    this.flyTo(zoomAt(this.cam, px, py, clampZoom(this.cam.z * k)), 200);
  }

  private fitAll() {
    if (this.L) this.flyTo(fitView(this.L.bounds, this.availW(), this.vp.clientHeight));
  }

  private goRow(id: RowId) {
    const f = this.L?.frames.find((x) => x.id === id);
    if (f) this.flyTo(rowView(f, this.availW(), this.vp.clientHeight));
  }

  private focusWeapon(w: WeaponId) {
    const L = this.L;
    const box = L?.weapons.find((b) => b.node.arma === w);
    const f = box && L!.frames.find((x) => x.id === box.row);
    if (box && f) this.flyTo(weaponView(this.cam, box.x, f, L!.branchEnd[box.row], this.availW(), this.vp.clientHeight));
  }

  // ---- input

  private local(e: { clientX: number; clientY: number }): Pointer {
    const r = this.vp.getBoundingClientRect();
    return { x: e.clientX - r.left - this.vp.clientLeft, y: e.clientY - r.top - this.vp.clientTop };
  }

  private onDown(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('[data-ui]')) return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    this.justDragged = false;
    this.stopFly();
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, cx: this.cam.x, cy: this.cam.y, moved: false };
    } else if (this.pointers.size === 2) {
      for (const id of this.pointers.keys()) {
        try {
          this.vp.setPointerCapture(id);
        } catch {
          /* the pointer is gone */
        }
      }
      if (this.drag) this.drag.moved = true;
      this.pinch = null;
    }
  }

  private onMove(e: PointerEvent) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const m = this.local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (!this.pinch) {
        this.pinch = { d, m, cam: { ...this.cam } };
        return;
      }
      const p = this.pinch;
      const z = clampZoom(p.cam.z * (d / p.d));
      const wx = (p.m.x - p.cam.x) / p.cam.z;
      const wy = (p.m.y - p.cam.y) / p.cam.z;
      this.cam = { z, x: m.x - wx * z, y: m.y - wy * z };
      this.apply();
      return;
    }
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    // Up to 4 px is still a click on a node.
    if (!d.moved && Math.hypot(dx, dy) > 4) {
      d.moved = true;
      try {
        this.vp.setPointerCapture(e.pointerId);
      } catch {
        /* the pointer is gone */
      }
      this.vp.classList.add('grabbing');
    }
    if (d.moved) {
      this.stopFly();
      this.cam = { ...this.cam, x: d.cx + dx, y: d.cy + dy };
      this.apply();
    }
  }

  private onUp(e: PointerEvent) {
    const d = this.drag;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (d && d.id === e.pointerId) {
      this.drag = null;
      this.justDragged = d.moved;
      this.vp.classList.remove('grabbing');
      // A tap on the empty canvas closes the panel.
      const tgt = e.target as HTMLElement;
      if (!d.moved && !tgt.closest('.cv-weapon, .cv-upg, [data-ui]') && this.sel) this.close();
    }
    if (this.pointers.size === 1) {
      const [id, p] = [...this.pointers.entries()][0];
      this.drag = { id, sx: p.x, sy: p.y, cx: this.cam.x, cy: this.cam.y, moved: true };
    }
  }

  private onWheel(e: WheelEvent) {
    if ((e.target as HTMLElement).closest('[data-ui]')) return;
    e.preventDefault();
    this.stopFly();
    // Sideways scrolling (a trackpad) moves; the wheel zooms around the pointer, a trackpad pinch (ctrl) faster.
    if (!e.ctrlKey && e.deltaX !== 0) {
      this.cam = { ...this.cam, x: this.cam.x - e.deltaX, y: this.cam.y - e.deltaY };
      this.apply();
      return;
    }
    const p = this.local(e);
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.cam = zoomAt(this.cam, p.x, p.y, this.cam.z * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)));
    this.apply();
  }

  private onKey(e: KeyboardEvent) {
    if (!this.visible() || !this.progress) return;
    const tgt = e.target as HTMLElement | null;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT' || tgt.isContentEditable)) return;
    if (e.key === 'Escape') this.close();
    else if (e.key === '+' || e.key === '=') this.zoomBy(1.25);
    else if (e.key === '-' || e.key === '_') this.zoomBy(0.8);
    else if (e.key === '0') this.fitAll();
  }

  private onFocus(el: HTMLElement) {
    // A press focuses the node too: then the camera is the pointer's (a drag, or the click's own flight).
    if (this.pointers.size) return;
    const node = el.closest<HTMLElement>('.cv-weapon, .cv-upg');
    if (!node || !this.L) return;
    const x = parseFloat(node.style.left);
    const y = parseFloat(node.style.top);
    const big = node.classList.contains('cv-weapon');
    this.flyTo(revealView(this.cam, { x, y, w: big ? WW : UW, h: big ? WH : UH }, this.availW(), this.vp.clientHeight), 260);
  }

  private onClick(e: MouseEvent) {
    const el = e.target as HTMLElement;
    if (this.justDragged && !el.closest('[data-ui]')) return;
    const p = this.progress;
    if (!p) return;
    const toggle = el.closest<HTMLElement>('[data-toggle]');
    if (toggle) {
      e.stopPropagation();
      p.toggle(toggle.dataset.prog as ProgWeapon, toggle.dataset.id!, toggle.getAttribute('aria-pressed') !== 'true');
      return;
    }
    const equip = el.closest<HTMLElement>('[data-equip]');
    if (equip) {
      const w = equip.dataset.equip as WeaponId;
      const row = equip.dataset.row as RowId;
      if (row === 'primaria' && isGun(w)) p.setPrimary(w);
      else if (row === 'secundaria' && isGun(w)) p.setSecondary(w);
      else if (row === 'faca' && isKnife(w)) p.setKnife(w);
      return;
    }
    if (el.closest('[data-close]')) return this.close();
    const zoom = el.closest<HTMLElement>('[data-zoom]');
    if (zoom) return this.zoomBy(Number(zoom.dataset.zoom));
    if (el.closest('[data-fit]')) return this.fitAll();
    const jump = el.closest<HTMLElement>('[data-jump]');
    if (jump) return this.goRow(jump.dataset.jump as RowId);
    const weapon = el.closest<HTMLElement>('[data-pick-w]');
    if (weapon) return this.pickWeapon(weapon.dataset.row as RowId, weapon.dataset.pickW as WeaponId);
    const upg = el.closest<HTMLElement>('[data-pick-u]');
    if (upg) return this.pickUpg(upg.dataset.row as RowId, upg.dataset.w as WeaponId, upg.dataset.pickU!);
  }

  private miniJump(e: PointerEvent) {
    const r = this.miniBox.getBoundingClientRect();
    const m = this.mini;
    const wx = (e.clientX - r.left - m.ox) / m.s + m.bx;
    const wy = (e.clientY - r.top - m.oy) / m.s + m.by;
    this.stopFly();
    this.cam = { ...this.cam, x: this.vp.clientWidth / 2 - wx * this.cam.z, y: this.vp.clientHeight / 2 - wy * this.cam.z };
    this.apply();
  }

  // ---- actions

  private pickWeapon(row: RowId, w: WeaponId) {
    this.viewed[row] = w;
    this.sel = this.lastSel = w;
    this.selUpg = null;
    this.render();
    this.focusWeapon(w);
  }

  private pickUpg(row: RowId, w: WeaponId, id: string) {
    this.viewed[row] = w;
    this.sel = this.lastSel = w;
    this.selUpg = id;
    this.render();
  }

  private close() {
    if (!this.sel) return;
    this.sel = null;
    this.selUpg = null;
    this.render();
  }
}
