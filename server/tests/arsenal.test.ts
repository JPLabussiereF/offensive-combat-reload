// Weapon upgrades (shared/progression.ts, shared/arsenal.ts): levels from points, which upgrades are in effect,
// the weapon locks, the player's choice as the server keeps it, and the stats each weapon really has with its
// upgrades (the old rifles and knives included) — the same functions the client plays with and the server
// validates hits with.
import { describe, expect, it } from 'bun:test';
import { DEFAULT_LOADOUT, grenadeStats, gunStats, knifeOf, knifePassive, loadoutKnife, meleeStats, resolveLoadout, sanitizeLoadout, slotStats } from '@shared/arsenal';
import {
  activeUpgrades,
  DEFAULT_CHOICE,
  GUN_IDS,
  KNIVES,
  legacyChoice,
  levelCount,
  levelForXp,
  lockOf,
  MAX_LEVELS,
  NO_XP,
  pointsToUnlock,
  PRIMARIES,
  progOf,
  PROG_WEAPONS,
  PROGRESSION,
  sanitizeChoice,
  SECONDARIES,
  START_LEVELS,
  upgradeAt,
  weaponOfKill,
  weaponUnlocked,
  xpForLevel,
  type ArsenalChoice,
} from '@shared/progression';
import { MELEE, WEAPONS } from '@shared/weapons';

const CLEAN: ArsenalChoice = { primaria: 'rifle', secundaria: 'pistola', faca: 'faca', ligadas: {}, desligadas: {} };

describe('níveis', () => {
  it('cada nível depois do primeiro libera uma melhoria, com pontos crescentes', () => {
    for (const w of PROG_WEAPONS) {
      const ups = PROGRESSION[w].melhorias;
      expect(ups.length).toBeGreaterThan(0);
      ups.forEach((u, i) => {
        expect(u.nivel).toBe(i + 2);
        if (i) expect(u.xp).toBeGreaterThan(ups[i - 1].xp);
      });
      expect(new Set(ups.map((u) => u.id)).size).toBe(ups.length);
      // An optional upgrade in a group never shares it with another weapon's meaning: groups stay inside a weapon.
      for (const u of ups) if (u.grupo) expect(ups.filter((x) => x.grupo === u.grupo).length).toBeGreaterThan(1);
    }
  });

  it('o nível vem dos pontos feitos com a arma', () => {
    expect(levelForXp('rifle', 0)).toBe(1);
    expect(levelForXp('rifle', 999)).toBe(1);
    expect(levelForXp('rifle', 1000)).toBe(2);
    expect(levelForXp('rifle', 1e9)).toBe(levelCount('rifle'));
    expect(xpForLevel('rifle', 1)).toBe(0);
    expect(xpForLevel('rifle', 2)).toBe(1000);
    expect(MAX_LEVELS.faca).toBe(levelCount('faca'));
  });

  it('armas com estilos diferentes têm quantidades diferentes de melhorias', () => {
    expect(levelCount('rifle')).not.toBe(levelCount('pistola'));
  });
});

describe('melhorias em efeito', () => {
  it('as comuns ligam sozinhas; as opcionais só quando o jogador liga, e só se liberadas', () => {
    expect(activeUpgrades('rifle', 1)).toEqual([]);
    expect(activeUpgrades('rifle', 3)).toEqual(['pontoVermelho', 'empunhadura']);
    expect(activeUpgrades('rifle', 6)).toEqual(['pontoVermelho', 'empunhadura', 'pente']);
    expect(activeUpgrades('rifle', 6, ['silenciador'])).toEqual(['pontoVermelho', 'empunhadura', 'pente', 'silenciador']);
    expect(activeUpgrades('rifle', 5, ['silenciador'])).toEqual(['pontoVermelho', 'empunhadura', 'pente']);
  });

  it('uma opcional ligada substitui as comuns do seu grupo (a luneta tira o ponto vermelho)', () => {
    expect(activeUpgrades('rifle', 4, ['luneta'])).toEqual(['empunhadura', 'luneta']);
  });

  it('uma comum desligada sai das ativas; as outras seguem ligadas', () => {
    expect(activeUpgrades('rifle', 3, [], ['pontoVermelho'])).toEqual(['empunhadura']);
    expect(activeUpgrades('rifle', 6, ['silenciador'], ['pente', 'empunhadura'])).toEqual(['pontoVermelho', 'silenciador']);
    // Sem nada na mira: o ponto vermelho desligado e a luneta desligada deixam a mira de ferro.
    expect(gunStats('rifle', activeUpgrades('rifle', 4, [], ['pontoVermelho'])).mira).toBe('ferro');
  });
});

