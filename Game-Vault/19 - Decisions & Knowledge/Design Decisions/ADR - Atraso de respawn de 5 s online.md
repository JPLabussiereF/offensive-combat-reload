---
title: ADR - Atraso de respawn de 5 s online
type: decision
status: documented
area: design
source_paths:
  - shared/protocol.ts
  - server/session.ts
  - client/main.ts
  - client/ai/bots.ts
  - client/entities/localPlayer.ts
tags:
  - game
  - decision
  - respawn
updated: 2026-10-05
---

# ADR - Atraso de respawn de 5 s online

## Contexto

Depois do abate, o corpo da vítima fica oprimível por 6 s (`HUMILIATION.window`), e a dança dura 3,2 s ([[Humiliation]]).

## Problema

Com um respawn curto, a vítima voltaria ao jogo antes de ver alguém dançando sobre o próprio corpo, e a provocação perderia o público.

## Opções consideradas

- Respawn curto, como o de 3 s do treino (`RESPAWN_DELAY` em `client/entities/localPlayer.ts`).
- Respawn de 5 s no mata-mata livre.

## Decisão

`NET.respawnDelay = 5` no online. O modo contra bots copia o valor (`RESPAWN = 5`). O treino continua com 3 s.

## Motivo

Comentário em `shared/protocol.ts`: *"Free-for-all respawn delay (long enough to watch your own humiliation)."*

## Consequências

- A tela de morte mostra o contador e, se alguém dançar no corpo, "{nome} 💃 OPRIMIDO!" ([[Flow - Death and Respawn]]).
- O servidor recusa pedidos de respawn feitos antes de 4,75 s. O cliente espera 5,3 s e reenvia o pedido se for recusado ([[Respawn]]).
- O valor está **duplicado**: `NET.respawnDelay` (online), `RESPAWN` em `client/ai/bots.ts` e `player.respawnDelay = 5` em `client/main.ts` (contra bots). Mudar um não muda os outros ([[Technical Debt]]).

## Código afetado

- `shared/protocol.ts` (`NET.respawnDelay`, `NET.corpseWindow`)
- `server/session.ts` (`case 'respawn'`, `join`)
- `client/main.ts` (`player.respawnDelay`)
- `client/ai/bots.ts` (`RESPAWN`)

Relacionado: [[Respawn]] · [[Free For All]] · [[Player Experience]]
