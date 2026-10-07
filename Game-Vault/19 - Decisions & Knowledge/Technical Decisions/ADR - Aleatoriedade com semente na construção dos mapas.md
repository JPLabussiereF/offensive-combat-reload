---
title: ADR - Aleatoriedade com semente na construção dos mapas
type: decision
status: documented
area: world
source_paths:
  - client/world/oriental.ts
  - shared/mapData.ts
  - client/world/mapLoader.ts
  - client/world/conversao/recorder.ts
  - client/world/conversao/halloween.ts
  - client/world/jardim/kit.ts
  - docs/MAPAS.md
tags:
  - decision
  - determinism
  - multiplayer
updated: 2026-10-06
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

Comentários: "Same seed on every client: rocks, trees and bamboo collide identically online" (antigo `dragonGarden.ts`, hoje em `client/world/conversao/jardim.ts`) e "trees, rocks and tombstones collide identically online" (antigo `hauntedTown.ts`, hoje em `client/world/conversao/halloween.ts`).

## Revisão (2026-10-06, PF-6 fase 1): uma semente por peça

Com os mapas virando dados ([[ADR - Mapas como dados com catálogo de peças]]), a sequência única do mapa foi **fatiada por peça**: cada peça que sorteia guarda o estado do gerador de onde começa (Peca.semente; `seeded()` passou a expor `.state`, sem mudar os números). O carregador monta cada peça com `seeded(peca.semente)`, então os números de uma peça não dependem mais das peças antes dela. Na conversão, os scripts (client/world/conversao/) rodaram o gerador do mapa inteiro na ordem antiga e gravaram o estado no início de cada peça: o resultado é idêntico ao de antes (conferido pelo golden). As carpas do Jardim guardam a semente própria (4242). O truque 
owhere da Vila continua no script de conversão: a árvore escondida consome os seus números e não vira peça.

## Consequências

- Antes da PF-6: mudar a ordem das chamadas que consumiam a semente movia todos os objetos seguintes. Desde a PF-6, mover, apagar ou reordenar peças não mexe nas outras; só mudar o adaptador de um tipo (o que ele sorteia) muda as peças desse tipo.
- Clientes com versões diferentes do código podem ter colisão diferente (inferência).
- `Math.random` continua permitido para o que é só visual/sonoro (ex.: intervalo de passarinhos).

## Código afetado

- `client/world/oriental.ts` — `seeded`.
- `shared/mapData.ts` (`Peca.semente`), `client/world/mapLoader.ts` (`runPiece`: `seeded(peca.semente)`), `client/world/conversao/recorder.ts` (grava o estado antes de cada peça).
- `client/world/conversao/halloween.ts` (`nowhere`, `clearOf`), `client/world/jardim/kit.ts` (`Ctx.rand`).
- Ver [[Map Design Rules]].
