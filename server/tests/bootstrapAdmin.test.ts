// The first admin from the environment (ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD): made only while no
// account is admin, signs in with that e-mail and password, never touches anything once an admin exists, and
// promotes an account that already has the e-mail without changing its password.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { GameServer } from '../app';
import { bootstrapAdmin } from '../bootstrapAdmin';
import { Browser, startTestServer, uniqueEmail } from './helpers';

let game: GameServer;
beforeAll(async () => {
  game = await startTestServer();
});
afterAll(async () => {
  await game?.close();
});

/** No admin left (other test files made some). */
const noAdmins = () => game.deps.db.query("DELETE FROM account_role WHERE role = 'admin'");

async function login(email: string, senha: string) {
  const b = new Browser(game);
  const r = await b.req('POST', '/api/auth/entrar', { email, senha });
  return { b, status: r.status };
}

describe('admin inicial', () => {
  it('sem admin, cria a conta com o e-mail e a senha do ambiente, e ela entra como admin', async () => {
    await noAdmins();
    const email = uniqueEmail();
    expect(await bootstrapAdmin(game.deps.db, { email, password: 'admin' })).toBe(email);
    const { b, status } = await login(email, 'admin');
    expect(status).toBe(204);
    expect((await b.req('GET', '/api/me')).body.papeis).toEqual(['admin']);
    expect((await b.req('GET', '/api/gestao/contas')).status).toBe(200);
  });

  it('com um admin já existente, não faz nada', async () => {
    const email = uniqueEmail();
    expect(await bootstrapAdmin(game.deps.db, { email, password: 'admin' })).toBeNull();
    expect((await login(email, 'admin')).status).toBe(401);
  });

  it('o e-mail já tem conta: ganha o papel e mantém a própria senha', async () => {
    const b = new Browser(game);
    const { email, password } = await b.register('Fundadora');
    await noAdmins();
    expect(await bootstrapAdmin(game.deps.db, { email, password: 'admin' })).toBe(email);
    expect((await b.req('GET', '/api/me')).body.papeis).toEqual(['admin']);
    expect((await login(email, 'admin')).status).toBe(401);
    expect((await login(email, password)).status).toBe(204);
  });
});
