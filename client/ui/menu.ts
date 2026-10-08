// Loading screen (with rotating tips), and the start card and pause menu (section 5, PF-11): a rail on the left
// (where we are, back to the game, the mode's tab and the settings' tab, the exit) and, once a tab is picked, its
// panel on the right; the exit asks first. Esc and ◯/B go back one level: the dialog, then the tab, then the game
// (client/ui/pauseMenu.ts). The settings live in #menu-settings, by sub-tab (aim, video, audio, keys or the
// controller, touch on phones); the home's Settings tab borrows that block. Below 900 × 560 px, and always on
// phones, the rail takes the width and a tab opens over it as a page of its own.
import { CAN_FULLSCREEN, CAN_KEEP_ESCAPE, enterFullscreen, IS_IOS, IS_MOBILE, STANDALONE } from '../core/device';
import type { GamepadInput, PadButton } from '../core/gamepad';
import { assign, clearSlot, keyLabel, mergeKeybinds, type LayoutMap, type RebindableAction, type Slot } from '../core/keybinds';
import type { Settings } from '../core/settings';
import type { Quality } from '../render/quality';
import { esc } from './arsenal';
import { backStep, KEY_GROUPS, type PauseContext } from './pauseMenu';
import { isLang, LANG_LOCALE, LANG_NAMES, LANGS, type Lang } from '@shared/langs';
import { getLang, t, TIPS, type StringKey } from './strings';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const ACTION_NAME: Record<RebindableAction, StringKey> = {
  forward: 'keyForward',
  back: 'keyBack',
  left: 'keyLeft',
  right: 'keyRight',
  jump: 'keyJump',
  crouch: 'keyCrouch',
  sprint: 'keySprint',
  fire: 'keyFire',
  ads: 'keyAds',
  reload: 'keyReload',
  melee: 'keyMelee',
  grenade: 'keyGrenade',
  weapon1: 'keyWeapon1',
  weapon2: 'keyWeapon2',
  swapWeapon: 'keySwapWeapon',
  taunt: 'keyTaunt',
  donate: 'keyDonate',
  refuse: 'keyRefuse',
  scoreboard: 'keyScoreboard',
  chat: 'keyChat',
};

/** navigator.keyboard (Chrome and Edge only; not in TypeScript's DOM types). */
type KeyboardApi = { getLayoutMap?: () => Promise<LayoutMap> };

export type MenuTab = 'mode' | 'config';
type SubTab = 'aim' | 'video' | 'audio' | 'keys' | 'touch';

/** The mode's tab as main.ts fills it: its entry on the rail and its panel's header and footer. */
export interface ModeTabMeta {
  icon: string;
  label: string;
  sub: string;
  title: string;
  hint: string;
  badge: 'readOnly' | 'editable' | null;
  foot: string;
}

/** Sets an element's text only when it changed (the menu is refreshed many times a second while open). */
const setText = (el: HTMLElement, text: string) => {
  if (el.textContent !== text) el.textContent = text;
};

/** Below this the rail takes the width and each tab is a page over it (phones always). */
const NARROW = matchMedia('(max-width: 899px), (max-height: 559px)');

export class Screens {
  private tipTimer = 0;

  /** The settings being edited (bindSettings), and what to call when they change. */
  private settings: Settings | null = null;
  private changed: (s: Settings) => void = () => {};
  private layout: LayoutMap | undefined;
  /** The keyboard's table is shown (not the controller's): computers without a controller in use. */
  private keysShown = false;
  /** The slot waiting for a key ("press…"), and how to stop listening. */
  private capturing: { action: RebindableAction; slot: Slot } | null = null;
  private endCapture: () => void = () => {};
  private notice = '';
  /** The controller in use (its family's glyphs), null on mouse or touch. */
  private pad: GamepadInput | null = null;

