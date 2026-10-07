// The maps API (/api/mapas, PF-6): creating, versioning (409 when someone saved first), restoring, hiding,
// deleting and duplicating maps, the lists with search and order, who may save official maps, maps refused for
// their data or their draw budget, the GLB models (size, a broken file, a file pointing elsewhere, the download
// by SHA-256), and the official maps the server seeded being the very ones the game ships (built from what the
// API serves, against their golden).
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { MAP_BUDGET, type MapaResumo, type MapData } from '@shared/mapData';
import type { GameServer } from '../app';
import { Browser, enterMap, Player, promote, startTestServer, tinyMap } from './helpers';
import { copyName } from '../mapRoutes';
import { buildHeadless, compareSnapshots, goldenPath, OFFICIAL, summarize, type MapSnapshot } from '../../tools/snapshot-mapas';
import { fakeRenderer, loadClient, ROOT, silentSfx } from '../../tools/headless';

const { buildMapFromData } = await loadClient('client/world/mapLoader.ts');

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

const create = (b: Browser, dados: MapData, tipo: 'oficial' | 'comunidade' = 'comunidade') => b.req('POST', '/api/mapas', { tipo, dados });
const list = async (b: Browser, query = '') => (await b.req('GET', `/api/mapas${query}`)).body.mapas as MapaResumo[];

/** Sends a model the way the editor will (raw bytes, model/gltf-binary). */
async function upload(b: Browser, bytes: Uint8Array, contentType = 'model/gltf-binary') {
  const res = await fetch(`${b.base}/api/mapas/arquivos?nome=casinha.glb`, {
    method: 'POST',
    headers: { origin: b.origin, 'x-forwarded-for': b.ip, cookie: [...b.cookies].map(([k, v]) => `${k}=${v}`).join('; '), 'content-type': contentType },
    body: bytes,
  });
  return { status: res.status, body: JSON.parse(await res.text()) };
}

/** A GLB holding only `json` (padded as the format asks). */
function glbOf(json: object): Uint8Array {
  let text = JSON.stringify(json);
  while (text.length % 4) text += ' ';
  const body = new TextEncoder().encode(text);
  const out = new Uint8Array(20 + body.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, out.length, true);
  v.setUint32(12, body.length, true);
  v.setUint32(16, 0x4e4f534a, true);
  out.set(body, 20);
  return out;
}

const doghouse = async () => new Uint8Array(await Bun.file(`${ROOT}/public/models/casinha_cachorro.glb`).arrayBuffer());

