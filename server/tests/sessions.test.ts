// Sessions on demand (PF-6): 'play' opens a session of the map's current version when none has room, and it
// closes once empty; whoever is playing version 1 stays on it after version 2 is saved, while newcomers get
// version 2 (official maps too, and going back to an old version works the same); a community map is played
// online like any other (the zumbi mode too, on a copy of the cemetery); a map's plays count once per account and
// session; and the collectibles, the witch's potion, the rats and the fish are checked against the saved data.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { MapData, Vec3 } from '@shared/mapData';
import type { SessionInfo } from '@shared/protocol';
import type { GameServer } from '../app';
import { Browser, enterMap, Player, promote, sleep, startTestServer, tinyMap } from './helpers';

let game: GameServer;
beforeAll(async () => {
  game = await startTestServer();
});
afterAll(async () => {
  await game?.close();
});

async function signedIn(name: string) {
  const b = new Browser(game);
  await b.register(name);
  return b;
}

/** A signed-in player in the lobby. */
async function lobby(name: string) {
  const p = await Player.connect(game, await (await signedIn(name)).ticket());
  p.send({ t: 'hello' });
  await p.next('welcome');
  return p;
}

const sessions = async () => (await (await fetch(`http://127.0.0.1:${game.port}/api/sessoes`)).json()) as SessionInfo[];
const plays = async (id: string) => Number((await game.deps.db.query('SELECT play_count FROM map WHERE id = $1', [id])).rows[0].play_count);

describe('sessões sob demanda', () => {
  it('play abre a sessão quando não há uma com vaga, e ela fecha vazia', async () => {
    const author = await signedIn('Anfitria');
    const { id } = (await author.req('POST', '/api/mapas', { dados: tinyMap('Salão Vazio') })).body;
    expect((await sessions()).filter((s) => s.map === id)).toEqual([]);
    const a = await lobby('Primeira');
    const b = await lobby('Segunda');
    const ja = await enterMap(a, id);
    const jb = await enterMap(b, id);
    expect(jb.session.id).toBe(ja.session.id);
    expect(ja.session).toMatchObject({ map: id, versao: 1, mapaNome: 'Salão Vazio', name: 'Salão Vazio', mode: 'mata-mata' });
    a.close();
    await sleep(200);
    expect((await sessions()).filter((s) => s.map === id).map((s) => s.players)).toEqual([1]);
    b.close();
    await sleep(200);
    expect((await sessions()).filter((s) => s.map === id)).toEqual([]);
  });

  it('quem está na v1 continua na v1 depois de salvar a v2; quem chega vai para a v2', async () => {
    const author = await signedIn('Autora');
    const { id } = (await author.req('POST', '/api/mapas', { dados: tinyMap('Mapa Vivo') })).body;
    const p1 = await lobby('Veterano');
    const s1 = (await enterMap(p1, id)).session;
    expect(s1.versao).toBe(1);
    const v2: MapData = { ...tinyMap('Mapa Vivo'), pecas: [tinyMap().pecas[0], { id: 'carro', tipo: 'carro', p: [-6, 0, -6], params: { cor: 0x22aa55 } }] };
    expect((await author.req('PUT', `/api/mapas/${id}`, { dados: v2, baseVersao: 1 })).body.versao).toBe(2);

    const p2 = await lobby('Recem Chegado');
    const s2 = (await enterMap(p2, id)).session;
    expect(s2.versao).toBe(2);
    expect(s2.id).not.toBe(s1.id);
    // The first session still plays version 1 (and still has room: someone may join it by its id).
    expect((await sessions()).find((s) => s.id === s1.id)?.versao).toBe(1);
    const p3 = await lobby('Amigo');
    p3.send({ t: 'join', session: s1.id });
    expect((await p3.next('joined')).session.versao).toBe(1);
    // Each version's data, as the clients download it.
    const data = async (v: number) => (await (await fetch(`http://127.0.0.1:${game.port}/api/mapas/${id}/versoes/${v}`)).json()) as MapData;
    expect((await data(1)).pecas[1].p).toEqual([2, 0, 3]);
    expect((await data(2)).pecas[1].p).toEqual([-6, 0, -6]);
    for (const p of [p1, p2, p3]) p.close();
  });

  it('o admin edita a Rua: partidas novas usam a versão nova, a em andamento a antiga; restaurar volta', async () => {
    const admin = await signedIn('Prefeita');
    await promote(admin, 'admin');
    const before = (await admin.req('GET', '/api/mapas/rua')).body.versao as number;
    const data = (await (await fetch(`http://127.0.0.1:${game.port}/api/mapas/rua/versoes/${before}`)).json()) as MapData;
    const old = await lobby('Morador');
    const sOld = (await enterMap(old, 'rua', 'corrida-armada')).session;
    expect(sOld.versao).toBe(before);
    try {
      // A car moved.
      const car = data.pecas.findIndex((p) => p.tipo === 'carro');
      const moved: MapData = { ...data, pecas: data.pecas.map((p, i) => (i === car ? { ...p, p: [p.p![0] + 3, p.p![1], p.p![2]] as Vec3 } : p)) };
      const saved = await admin.req('PUT', '/api/mapas/rua', { dados: moved, baseVersao: before });
      expect(saved.status).toBe(200);
      const fresh = await lobby('Visitante');
      expect((await enterMap(fresh, 'rua', 'corrida-armada')).session.versao).toBe(saved.body.versao);
      expect((await sessions()).find((s) => s.id === sOld.id)?.versao).toBe(before);
      fresh.close();
    } finally {
      expect((await admin.req('POST', '/api/mapas/rua/restaurar', { versao: before })).status).toBe(200);
    }
    // Restored: new players get the old version again (the session already playing it has room).
    const later = await lobby('Retornado');
    expect((await enterMap(later, 'rua', 'corrida-armada')).session).toMatchObject({ id: sOld.id, versao: before });
    old.close();
    later.close();
  });

  it('jogadas: uma vez por conta e por sessão', async () => {
    const author = await signedIn('Contadora');
    const { id } = (await author.req('POST', '/api/mapas', { dados: tinyMap('Contado') })).body;
    const a = await lobby('Jogador A');
    const b = await lobby('Jogador B');
    const s = (await enterMap(a, id)).session;
    await enterMap(b, id);
    await sleep(100);
    expect(await plays(id)).toBe(2);
    // A leaves and comes back to the same session (B kept it open): still counted once.
    a.send({ t: 'leave' });
    await sleep(50);
    a.send({ t: 'join', session: s.id });
    await a.next('joined');
    await sleep(100);
    expect(await plays(id)).toBe(2);
    a.close();
    b.close();
  });
});

