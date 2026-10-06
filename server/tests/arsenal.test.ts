// Weapon upgrades (shared/progression.ts, shared/arsenal.ts): levels from points, which upgrades are in effect,
// the player's choice as the server keeps it, and the stats each weapon really has with its upgrades — the
// same functions the client plays with and the server validates hits with.
import { describe, expect, it } from 'bun:test';
import { DEFAULT_LOADOUT, grenadeStats, gunStats, meleeStats, resolveLoadout, sanitizeLoadout, slotStats } from '@shared/arsenal';
import {
  activeUpgrades,
  legacyChoice,
  levelCount,
  levelForXp,
  MAX_LEVELS,
  PRIMARIES,
  PROG_WEAPONS,
  PROGRESSION,
  sanitizeChoice,
  SECONDARIES,
  START_LEVELS,
  weaponOfKill,
  xpForLevel,
} from '@shared/progression';
import { WEAPONS } from '@shared/weapons';

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
});

describe('escolha do Arsenal', () => {
  it('limpa o que veio do cliente: secundária válida, só opcionais conhecidas, uma por grupo', () => {
    expect(sanitizeChoice(null)).toEqual({ secundaria: 'pistola', ligadas: {} });
    expect(sanitizeChoice({ secundaria: 'rifle' }).secundaria).toBe('pistola');
    expect(sanitizeChoice({ secundaria: 'smg', ligadas: { rifle: ['pontoVermelho', 'nada', 'silenciador', 7] } })).toEqual({ secundaria: 'smg', ligadas: { rifle: ['silenciador'] } });
    // Same group: the last one turned on wins.
    expect(sanitizeChoice({ ligadas: { granada: ['mina', 'dupla'], faca: ['sabre', 'frango'] } }).ligadas).toEqual({ faca: ['frango'], granada: ['dupla'] });
  });

  it('com os níveis, descarta o que ainda não foi liberado', () => {
    const levels = { ...START_LEVELS, granada: 2 };
    expect(sanitizeChoice({ ligadas: { granada: ['mina'], faca: ['sabre'] } }, levels).ligadas).toEqual({ granada: ['mina'] });
  });

  it('contas de antes das melhorias ganham a escolha mais parecida com o nível que equipavam', () => {
    expect(legacyChoice({ rifle: 6, faca: 7, granada: 2 })).toEqual({ secundaria: 'pistola', ligadas: { rifle: ['luneta'], faca: ['sabre'], granada: ['mina'] } });
    expect(legacyChoice({ rifle: 3, faca: 3, granada: 3 }).ligadas).toEqual({ faca: ['frango'], granada: ['dupla'] });
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
  });

  it('as armas de cada espaço vêm dos dados', () => {
    expect(PRIMARIES).toEqual(['rifle']);
    expect(SECONDARIES).toEqual(['pistola', 'smg']);
  });

  it('um loadout vindo da rede só leva ids conhecidos', () => {
    expect(sanitizeLoadout({ primaria: 'bazuca', secundaria: null, ativas: { rifle: ['pontoVermelho', 'laser'] } })).toEqual({
      ...DEFAULT_LOADOUT,
      secundaria: null,
      ativas: { ...DEFAULT_LOADOUT.ativas, rifle: ['pontoVermelho'] },
    });
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

  it('a faca vira sabre de luz (a arma final da corrida armada), com mais alcance e golpes mais espaçados', () => {
    const knife = meleeStats();
    const saber = meleeStats(['sabre']);
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
  });
});

describe('migração 003', () => {
  it('sobe os pontos antigos para limiares que existem nos níveis novos', async () => {
    const sql = await Bun.file(new URL('../migrations/003_melhorias.sql', import.meta.url)).text();
    const updates = [...sql.matchAll(/UPDATE weapon_progress SET xp = GREATEST\(xp, CASE([\s\S]*?)END\)\s*WHERE weapon = '(\w+)'/g)];
    expect(updates.map((m) => m[2])).toEqual(['rifle', 'faca', 'granada']);
    for (const m of updates) {
      const w = m[2] as 'rifle' | 'faca' | 'granada';
      const targets = [...m[1].matchAll(/THEN (\d+)/g)].map((x) => Number(x[1]));
      expect(targets.length).toBeGreaterThan(0);
      for (const xp of targets) expect(PROGRESSION[w].melhorias.map((u) => u.xp)).toContain(xp);
    }
  });
});
