// The Management API (/api/gestao, PF-6): the matrix of roles (a moderator never acts on an admin nor makes
// anyone an admin; an admin gives and takes any role; the last admin stays; nobody punishes themselves), and a
// change to someone who is playing reaching their running match: a ban closes the connection, a mute and new
// progress arrive at once. Every action is in the audit trail with the staff member as its actor.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { ContaGestao, ContaResumo } from '@shared/account';
import { CLOSE } from '@shared/protocol';
import type { GameServer } from '../app';
import { accountOf, Browser, enterMap, Player, promote, sleep, startTestServer } from './helpers';

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

/** A signed-in account with a role. */
async function staff(name: string, papel: 'admin' | 'moderador') {
  const b = await signedIn(name);
  await promote(b, papel);
  return b;
}

/** Plays the street with the account's game connection. */
async function playing(b: Browser) {
  const p = await Player.connect(game, await b.ticket());
  p.send({ t: 'hello' });
  const welcome = await p.next('welcome');
  const joined = await enterMap(p, 'rua');
  return { p, welcome, joined };
}

const tagOf = async (b: Browser) => (await b.req('GET', '/api/perfil')).body.tag as string;

describe('quem entra no Gerenciamento', () => {
  it('só admin e moderador; o /api/me diz os papéis', async () => {
    expect((await new Browser(game).req('GET', '/api/gestao/contas')).status).toBe(401);
    const user = await signedIn('Curioso');
    expect((await user.req('GET', '/api/gestao/contas')).body).toEqual({ erro: 'sem_permissao' });
    expect((await user.req('GET', '/api/me')).body.papeis).toEqual([]);
    const mod = await staff('Vigia', 'moderador');
    expect((await mod.req('GET', '/api/me')).body.papeis).toEqual(['moderador']);
    expect((await mod.req('GET', '/api/gestao/contas')).status).toBe(200);
  });

  it('o papel tirado vale na hora (os papéis são lidos a cada pedido)', async () => {
    const mod = await staff('Breve', 'moderador');
    expect((await mod.req('GET', '/api/gestao/contas')).status).toBe(200);
    await game.deps.db.query('DELETE FROM account_role WHERE account_id = $1', [await accountOf(mod)]);
    expect((await mod.req('GET', '/api/gestao/contas')).status).toBe(403);
  });

  it('busca por nome e por tag, e mostra o que quem pergunta pode fazer', async () => {
    const mod = await staff('Buscador', 'moderador');
    const alvo = await signedIn('Procurado Raro');
    const admin = await staff('Chefona', 'admin');
    const byName = (await mod.req('GET', '/api/gestao/contas?q=Procurado%20Ra')).body.contas as ContaResumo[];
    expect(byName.map((c) => c.tag)).toEqual([await tagOf(alvo)]);
    const tag = await tagOf(admin);
    const byTag = (await mod.req('GET', `/api/gestao/contas?q=${encodeURIComponent(tag)}`)).body.contas as ContaResumo[];
    expect(byTag).toHaveLength(1);
    expect(byTag[0].papeis).toEqual(['admin']);
    // A moderator sees an admin's account but may do nothing to it.
    const seen = (await mod.req('GET', `/api/gestao/contas/${byTag[0].id}`)).body as ContaGestao;
    expect(seen.permissoes).toEqual({ editar: false, punir: false, conceder: [], remover: [] });
    const user = (await mod.req('GET', `/api/gestao/contas/${byName[0].id}`)).body as ContaGestao;
    expect(user.permissoes).toEqual({ editar: true, punir: true, conceder: ['moderador'], remover: [] });
    expect((await mod.req('GET', '/api/gestao/contas/00000000-0000-0000-0000-000000000000')).status).toBe(404);
  });
});

