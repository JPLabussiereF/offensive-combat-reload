// The editor's dockable panels and the Inspector's Transform, without a screen (PF-6 Revisions 01): the layout
// kept as JSON and read back (anything broken falls back to Unity's default), tabs docked into and beside
// stacks, borders dragged; the Transform's degrees and radians, the values a multiple selection shares, and a
// field edited by typing or by dragging its label.
import { describe, expect, it } from 'bun:test';
import * as THREE from 'three';
import { activate, defaultLayout, deserialize, dock, findStack, isLayout, normalize, panelsOf, PANELS, resize, serialize, zoneAt, type DockNode } from '../editor/dockLayout';
import { applyEdit, common, dragStep, fieldsOf, matrixOf, toDeg, toRad, type Fields } from '../editor/transformFields';

describe('painéis encaixáveis', () => {
  it('o padrão é o do Unity: Hierarchy à esquerda, Scene no centro (com a aba Jogo atrás), Inspector à direita, Project embaixo', () => {
    const d = defaultLayout();
    expect(isLayout(d)).toBe(true);
    expect(panelsOf(d)).toEqual(['hierarchy', 'scene', 'game', 'project', 'inspector']);
    expect(findStack(d, 'game')).toEqual({ t: 'tabs', tabs: ['scene', 'game'], active: 0 });
    // The Inspector takes the right side, full height; the Project the bottom under the Hierarchy and the Scene.
    expect(d).toMatchObject({ t: 'split', dir: 'row', kids: [{ t: 'split', dir: 'col', kids: [{ t: 'split', dir: 'row' }, { t: 'tabs', tabs: ['project'] }] }, { t: 'tabs', tabs: ['inspector'] }] });
  });

  it('serializa e restaura o mesmo layout; layout quebrado, sem um painel ou com painel repetido volta ao padrão', () => {
    const moved = dock(defaultLayout(), 'inspector', 'hierarchy', 'center');
    expect(deserialize(serialize(moved))).toEqual(moved);
    expect(deserialize(null)).toEqual(defaultLayout());
    expect(deserialize('{nada')).toEqual(defaultLayout());
    expect(deserialize(JSON.stringify({ t: 'tabs', tabs: ['scene'], active: 0 }))).toEqual(defaultLayout());
    const twice: DockNode = { t: 'split', dir: 'row', sizes: [0.5, 0.5], kids: [{ t: 'tabs', tabs: ['scene', 'hierarchy'], active: 0 }, { t: 'tabs', tabs: ['inspector', 'project', 'scene'], active: 0 }] };
    expect(isLayout(twice)).toBe(false);
    expect(deserialize(JSON.stringify({ ...defaultLayout(), sizes: [0.5, -1] }))).toEqual(defaultLayout());
  });

  it('arrastar uma aba para o meio de uma pilha empilha; para a borda, divide; a pilha vazia some', () => {
    const stacked = dock(defaultLayout(), 'inspector', 'hierarchy', 'center');
    expect(findStack(stacked, 'hierarchy')).toEqual({ t: 'tabs', tabs: ['hierarchy', 'inspector'], active: 1 });
    // The right side is gone: what's left is the column (the row of Hierarchy and Scene over the Project).
    expect(stacked).toMatchObject({ t: 'split', dir: 'col' });
    expect(panelsOf(stacked).sort()).toEqual([...PANELS].sort());

    const below = dock(defaultLayout(), 'hierarchy', 'scene', 'bottom');
    const sceneCol = (n: DockNode): DockNode | null => {
      if (n.t === 'tabs') return null;
      if (n.dir === 'col' && n.kids.some((k) => k.t === 'tabs' && k.tabs[0] === 'scene')) return n;
      for (const k of n.kids) {
        const f = sceneCol(k);
        if (f) return f;
      }
      return null;
    };
    const col = sceneCol(below) as Extract<DockNode, { t: 'split' }>;
    // The Hierarchy left its row (the Scene alone takes its place), and under the Scene it joins the column it's in:
    // the Scene's share split in two, the Project's kept.
    expect(col.kids.map((k) => (k.t === 'tabs' ? k.tabs[0] : k.dir))).toEqual(['scene', 'hierarchy', 'project']);
    col.sizes.forEach((v, i) => expect(v).toBeCloseTo([0.36, 0.36, 0.28][i], 9));

    // A split in a split of the same way merges: the Project leaving the bottom makes one row of Hierarchy, Scene
    // and Inspector, and docked to the right of the Inspector it's the fourth of that row.
    const right = dock(defaultLayout(), 'project', 'inspector', 'right');
    expect(panelsOf(right)).toEqual(['hierarchy', 'scene', 'game', 'inspector', 'project']);
    expect(right.t === 'split' && right.dir === 'row' && right.kids.length).toBe(4);
    expect(isLayout(right)).toBe(true);
    // Its own stack, alone in it: nothing changes.
    expect(dock(defaultLayout(), 'hierarchy', 'hierarchy', 'left')).toEqual(defaultLayout());
    // Beside its own stack, when the stack has others: it leaves them and docks beside them.
    const two = dock(stacked, 'inspector', 'inspector', 'right');
    expect(findStack(two, 'hierarchy')!.tabs).toEqual(['hierarchy']);
    expect(findStack(two, 'inspector')!.tabs).toEqual(['inspector']);
  });

  it('um layout guardado antes da aba Jogo ganha a aba atrás da Cena, sem mudar a aba mostrada', () => {
    const old: DockNode = {
      t: 'split',
      dir: 'row',
      sizes: [0.3, 0.7],
      kids: [
        { t: 'tabs', tabs: ['hierarchy', 'inspector'], active: 1 },
        { t: 'tabs', tabs: ['project', 'scene'], active: 1 },
      ],
    };
    const read = deserialize(JSON.stringify(old));
    expect(isLayout(read)).toBe(true);
    expect(findStack(read, 'game')).toEqual({ t: 'tabs', tabs: ['project', 'scene', 'game'], active: 1 });
    expect(findStack(read, 'hierarchy')).toEqual({ t: 'tabs', tabs: ['hierarchy', 'inspector'], active: 1 });
    // The Game tab twice, or a layout without the Scene to put it by: the default.
    expect(deserialize(JSON.stringify({ t: 'split', dir: 'row', sizes: [0.5, 0.5], kids: [{ t: 'tabs', tabs: ['hierarchy', 'scene', 'game'], active: 0 }, { t: 'tabs', tabs: ['inspector', 'project', 'game'], active: 0 }] }))).toEqual(defaultLayout());
  });

  it('arrastar a borda troca espaço entre vizinhos (cada um fica com um mínimo); a aba clicada vem para a frente', () => {
    const d = defaultLayout();
    const r = resize(d, [], 0, 0.1) as Extract<DockNode, { t: 'split' }>;
    expect(r.sizes[0]).toBeCloseTo(0.86, 9);
    expect(r.sizes[1]).toBeCloseTo(0.14, 9);
    const far = resize(d, [], 0, 5) as Extract<DockNode, { t: 'split' }>;
    expect(far.sizes[1]).toBeCloseTo(0.06, 9);
    const inner = resize(d, [0, 0], 0, -0.1);
    expect((inner as any).kids[0].kids[0].sizes[0]).toBeCloseTo(0.14, 9);
    const stacked = dock(d, 'inspector', 'hierarchy', 'center');
    expect(findStack(activate(stacked, 'hierarchy'), 'hierarchy')!.active).toBe(0);
    expect(normalize({ t: 'split', dir: 'row', sizes: [2, 2], kids: [{ t: 'tabs', tabs: ['scene'], active: 3 }, { t: 'tabs', tabs: ['hierarchy'], active: 0 }] })).toEqual({
      t: 'split',
      dir: 'row',
      sizes: [0.5, 0.5],
      kids: [
        { t: 'tabs', tabs: ['scene'], active: 0 },
        { t: 'tabs', tabs: ['hierarchy'], active: 0 },
      ],
    });
  });

  it('a zona sob o ponteiro: as bordas (um quarto de cada lado) e o meio', () => {
    const box = { left: 0, top: 0, width: 100, height: 100 };
    expect(zoneAt(50, 50, box)).toBe('center');
    expect(zoneAt(5, 50, box)).toBe('left');
    expect(zoneAt(95, 50, box)).toBe('right');
    expect(zoneAt(50, 5, box)).toBe('top');
    expect(zoneAt(50, 95, box)).toBe('bottom');
  });
});

