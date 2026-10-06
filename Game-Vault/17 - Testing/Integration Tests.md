---
title: Integration Tests
type: system
status: documented
area: testing
source_paths:
  - server/tests/helpers.ts
  - server/tests/preload.ts
  - server/tests/env.ts
  - server/tests/auth.test.ts
  - server/tests/game.test.ts
  - server/tests/appearance.test.ts
  - server/app.ts
tags:
  - testes
  - integracao
updated: 2026-10-05
---

# Integration Tests

Os testes de servidor sobem um **servidor de jogo real** (`startServer` de `server/app.ts`) numa porta livre, contra **PostgreSQL e Redis reais** (banco `oc_teste`, Redis db 1), e falam com ele pela rede como um navegador falaria. Não há mocks de banco nem de Redis.

## Infraestrutura de teste (`server/tests/helpers.ts`)

| Peça | Papel |
| --- | --- |
| `startTestServer()` | `startServer({ port: 0, host: '127.0.0.1', databaseUrl, redisUrl, jobs: false })` — um por arquivo (`beforeAll`), fechado no `afterAll`. Jobs desligados; testes chamam `anonymizeExpired` diretamente quando precisam. |
| `Browser` | "Navegador mínimo": guarda cookies (pote de cookies a partir de `Set-Cookie`), manda `Origin` (o próprio site por padrão, ou outro para simular ataque) e um **IP próprio** em `X-Forwarded-For` (`uniqueIp()`, faixa `10.9.x.x`) para os limites por IP não vazarem entre testes. Atalhos `register()` e `ticket()`. |
| `Player` | Conexão WebSocket que grava todas as mensagens; `next(tipo, filtro, timeout)` espera/consome uma mensagem; `waitClose()` devolve o código de fechamento. |
| `Player.refusal()` | Envia o pedido de *upgrade* manualmente via `fetch` para ler o **status HTTP** da recusa (um WebSocket só veria o código 1002). |
| `uniqueEmail()` | E-mails únicos por execução. |
| `outbox` (`server/email.ts`) | Sem SMTP, os e-mails ficam em memória — os testes leem o link de recuperação dali. |
| `game.deps` | Acesso direto a `db` e `redis` para preparar estado (ex.: expirar ticket com `pexpire`, envelhecer `deletion_requested_at`). |

Como o servidor confia em `X-Forwarded-For` só vindo de endereço privado, e os testes conectam por `127.0.0.1`, o IP simulado é aceito (ver `clientIp` em `server/http.ts`).

## O que é coberto

### `auth.test.ts` — contas por HTTP

- Cadastro cria conta e sessão e mostra `Nome#1234`.
- Cookie `HttpOnly` + `SameSite=Lax`; `Secure` só com `X-Forwarded-Proto: https`.
- Mesmo erro para senha errada e e-mail inexistente; login correto.
- 6ª tentativa no mesmo minuto do mesmo IP → 429; bloqueio da conta após 10 falhas.
- Validação de e-mail, senha e nome; e-mail repetido (maiúsculas) → `email_em_uso`.
- Sair revoga a sessão (cópia antiga do cookie não vale); cookie forjado recusado; pedido de outro site → `403 origem_invalida` (inclusive sem `Origin`).
- Recuperação de senha e limite de 3 e-mails/hora — ver [[Scenario - Login, bloqueio e recuperação de senha]].
- Perfil: número `#1234` não se repete para o mesmo nome; primeira troca de nome livre, segunda antes de 7 dias → `cooldown_nome`; não equipa nível bloqueado.
- Exclusão de conta — ver [[Scenario - Exclusão de conta e anonimização]].

### `game.test.ts` — conexão de jogo

- Ticket do WebSocket — ver [[Scenario - Ticket do WebSocket]].
- Conexão nova derruba a antiga (`4002`); sair da conta encerra a partida (`4001`); banimento encerra a partida e bloqueia a API.
- Mapas: cada mapa tem uma sala fixa (`principal`/`rua`, `jardim`, `halloween`); sala criada leva o mapa; mapa desconhecido cai em `rua`.
- Chat: chega a todos já limpo; quem manda rápido demais é segurado; silenciar/dessilenciar vale na partida em andamento.
- Vaga por mapa: `GET /api/sessoes` lista as salas dos três mapas sem conexão de jogo; com 10 jogadores na `halloween`, abre "Vila Assombrada 2" vazia, que fecha quando um sai.
- Regras de partida — ver [[Gameplay Tests]].

### `appearance.test.ts` — blocos "perfil" e "no online"

- Perfil começa com aparência padrão, salva e devolve validada; trocar o sexo mantém cabelo e roupas.
- Online: todos veem a aparência de quem entra; o corpo mantém a aparência; o biotipo "gordo" tem a mesma vida.

## Execução

`bun test` (local, com `docker compose up -d banco redis`) ou CI ([[CI CD]]). O preload apaga e recria o banco de teste a cada execução, então os testes não dependem de estado anterior.

## Código relacionado

- `server/tests/helpers.ts`, `server/tests/preload.ts`, `server/tests/env.ts`
- `server/tests/auth.test.ts`, `server/tests/game.test.ts`, `server/tests/appearance.test.ts`

Ver também: [[Testing Overview]], [[Authentication]], [[APIs]].
