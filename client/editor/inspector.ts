// The editor's properties panel, Unity's Inspector (Revisions 01): for the selected pieces their name, the
// Transform component (position, rotation in degrees and scale, labels draggable) and a form made from the
// catalog's schema (shared/mapCatalog.ts: its seed and gag id, then every parameter by its type: numbers,
// switches, texts, colors, surfaces, options, vectors, lists, nested objects and free JSON); for the selected
// marker its place; the map's own settings when nothing is selected. Every change is one undoable edit, made
// when the field is left (or the label let go).
import type { MapData, Peca, Vec3 } from '@shared/mapData';
import { MAP_CATALOG, SUPERFICIES, type Param } from '@shared/mapCatalog';
import { BOSS_IDS } from '@shared/zombies';
import { clone, type Rest } from './document';
import { defaultValue } from './create';
import { markerPlace, markerTurns, removeMarker, setMarkerPlace, zombieTemplate } from './markers';
import { addOpening, hasHandles } from './linearHandles';
import { et, nameOf } from './strings';
import { common, dragStep, type Axis, type Component, type FieldEdit, type Fields } from './transformFields';

const DEG = 180 / Math.PI;

/**
 * What the Transform component edits: the selected pieces' places in their groups' frames (one Fields each) and
 * what an edit does (the editor previews a label being dragged and commits it when let go, or when typed).
 */
export interface TransformBinding {
  fields: Fields[];
  /** Whether each one scales (a group scales its children; other kinds keep their size). */
  scales: boolean[];
  preview(e: FieldEdit): void;
  commit(e: FieldEdit): void;
  /** A drag let go where it started. */
  cancel(): void;
}

/** Unity's Transform: position, rotation (degrees) and scale, each label draggable to change its value. */
function transformComponent(t: TransformBinding, posed: boolean, clearPose: () => void): HTMLElement {
  const box = h('fieldset', { class: 'ed-obj ed-comp ed-transform' }, h('legend', {}, et('transform')));
  const shown = common(t.fields);
  const anyScales = t.scales.some(Boolean);
  const line = (c: Component, label: string, values: (number | null)[], enabled = true) => {
    const r = h('div', { class: 'ed-row ed-trow' }, h('span', {}, label));
    const vec = h('span', { class: 'ed-vec' });
    values.forEach((v, axis) => {
      const lab = h('span', { class: 'ed-axis', title: et('dragHint') }, c === 's' ? '↔' : 'XYZ'[axis]);
      const input = h('input', { type: 'number', step: 'any' });
      input.disabled = !enabled;
      if (v === null) input.placeholder = '—';
      else input.value = String(v);
      input.onchange = () => {
        const n = Number(input.value);
        if (input.value.trim() !== '' && Number.isFinite(n)) t.commit({ c, axis: axis as Axis, value: n });
      };
      // Dragging the axis letter changes the value (Shift: faster), as Unity's labels do.
      lab.onpointerdown = (e) => {
        if (e.button !== 0 || !enabled) return;
        e.preventDefault();
        lab.setPointerCapture(e.pointerId);
        const x0 = e.clientX;
        let delta = 0;
        const start = v ?? 0;
        const move = (ev: PointerEvent) => {
          delta = (ev.clientX - x0) * dragStep(c, ev.shiftKey);
          if (v !== null) input.value = String(Math.round((start + delta) * 1e4) / 1e4);
          t.preview({ c, axis: axis as Axis, delta });
        };
        const up = () => {
          lab.removeEventListener('pointermove', move);
          lab.removeEventListener('pointerup', up);
          lab.removeEventListener('pointercancel', up);
          if (delta) t.commit({ c, axis: axis as Axis, delta });
          else t.cancel();
        };
        lab.addEventListener('pointermove', move);
        lab.addEventListener('pointerup', up);
        lab.addEventListener('pointercancel', up);
      };
      vec.append(h('label', { class: 'ed-axisfield' }, lab, input));
    });
    r.append(vec);
    return r;
  };
  box.append(line('p', et('position'), shown.p), line('r', et('rotation'), shown.r), line('s', et('scaleField'), [shown.s], anyScales));
  if (posed) {
    const clear = h('button', { type: 'button', class: 'ed-mini' }, et('poseClear'));
    clear.onclick = clearPose;
    box.append(clear);
  }
  return box;
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of kids) el.append(c);
  return el;
}

