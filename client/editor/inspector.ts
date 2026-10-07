// The editor's properties panel: a form made from the catalog's schema (shared/mapCatalog.ts) for the selected
// piece (its place, its pose, its seed and gag id, then every parameter by its type: numbers, switches, texts,
// colors, surfaces, options, vectors, lists, nested objects and free JSON), for the selected marker, or the
// map's own settings when nothing is selected. Every change is one undoable edit, made when the field is left.
import type { MapData, Peca, Vec3 } from '@shared/mapData';
import { MAP_CATALOG, SUPERFICIES, type Param } from '@shared/mapCatalog';
import { BOSS_IDS } from '@shared/zombies';
import { clone, type Rest } from './document';
import { defaultValue } from './create';
import { markerPlace, markerTurns, removeMarker, setMarkerPlace, zombieTemplate } from './markers';
import { addOpening, hasHandles } from './linearHandles';
import { et, nameOf } from './strings';

const DEG = 180 / Math.PI;
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

  showPiece(peca: Peca, data: MapData) {
    const k = MAP_CATALOG[peca.tipo];
    this.reset(`${et('piece')}: ${peca.id}`);
    this.el.append(h('div', { class: 'ed-kind' }, `${et('kind')}: ${k ? nameOf(k.nome) : peca.tipo}`));
    const edit = (f: (p: Peca) => void) => {
      const next = clone(peca);
      f(next);
      this.act.editPiece(next);
    };
    if (k?.usa?.p) this.el.append(row(et('position'), vecInput(peca.p ?? [0, 0, 0], (v) => edit((p) => (p.p = v.map(r4) as Vec3)))));
    if (k?.usa?.yaw) this.el.append(row(et('yaw'), numberInput(r4((peca.yaw ?? 0) * DEG), (v) => edit((p) => (p.yaw = r4(v / DEG))))));
    if (k?.usa?.escala) this.el.append(row(et('scaleField'), numberInput(peca.escala ?? 1, (v) => edit((p) => (p.escala = v)))));
    // The pose (P32): what the gizmo did to a piece beyond its own place.
    const pose = peca.pose ?? { p: [0, 0, 0] as Vec3, r: [0, 0, 0] as Vec3 };
    const poseBox = h('fieldset', { class: 'ed-obj' }, h('legend', {}, et('pose')));
    poseBox.append(
      row(et('posePos'), vecInput(pose.p, (v) => edit((p) => (p.pose = { p: v.map(r4) as Vec3, r: [...pose.r] })))),
      row(et('poseRot'), vecInput(pose.r, (v) => edit((p) => (p.pose = { p: [...pose.p], r: v.map((x) => r4(x)) as Vec3 })), DEG)),
    );
    if (peca.pose) {
      const clear = h('button', { type: 'button', class: 'ed-mini' }, et('poseClear'));
      clear.onclick = () => edit((p) => delete p.pose);
      poseBox.append(clear);
    }
    this.el.append(poseBox);
    if (k?.semente) this.el.append(row(et('seed'), numberInput(peca.semente ?? 0, (v) => edit((p) => (p.semente = v)), '1', true)));
    if (k?.prop) {
      const i = h('input', { type: 'text', maxlength: '20' });
      i.value = peca.prop ?? '';
      i.onchange = () => edit((p) => (i.value ? (p.prop = i.value) : delete p.prop));
      this.el.append(row(et('propId'), i));
    }
    if (k?.coletavel) {
      const s = h('select');
      s.append(h('option', { value: '' }, et('none')));
      for (const c of data.objetos.coletaveis) s.append(h('option', { value: c.id }, `${c.id} (${c.tipo})`));
      s.value = peca.coletavel ?? '';
      s.onchange = () => edit((p) => (s.value ? (p.coletavel = s.value) : delete p.coletavel));
      this.el.append(row(et('collectible'), s));
    }
    if (k) {
      const box = h('fieldset', { class: 'ed-obj' }, h('legend', {}, et('params')));
      for (const [name, param] of Object.entries(k.params)) {
        box.append(
          row(
            name,
            paramEditor(param, peca.params[name], (v) => edit((p) => (v === undefined ? delete p.params[name] : (p.params[name] = v))), name),
          ),
        );
      }
      if (hasHandles(peca) && Array.isArray(peca.params.vaos)) {
        const add = h('button', { type: 'button', class: 'ed-mini' }, et('addOpening'));
        add.onclick = () => {
          const next = addOpening(peca);
          if (next) this.act.editPiece(next);
        };
        box.append(add);
      }
      this.el.append(box);
    }
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
