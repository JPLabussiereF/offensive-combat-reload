// The pause menu's rules (client/ui/pauseMenu.ts, PF-11): what the rail says in each of the eight places × modes,
// the level Esc and ◯ go back to, who leads the corrida armada, the Arsenal tab's "N more upgrades" line and the
// map's name on a glTF preview, and the Keys sub-tab's groups.
import { beforeEach, describe, expect, it } from 'bun:test';
import { PROGRESSION } from '@shared/progression';
import { WAVES } from '@shared/zombies';
import type { PlayerInfo } from '@shared/protocol';
import { REBINDABLE } from '../core/keybinds';
import { backStep, KEY_GROUPS, ladderLeader, MODE_COLOR, moreUpgradesText, pauseContext, previewMapName, standingsOrder } from '../ui/pauseMenu';
import { setLang, t, type StringKey } from '../ui/strings';

const upgradeName = (w: string, id: string) => t(`upg_${w}_${id}` as StringKey);

beforeEach(() => setLang('pt-BR'));

const session = { name: 'Rua dos Vizinhos', players: 7, max: 10 };

describe('menu de pausa: o que o trilho diz em cada lugar e modo', () => {
  it('mata-mata online: sessão, aviso vermelho, Arsenal só consulta e "Sair da sessão"', () => {
    const c = pauseContext({ place: 'online', mode: 'mata-mata', session });
    expect(c.case).toBe('mata-online');
    expect([c.chip, c.color, c.line]).toEqual(['Mata-mata', '#ff7a1a', 'Sessão: Rua dos Vizinhos · 7/10 jogadores']);
    expect([c.live, c.banner]).toEqual([true, 'Online: o jogo continua e você pode levar tiro.']);
    expect([c.tab, c.readOnly, c.exit]).toEqual(['arsenal', true, 'Sair da sessão']);
    expect(c.confirm).toBe('Você sai da sessão Rua dos Vizinhos e volta para a tela inicial. Os pontos que suas armas já ganharam ficam na conta.');
  });

  it('mata-mata contra bots: quantos e a dificuldade, jogo pausado, Arsenal só consulta', () => {
    const c = pauseContext({ place: 'bots', mode: 'mata-mata', bots: { count: 5, skill: 'normal' } });
    expect(c.case).toBe('mata-bots');
    expect([c.chip, c.line, c.live, c.banner]).toEqual(['Mata-mata', 'Contra 5 bots · Normal', false, 'Jogo pausado: os bots esperam você.']);
    expect([c.tab, c.readOnly, c.exit, c.confirm]).toEqual(['arsenal', true, 'Sair da partida', 'A partida contra os bots acaba e você volta para a tela inicial.']);
    expect(pauseContext({ place: 'bots', mode: 'mata-mata', bots: { count: 9, skill: 'dificil' } }).line).toBe('Contra 9 bots · Difícil');
  });

  it('corrida armada online: a escada e "Sair da corrida", que perde o degrau', () => {
    const c = pauseContext({ place: 'online', mode: 'corrida-armada', session: { ...session, players: 6 } });
    expect(c.case).toBe('corrida-online');
    expect([c.chip, c.color, c.line, c.live]).toEqual(['Corrida armada', '#1fb5a8', 'Sessão: Rua dos Vizinhos · 6/10 jogadores', true]);
    expect([c.tab, c.exit, c.confirm]).toEqual(['escada', 'Sair da corrida', 'Você sai da corrida e perde o degrau em que está. Volta para a tela inicial.']);
  });

  it('corrida armada contra bots: a escada e "Sair da partida"', () => {
    const c = pauseContext({ place: 'bots', mode: 'corrida-armada', bots: { count: 3, skill: 'facil' } });
    expect(c.case).toBe('corrida-bots');
    expect([c.line, c.live, c.banner, c.tab]).toEqual(['Contra 3 bots · Fácil', false, 'Jogo pausado: os bots esperam você.', 'escada']);
    expect([c.exit, c.confirm]).toEqual(['Sair da partida', 'A corrida contra os bots acaba e você volta para a tela inicial.']);
  });

  it('zumbi online com equipe: a onda, os jogadores, a horda não espera e o caixão', () => {
    const c = pauseContext({ place: 'online', mode: 'zumbi', session: { ...session, players: 3 }, wave: 4 });
    expect(c.case).toBe('zumbi-team');
    expect([c.chip, c.color, c.line]).toEqual(['Zumbi', '#3fae4a', `Onda 4/${WAVES} · 3 jogadores`]);
    expect([c.live, c.banner, c.tab]).toEqual([true, 'Online: a horda não espera. Sua equipe continua lutando.', 'caixao']);
    expect([c.exit, c.confirm]).toEqual(['Sair da partida', 'Sua equipe continua sem você. O dinheiro desta partida não é guardado.']);
  });

  it('zumbi online sozinho: 1 jogador, o aviso online genérico e a partida que recomeça', () => {
    const c = pauseContext({ place: 'online', mode: 'zumbi', session: { ...session, players: 1 }, wave: 2 });
    expect(c.case).toBe('zumbi-alone');
    expect([c.line, c.banner]).toEqual([`Onda 2/${WAVES} · 1 jogador`, 'Online: o jogo continua e você pode levar tiro.']);
    expect(c.confirm).toBe('A partida recomeça para o próximo que entrar. O dinheiro desta partida não é guardado.');
  });

  it('zumbi solo: sozinho, jogo pausado, o dinheiro não fica', () => {
    const c = pauseContext({ place: 'bots', mode: 'zumbi', wave: 0 });
    expect(c.case).toBe('zumbi-solo');
    expect([c.line, c.live, c.banner, c.tab]).toEqual([`Onda 0/${WAVES} · sozinho`, false, 'Jogo pausado.', 'caixao']);
    expect([c.exit, c.confirm]).toEqual(['Sair da partida', 'A partida acaba e o dinheiro não fica.']);
  });

  it('campo de tiro: treino offline, Arsenal editável e "Sair do treino"', () => {
    const c = pauseContext({ place: 'range', mode: null });
    expect(c.case).toBe('range');
    expect([c.chip, c.color, c.line, c.live, c.banner]).toEqual(['Campo de tiro', MODE_COLOR.range, 'Treino offline com os bonecos', false, 'Jogo pausado.']);
    expect([c.tab, c.readOnly, c.exit, c.confirm]).toEqual(['arsenal', false, 'Sair do treino', 'Você sai do campo de tiro e volta para a tela inicial.']);
  });

  it('os mesmos casos em inglês', () => {
    setLang('en');
    expect(pauseContext({ place: 'online', mode: 'mata-mata', session }).exit).toBe('Leave the session');
    expect(pauseContext({ place: 'bots', mode: 'zumbi', wave: 1 }).line).toBe(`Wave 1/${WAVES} · alone`);
    expect(pauseContext({ place: 'range', mode: null }).banner).toBe('Game paused.');
  });
});

