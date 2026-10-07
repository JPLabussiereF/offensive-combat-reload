// The Arsenal tree (client/ui/arsenalTree.ts), the data the Arsenal screen draws: the rows and the order of their
// weapons, which weapon is in hand, how many points a locked weapon or upgrade still needs, and the state of
// every upgrade (on, off, locked, replaced by an optional one of its group). The old rifles share the rifle's
// points and upgrades, and every knife the knife's; every secondary unlocks with the pistol's points (the drill
// then levels up with the SMG's).
import { describe, expect, it } from 'bun:test';
import { DEFAULT_CHOICE, NO_XP, PROG_WEAPONS, PROGRESSION, sanitizeChoice, xpForLevel, type ProgWeapon, type WeaponXp } from '@shared/progression';
import { arsenalTree, TREE_ROWS, upgradeNodes, weaponNode } from '../ui/arsenalTree';

const xpAt = (levels: Partial<Record<ProgWeapon, number>>): WeaponXp => ({ ...NO_XP, ...Object.fromEntries(Object.entries(levels).map(([w, l]) => [w, xpForLevel(w as ProgWeapon, l)])) });

describe('árvore do Arsenal', () => {
  it('quatro linhas: principal, secundária, faca e granada, com as armas na ordem em que liberam', () => {
    const tree = arsenalTree(NO_XP, DEFAULT_CHOICE);
    expect(tree.map((r) => [r.id, r.armas.map((n) => n.arma)])).toEqual([
      ['primaria', ['rifle', 'rifleFita', 'rifleTia', 'rifleNatal', 'rifleChama', 'rifleVovo', 'rifleOuro']],
      ['secundaria', ['pistola', 'grampeador', 'smg', 'revolver', 'furadeira', 'garrucha', 'pistolao']],
      ['faca', ['faca', 'colher', 'frango', 'baguete', 'peixe', 'macarrao', 'sabre']],
      ['granada', ['granada']],
    ]);
    // Every weapon is in exactly one row; every progression has a row.
    const all = TREE_ROWS.flatMap((r) => r.armas);
    expect(new Set(all).size).toBe(all.length);
    expect([...new Set(tree.flatMap((r) => r.armas.map((n) => n.prog)))].sort()).toEqual([...PROG_WEAPONS].sort());
  });

  it('conta nova: tudo no nível 1, as armas antigas e as secundárias depois da pistola trancadas com os pontos que faltam', () => {
    const [primary, secondary, knives] = arsenalTree(NO_XP, DEFAULT_CHOICE);
    expect(primary.armas[0]).toMatchObject({ arma: 'rifle', prog: 'rifle', nivel: 1, liberada: true, equipada: true, faltamNivel: 1000, progresso: 0 });
    expect(primary.armas.slice(1).map((n) => [n.arma, n.liberada, n.liberaCom, n.faltamLiberar])).toEqual([
      ['rifleFita', false, 'rifle', 1000],
      ['rifleTia', false, 'rifle', 2500],
      ['rifleNatal', false, 'rifle', 4500],
      ['rifleChama', false, 'rifle', 7000],
      ['rifleVovo', false, 'rifle', 10000],
      ['rifleOuro', false, 'rifle', 16000],
    ]);
    const [pistol, ...others] = secondary.armas;
    expect(pistol).toMatchObject({ liberada: true, equipada: true, liberaCom: null, faltamLiberar: 0 });
    expect(others.map((n) => [n.arma, n.liberada, n.equipada, n.liberaCom, n.liberaPontos, n.faltamLiberar])).toEqual([
      ['grampeador', false, false, 'pistola', 700, 700],
      ['smg', false, false, 'pistola', 1800, 1800],
      ['revolver', false, false, 'pistola', 3200, 3200],
      ['furadeira', false, false, 'pistola', 5200, 5200],
      ['garrucha', false, false, 'pistola', 7000, 7000],
      ['pistolao', false, false, 'pistola', 9000, 9000],
    ]);
    // Each one shows the level and the points of the progression it uses: the drill the SMG's, the rest the pistol's.
    expect(others.map((n) => n.prog)).toEqual(['pistola', 'smg', 'pistola', 'smg', 'pistola', 'pistola']);
    expect(knives.armas.map((n) => [n.arma, n.liberada, n.equipada, n.faltamLiberar])).toEqual([
      ['faca', true, true, 0],
      ['colher', false, false, 600],
      ['frango', false, false, 1500],
      ['baguete', false, false, 2800],
      ['peixe', false, false, 4500],
      ['macarrao', false, false, 6500],
      ['sabre', false, false, 9000],
    ]);
  });

  it('com 13.200 pontos de rifle: seis rifles liberados, o Dourado a 2.800 pontos; o equipado é o escolhido', () => {
    const xp = { ...NO_XP, rifle: 13200 };
    const [primary] = arsenalTree(xp, sanitizeChoice({ primaria: 'rifleTia' }, xp));
    expect(primary.armas.filter((n) => !n.liberada).map((n) => [n.arma, n.faltamLiberar])).toEqual([['rifleOuro', 2800]]);
    expect(primary.armas.filter((n) => n.equipada).map((n) => n.arma)).toEqual(['rifleTia']);
    // Every rifle shows the rifle's level and points.
    for (const n of primary.armas) expect({ arma: n.arma, nivel: n.nivel, xp: n.xp }).toEqual({ arma: n.arma, nivel: 7, xp: 13200 });
  });

  it('a submetralhadora liberada e equipada; os pontos que faltam diminuem com os da pistola', () => {
    expect(weaponNode('smg', { ...NO_XP, pistola: 1200 }, DEFAULT_CHOICE).faltamLiberar).toBe(600);
    const xp = xpAt({ pistola: 3 });
    const choice = sanitizeChoice({ secundaria: 'smg' }, xp);
    const [, secondary] = arsenalTree(xp, choice);
    expect(secondary.armas.map((n) => [n.arma, n.liberada, n.equipada])).toEqual([
      ['pistola', true, false],
      ['grampeador', true, false],
      ['smg', true, true],
      ['revolver', false, false],
      ['furadeira', false, false],
      ['garrucha', false, false],
      ['pistolao', false, false],
    ]);
  });

  it('as secundárias novas liberam com os pontos de pistola; a furadeira mostra o nível e as melhorias da submetralhadora', () => {
    // 7.500 pontos de pistola (nível 5, o máximo) e nenhum de submetralhadora: só falta o Pistolão.
    const xp = { ...NO_XP, pistola: 7500 };
    const [, secondary] = arsenalTree(xp, sanitizeChoice({ secundaria: 'furadeira' }, xp));
    expect(secondary.armas.filter((n) => !n.liberada).map((n) => [n.arma, n.faltamLiberar])).toEqual([['pistolao', 1500]]);
    expect(secondary.armas.filter((n) => n.equipada).map((n) => n.arma)).toEqual(['furadeira']);
    const drill = weaponNode('furadeira', xp, DEFAULT_CHOICE);
    expect(drill).toMatchObject({ prog: 'smg', nivel: 1, xp: 0, liberada: true });
    expect(upgradeNodes('furadeira', xp, DEFAULT_CHOICE).map((u) => u.id)).toEqual(PROGRESSION.smg.melhorias.map((u) => u.id));
    // The revolver: the pistol's level and its four upgrades.
    expect(weaponNode('revolver', xp, DEFAULT_CHOICE)).toMatchObject({ prog: 'pistola', nivel: 5, max: 5 });
    expect(upgradeNodes('revolver', xp, DEFAULT_CHOICE).map((u) => u.id)).toEqual(['gatilho', 'pontoVermelho', 'coldre', 'batata']);
  });

  it('o nível máximo não tem próximo nível', () => {
    const n = weaponNode('faca', xpAt({ faca: 3 }), DEFAULT_CHOICE);
    expect(n).toMatchObject({ nivel: 3, max: 3, faltamNivel: null, progresso: 1 });
    // A knife shows the knife's level.
    expect(weaponNode('sabre', { ...NO_XP, faca: 9000 }, DEFAULT_CHOICE)).toMatchObject({ prog: 'faca', nivel: 3, liberada: true });
  });

  it('cada melhoria: ligada, desligada, trancada (com os pontos que faltam) ou substituída por uma opcional do grupo', () => {
    // Rifle at 3000 points: level 3 (red dot, grip), the scope at 4500.
    const xp = { ...NO_XP, rifle: 3000 };
    const plain = upgradeNodes('rifle', xp, DEFAULT_CHOICE);
    expect(plain.map((u) => [u.id, u.estado, u.faltam])).toEqual([
      ['pontoVermelho', 'ligada', 0],
      ['empunhadura', 'ligada', 0],
      ['luneta', 'trancada', 1500],
      ['pente', 'trancada', 4000],
      ['silenciador', 'trancada', 7000],
      ['holoLupa', 'trancada', 10000],
      ['luneta2x', 'trancada', 13000],
      ['luneta4x', 'trancada', 17000],
    ]);
    // An old rifle shows the very same chain (the rifle's upgrades).
    expect(upgradeNodes('rifleTia', xp, DEFAULT_CHOICE)).toEqual(plain);
    const off = upgradeNodes('rifle', xp, sanitizeChoice({ desligadas: { rifle: ['empunhadura'] } }, xp));
    expect(off.find((u) => u.id === 'empunhadura')?.estado).toBe('desligada');
    // With the scope on, the red dot shows as off, replaced by the scope.
    const scoped = { ...NO_XP, rifle: 4500 };
    const nodes = upgradeNodes('rifle', scoped, sanitizeChoice({ ligadas: { rifle: ['luneta'] } }, scoped));
    expect(nodes.find((u) => u.id === 'pontoVermelho')).toMatchObject({ estado: 'desligada', substituidaPor: 'luneta' });
    expect(nodes.find((u) => u.id === 'luneta')).toMatchObject({ estado: 'ligada', opcional: true, substituidaPor: null });
  });

  it('toda arma tem um nó por melhoria da sua progressão, na ordem dos níveis', () => {
    for (const r of TREE_ROWS)
      for (const w of r.armas) {
        const n = weaponNode(w, NO_XP, DEFAULT_CHOICE);
        expect(upgradeNodes(w, NO_XP, DEFAULT_CHOICE).map((u) => u.id)).toEqual(PROGRESSION[n.prog].melhorias.map((u) => u.id));
      }
  });
});
