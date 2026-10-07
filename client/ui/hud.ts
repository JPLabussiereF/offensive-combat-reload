// In-match HUD (section 5): DOM updated by direct reference, numbers throttled by the caller.
import { IS_MOBILE } from '../core/device';
import { gamepad } from '../core/gamepad';
import { t } from './strings';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export type HitKind = 'hit' | 'head' | 'kill';
export type FeedIcon = 'head' | 'knife' | 'bird' | 'taunt' | 'grenade' | 'dog' | 'zombie' | null;
const FEED_ICONS: Record<Exclude<FeedIcon, null>, string> = { head: '✚', knife: '🔪', bird: '🐦', taunt: '💃', grenade: '💣', dog: '🐕', zombie: '🧟' };

/** The crack icon of a damaged weapon (zumbi), and the word beside it when `withText`. */
function flawTag(withText: boolean): HTMLElement {
  const tag = document.createElement('span');
  tag.className = 'flaw-tag';
  tag.title = t('zDamaged');
  tag.innerHTML = '<svg viewBox="0 0 12 14" width="10" height="12" aria-hidden="true"><path d="M7 0 L3.5 5.5 L7.5 7.5 L4 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  if (withText) tag.append(t('zDamaged'));
  return tag;
}

/** An effect we're under, for the buff panel: `left`/`total` in seconds, no `total` when it lasts until we die. */
export interface Buff {
  id: string;
  icon: string;
  label: string;
  color: string;
  left?: number;
  total?: number;
}

export class Hud {
  private root = $('hud');
  private crosshair = $('crosshair');
  private hitmarker = $('hitmarker');
  private healthFill = $('health-fill');
  private healthNum = $('health-num');
  private healthBox = $('health');
  private buffsEl = $('buffs');
  private buffsKey = '';
  private buffRows: { secs: HTMLElement; fill: HTMLElement; row: HTMLElement; last: number }[] = [];
  private ammoMag = $('ammo-mag');
  private ammoReserve = $('ammo-reserve');
  private ammoWarn = $('ammo-warn');
  private ammoStatus = $('ammo-status');
  private reloadFill = $('reload-fill');
  private reloadKey = '';
  private weaponName = $('weapon-name');
  private weaponSlots = $('weapon-slots');
  private slotsKey = '';
  private scorePoints = $('score-points');
  private scoreKills = $('score-kills');
  private scoreAcc = $('score-acc');
  private feed = $('killfeed');
  private popups = $('popups');
  private vignette = $('vignette');
  private death = $('death');
  private deathMsg = $('death-msg');
  private deathShowcase = $('death-showcase');
  private deathTimer = $('death-timer');
  private debug = $('debug');
  private banner = $('banner');
  private prompt = $('prompt');
  private promptText = $('prompt-text');
  private promptFill = $('prompt-fill');
  private promptKey = '';
  private grenadesEl = $('grenades');
  private grenadesKey = '';
  private cook = $('cook');
  private cookFill = $('cook-fill');
  private warn = $('grenade-warn');
  private entrances = $('zentrances');
  private entriesKey = '';
  private bannerTimer = 0;
  private hitTimer = 0;
  private popupTotal = 0;
  private popupTotalEl: HTMLElement | null = null;
  private popupTimer = 0;
  private lastHealth = -1;
  private lastAmmo = '';
  private ladderEl = $('ladder');
  private ladderKey = '';
  private roundEl = $('round-end');
  private zwaveEl = $('zwave');
  private zwaveKey = '';
  private zmoneyEl = $('zmoney');
  private zmoney = -1;
  private zsumEl = $('zsummary');

  constructor() {
    $('score-points-label').textContent = t('points');
    $('score-kills-label').textContent = t('kills');
    $('score-acc-label').textContent = t('accuracy');
    $('health-label').textContent = t('health');
  }

  show(v: boolean) {
    this.root.classList.toggle('hidden', !v);
  }

