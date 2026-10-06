---
title: ADR - Itens do mapa com autoridade do servidor
type: decision
status: documented
area: networking
source_paths:
  - server/session.ts
  - shared/maps.ts
  - shared/constants.ts
  - client/main.ts
  - server/tests/game.test.ts
tags:
  - decision
  - networking
  - pickups
updated: 2026-10-05
---

# ADR - Itens do mapa com autoridade do servidor

## Contexto
Os mapas têm coletáveis e criaturas com efeito de jogo: biscoito (vida cheia) e cereja (vida máxima extra), carpas (XP de conta, carpa dourada melhora a mira), ratos gigantes (humanidade = vida máxima extra) e a poção da bruxa (efeito sorteado).

## Problema
Evitar que dois jogadores peguem o mesmo item, que um cliente pegue à distância ou repita o efeito, e que quem entra depois veja o estado errado.

## Opções consideradas
- Cliente decide e avisa os outros (só cosmético, como `prop`).
- **Servidor guarda o estado e decide**; cliente só pede.

## Decisão
`Session` mantém `pickups`, `fish`, `rats` (com `ready` em tempo do servidor) e `potionReady` por jogador. O cliente envia `pickup`/`fish`/`rat`/`potion`; o servidor confere existência, disponibilidade, vivo e proximidade (`PICKUP_SLACK` 1,5 m, 2 m vertical, ou alcance próprio), aplica o efeito, sorteia a poção e difunde. `joined` envia o que ainda está voltando.

## Motivo
Efeitos alteram vida e XP, que são autoridade do servidor ([[Client Server Model]]).

## Consequências
- Consistente para todos; testado em `game.test.ts` (cereja, carpa, rato, poção, biscoito).
- Proximidade usa a posição confiada do cliente ([[ADR - Movimento confiado ao cliente]]).

## Código afetado
`server/session.ts` (`onPickup`, `onFish`, `onRat`, `onPotion`), `shared/maps.ts`, `client/main.ts`. Ver [[Pickups]], [[Buffs & Debuffs]], [[Map Gags]].
