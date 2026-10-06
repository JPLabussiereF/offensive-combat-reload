---
title: Team Deathmatch
type: mode
status: unknown
area: game-modes
source_paths:
  - shared/protocol.ts
  - server/session.ts
  - client/main.ts
  - client/world/gameMap.ts
  - shared/data/mapas/rua.json
  - shared/data/mapas/jardim.json
  - client/world/gltfMap.ts
  - client/render/materials.ts
  - client/character/palette.ts
  - docs/MAPAS.md
tags:
  - game
  - modes
  - stub
updated: 2026-10-06
---

# Team Deathmatch

> [!important] Não existe no código atual
> Não há modo de mata-mata em equipe. Isso foi verificado em `shared/protocol.ts` (`PlayerInfo`, `SessionInfo` e as mensagens não têm campo de time), em `server/session.ts` (todo dano entre jogadores é aceito, sem checagem de time ou de fogo amigo), em `client/ui/home.ts` (só existem `online`, `bots` e `offline`) e com buscas por `team`, `equipe` e `time A/B` no código. Todos os modos existentes são **todos contra todos** ou treino. Ver [[Free For All]].

## O que existe que lembra times

Existe **infraestrutura de dados e arte** que sugere times planejados, mas nenhuma regra usa isso:

| Elemento | Onde | Uso atual |
| --- | --- | --- |
| `spawnsA` / `spawnsB` (pontos de nascimento por lado) | `shared/data/mapas/rua.json` (`spawns.a` a oeste, x≈−38; `spawns.b` a leste, x≈38), `shared/data/mapas/jardim.json`, `client/world/gltfMap.ts` | `spawnsA` é usado **só no treino**; `spawnsB` não é usado por nenhum modo |
| Convenção glTF `SPAWN_A_*`, `SPAWN_B_*`, `SPAWN_FFA_*` | `docs/MAPAS.md`, `client/world/gltfMap.ts` | sem `SPAWN_FFA_*`, o mata-mata livre usa A + B juntos |
| Cores `teamA` (laranja `#ff7a1a`) e `teamB` (azul `#2f9bff`) | `client/render/materials.ts` | decorativas: faixa do rifle, van de mudança, marcações e paredes nas pontas da Rua dos Vizinhos |
| Canal de cor `team` nos personagens | `client/character/palette.ts` (`TINT.team = 7`), `client/character/character.ts` | sempre a cor padrão `#e8e2d6`; nenhum código define a cor por time |

> [!info] Inferência
> A Rua dos Vizinhos tem bases opostas marcadas em laranja (oeste) e azul (leste), alinhadas com `spawnsA` e `spawnsB`. Isso indica que o mapa e o pipeline de personagens foram preparados para um modo por equipes. Não há evidência de quando ou se ele será implementado.

## Se o modo for implementado

Pontos que o código atual precisaria ganhar (lista derivada da arquitetura, não de um plano):
- campo de time em `PlayerInfo` e regra de fogo amigo em `server/session.ts` (`onHit`, `onStab`, `onBoom`);
- nascimento por lado (`spawnsA`/`spawnsB`) no lugar de `spawnsFFA` ([[Respawn]], [[Spawn Design]]);
- placar agrupado por time ([[Scoreboard]]) e cor de time no canal `team` ([[Character Customization]]);
- condição de vitória (hoje não existe nem no mata-mata livre: [[Problem - Partidas sem fim]]).

Preencher seguindo o [[Mode Template]].

## Notas relacionadas

[[Game Modes Index]] · [[Free For All]] · [[Objective Modes]] · [[Spawn Design]]
