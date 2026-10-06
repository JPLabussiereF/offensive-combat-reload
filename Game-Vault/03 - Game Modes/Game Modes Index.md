---
title: Game Modes Index
type: reference
status: documented
area: game-modes
source_paths:
  - client/ui/home.ts
  - client/main.ts
  - client/ai/bots.ts
  - server/app.ts
  - server/session.ts
  - shared/protocol.ts
  - shared/maps.ts
tags:
  - game
  - modes
  - index
updated: 2026-10-05
---

# Game Modes Index

Porta de entrada da área de **modos de jogo**. A escolha do modo acontece na home (`showHome` em `client/ui/home.ts`), que devolve um `HomeChoice` com `mode: 'online' | 'bots' | 'offline'`. Toda a partida depois disso é montada em `client/main.ts` conforme esse valor.

## Modos existentes

| Modo (nome no jogo) | Nota | `mode` | Regra | Precisa de conta? | Precisa de servidor? |
| --- | --- | --- | --- | --- | --- |
| **Jogar online** — "mata-mata livre" | [[Free For All]] | `online` | todos contra todos, até 10 humanos | Sim | Sim |
| **Contra bots** — "mata-mata livre" | [[Versus Bots]] | `bots` | todos contra todos, você + 3/5/7/9 bots | Não | Não |
| **Campo de tiro / Treino offline** | [[Training]] | `offline` (`variant: 'range'`) | bonecos de treino, sem adversário | Não | Não |

## Modos que **não** existem (verificado)

| Modo | Nota | Situação |
| --- | --- | --- |
| Mata-mata em equipe | [[Team Deathmatch]] | Não existe. Há só dados de spawn A/B e cores de equipe sem uso de regra |
| Modos de objetivo (bandeira, dominação, bomba…) | [[Objective Modes]] | Não existe |
| Ranqueada | — | Não existe. Em `server/migrations/001_contas.sql` há a coluna `player_stats.mmr` ("unused until ranked play exists") e o tipo de sanção `ranked_ban`: indícios de um plano futuro |

## Comparativo rápido

| Aspecto | Online | Contra bots | Treino |
| --- | --- | --- | --- |
| Autoridade das regras | servidor (`server/session.ts`) | cliente (`BotManager`, mesmas regras) | cliente |
| Pontos pontuam a progressão? | Sim | Não | Não |
| Níveis de arma usados | equipados na conta | equipados na conta (nível 1 sem conta) | idem |
| Pontos de nascimento | `spawnsFFA` + seletor seguro | `spawnsFFA` + seletor seguro | `spawnsA` (sorteio, sem repetir o último) |
| Atraso de respawn | 5 s (servidor) | 5 s | 3 s |
| Proteção ao nascer | Não | **2 s** (pisca, cancelada ao atirar) | Não |
| Placar (`Tab`) | Sim, com nível e ping | Sim | Não (HUD mostra pontos, abates e precisão) |
| Chat | Sim | Não | Não |
| Pausa com o menu | Não (o mundo segue) | Sim | Sim |
| Fim de partida | Não existe | Não existe | — |

## Seleção de mapa

- **Online:** o mapa é o da sessão. Cada mapa tem uma sessão permanente, e quem cria uma sessão escolhe o mapa.
- **Contra bots e treino:** valem o seletor **Mapa** da home (`home-map`), salvo em `localStorage` (`oc.bots`).
- **Qualquer modo:** `?mapa=/maps/arquivo.glb` na URL carrega um mapa glTF por cima da escolha ([[Map - Arena Teste (glTF)]]).
- Mapas: [[Map - Rua dos Vizinhos]], [[Map - Jardim do Dragão]], [[Map - Vila Assombrada]]. Ver [[Maps Index]].

## Regras globais × regras de modo

As regras que valem em todos os modos (vida, dano, pontuação, opressão) ficam em [[Game Rules]], [[Scoring]] e [[Respawn]]. As notas de modo só registram o que **difere** entre eles.

## Para criar um modo novo

Use o [[Mode Template]].

## Notas relacionadas

[[Game Concept]] · [[Core Loop]] · [[Matchmaking]] · [[Sessions]] · [[Matchmaking UI]] · [[Objectives]]