describe('mapas da comunidade', () => {
  it('cria, salva versões, recusa a versão desatualizada, restaura e lista as versões', async () => {
    const author = await signedIn('Arquiteta');
    const r = await create(author, tinyMap('Praça do Teste'));
    expect(r.status).toBe(201);
    const { id } = r.body;
    expect(r.body.versao).toBe(1);
    const seen = (await author.req('GET', `/api/mapas/${id}`)).body as MapaResumo;
    expect(seen).toMatchObject({ id, tipo: 'comunidade', nome: 'Praça do Teste', autor: (await author.req('GET', '/api/perfil')).body.tag, versao: 1, exclusivo: null, jogadas: 0 });
    expect(seen.pode).toEqual({ editar: true, apagar: true, ocultar: false, duplicar: true });
    expect(seen.meu).toBe(true);

    const v2 = { ...tinyMap('Praça do Teste'), pecas: [...tinyMap().pecas.slice(0, 1), { id: 'carro', tipo: 'carro', p: [8, 0, -3] as [number, number, number], params: { cor: 0x2255aa } }] };
    expect((await author.req('PUT', `/api/mapas/${id}`, { dados: v2, baseVersao: 1 })).body).toMatchObject({ id, versao: 2 });
    // Someone saving on top of version 1 again would undo version 2.
    expect((await author.req('PUT', `/api/mapas/${id}`, { dados: tinyMap(), baseVersao: 1 })).body).toEqual({ erro: 'versao_desatualizada', atual: 2 });

    const versoes = (await author.req('GET', `/api/mapas/${id}/versoes`)).body.versoes;
    expect(versoes.map((v: { versao: number; atual: boolean }) => [v.versao, v.atual])).toEqual([[2, true], [1, false]]);
    expect(versoes[0].drawCalls).toBeGreaterThan(0);
    const old = await fetch(`${author.base}/api/mapas/${id}/versoes/1`);
    expect(old.headers.get('cache-control')).toContain('immutable');
    expect(((await old.json()) as MapData).pecas[1].p).toEqual([2, 0, 3]);

    expect((await author.req('POST', `/api/mapas/${id}/restaurar`, { versao: 1 })).body).toEqual({ id, versao: 1 });
    expect((await author.req('GET', `/api/mapas/${id}`)).body.versao).toBe(1);
    // The next save comes after the newest version, on top of the restored one.
    expect((await author.req('PUT', `/api/mapas/${id}`, { dados: v2, baseVersao: 1 })).body.versao).toBe(3);
  });

  it('outros não editam nem apagam, mas duplicam; o dono apaga', async () => {
    const author = await signedIn('Dona do Mapa');
    const other = await signedIn('Vizinho');
    const { id } = (await create(author, tinyMap('Quintal'))).body;
    expect((await other.req('PUT', `/api/mapas/${id}`, { dados: tinyMap(), baseVersao: 1 })).status).toBe(403);
    expect((await other.req('DELETE', `/api/mapas/${id}`)).status).toBe(403);
    expect((await other.req('POST', `/api/mapas/${id}/restaurar`, { versao: 1 })).status).toBe(403);
    expect((await other.req('POST', `/api/mapas/${id}/ocultar`)).status).toBe(403);
    expect((await other.req('GET', `/api/mapas/${id}`)).body.pode).toEqual({ editar: false, apagar: false, ocultar: false, duplicar: true });
    expect((await other.req('GET', `/api/mapas/${id}`)).body.meu).toBe(false);

    const copy = await other.req('POST', `/api/mapas/${id}/duplicar`);
    expect(copy.status).toBe(201);
    expect((await other.req('GET', `/api/mapas/${copy.body.id}`)).body).toMatchObject({ tipo: 'comunidade', nome: 'Quintal (cópia)', autor: (await other.req('GET', '/api/perfil')).body.tag, copiaDe: id, versao: 1 });
    // The name inside the copy's data too (what the game shows).
    expect(((await (await fetch(`${other.base}/api/mapas/${copy.body.id}/versoes/1`)).json()) as MapData).nome).toBe('Quintal (cópia)');

    expect((await author.req('DELETE', `/api/mapas/${id}`)).status).toBe(204);
    expect((await author.req('GET', `/api/mapas/${id}`)).status).toBe(404);
    expect((await list(author, '?tipo=comunidade')).some((m) => m.id === id)).toBe(false);
    // The copy is its own map.
    expect((await other.req('GET', `/api/mapas/${copy.body.id}`)).status).toBe(200);
  });

  it('busca por nome ou autor e ordena por mais jogados ou mais recentes', async () => {
    const a = await signedIn('Zeferina');
    const b = await signedIn('Bartolomeu');
    const one = (await create(a, tinyMap('Labirinto Azul'))).body.id;
    const two = (await create(b, tinyMap('Labirinto Verde'))).body.id;
    const three = (await create(b, tinyMap('Deserto'))).body.id;
    const ids = (ms: MapaResumo[]) => ms.map((m) => m.id);
    expect(ids(await list(a, '?q=labirinto')).sort()).toEqual([one, two].sort());
    expect(ids(await list(a, '?autor=Bartolomeu'))).toEqual([three, two]);
    const tagB = (await b.req('GET', '/api/perfil')).body.tag as string;
    expect(ids(await list(a, `?autor=${encodeURIComponent(tagB)}&q=deser`))).toEqual([three]);
    // A play from offline counts once per account an hour.
    for (let i = 0; i < 3; i++) expect((await a.req('POST', `/api/mapas/${one}/jogadas`)).status).toBe(204);
    await b.req('POST', `/api/mapas/${one}/jogadas`);
    expect((await a.req('GET', `/api/mapas/${one}`)).body.jogadas).toBe(2);
    expect(ids(await list(a, '?q=labirinto&ordem=jogados'))).toEqual([one, two]);
    expect(ids(await list(a, '?q=labirinto&ordem=recentes'))).toEqual([two, one]);
    // Anyone, signed in or not, sees the lists.
    expect(ids(await list(new Browser(game), '?q=labirinto&ordem=jogados'))).toEqual([one, two]);
  });

  it('mapa oculto pela equipe some da lista e não abre partida; o autor ainda o vê', async () => {
    const author = await signedIn('Polemico');
    const mod = await signedIn('Moderadora');
    await promote(mod, 'moderador');
    const other = await signedIn('Passante');
    const { id } = (await create(author, tinyMap('Mapa Feio'))).body;
    expect((await mod.req('POST', `/api/mapas/${id}/ocultar`, { motivo: 'ofensivo' })).status).toBe(204);
    expect((await list(other, '?q=Mapa%20Feio')).length).toBe(0);
    expect((await other.req('GET', `/api/mapas/${id}`)).body).toEqual({ erro: 'mapa_oculto' });
    expect((await author.req('GET', `/api/mapas/${id}`)).body.oculto).toMatchObject({ motivo: 'ofensivo' });
    // With ?ocultos=1 the staff finds it in the list (to show it again); for anyone else the parameter changes nothing.
    expect((await list(mod, '?q=Mapa%20Feio&ocultos=1')).map((m) => [m.id, m.oculto?.motivo])).toEqual([[id, 'ofensivo']]);
    expect(await list(mod, '?q=Mapa%20Feio')).toEqual([]);
    expect(await list(other, '?q=Mapa%20Feio&ocultos=1')).toEqual([]);
    expect(await list(author, '?q=Mapa%20Feio&ocultos=1')).toEqual([]);
    expect(await list(new Browser(game), '?q=Mapa%20Feio&ocultos=1')).toEqual([]);
    const p = await Player.connect(game, await other.ticket());
    p.send({ t: 'hello' });
    await p.next('welcome');
    p.send({ t: 'play', map: id, mode: 'mata-mata' });
    expect((await p.next('error')).message).toBe('Esse mapa não está disponível.');
    expect((await mod.req('DELETE', `/api/mapas/${id}/ocultar`)).status).toBe(204);
    expect((await list(other, '?q=Mapa%20Feio')).map((m) => m.id)).toEqual([id]);
    expect((await enterMap(p, id)).session.map).toBe(id);
    p.close();
    // The staff deletes any map.
    expect((await mod.req('DELETE', `/api/mapas/${id}`)).status).toBe(204);
  });
});

