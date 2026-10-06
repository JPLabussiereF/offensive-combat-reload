---
title: ADR - Movimento em duas passadas com assentamento próprio
type: decision
status: documented
area: gameplay
source_paths:
  - shared/movement.ts
  - README.md
tags:
  - decision
  - movement
  - physics
updated: 2026-10-05
---

# ADR - Movimento em duas passadas com assentamento próprio

## Contexto

O jogador é um cilindro cinemático movido pelo `KinematicCharacterController` do Rapier ([[Movement]]). Os mapas são feitos de muitas peças de chão lado a lado e malhas triangulares.

## Problema

A abordagem anterior (velocidade vertical constante para baixo + *snap-to-ground* do Rapier) fazia o personagem tocar o chão a distância ~0 em todo tick. Nas emendas entre peças (arestas internas) isso gerava normais inclinadas: solavancos, perda do estado "no chão" e, às vezes, o controlador gastava todo o movimento horizontal no contato, **travando o jogador por um tick**.

## Opções consideradas

1. Snap-to-ground nativo do Rapier + empurrão constante para baixo (anterior).
2. Duas passadas por tick com assentamento próprio (escolhida).

## Decisão

Em `stepMovement`: (1) o movimento é feito **pairando** à altura da "pele" do controlador (`REST_HEIGHT` ≈ 3 cm), sem tocar o chão; (2) depois o personagem **assenta** no piso medido por um *shape cast* do cilindro inteiro (até `SNAP_DISTANCE` 0,35 m), com a inclinação vinda de um raio no centro. Parado no chão não há velocidade para baixo. Em rampas o deslocamento segue o plano (sem perder metade da velocidade subindo).

## Motivo

Comentários de `shared/movement.ts` e o README: "Uma varredura do mapa inteiro (260 mil ticks) caiu de 3.374 travas para 0."

## Consequências

- Movimento suave em emendas, degraus e rampas; velocidade constante subindo/descendo.
- Lógica de chão própria a manter (`probeFloor`, `REST_HEIGHT`, `SNAP_DISTANCE`); `disableSnapToGround()` é obrigatório.
- Remover o assentamento próprio ou reativar o snap nativo reintroduz as travas.

## Código afetado

`shared/movement.ts` — `stepMovement`, `probeFloor`, `configureController`, `resolveBlockerOverlaps`.
