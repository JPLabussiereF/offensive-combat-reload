---
title: Versus Bots
type: mode
status: documented
area: game-modes
source_paths:
  - client/ui/home.ts
  - client/ai/bots.ts
  - client/ai/bot.ts
  - client/ai/navmesh.ts
  - client/main.ts
  - client/gameplay/spawnPicker.ts
  - shared/constants.ts
  - shared/arsenal.ts
  - client/gameplay/progress.ts
tags:
  - game
  - modes
  - offline
  - bots
updated: 2026-10-06
---

# Versus Bots

**Contra bots** ("Contra {n} bots · mata-mata livre"): mata-mata livre **offline**, com o jogador contra 3, 5, 7 ou 9 bots. No código, é `mode: 'bots'` com `count` e `skill`. O `BotManager` (`client/ai/bots.ts`) faz o papel do servidor: aplica o dano, os prêmios, os corpos e os respawns com as mesmas regras.

## Objetivo

O mesmo do [[Free For All]]: fazer pontos abatendo e oprimindo. Os bots **caçam qualquer um**, inclusive outros bots.

## Condição de vitória / derrota

Não existe (sem fim de partida, como no online). Ver [[Problem - Partidas sem fim]].

## Times

Nenhum.

## Regras

- **Sem servidor e sem conta.** Com conta, o jogador usa os níveis e a escolha do Arsenal da conta. Sem conta, rifle e pistola sem melhorias (a escolha feita no Arsenal vale só para aquela partida). **Não rende progresso** ([[Progression]]).
- **Quantidade:** 3, 5, 7 ou 9 (padrão 7). **Dificuldade:** fácil, normal ou difícil (padrão normal). A escolha e o mapa ficam salvos em `localStorage` (`oc.bots`).
- **Bots:** recebem um nome sorteado de uma lista de 12 ("Bot Clebinho", "Sgt. Parafuso", "Dona Bateria", "Capitão Lag", "Recruta 404", "Vovó Turbo"…) e um visual aleatório com os mesmos efeitos de corpo. Usam o mesmo movimento, as mesmas hitboxes e, a cada vida, sorteiam uma arma **sem melhorias**: rifle (60%), submetralhadora (25%) ou pistola (15%) (`pickGun` em `client/ai/bot.ts`). Com uma secundária na mão, o rifle aparece nas costas. Dão facadas letais de perto.
  - Os bots **não lançam granadas** e **não pegam a cereja** (README).
  - Andam por uma malha de navegação gerada dos colisores do mapa e contornam a área de mordida da Amora. O `F4` mostra a malha.
  - Comportamento em [[NPC Behavior]], [[AI Decisions]], [[States]] e [[Navigation]].
- **Opressão:** os bots também dançam em corpos (chance por dificuldade) e ficam vulneráveis enquanto dançam.
- **Pausa:** o mundo para com o menu, bots incluídos.

### Dificuldades (`BOT_SKILLS` em `client/ai/bot.ts`)

| Parâmetro | Fácil | Normal | Difícil |
| --- | --- | --- | --- |
| Tempo de reação | 0,55 s | 0,35 s | 0,2 s |
| Velocidade de giro (rad/s) | 2,6 | 4,2 | 6,5 |
| Erro de mira | 6° | 3,5° | 1,8° |
| Controle de recuo | 0,3 | 0,6 | 0,85 |
| Rajada (s) | 0,2–0,35 | 0,3–0,5 | 0,45–0,7 |
| Pausa entre rajadas (s) | 0,45–0,8 | 0,3–0,55 | 0,2–0,35 |
| Chance de mirar na cabeça | 5% | 15% | 30% |
| Campo de visão | 100° | 115° | 130° |
| Chance de oprimir | 35% | 50% | 65% |

## Fluxo da partida

Home → escolhe quantidade, dificuldade e mapa → "CONTRA BOTS" → o mapa é montado e a malha de navegação é gerada → os bots nascem espalhados (cada um protegido) → o jogador nasce → combate contínuo.

## Respawn

- **5 s** para o jogador e para os bots (`RESPAWN` em `client/ai/bots.ts`).
- Pontos `spawnsFFA` com o mesmo seletor seguro do online (contra todos os combatentes vivos).
- **Proteção de nascimento de 2 s** (`SPAWN_PROTECTION`): quem nasce pisca, não recebe dano e é ignorado pelos bots. A proteção acaba antes se a pessoa **atirar**. Este é o **único modo** com proteção.
- Bots que caem abaixo de y = −20 morrem (vazio).
- Ver [[Respawn]].

## Pontuação

- A mesma tabela `SCORE` e os mesmos prêmios do servidor ([[Scoring]]): abate, cabeça, virilha, faca, pelas costas, longa distância (> 50 m) e opressão.
- O placar `Tab` lista todos (o nível aparece como "—"). A ordem é por pontos, abates e mortes.
- A pontuação não é gravada.

## Limites de tempo

Nenhum.

## Configurações

| Item | Valor | Fonte |
| --- | --- | --- |
| Quantidades disponíveis | 3, 5, 7, 9 | `client/ui/home.ts` |
| Respawn | 5 s | `RESPAWN` em `client/ai/bots.ts`; `player.respawnDelay = 5` em `client/main.ts` |
| Proteção ao nascer | 2 s | `SPAWN_PROTECTION` em `client/ai/bots.ts` |
| Regeneração dos bots | 4 s de espera, 25/s | igual à do jogador (valor fixo em `bots.ts`) |
| Dificuldades | tabela acima | `BOT_SKILLS` |

## Limitações conhecidas

- Os bots **só existem offline**. Bots nas sessões online precisam de simulação no servidor, que está no roadmap da Fase 2 (README).
- Os bots não usam melhorias de arma, granadas nem coletáveis.

## Sistemas utilizados

[[AI Overview]] · [[Navigation]] · [[Combat]] · [[Damage System]] · [[Humiliation]] · [[Melee]] · [[Grenades]] (só o jogador) · [[Spawn Design]] · [[Scoreboard]]

## Código relacionado

- `client/ai/bots.ts`: `BotManager` (dano, prêmios, corpos, respawn, proteção)
- `client/ai/bot.ts`: `Bot`, `BOT_SKILLS`
- `client/ai/navmesh.ts`: `NavMap` (recast-navigation)
- `client/main.ts`: hooks `damagePlayer`, `kill`, `tauntStarted`, `humiliation`
- `client/ui/home.ts`: seletores `bot-count` e `bot-skill`

## UI relacionada

[[HUD]] · [[Scoreboard]] · [[Notifications]] (kill feed) · [[Menus]]
