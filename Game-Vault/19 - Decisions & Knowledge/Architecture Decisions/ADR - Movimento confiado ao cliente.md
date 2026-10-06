---
title: ADR - Movimento confiado ao cliente
type: decision
status: documented
area: networking
source_paths:
  - server/session.ts
  - shared/movement.ts
  - client/main.ts
  - README.md
tags:
  - decision
  - networking
  - authority
updated: 2026-10-05
---

# ADR - Movimento confiado ao cliente

## Contexto
Primeira versão online (seção 14 do plano). O servidor roda em Bun sem Rapier e sem a geometria dos mapas; o cliente já tem o controlador em primeira pessoa completo (Rapier, 60 Hz).

## Problema
Simular o movimento de cada jogador no servidor exige rodar física e colisões de cada mapa no servidor, mais predição e reconciliação no cliente.

## Opções consideradas
- Servidor simulando o movimento (autoritativo) com predição/reconciliação no cliente — registrado como "próxima etapa".
- **Cliente envia a posição** (20 Hz) e o servidor a aceita, validando apenas as ações que dependem dela.

## Decisão
O movimento é confiado ao cliente: `state` é aceito se os números forem finitos (pitch limitado a ±1,6 rad). Comentário em `server/session.ts`: *"Movement is trusted"*. O respawn também usa a posição escolhida pelo cliente.

## Motivo
Entregar o online sem portar a física para o servidor. `shared/movement.ts` já foi escrito como função pura "shared between client prediction and (later) the authoritative server", preparando a migração.

## Consequências
- Sem correção de posição: experiência local fluida, sem *rubber-banding*.
- *Speed hack*, teleporte e *noclip* não são detectados; validações de acerto/itens usam essa posição confiada ([[Problem - Lacunas de validação de gameplay online]]).
- Bots online dependem de simulação no servidor e por isso não existem ([[Versus Bots]]).

## Código afetado
`server/session.ts` (`case 'state'`, `case 'respawn'`), `client/main.ts` (envio de `state`), `shared/movement.ts`. Ver [[Client Server Model]], [[Synchronization]], [[Anti Cheat]].