describe('trava das armas', () => {
  const smgXp = xpForLevel('pistola', 3);

  it('a submetralhadora libera com a pistola no nível 3 (1.800 pontos)', () => {
    expect(lockOf('smg')).toEqual({ arma: 'pistola', pontos: 1800 });
    expect(smgXp).toBe(1800);
    expect(weaponUnlocked('smg', NO_XP)).toBe(false);
    expect(weaponUnlocked('smg', { ...NO_XP, pistola: smgXp - 1 })).toBe(false);
    expect(weaponUnlocked('smg', { ...NO_XP, pistola: smgXp })).toBe(true);
    expect(pointsToUnlock('smg', NO_XP)).toBe(smgXp);
    expect(pointsToUnlock('smg', { ...NO_XP, pistola: 700 })).toBe(smgXp - 700);
    expect(pointsToUnlock('smg', { ...NO_XP, pistola: smgXp })).toBe(0);
  });

  it('quem já fez pontos com a submetralhadora fica com ela, mesmo com a pistola abaixo do nível 3', () => {
    expect(weaponUnlocked('smg', { ...NO_XP, smg: 1 })).toBe(true);
    expect(pointsToUnlock('smg', { ...NO_XP, smg: 1 })).toBe(0);
  });

  it('sem pontos, só o Rifle Padrão, a pistola, a Faca de Cozinha e a granada estão liberados', () => {
    const free = [...GUN_IDS, ...KNIVES, 'granada' as const].filter((w) => weaponUnlocked(w, NO_XP));
    expect(free).toEqual(['rifle', 'pistola', 'faca', 'granada']);
  });

  it('os rifles antigos liberam com os pontos de rifle, e as facas com os de faca', () => {
    const rifles = { rifleFita: 1000, rifleTia: 2500, rifleNatal: 4500, rifleChama: 7000, rifleVovo: 10000, rifleOuro: 16000 } as const;
    for (const [g, pts] of Object.entries(rifles) as [keyof typeof rifles, number][]) {
      expect({ g, lock: lockOf(g) }).toEqual({ g, lock: { arma: 'rifle', pontos: pts } });
      expect(weaponUnlocked(g, { ...NO_XP, rifle: pts - 1 })).toBe(false);
      expect(weaponUnlocked(g, { ...NO_XP, rifle: pts })).toBe(true);
    }
    const knives = { colher: 600, frango: 1500, baguete: 2800, peixe: 4500, macarrao: 6500, sabre: 9000 } as const;
    for (const [k, pts] of Object.entries(knives) as [keyof typeof knives, number][]) {
      expect({ k, lock: lockOf(k) }).toEqual({ k, lock: { arma: 'faca', pontos: pts } });
      expect(weaponUnlocked(k, { ...NO_XP, faca: pts - 1 })).toBe(false);
      expect(weaponUnlocked(k, { ...NO_XP, faca: pts })).toBe(true);
    }
    // A conta com 13.200 pontos de rifle: todos menos o Dourado, que pede 2.800 a mais.
    expect(PRIMARIES.filter((g) => !weaponUnlocked(g, { ...NO_XP, rifle: 13200 }))).toEqual(['rifleOuro']);
    expect(pointsToUnlock('rifleOuro', { ...NO_XP, rifle: 13200 })).toBe(2800);
    expect(pointsToUnlock('sabre', { ...NO_XP, faca: 6000 })).toBe(3000);
  });

  it('as secundárias novas liberam com os pontos de pistola, em ordem: 700, 1.800 (a submetralhadora), 3.200, 5.200, 7.000 e 9.000', () => {
    const locks = { grampeador: 700, smg: 1800, revolver: 3200, furadeira: 5200, garrucha: 7000, pistolao: 9000 } as const;
    expect(SECONDARIES.slice(1)).toEqual(Object.keys(locks) as (keyof typeof locks)[]);
    for (const [g, pts] of Object.entries(locks) as [keyof typeof locks, number][]) {
      expect({ g, lock: lockOf(g) }).toEqual({ g, lock: { arma: 'pistola', pontos: pts } });
      expect(weaponUnlocked(g, { ...NO_XP, pistola: pts - 1 })).toBe(false);
      expect(weaponUnlocked(g, { ...NO_XP, pistola: pts })).toBe(true);
      expect(pointsToUnlock(g, { ...NO_XP, pistola: 500 })).toBe(pts - 500);
    }
    // Points with the SMG don't unlock the drill (it unlocks with the pistol's, though it levels up with the SMG's).
    expect(weaponUnlocked('furadeira', { ...NO_XP, smg: 99999 })).toBe(false);
    // The pistol's last level is at 5.200: the garrucha and the hand cannon ask for more points than that.
    expect(xpForLevel('pistola', levelCount('pistola'))).toBe(5200);
    expect(SECONDARIES.filter((g) => !weaponUnlocked(g, { ...NO_XP, pistola: 5200 }))).toEqual(['garrucha', 'pistolao']);
  });

  it('uma secundária trancada volta para a pistola (escolha limpa com os pontos)', () => {
    for (const g of ['grampeador', 'revolver', 'furadeira', 'garrucha', 'pistolao'] as const) {
      expect(sanitizeChoice({ secundaria: g }, NO_XP).secundaria).toBe('pistola');
      expect(sanitizeChoice({ secundaria: g }, { ...NO_XP, pistola: lockOf(g)!.pontos - 1 }).secundaria).toBe('pistola');
      expect(sanitizeChoice({ secundaria: g }, { ...NO_XP, pistola: lockOf(g)!.pontos }).secundaria).toBe(g);
      // A secondary never goes into the primary slot.
      expect(sanitizeChoice({ primaria: g, secundaria: g }, { ...NO_XP, pistola: 99999 }).primaria).toBe('rifle');
    }
  });

  it('com os pontos, a submetralhadora trancada volta para a pistola; sem os pontos, só o formato é conferido', () => {
    expect(sanitizeChoice({ secundaria: 'smg' }, NO_XP).secundaria).toBe('pistola');
    expect(sanitizeChoice({ secundaria: 'smg' }, { ...NO_XP, pistola: smgXp }).secundaria).toBe('smg');
    expect(sanitizeChoice({ secundaria: 'smg' }, { ...NO_XP, smg: 100 }).secundaria).toBe('smg');
    expect(sanitizeChoice({ secundaria: 'smg' }).secundaria).toBe('smg');
  });
});

