---
title: Problem - Teste de estrutura de vãos ausente
type: problem
status: documented
area: world
source_paths:
  - docs/MAPAS.md
  - client/world/mapBuilder.ts
  - client/world/gameMap.ts
  - shared/data/mapas/rua.json
  - client/tests/aimAssist.test.ts
  - client/tests/keybinds.test.ts
  - client/tests/spatial.test.ts
tags:
  - problem
  - testing
  - level-design
updated: 2026-10-06
---

# Problem - Teste de estrutura de vãos ausente

## Contexto

`docs/MAPAS.md` diz que as medidas de portas (≥ 1,6 × 2,3 m) e janelas atravessáveis são "regras que o jogo checa automaticamente" e que "o teste de estrutura passa um raio por cada vão e tenta atravessar cada porta andando". O `MapBuilder` registra todos os vãos em `map.openings` exatamente para isso ("for automated structure checks").

## Problema

O teste **não existe no repositório atual**: `map.openings` não é lido fora de `client/world/`, e `client/tests/` só contém `aimAssist.test.ts`, `keybinds.test.ts` e `spatial.test.ts`. As regras de medida dependem de revisão manual. O commit `0fac263` corrigiu à mão vários problemas de geometria da Vila Assombrada (parede aberta sob o sino, móveis na linha das portas, frestas ao lado de escadas).

## Opções consideradas

- Restaurar/criar o teste usando `map.openings` (raio por vão e travessia andando com o movimento compartilhado).
- Manter a documentação, mas marcar a checagem como manual.

## Decisão

Nenhuma registrada. Situação atual: documentação desatualizada em relação ao código.

## Motivo

Desconhecido (o teste pode ter existido fora do repositório ou nunca ter sido versionado).

## Consequências

- Mudanças em paredes podem quebrar passagens sem aviso.
- `docs/MAPAS.md` induz o leitor a confiar numa verificação que não roda (nem no CI).

## Código afetado

- `client/world/mapBuilder.ts` — `WallOpening`, `openings`.
- `client/world/gameMap.ts` — `GameMap.openings`.
- Ver [[Map Design Rules]], [[Gameplay Tests]], [[Technical Debt]].
