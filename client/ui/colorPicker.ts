// The game's own color picker (PF-33), for clothes, accessories and tactical gear (skin, hair and eyes stay on the
// palette's swatches). No browser color control: a saturation × value square over the hue, a hue strip, the color
// before and now (pressing "before" undoes), the house palette in groups with each color's name, "Combina"
// (tone on tone, colors already worn, a desaturated hue neighbour), the 10 most recent colors and the hex code.
//
// The limits of shared/color.ts show on the square: hatched where the main color of a big piece would turn neon
// (the cursor stops at the edge and a line says why), and the floor of brightness at the bottom (no pure black).
// Mouse and touch (Pointer Events, captured), keyboard (role="slider": arrows, Shift ×10, Enter confirms, Esc undoes,
// leaving the control confirms) and controller (client/ui/padNav.ts: ✕ on the square enters adjust mode and the
// D-pad moves the cursor). While dragging only the stage changes (`onInput`, once per frame); on release the color
// goes to the look and to the recent ones (`onChange`).
import { suggestedColors } from '@shared/appearance';
import type { Slot } from '@shared/catalog';
import { clampItemColor, colorLimit, hexToHsv, hexToRgb, hsvToHex, isBigMain, MAX_CHROMA, MIN_VALUE, normalizeHex, rgbToHex } from '@shared/color';
import { FAMILIES, type Family } from '@shared/palette';

type Lang = 'pt' | 'en';
const T: Record<string, [string, string]> = {
  sv: ['Saturação e brilho', 'Saturation and brightness'],
  svText: ['Saturação {s}%, brilho {v}%', 'Saturation {s}%, brightness {v}%'],
  hue: ['Tom da cor', 'Hue'],
  before: ['Antes (toque para desfazer)', 'Before (tap to undo)'],
  now: ['Agora', 'Now'],
  hex: ['Código da cor', 'Color code'],
  neon: ['Tecido não fica neon nas peças grandes', "Fabric doesn't go neon on the big pieces"],
  dark: ['Preto puro não vale: o mais escuro é o preto da casa', 'No pure black: the darkest is the house black'],
  badHex: ['Código inválido (use #rrggbb)', 'Invalid code (use #rrggbb)'],
  combina: ['Combina', 'Goes with'],
  recent: ['Recentes', 'Recent'],
  house: ['Paleta da casa', 'House palette'],
  fabricNeutral: ['Neutros', 'Neutrals'],
  fabricEarth: ['Terrosos', 'Earth'],
  fabricCold: ['Frios', 'Cool'],
  leather: ['Couros', 'Leathers'],
  metal: ['Metais', 'Metals'],
  accent: ['Acentos', 'Accents'],
};

/** The palette's colors by name (style guide), for the house palette's tooltips. */
const NAMES: Record<string, [string, string]> = {
  black: ['Preto', 'Black'],
  graphite: ['Grafite', 'Graphite'],
  gray: ['Cinza', 'Gray'],
  offWhite: ['Branco gelo', 'Off-white'],
  beige: ['Bege', 'Beige'],
  khaki: ['Cáqui', 'Khaki'],
  olive: ['Oliva', 'Olive'],
  moss: ['Musgo', 'Moss'],
  brown: ['Marrom', 'Brown'],
  caramel: ['Caramelo', 'Caramel'],
  rust: ['Ferrugem', 'Rust'],
  mustard: ['Mostarda', 'Mustard'],
  navy: ['Marinho', 'Navy'],
  denim: ['Jeans', 'Denim'],
  petrol: ['Petróleo', 'Petrol'],
  wine: ['Vinho', 'Wine'],
  darkPurple: ['Roxo escuro', 'Dark purple'],
  leather1: ['Couro escuro', 'Dark leather'],
  leather2: ['Couro café', 'Coffee leather'],
  leather3: ['Couro médio', 'Medium leather'],
  leather4: ['Couro conhaque', 'Cognac leather'],
  leather5: ['Couro claro', 'Light leather'],
  rubber: ['Borracha', 'Rubber'],
  rubberGray: ['Borracha cinza', 'Gray rubber'],
  steel: ['Aço', 'Steel'],
  brass: ['Latão', 'Brass'],
  bronze: ['Bronze', 'Bronze'],
  paintedMetal: ['Metal pintado', 'Painted metal'],
  darkSteel: ['Aço escuro', 'Dark steel'],
  gunmetal: ['Cinza-chumbo', 'Gunmetal'],
  orange: ['Laranja', 'Orange'],
  yellow: ['Amarelo', 'Yellow'],
  red: ['Vermelho', 'Red'],
  turquoise: ['Turquesa', 'Turquoise'],
  lime: ['Lima', 'Lime'],
};

