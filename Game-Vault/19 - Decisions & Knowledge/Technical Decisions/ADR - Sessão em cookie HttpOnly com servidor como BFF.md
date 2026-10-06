---
title: ADR - Sessão em cookie HttpOnly com servidor como BFF
type: decision
status: documented
area: security
source_paths:
  - server/auth/sessions.ts
  - server/http.ts
  - client/net/api.ts
  - server/tests/auth.test.ts
tags:
  - adr
  - auth
  - seguranca
updated: 2026-10-05
---

# ADR - Sessão em cookie HttpOnly com servidor como BFF

## Contexto

O jogo precisa manter o jogador logado no navegador por longos períodos e autenticar a API e a abertura do WebSocket.

## Problema

Tokens acessíveis por JavaScript (ex.: JWT em `localStorage`) podem vazar por XSS.

## Opções consideradas

Não listadas explicitamente; o comentário contrasta com "a token it could leak to scripts".

## Decisão

Sessão opaca: 32 bytes aleatórios num cookie `oc_sessao` `HttpOnly; SameSite=Lax` (`Secure` em HTTPS), 30 dias deslizantes; o banco guarda só o SHA-256. "The server itself plays the BFF role: the browser never holds a token it could leak to scripts" (`server/auth/sessions.ts`). Mudanças de estado exigem `Origin` do próprio site. O WebSocket usa um ticket curto derivado da sessão ([[ADR - Ticket de uso único para o WebSocket]]).

## Motivo

Segurança contra roubo de token e revogação imediata (sessão no banco + canal Redis).

## Consequências

- Página, API e WS precisam da **mesma origem** (proxy do Vite em dev, nginx em produção) ou de `ORIGENS_PERMITIDAS`.
- Em `http://` (Radmin/LAN) o cookie não é `Secure`.
- Cada requisição autenticada consulta o banco.

## Código afetado

`server/auth/sessions.ts`, `server/http.ts`, `server/api.ts`, `client/net/api.ts`. Ver [[Authentication]].
