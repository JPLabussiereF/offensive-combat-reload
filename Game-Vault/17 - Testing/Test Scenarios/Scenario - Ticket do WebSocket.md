---
title: Scenario - Ticket do WebSocket
type: reference
status: documented
area: testing
source_paths:
  - server/tests/game.test.ts
  - server/tests/helpers.ts
  - server/api.ts
  - server/app.ts
tags:
  - testes
  - cenario
  - websocket
  - seguranca
updated: 2026-10-05
---

# Scenario - Ticket do WebSocket

**Objetivo:** garantir que só uma conta autenticada, a partir do próprio site, abre a conexão de jogo, e que o ticket não pode ser reaproveitado.

**Arquivo:** `server/tests/game.test.ts`, bloco `describe('ticket do WebSocket')`. Regras em [[Authentication]].

| # | Caso (`it`) | Passos | Resultado esperado |
| --- | --- | --- | --- |
| 1 | vale uma vez só | Conta nova → `POST /api/ws-ticket` → conecta; tenta conectar de novo com o mesmo ticket | 1ª conexão abre; 2ª é recusada; `Player.refusal` devolve **401** |
| 2 | vence em 30 s | Pega ticket; força expiração com `redis.pexpire(ticketKey(ticket), 1)` | Handshake → **401** |
| 3 | recusa handshake vindo de outro site | Handshake com `Origin: http://site-malicioso.com` | **403**; o ticket **não** foi gasto: a conexão com a origem certa ainda entra |
| 4 | não gasta o ticket com um GET comum | `fetch` simples em `/ws?ticket=...` (sem upgrade) | **426**; o ticket continua válido |
| 5 | sem sessão não há ticket | `POST /api/ws-ticket` sem cookie | **401** |
| 6 | o nome vem da conta, não da mensagem | Conecta e envia `hello` com `name: 'Impostor'` | `welcome.name` casa com `^Honesto#\d{4}$` |

## Por que a ordem das checagens importa

O servidor (`upgrade()` em `server/app.ts`) verifica, nesta ordem: cabeçalho de upgrade → `Origin` → formato do ticket → consumo atômico (`GETDEL`) → conta ativa e sem banimento. Os casos 3 e 4 confirmam que recusas **antes** do consumo não gastam o ticket.

## Código relacionado

- `server/tests/game.test.ts`, `server/tests/helpers.ts` (`Player.connect`, `Player.refusal`)
- `server/api.ts` (`TICKET_TTL_SECONDS`, `ticketKey`), `server/app.ts` (`upgrade`)

Ver também: [[Integration Tests]], [[Trust Boundaries]].