describe('nome da cópia', () => {
  it('"Nome (cópia)", cortando o original para caber nos 60 caracteres', () => {
    expect(copyName('Quintal')).toBe('Quintal (cópia)');
    const long = copyName('x'.repeat(60));
    expect(long).toHaveLength(60);
    expect(long.endsWith('x (cópia)')).toBe(true);
  });
});

describe('quem salva o quê', () => {
  it('user não salva como oficial; admin e moderador salvam e editam os oficiais', async () => {
    const user = await signedIn('Pretensioso');
    expect((await create(user, tinyMap('Oficial Falso'), 'oficial')).body).toEqual({ erro: 'sem_permissao' });
    expect((await user.req('PUT', '/api/mapas/rua', { dados: tinyMap(), baseVersao: 1 })).status).toBe(403);
    const admin = await signedIn('Curadora');
    await promote(admin, 'admin');
    const made = await create(admin, tinyMap('Arena Oficial'), 'oficial');
    expect(made.status).toBe(201);
    expect((await admin.req('GET', `/api/mapas/${made.body.id}`)).body).toMatchObject({ tipo: 'oficial', pode: { editar: true, ocultar: true } });
    expect((await list(user, '?tipo=oficial')).map((m) => m.id)).toContain(made.body.id);
    expect((await new Browser(game).req('POST', '/api/mapas', { dados: tinyMap() })).status).toBe(401);
  });

  it('os 4 oficiais originais não são apagados nem ocultados por ninguém, mas são editados e restaurados; um oficial novo, sim (P44, P45)', async () => {
    const admin = await signedIn('Zeladora');
    await promote(admin, 'admin');
    const mod = await signedIn('Vigia');
    await promote(mod, 'moderador');
    for (const id of ['rua', 'jardim', 'halloween', 'cemiterio']) {
      for (const who of [admin, mod]) {
        const r = await who.req('DELETE', `/api/mapas/${id}`);
        expect(r.status).toBe(403);
        expect(r.body).toEqual({ erro: 'mapa_protegido' });
        const h = await who.req('POST', `/api/mapas/${id}/ocultar`, { motivo: 'teste' });
        expect(h.status).toBe(403);
        expect(h.body).toEqual({ erro: 'mapa_protegido' });
      }
      const seen = (await admin.req('GET', `/api/mapas/${id}`)).body as MapaResumo;
      expect(seen.pode).toMatchObject({ editar: true, apagar: false, ocultar: false });
      expect(seen.oculto).toBeNull();
    }
    // Still there and playable.
    expect((await list(admin, '?tipo=oficial')).map((m) => m.id)).toEqual(expect.arrayContaining(['rua', 'jardim', 'halloween', 'cemiterio']));
    // Still edited and restored: a new version of the street, then back to the one it had.
    const rua = (await admin.req('GET', '/api/mapas/rua')).body as MapaResumo;
    const data = (await admin.req('GET', `/api/mapas/rua/versoes/${rua.versao}`)).body as MapData;
    const saved = await admin.req('PUT', '/api/mapas/rua', { dados: data, baseVersao: rua.versao });
    expect(saved.status).toBe(200);
    expect((await mod.req('POST', '/api/mapas/rua/restaurar', { versao: rua.versao })).body).toEqual({ id: 'rua', versao: rua.versao });
    // A player gets the plain refusal (it isn't theirs to edit at all).
    expect((await (await signedIn('Curioso')).req('DELETE', '/api/mapas/rua')).body).toEqual({ erro: 'sem_permissao' });
    // An official map made later can be deleted by the staff.
    const made = await create(admin, tinyMap('Arena Temporária'), 'oficial');
    expect((await mod.req('GET', `/api/mapas/${made.body.id}`)).body.pode).toMatchObject({ apagar: true, ocultar: true });
    expect((await mod.req('POST', `/api/mapas/${made.body.id}/ocultar`)).status).toBe(204);
    expect((await mod.req('DELETE', `/api/mapas/${made.body.id}`)).status).toBe(204);
  });
});