  /** 'start': the card before the first click (JOGAR, no banner); 'pause': the menu over a running match. */
  private mode: 'start' | 'pause' = 'start';
  /** The open tab (null: only the rail, the game in view) and whether the exit's confirmation is up. */
  private tab: MenuTab | null = null;
  private confirming = false;
  private sub: SubTab = 'aim';
  private modeMeta: ModeTabMeta | null = null;
  private tabListeners: ((tab: MenuTab | null) => void)[] = [];
  private exitCb: () => void = () => {};
  /**
   * A match is running (main.ts sets it once the home hands over): a language chosen now is saved and applies back
   * at the start, the match goes on; before that (home, galpão, landing) the page reloads in the new language.
   */
  inMatch = false;
  private paintLang = () => {};

  constructor() {
    this.startTips();

    const labels: [string, StringKey][] = [
      ['lbl-sens', 'sensitivity'],
      ['desc-sens', 'pmDescSens'],
      ['lbl-ads', 'adsSensitivity'],
      ['desc-ads', 'pmDescAds'],
      ['lbl-pad-sens', 'padSensitivity'],
      ['desc-pad-sens', 'pmDescPadSens'],
      ['lbl-aim-assist', 'aimAssist'],
      ['desc-aim-assist', 'pmDescAssist'],
      ['lbl-invert', 'invertY'],
      ['desc-invert', 'pmDescInvert'],
      ['lbl-fov', 'fov'],
      ['desc-fov', 'pmDescFov'],
      ['lbl-quality', 'quality'],
      ['desc-quality', 'pmDescQuality'],
      ['lbl-fullscreen-desktop', 'fullscreenOnPlay'],
      ['desc-fullscreen-desktop', 'pmDescFullscreen'],
      ['lbl-lang', 'language'],
      ['desc-lang', 'pmDescLanguage'],
      ['lbl-vol', 'volume'],
      ['desc-vol', 'pmDescVolume'],
      ['lbl-spatial', 'spatialAudio'],
      ['desc-spatial', 'pmDescSpatial'],
      ['pm-sub-aim', 'pmSubAim'],
      ['pm-sub-video', 'pmSubVideo'],
      ['pm-sub-audio', 'pmSubAudio'],
      ['pm-sub-touch', 'pmSubTouch'],
      ['pm-esc-text', 'pmEscFixed'],
      ['pm-pad-note', 'pmPadNote'],
      ['menu-debug-hint', 'debugHint'],
      ['keys-reset', 'keysReset'],
      ['touch-help', 'touchControlsHelp'],
      ['pm-nav-config-label', 'settings'],
      ['pm-nav-config-sub', 'pmConfigSub'],
      ['pm-stay', 'pmStay'],
      ['pm-leave', 'pmLeave'],
      ['pm-confirm-hint', 'pmStayHint'],
      ['pm-close-wide', 'pmClose'],
      ['pm-close-narrow', 'pmBack'],
    ];
    for (const [id, key] of labels) $(id).textContent = t(key);

    $('keys-reset').addEventListener('click', () => {
      if (!this.settings) return;
      this.stopCapture();
      this.settings.keybinds = mergeKeybinds(undefined);
      this.settings.keyLabels = {};
      this.keysChanged('');
    });
    // Chrome and Edge tell what is printed on each key (AZERTY, Dvorak…); elsewhere the names come from the keys
    // the player pressed to bind (Settings.keyLabels), else QWERTY.
    const keyboard = (navigator as Navigator & { keyboard?: KeyboardApi }).keyboard;
    keyboard?.getLayoutMap?.().then(
      (map) => {
        this.layout = map;
        this.renderKeys();
      },
      () => {},
    );
    // Phones: touch settings, the layout editor's bar, the "turn the phone" notice.
    const touchLabels: [string, StringKey][] = [
      ['lbl-touch-sens', 'touchSensitivity'],
      ['lbl-touch-scale', 'touchScale'],
      ['lbl-touch-opacity', 'touchOpacity'],
      ['lbl-ads-hold', 'adsHold'],
      ['lbl-fullscreen', 'fullscreenOnPlay'],
      ['touch-edit-btn', 'editLayout'],
      ['touch-fs-btn', 'fullscreen'],
      ['touch-edit-hint', 'editLayoutHint'],
      ['touch-edit-reset', 'editLayoutReset'],
      ['touch-edit-done', 'editLayoutDone'],
      ['rotate-text', 'rotatePhone'],
    ];
    for (const [id, key] of touchLabels) $(id).textContent = t(key);
    // No Fullscreen API (iPhone): explain "Add to Home Screen" instead (unless already opened from there).
    if (!CAN_FULLSCREEN) for (const el of document.querySelectorAll('.fs-only')) el.classList.add('hidden');
    if (IS_MOBILE && !CAN_FULLSCREEN && IS_IOS && !STANDALONE) {
      $('ios-fs-hint').textContent = t('iosFullscreen');
      $('ios-fs-hint').classList.remove('hidden');
    }
    $('touch-fs-btn').addEventListener('click', () => void enterFullscreen());

    // The rail's tabs open their panel (the same entry again closes it); the panel's button closes it.
    for (const b of document.querySelectorAll<HTMLElement>('#menu .pm-nav-item')) {
      b.addEventListener('click', () => {
        const tab = b.dataset.tab as MenuTab;
        this.openTab(this.tab === tab ? null : tab);
      });
    }
    $('pm-close').addEventListener('click', () => this.openTab(null));
    $('menu-exit').addEventListener('click', () => this.askExit(true));
    $('pm-stay').addEventListener('click', () => this.askExit(false));
    $('pm-leave').addEventListener('click', () => this.exitCb());
    // The settings' sub-tabs (here and in the home's Settings tab).
    for (const b of document.querySelectorAll<HTMLElement>('#menu-settings [role="tab"]')) b.addEventListener('click', () => this.showSub(b.dataset.sub as SubTab));
    // The narrow layout (phones always): a class on <html>, so the home's borrowed settings follow it too.
    const narrow = () => document.documentElement.classList.toggle('menu-narrow', IS_MOBILE || NARROW.matches);
    NARROW.addEventListener('change', narrow);
    narrow();
    this.showControls(null);
    this.showSub('aim');
  }