const row = (label: string, ...input: Node[]) => h('label', { class: 'ed-row' }, h('span', {}, label), ...input);

function numberInput(v: number | undefined, onChange: (v: number) => void, step = 'any', int = false) {
  const i = h('input', { type: 'number', step });
  if (v !== undefined) i.value = String(v);
  i.onchange = () => {
    const n = int ? Math.round(Number(i.value)) : Number(i.value);
    if (i.value.trim() !== '' && Number.isFinite(n)) onChange(n);
  };
  return i;
}

function vecInput(v: number[], onChange: (v: number[]) => void, scale = 1) {
  const wrap = h('span', { class: 'ed-vec' });
  const cur = v.map((x) => x * scale);
  cur.forEach((x, k) =>
    wrap.append(
      numberInput(r4(x), (n) => {
        cur[k] = n;
        onChange(cur.map((y) => y / scale));
      }),
    ),
  );
  return wrap;
}

const hex = (n: number) => `#${(n >>> 0).toString(16).padStart(6, '0').slice(-6)}`;

/** An editor for a value of a param (calls `set` with the new value; undefined takes an optional param away). */
function paramEditor(p: Param, value: unknown, set: (v: unknown) => void, name: string): HTMLElement {
  const wrap = h('div', { class: 'ed-param' });
  const present = value !== undefined;
  if (p.opcional) {
    const use = h('input', { type: 'checkbox' });
    use.checked = present;
    use.title = et('optional');
    use.onchange = () => set(use.checked ? defaultValue(p, name) : undefined);
    wrap.append(use);
    if (!present) return wrap;
  }
  const v = present ? value : defaultValue(p, name);
  switch (p.tipo) {
    case 'numero':
    case 'inteiro':
      wrap.append(numberInput(v as number, set, p.tipo === 'inteiro' ? '1' : 'any', p.tipo === 'inteiro'));
      break;
    case 'booleano': {
      const i = h('input', { type: 'checkbox' });
      i.checked = !!v;
      i.onchange = () => set(i.checked);
      wrap.append(i);
      break;
    }
    case 'texto': {
      const i = h('input', { type: 'text', maxlength: String(p.max ?? 200) });
      i.value = String(v ?? '');
      i.onchange = () => set(i.value);
      wrap.append(i);
      break;
    }
    case 'cor': {
      const i = h('input', { type: 'color' });
      i.value = hex(v as number);
      i.onchange = () => set(parseInt(i.value.slice(1), 16));
      wrap.append(i);
      break;
    }
    case 'superficie':
    case 'opcao': {
      const opts = p.tipo === 'superficie' ? SUPERFICIES : p.opcoes;
      const s = h('select');
      for (const o of opts) s.append(h('option', { value: String(o) }, String(o)));
      s.value = String(v);
      s.onchange = () => set(opts.find((o) => String(o) === s.value));
      wrap.append(s);
      break;
    }
    case 'vec2':
    case 'vec3':
    case 'vec4':
      wrap.append(vecInput(v as number[], set));
      break;
    case 'lista': {
      const list = clone(v as unknown[]);
      const box = h('div', { class: 'ed-list' });
      list.forEach((item, i) => {
        const line = h('div', { class: 'ed-item' });
        line.append(
          paramEditor({ ...p.item, opcional: false } as Param, item, (nv) => {
            list[i] = nv;
            set(list);
          }, name),
        );
        const del = h('button', { type: 'button', class: 'ed-mini' }, et('removeItem'));
        del.onclick = () => {
          list.splice(i, 1);
          set(list);
        };
        line.append(del);
        box.append(line);
      });
      const add = h('button', { type: 'button', class: 'ed-mini' }, et('addItem'));
      add.onclick = () => set([...list, defaultValue(p.item, name)]);
      box.append(add);
      wrap.append(box);
      break;
    }
    case 'objeto': {
      const obj = clone((v ?? {}) as Record<string, unknown>);
      const box = h('div', { class: 'ed-obj' });
      for (const [k, c] of Object.entries(p.campos)) {
        box.append(
          row(
            k,
            paramEditor(c, obj[k], (nv) => {
              if (nv === undefined) delete obj[k];
              else obj[k] = nv;
              set(obj);
            }, k),
          ),
        );
      }
      wrap.append(box);
      break;
    }
    case 'json': {
      const t = h('textarea', { rows: '4', spellcheck: 'false' });
      t.value = JSON.stringify(v, null, 1);
      t.onchange = () => {
        try {
          set(JSON.parse(t.value));
          t.classList.remove('ed-bad');
        } catch {
          t.classList.add('ed-bad');
          t.title = et('jsonInvalid');
        }
      };
      wrap.append(t);
      break;
    }
  }
  return wrap;
}

