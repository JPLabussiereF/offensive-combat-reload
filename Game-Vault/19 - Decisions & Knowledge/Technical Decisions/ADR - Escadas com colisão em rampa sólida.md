---
title: ADR - Escadas com colisão em rampa sólida
type: decision
status: documented
area: world
source_paths:
  - client/world/mapBuilder.ts
  - shared/constants.ts
  - docs/MAPAS.md
tags:
  - decision
  - physics
  - level-design
updated: 2026-10-05
---

# ADR - Escadas com colisão em rampa sólida

## Contexto

Os mapas têm muitas escadas (casas, torre, terraços, esgoto). O jogador é um cilindro controlado pelo character controller do Rapier, com degrau automático de até 0,4 m e rampa máxima de 45° (`MOVE`).

## Problema

- Degraus colidindo um a um dependem do *autostep*, que "é pouco confiável em degraus encostados em paredes" (comentário de `mapBuilder.ts`): o jogador enganchava nos espelhos.
- Uma rampa fina deixava um vão embaixo da escada, onde jogadores podiam se enfiar e atirar de dentro.
- Lances curtos ficam íngremes (> 45°) e os bots não sobem.

## Opções consideradas

1. Colisão por degrau (descartada: engancha).
2. Rampa fina (descartada: vão embaixo).
3. Cunha sólida (escolhida).

## Decisão

`MapBuilder.stairs` desenha os degraus (0,3 m × 0,38 m) só como visual e cria **um colisor convexo em cunha**, do pé do primeiro degrau até a quina do último, sólido até o chão; o último degrau é o patamar. Com `gentle: true`, lances curtos ganham degraus extras para ficar abaixo de 45°.

## Motivo

Subir e descer fica suave, nunca engancha, e o espaço sob a escada é maciço como parece.

## Consequências

- Nada pode ficar embaixo de uma escada (é sólido).
- Quem usa `stairRun(altura)` obtém o comprimento real; escadas curtas devem usar `stairRun(altura, true)` com `gentle`.
- Paredes ao lado de escadas devem ficar coladas à lateral (correções do commit `0fac263`).

## Código afetado

- `client/world/mapBuilder.ts` — `stairs`, `STEP_H`, `STEP_D`, `stairSteps`, `stairRun`.
- Todos os mapas em código. Ver [[Map Design Rules]], [[Movement]], [[Navigation]].
