---
title: ADR - Altura e biotipo apenas visuais
type: decision
status: documented
area: design
source_paths:
  - shared/appearance.ts
  - client/main.ts
  - README.md
tags:
  - game
  - decision
  - fairness
  - character
updated: 2026-10-05
---

# ADR - Altura e biotipo apenas visuais

## Contexto

O editor de personagem permite escolher a altura (Pequeno, Médio, Alto) e o biotipo (Magro, Médio, Gordo), além do modo PCD (membros ausentes). Ver [[Character Customization]].

## Problema

Na versão anterior (antes do commit `68a2b32`, de 2026-10-01, "Remodel characters…"), a altura escalava o corpo e as hitboxes (0,9 / 1 / 1,1), e o biotipo Gordo dava **+50 de vida** (`gordoExtraHealth: 50`) com tronco 30% mais largo. Uma escolha cosmética virava vantagem ou desvantagem competitiva.

## Opções consideradas

- Manter os efeitos (vida extra, hitbox e altura dos olhos por corpo), como ainda descreve a tabela do README.
- Tornar altura e biotipo **só visuais** e manter efeitos só no modo PCD.

## Decisão

`bodyStats` (`shared/appearance.ts`) devolve **vida máxima 100 para todos**. A altura só muda a **escala visual** (0,96 / 1 / 1,04), nunca a hitbox nem os olhos. Só o modo PCD muda o jogo: o membro ausente fica sem hitbox, a recarga fica ×1,3 sem braço ou mão, e a velocidade ×0,75 sem perna.

## Motivo

Comentário em `shared/appearance.ts`: *"Visual only (style guide): the hitbox and the eye use the standard height, or the shortest body would be the meta."* E em `client/main.ts`: *"Height and build are looks: the eye, the hitboxes and the health are the same for everyone (style guide)."*

## Consequências

- Reforça o pilar de **justiça competitiva** ([[Core Pillars]], [[Game Rules]]).
- A escala visual foi mantida pequena para o corpo visto continuar perto da hitbox.
- **A documentação humana ficou desatualizada:** a tabela do `README.md` ("O que muda no jogo") ainda diz que Gordo tem 150 de vida e que a altura escala as hitboxes e a visão (1,49 / 1,65 / 1,81 m). **O código vale mais que o README.**

## Código afetado

- `shared/appearance.ts` (`EFFECTS`, `bodyStats`, `hitboxSize`)
- `client/main.ts` (vida e corpo do jogador local)
- `server/session.ts` (`bodyStats` define a vida máxima online)

Relacionado: [[Character Customization]] · [[Health System]] · [[Game Rules]]
