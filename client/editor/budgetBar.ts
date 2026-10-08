// The editor's live budget bar: what the map costs to draw as the game builds it (static geometry batched across
// pieces), measured the way the server measures it on save (client/world/budget.ts measureMapBudget). The editor
// shows every piece apart, so the map is built again in the game's mode, out of sight in a scene and a physics
// world of its own, a short while after the last edit. Above MAP_BUDGET (400 draw calls, 750 thousand
// triangles) the map can't be saved: the bar says what passed the limit.
import * as THREE from 'three';
import { MAP_BUDGET, validateMapData, type MapData } from '@shared/mapData';
import { createPhysics } from '../world/physics';
import { buildMapFromData } from '../world/mapLoader';
import { measureMapBudget, type BudgetReport } from '../world/budget';
import { silentSfx } from './view';
import { locale } from '../ui/strings';
import { et } from './strings';

/** Waits this long after the last edit before measuring (a drag commits once, but typing may commit a few times). */
export const BUDGET_DELAY_MS = 600;

export type BudgetState = { kind: 'medindo' } | { kind: 'invalido'; erros: string[] } | { kind: 'erro'; erro: string } | { kind: 'pronto'; report: BudgetReport };

/** Builds the map as the game does and measures it. */
export async function measureData(data: MapData, renderer: THREE.WebGLRenderer): Promise<BudgetReport> {
  const physics = await createPhysics();
  try {
    const scene = new THREE.Scene();
    await buildMapFromData(structuredClone(data), { physics, scene, renderer, sfx: silentSfx, modo: 'jogo' });
    return measureMapBudget(scene, data);
  } finally {
    physics.world.free();
  }
}

export class BudgetBar {
  state: BudgetState = { kind: 'medindo' };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private again = false;
  /** The state changed (the Save button follows it). */
  onChange: (s: BudgetState) => void = () => {};

  constructor(
    private readonly el: HTMLElement,
    private readonly data: () => MapData,
    private readonly renderer: THREE.WebGLRenderer,
  ) {}

  /** Measures again a short while after the last call. */
  schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), BUDGET_DELAY_MS);
  }

  /** Whether the map fits (valid, measured and under the limits). */
  get fits() {
    return this.state.kind === 'pronto' && this.state.report.excedeu.length === 0;
  }

  private async run() {
    this.timer = null;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    this.set({ kind: 'medindo' });
    const data = this.data();
    const check = validateMapData(data);
    try {
      if (!check.ok) this.set({ kind: 'invalido', erros: check.erros });
      else this.set({ kind: 'pronto', report: await measureData(data, this.renderer) });
    } catch (err) {
      this.set({ kind: 'erro', erro: String((err as Error)?.message ?? err) });
    } finally {
      this.running = false;
      if (this.again) {
        this.again = false;
        this.schedule();
      }
    }
  }

  private set(s: BudgetState) {
    this.state = s;
    this.render();
    this.onChange(s);
  }

  private render() {
    const s = this.state;
    const el = this.el;
    el.innerHTML = '';
    el.className = 'ed-budget';
    const label = document.createElement('strong');
    label.textContent = `${et('budget')}: `;
    el.append(label);
    if (s.kind === 'medindo') {
      el.append(et('budgetMeasuring'));
      return;
    }
    if (s.kind === 'invalido') {
      el.classList.add('ed-over');
      const d = document.createElement('details');
      const sum = document.createElement('summary');
      sum.textContent = et('invalid', { n: s.erros.length });
      const ul = document.createElement('ul');
      for (const e of s.erros.slice(0, 40)) {
        const li = document.createElement('li');
        li.textContent = e;
        ul.append(li);
      }
      d.append(sum, ul);
      el.append(d);
      return;
    }
    if (s.kind === 'erro') {
      el.classList.add('ed-over');
      el.append(s.erro);
      return;
    }
    const r = s.report;
    const bar = (v: number, max: number) => {
      const b = document.createElement('span');
      b.className = 'ed-meter';
      const fill = document.createElement('i');
      fill.style.width = `${Math.min(100, (v / max) * 100)}%`;
      if (v > max) fill.className = 'ed-meter-over';
      b.append(fill);
      return b;
    };
    el.append(
      bar(r.drawCalls, MAP_BUDGET.drawCalls),
      bar(r.triangulos, MAP_BUDGET.triangulos),
      et('budgetText', { dc: r.drawCalls, dcMax: MAP_BUDGET.drawCalls, tri: r.triangulos.toLocaleString(locale()), triMax: MAP_BUDGET.triangulos.toLocaleString(locale()) }),
    );
    if (r.excedeu.length) {
      el.classList.add('ed-over');
      const over = document.createElement('div');
      over.textContent = et('budgetOver', { o: r.excedeu.map((k) => (k === 'drawCalls' ? et('budgetDrawCalls') : et('budgetTriangles'))).join(', ') });
      el.append(over);
    }
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
  }
}
