---
title: Problem - Bundle JavaScript único de ~5 MB
type: problem
status: partial
area: performance
source_paths:
  - vite.config.ts
  - docs/DEPLOY.md
  - client/main.ts
tags:
  - problem
  - performance
  - carregamento
updated: 2026-10-05
---

# Problem - Bundle JavaScript único de ~5 MB

## Sintoma

Primeiro acesso baixa todo o JavaScript do jogo antes de mostrar a home. `docs/DEPLOY.md`: "o JavaScript de ~5 MB vai com ~1,8 MB" (gzip).

## Causa

O cliente é importado estaticamente a partir de `client/main.ts` (os três mapas, editor de personagem, catálogo, áudio procedural, bots, etc.) e o `vite.config.ts` eleva `chunkSizeWarningLimit` para 6000 KB em vez de dividir o código. Não há `import()` dinâmico por mapa ou modo (verificado por busca em `client/`).

## Métrica

Só a citação de ~5 MB / ~1,8 MB do `docs/DEPLOY.md`; tamanho exato do build atual não medido nesta documentação (`unknown`).

## Mitigação atual

gzip no nginx e cache de 1 ano em `/assets/` (visitas seguintes não baixam de novo). Ver [[Loading Performance]].

## Possível solução (não implementada)

Carregar cada mapa, o editor de personagem e os bots sob demanda (`import()`), já que o mapa só é montado após a escolha na home.

## Código relacionado

`vite.config.ts`, `client/main.ts`, `deploy/nginx/*.conf`.
