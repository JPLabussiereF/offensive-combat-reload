---
title: Reference Images
type: reference
status: unknown
area: art
source_paths:
  - client/dev/characterLab.ts
  - docs/PERSONAGENS.md
tags:
  - game
  - art
  - references
updated: 2026-10-05
---

# Reference Images

> [!warning] Não existe no repositório
> Nenhuma imagem de referência (concept art, moodboard, prints) está versionada. Verificado listando `public/`, `docs/` e `tools/`: os únicos arquivos visuais são `public/icon.svg` e dois `.glb` de exemplo.

## O que é citado mas não está no repositório

- **"Guia de Estilo de Personagens — Jogo FPS"**: citado em `docs/PERSONAGENS.md` e em vários comentários de `client/character/` (orçamentos, paleta, LOD, rosto).
- **Documento de design** (seções 2, 3, 4, 8, 10): citado em `textures.ts`, `materials.ts`, `quality.ts`, `effects.ts`, `docs/MAPAS.md`.
- **Referências de personagem**: o laboratório (`client/dev/characterLab.ts`) existe para "comparar com as referências" lado a lado, mas as referências em si não estão aqui.

## Como gerar imagens de referência do estado atual

- Laboratório de personagens (`/tools/lab-personagens.html` em `bun run dev`): fileiras de visuais, grades por categoria, fichas de inspeção de 5 ângulos. Ver [[Asset Pipeline]].
- Preview de mapas glTF: `?mapa=/maps/<arquivo>.glb`.

## Ver também

[[Art Direction]] · [[Documentation Status]]
