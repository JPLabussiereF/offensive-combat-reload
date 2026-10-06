---
title: ADR - Toon shading com rampa de 3 tons
type: decision
status: documented
area: rendering
source_paths:
  - client/render/materials.ts
  - client/world/surfaces.ts
  - client/world/gltfMap.ts
  - client/character/material.ts
tags:
  - adr
  - rendering
  - art
updated: 2026-10-05
---

# ADR - Toon shading com rampa de 3 tons

## Contexto

O jogo tem visual cartunesco e precisa rodar em GPUs fracas (ver [[Art Direction]] e [[Performance Rendering]]).

## Problema

Escolher um modelo de iluminação barato e coerente com a direção de arte para mapa, props e armas.

## Opções consideradas

- `MeshToonMaterial` com rampa própria (escolhida para mapa, props e armas).
- `MeshStandardMaterial` com flat shading (usada só nos personagens, por indicação do guia de estilo de personagens, segundo `client/character/material.ts`).

> [!info]
> O código não registra outras alternativas avaliadas.

## Decisão

Uma `DataTexture` 3×1 em `RedFormat` com valores `[95, 175, 255]` e filtro `Nearest` (`toonGradient()`), compartilhada por todos os `MeshToonMaterial` do jogo: superfícies (`surfaceMaterial`), props (`toon`), armas, materiais convertidos de glTF (`toToon`).

## Motivo

Comentário em `materials.ts`: "3-tone ramp: cheap cartoon shading that matches the art direction (section 2)".

## Consequências

- Visual em faixas, sem degradê suave; quase-preto vira silhueta (por isso o pelo da cachorra é `0x35323c`, não preto).
- Faces de costas para o sol ainda recebem luz (half-Lambert, segundo `renderer.ts`), o que causou *shadow acne* e exigiu [[ADR - Sombras ignoradas em faces de costas para o sol]].
- Personagens (standard) e cenário (toon) têm modelos de luz diferentes na mesma cena.

## Código afetado

- `client/render/materials.ts` (`toonGradient`, `toon`)
- `client/world/surfaces.ts`, `client/world/gltfMap.ts`, `client/render/viewmodel.ts`, `client/entities/heldWeapons.ts`

Ver [[Materials]].