describe('matriz de papéis', () => {
  it('o moderador pune, edita e promove a moderador um user, mas não mexe em admin nem promove a admin', async () => {
    const mod = await staff('Xerife', 'moderador');
    const modId = await accountOf(mod);
    const user = await signedIn('Novato');
    const userId = await accountOf(user);
    const admin = await staff('Rainha', 'admin');
    const adminId = await accountOf(admin);

    expect((await mod.req('POST', `/api/gestao/contas/${userId}/sancoes`, { tipo: 'silencio', motivo: 'spam', duracao: '1h' })).status).toBe(201);
    expect((await mod.req('DELETE', `/api/gestao/contas/${userId}/sancoes/silencio`)).body).toEqual({ revogadas: 1 });
    expect((await mod.req('PATCH', `/api/gestao/contas/${userId}`, { nome: 'Renomeado' })).body.tag).toMatch(/^Renomeado#\d{4}$/);
    expect((await mod.req('PUT', `/api/gestao/contas/${userId}/papeis/moderador`)).body).toEqual({ papeis: ['moderador'] });
    expect((await mod.req('DELETE', `/api/gestao/contas/${userId}/papeis/moderador`)).body).toEqual({ papeis: [] });

    // Never an admin.
    expect((await mod.req('PUT', `/api/gestao/contas/${userId}/papeis/admin`)).status).toBe(403);
    expect((await mod.req('PATCH', `/api/gestao/contas/${adminId}`, { nome: 'Rebaixada' })).status).toBe(403);
    expect((await mod.req('POST', `/api/gestao/contas/${adminId}/sancoes`, { tipo: 'banimento', motivo: 'golpe', duracao: '1d' })).status).toBe(403);
    expect((await mod.req('DELETE', `/api/gestao/contas/${adminId}/papeis/admin`)).status).toBe(403);
    expect((await mod.req('PUT', `/api/gestao/contas/${adminId}/papeis/moderador`)).status).toBe(403);
    // Nobody punishes themselves.
    expect((await mod.req('POST', `/api/gestao/contas/${modId}/sancoes`, { tipo: 'silencio', motivo: 'eu', duracao: '1h' })).status).toBe(403);
    expect((await admin.req('POST', `/api/gestao/contas/${adminId}/sancoes`, { tipo: 'silencio', motivo: 'eu', duracao: '1h' })).status).toBe(403);
    // A user is no staff at all.
    expect((await user.req('POST', `/api/gestao/contas/${modId}/sancoes`, { tipo: 'silencio', motivo: 'vingança', duracao: '1h' })).status).toBe(403);
    // Bad requests change nothing.
    expect((await mod.req('POST', `/api/gestao/contas/${userId}/sancoes`, { tipo: 'exilio', motivo: 'x', duracao: '1h' })).status).toBe(400);
    expect((await mod.req('POST', `/api/gestao/contas/${userId}/sancoes`, { tipo: 'silencio', motivo: 'x', duracao: 'amanhã' })).status).toBe(400);
    expect((await mod.req('PATCH', `/api/gestao/contas/${userId}`, { nome: 'x', xp: 10 })).body).toEqual({ erro: 'nome_invalido' });
  });

  it('o admin concede e tira admin; o último admin fica', async () => {
    const admin = await staff('Imperatriz', 'admin');
    const adminId = await accountOf(admin);
    // Only this one is an admin now (other test files made some).
    await game.deps.db.query("DELETE FROM account_role WHERE role = 'admin' AND account_id <> $1", [adminId]);
    expect((await admin.req('DELETE', `/api/gestao/contas/${adminId}/papeis/admin`)).body).toEqual({ erro: 'sem_permissao', motivo: 'ultimo_admin' });

    const other = await signedIn('Herdeiro');
    const otherId = await accountOf(other);
    expect((await admin.req('PUT', `/api/gestao/contas/${otherId}/papeis/admin`)).body).toEqual({ papeis: ['admin'] });
    // Two admins: one may step down.
    expect((await admin.req('DELETE', `/api/gestao/contas/${adminId}/papeis/admin`)).body).toEqual({ papeis: [] });
    expect((await admin.req('GET', '/api/gestao/contas')).status).toBe(403);
    expect((await other.req('DELETE', `/api/gestao/contas/${otherId}/papeis/admin`)).body.motivo).toBe('ultimo_admin');
  });

  it('o nome trocado pela equipe não espera, e a espera do jogador recomeça a partir da troca', async () => {
    const mod = await staff('Cartorio', 'moderador');
    const user = await signedIn('Primeiro');
    const userId = await accountOf(user);
    // The player's own free change, then the waiting time; the staff changes it anyway.
    expect((await user.req('PATCH', '/api/perfil', { nome: 'Segundo' })).status).toBe(200);
    expect((await user.req('PATCH', '/api/perfil', { nome: 'Terceiro' })).body.erro).toBe('cooldown_nome');
    expect((await mod.req('PATCH', `/api/gestao/contas/${userId}`, { nome: 'Quarto' })).status).toBe(200);
    expect((await mod.req('PATCH', `/api/gestao/contas/${userId}`, { nome: 'Sexto' })).status).toBe(200);
    expect((await user.req('GET', '/api/perfil')).body.nome).toBe('Sexto');

    // A player who never used the free change: after the staff's change, 7 days from it.
    const fresh = await signedIn('Ofensivo');
    const freshId = await accountOf(fresh);
    const before = Date.now();
    expect((await mod.req('PATCH', `/api/gestao/contas/${freshId}`, { nome: 'Educado' })).status).toBe(200);
    const refused = await fresh.req('PATCH', '/api/perfil', { nome: 'Ofensivo' });
    expect(refused.body.erro).toBe('cooldown_nome');
    const until = Date.parse(refused.body.liberaEm);
    expect(until - before).toBeGreaterThanOrEqual(7 * 86400_000 - 5000);
    expect(until - before).toBeLessThanOrEqual(7 * 86400_000 + 60_000);
    expect((await fresh.req('GET', '/api/perfil')).body.nome).toBe('Educado');
  });
});

describe('na partida em andamento', () => {
  it('banimento derruba a conexão e grava quem baniu', async () => {
    const mod = await staff('Juiz', 'moderador');
    const modId = await accountOf(mod);
    const user = await signedIn('Infrator');
    const userId = await accountOf(user);
    const { p } = await playing(user);
    const r = await mod.req('POST', `/api/gestao/contas/${userId}/sancoes`, { tipo: 'banimento', motivo: 'trapaça', duracao: '7d' });
    expect(r.status).toBe(201);
    expect(typeof r.body.ate).toBe('string');
    expect(await p.waitClose()).toBe(CLOSE.revoked);
    expect((await user.req('GET', '/api/me')).status).toBe(401);
    const audit = await game.deps.db.query("SELECT actor_id FROM auth_event WHERE account_id = $1 AND type = 'ban'", [userId]);
    expect(audit.rows).toEqual([{ actor_id: modId }]);
    const details = (await mod.req('GET', `/api/gestao/contas/${userId}`)).body as ContaGestao;
    expect(details.banida).toBe(true);
    expect(details.sancoes[0]).toMatchObject({ tipo: 'banimento', motivo: 'trapaça', por: await tagOf(mod) });
    expect((await mod.req('DELETE', `/api/gestao/contas/${userId}/sancoes/banimento`)).body).toEqual({ revogadas: 1 });
  });

  it('silêncio e progresso chegam à partida em andamento', async () => {
    const mod = await staff('Bedel', 'moderador');
    const user = await signedIn('Tagarela');
    const userId = await accountOf(user);
    const { p } = await playing(user);
    await mod.req('POST', `/api/gestao/contas/${userId}/sancoes`, { tipo: 'silencio', motivo: 'palavrão', duracao: '30m' });
    await sleep(200);
    p.send({ t: 'chat', text: 'oi' });
    expect((await p.next('chatRefused')).reason).toBe('muted');

    const r = await mod.req('PATCH', `/api/gestao/contas/${userId}`, { xp: 5000, armas: { pistola: 1500 } });
    expect(r.status).toBe(200);
    expect(r.body.xp).toBe(5000);
    const prog = await p.next('progresso', (m) => m.conta.xp === 5000);
    expect(prog.armas.pistola.xp).toBe(1500);
    expect(prog.conta.nivel).toBeGreaterThan(1);
    // What the match writes on leaving adds to the new numbers, it doesn't undo them.
    p.send({ t: 'leave' });
    await sleep(300);
    expect((await user.req('GET', '/api/perfil')).body.armas.pistola.xp).toBe(1500);
    p.close();
  });
});