export interface InspectorActions {
  editPiece(next: Peca, rest?: (r: Rest) => void): void;
  /** Several pieces edited at once (a multiple selection). */
  editPieces(next: Peca[]): void;
  /** A piece's name (null: back to its id). */
  rename(id: string, nome: string | null): void;
  /** The pieces' poses taken away (Unity's Reset). */
  clearPose(ids: string[]): void;
  editRest(f: (r: Rest) => void): void;
  /** A marker was taken away (the selection goes with it). */
  markerRemoved(): void;
}

export class Inspector {
  constructor(
    private readonly el: HTMLElement,
    private readonly act: InspectorActions,
  ) {}

  private reset(title: string) {
    this.el.innerHTML = '';
    this.el.append(h('h3', {}, title));
  }

  /**
   * The selected pieces (one or more), as Unity's Inspector: the name, the Transform component (position,
   * rotation in degrees and scale, in the group's frame; with several, the values they share and a dash where
   * they differ, an edit going to all of them), then the piece's own settings and parameters (with several of
   * the same kind, the values of the first, an edit going to all of them).
   */
  showPieces(list: Peca[], data: MapData, transform: TransformBinding) {
    const many = list.length > 1;
    const peca = list[list.length - 1];
    const k = MAP_CATALOG[peca.tipo];
    const sameKind = list.every((p) => p.tipo === peca.tipo);
    this.el.innerHTML = '';
    // The header: the name (Unity's object name field) and the kind.
    const head = h('div', { class: 'ed-ihead' });
    if (many) head.append(h('h3', {}, et('manySelected', { n: list.length })));
    else {
      const name = h('input', { type: 'text', maxlength: '60', class: 'ed-iname', placeholder: peca.id });
      name.value = peca.nome ?? '';
      name.title = et('nameField');
      name.onchange = () => this.act.rename(peca.id, name.value.trim() && name.value.trim() !== peca.id ? name.value.trim() : null);
      head.append(name);
    }
    head.append(h('div', { class: 'ed-kind' }, many && !sameKind ? et('mixedKinds') : `${k ? nameOf(k.nome) : peca.tipo}${many ? '' : ` · ${peca.id}`}`));
    this.el.append(head);

    this.el.append(transformComponent(transform, list.some((p) => !!p.pose), () => this.act.clearPose(list.map((p) => p.id))));
    if (!sameKind || !k) return;

    const edit = (f: (p: Peca) => void) => {
      const next = list.map((p) => {
        const n = clone(p);
        f(n);
        return n;
      });
      if (many) this.act.editPieces(next);
      else this.act.editPiece(next[0]);
    };
    const comp = h('fieldset', { class: 'ed-obj ed-comp' }, h('legend', {}, k.id === 'grupo' ? et('group') : nameOf(k.nome)));
    const differs = (get: (p: Peca) => unknown) => many && list.some((p) => JSON.stringify(get(p)) !== JSON.stringify(get(peca)));
    const mark = (el: HTMLElement, mixed: boolean) => {
      if (mixed) {
        el.classList.add('ed-mixed');
        el.title = et('mixedValues');
      }
      return el;
    };
    if (k.semente) comp.append(mark(row(et('seed'), numberInput(peca.semente ?? 0, (v) => edit((p) => (p.semente = v)), '1', true)), differs((p) => p.semente)));
    if (k.prop && !many) {
      const i = h('input', { type: 'text', maxlength: '20' });
      i.value = peca.prop ?? '';
      i.onchange = () => edit((p) => (i.value ? (p.prop = i.value) : delete p.prop));
      comp.append(row(et('propId'), i));
    }
    if (k.coletavel && !many) {
      const s = h('select');
      s.append(h('option', { value: '' }, et('none')));
      for (const c of data.objetos.coletaveis) s.append(h('option', { value: c.id }, `${c.id} (${c.tipo})`));
      s.value = peca.coletavel ?? '';
      s.onchange = () => edit((p) => (s.value ? (p.coletavel = s.value) : delete p.coletavel));
      comp.append(row(et('collectible'), s));
    }
    const params = Object.entries(k.params);
    if (params.length) {
      const box = h('div', { class: 'ed-params' });
      for (const [name, param] of params) {
        box.append(
          mark(
            row(
              name,
              paramEditor(param, peca.params[name], (v) => edit((p) => (v === undefined ? delete p.params[name] : (p.params[name] = clone(v)))), name),
            ),
            differs((p) => p.params[name]),
          ),
        );
      }
      if (!many && hasHandles(peca) && Array.isArray(peca.params.vaos)) {
        const add = h('button', { type: 'button', class: 'ed-mini' }, et('addOpening'));
        add.onclick = () => {
          const next = addOpening(peca);
          if (next) this.act.editPiece(next);
        };
        box.append(add);
      }
      comp.append(box);
    }
    if (comp.children.length > 1) this.el.append(comp);
  }

