---
title: Objectives
type: mechanic
status: documented
area: gameplay
source_paths:
  - shared/constants.ts
  - shared/maps.ts
  - shared/protocol.ts
  - server/session.ts
  - client/main.ts
  - docs/MAPAS.md
  - README.md
tags:
  - game
  - gameplay
  - objectives
updated: 2026-10-05
---

# Objectives

## Objetivo de partida

> [!important] Não há objetivos de modo
> O jogo não tem bandeira, zona de controle, bomba, carga nem qualquer outro objetivo de modo. O único objetivo de partida é **pontuar** no mata-mata livre ([[Scoring]], [[Free For All]]). Também não há condição de vitória ([[Problem - Partidas sem fim]]). Ver [[Objective Modes]].

## Objetivos secundários dos mapas (opcionais)

Os mapas têm **alvos e coletáveis opcionais** que dão vantagem temporária ou XP de conta. Eles disputam a atenção com o combate: quem vai atrás deles se expõe. A tabela resume as **regras**. A apresentação fica em [[Pickups]], [[Buffs & Debuffs]] e [[Map Gags]], e o lugar de cada um nas notas dos mapas.

| Objetivo | Mapa | Como cumprir | Recompensa | Volta em | Constante |
| --- | --- | --- | --- | --- | --- |
| **Cereja do Dragão** | [[Map - Jardim do Dragão]] | passar sobre ela (raio de 1,2 m) | +50 de vida máxima por 30 s, e já cura 50 | 45 s | `CHERRY` |
| **Biscoito Scooby** | [[Map - Vila Assombrada]] | abrir o armário da cozinha (tiro ou facada) e pegar (raio de 1,1 m) | vida cheia | 60 s | `BISCUIT` |
| **Carpa** | Jardim do Dragão | abater com tiro ou faca | +1 de XP da conta (online) | 25–45 s (aleatório) | `KOI` |
| **Carpa dourada** | Jardim do Dragão | 5% de chance a cada carpa que volta | +100 de XP da conta e **mira afiada** (dispersão ×0,5, recuo ×0,6) por 60 s ou até morrer | — | `KOI` |
| **Rato gigante** | Vila Assombrada (fim do esgoto) | 14 tiros (uma facada vale 4) | **humanidade**: +50 de vida máxima até morrer (só uma por vez) | 120 s | `RAT` |
| **Poção da bruxa** | Vila Assombrada (cabana) | "Beber Poção" perto da bruxa (raio de 2,4 m) | efeito sorteado: pato, veloz (×1,3), lerdo (×0,7), crítico ou bêbado (dispersão ×2,5, recuo ×1,8). Dura 60 s; o pato dura até morrer | uma dose a cada 60 s por jogador | `POTION` |
| **Tiro ao alvo do parque** | Vila Assombrada | derrubar o último alvo da barraca | mira afiada por 60 s | — | `KOI.goldenDuration` |

### Regras gerais

- **Online, o servidor valida e aplica**: confere se o jogador está vivo, se está perto (com folga de latência) e se o item está disponível. Depois avisa todos (`pickup`, `fish`, `rat`, `potion`), e todos veem o item sumir. O servidor sorteia a poção e a carpa dourada.
- **A mira afiada é aplicada pelo cliente.** A da carpa dourada vem de um evento validado pelo servidor; a do tiro ao alvo é decidida só no cliente (`map.rewards.aimBonus` em `client/main.ts`). Ver [[Trust Boundaries]].
- **Offline** (treino e contra bots), os coletáveis funcionam localmente. Os **bots não perseguem nem usam** esses objetivos.
- **Ao morrer, todos os bônus acabam** (cereja, humanidade, poções, pato, mira afiada) ([[Respawn]]).
- O XP das carpas só existe online, com conta ([[Progression]]).

## Segredos planejados

> [!info] Planejado, não implementado
> `docs/MAPAS.md` diz que as gags animadas da Vila Assombrada contam o que aconteceu com elas (`activations`, `rings`, `stirs`, `clears`, `laughs`, `hour`, `lit(i)`). Isso é a "base para os segredos do documento de design" (seção 23, citada em `client/world/hauntedTown.ts`). Nenhum segredo usa esses contadores ainda.

## Dependências

[[Pickups]] · [[Buffs & Debuffs]] · [[Map Gags]] · [[Interactive Objects]] · [[Health System]] · [[Validation]]

## Código relacionado

- `shared/constants.ts`: `CHERRY`, `BISCUIT`, `KOI`, `RAT`, `POTION`
- `shared/maps.ts`: `PICKUPS`, `FISH`, `RATS`, `WITCHES` por mapa
- `server/session.ts`: `onPickup`, `onFish`, `onRat`, `onPotion`, `maxHealth`
- `client/main.ts`: `updatePickups`, `startAim`, `map.rewards` (rato e tiro ao alvo), painel de bônus (`buffs`)
- `shared/protocol.ts`: mensagens `pickup`, `fish`, `rat` e `potion`