/** The house palette's groups, in order (palette families of the item colors). */
const GROUPS: Family[] = ['fabricNeutral', 'fabricEarth', 'fabricCold', 'leather', 'metal', 'accent'];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// --- Pure parts (client/tests/colorPicker.test.ts) ---------------------------------------------------------------

/** Where the recent colors are kept (this browser only). */
export const RECENT_KEY = 'oc.cores.recentes';
export const RECENT_MAX = 10;

/** The recent colors with `hex` first: at most 10, no repeats. */
export function pushRecent(list: readonly string[], hex: string): string[] {
  const h = normalizeHex(hex);
  if (!h) return list.slice(0, RECENT_MAX);
  return [h, ...list.filter((c) => c !== h)].slice(0, RECENT_MAX);
}

/** A kept list read back (anything that isn't a list of colors is dropped). */
export function parseRecent(raw: string | null): string[] {
  try {
    const v = JSON.parse(raw ?? '[]');
    if (!Array.isArray(v)) return [];
    const out: string[] = [];
    for (const c of v) {
      const h = normalizeHex(c);
      if (h && !out.includes(h)) out.push(h);
    }
    return out.slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function readRecent(): string[] {
  try {
    return parseRecent(localStorage.getItem(RECENT_KEY));
  } catch {
    return [];
  }
}

function saveRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* private window: the list lasts while the page is open */
  }
}

/** The shade rule of the character's items (Character.channelsFor: secondary = primary × 0.72). */
export const SHADE = 0.72;

/**
 * "Combina": colors that go with `current` on this channel: tone on tone (× 0.72, the items' shade rule), the colors
 * the look already wears, and the hue neighbours (± 30°) at half the saturation. Within the channel's limits, without
 * `current`, no repeats, at most `max`.
 */