  showMarker(key: string, data: MapData) {
    const place = markerPlace(data, key);
    this.reset(key);
    if (!place) return;
    const rest = (f: (r: Rest) => void) => this.act.editRest(f);
    this.el.append(row(et('position'), vecInput(place.p, (v) => rest((r) => setMarkerPlace(r, key, { ...place, p: v as Vec3 })))));
    if (markerTurns(key)) this.el.append(row(et('yaw'), numberInput(r4((place.yaw ?? 0) * DEG), (v) => rest((r) => setMarkerPlace(r, key, { ...place, yaw: v / DEG })))));
    const [a, b, c] = key.split(':');
    if (a === 'boneco') {
      const i = Number(b);
      this.el.append(
        row(
          et('patrol'),
          paramEditor({ tipo: 'objeto', opcional: true, campos: { eixo: { tipo: 'opcao', opcoes: ['x', 'z'] }, amplitude: { tipo: 'numero', padrao: 2, min: 0 }, velocidade: { tipo: 'numero', padrao: 1, min: 0 } } }, data.bonecos[i].patrulha, (v) =>
            rest((r) => (v === undefined ? delete r.bonecos[i].patrulha : (r.bonecos[i].patrulha = v as never))),
          'patrulha'),
        ),
      );
    } else if (a === 'coletavel') {
      const i = Number(b);
      const col = data.objetos.coletaveis[i];
      const s = h('select');
      for (const t of ['cereja', 'biscoito']) s.append(h('option', { value: t }, t));
      s.value = col.tipo;
      s.onchange = () => rest((r) => (r.objetos.coletaveis[i].tipo = s.value as 'cereja' | 'biscoito'));
      this.el.append(row('id', h('code', {}, esc(col.id))), row(et('kind'), s));
    } else if (a === 'rato') this.el.append(row('id', h('code', {}, data.objetos.ratos[Number(b)].id)));
    else if (a === 'peixe') {
      const i = Number(b);
      const f = data.objetos.peixes[i];
      const lake = h('input', { type: 'text', maxlength: '16' });
      lake.value = f.lago;
      lake.onchange = () => rest((r) => (r.objetos.peixes[i].lago = lake.value));
      this.el.append(row('id', h('code', {}, f.id)), row(et('lake'), lake), row(et('loop'), vecInput(f.volta, (v) => rest((r) => (r.objetos.peixes[i].volta = v as Vec3)))));
    } else if (a === 'zumbi' && b === 'barricada' && data.zumbi) {
      const i = Number(c);
      const g = data.zumbi.barricadas[i];
      const id = h('input', { type: 'text', maxlength: '16' });
      id.value = g.id;
      id.onchange = () => rest((r) => (r.zumbi!.barricadas[i].id = id.value));
      const axis = h('select');
      for (const x of ['x', 'z']) axis.append(h('option', { value: x }, x));
      axis.value = g.eixo;
      axis.onchange = () =>
        rest((r) => {
          r.zumbi!.barricadas[i].eixo = axis.value as 'x' | 'z';
          setMarkerPlace(r, key, { p: g.centro });
        });
      this.el.append(row('id', id), row(et('axis'), axis), row(et('width'), numberInput(g.largura, (v) => rest((r) => (r.zumbi!.barricadas[i].largura = v)))));
    }
    const probe = clone({ spawns: data.spawns, bonecos: data.bonecos, objetos: data.objetos, zumbi: data.zumbi }) as Rest;
    if (removeMarker(probe, key)) {
      const del = h('button', { type: 'button', class: 'ed-danger' }, et('remove'));
      del.onclick = () => {
        rest((r) => removeMarker(r, key));
        this.act.markerRemoved();
      };
      this.el.append(del);
    }
  }