  /** The name of the key an action is on (its primary, else its alternate), for hints like the HUD's. */
  keyName(action: RebindableAction): string {
    const code = this.settings?.keybinds[action].find((c) => c !== null);
    return code ? this.label(code) : '—';
  }

  private label(code: string): string {
    return keyLabel(code, getLang(), this.layout, this.settings?.keyLabels);
  }

  private get padInUse(): boolean {
    return !!this.pad && this.pad.device === 'pad';
  }

  private glyph(b: PadButton): string {
    return this.pad!.glyph(b);
  }

  /**
   * The controls sub-tab: the controller's buttons (PlayStation or Xbox glyphs) while one is in use, the
   * remappable keys on a computer otherwise (phones without a controller have the Touch sub-tab instead). Also
   * the rail's button hints and the "back" keys shown on the panel and the dialog.
   */
  showControls(pad: GamepadInput | null) {
    this.pad = pad;
    const usePad = this.padInUse;
    this.keysShown = !IS_MOBILE && !usePad;
    const keysTab = $('pm-sub-keys');
    setText(keysTab, t(usePad ? 'pmSubPad' : 'pmSubKeys'));
    keysTab.classList.toggle('hidden', IS_MOBILE && !usePad);
    if (keysTab.classList.contains('hidden') && this.sub === 'keys') this.showSub('aim');
    if (!this.keysShown) this.stopCapture();
    $('pm-keys-page').classList.toggle('pad', usePad);
    if (usePad) {
      const g = (b: PadButton) => `<kbd>${esc(this.glyph(b))}</kbd>`;
      const rows: [StringKey, string][] = [
        ['keyMove', esc(t('padLeftStick'))],
        ['padLook', esc(t('padRightStick'))],
        ['keyFire', g('rt')],
        ['keyAds', g('lt')],
        ['keyJump', g('a')],
        ['keyCrouch', g('b')],
        ['keySprint', g('l3')],
        ['keyReload', g('x')],
        ['keyMelee', `${g('rb')} / ${g('r3')}`],
        ['keyGrenade', g('lb')],
        ['keySwapWeapon', `${g('left')} / ${g('right')}`],
        ['keyTaunt', g('y')],
        ['keyPause', g('start')],
      ];
      $('controls-table').innerHTML = rows.map(([k, v]) => `<div class="pm-padrow"><span>${esc(t(k))}</span><span>${v}</span></div>`).join('');
    } else this.renderKeys();
    this.sync();
  }

