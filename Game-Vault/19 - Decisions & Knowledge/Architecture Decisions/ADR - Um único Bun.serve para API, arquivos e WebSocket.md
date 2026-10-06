---
title: ADR - Um único Bun.serve para API, arquivos e WebSocket
type: decision
status: documented
area: backend
source_paths:
  - server/app.ts
  - server/index.ts
  - server/session.ts
  - README.md
tags:
  - adr
  - backend
  - bun
updated: 2026-10-05
---

# ADR - Um único Bun.serve para API, arquivos e WebSocket

## Contexto

O servidor precisa de API de contas, WebSocket de partida e (sem nginx) entrega dos arquivos do jogo.

## Problema

Separar em vários processos/serviços aumentaria a complexidade de hospedagem para um projeto auto-hospedado.

## Opções consideradas

Não registradas no código. O `README.md` só registra a escolha ("Decisões desta fase").

## Decisão

"O servidor roda no Bun: um único `Bun.serve` atende a API, os arquivos e o WebSocket nativo. Cada sessão é um tópico do pub/sub do Bun, então o snapshot de cada tick é serializado uma vez por sala" (`README.md`). `startServer()` em `server/app.ts` é uma função, para que os testes subam seus próprios servidores.

## Motivo

Simplicidade (uma porta, um processo) e desempenho de broadcast (pub/sub nativo). Senhas com `Bun.password` (Argon2id) sem dependência extra.

## Consequências

- Uma instância por implantação; estado de partida em memória (ver [[Problem - Estado das partidas só em memória de um processo]]).
- Mesma origem para página, API e WS facilita cookie e checagem de `Origin`.
- Testes de integração triviais de montar ([[Integration Tests]]).

## Código afetado

`server/app.ts`, `server/index.ts`, `server/session.ts`. Ver [[Backend Overview]].