  /** `rarity`: the zumbi mode's weapons are colored by it; `damaged`: a damaged one from the coffin (cracked tag). */
  setWeaponName(name: string, rarity = '', damaged = false) {
    this.weaponName.textContent = name;
    this.weaponName.className = rarity ? `rar-${rarity}` : '';
    if (damaged) this.weaponName.append(' ', flawTag(true));
  }

  /**
   * The guns carried, under the ammo: the key that picks each slot, its name and the ammo it has, the one in
   * hand lit (`drawing` while it comes up after a switch).
   */
  setWeaponSlots(slots: { key: string; name: string; mag: number; reserve: number; active: boolean; rarity?: string; damaged?: boolean }[], drawing: boolean) {
    const key = JSON.stringify(slots) + drawing;
    if (key === this.slotsKey) return;
    this.slotsKey = key;
    this.weaponSlots.replaceChildren(
      ...slots.map((s) => {
        const row = document.createElement('div');
        row.className = `weapon-slot${s.active ? ' active' : ''}${s.active && drawing ? ' drawing' : ''}`;
        row.innerHTML = '<kbd></kbd><span class="slot-name"></span><span class="slot-ammo"></span>';
        row.querySelector('kbd')!.textContent = s.key;
        row.querySelector('.slot-name')!.textContent = s.name;
        if (s.rarity) row.querySelector('.slot-name')!.classList.add(`rar-${s.rarity}`);
        if (s.damaged) row.querySelector('.slot-name')!.append(' ', flawTag(false));
        row.querySelector('.slot-ammo')!.textContent = `${s.mag}/${s.reserve}`;
        return row;
      }),
    );
  }

  /** `max`: the body's max health (150 for the heavy build), so the bar is full at full health. */
  setHealth(h: number, max = 100) {
    const v = Math.ceil(h);
    if (v === this.lastHealth) return;
    this.lastHealth = v;
    this.healthNum.textContent = String(v);
    this.healthFill.style.width = `${Math.min(100, (v / max) * 100)}%`;
    this.healthBox.classList.toggle('low', v < 25);
    this.vignette.style.setProperty('--low', String(Math.max(0, (30 - v) / 30)));
  }

  /** The cherry's extra health: the bar turns pink while it lasts (its timer is among the buffs). */
  setBoost(on: boolean) {
    this.healthBox.classList.toggle('boost', on);
  }

