---
title: ADR - Personagem bakeado em um mesh com LOD
type: decision
status: documented
area: rendering
source_paths:
  - client/character/character.ts
  - client/character/builder.ts
  - client/character/material.ts
  - client/entities/avatar.ts
  - docs/PERSONAGENS.md
tags:
  - adr
  - rendering
  - characters
  - performance
updated: 2026-10-05
---

# ADR - Personagem bakeado em um mesh com LOD

## Contexto

Um personagem modular tem corpo + até dezenas de peças (roupas, cabelo, acessórios), cada uma com material próprio para tints e regiões escondidas.

## Problema

Em partida, isso daria dezenas de draw calls por personagem, e triângulos escondidos sob roupas seriam desenhados.

## Opções consideradas

- Personagem "vivo" com uma malha por peça (mantido no editor).
- Bake num único `SkinnedMesh` com cores nos vértices, em 3 níveis de detalhe (escolhida para o jogo).

## Decisão

`Character.bake()`: funde tudo em um `SkinnedMesh` por nível, cores finais nos vértices (célula × tint × AO), sem triângulos escondidos, material único compartilhado (`bakedMaterial`); `THREE.LOD` com níveis a 0, 20 e 45 m, histerese de 10%; níveis distantes regenerados com menos detalhe (`withLod`). Morphs das mãos ficam vivos. Qualquer mudança desfaz o bake.

## Motivo

Comentário de `character.ts`: "bake() merges everything into one SkinnedMesh with vertex colors (other players: 1 draw call + weapons)". LOD exigido pelo guia de estilo (LOD1, LOD2).

## Consequências

- 1 draw call por personagem + armas; 3,5–4,5 mil triângulos (doc).
- Trocar roupa em jogo custa um re-bake.
- Peças GLB usam a mesma malha nos três níveis até terem LOD próprio.

## Código afetado

- `client/character/character.ts` (`bake`, `unbake`, `lodProxy`, `LOD_DISTANCES`)
- `client/character/builder.ts` (`withLod`, `lodSegments`)
- `client/entities/avatar.ts`

Ver [[Character Models]] e [[Performance Rendering]].
