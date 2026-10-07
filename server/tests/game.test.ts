// The game connection: single-use tickets, origin check, one connection per account, revocation, and
// progress earned only from kills the server validated.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { CLOSE, FLAG, NET, type SessionInfo } from '@shared/protocol';
import { BISCUIT, CHERRY, HEALTH, KOI, POTION, RAT } from '@shared/constants';
import { DEFAULT_LOADOUT, gunStats } from '@shared/arsenal';
import type { GameServer } from '../app';
import { ticketKey } from '../api';
import { ban, mute, resolveTag, unmute } from '../moderacao';
import { Browser, enterMap, Player, setWeaponXp, sleep, startTestServer } from './helpers';

let game: GameServer;
beforeAll(async () => {
  game = await startTestServer();
});
afterAll(async () => {
  await game?.close();
});

async function signedIn(name = 'Jogador') {
  const b = new Browser(game);
  await b.register(name);
  return b;
}

/** `lobby`: messages sent before joining (the Arsenal choice is made there: it's locked in the match). */
async function joinMain(b: Browser, lobby: object[] = []) {
  const p = await Player.connect(game, await b.ticket());
  p.send({ t: 'hello' });
  const welcome = await p.next('welcome');
  for (const m of lobby) p.send(m);
  const joined = await enterMap(p, 'rua');
  return { p, welcome, joined };
}