describe('mapas da comunidade online', () => {
  /** A map with one of everything the server tracks, away from the spawns (the rat and the fish beyond their reach: a shot reaches them from afar). */
  function stuffed(): MapData {
    const base = tinyMap('Feira');
    return {
      ...base,
      pecas: [...base.pecas, { id: 'bruxa', tipo: 'bruxa', p: [-12, 0, -12], yaw: 0, params: {}, prop: 'bruxa' }],
      objetos: {
        coletaveis: [{ id: 'bolo', tipo: 'biscoito', p: [12, 0, 12] }],
        bruxa: [-12, 0, -12],
        ratos: [{ id: 'ratao', p: [45, 0, -45] }],
        peixes: [{ id: 'koi:0', lago: 'fonte', volta: [-90, 90, 1], y: -0.4 }],
      },
    };
  }

  it('coletável, poção, rato e peixe valem onde os dados do mapa dizem', async () => {
    const author = await signedIn('Feirante');
    const saved = await author.req('POST', '/api/mapas', { dados: stuffed() });
    expect(saved.status).toBe(201);
    const id = saved.body.id;
    const a = await lobby('Comprador');
    const w = await lobby('Testemunha');
    const joined = await enterMap(a, id);
    await enterMap(w, id);
    const me = joined.you;
    const at = (p: Vec3) => a.send({ t: 'state', s: { p, yaw: 0, pitch: 0, f: 0 } });
    a.send({ t: 'respawn', p: [0, 0.2, 0], yaw: 0 });
    await w.next('spawned', (m) => m.id === me);

    // Far from everything, or ids of other maps: nothing.
    for (const m of [{ t: 'pickup', id: 'bolo' }, { t: 'pickup', id: 'cereja' }, { t: 'rat', id: 'ratao' }, { t: 'fish', id: 'koi:0' }, { t: 'potion' }]) a.send(m);
    await expect(w.next('pickup', () => true, 300)).rejects.toThrow();
    expect(w.msgs.some((m) => m.t === 'rat' || m.t === 'fish' || m.t === 'potion')).toBe(false);

    at([12, 0, 12]);
    a.send({ t: 'pickup', id: 'bolo' });
    expect(await w.next('pickup')).toMatchObject({ id: 'bolo', by: me });
    at([45, 0, -44]);
    a.send({ t: 'rat', id: 'ratao' });
    expect(await w.next('rat')).toMatchObject({ id: 'ratao', by: me });
    at([-12, 0, -11.5]);
    a.send({ t: 'potion' });
    expect((await w.next('potion')).by).toBe(me);
    at([-90, 0, 89]);
    a.send({ t: 'fish', id: 'koi:0' });
    expect(await w.next('fish')).toMatchObject({ id: 'koi:0', by: me });
    a.close();
    w.close();
  });

  it('uma cópia do cemitério é jogável no modo zumbi, e só nele', async () => {
    const fan = await signedIn('Fa de Zumbi');
    const copy = await fan.req('POST', '/api/mapas/cemiterio/duplicar');
    expect(copy.status).toBe(201);
    const id = copy.body.id;
    expect((await fan.req('GET', `/api/mapas/${id}`)).body).toMatchObject({ tipo: 'comunidade', exclusivo: 'zumbi' });
    const p = await lobby('Sobrevivente');
    p.send({ t: 'play', map: id, mode: 'mata-mata' });
    expect((await p.next('error')).message).toBe('Esse modo não é jogado nesse mapa.');
    const joined = await enterMap(p, id, 'zumbi');
    expect(joined.session).toMatchObject({ map: id, mode: 'zumbi', mapaNome: 'Cemitério da Capela (cópia)' });
    // The match runs on the copy's navmesh, counting down to the first wave: in 'joined' when the navmesh was
    // already loaded, else announced as soon as it is.
    const match = joined.zumbi ?? (await p.next('zwave', () => true, 10_000));
    expect(match.phase).toBe('countdown');
    expect((await game.deps.db.query('SELECT navmesh IS NOT NULL AS ok FROM map_version WHERE map_id = $1', [id])).rows).toEqual([{ ok: true }]);
    p.close();
  }, 30_000);
});