describe('escolha do Arsenal', () => {
  it('limpa o que veio do cliente: secundária válida, só opcionais conhecidas, uma por grupo', () => {
    expect(sanitizeChoice(null)).toEqual(CLEAN);
    expect(DEFAULT_CHOICE).toEqual(CLEAN);
    expect(sanitizeChoice({ secundaria: 'rifle' }).secundaria).toBe('pistola');
    expect(sanitizeChoice({ primaria: 'smg', faca: 'bazuca' })).toMatchObject({ primaria: 'rifle', faca: 'faca' });
    expect(sanitizeChoice({ secundaria: 'smg', ligadas: { rifle: ['pontoVermelho', 'nada', 'silenciador', 7] } })).toEqual({ ...CLEAN, secundaria: 'smg', ligadas: { rifle: ['silenciador'] } });
    // Same group: the last one turned on wins.
    expect(sanitizeChoice({ ligadas: { granada: ['mina', 'dupla'], rifle: ['luneta4x', 'holoLupa'] } }).ligadas).toEqual({ rifle: ['holoLupa'], granada: ['dupla'] });
  });

  it('o rifle e a faca escolhidos: com os pontos, os trancados voltam para o Padrão e a Faca de Cozinha', () => {
    expect(sanitizeChoice({ primaria: 'rifleOuro', faca: 'sabre' })).toMatchObject({ primaria: 'rifleOuro', faca: 'sabre' });
    expect(sanitizeChoice({ primaria: 'rifleOuro', faca: 'sabre' }, NO_XP)).toMatchObject({ primaria: 'rifle', faca: 'faca' });
    expect(sanitizeChoice({ primaria: 'rifleTia', faca: 'baguete' }, { ...NO_XP, rifle: 2500, faca: 2800 })).toMatchObject({ primaria: 'rifleTia', faca: 'baguete' });
    // A pistol in the primary slot, a rifle in the secondary: not their places.
    expect(sanitizeChoice({ primaria: 'pistola', secundaria: 'rifleTia' })).toMatchObject({ primaria: 'rifle', secundaria: 'pistola' });
  });

  it('quem usava o Frango ou o Sabre como forma da faca fica com essa faca, se os pontos a liberarem', () => {
    const old = { secundaria: 'pistola', ligadas: { faca: ['sabre'] } };
    expect(sanitizeChoice(old, { ...NO_XP, faca: 9000 })).toEqual({ ...CLEAN, faca: 'sabre' });
    expect(sanitizeChoice(old, { ...NO_XP, faca: 6000 })).toEqual(CLEAN);
    expect(sanitizeChoice({ ligadas: { faca: ['frango'] } }, { ...NO_XP, faca: 1500 }).faca).toBe('frango');
    // A choice that already names its knife isn't converted.
    expect(sanitizeChoice({ faca: 'colher', ligadas: { faca: ['sabre'] } }, { ...NO_XP, faca: 9000 }).faca).toBe('colher');
  });

  it('as comuns desligadas: só comuns conhecidas, sem repetir', () => {
    expect(sanitizeChoice({ desligadas: { rifle: ['pontoVermelho', 'luneta', 'nada', 'pontoVermelho', 3], faca: 'afiador' } }).desligadas).toEqual({ rifle: ['pontoVermelho'] });
    expect(sanitizeChoice({ desligadas: { faca: ['tenis', 'frango'] } }).desligadas).toEqual({ faca: ['tenis'] });
  });

  it('com os pontos, descarta o que ainda não foi liberado', () => {
    const xp = { ...NO_XP, granada: xpForLevel('granada', 2), rifle: xpForLevel('rifle', 2) };
    expect(sanitizeChoice({ ligadas: { granada: ['mina'], rifle: ['holoLupa'] } }, xp).ligadas).toEqual({ granada: ['mina'] });
    expect(sanitizeChoice({ desligadas: { rifle: ['pontoVermelho', 'empunhadura'] } }, xp).desligadas).toEqual({ rifle: ['pontoVermelho'] });
  });

  it('contas de antes das melhorias ganham a escolha mais parecida com o nível que equipavam', () => {
    expect(legacyChoice({ rifle: 6, faca: 7, granada: 2 })).toEqual({ ...CLEAN, ligadas: { rifle: ['luneta'], granada: ['mina'] } });
    // The old rifles and knives they had equipped aren't brought back: everyone starts with the standard ones.
    expect(legacyChoice({ rifle: 3, faca: 3, granada: 3 })).toEqual({ ...CLEAN, ligadas: { granada: ['dupla'] } });
    expect(legacyChoice({}).ligadas).toEqual({});
  });

  it('vira o loadout com as armas de cada espaço e as melhorias em efeito', () => {
    const lo = resolveLoadout({ secundaria: 'smg', ligadas: { smg: ['tambor'] } }, { ...START_LEVELS, smg: 4, rifle: 2 });
    expect(lo.primaria).toBe('rifle');
    expect(lo.secundaria).toBe('smg');
    expect(lo.ativas.smg).toEqual(['motor', 'holo', 'tambor']);
    expect(lo.ativas.rifle).toEqual(['pontoVermelho']);
    expect(slotStats(lo, 'secundaria')!.pente).toBe(WEAPONS.smg.pente + 18);
    expect(slotStats({ ...lo, secundaria: null }, 'secundaria')).toBeNull();
    // Comuns desligadas saem do loadout.
    const off = resolveLoadout({ secundaria: 'smg', ligadas: {}, desligadas: { smg: ['motor'], rifle: ['pontoVermelho'] } }, { ...START_LEVELS, smg: 4, rifle: 2 });
    expect(off.ativas.smg).toEqual(['holo']);
    expect(off.ativas.rifle).toEqual([]);
    // An old rifle and an old knife: their own stats, the rifle's and the knife's upgrades.
    const old = resolveLoadout({ primaria: 'rifleTia', secundaria: 'pistola', faca: 'baguete', ligadas: {} }, { ...START_LEVELS, rifle: 3, faca: 2 });
    expect(old).toMatchObject({ primaria: 'rifleTia', faca: 'baguete' });
    expect(slotStats(old, 'primaria')).toMatchObject({ arma: 'rifleTia', cadencia: 760, melhorias: ['pontoVermelho', 'empunhadura'], visual: 'tia' });
    expect(knifeOf(old)).toBe('baguete');
    expect(loadoutKnife(old).intervalo).toBeCloseTo(MELEE.baguete.intervalo * 0.8);
  });

  it('as armas de cada espaço vêm dos dados, na ordem em que liberam', () => {
    expect(PRIMARIES).toEqual(['rifle', 'rifleFita', 'rifleTia', 'rifleNatal', 'rifleChama', 'rifleVovo', 'rifleOuro']);
    expect(SECONDARIES).toEqual(['pistola', 'grampeador', 'smg', 'revolver', 'furadeira', 'garrucha', 'pistolao']);
    expect(KNIVES).toEqual(['faca', 'colher', 'frango', 'baguete', 'peixe', 'macarrao', 'sabre']);
    for (const g of PRIMARIES) expect(progOf(g)).toBe('rifle');
    expect(SECONDARIES.map((g) => progOf(g))).toEqual(['pistola', 'pistola', 'smg', 'pistola', 'smg', 'pistola', 'pistola']);
    for (const k of KNIVES) expect(progOf(k)).toBe('faca');
  });

  it('um loadout vindo da rede só leva ids conhecidos', () => {
    expect(sanitizeLoadout({ primaria: 'bazuca', secundaria: null, faca: 'espada', ativas: { rifle: ['pontoVermelho', 'laser'] } })).toEqual({
      ...DEFAULT_LOADOUT,
      secundaria: null,
      ativas: { ...DEFAULT_LOADOUT.ativas, rifle: ['pontoVermelho'] },
    });
    expect(sanitizeLoadout({ primaria: 'rifleOuro', faca: 'macarrao' })).toMatchObject({ primaria: 'rifleOuro', faca: 'macarrao' });
  });
});

