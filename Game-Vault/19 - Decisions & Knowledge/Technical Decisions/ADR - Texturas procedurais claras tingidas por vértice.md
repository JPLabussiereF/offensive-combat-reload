---
title: ADR - Texturas procedurais claras tingidas por vértice
type: decision
status: documented
area: art
source_paths:
  - client/world/textures.ts
  - client/world/surfaces.ts
  - public/textures/manifest.json
  - docs/MAPAS.md
tags:
  - adr
  - textures
  - art
updated: 2026-10-05
---

# ADR - Texturas procedurais claras tingidas por vértice

## Contexto

Não há arte final de texturas. O jogo precisava de superfícies com cara "pintada à mão" desde já, e de um caminho para trocar por arte real.

## Problema

Uma textura por combinação de cor e material multiplicaria arquivos, memória e materiais.

## Opções consideradas

- Arquivos de imagem por cor (descartado implicitamente).
- Cor lisa sem textura (mantido só para `pintura`).
- Textura procedural clara em canvas + tint por vértice, substituível por arquivo via manifesto (escolhida).

## Decisão

19 pintores em canvas 512² (`textures.ts`), em tons claros de cinza; a cor de cada peça vem do tint por vértice multiplicado. `public/textures/manifest.json` troca qualquer superfície por arquivo (`.png/.jpg/.webp/.ktx2`), com `tingir: false` para texturas já coloridas.

## Motivo

Comentário de `textures.ts`: "Painted mostly in light values so the per-vertex tint supplies the hue: one brick texture serves red, yellow or white brick walls. [...] Real art replaces these through public/textures/manifest.json without touching code."

## Consequências

- ~16 MB de textura para o mapa todo (estimativa do doc).
- Custo de CPU no carregamento (mitigado pelo ruído em pattern).
- Arte real precisa ser clara/cinza ou usar `tingir: false`.
- Hoje nenhuma substituição está ativa.

## Código afetado

- `client/world/textures.ts`, `client/world/surfaces.ts` (`loadTextureOverrides`)

Ver [[Procedural Textures]] e [[Texture System]].