describe('mapas recusados', () => {
  it('dados inválidos: mapa_invalido com os erros', async () => {
    const b = await signedIn('Desastrado');
    const bad = { ...tinyMap(), pecas: [{ id: 'x', tipo: 'nave-espacial', params: {} }] };
    const r = await create(b, bad as unknown as MapData);
    expect(r.status).toBe(400);
    expect(r.body.erro).toBe('mapa_invalido');
    expect(r.body.erros).toContain('pecas[0].tipo: desconhecido "nave-espacial"');
    // A model from anywhere else, or one never sent.
    const outside = { ...tinyMap(), arquivos: [{ id: 'm', url: 'https://outro-site.com/x.glb' }], pecas: [...tinyMap().pecas, { id: 'g', tipo: 'glb', p: [0, 0, 0] as [number, number, number], params: { arquivo: 'm' } }] };
    expect((await create(b, outside)).body.erro).toBe('mapa_invalido');
    const unknown = { ...outside, arquivos: [{ id: 'm', url: `/api/mapas/arquivos/${'0'.repeat(64)}.glb` }] };
    expect((await create(b, unknown)).body.erros[0]).toContain('não foi enviado');
  });

  it('acima do orçamento de desenho não salva e diz o que passou', async () => {
    const b = await signedIn('Exagerado');
    const heavy = { ...tinyMap('Pesado'), pecas: [...tinyMap().pecas, { id: 'bola', tipo: 'forma', params: { geo: 'esfera', args: [4, 1000, 500], ops: [['translate', 0, 4, 4]], superficie: 'pintura' } }] };
    const r = await create(b, heavy as MapData);
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ erro: 'orcamento_excedido', limite: MAP_BUDGET, excedeu: ['triangulos'] });
    expect(r.body.triangulos).toBeGreaterThan(MAP_BUDGET.triangulos);
  });
});