describe('atributos com as melhorias', () => {
  it('sem melhorias, é a arma do JSON', () => {
    const r = gunStats('rifle');
    const base = WEAPONS.rifle_padrao;
    expect(r.dano).toEqual(base.dano);
    expect(r.cadencia).toBe(base.cadencia);
    expect(r.pente).toBe(base.pente);
    expect(r.mira).toBe('ferro');
    expect(r.silenciador).toBe(false);
    expect(gunStats('rifle')).toBe(r); // cached
  });

  it('cada melhoria muda atributos de verdade', () => {
    const base = WEAPONS.rifle_padrao;
    const grip = gunStats('rifle', ['empunhadura']);
    expect(grip.recuo.vertical).toBeCloseTo(base.recuo.vertical * 0.8);
    expect(grip.dispersao.parado).toBeCloseTo(base.dispersao.parado * 0.85);
    const mag = gunStats('rifle', ['pente']);
    expect(mag.pente).toBe(40);
    expect(mag.reserva).toBe(160);
    expect(mag.recarga.tatica).toBeCloseTo(base.recarga.tatica * 0.9);
    const scope = gunStats('rifle', ['luneta']);
    expect(scope.mira).toBe('luneta');
    expect(scope.ads.zoom).toBe(0.38);
    expect(scope.ads.tempo).toBeGreaterThan(base.ads.tempo);
    expect(gunStats('smg', ['motor']).cadencia).toBe(Math.round(WEAPONS.smg.cadencia * 1.12));
    expect(gunStats('pistola', ['coldre']).troca).toBeCloseTo(WEAPONS.pistola.troca * 0.5);
  });

  it('o silenciador abafa o tiro, mas cobra dano e alcance', () => {
    const s = gunStats('rifle', ['silenciador']);
    expect(s.silenciador).toBe(true);
    expect(s.dano.max).toBeLessThan(WEAPONS.rifle_padrao.dano.max);
    expect(s.dano.distMin).toBeLessThan(WEAPONS.rifle_padrao.dano.distMin);
  });

  it('o sabre de luz (a arma final da corrida armada) tem mais alcance e golpes mais espaçados que a faca', () => {
    const knife = meleeStats();
    const saber = meleeStats('sabre');
    expect(knife.forma).toBe('faca');
    expect(saber.forma).toBe('sabre');
    expect(saber.alcance).toBeGreaterThan(knife.alcance);
    expect(saber.intervalo).toBeGreaterThan(knife.intervalo);
    expect(saber.letal).toBe(true);
  });

  it('a granada vira mina ou dose dupla, e ganha cinto e pólvora', () => {
    expect(grenadeStats().tipo).toBe('granada');
    expect(grenadeStats(['mina']).tipo).toBe('mina');
    expect(grenadeStats(['dupla']).tipo).toBe('dupla');
    const g = grenadeStats(['cinto', 'polvora']);
    expect(g.quantidade).toBe(grenadeStats().quantidade + 1);
    expect(g.explosao.raioDano).toBeCloseTo(grenadeStats().explosao.raioDano * 1.2);
  });

  it('cada abate de tiro vai para a arma que atirou', () => {
    expect(weaponOfKill('head', 'pistola')).toBe('pistola');
    expect(weaponOfKill('gun')).toBe('rifle');
    expect(weaponOfKill('knife', 'smg')).toBe('faca');
    expect(weaponOfKill('fall')).toBeNull();
    // The old rifles' points go to the rifle.
    expect(weaponOfKill('head', 'rifleOuro')).toBe('rifle');
  });
});

