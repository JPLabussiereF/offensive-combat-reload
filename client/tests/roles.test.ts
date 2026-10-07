// The staff rules (shared/roles.ts), the same on the server (every request) and on the Management screen: an
// admin does anything, a moderator anything but acting on an admin or making someone an admin, a player
// nothing; nobody punishes themselves and the last admin stays.
import { describe, expect, it } from 'bun:test';
import { isEquipe, PAPEIS, podeAgirSobre, podeConceder, podePromover, podePunir, podeRebaixar, type Conta } from '@shared/roles';

const admin: Conta = { id: 'a1', papeis: ['admin'] };
const admin2: Conta = { id: 'a2', papeis: ['admin', 'moderador'] };
const mod: Conta = { id: 'm1', papeis: ['moderador'] };
const mod2: Conta = { id: 'm2', papeis: ['moderador'] };
const user: Conta = { id: 'u1', papeis: [] };
const user2: Conta = { id: 'u2', papeis: [] };

describe('papéis', () => {
  it('equipe é admin ou moderador', () => {
    expect([admin, admin2, mod, user].map(isEquipe)).toEqual([true, true, true, false]);
  });

  it('agir sobre a conta: admin sobre todos, moderador sobre quem não é admin, user sobre ninguém', () => {
    const alvos = [admin, admin2, mod, mod2, user, user2];
    expect(alvos.map((a) => podeAgirSobre(admin, a))).toEqual([true, true, true, true, true, true]);
    expect(alvos.map((a) => podeAgirSobre(mod, a))).toEqual([false, false, true, true, true, true]);
    expect(alvos.map((a) => podeAgirSobre(user, a))).toEqual([false, false, false, false, false, false]);
  });

  it('ninguém se pune; o moderador pune moderadores e users, nunca admins', () => {
    expect(podePunir(admin, admin)).toBe(false);
    expect(podePunir(mod, mod)).toBe(false);
    expect(podePunir(admin, admin2)).toBe(true);
    expect(podePunir(mod, mod2)).toBe(true);
    expect(podePunir(mod, user)).toBe(true);
    expect(podePunir(mod, admin)).toBe(false);
    expect(podePunir(user, user2)).toBe(false);
  });

  it('conceder: admin qualquer papel, moderador só moderador, user nenhum', () => {
    expect(PAPEIS.map((p) => podeConceder(admin, p))).toEqual([true, true]);
    expect(PAPEIS.map((p) => podeConceder(mod, p))).toEqual([false, true]);
    expect(PAPEIS.map((p) => podeConceder(user, p))).toEqual([false, false]);
  });

  it('promover: o moderador faz moderador, nunca admin, e não mexe em admin', () => {
    expect(podePromover(mod, user, 'moderador')).toBe(true);
    expect(podePromover(mod, user, 'admin')).toBe(false);
    expect(podePromover(mod, admin, 'moderador')).toBe(false);
    expect(podePromover(admin, user, 'admin')).toBe(true);
    expect(podePromover(user, user2, 'moderador')).toBe(false);
  });

  it('rebaixar: não remove o último admin; o moderador não tira o papel de um admin', () => {
    expect(podeRebaixar(admin, admin2, 'admin', 2)).toBe(true);
    expect(podeRebaixar(admin, admin, 'admin', 1)).toBe(false);
    expect(podeRebaixar(admin, admin, 'admin', 2)).toBe(true);
    expect(podeRebaixar(admin, mod, 'moderador', 1)).toBe(true);
    expect(podeRebaixar(mod, mod2, 'moderador', 1)).toBe(true);
    expect(podeRebaixar(mod, admin2, 'moderador', 2)).toBe(false);
    expect(podeRebaixar(mod, admin2, 'admin', 2)).toBe(false);
  });
});