describe('menu de pausa: Esc e ◯ voltam um nível', () => {
  it('janela de saída → aba → jogo', () => {
    expect(backStep({ confirm: true, tab: 'config' })).toBe('close-dialog');
    expect(backStep({ confirm: true, tab: null })).toBe('close-dialog');
    expect(backStep({ confirm: false, tab: 'mode' })).toBe('close-tab');
    expect(backStep({ confirm: false, tab: null })).toBe('resume');
  });
});

const player = (id: number, name: string, step: number, kills: number, score = 0): PlayerInfo => ({
  id,
  name,
  nivel: 1,
  sex: 'm',
  kills: 0,
  deaths: 0,
  score,
  humiliations: 0,
  alive: true,
  ping: 0,
  ladder: { step, kills },
});

describe('menu de pausa: quem está na frente da corrida armada', () => {
  it('o primeiro do placar: degrau, abates no degrau, depois pontos', () => {
    const list = [player(1, 'Você', 2, 1), player(2, 'Sargento Pastel', 4, 0), player(3, 'Tia do Zap', 4, 2)];
    expect(ladderLeader(list, 1)).toEqual({ you: false, name: 'Tia do Zap', step: 4 });
    const tie = [player(1, 'Você', 3, 1, 100), player(2, 'Sargento Pastel', 3, 1, 900)];
    expect(ladderLeader(tie, 1)).toEqual({ you: false, name: 'Sargento Pastel', step: 3 });
  });

  it('"Você está na frente" quando é o jogador', () => {
    expect(ladderLeader([player(1, 'Eu', 5, 0), player(2, 'Bot', 1, 2)], 1)).toEqual({ you: true });
  });

  it('some sem outro jogador na partida', () => {
    expect(ladderLeader([player(1, 'Eu', 5, 0)], 1)).toBeNull();
    expect(ladderLeader([], 1)).toBeNull();
  });

  it('fora da corrida o placar ordena por pontos, abates e menos mortes', () => {
    const a = { ...player(1, 'A', 6, 2, 100), kills: 3 };
    const b = { ...player(2, 'B', 0, 0, 300), kills: 1 };
    const c = { ...player(3, 'C', 0, 0, 300), kills: 1, deaths: 4 };
    expect(standingsOrder([c, a, b], false).map((p) => p.name)).toEqual(['B', 'C', 'A']);
    expect(standingsOrder([c, a, b], true).map((p) => p.name)).toEqual(['A', 'B', 'C']);
  });
});