describe('rifles e facas antigos', () => {
  it('cada rifle antigo tem a vantagem e o custo do plano em relação ao Rifle Padrão', () => {
    const base = gunStats('rifle');
    const g = (id: Parameters<typeof gunStats>[0]) => gunStats(id);
    expect(g('rifleFita').recarga.tatica).toBeCloseTo(base.recarga.tatica * 0.85);
    expect(g('rifleFita').recuo.vertical).toBeCloseTo(base.recuo.vertical * 1.1);
    expect(g('rifleTia')).toMatchObject({ cadencia: 760, dano: { max: 28, min: 19 } });
    expect(g('rifleTia').ads.tempo).toBeCloseTo(base.ads.tempo * 0.9);
    expect(g('rifleNatal').cadencia).toBe(650);
    expect(g('rifleNatal').recuo.vertical).toBeCloseTo(base.recuo.vertical * 0.8);
    expect(g('rifleChama')).toMatchObject({ cadencia: 820, movimento: 1.03 });
    expect(g('rifleChama').dispersao.parado).toBeCloseTo(base.dispersao.parado * 1.25);
    expect(g('rifleChama').dispersao.mirando).toBe(base.dispersao.mirando);
    expect(g('rifleVovo')).toMatchObject({ cadencia: 600, dano: { max: 36, min: 25 } });
    expect(g('rifleOuro')).toMatchObject({ pente: 40, reserva: 160, movimento: 0.92 });
    expect(g('rifleOuro').recarga.vazia).toBeCloseTo(base.recarga.vazia * 1.15);
    // Each paints its own way, with iron sights; the rest is the Standard Rifle's.
    for (const id of PRIMARIES) {
      const s = g(id);
      expect({ id, mira: s.mira, mult: s.multiplicadores, alcance: s.alcanceMaximo }).toEqual({ id, mira: 'ferro', mult: base.multiplicadores, alcance: base.alcanceMaximo });
    }
    expect(PRIMARIES.map((id) => g(id).visual)).toEqual(['padrao', 'fita', 'tia', 'natal', 'chamas', 'vovo', 'ouro']);
  });

  it('as melhorias do rifle valem em todo rifle e não mudam a pintura', () => {
    const tia = gunStats('rifleTia', ['pontoVermelho', 'pente', 'luneta']);
    expect(tia).toMatchObject({ mira: 'luneta', pente: 40, visual: 'tia' });
    expect(gunStats('rifle', ['pente', 'luneta']).visual).toBe('padrao');
  });

  it('as facas trocam alcance por velocidade, e todas matam com um golpe', () => {
    const base = MELEE.faca;
    expect(meleeStats('colher')).toMatchObject({ alcance: base.alcance + 0.15, forma: 'colher' });
    expect(meleeStats('frango').alcanceInvestida).toBeCloseTo(base.alcanceInvestida + 0.8);
    expect(meleeStats('baguete').alcance).toBeCloseTo(base.alcance + 0.3);
    expect(meleeStats('peixe').alcanceInvestida).toBeCloseTo(base.alcanceInvestida + 1.2);
    expect(meleeStats('macarrao')).toMatchObject({ alcance: 2.4, alcanceInvestida: 2.7 });
    expect(meleeStats('macarrao').intervalo).toBeCloseTo(base.intervalo * 1.3);
    expect(meleeStats('sabre')).toMatchObject({ alcance: 2.5, alcanceInvestida: 3.5 });
    for (const k of KNIVES) expect({ k, letal: meleeStats(k).letal }).toEqual({ k, letal: true });
    // The knife's upgrades work on every knife.
    expect(meleeStats('peixe', ['afiador']).intervalo).toBeCloseTo(MELEE.peixe.intervalo * 0.8);
  });

  it('as miras antigas são os níveis 7 a 9 do rifle, opcionais do grupo mira', () => {
    expect(levelCount('rifle')).toBe(9);
    expect([7, 8, 9].map((n) => upgradeAt('rifle', n))).toMatchObject([
      { id: 'holoLupa', xp: 13000, opcional: true, grupo: 'mira' },
      { id: 'luneta2x', xp: 16000, opcional: true, grupo: 'mira' },
      { id: 'luneta4x', xp: 20000, opcional: true, grupo: 'mira' },
    ]);
    expect(gunStats('rifle', ['holoLupa']).ads.zoom).toBe(0.66);
    expect(gunStats('rifle', ['luneta4x']).ads.zoom).toBe(0.25);
    // A sight from these levels turned on takes the red dot off.
    expect(activeUpgrades('rifle', 9, ['luneta2x'])).toEqual(['empunhadura', 'pente', 'luneta2x']);
    // The knife: the sharpener, the sneakers and the light hand.
    expect(PROGRESSION.faca.melhorias.map((u) => [u.nivel, u.xp, u.id])).toEqual([
      [2, 600, 'afiador'],
      [3, 2800, 'tenis'],
      [4, 4500, 'maoLeve'],
    ]);
  });
});