  /** The keyboard's table, by group: action, primary and alternate key; a click on a key waits for the new one. */
  private renderKeys() {
    if (!this.keysShown || !this.settings) return;
    const kb = this.settings.keybinds;
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', cls = '') => {
      const e = document.createElement(tag);
      e.textContent = text;
      if (cls) e.className = cls;
      return e;
    };
    const groups = KEY_GROUPS.map(([title, actions]) => {
      const box = el('div', '', 'pm-keygroup');
      const head = el('div', '', 'pm-keyhead');
      head.append(el('span', t(title)), el('span', t('keyPrimary')), el('span', t('keyAlternate')));
      box.appendChild(head);
      for (const action of actions) {
        const row = el('div', '', 'pm-keyrow');
        row.appendChild(el('span', t(ACTION_NAME[action])));
        for (const slot of [0, 1] as const) {
          const cell = el('span', '', 'bind');
          const code = kb[action][slot];
          const waiting = this.capturing?.action === action && this.capturing.slot === slot;
          const key = el('button', waiting ? t('pmKeyPress') : code ? this.label(code) : '—', 'bind-key');
          key.type = 'button';
          key.title = waiting ? t('keyPress') : (key.textContent ?? '');
          key.classList.toggle('empty', !code);
          key.classList.toggle('capturing', waiting);
          key.addEventListener('click', () => this.startCapture(action, slot));
          cell.appendChild(key);
          if (code && !waiting) {
            const clear = el('button', '×', 'bind-clear');
            clear.type = 'button';
            clear.title = clear.ariaLabel = t('keyClear');
            clear.addEventListener('click', () => {
              this.stopCapture();
              this.settings!.keybinds = clearSlot(this.settings!.keybinds, action, slot);
              this.keysChanged('');
            });
            cell.appendChild(clear);
          }
          row.appendChild(cell);
        }
        if (!kb[action][0] && !kb[action][1]) {
          row.classList.add('unbound');
          row.title = t('keyUnbound');
        }
        box.appendChild(row);
      }
      return box;
    });
    $('controls-table').replaceChildren(...groups);
    // The notes beside the groups: the last refusal or move, Esc (shown, not remappable), the reset, F3/F4.
    $('keys-notice').textContent = this.notice;
    $('keys-notice').classList.toggle('hidden', !this.notice);
  }

  /**
   * Waits for the next key or mouse button for one slot. Listens first (capture phase on window), so neither
   * the game nor the menu's Esc sees that press; Esc cancels.
   */
  private startCapture(action: RebindableAction, slot: Slot) {
    this.stopCapture();
    this.capturing = { action, slot };
    this.notice = '';
    const block = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const onKey = (e: KeyboardEvent) => {
      block(e);
      if (e.repeat) return;
      if (e.code === 'Escape') {
        this.stopCapture();
        this.renderKeys();
      } else this.bindKey(e.code, e.key);
    };
    const onMouse = (e: MouseEvent) => {
      block(e);
      // The click that follows this button (and the page going back on a side button's release) is swallowed
      // too, so it doesn't land on another key of the table.
      // (A mouseup that never comes, released outside the window, frees them after a while.)
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
      window.removeEventListener('wheel', onWheel, true);
      this.endCapture = () => {};
      window.addEventListener('mouseup', () => setTimeout(removeSwallow), { capture: true, once: true });
      setTimeout(removeSwallow, 3000);
      this.bindKey(`Mouse${e.button}`);
    };
    // The wheel (not passive, so the menu doesn't scroll on the step that binds).
    const onWheel = (e: WheelEvent) => {
      block(e);
      if (e.deltaY !== 0 && this.capturing) this.bindKey(e.deltaY < 0 ? 'WheelUp' : 'WheelDown');
    };
    const swallowed = ['mouseup', 'click', 'auxclick', 'contextmenu'];
    const removeSwallow = () => {
      for (const type of swallowed) window.removeEventListener(type, block, true);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    for (const type of swallowed) window.addEventListener(type, block, true);
    this.endCapture = () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
      window.removeEventListener('wheel', onWheel, true);
      removeSwallow();
    };
    this.renderKeys();
  }

  /** Stops waiting for a key (the swallowed click after a mouse button still goes, on its own). */
  private stopCapture() {
    if (!this.capturing) return;
    this.capturing = null;
    this.endCapture();
    this.endCapture = () => {};
    this.renderKeys();
  }

  /** The key pressed while waiting: bound (the other action losing it is told), or refused with the reason. */
  private bindKey(code: string, printed?: string) {
    if (!this.capturing || !this.settings) return;
    const s = this.settings;
    const { action, slot } = this.capturing;
    const r = assign(s.keybinds, action, slot, code);
    if (!r.ok) {
      // Still waiting: the player presses another key.
      this.notice = r.reason === 'ctrl' ? t('keyNoCtrl') : r.reason === 'wheel' ? t('keyWheelHold') : t('keyFixed', { key: this.label(code) });
      this.renderKeys();
      return;
    }
    // What is printed on the key, for its name where the browser has no layout map.
    if (printed && printed.length === 1 && printed.trim()) s.keyLabels[code] = printed;
    s.keybinds = r.keybinds;
    const lost = r.cleared;
    this.stopCapture();
    this.keysChanged(
      lost
        ? t('keyMoved', { key: this.label(code), action: t(ACTION_NAME[lost.action]), slot: t(lost.slot === 0 ? 'keyPrimary' : 'keyAlternate').toLowerCase() })
        : '',
    );
  }

  private keysChanged(notice: string) {
    this.notice = notice;
    this.changed(this.settings!);
    this.renderKeys();
  }

  /** Shows one of the settings' sub-tabs. */
  private showSub(sub: SubTab) {
    if (sub !== 'keys') this.stopCapture();
    this.sub = sub;
    for (const b of document.querySelectorAll<HTMLElement>('#menu-settings [role="tab"]')) b.setAttribute('aria-selected', String(b.dataset.sub === sub));
    for (const p of document.querySelectorAll<HTMLElement>('#menu-settings .pm-sub')) p.classList.toggle('hidden', p.dataset.sub !== sub);
  }

  // --- The menu's levels -----------------------------------------------------------------------------------

  /** The tab open in the panel (null: none). */
  get openedTab(): MenuTab | null {
    return this.tab;
  }

  /** The element the mode's tab draws into (the Arsenal, the ladder or the coffin; main.ts fills it). */
  get modeBody(): HTMLElement {
    return $('pm-mode');
  }

  /** Called when a tab opens or closes (main.ts draws the mode's tab as it opens). */
  onTab(cb: (tab: MenuTab | null) => void) {
    this.tabListeners.push(cb);
  }

  openTab(tab: MenuTab | null) {
    if (tab !== 'config') this.stopCapture();
    if (tab === this.tab) return;
    this.tab = tab;
    $('pm-body').scrollTop = 0;
    this.sync();
    for (const f of this.tabListeners) f(tab);
  }

  /** Opens (or closes) the exit's confirmation; focus goes to "stay", the safe answer, and back to the exit. */
  private askExit(open: boolean) {
    this.stopCapture();
    this.confirming = open;
    this.sync();
    $(open ? 'pm-stay' : 'menu-exit').focus({ preventScroll: true });
  }

  /**
   * Esc while the menu is open: closes the dialog, else the tab. False at the top level (the caller goes back to
   * the game; key capture never gets here: it listens first).
   */
  back(): boolean {
    const step = backStep({ confirm: this.confirming, tab: this.tab });
    if (step === 'close-dialog') this.askExit(false);
    else if (step === 'close-tab') this.openTab(null);
    return step !== 'resume';
  }

  get visible(): boolean {
    return !$('menu').classList.contains('hidden');
  }

  /** The rail: the mode's chip in its color, the map, the line under it, the banner and the exit's label. */
  setContext(ctx: PauseContext, mapName: string) {
    const menu = $('menu');
    if (menu.style.getPropertyValue('--mode') !== ctx.color) menu.style.setProperty('--mode', ctx.color);
    setText($('pm-chip'), ctx.chip);
    setText($('pm-map'), mapName);
    setText($('pm-line'), ctx.line);
    $('pm-banner').classList.toggle('live', ctx.live);
    setText($('pm-banner-mark'), ctx.live ? '' : 'II');
    setText($('pm-banner-text'), ctx.banner);
    setText($('menu-exit'), ctx.exit);
    setText($('pm-confirm-title'), `${ctx.exit}?`);
    setText($('pm-confirm-body'), ctx.confirm);
  }

  /** The mode's tab: its entry on the rail and, while open, its panel's header and footer. */
  setModeTab(meta: ModeTabMeta) {
    this.modeMeta = meta;
    setText($('pm-nav-mode-icon'), meta.icon);
    setText($('pm-nav-mode-label'), meta.label);
    setText($('pm-nav-mode-sub'), meta.sub);
    if (this.tab === 'mode') this.renderHead();
  }

  /** The panel's header (title, hint, badge) and footer for the open tab. */
  private renderHead() {
    const m = this.tab === 'mode' ? this.modeMeta : null;
    setText($('pm-title'), m ? m.title : t('settings'));
    setText($('pm-hint'), m ? m.hint : t('pmConfigHint'));
    const badge = $('pm-badge');
    badge.classList.toggle('hidden', !m?.badge);
    badge.classList.toggle('editable', m?.badge === 'editable');
    setText(badge, m?.badge ? t(m.badge === 'readOnly' ? 'pmBadgeReadOnly' : 'pmBadgeEditable') : '');
    const foot = m?.foot ?? '';
    $('pm-foot').classList.toggle('hidden', !foot);
    setText($('pm-foot'), foot);
  }

  /** Everything that follows the levels: what is open, which button ◯/B presses, the hints and their keys. */
  private sync() {
    const menu = $('menu');
    menu.classList.toggle('start', this.mode === 'start');
    menu.classList.toggle('panel-open', !!this.tab);
    $('pm-panel').classList.toggle('hidden', !this.tab);
    $('pm-mode').classList.toggle('hidden', this.tab !== 'mode');
    $('pm-config').classList.toggle('hidden', this.tab !== 'config');
    $('pm-confirm').classList.toggle('hidden', !this.confirming);
    for (const b of menu.querySelectorAll<HTMLElement>('.pm-nav-item')) {
      const on = b.dataset.tab === this.tab;
      b.classList.toggle('sel', on);
      b.setAttribute('aria-expanded', String(on));
    }
    if (this.tab) this.renderHead();
    // ◯/B presses exactly one button per level (never the exit, whose label starts with "Sair").
    const back = this.confirming ? 'pm-stay' : this.tab ? 'pm-close' : this.mode === 'pause' ? 'play-btn' : null;
    for (const id of ['pm-stay', 'pm-close', 'play-btn']) $(id).toggleAttribute('data-pad-back', id === back);
    setText($('play-btn'), t(this.mode === 'start' ? 'play' : 'resume'));
    // The keys that go back (Esc, or the controller's ◯/B); none on a touch screen.
    const usePad = this.padInUse;
    const backKey = usePad ? this.glyph('b') : IS_MOBILE ? '' : 'Esc';
    for (const id of ['pm-close-key', 'pm-confirm-key']) {
      setText($(id), backKey);
      $(id).classList.toggle('hidden', !backKey);
    }
    $('pm-confirm-line').classList.toggle('hidden', !backKey);
    const hints: [string, StringKey][] = usePad
      ? [...(this.mode === 'pause' ? [[this.glyph('start'), 'pmHintResume'] as [string, StringKey]] : []), [this.glyph('b'), 'pmHintBack'], [this.glyph('a'), 'pmHintPick']]
      : !IS_MOBILE && this.mode === 'pause'
        ? [['Esc', 'pmHintResume']]
        : [];
    const html = hints.map(([k, s]) => `<span><kbd>${esc(k)}</kbd>${esc(t(s))}</span>`).join('');
    const box = $('pm-hints');
    if (box.innerHTML !== html) box.innerHTML = html;
    box.classList.toggle('hidden', !hints.length);
  }

  /** The "arrange buttons" entry of the Touch sub-tab and the editor bar (phones); done comes back to the menu. */
  onEditLayout(start: () => void, done: () => void, reset: () => void) {
    $('touch-edit-btn').addEventListener('click', () => {
      this.hideMenu();
      $('touch-edit-bar').classList.remove('hidden');
      start();
    });
    $('touch-edit-done').addEventListener('click', () => {
      $('touch-edit-bar').classList.add('hidden');
      done();
      this.showMenu('pause', true);
    });
    $('touch-edit-reset').addEventListener('click', reset);
  }

  showGpuWarning(gpu: string) {
    const el = $('gpu-warning');
    el.textContent = `⚠ ${t('gpuWarning', { gpu })}`;
    el.classList.remove('hidden');
  }

  setProgress(p: number) {
    $('loading-fill').style.width = `${Math.round(p * 100)}%`;
  }

  private startTips() {
    const tips = TIPS[getLang()];
    let i = (Math.random() * tips.length) | 0;
    const tip = $('loading-tip');
    tip.textContent = tips[i];
    clearInterval(this.tipTimer);
    this.tipTimer = window.setInterval(() => {
      i = (i + 1) % tips.length;
      tip.textContent = tips[i];
    }, 2500);
  }

  /** Back to the loading screen (the map is built after the home screen, once it is chosen). */
  showLoading() {
    this.setProgress(0);
    this.startTips();
    $('loading').classList.remove('hidden');
  }

  hideLoading() {
    clearInterval(this.tipTimer);
    $('loading').classList.add('hidden');
  }

  /** Opens the start card or the pause menu: only the rail, the game in view (`keep`: as it was left). */
  showMenu(mode: 'start' | 'pause', keep = false) {
    this.mode = mode;
    if (!keep) {
      this.confirming = false;
      this.openTab(null);
    }
    $('menu').classList.remove('hidden');
    this.sync();
  }

  /** What SAIR does in the exit's confirmation. */
  onExit(cb: () => void) {
    this.exitCb = cb;
  }

  hideMenu() {
    this.stopCapture();
    this.notice = '';
    this.renderKeys();
    this.confirming = false;
    this.sync();
    $('menu').classList.add('hidden');
  }

  onPlay(cb: () => void) {
    $('play-btn').addEventListener('click', cb);
  }

  /**
   * A language picked in the settings or on the landing (PF-30): saved on this device. Outside a match the page
   * reloads in it at once (many texts, the galpão's signs among them, are built only once); during a match it's
   * kept for the way back to the start, and the row says so.
   */
  chooseLanguage(l: Lang) {
    const s = this.settings;
    if (!s) return;
    s.idioma = l;
    this.changed(s);
    this.paintLang();
    if (!this.inMatch) location.reload();
    else $('desc-lang').textContent = t(l === getLang() ? 'pmDescLanguage' : 'langLater');
  }

  bindSettings(s: Settings, changed: (s: Settings) => void) {
    this.settings = s;
    this.changed = changed;
    this.renderKeys();
    type RangeKey = 'sensitivity' | 'adsSensitivity' | 'fov' | 'volume' | 'touchSensitivity' | 'touchScale' | 'touchOpacity' | 'padSensitivity';
    const range = (id: string, out: string, key: RangeKey, fmt: (v: number) => string) => {
      const el = $<HTMLInputElement>(id);
      const o = $(out);
      el.value = String(s[key]);
      o.textContent = fmt(s[key]);
      el.addEventListener('input', () => {
        s[key] = Number(el.value);
        o.textContent = fmt(s[key]);
        changed(s);
      });
    };
    range('set-sens', 'out-sens', 'sensitivity', (v) => v.toFixed(2));
    range('set-ads', 'out-ads', 'adsSensitivity', (v) => v.toFixed(2));
    range('set-fov', 'out-fov', 'fov', (v) => `${v}°`);
    range('set-vol', 'out-vol', 'volume', (v) => `${Math.round(v * 100)}%`);
    range('set-touch-sens', 'out-touch-sens', 'touchSensitivity', (v) => v.toFixed(2));
    range('set-pad-sens', 'out-pad-sens', 'padSensitivity', (v) => v.toFixed(2));
    range('set-touch-scale', 'out-touch-scale', 'touchScale', (v) => `${Math.round(v * 100)}%`);
    range('set-touch-opacity', 'out-touch-opacity', 'touchOpacity', (v) => `${Math.round(v * 100)}%`);
    // Choices as a row of buttons, the chosen one lit.
    const segmented = <V extends string>(id: string, options: [V, StringKey][], get: () => V, set: (v: V) => void) => {
      const box = $(id);
      const paint = () => {
        for (const b of box.querySelectorAll<HTMLElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.v === get()));
      };
      box.innerHTML = options.map(([v, k]) => `<button type="button" data-v="${v}">${esc(t(k))}</button>`).join('');
      box.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-v]');
        if (!b || b.dataset.v === get()) return;
        set(b.dataset.v as V);
        paint();
        changed(s);
      });
      paint();
    };
    segmented<Settings['spatialAudio']>('set-spatial', [['auto', 'spatialAuto'], ['hrtf', 'spatialHeadphones'], ['stereo', 'spatialSpeakers']], () => s.spatialAudio, (v) => (s.spatialAudio = v));
    segmented<Quality>('set-quality', [['auto', 'qualityAuto'], ['baixa', 'qualityLow'], ['media', 'qualityMedium'], ['alta', 'qualityHigh']], () => s.quality, (v) => (s.quality = v));
    // The language (PF-30): each one named in itself, so a player finds theirs whatever is on screen. The lit one is
    // the choice saved (during a match it may not be the one on screen yet).
    const langBox = $('set-lang');
    langBox.innerHTML = LANGS.map((l) => `<button type="button" data-v="${l}" lang="${LANG_LOCALE[l]}">${esc(LANG_NAMES[l])}</button>`).join('');
    this.paintLang = () => {
      for (const b of langBox.querySelectorAll<HTMLElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.v === (s.idioma ?? getLang())));
    };
    langBox.addEventListener('click', (e) => {
      const v = (e.target as HTMLElement).closest<HTMLElement>('button[data-v]')?.dataset.v;
      if (isLang(v) && v !== (s.idioma ?? getLang())) this.chooseLanguage(v);
    });
    this.paintLang();
    // On/off switches (one setting may have two: "fullscreen when playing" on a phone and on a computer).
    type ToggleKey = 'aimAssist' | 'fullscreen' | 'adsHold' | 'invertY';
    const toggles: [string, ToggleKey][] = [];
    const paintToggles = () => {
      for (const [id, key] of toggles) {
        const b = $(id);
        b.setAttribute('aria-pressed', String(s[key]));
        b.textContent = t(s[key] ? 'pmOn' : 'pmOff');
      }
    };
    const toggle = (id: string, key: ToggleKey) => {
      toggles.push([id, key]);
      $(id).addEventListener('click', () => {
        s[key] = !s[key];
        paintToggles();
        changed(s);
      });
    };
    toggle('set-aim-assist', 'aimAssist');
    toggle('set-ads-hold', 'adsHold');
    toggle('set-fullscreen', 'fullscreen');
    toggle('set-invert', 'invertY');
    // Computer: the same setting, where fullscreen lets the game keep Esc (device.ts CAN_KEEP_ESCAPE).
    if (CAN_KEEP_ESCAPE) toggle('set-fullscreen-desktop', 'fullscreen');
    else $('fs-desktop').classList.add('hidden');
    paintToggles();
  }
}