describe('menu de pausa: grupos da aba Teclas', () => {
  it('toda ação remapeável aparece uma vez, em Movimento, Combate ou Outros', () => {
    expect(KEY_GROUPS.map(([g]) => g)).toEqual(['keyGroupMove', 'keyGroupCombat', 'keyGroupOther']);
    const all = KEY_GROUPS.flatMap(([, a]) => a);
    expect([...all].sort()).toEqual([...REBINDABLE].sort());
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('menu de pausa: "Mais N melhorias a liberar"', () => {
  it('conta as trancadas e diz a próxima com os pontos que faltam', () => {
    const rifle = PROGRESSION.rifle.melhorias;
    expect(moreUpgradesText('rifle', 0)).toBe(`🔒 Mais ${rifle.length} melhorias a liberar. Próxima: ${upgradeName('rifle', rifle[0].id)}, faltam 1.000 pts de rifle.`);
    // Halfway to the second one: one fewer locked, the points still missing.
    expect(moreUpgradesText('rifle', rifle[0].xp + 200)).toBe(
      `🔒 Mais ${rifle.length - 1} melhorias a liberar. Próxima: ${upgradeName('rifle', rifle[1].id)}, faltam ${(rifle[1].xp - rifle[0].xp - 200).toLocaleString('pt-BR')} pts de rifle.`,
    );
  });

  it('uma só: "Mais 1 melhoria a liberar: X"; nenhuma: sem linha', () => {
    const faca = PROGRESSION.faca.melhorias;
    const last = faca[faca.length - 1];
    const before = faca[faca.length - 2]?.xp ?? 0;
    const one = moreUpgradesText('faca', before)!;
    expect(one.startsWith('🔒 Mais 1 melhoria a liberar: ')).toBe(true);
    expect(one).toContain(`faltam ${(last.xp - before).toLocaleString('pt-BR')} pts de faca`);
    expect(moreUpgradesText('faca', last.xp)).toBeNull();
  });

  it('em inglês', () => {
    setLang('en');
    expect(moreUpgradesText('granada', 0)).toContain('more upgrades to unlock. Next: ');
  });
});

describe('menu de pausa: nome do mapa na prévia glTF', () => {
  it('o nome do arquivo, sem a pasta', () => {
    expect(previewMapName('/maps/arquivo.glb')).toBe('Prévia: arquivo.glb');
    expect(previewMapName('arena.glb?v=2')).toBe('Prévia: arena.glb');
    setLang('en');
    expect(previewMapName('/maps/arquivo.glb')).toBe('Preview: arquivo.glb');
  });
});
