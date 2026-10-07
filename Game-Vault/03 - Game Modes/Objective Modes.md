---
title: Objective Modes
type: mode
status: unknown
area: game-modes
source_paths:
  - client/ui/home.ts
  - shared/protocol.ts
  - server/session.ts
  - shared/maps.ts
  - docs/MAPAS.md
  - shared/data/mapas/halloween.json
tags:
  - game
  - modes
  - stub
updated: 2026-10-06
---

# Objective Modes

> [!important] Não existe no código atual
> Não há modos de objetivo (captura de bandeira, dominação de zonas, bomba, rei da colina, escolta etc.). Isso foi verificado em `client/ui/home.ts` (modos `online`, `bots` e `offline`), em `shared/protocol.ts` (nenhuma mensagem de objetivo, zona ou bandeira) e em `server/session.ts`, e com buscas por `capture`, `bandeira`, `flag` (fora das flags de animação `FLAG`), `objetivo` e `zona` no código.

## O que existe no lugar

- O único "objetivo" de partida é **pontuar** no mata-mata livre ([[Free For All]], [[Scoring]]).
- Os mapas têm **objetivos secundários opcionais**, não ligados a um modo: coletar a cereja e o biscoito, abater carpas e o rato gigante, beber a poção da bruxa, derrubar os alvos do parque. Eles dão bônus temporários ou XP de conta. Ver [[Objectives]].
- Os "segredos" dos mapas estão **planejados**: o código diz que os objetos contam o que aconteceu (`activations`, `rings`, `stirs`…) como "base para os segredos do documento de design" (`docs/MAPAS.md`; seção 23 citada em `client/world/conversao/halloween.ts`). Ver [[Map Gags]].

> [!info] Inferência
> Nenhum comentário ou documento no repositório menciona a intenção de criar modos de objetivo. O roadmap do README (Fase 2) cita só arsenal, ragdoll, bots online e fim de partida.

Para documentar um modo de objetivo quando ele existir, use o [[Mode Template]].

## Notas relacionadas

[[Game Modes Index]] · [[Objectives]] · [[Team Deathmatch]] · [[Interactive Objects]]
