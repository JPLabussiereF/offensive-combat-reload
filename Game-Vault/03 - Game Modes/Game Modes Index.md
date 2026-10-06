---
title: Game Modes Index
type: reference
status: documented
area: game-modes
source_paths:
  - shared/gunGame.ts
  - server/modes.ts
  - shared/modes.ts
  - client/ui/home.ts
  - client/main.ts
  - client/ai/bots.ts
  - server/app.ts
  - server/session.ts
  - shared/protocol.ts
  - shared/maps.ts
  - shared/zombies.ts
  - shared/zombieMatch.ts
  - client/zombies/client.ts
  - shared/data/mapas/cemiterio.json
tags:
  - game
  - modes
  - index
updated: 2026-10-06
---

# Game Modes Index

Porta de entrada da área de **modos de jogo**. Há duas escolhas na home (`showHome` em `client/ui/home.ts`):

- **Onde jogar** (`HomeChoice.mode`): `'online'`, `'bots'` ou `'offline'` (campo de tiro).
- **Que regra jogar** (o **modo de jogo**, `GameModeId` em `shared/modes.ts`): `'mata-mata'`, `'corrida-armada'` ou `'zumbi'`. Online vem da sessão (`SessionInfo.mode`); contra bots, do seletor "Tipo de partida" (`HomeChoice.game`; o zumbi offline é o jogo solo contra a horda). O campo de tiro não tem modo.

As diferenças entre modos estão declaradas em `MODE_RULES` e, no servidor, em `server/modes.ts` ([[ADR - Modos de jogo com regras declaradas e ganchos no servidor]]).

## Modos de jogo

| Modo (nome no jogo) | Nota | `GameModeId` | Regra | Online | Contra bots |
| --- | --- | --- | --- | --- | --- |
| **Mata-mata** | [[Free For All]] (online) · [[Versus Bots]] (offline) | `mata-mata` | todos contra todos com o Arsenal escolhido **antes** da partida, travado durante ela | Sim | Sim |
| **Corrida armada** | [[Gun Game]] | `corrida-armada` | escada de 7 armas fixas: 3 abates sobem, facada desce, abate com o Sabre de Luz vence a rodada | Sim | Sim |
| **Zumbi** | [[Zombie]] | `zumbi` | em equipe contra 12 ondas de zumbis e 3 chefes no Cemitério da Capela (mapa só dele); armas do Caixão Misterioso (às vezes danificadas) e barricadas nas brechas do muro, compradas com o dinheiro da partida; caído/reanimar | Sim (só no Cemitério da Capela) | Solo (você contra a horda) |

## Onde jogar

| Onde | Nota | `mode` | Precisa de conta? | Precisa de servidor? |
| --- | --- | --- | --- | --- |
| **Online** (até 10 humanos por sessão) | [[Free For All]], [[Gun Game]], [[Zombie]] | `online` | Sim | Sim |
| **Contra bots** (você + 3/5/7/9 bots) | [[Versus Bots]] | `bots` | Não | Não |
| **Campo de tiro / Treino offline** | [[Training]] | `offline` (`variant: 'range'`) | Não | Não |

## Modos que **não** existem (verificado)

| Modo | Nota | Situação |
| --- | --- | --- |
| Mata-mata em equipe | [[Team Deathmatch]] | Não existe. Há só dados de spawn A/B e cores de equipe sem uso de regra |
| Modos de objetivo (bandeira, dominação, bomba…) | [[Objective Modes]] | Não existe |
| Ranqueada | — | Não existe. Em `server/migrations/001_contas.sql` há a coluna `player_stats.mmr` ("unused until ranked play exists") e o tipo de sanção `ranked_ban`: indícios de um plano futuro |

## Comparativo rápido

| Aspecto | Online | Contra bots | Treino |
| --- | --- | --- | --- |
| Autoridade das regras | servidor (`server/session.ts` + `server/modes.ts`; zumbi: o servidor simula a horda) | cliente (`BotManager`, mesmas regras; zumbi: o mesmo motor do servidor, `client/zombies/local.ts`) | cliente |
| Pontos pontuam a progressão? | Sim (corrida armada e zumbi: só XP de conta) | Não | Não |
| Armas e melhorias usadas | mata-mata: Arsenal da conta, travado ao entrar · corrida armada: a escada · zumbi: rifle inicial + o que sair do caixão | idem (sem melhorias sem conta) | Arsenal da conta, editável na pausa |
| Pontos de nascimento | `spawnsFFA` + seletor seguro | `spawnsFFA` + seletor seguro | `spawnsA` (sorteio, sem repetir o último) |
| Atraso de respawn | 5 s (servidor); zumbi: caído e reanimado, morto volta no intervalo | 5 s (zumbi solo: cair é perder) | 3 s |
| Proteção ao nascer | Não | **2 s** (pisca, cancelada ao atirar) | Não |
| Placar (`Tab`) | Sim, com nível e ping | Sim | Não (HUD mostra pontos, abates e precisão) |
| Chat | Sim | Não | Não |
| Pausa com o menu | Não (o mundo segue) | Sim | Sim |
| Fim de partida | mata-mata: não existe · corrida armada: rodadas · zumbi: vitória na onda 12 ou derrota sem ninguém de pé | idem | — |

## Seleção de mapa

- **Online:** o mapa é o da sessão (uma versão salva dele). As salas abrem sob demanda por mapa e modo (`play`); o zumbi só em mapas feitos para ele, como o Cemitério da Capela, que nenhum outro modo usa (`modeAllowsMap`, `MODE_RULES.zumbi.ownMaps`), e quem cria uma sessão escolhe o mapa e o modo (um mapa onde o modo não é jogado cai no primeiro oficial do modo).
- **Contra bots e treino:** valem o seletor **Mapa** da home (`home-map`), salvo em `localStorage` (`oc.bots`).
- **Qualquer modo:** `?mapa=/maps/arquivo.glb` na URL carrega um mapa glTF por cima da escolha ([[Map - Arena Teste (glTF)]]).
- Mapas: [[Map - Rua dos Vizinhos]], [[Map - Jardim do Dragão]], [[Map - Vila Assombrada]] (versus, bots e treino) e [[Map - Cemitério da Capela]] (só zumbi). Ver [[Maps Index]].

## Regras globais × regras de modo

As regras que valem em todos os modos (vida, dano, pontuação, opressão) ficam em [[Game Rules]], [[Scoring]] e [[Respawn]]. As notas de modo só registram o que **difere** entre eles.

## Para criar um modo novo

Use o [[Mode Template]] para a nota e siga o roteiro de [[ADR - Modos de jogo com regras declaradas e ganchos no servidor]] para o código.

## Notas relacionadas

[[Game Concept]] · [[Core Loop]] · [[Matchmaking]] · [[Sessions]] · [[Matchmaking UI]] · [[Objectives]]