  showMap(data: MapData) {
    this.reset(et('mapSettings'));
    this.el.append(h('p', { class: 'ed-note' }, et('nothingSelected')));
    const rest = (f: (r: Rest) => void) => this.act.editRest(f);
    const amb = data.ambiente;
    this.el.append(
      row(et('killY'), numberInput(amb.killY, (v) => rest((r) => (r.ambiente.killY = v)))),
      row(et('cell'), numberInput(amb.celula, (v) => rest((r) => (r.ambiente.celula = v)))),
      row(et('shadow'), paramEditor({ tipo: 'numero', opcional: true, min: 1, max: 400, padrao: 60 }, amb.sombra, (v) => rest((r) => (v === undefined ? delete r.ambiente.sombra : (r.ambiente.sombra = v as number))), 'sombra')),
    );
    const dome = h('select');
    for (const [v, k] of [['', 'domeNone'], ['nuvens', 'domeClouds'], ['lua', 'domeMoon'], ['oriental', 'domeOriental']] as const) dome.append(h('option', { value: v }, et(k)));
    dome.value = amb.ceu.cupula?.tipo ?? '';
    dome.onchange = () =>
      rest((r) => {
        const v = dome.value;
        if (!v) delete r.ambiente.ceu.cupula;
        else r.ambiente.ceu.cupula = v === 'lua' ? { tipo: 'lua', lua: [-40, 50, 30] } : { tipo: v as 'nuvens' | 'oriental' };
      });
    this.el.append(row(et('dome'), dome));
    this.el.append(row(et('atmosphere'), paramEditor({ tipo: 'json', opcional: true }, amb.ceu.atmosfera, (v) => rest((r) => (v === undefined ? delete r.ambiente.ceu.atmosfera : (r.ambiente.ceu.atmosfera = v as never))), 'atmosfera')));
    this.el.append(row(et('sounds'), paramEditor({ tipo: 'json', opcional: true }, amb.sons, (v) => rest((r) => (v === undefined ? delete r.ambiente.sons : (r.ambiente.sons = v as never))), 'sons')));
    this.el.append(
      row(
        et('lights'),
        paramEditor({ tipo: 'inteiro', opcional: true, min: 0, max: 16, padrao: 10 }, data.servicos?.luzes, (v) =>
          rest((r) => {
            if (v === undefined) delete r.servicos;
            else r.servicos = { ...(r.servicos ?? {}), luzes: v as number };
          }),
        'luzes'),
      ),
    );
    if (!data.zumbi) {
      const z = h('button', { type: 'button', class: 'ed-mini' }, et('mkZumbiOn'));
      z.onclick = () => {
        const s = data.spawns.ffa[0]?.p ?? [0, 0, 0];
        rest((r) => (r.zumbi = zombieTemplate(s)));
      };
      this.el.append(z);
    } else this.el.append(h('p', { class: 'ed-note' }, BOSS_IDS.map((b) => et('mkChefe', { id: b })).join(' · ')));
  }
}
