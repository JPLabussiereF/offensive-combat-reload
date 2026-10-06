---
title: Scenario - Login, bloqueio e recuperação de senha
type: reference
status: documented
area: testing
source_paths:
  - server/tests/auth.test.ts
  - server/auth/password.ts
  - server/email.ts
tags:
  - testes
  - cenario
  - autenticacao
updated: 2026-10-05
---

# Scenario - Login, bloqueio e recuperação de senha

**Objetivo:** garantir que o login não revela quais e-mails existem, resiste a força bruta e que a recuperação de senha é de uso único e encerra sessões antigas.

**Arquivo:** `server/tests/auth.test.ts`. Regras em [[Authentication]].

## Login e limites

| Caso | Passos | Esperado |
| --- | --- | --- |
| Mesmo erro para senha errada e e-mail inexistente | Login com senha errada de conta real e com e-mail inventado | Ambos `401 { erro: 'credenciais_invalidas' }`, corpos idênticos |
| Limite por IP | 6 logins no mesmo minuto do mesmo `Browser` (mesmo IP) | 5× 401, 6º **429** |
| Bloqueio da conta | 10 senhas erradas, **cada uma de um IP diferente**; depois a senha certa | A senha certa ainda recebe `401 credenciais_invalidas` (bloqueio de 15 min, mensagem genérica) |

## Recuperação de senha

| Passo | Ação | Esperado |
| --- | --- | --- |
| 1 | Dono cadastra; outro navegador pede `POST /api/auth/recuperar` | 204 |
| 2 | Teste lê o link `#redefinir=<token>` do `outbox` | e-mail presente |
| 3 | `POST /api/auth/redefinir` com o token e senha nova | 204 |
| 4 | Repete com o mesmo token | `token_invalido` (uso único) |
| 5 | Dono (sessão antiga) chama `GET /api/me` | **401** — sessões revogadas |
| 6 | Login com a senha nova | 204 |
| 7 | Consulta `email_verified_at` | preenchido (o link provou a caixa de entrada) |

Segundo caso: pedido para e-mail inexistente responde 204; 5 pedidos para a mesma conta geram só **3** e-mails no `outbox`.

## Código relacionado

- `server/tests/auth.test.ts`
- `server/auth/password.ts` (`LIMITS`, `login`, `requestReset`, `resetPassword`), `server/email.ts` (`outbox`)

Ver também: [[Integration Tests]], [[Anti Exploit]].