describe('Transform do Inspector', () => {
  it('graus e radianos: o que o campo mostra e o que a matriz guarda', () => {
    expect(toDeg(Math.PI / 2)).toBe(90);
    expect(toRad(180)).toBeCloseTo(Math.PI, 12);
    const f: Fields = { p: [1, 2, 3], r: [10, 45, -30], s: 1.5 };
    const back = fieldsOf(matrixOf(f));
    expect(back.p).toEqual([1, 2, 3]);
    back.r.forEach((v, i) => expect(v).toBeCloseTo(f.r[i], 3));
    expect(back.s).toBeCloseTo(1.5, 6);
    // A yaw only: the matrix turns about Y by that many degrees.
    const m = matrixOf({ p: [0, 0, 0], r: [0, 90, 0], s: 1 });
    const x = new THREE.Vector3(1, 0, 0).applyMatrix4(m);
    expect(x.z).toBeCloseTo(-1, 9);
  });

  it('o que foi digitado continua igual se ainda dá a mesma matriz (200° fica 200°)', () => {
    const typed: Fields = { p: [0, 0, 0], r: [0, 200, 0], s: 1 };
    const m = matrixOf(typed);
    expect(fieldsOf(m).r[1]).not.toBe(200);
    expect(fieldsOf(m, typed)).toBe(typed);
    expect(fieldsOf(matrixOf({ ...typed, p: [1, 0, 0] }), typed).p[0]).toBe(1);
  });

  it('seleção múltipla: os valores em comum aparecem, os diferentes ficam vazios; a edição vale para cada um', () => {
    const a: Fields = { p: [1, 0, 5], r: [0, 90, 0], s: 1 };
    const b: Fields = { p: [1, 2, 6], r: [0, 90, 0], s: 2 };
    expect(common([a, b])).toEqual({ p: [1, null, null], r: [0, 90, 0], s: null });
    expect(applyEdit(a, { c: 'p', axis: 1, value: 4 }).p).toEqual([1, 4, 5]);
    expect(applyEdit(b, { c: 'p', axis: 2, delta: 0.25 }).p).toEqual([1, 2, 6.25]);
    expect(applyEdit(a, { c: 'r', axis: 1, delta: -100 }).r).toEqual([0, -10, 0]);
    expect(applyEdit(b, { c: 's', axis: 0, value: 0 }).s).toBe(0.01);
    expect(applyEdit(b, { c: 's', axis: 0, delta: 0.5 }).s).toBe(2.5);
    expect(dragStep('p')).toBe(0.02);
    expect(dragStep('r', true)).toBe(5);
  });
});
