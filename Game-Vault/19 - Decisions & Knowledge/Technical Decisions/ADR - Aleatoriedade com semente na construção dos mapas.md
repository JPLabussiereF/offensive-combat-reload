---
title: ADR - Aleatoriedade com semente na construção dos mapas
type: decision
status: documented
area: world
source_paths:
  - client/world/oriental.ts
  - client/world/dragonGarden.ts
  - client/world/hauntedTown.ts
  - client/world/jardim/kit.ts
  - docs/MAPAS.md
tags:
  - decision
  - determinism
  - multiplayer
updated: 2026-10-05
---

# ADR - Aleatoriedade com semente na construção dos mapas

## Contexto

Os mapas são montados no cliente; o servidor não conhece a geometria ([[World Structure]]). Pedras, árvores, bambus, lápides e poções são espalhados com variação aleatória.

## Problema

Com `Math.random`, cada cliente teria colisores em lugares diferentes: um jogador poderia se esconder atrás de uma pedra que, para o outro, está em outro lugar.

## Opções consideradas

Não registradas. Alternativas óbvias seriam posições fixas escritas à mão ou geometria vinda do servidor.

## Decisão

Toda variação que afeta colisão usa `seeded(semente)` (`oriental.ts`), nunca `Math.random` (`docs/MAPAS.md`). Sementes: Jardim 8128, carpas 4242, Vila 1031. Para remover um objeto sem mudar os seguintes, a Vila ainda consome os números do objeto, mas o constrói num `MapBuilder` falso que descarta tudo (`nowhere`: a árvore em frente à placa da bruxa).

## Motivo

Comentários: "Same seed on every client: rocks, trees and bamboo collide identically online" (`dragonGarden.ts`) e "trees, rocks and tombstones collide identically online" (`hauntedTown.ts`).

## Consequências

- Mudar a ordem das chamadas que consomem a semente move todos os objetos seguintes; edições precisam preservar a sequência.
- Clientes com versões diferentes do código podem ter colisão diferente (inferência).
- `Math.random` continua permitido para o que é só visual/sonoro (ex.: intervalo de passarinhos).

## Código afetado

- `client/world/oriental.ts` — `seeded`.
- `client/world/dragonGarden.ts`, `client/world/hauntedTown.ts` (`nowhere`, `clearOf`), `client/world/jardim/kit.ts` (`Ctx.rand`).
- Ver [[Map Design Rules]].
