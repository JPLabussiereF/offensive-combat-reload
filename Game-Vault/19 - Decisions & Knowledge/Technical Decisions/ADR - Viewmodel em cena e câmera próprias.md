---
title: ADR - Viewmodel em cena e câmera próprias
type: decision
status: documented
area: rendering
source_paths:
  - client/render/renderer.ts
  - client/render/viewmodel.ts
  - client/main.ts
tags:
  - adr
  - rendering
  - camera
updated: 2026-10-05
---

# ADR - Viewmodel em cena e câmera próprias

## Contexto

Em FPS, a arma em primeira pessoa fica muito perto da câmera e atravessa paredes quando o jogador encosta nelas.

## Problema

Evitar que a arma entre nas paredes e permitir um FOV de arma diferente do FOV do jogador.

## Opções consideradas

- Arma na cena do mundo (atravessa geometria).
- Cena e câmera separadas, desenhadas por cima após limpar o depth (escolhida).

## Decisão

`vmScene` + `vmCamera` (near 0,01, far 10) com luzes próprias. `render()` desenha o mundo, chama `clearDepth()` e desenha o viewmodel. FOV da arma independente: 58° (`VM_FOV`), reduzido em 10% mirando.

## Motivo

Comentários em `renderer.ts`: "Viewmodel lives in its own scene/camera so the gun never clips into walls (section 4)" e "Its own FOV (style guide: 60–70°), independent of the player's".

## Consequências

- A arma não recebe sombras nem luzes dinâmicas do mundo; as luzes do viewmodel seguem o mapa via `Atmosphere.viewmodel`.
- Traçantes e clarão precisam converter a posição do cano para o espaço do mundo (`muzzleCameraSpace`).
- O valor inicial de 62° em `renderer.ts` é sobrescrito pelos 58° de `main.ts` (inconsistência menor).

## Código afetado

- `client/render/renderer.ts`, `client/render/viewmodel.ts`, `client/main.ts`

Ver [[Camera]] e [[Weapon Models]].
