// The Body tab's height and build (PF-33): a police line-up wall in SVG (no WebGL). A ruler cut to 1.40–2.00 m, so the
// 7 cm between the choices show, and three generic silhouettes: the three heights (EFFECTS.heightScale × 1.80 m:
// 1.73, 1.80 and 1.87 m), or the three builds at the player's height (different widths). The chosen one is orange and
// holds the plate with its name and height. Each silhouette is a real button over the picture (mouse, touch,
// keyboard and controller). Height and build are only looks (ADR "Altura e biotipo apenas visuais").
import { BUILDS, HEIGHTS, type Build, type Height } from '@shared/appearance';
import { heightMeters, metersText, WALL_FROM, WALL_TO } from './rules';

const W = 480;
const H = 160;
/** The ruler's width; the wall is the rest. */
const RULER = 40;
const TOP = 6;
const PX_PER_M = (H - TOP) / (WALL_TO - WALL_FROM);
const COL = (W - RULER) / 3;
/** Shoulder width by build (the silhouettes' look; the body's morphs are client/character/body.ts). */
const BUILD_WIDTH: Record<Build, number> = { magro: 0.84, medio: 1, gordo: 1.2 };

const y = (m: number) => H - (m - WALL_FROM) * PX_PER_M;
const f = (n: number) => n.toFixed(1);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** A generic head-and-shoulders silhouette: `cx` its middle, `meters` its height, `wf` its width factor. */
function figure(cx: number, meters: number, wf: number): string {
  const top = y(meters);
  // Style guide: 7 heads to the body.
  const head = (meters / 7) * PX_PER_M;
  const neck = head * 0.2 * Math.sqrt(wf);
  const neckTop = top + head * 0.9;
  const neckBottom = top + head * 1.18;
  const sy = top + head * 1.34;
  const sh = head * 0.86 * wf;
  const arm = sh + head * 0.14 * wf;
  const bottom = H + 30;
  return `<ellipse cx="${f(cx)}" cy="${f(top + head * 0.5)}" rx="${f(head * 0.37)}" ry="${f(head * 0.5)}"/>
    <path d="M${f(cx - neck)},${f(neckTop)} L${f(cx - neck)},${f(neckBottom)} C${f(cx - neck)},${f(sy - head * 0.08)} ${f(cx - sh * 0.7)},${f(sy - head * 0.12)} ${f(cx - sh)},${f(sy)} Q${f(cx - arm)},${f(sy + head * 0.05)} ${f(cx - arm)},${f(sy + head * 0.42)} L${f(cx - arm * 0.97)},${bottom} L${f(cx + arm * 0.97)},${bottom} L${f(cx + arm)},${f(sy + head * 0.42)} Q${f(cx + arm)},${f(sy + head * 0.05)} ${f(cx + sh)},${f(sy)} C${f(cx + sh * 0.7)},${f(sy - head * 0.12)} ${f(cx + neck)},${f(sy - head * 0.08)} ${f(cx + neck)},${f(neckBottom)} L${f(cx + neck)},${f(neckTop)} Z"/>`;
}

export interface LineupText {
  /** A choice's name ('Pequeno', 'Magro'…). */
  name(v: Height | Build): string;
  lang: 'pt' | 'en';
}

/**
 * The wall for the height (`which` 'height': the three heights) or the build (the three builds at `height`), with
 * `chosen` highlighted. Buttons carry data-wall and data-v.
 */
export function lineupHtml(which: 'height' | 'build', chosen: Height | Build, height: Height, text: LineupText): string {
  const values: readonly (Height | Build)[] = which === 'height' ? HEIGHTS : BUILDS;
  const ruler: string[] = [];
  for (let cm = Math.round(WALL_FROM * 100); cm <= Math.round(WALL_TO * 100); cm += 2) {
    const yy = y(cm / 100);
    const major = cm % 10 === 0;
    ruler.push(`<line x1="${major ? RULER - 12 : RULER - 6}" x2="${RULER}" y1="${f(yy)}" y2="${f(yy)}" class="cz-wall-tick"/>`);
    if (major) {
      ruler.push(`<line x1="${RULER}" x2="${W}" y1="${f(yy)}" y2="${f(yy)}" class="cz-wall-line"/>`);
      if (cm < WALL_TO * 100) ruler.push(`<text x="${RULER - 14}" y="${f(yy - 2)}" class="cz-wall-num">${metersText(cm / 100, text.lang).replace(' m', '')}</text>`);
    }
  }
  const figs = values.map((v, i) => {
    const cx = RULER + COL * (i + 0.5);
    const m = heightMeters(which === 'height' ? (v as Height) : height);
    const wf = which === 'build' ? BUILD_WIDTH[v as Build] : 1;
    const on = v === chosen;
    const topY = y(m);
    const label = which === 'height' ? metersText(m, text.lang) : text.name(v);
    return `<g class="cz-fig${on ? ' on' : ''}">
        <line x1="${RULER}" x2="${f(cx)}" y1="${f(topY)}" y2="${f(topY)}" class="cz-wall-mark"/>
        ${figure(cx, m, wf)}
        <text x="${f(cx)}" y="${f(topY - 5)}" class="cz-fig-label">${esc(label)}</text>
        ${on ? `<rect x="${f(cx - 46)}" y="${H - 26}" width="92" height="20" rx="3" class="cz-plate"/><text x="${f(cx)}" y="${H - 12}" class="cz-plate-text">${esc(`${text.name(v).toUpperCase()} · ${metersText(m, text.lang)}`)}</text>` : ''}
      </g>`;
  });
  const buttons = values
    .map((v, i) => {
      const m = heightMeters(which === 'height' ? (v as Height) : height);
      return `<button type="button" class="cz-wall-pick" data-wall="${which}" data-v="${v}" aria-pressed="${v === chosen}" aria-label="${esc(`${text.name(v)}, ${metersText(m, text.lang)}`)}" style="left:${f(((RULER + COL * i) / W) * 100)}%;width:${f((COL / W) * 100)}%"></button>`;
    })
    .join('');
  return `<div class="cz-wall" data-wall="${which}">
      <svg viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">
        <rect x="${RULER}" y="0" width="${W - RULER}" height="${H}" class="cz-wall-bg"/>
        <rect x="0" y="0" width="${RULER}" height="${H}" class="cz-wall-ruler"/>
        ${ruler.join('')}
        ${figs.join('')}
      </svg>
      ${buttons}
    </div>`;
}