describe('ticket do WebSocket', () => {
  it('vale uma vez só', async () => {
    const b = await signedIn();
    const ticket = await b.ticket();
    const p = await Player.connect(game, ticket);
    await expect(Player.connect(game, ticket)).rejects.toThrow('recusado');
    expect(await Player.refusal(game, ticket)).toBe(401);
    p.close();
  });

  it('vence em 30 s', async () => {
    const b = await signedIn();
    const ticket = await b.ticket();
    await game.deps.redis.pexpire(ticketKey(ticket), 1);
    await sleep(20);
    expect(await Player.refusal(game, ticket)).toBe(401);
  });

  it('recusa handshake vindo de outro site', async () => {
    const b = await signedIn();
    const ticket = await b.ticket();
    expect(await Player.refusal(game, ticket, 'http://site-malicioso.com')).toBe(403);
    // The refused handshake didn't spend the ticket, and the page's own origin still gets in.
    (await Player.connect(game, ticket)).close();
  });

  it('não gasta o ticket com um GET comum', async () => {
    const b = await signedIn();
    const ticket = await b.ticket();
    expect((await fetch(`http://127.0.0.1:${game.port}/ws?ticket=${ticket}`)).status).toBe(426);
    (await Player.connect(game, ticket)).close();
  });

  it('sem sessão não há ticket', async () => {
    expect((await new Browser(game).req('POST', '/api/ws-ticket')).status).toBe(401);
  });

  it('o nome vem da conta, não da mensagem', async () => {
    const b = await signedIn('Honesto');
    const p = await Player.connect(game, await b.ticket());
    p.send({ t: 'hello', name: 'Impostor', sex: 'f' });
    const w = await p.next('welcome');
    expect(w.name).toMatch(/^Honesto#\d{4}$/);
    p.close();
  });
});

describe('conexões da conta', () => {
  it('a conexão nova derruba a antiga', async () => {
    const b = await signedIn();
    const first = await Player.connect(game, await b.ticket());
    const second = await Player.connect(game, await b.ticket());
    expect(await first.waitClose()).toBe(CLOSE.replaced);
    expect(second.closed).toBeNull();
    second.close();
  });

  it('sair da conta encerra a partida', async () => {
    const b = await signedIn();
    const { p } = await joinMain(b);
    await b.req('POST', '/api/auth/sair');
    expect(await p.waitClose()).toBe(CLOSE.revoked);
  });

  it('banimento encerra a partida e bloqueia o login', async () => {
    const b = await signedIn('Trapaceiro');
    const { p, welcome } = await joinMain(b);
    await ban(game.deps, await resolveTag(game.deps, welcome.name), 'teste', '7d');
    expect(await p.waitClose()).toBe(CLOSE.revoked);
    expect((await b.req('GET', '/api/me')).status).toBe(401);
  });
});

describe('progresso', () => {
  it('o abate validado pelo servidor dá pontos à arma, XP à conta e estatísticas, gravados ao sair', async () => {
    const a = await signedIn('Atirador');
    const v = await signedIn('Alvo');
    // Already scored with the SMG: it stays unlocked for this account.
    await setWeaponXp(a, { smg: 1 });
    // In the lobby, a locked upgrade is ignored: the server keeps the rifle without it.
    const A = await joinMain(a, [{ t: 'loadout', lo: { secundaria: 'smg', ligadas: { rifle: ['silenciador'] } } }]);
    expect((await A.p.next('progresso', (m) => m.escolha.secundaria === 'smg')).escolha).toEqual({ primaria: 'rifle', secundaria: 'smg', faca: 'faca', ligadas: {}, desligadas: {} });
    const V = await joinMain(v);
    const vId = V.joined.you;
    A.p.send({ t: 'respawn', p: [0, 0, 0], yaw: 0 });
    V.p.send({ t: 'respawn', p: [0, 0, 10], yaw: 0 });
    await A.p.next('spawned', (m) => m.id === A.joined.you);
    await A.p.next('spawned', (m) => m.id === vId);

    // Headshots from 10 m, spaced by the rifle's fire rate, until the kill.
    const kill = A.p.next('kill', (m) => m.victim === vId, 8000);
    for (let i = 0; i < 8 && !A.p.msgs.some((m) => m.t === 'kill'); i++) {
      A.p.send({ t: 'hit', target: vId, region: 'cabeca', dist: 10, w: 'rifle' });
      await sleep(100);
    }
    const k = await kill;
    expect(k.kind).toBe('head');
    expect(k.arma).toBe('rifle');
    const points = k.awards.reduce((s, x) => s + x.value, 0);
    const prog = await A.p.next('progresso', (m) => m.armas.rifle.xp > 0);
    expect(prog.armas.rifle.xp).toBe(points);
    expect(prog.armas.rifle.nivel).toBe(1);
    expect(prog.conta.xp).toBe(25);

    A.p.send({ t: 'leave' });
    V.p.send({ t: 'leave' });
    await sleep(300);
    const profileA = await a.req('GET', '/api/perfil');
    expect(profileA.body.armas.rifle.xp).toBe(points);
    expect(profileA.body.xp).toBe(25);
    expect(profileA.body.totais.abates).toBe(1);
    expect(profileA.body.totais.cabeca).toBe(1);
    // Never played zumbi: no zombie_stats row yet, all zero.
    expect(profileA.body.totais.zumbi).toMatchObject({ partidas: 0, abates: 0, melhorOnda: 0 });
    expect(profileA.body.participacoes[0]).toMatchObject({ sessao: 'Rua dos Vizinhos', abates: 1 });
    expect(profileA.body.participacoes[0].saida).not.toBeNull();
    const profileV = await v.req('GET', '/api/perfil');
    expect(profileV.body.totais.mortes).toBe(1);
    expect(profileV.body.armas.rifle.xp).toBe(0);
    A.p.close();
    V.p.close();
  });

  it('o placar mostra o nível da conta', async () => {
    const b = await signedIn('Placar');
    const { joined } = await joinMain(b);
    const me = joined.players.find((x) => x.id === joined.you)!;
    expect(me.nivel).toBe(1);
    expect(me.name).toMatch(/^Placar#\d{4}$/);
  });
});

describe('mapas', () => {
  it('não há salas fixas; a sala criada leva o mapa escolhido, com a versão e o nome dele', async () => {
    const b = await signedIn('Cartografo');
    const p = await Player.connect(game, await b.ticket());
    p.send({ t: 'hello' });
    await p.next('welcome');

    p.send({ t: 'create', name: 'Chá das cinco', map: 'jardim' });
    expect((await p.next('joined')).session).toMatchObject({ name: 'Chá das cinco', map: 'jardim', versao: 1, mapaNome: 'Jardim do Dragão', mode: 'mata-mata' });
    p.send({ t: 'create', name: 'Corrida do chá', map: 'jardim', mode: 'corrida-armada' });
    expect((await p.next('joined')).session).toMatchObject({ name: 'Corrida do chá', map: 'jardim', mode: 'corrida-armada' });

    // A map the server doesn't know falls back to the default one.
    p.send({ t: 'create', name: 'Lugar nenhum', map: 'atlantida' as never });
    expect((await p.next('joined')).session.map).toBe('rua');
    p.close();
  });
});

describe('cereja do jardim', () => {
  async function joinGarden(b: Browser) {
    const p = await Player.connect(game, await b.ticket());
    p.send({ t: 'hello' });
    await p.next('welcome');
    return { p, joined: await enterMap(p, 'jardim') };
  }

  it('só quem está perto pega; aumenta a vida máxima, some para todos e quem chega depois sabe quando volta', async () => {
    const A = await joinGarden(await signedIn('Longe'));
    const B = await joinGarden(await signedIn('Perto'));
    const bId = B.joined.you;
    A.p.send({ t: 'respawn', p: [12, 0, 12], yaw: 0 });
    B.p.send({ t: 'respawn', p: [0, 0.35, 2.4], yaw: 0 });
    await A.p.next('spawned', (m) => m.id === bId);

    // Too far from the tree: ignored.
    A.p.send({ t: 'pickup', id: 'cereja' });
    await expect(A.p.next('pickup', () => true, 300)).rejects.toThrow();

    B.p.send({ t: 'pickup', id: 'cereja' });
    const taken = await A.p.next('pickup');
    expect(taken).toMatchObject({ id: 'cereja', by: bId });
    // Server times are performance.now() (fractions of a ms): their difference can be off by a hair.
    expect(taken.ready - taken.until).toBeCloseTo((CHERRY.respawn - CHERRY.duration) * 1000);
    await B.p.next('snap', (m) => m.players.find((x) => x.id === bId)?.h === HEALTH.max + CHERRY.extraHealth);

    // Gone until it grows back: walking up to it doesn't give it again.
    A.p.send({ t: 'state', s: { p: [0, 0.35, 2.2], yaw: 0, pitch: 0, f: 0 } });
    A.p.send({ t: 'pickup', id: 'cereja' });
    await expect(A.p.next('pickup', () => true, 300)).rejects.toThrow();

    const C = await joinGarden(await signedIn('Atrasado'));
    expect(C.joined.pickups).toEqual([{ id: 'cereja', ready: taken.ready }]);
    for (const x of [A, B, C]) x.p.close();
  });

  it('peixe abatido dá XP da conta uma vez, volta depois e quem chega sabe quando', async () => {
    const A = await joinGarden(await signedIn('Pescador'));
    const B = await joinGarden(await signedIn('Atrasado'));
    const aId = A.joined.you;
    A.p.send({ t: 'respawn', p: [-10, 0, -31], yaw: 0 });
    await B.p.next('spawned', (m) => m.id === aId);

    A.p.send({ t: 'fish', id: 'koi:0' });
    const killed = await B.p.next('fish');
    expect(killed).toMatchObject({ id: 'koi:0', by: aId, prize: 'koi' });
    const [min, max] = KOI.respawn;
    // Server clock: B joined just before the kill.
    expect(killed.ready - B.joined.time).toBeGreaterThanOrEqual(min * 1000);
    expect(killed.ready - B.joined.time).toBeLessThanOrEqual(max * 1000 + 2000);
    // A new account: its only XP is the fish's.
    expect((await A.p.next('progresso', (m) => m.conta.xp > 0)).conta.xp).toBe(KOI.xp);

    // Dead until it's back: shooting it again gives nothing, and whoever joins now knows when it returns.
    A.p.send({ t: 'fish', id: 'koi:0' });
    await expect(B.p.next('fish', () => true, 300)).rejects.toThrow();
    const C = await joinGarden(await signedIn('Curioso'));
    expect(C.joined.fish).toContainEqual({ id: 'koi:0', ready: killed.ready, golden: killed.golden });
    // A fish that doesn't exist, or a shooter too far from it, is ignored.
    A.p.send({ t: 'fish', id: 'koi:99' });
    A.p.send({ t: 'state', s: { p: [44, 0, 44], yaw: 0, pitch: 0, f: 0 } });
    A.p.send({ t: 'fish', id: 'koi:1' });
    await expect(B.p.next('fish', () => true, 300)).rejects.toThrow();
    for (const x of [A, B, C]) x.p.close();
  });
});

describe('vila assombrada', () => {
  async function joinTown(b: Browser) {
    const p = await Player.connect(game, await b.ticket());
    p.send({ t: 'hello' });
    await p.next('welcome');
    return { p, joined: await enterMap(p, 'halloween') };
  }

  it('o rato gigante dá uma humanidade (+vida máxima até morrer) a quem o derruba perto dele', async () => {
    const A = await joinTown(await signedIn('Longe'));
    const B = await joinTown(await signedIn('Cavaleiro'));
    const bId = B.joined.you;
    A.p.send({ t: 'respawn', p: [50, 0, -40], yaw: 0 });
    B.p.send({ t: 'respawn', p: [7.5, -4, 44], yaw: 0 });
    await A.p.next('spawned', (m) => m.id === bId);

    // Too far from the rat: ignored.
    A.p.send({ t: 'rat', id: 'rato' });
    await expect(A.p.next('rat', () => true, 300)).rejects.toThrow();

    B.p.send({ t: 'rat', id: 'rato' });
    const down = await A.p.next('rat');
    expect(down).toMatchObject({ id: 'rato', by: bId });
    await B.p.next('snap', (m) => m.players.find((x) => x.id === bId)?.h === HEALTH.max + RAT.extraHealth);

    // Dead until it's back: nobody gets it again, and whoever joins now knows when it returns.
    B.p.send({ t: 'rat', id: 'rato' });
    await expect(A.p.next('rat', () => true, 300)).rejects.toThrow();
    const C = await joinTown(await signedIn('Atrasado'));
    expect(C.joined.rats).toEqual([{ id: 'rato', ready: down.ready }]);
    for (const x of [A, B, C]) x.p.close();
  });

  it('a granada de quem bebeu a poção chega aos outros como pato', async () => {
    const A = await joinTown(await signedIn('Pateta'));
    const B = await joinTown(await signedIn('Vizinho'));
    const aId = A.joined.you;
    A.p.send({ t: 'respawn', p: [-40, 0, -38], yaw: 0 });
    await B.p.next('spawned', (m) => m.id === aId);
    A.p.send({ t: 'grenade', id: 1, p: [-40, 1.5, -38], v: [0, 3, 8], fuse: 2, impact: true, duck: true });
    expect(await B.p.next('grenade')).toMatchObject({ owner: aId, id: 1, duck: true });
    A.p.send({ t: 'grenade', id: 2, p: [-40, 1.5, -38], v: [0, 3, 8], fuse: 2, impact: true });
    expect((await B.p.next('grenade', (m) => m.id === 2)).duck).toBeUndefined();
    for (const x of [A, B]) x.p.close();
  });

  it('a poção da bruxa sorteia um efeito para quem está perto, uma de cada vez', async () => {
    const A = await joinTown(await signedIn('Bebum'));
    const B = await joinTown(await signedIn('Testemunha'));
    const aId = A.joined.you;
    A.p.send({ t: 'respawn', p: [10, 0, 10], yaw: 0 });
    await B.p.next('spawned', (m) => m.id === aId);
    // Far from the witch: nothing.
    A.p.send({ t: 'potion' });
    await expect(B.p.next('potion', () => true, 300)).rejects.toThrow();
    A.p.send({ t: 'state', s: { p: [-40.2, 0, -44.5], yaw: 0, pitch: 0, f: 0 } });
    A.p.send({ t: 'potion' });
    const drunk = await B.p.next('potion');
    expect(drunk.by).toBe(aId);
    expect(POTION.kinds).toContain(drunk.kind);
    if (drunk.kind === 'pato') expect(drunk.until).toBe(0);
    else expect(drunk.until - B.joined.time).toBeGreaterThanOrEqual(POTION.duration * 1000);
    // Another one right away: the witch says no.
    A.p.send({ t: 'potion' });
    await expect(B.p.next('potion', () => true, 300)).rejects.toThrow();
    for (const x of [A, B]) x.p.close();
  });

  it('o biscoito do armário enche a vida de quem está perto e volta depois', async () => {
    const A = await joinTown(await signedIn('Salsicha'));
    const aId = A.joined.you;
    A.p.send({ t: 'respawn', p: [-44.4, 0, 9.2], yaw: 0 });
    await A.p.next('spawned', (m) => m.id === aId);
    A.p.send({ t: 'pickup', id: 'biscoito' });
    const taken = await A.p.next('pickup');
    expect(taken).toMatchObject({ id: 'biscoito', by: aId, until: 0 });
    expect(taken.ready - A.joined.time).toBeGreaterThanOrEqual(BISCUIT.respawn * 1000);
    A.p.send({ t: 'pickup', id: 'biscoito' });
    await expect(A.p.next('pickup', () => true, 300)).rejects.toThrow();
    A.p.close();
  });
});

describe('armas vistas pelos outros', () => {
  it('o equipamento escolhido antes da partida chega validado aos outros, e não muda durante ela', async () => {
    const atirador = await signedIn('Atirador');
    await setWeaponXp(atirador, { smg: 1 });
    const a = await joinMain(atirador, [{ t: 'loadout', lo: { secundaria: 'smg', ligadas: {} } }]);
    const b = await joinMain(await signedIn('Observador'));
    expect(b.joined.players.find((x) => x.id === a.joined.you)?.lo).toEqual({ ...DEFAULT_LOADOUT, secundaria: 'smg' });
    // Upgrades the account hasn't unlocked never reach the others; a primary isn't a secondary.
    const c = await joinMain(await signedIn('Sonhador'), [{ t: 'loadout', lo: { secundaria: 'rifle', ligadas: { faca: ['sabre'], granada: ['mina'] } } }]);
    expect(b.p.msgs.find((x) => x.t === 'playerJoined' && x.player.id === c.joined.you) ?? (await b.p.next('playerJoined', (x) => x.player.id === c.joined.you))).toMatchObject({ player: { lo: DEFAULT_LOADOUT } });
    // Mid-match (mata-mata): locked, nobody hears of another loadout.
    a.p.send({ t: 'loadout', lo: { secundaria: 'pistola', ligadas: {} } });
    await expect(b.p.next('playerLoadout', (x) => x.id === a.joined.you, 300)).rejects.toThrow();
    a.p.close();
    b.p.close();
    c.p.close();
  });

  it('o dano e os pontos são da arma que atirou, e só valem as armas do loadout', async () => {
    const a = await signedIn('Pistoleiro');
    const v = await signedIn('Vitima');
    const A = await joinMain(a);
    const V = await joinMain(v);
    const vId = V.joined.you;
    A.p.send({ t: 'respawn', p: [0, 0, 0], yaw: 0 });
    V.p.send({ t: 'respawn', p: [0, 0, 10], yaw: 0 });
    await A.p.next('spawned', (m) => m.id === vId);
    // The SMG isn't in the loadout (the pistol is the secondary): its hits are ignored.
    A.p.send({ t: 'hit', target: vId, region: 'peito', dist: 10, w: 'smg' });
    await expect(A.p.next('damage', (m) => m.target === vId, 300)).rejects.toThrow();
    // The pistol, out of the holster (the state flag says the secondary is in hand): the pistol's damage.
    A.p.send({ t: 'state', s: { p: [0, 0, 0], yaw: 0, pitch: 0, f: FLAG.secondary } });
    A.p.send({ t: 'hit', target: vId, region: 'peito', dist: 10, w: 'pistola' });
    expect((await A.p.next('damage', (m) => m.target === vId)).amount).toBe(gunStats('pistola').dano.max);
    // A rifle hit right after the switch still counts (it was in flight); much later it wouldn't.
    A.p.send({ t: 'hit', target: vId, region: 'peito', dist: 10, w: 'rifle' });
    expect((await A.p.next('damage', (m) => m.target === vId)).amount).toBe(gunStats('rifle').dano.max);
    const kill = A.p.next('kill', (m) => m.victim === vId, 8000);
    for (let i = 0; i < 8 && !A.p.msgs.some((m) => m.t === 'kill'); i++) {
      await sleep(160);
      A.p.send({ t: 'hit', target: vId, region: 'peito', dist: 10, w: 'pistola' });
    }
    const k = await kill;
    expect(k.arma).toBe('pistola');
    const points = k.awards.reduce((s, x) => s + x.value, 0);
    const prog = await A.p.next('progresso', (m) => m.armas.pistola.xp > 0);
    expect(prog.armas.pistola.xp).toBe(points);
    expect(prog.armas.rifle.xp).toBe(0);
    A.p.close();
    V.p.close();
  });

  it('a submetralhadora trancada (pistola abaixo do nível 3) não entra: o servidor mantém a pistola', async () => {
    const a = await joinMain(await signedIn('Apressado'), [{ t: 'loadout', lo: { secundaria: 'smg', ligadas: {}, desligadas: { rifle: ['pontoVermelho'] } } }]);
    expect(a.joined.players.find((x) => x.id === a.joined.you)?.lo).toEqual(DEFAULT_LOADOUT);
    expect(a.p.msgs.filter((m) => m.t === 'progresso').at(-1)).toMatchObject({ escolha: { secundaria: 'pistola', desligadas: {} } });
    a.p.close();
  });

  it('quem entra recebe o loadout de quem já está na partida', async () => {
    const a = await joinMain(await signedIn('Veterano'));
    const b = await joinMain(await signedIn('Novato'));
    const info = b.joined.players.find((p) => p.id === a.joined.you);
    expect(info?.lo).toBeDefined();
    a.p.close();
    b.p.close();
  });
});

describe('chat da sala', () => {
  it('a fala chega a todos da sala, inclusive a quem falou, já limpa', async () => {
    const a = await joinMain(await signedIn('Falante'));
    const b = await joinMain(await signedIn('Ouvinte'));
    a.p.send({ t: 'chat', text: '  oi‮   pessoal\n<3  ' });
    const heard = await b.p.next('chat', (m) => m.id === a.joined.you);
    expect(heard.text).toBe('oi pessoal <3');
    expect(heard.name).toBe(a.joined.players.find((p) => p.id === a.joined.you)!.name);
    expect((await a.p.next('chat', (m) => m.id === a.joined.you)).text).toBe('oi pessoal <3');
    // Too long is cut, empty is dropped.
    a.p.send({ t: 'chat', text: 'x'.repeat(500) });
    expect((await b.p.next('chat', (m) => m.id === a.joined.you)).text).toHaveLength(NET.chatMax);
    a.p.close();
    b.p.close();
  });

  it('quem manda rápido demais é segurado depois da rajada', async () => {
    const a = await joinMain(await signedIn('Spammer'));
    for (let i = 0; i <= NET.chatBurst; i++) a.p.send({ t: 'chat', text: `msg ${i}` });
    expect((await a.p.next('chatRefused')).reason).toBe('slow');
    a.p.close();
  });

  it('silenciar vale na partida em andamento, e dessilenciar devolve o chat', async () => {
    const a = await joinMain(await signedIn('Boquirroto'));
    const b = await joinMain(await signedIn('Paciente'));
    const id = await resolveTag(game.deps, a.welcome.name);
    await mute(game.deps, id, 'teste', '1h');
    await sleep(200);
    a.p.send({ t: 'chat', text: 'xingamento' });
    expect((await a.p.next('chatRefused')).reason).toBe('muted');
    await unmute(game.deps, id);
    await sleep(200);
    a.p.send({ t: 'chat', text: 'desculpa' });
    expect((await b.p.next('chat', (m) => m.id === a.joined.you)).text).toBe('desculpa');
    expect(b.p.msgs.some((m) => m.t === 'chat' && m.text === 'xingamento')).toBe(false);
    a.p.close();
    b.p.close();
  });
});

describe('sessões sob demanda', () => {
  const list = async () => (await (await fetch(`http://127.0.0.1:${game.port}/api/sessoes`)).json()) as SessionInfo[];

  it('lista as sessões abertas sem conexão de jogo, com o mapa, a versão e o modo de cada uma', async () => {
    const p = await Player.connect(game, await (await signedIn('Listado')).ticket());
    p.send({ t: 'hello' });
    await p.next('welcome');
    const joined = await enterMap(p, 'halloween', 'corrida-armada');
    await sleep(150);
    expect((await list()).find((s) => s.id === joined.session.id)).toEqual({ id: joined.session.id, name: 'Vila Assombrada', map: 'halloween', versao: 1, mapaNome: 'Vila Assombrada', mode: 'corrida-armada', players: 1, max: NET.maxPlayers });
    p.close();
    // Empty: it closes.
    await sleep(300);
    expect((await list()).some((s) => s.id === joined.session.id)).toBe(false);
  });

  it('abre outra sessão quando a do mapa lota, e cada uma fecha ao esvaziar', async () => {
    const players: Player[] = [];
    const ids = new Set<string>();
    for (let i = 0; i <= NET.maxPlayers; i++) {
      const p = await Player.connect(game, await (await signedIn(`Lotador ${i}`)).ticket());
      p.send({ t: 'hello' });
      await p.next('welcome');
      ids.add((await enterMap(p, 'halloween')).session.id);
      players.push(p);
    }
    await sleep(250);
    const open = (await list()).filter((s) => s.map === 'halloween' && s.mode === 'mata-mata');
    expect(ids.size).toBe(2);
    expect(Object.fromEntries(open.map((s) => [s.name, s.players]))).toEqual({ 'Vila Assombrada': NET.maxPlayers, 'Vila Assombrada 2': 1 });
    for (const p of players) p.close();
    await sleep(300);
    expect((await list()).filter((s) => s.map === 'halloween')).toEqual([]);
  });
});