export function matchingColors(current: string, used: readonly string[], slot: Slot, channel: number, max = 8): string[] {
  const cur = normalizeHex(current);
  if (!cur) return [];
  const [r, g, b] = hexToRgb(cur);
  const { h, s, v } = hexToHsv(cur);
  const raw = [rgbToHex([r * SHADE, g * SHADE, b * SHADE]), hsvToHex({ h: h + 30, s: s * 0.5, v }), hsvToHex({ h: h - 30, s: s * 0.5, v }), ...used];
  const out: string[] = [];
  for (const c of raw) {
    const x = clampItemColor(c, slot, channel);
    if (x && x !== cur && !out.includes(x)) out.push(x);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * A point of the saturation × value square (0–1 each, value up) within the channel's limits: the value never under
 * the floor, the saturation never past the neon edge (S × V = chroma) of a big piece's main color. `limit` says
 * which one stopped it.
 */
export function limitSv(s: number, v: number, slot: Slot, channel: number): { s: number; v: number; limit: 'neon' | 'escuro' | null } {
  let limit: 'neon' | 'escuro' | null = null;
  s = clamp01(s);
  v = clamp01(v);
  if (v < MIN_VALUE) {
    v = MIN_VALUE;
    limit = 'escuro';
  }
  if (isBigMain(slot, channel) && s * v > MAX_CHROMA) {
    s = MAX_CHROMA / v;
    limit = 'neon';
  }
  return { s, v, limit };
}

/** The house palette for a channel: its suggested colors in their families, each color once, with its name. */
export function houseGroups(slot: Slot, channel: number): { family: Family; colors: { hex: string; name: string }[] }[] {
  const allowed = new Set(suggestedColors(slot, channel));
  const seen = new Set<string>();
  return GROUPS.map((family) => ({
    family,
    colors: FAMILIES[family].filter(([, hex]) => allowed.has(hex) && !seen.has(hex) && seen.add(hex)).map(([name, hex]) => ({ hex, name })),
  })).filter((g) => g.colors.length);
}

// --- The picker ---------------------------------------------------------------------------------------------------

export interface ColorPickerOptions {
  slot: Slot;
  channel: number;
  /** The color now (and "before"). */
  value: string;
  lang: Lang;
  /** The colors the look wears (Combina). */
  used(): string[];
  /** Live, while dragging or with the arrows: only the stage changes (once per frame). */
  onInput(hex: string): void;
  /** Confirmed (released, Enter, a swatch, the code, leaving the control): the look and the recent colors. */
  onChange(hex: string): void;
  /** A drag starts or ends (the cards' drawing holds meanwhile). */
  onDrag?(active: boolean): void;
}

export class ColorPicker {
  readonly el: HTMLElement;
  private h = 0;
  private s = 0;
  private v = 0;
  private hex: string;
  private readonly before: string;
  private pending = false;
  private dragging: HTMLElement | null = null;
  private raf = 0;
  private readonly sv: HTMLElement;
  private readonly hue: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly warn: HTMLElement;

  constructor(host: HTMLElement, private readonly o: ColorPickerOptions) {
    const t = (k: string) => (T[k] ?? [k, k])[o.lang === 'en' ? 1 : 0];
    this.hex = this.before = clampItemColor(o.value, o.slot, o.channel) ?? '#7a7e83';
    this.fromHex(this.hex);
    const neon = isBigMain(o.slot, o.channel);
    // The limits drawn over the square (0–100: x saturation, y 100 − value).
    const edge = Array.from({ length: 24 }, (_, i) => {
      const v = 1 - (i / 23) * (1 - MAX_CHROMA);
      return `${((MAX_CHROMA / v) * 100).toFixed(2)},${((1 - v) * 100).toFixed(2)}`;
    });
    const floor = ((1 - MIN_VALUE) * 100).toFixed(2);
    this.el = document.createElement('div');
    this.el.className = 'cp';
    this.el.innerHTML = `
      <div class="cp-sv" role="slider" tabindex="0" data-slider-2d aria-label="${esc(t('sv'))}" aria-valuemin="0" aria-valuemax="100">
        <svg class="cp-limits" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs><pattern id="cp-hatch-${o.slot}-${o.channel}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="rgba(27,21,48,0.25)"/><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,248,236,0.85)" stroke-width="2.4"/></pattern></defs>
          ${neon ? `<path d="M${(MAX_CHROMA * 100).toFixed(2)},0 L100,0 L100,${((1 - MAX_CHROMA) * 100).toFixed(2)} L${edge.reverse().join(' L')} Z" fill="url(#cp-hatch-${o.slot}-${o.channel})"/>` : ''}
          <rect x="0" y="${floor}" width="100" height="${(MIN_VALUE * 100).toFixed(2)}" fill="url(#cp-hatch-${o.slot}-${o.channel})"/>
        </svg>
        <span class="cp-cursor"></span>
      </div>
      <div class="cp-hue" role="slider" tabindex="0" aria-orientation="horizontal" aria-label="${esc(t('hue'))}" aria-valuemin="0" aria-valuemax="360"><span class="cp-hue-cursor"></span></div>
      <div class="cp-row">
        <div class="cp-compare">
          <button type="button" class="cp-before" title="${esc(t('before'))}" aria-label="${esc(t('before'))}"></button>
          <span class="cp-now" title="${esc(t('now'))}"></span>
        </div>
        <label class="cp-hex"><span>#</span><input type="text" inputmode="text" maxlength="7" spellcheck="false" autocomplete="off" aria-label="${esc(t('hex'))}" /></label>
      </div>
      <p class="cp-warn" role="status" aria-live="polite"></p>
      <div class="cp-lists"></div>`;
    host.appendChild(this.el);
    this.sv = this.el.querySelector('.cp-sv')!;
    this.hue = this.el.querySelector('.cp-hue')!;
    this.input = this.el.querySelector('.cp-hex input')!;
    this.warn = this.el.querySelector('.cp-warn')!;
    this.el.querySelector<HTMLElement>('.cp-before')!.style.background = this.before;
    this.el.querySelector<HTMLButtonElement>('.cp-before')!.onclick = () => this.revert();
    this.wire(this.sv, (x, y) => {
      const c = limitSv(x, 1 - y, o.slot, o.channel);
      this.s = c.s;
      this.v = c.v;
      this.say(c.limit);
    });
    this.wire(this.hue, (x) => {
      this.h = x * 360;
      const c = limitSv(this.s, this.v, o.slot, o.channel);
      this.s = c.s;
      this.v = c.v;
    });
    this.sv.onkeydown = (e) => this.key(e, (step) => {
      const ds = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
      const dv = e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0;
      const c = limitSv(this.s + ds, this.v + dv, o.slot, o.channel);
      this.s = c.s;
      this.v = c.v;
      this.say(c.limit);
    });
    this.hue.onkeydown = (e) => this.key(e, (step) => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1;
      this.h = (((this.h + d * step * 360) % 360) + 360) % 360;
    });
    // Leaving the control confirms what the arrows did (P12).
    this.sv.onblur = this.hue.onblur = () => {
      if (!this.dragging) this.commit();
    };
    this.input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.typed();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.input.value = this.hex.slice(1);
      }
    };
    this.input.onchange = () => this.typed();
    this.el.querySelector<HTMLElement>('.cp-lists')!.onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-c]');
      if (!b) return;
      this.say(colorLimit(b.dataset.c!, o.slot, o.channel));
      this.pick(b.dataset.c!);
    };
    this.render();
    this.lists();
  }

  private t(k: string) {
    return (T[k] ?? [k, k])[this.o.lang === 'en' ? 1 : 0];
  }

  /** The color as hue, saturation and value (a gray keeps the hue it had: the square doesn't jump). */
  private fromHex(hex: string) {
    const c = hexToHsv(hex);
    if (c.s > 0) this.h = c.h;
    this.s = c.s;
    this.v = c.v;
  }

  /** Pointer on a square or strip: captured, the point (0–1) given to `set` on down and every move. */
  private wire(el: HTMLElement, set: (x: number, y: number) => void) {
    const at = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      set(clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height));
      this.live();
    };
    el.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      el.focus({ preventScroll: true });
      el.setPointerCapture(e.pointerId);
      this.dragging = el;
      this.o.onDrag?.(true);
      at(e);
    };
    el.onpointermove = (e) => {
      if (this.dragging === el) at(e);
    };
    el.onpointerup = el.onpointercancel = (e) => {
      if (this.dragging !== el) return;
      this.dragging = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      this.o.onDrag?.(false);
      this.commit();
    };
  }

  /** Arrows (Shift: ×10), Enter confirms, Esc undoes. */
  private key(e: KeyboardEvent, move: (step: number) => void) {
    if (e.key.startsWith('Arrow')) {
      move(e.shiftKey ? 0.1 : 0.01);
      this.live();
    } else if (e.key === 'Enter' || e.key === ' ') this.commit();
    else if (e.key === 'Escape') this.revert();
    else return;
    // The warehouse's keys (Esc, arrows) are not for it.
    e.preventDefault();
    e.stopPropagation();
  }

  /** The limit's line (null hides it). */
  private say(limit: 'neon' | 'escuro' | 'bad' | null) {
    this.warn.textContent = limit === 'neon' ? this.t('neon') : limit === 'escuro' ? this.t('dark') : limit === 'bad' ? this.t('badHex') : '';
    this.warn.classList.toggle('on', !!limit);
  }

  /** A change not confirmed yet: the stage gets it on the next frame. */
  private live() {
    this.hex = clampItemColor(hsvToHex({ h: this.h, s: this.s, v: this.v }), this.o.slot, this.o.channel)!;
    this.pending = true;
    this.render();
    if (!this.raf)
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        this.o.onInput(this.hex);
      });
  }

  /** The change goes to the look (and to the recent colors). */
  private commit(recent = true) {
    if (!this.pending) return;
    this.pending = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.o.onInput(this.hex);
    this.o.onChange(this.hex);
    if (recent) saveRecent(pushRecent(readRecent(), this.hex));
    this.lists();
  }

  /** A swatch or a typed code: within the limits, confirmed. */
  private pick(hex: string) {
    const c = clampItemColor(hex, this.o.slot, this.o.channel);
    if (!c) return;
    this.hex = c;
    this.fromHex(c);
    this.pending = true;
    this.render();
    this.commit();
  }

  private typed() {
    const n = normalizeHex(this.input.value);
    if (!n) {
      this.say('bad');
      this.input.value = this.hex.slice(1);
      return;
    }
    this.say(colorLimit(n, this.o.slot, this.o.channel));
    if (n !== this.hex) this.pick(n);
  }

  /** Back to the color it had when the picker opened. */
  private revert() {
    this.say(null);
    this.hex = this.before;
    this.fromHex(this.before);
    this.pending = true;
    this.render();
    this.commit(false);
  }

  /** The square, the strip, the cursors, the sample and the code as they are now. */
  private render() {
    const hue = `hsl(${this.h.toFixed(1)} 100% 50%)`;
    this.sv.style.setProperty('--cp-hue', hue);
    this.sv.style.setProperty('--cp-x', `${(this.s * 100).toFixed(2)}%`);
    this.sv.style.setProperty('--cp-y', `${((1 - this.v) * 100).toFixed(2)}%`);
    this.sv.style.setProperty('--cp-color', this.hex);
    this.hue.style.setProperty('--cp-x', `${((this.h / 360) * 100).toFixed(2)}%`);
    this.hue.style.setProperty('--cp-hue', hue);
    const s = Math.round(this.s * 100);
    const v = Math.round(this.v * 100);
    this.sv.setAttribute('aria-valuenow', String(s));
    this.sv.setAttribute('aria-valuetext', this.t('svText').replace('{s}', String(s)).replace('{v}', String(v)));
    this.hue.setAttribute('aria-valuenow', String(Math.round(this.h)));
    this.el.querySelector<HTMLElement>('.cp-now')!.style.background = this.hex;
    if (document.activeElement !== this.input) this.input.value = this.hex.slice(1);
  }

  /** Combina, Recentes and the house palette (redrawn when a color is confirmed, never while dragging). */
  private lists() {
    const o = this.o;
    const sw = (hex: string, name?: string) =>
      `<button type="button" class="cp-swatch" data-c="${hex}" style="background:${hex}" title="${esc(name ?? hex)}" aria-label="${esc(name ?? hex)}" aria-pressed="${hex === this.hex}"></button>`;
    const match = matchingColors(this.hex, o.used(), o.slot, o.channel);
    const recent = [...new Set(readRecent().map((c) => clampItemColor(c, o.slot, o.channel)!))];
    const lang = o.lang === 'en' ? 1 : 0;
    this.el.querySelector('.cp-lists')!.innerHTML = `
      ${match.length ? `<h5>${esc(this.t('combina'))}</h5><div class="cp-swatches">${match.map((c) => sw(c)).join('')}</div>` : ''}
      ${recent.length ? `<h5>${esc(this.t('recent'))}</h5><div class="cp-swatches">${recent.map((c) => sw(c)).join('')}</div>` : ''}
      <h5>${esc(this.t('house'))}</h5>
      <div class="cp-house">${houseGroups(o.slot, o.channel)
        .map((g) => `<div class="cp-group"><span>${esc(this.t(g.family))}</span><div class="cp-swatches">${g.colors.map((c) => sw(c.hex, NAMES[c.name]?.[lang] ?? c.hex)).join('')}</div></div>`)
        .join('')}</div>`;
  }

  /** The color shown, from outside (the look changed: random, reset). */
  set(hex: string) {
    const c = clampItemColor(hex, this.o.slot, this.o.channel);
    if (!c || c === this.hex) return;
    this.hex = c;
    this.fromHex(c);
    this.render();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    if (this.pending && !this.dragging) this.commit();
    this.el.remove();
  }
}