describe('modelos GLB', () => {
  it('envia, guarda pelo SHA-256 uma vez só, baixa e um mapa usa', async () => {
    const b = await signedIn('Modeladora');
    const bytes = await doghouse();
    const up = await upload(b, bytes);
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({ bytes: bytes.length, triangulos: 132, primitivas: 4 });
    expect(up.body.url).toBe(`/api/mapas/arquivos/${up.body.sha256}.glb`);
    expect((await upload(b, bytes)).body.sha256).toBe(up.body.sha256);
    const rows = await game.deps.db.query('SELECT original_name FROM map_asset WHERE sha256 = $1', [up.body.sha256]);
    expect(rows.rows).toEqual([{ original_name: 'casinha.glb' }]);

    const got = await fetch(`${b.base}${up.body.url}`);
    expect(got.headers.get('content-type')).toBe('model/gltf-binary');
    expect(got.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(bytes);
    expect((await fetch(`${b.base}/api/mapas/arquivos/${'f'.repeat(64)}.glb`)).status).toBe(404);

    const withModel: MapData = { ...tinyMap('Com Casinha'), arquivos: [{ id: 'casinha', url: up.body.url, sha256: up.body.sha256 }], pecas: [...tinyMap().pecas, { id: 'casa', tipo: 'glb', p: [-4, 0, -4], params: { arquivo: 'casinha' } }] };
    const saved = await create(b, withModel);
    expect(saved.status).toBe(201);
    const assets = await game.deps.db.query('SELECT sha256 FROM map_version_asset WHERE map_id = $1', [saved.body.id]);
    expect(assets.rows).toEqual([{ sha256: up.body.sha256 }]);
  });

  it('recusa arquivo grande demais, quebrado, com URI externa ou no tipo errado', async () => {
    const b = await signedIn('Hacker');
    const big = await upload(b, new Uint8Array(10 * 1024 * 1024 + 1));
    expect(big).toEqual({ status: 413, body: { erro: 'arquivo_grande_demais', limite: 10 * 1024 * 1024 } });
    const junk = await upload(b, new Uint8Array(64));
    expect(junk.body).toEqual({ erro: 'glb_invalido', motivo: 'não é um arquivo .glb' });
    const external = await upload(b, glbOf({ asset: { version: '2.0' }, buffers: [{ uri: 'https://outro-site.com/dados.bin', byteLength: 4 }] }));
    expect(external.body).toEqual({ erro: 'glb_invalido', motivo: 'o modelo aponta para um arquivo fora dele' });
    const draco = await upload(b, glbOf({ asset: { version: '2.0' }, extensionsUsed: ['KHR_draco_mesh_compression'] }));
    expect(draco.body.motivo).toBe('extensão não aceita: KHR_draco_mesh_compression');
    expect((await upload(b, await doghouse(), 'application/octet-stream')).body.erro).toBe('glb_invalido');
    expect((await new Browser(game).req('POST', '/api/mapas/arquivos')).status).toBe(401);
  });
});

describe('mapas oficiais no servidor', () => {
  it('a versão 1 dos 4 oficiais é a dos JSON: montada do que a API entrega, igual ao golden', async () => {
    const b = new Browser(game);
    const oficiais = await list(b, '?tipo=oficial');
    for (const id of OFFICIAL) expect(oficiais.find((m) => m.id === id)).toMatchObject({ autor: null, tipo: 'oficial' });
    expect(oficiais.find((m) => m.id === 'cemiterio')?.exclusivo).toBe('zumbi');
    for (const slug of OFFICIAL) {
      const data = (await (await fetch(`${b.base}/api/mapas/${slug}/versoes/1`)).json()) as MapData;
      const golden = (await Bun.file(goldenPath(slug)).json()) as MapSnapshot;
      const fresh = summarize(slug, await buildHeadless((physics, scene) => buildMapFromData(data, { physics, scene, renderer: fakeRenderer, sfx: silentSfx, modo: 'jogo' })));
      expect({ slug, diff: compareSnapshots(golden, fresh, 1e-6) }).toEqual({ slug, diff: [] });
    }
    const nav = await game.deps.db.query("SELECT octet_length(navmesh) AS n FROM map_version WHERE map_id = 'cemiterio' AND version = 1");
    expect(nav.rows[0].n).toBe((await Bun.file(`${ROOT}/shared/data/navmesh/cemiterio.json`).json()).bytes);
  }, 120_000);

  it('versões são imutáveis no banco', async () => {
    await expect(game.deps.db.query("UPDATE map_version SET format = 2 WHERE map_id = 'rua'")).rejects.toThrow('imutável');
  });
});