  /**
   * The effects we're under, top left: a card each with its icon, name, seconds left and a bar draining
   * towards the end (blinking over the last seconds). Untimed ones (until we die) say so instead.
   */
  setBuffs(buffs: Buff[]) {
    const key = buffs.map((b) => `${b.id}:${b.label}`).join('|');
    if (key !== this.buffsKey) {
      this.buffsKey = key;
      this.buffsEl.replaceChildren();
      this.buffRows = buffs.map((b) => {
        const row = document.createElement('div');
        row.className = `buff${b.total ? '' : ' forever'}`;
        row.style.setProperty('--c', b.color);
        row.innerHTML = '<span class="buff-icon"></span><span class="buff-name"></span><b class="buff-secs"></b><div class="buff-bar"><div class="buff-fill"></div></div>';
        row.querySelector('.buff-icon')!.textContent = b.icon;
        row.querySelector('.buff-name')!.textContent = b.label;
        this.buffsEl.appendChild(row);
        return { row, secs: row.querySelector<HTMLElement>('.buff-secs')!, fill: row.querySelector<HTMLElement>('.buff-fill')!, last: -2 };
      });
    }
    buffs.forEach((b, i) => {
      const r = this.buffRows[i];
      if (!b.total || b.left === undefined) {
        if (r.last !== -1) r.secs.textContent = t('buffUntilDeath');
        r.last = -1;
        return;
      }
      r.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, b.left / b.total)).toFixed(4)})`;
      const s = Math.ceil(b.left);
      if (s === r.last) return;
      r.last = s;
      r.secs.textContent = `${s}s`;
      r.row.classList.toggle('ending', s <= 10);
    });
  }

  /**
   * The count, and the status line above it: reloading (with its bar, see setReload), low (with the key that
   * reloads: R, the controller's button, nothing on a phone where the reload button pulses) or empty.
   */
  setAmmo(mag: number, reserve: number, size: number, reloading: boolean) {
    const pad = gamepad.device === 'pad';
    const key = `${mag}|${reserve}|${reloading}|${pad}`;
    if (key === this.lastAmmo) return;
    this.lastAmmo = key;
    this.ammoMag.textContent = String(mag);
    this.ammoReserve.textContent = String(reserve);
    const low = mag <= size * 0.3;
    this.ammoMag.classList.toggle('low', low);
    const state = reloading ? 'reloading' : mag === 0 && reserve === 0 ? 'empty' : low && reserve > 0 ? 'low' : '';
    this.ammoStatus.className = state;
    this.ammoWarn.textContent = state === 'reloading' ? t('reloading') : state === 'empty' ? t('noAmmo') : state === 'low' ? t('reload') : '';
    this.ammoWarn.dataset.key = state === 'low' ? (pad ? gamepad.glyph('x') : IS_MOBILE ? '' : 'R') : '';
  }

  /** The reload bar under the status line (`progress` 0..1; null when not reloading). Every frame. */
  setReload(progress: number | null) {
    const key = progress === null ? '' : progress.toFixed(3);
    if (key === this.reloadKey) return;
    this.reloadKey = key;
    this.reloadFill.style.width = `${((progress ?? 0) * 100).toFixed(1)}%`;
  }

  setCrosshair(gapPx: number, visible: boolean) {
    this.crosshair.style.setProperty('--gap', `${gapPx.toFixed(1)}px`);
    this.crosshair.classList.toggle('hidden', !visible);
  }

  /**
   * Corrida armada: the step on the ladder ("ARMA 3/7"), its weapon and the kills toward the next one, as pips
   * (null hides it). `final`: the lightsaber step.
   */
  setLadder(l: { step: number; total: number; name: string; kills: number; need: number; final: boolean } | null) {
    const key = JSON.stringify(l);
    if (key === this.ladderKey) return;
    this.ladderKey = key;
    this.ladderEl.classList.toggle('hidden', !l);
    if (!l) return;
    this.ladderEl.classList.toggle('final', l.final);
    $('ladder-step').textContent = t('ladderHud', { n: l.step + 1, total: l.total });
    $('ladder-name').textContent = l.name;
    $('ladder-pips').innerHTML = Array.from({ length: l.need }, (_, i) => `<i class="${i < l.kills ? 'on' : ''}"></i>`).join('');
  }

  /** The end of a round: who won (`won`: we did) and the countdown line; null hides it. */
  showRoundEnd(title: string | null, next = '', won = false) {
    this.roundEl.classList.toggle('hidden', title === null);
    if (title === null) return;
    this.roundEl.classList.toggle('won', won);
    $('round-title').textContent = title;
    $('round-next').textContent = next;
  }

  /**
   * Zumbi: the wave line under the score ("ONDA 3/12 · 14 zumbis", a countdown, the break) and the boss's
   * health bar while there's one; null hides it.
   */
  setZombie(z: { title: string; sub: string; boss: { name: string; frac: number; enraged: boolean } | null; bossWave: boolean } | null) {
    const key = JSON.stringify(z && { ...z, boss: z.boss && { ...z.boss, frac: Math.round(z.boss.frac * 200) } });
    if (key === this.zwaveKey) return;
    this.zwaveKey = key;
    this.zwaveEl.classList.toggle('hidden', !z);
    if (!z) return;
    this.zwaveEl.classList.toggle('boss', z.bossWave);
    $('zwave-title').textContent = z.title;
    $('zwave-sub').textContent = z.sub;
    $('zboss').classList.toggle('hidden', !z.boss);
    if (!z.boss) return;
    $('zboss').classList.toggle('enraged', z.boss.enraged);
    $('zboss-name').textContent = z.boss.name;
    $('zboss-fill').style.width = `${(Math.max(0, Math.min(1, z.boss.frac)) * 100).toFixed(1)}%`;
  }

  /** Zumbi: the match's money over the health (null hides it); it bumps when it grows. */
  setMoney(money: number | null) {
    this.zmoneyEl.classList.toggle('hidden', money === null);
    if (money === null || money === this.zmoney) return;
    const grew = money > this.zmoney && this.zmoney >= 0;
    this.zmoney = money;
    $('zmoney-num').textContent = money.toLocaleString('pt-BR');
    if (!grew) return;
    this.zmoneyEl.classList.remove('bump');
    void this.zmoneyEl.offsetWidth;
    this.zmoneyEl.classList.add('bump');
  }

  /** Zumbi: money earned, in the score popups ("+$60 Tiro na cabeça"). */
  cash(amount: number, label: string) {
    const el = document.createElement('div');
    el.className = 'popup cash';
    el.innerHTML = `<b></b> `;
    el.querySelector('b')!.textContent = `+$${amount}`;
    el.append(label);
    this.popups.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }

  /** Zumbi: the end-of-match card (null hides it). */
  showZombieSummary(s: { title: string; sub: string; won: boolean; head: string[]; rows: { cells: string[]; me: boolean }[]; next: string } | null) {
    this.zsumEl.classList.toggle('hidden', !s);
    if (!s) return;
    this.zsumEl.classList.toggle('won', s.won);
    $('zsum-title').textContent = s.title;
    $('zsum-sub').textContent = s.sub;
    $('zsum-next').textContent = s.next;
    $('zsum-head').replaceChildren(...s.head.map((h) => Object.assign(document.createElement('th'), { textContent: h })));
    $('zsum-body').replaceChildren(
      ...s.rows.map((r) => {
        const tr = document.createElement('tr');
        if (r.me) tr.className = 'me';
        for (const c of r.cells) tr.appendChild(Object.assign(document.createElement('td'), { textContent: c }));
        return tr;
      }),
    );
  }

  /** Only the countdown line of the summary (it changes every second). */
  setZombieSummaryNext(text: string) {
    $('zsum-next').textContent = text;
  }

  /** Only a melee weapon in hand (the lightsaber): no ammo count, no gun slots. */
  setMeleeOnly(on: boolean) {
    $('ammo').classList.toggle('melee-only', on);
  }

  setScore(points: number, kills: number, accuracy: number) {
    this.scorePoints.textContent = String(points);
    this.scoreKills.textContent = String(kills);
    this.scoreAcc.textContent = `${Math.round(accuracy * 100)}%`;
  }

  hit(kind: HitKind) {
    // Phones: a short buzz on a hit, a longer one on a kill (Android; iOS ignores it).
    if (IS_MOBILE) navigator.vibrate?.(kind === 'kill' ? 40 : 12);
    gamepad.rumble(kind === 'kill' ? 160 : 60, kind === 'kill' ? 0.5 : 0.15, 0.6);
    this.hitmarker.className = `show ${kind}`;
    // Restart the CSS animation.
    void this.hitmarker.offsetWidth;
    this.hitmarker.classList.add('pop');
    this.hitTimer = kind === 'kill' ? 0.35 : 0.18;
  }

  /** Score popups stack under the crosshair and add up into a running total. */
  popup(label: string, points: number) {
    const el = document.createElement('div');
    el.className = 'popup';
    el.innerHTML = `<b>+${points}</b> ${label}`;
    this.popups.appendChild(el);
    setTimeout(() => el.remove(), 1600);
    if (!this.popupTotalEl || this.popupTimer <= 0) {
      this.popupTotal = 0;
      this.popupTotalEl?.remove();
      this.popupTotalEl = document.createElement('div');
      this.popupTotalEl.className = 'popup-total';
      this.popups.prepend(this.popupTotalEl);
    }
    this.popupTotal += points;
    this.popupTotalEl.textContent = `+${this.popupTotal}`;
    this.popupTotalEl.classList.remove('bump');
    void this.popupTotalEl.offsetWidth;
    this.popupTotalEl.classList.add('bump');
    this.popupTimer = 2;
  }

  killfeed(killer: string, weapon: string, victim: string, icon: FeedIcon = null) {
    const el = document.createElement('div');
    el.className = 'feed-row';
    el.innerHTML = `<span class="me"></span><span class="weapon"></span>${icon ? `<span class="icon ${icon}">${FEED_ICONS[icon]}</span>` : ''}<span class="victim"></span>`;
    el.querySelector('.me')!.textContent = killer;
    el.querySelector('.weapon')!.textContent = `[${weapon}]`;
    el.querySelector('.victim')!.textContent = victim;
    this.feed.prepend(el);
    while (this.feed.children.length > 5) this.feed.lastElementChild!.remove();
    setTimeout(() => el.classList.add('fade'), 5000);
    setTimeout(() => el.remove(), 5600);
  }

  /** Grenade slots left of the ammo count: filled = carried, faded = used. */
  /**
   * Grenade pips: the ones in hand lit, and the one on its way back (`recharge` 0..1, null: none) filling up
   * from the bottom like a progress bar in the grenade's shape.
   */
  setGrenades(count: number, max: number, recharge: number | null = null) {
    const charging = recharge !== null && count < max;
    const key = `${count}/${max}/${charging}`;
    if (key !== this.grenadesKey) {
      this.grenadesKey = key;
      this.grenadesEl.innerHTML = Array.from({ length: max }, (_, i) => `<i class="${i < count ? 'on' : i === count && charging ? 'charging' : ''}"></i>`).join('');
    }
    if (charging) (this.grenadesEl.children[count] as HTMLElement).style.setProperty('--p', recharge.toFixed(3));
  }

  /** Fuse bar under the crosshair while a grenade is cooking; null hides it. */
  setCook(fraction: number | null) {
    this.cook.classList.toggle('hidden', fraction === null);
    if (fraction === null) return;
    this.cookFill.style.width = `${(fraction * 100).toFixed(1)}%`;
    this.cook.classList.toggle('danger', fraction < 0.34);
  }

  /** Grenade nearby: icon around the crosshair pointing at it. `angle` in radians, 0 = straight ahead. */
  setGrenadeWarning(angle: number | null, closeness = 0) {
    this.warn.classList.toggle('hidden', angle === null);
    if (angle === null) return;
    const r = 96;
    this.warn.style.transform = `translate(${Math.sin(angle) * r}px, ${-Math.cos(angle) * r}px)`;
    (this.warn.querySelector('.arrow') as HTMLElement).style.transform = `rotate(${angle}rad)`;
    this.warn.style.opacity = String(0.55 + closeness * 0.45);
  }

  /**
   * Zumbi: arrows around the crosshair pointing to the gaps the horde is coming through (`angle` in radians, 0 =
   * straight ahead; `level` 1..3 by how many; `label`: how many, or the boards' mark when it's barricaded).
   */
  setEntrances(list: { angle: number; level: number; label: string }[]) {
    const key = list.map((e) => `${e.angle.toFixed(2)}|${e.level}|${e.label}`).join(',');
    if (key === this.entriesKey) return;
    this.entriesKey = key;
    while (this.entrances.children.length < list.length) {
      const el = document.createElement('div');
      el.innerHTML = '<span class="arrow">▲</span><span class="n"></span>';
      this.entrances.appendChild(el);
    }
    [...this.entrances.children].forEach((node, i) => {
      const el = node as HTMLElement;
      const e = list[i];
      el.className = e ? `zentry lvl${e.level}` : 'zentry hidden';
      if (!e) return;
      const r = 132;
      el.style.transform = `translate(${(Math.sin(e.angle) * r).toFixed(1)}px, ${(-Math.cos(e.angle) * r).toFixed(1)}px)`;
      (el.querySelector('.arrow') as HTMLElement).style.transform = `rotate(${e.angle.toFixed(3)}rad)`;
      el.querySelector('.n')!.textContent = e.label;
    });
  }

  /** Big animated banner ("NO PÁSSARO!", "OPRIMIDO!"). */
  showBanner(text: string, variant: 'bird' | 'taunt' | 'level' | 'flaw') {
    this.banner.textContent = text;
    this.banner.className = variant;
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
    this.bannerTimer = 1.8;
  }

  /** Context prompt with a key badge and a draining bar; null hides it. */
  setPrompt(key: string | null, text = '', frac = 0) {
    if (key === null) {
      if (this.promptKey !== '') {
        this.prompt.classList.add('hidden');
        this.promptKey = '';
      }
      return;
    }
    const id = `${key}|${text}`;
    if (id !== this.promptKey) {
      this.promptKey = id;
      this.prompt.classList.remove('hidden');
      // Controller: its button; phones: the prompt itself is tapped.
      this.prompt.querySelector('kbd')!.textContent = gamepad.device === 'pad' ? gamepad.glyph('y') : IS_MOBILE ? t('tapHint') : key;
      this.promptText.textContent = text;
    }
    this.promptFill.style.width = `${(frac * 100).toFixed(1)}%`;
  }

  /** Plain line in the kill feed ("Fulano entrou"). */
  notice(text: string) {
    const el = document.createElement('div');
    el.className = 'feed-row notice';
    el.textContent = text;
    this.feed.prepend(el);
    while (this.feed.children.length > 5) this.feed.lastElementChild!.remove();
    setTimeout(() => el.classList.add('fade'), 4000);
    setTimeout(() => el.remove(), 4600);
  }

  setNetStatus(text: string | null) {
    const el = document.getElementById('net-status')!;
    el.classList.toggle('hidden', text === null);
    if (text !== null) el.textContent = text;
  }

  damageFlash(amount: number) {
    gamepad.rumble(180, Math.min(1, 0.3 + amount / 50), 0.4);
    this.vignette.style.setProperty('--hit', String(Math.min(1, 0.3 + amount / 60)));
    this.vignette.classList.remove('flash');
    void this.vignette.offsetWidth;
    this.vignette.classList.add('flash');
  }

  showDeath(message: string | null) {
    this.death.classList.toggle('hidden', message === null);
    if (message !== null) this.deathMsg.textContent = message;
  }

  /** The killer's album sticker (its HTML) and title on the death card; both empty: nothing to show. */
  setDeathShowcase(badge: string, title: string) {
    this.deathShowcase.classList.toggle('hidden', !badge && !title);
    this.deathShowcase.innerHTML = badge;
    if (!title) return;
    const span = document.createElement('span');
    span.className = 'death-title';
    span.textContent = title;
    this.deathShowcase.append(span);
  }

  setDeathTimer(seconds: number) {
    this.deathTimer.textContent = t('respawnIn', { s: Math.ceil(seconds) });
  }

  /** The death card's second line, said another way (zumbi: back next wave, or down and waiting for help). */
  setDeathText(text: string) {
    this.deathTimer.textContent = text;
  }

  setDebug(text: string | null) {
    this.debug.classList.toggle('hidden', text === null);
    if (text !== null) this.debug.textContent = text;
  }

  update(dt: number) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.className = '';
    }
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.hitmarker.className = '';
    }
    if (this.popupTimer > 0) {
      this.popupTimer -= dt;
      if (this.popupTimer <= 0 && this.popupTotalEl) {
        const el = this.popupTotalEl;
        el.classList.add('fade');
        setTimeout(() => el.remove(), 400);
        this.popupTotalEl = null;
      }
    }
  }
}