describe('árvore e passivas das facas', () => {
  it('o afiador dá golpes mais seguidos e mais alcance; a mão leve encurta o golpe sem mudar o momento do acerto', () => {
    for (const k of KNIVES) {
      const base = MELEE[k];
      const sharp = meleeStats(k, ['afiador']);
      expect(sharp.intervalo).toBeCloseTo(base.intervalo * 0.8);
      expect(sharp.alcance).toBeCloseTo(base.alcance + 0.2);
      const light = meleeStats(k, ['maoLeve']);
      expect(light.duracao).toBeCloseTo(base.duracao * 0.7);
      expect(light.impacto).toBe(base.impacto);
      // Every upgrade at once: the hit still lands inside the (shorter) swing.
      const all = meleeStats(k, ['afiador', 'tenis', 'maoLeve']);
      expect(all.impacto).toBeLessThan(all.duracao);
    }
  });

  it('cada faca tem a sua passiva, cada uma diferente', () => {
    const ids = KNIVES.map((k) => MELEE[k].passiva.id);
    expect(ids).toEqual(['discreta', 'coloDeVo', 'fugaEscandalosa', 'lanche', 'tapaGelado', 'boia', 'vuuum']);
    expect(MELEE.colher.passiva).toEqual({ id: 'coloDeVo', vida: 50 });
    expect(MELEE.frango.passiva).toEqual({ id: 'fugaEscandalosa', velocidade: 1.15, segundos: 3 });
    expect(MELEE.peixe.passiva).toEqual({ id: 'tapaGelado', costas: 100 });
    // The stats keep the knife's passive.
    expect(meleeStats('sabre', ['afiador']).passiva.id).toBe('vuuum');
  });

  it('a passiva só vale com a faca da conta: mata-mata, treino e bots, não na corrida armada nem no zumbi', () => {
    for (const k of KNIVES) {
      expect(knifePassive(k, 'mata-mata')).toEqual(MELEE[k].passiva);
      expect(knifePassive(k, null)).toEqual(MELEE[k].passiva);
      expect(knifePassive(k, 'corrida-armada')).toBeNull();
      expect(knifePassive(k, 'zumbi')).toBeNull();
    }
  });
});

describe('migração 003', () => {
  // The thresholds when 003 ran (later the knife lost the chicken and the saber, now knives of their own).
  const AT_003: Record<'rifle' | 'faca' | 'granada', number[]> = { rifle: [1000, 2500, 4500, 7000, 10000], faca: [600, 1500, 2800, 4500], granada: [700, 1800, 3200, 5000] };
  it('sobe os pontos antigos para limiares que existiam nos níveis da época', async () => {
    const sql = await Bun.file(new URL('../migrations/003_melhorias.sql', import.meta.url)).text();
    const updates = [...sql.matchAll(/UPDATE weapon_progress SET xp = GREATEST\(xp, CASE([\s\S]*?)END\)\s*WHERE weapon = '(\w+)'/g)];
    expect(updates.map((m) => m[2])).toEqual(['rifle', 'faca', 'granada']);
    for (const m of updates) {
      const w = m[2] as 'rifle' | 'faca' | 'granada';
      const targets = [...m[1].matchAll(/THEN (\d+)/g)].map((x) => Number(x[1]));
      expect(targets.length).toBeGreaterThan(0);
      for (const xp of targets) expect(AT_003[w]).toContain(xp);
    }
  });
});
