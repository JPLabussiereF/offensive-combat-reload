---
title: ADR - Ticket de uso único para o WebSocket
type: decision
status: documented
area: security
source_paths:
  - server/api.ts
  - server/app.ts
  - client/net/connection.ts
  - server/tests/game.test.ts
tags:
  - decision
  - security
  - networking
updated: 2026-10-05
---

# ADR - Ticket de uso único para o WebSocket

## Contexto
A sessão de login é um cookie `HttpOnly` que o JavaScript não lê. O navegador não permite cabeçalhos de autenticação no `new WebSocket()` (comentário em `client/net/connection.ts`).

## Problema
Autenticar o WebSocket sem expor um token de longa duração na URL (que pode aparecer em logs de proxy/servidor).

## Opções consideradas
- Confiar só no cookie no handshake (vulnerável a *cross-site WebSocket hijacking* sem checagem de origem).
- Token de longa duração na query string.
- **Ticket curto de uso único** emitido pela API autenticada.

## Decisão
`POST /api/ws-ticket` (cookie + sem banimento + conta não em exclusão) gera 32 bytes aleatórios; o Redis guarda `ws:ticket:<sha256>` → id da conta com TTL **30 s**. O handshake `/ws?ticket=` checa `Upgrade` e `Origin` **antes** de consumir o ticket com `GETDEL` atômico.

## Motivo
"Atomic and single use: a ticket seen in a log is already spent" (`server/app.ts`). Um GET comum não gasta o ticket.

## Consequências
- Cada conexão exige uma chamada REST antes; reconectar exige novo ticket.
- Depende do Redis estar no ar para jogar online.
- Testado em `game.test.ts` (uso único, expiração, origem, GET comum, sem sessão).

## Código afetado
`server/api.ts` (`ticketKey`, `TICKET_TTL_SECONDS`), `server/app.ts` (`upgrade`), `client/net/connection.ts` (`Connection.open`). Ver [[Sessions]], [[Anti Exploit]].
