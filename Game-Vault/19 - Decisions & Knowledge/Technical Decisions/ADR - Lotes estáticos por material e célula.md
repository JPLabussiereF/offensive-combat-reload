---
title: ADR - Lotes estáticos por material e célula
type: decision
status: documented
area: performance
source_paths:
  - client/world/mapBuilder.ts
  - shared/data/mapas/jardim.json
  - client/world/gltfMap.ts
tags:
  - adr
  - performance
  - mapas
updated: 2026-10-06
---

# ADR - Lotes estáticos por material e célula

## Contexto

Os mapas são montados por código (e por glTF) a partir de milhares de peças.

## Problema

Uma draw call por peça; desenhar o mapa inteiro sempre.

## Opções consideradas

Um lote por material para o mapa todo (sem culling) vs. lotes por célula. O comentário do Jardim compara células de 40 m e 45 m.

## Decisão

`MapBuilder` funde geometria estática por (material, célula de 40 m, configurável por mapa), com cor por vértice para que um material por superfície baste; colisores simples criados uma vez. O Jardim do Dragão usa 45 m.

## Motivo

`mapBuilder.ts`: "few draw calls, and cells outside the camera are frustum-culled instead of drawing the whole map every frame". O antigo `dragonGarden.ts` (comentário hoje em `client/world/conversao/jardim.ts`; a célula é `ambiente.celula` no JSON do mapa): 40 m cortava a propriedade em 16 pedaços, "doubling the draw calls".

## Consequências

- Peças em lote não se movem; adereços animados são meshes separados.
- Escolha do tamanho da célula é por mapa e empírica (sem métrica registrada).

## Código afetado

`client/world/mapBuilder.ts`, mapas em `client/world/*`. Ver [[GPU]] e [[World Structure]].
