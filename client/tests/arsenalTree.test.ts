// The Arsenal tree (client/ui/arsenalTree.ts), the data the Arsenal screen draws: the rows and the order of their
// weapons, which weapon is in hand, how many points a locked weapon or upgrade still needs, and the state of
// every upgrade (on, off, locked, replaced by an optional one of its group).
import { describe, expect, it } from 'bun:test';
import { DEFAULT_CHOICE, NO_XP, PROG_WEAPONS, PROGRESSION, sanitizeChoice, xpForLevel, type ProgWeapon, type WeaponXp } from '@shared/progression';
import { arsenalTree, TREE_ROWS, upgradeNodes, weaponNode } from '../ui/arsenalTree';

const xpAt = (levels: Partial<Record<ProgWeapon, number>>): WeaponXp => ({ ...NO_XP, ...Object.fromEntries(Object.entries(levels).map(([w, l]) => [w, xpForLevel(w as ProgWeapon, l)])) });

describe('árvore do Arsenal', () => {
  it('quatro linhas: principal, secundária, faca e granada, com as armas na ordem em que liberam', () => {
    const tree = arsenalTree(NO_XP, DEFAULT_CHOICE);
    expect(tree.map((r) => [r.id, r.armas.map((n) => n.arma)])).toEqual([
      ['primaria', ['rifle']],
      ['secundaria', ['pistola', 'smg']],
      ['faca', ['faca']],
      ['granada', ['granada']],
    ]);
    // Every weapon of the game is in exactly one row.
    expect(TREE_ROWS.flatMap((r) => r.armas).sort()).toEqual([...PROG_WEAPONS].sort());
  });

  it('conta nova: tudo no nível 1, a submetralhadora trancada com os pontos que faltam com a pistola', () => {
    const [primary, secondary] = arsenalTree(NO_XP, DEFAULT_CHOICE);
    expect(primary.armas[0]).toMatchObject({ arma: 'rifle', nivel: 1, liberada: true, equipada: true, faltamNivel: 1000, progresso: 0 });
    const [pistol, smg] = secondary.armas;
    expect(pistol).toMatchObject({ liberada: true, equipada: true, liberaCom: null, faltamLiberar: 0 });
    expect(smg).toMatchObject({ liberada: false, equipada: false, liberaCom: 'pistola', liberaNivel: 3, faltamLiberar: 1800 });
  });

  it('a submetralhadora liberada e equipada; os pontos que faltam diminuem com os da pistola', () => {
    expect(weaponNode('smg', { ...NO_XP, pistola: 1200 }, DEFAULT_CHOICE).faltamLiberar).toBe(600);
    const xp = xpAt({ pistola: 3 });
    const choice = sanitizeChoice({ secundaria: 'smg' }, xp);
    const [, secondary] = arsenalTree(xp, choice);
    expect(secondary.armas.map((n) => [n.arma, n.liberada, n.equipada])).toEqual([
      ['pistola', true, false],
      ['smg', true, true],
    ]);
  });

  it('o nível máximo não tem próximo nível', () => {
    const n = weaponNode('faca', xpAt({ faca: 5 }), DEFAULT_CHOICE);
    expect(n).toMatchObject({ nivel: 5, max: 5, faltamNivel: null, progresso: 1 });
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
    ]);
    const off = upgradeNodes('rifle', xp, sanitizeChoice({ desligadas: { rifle: ['empunhadura'] } }, xp));
    expect(off.find((u) => u.id === 'empunhadura')?.estado).toBe('desligada');
    // With the scope on, the red dot shows as off, replaced by the scope.
    const scoped = { ...NO_XP, rifle: 4500 };
    const nodes = upgradeNodes('rifle', scoped, sanitizeChoice({ ligadas: { rifle: ['luneta'] } }, scoped));
    expect(nodes.find((u) => u.id === 'pontoVermelho')).toMatchObject({ estado: 'desligada', substituidaPor: 'luneta' });
    expect(nodes.find((u) => u.id === 'luneta')).toMatchObject({ estado: 'ligada', opcional: true, substituidaPor: null });
  });

  it('toda arma tem um nó por melhoria, na ordem dos níveis', () => {
    for (const w of PROG_WEAPONS) expect(upgradeNodes(w, NO_XP, DEFAULT_CHOICE).map((u) => u.id)).toEqual(PROGRESSION[w].melhorias.map((u) => u.id));
  });
});
