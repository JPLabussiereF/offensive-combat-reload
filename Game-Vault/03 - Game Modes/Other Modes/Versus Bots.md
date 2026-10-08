---
title: Versus Bots
type: mode
status: documented
area: game-modes
source_paths:
  - shared/gunGame.ts
  - shared/modes.ts
  - client/ui/home.ts
  - client/ai/bots.ts
  - client/ai/bot.ts
  - client/ai/botGuns.ts
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
updated: 2026-10-08
---

# Versus Bots

**Contra bots** ("Contra {n} bots · {modo}"): partida **offline**, com o jogador contra 3, 5, 7 ou 9 bots, em **mata-mata** ou **corrida armada** (seletor "Tipo de partida", `HomeChoice.game`; só os modos com `MODE_RULES[...].bots`). Esta nota descreve o mata-mata; a corrida armada contra bots segue [[Gun Game]], com o `BotManager` aplicando a mesma escada (`shared/gunGame.ts`), rodadas e cartão de vencedor. No código, é `mode: 'bots'` com `count` e `skill`. O `BotManager` (`client/ai/bots.ts`) faz o papel do servidor: aplica o dano, os prêmios, os corpos e os respawns com as mesmas regras.

## Objetivo

O mesmo do [[Free For All]]: fazer pontos abatendo e oprimindo. Os bots **caçam qualquer um**, inclusive outros bots.

## Condição de vitória / derrota

Não existe (sem fim de partida, como no online). Ver [[Problem - Partidas sem fim]].

## Times

Nenhum.

## Regras

- **Sem servidor e sem conta.** Com conta, o jogador usa os níveis e a escolha do Arsenal da conta, **travados** na partida (o Arsenal da pausa mostra só o equipamento em uso, para consulta, como online: [[ADR - Equipamento travado no mata-mata]]). Sem conta, Rifle Padrão, pistola e faca de cozinha sem melhorias. **Não rende progresso** ([[Progression]]).
- **Quantidade:** 3, 5, 7 ou 9 (padrão 7). **Dificuldade:** fácil, normal ou difícil (padrão normal). Escolhidas no painel lateral da aba Jogar (no celular deitado, dois seletores nativos no rodapé), com o mapa num cartão; o botão laranja **CONTRA N BOTS** ("Mata-mata · Rua dos Vizinhos · Normal") começa ([[Menus]]). A escolha e o mapa ficam salvos em `localStorage` (`oc.bots`).
- **Bots:** recebem um nome sorteado de uma lista de 12 ("Bot Clebinho", "Sgt. Parafuso", "Dona Bateria", "Capitão Lag", "Recruta 404", "Vovó Turbo"…) e um visual aleatório com os mesmos efeitos de corpo. Usam o mesmo movimento, as mesmas hitboxes e, a cada vida, sorteiam uma arma **sem melhorias**: um rifle (60%; qualquer um dos sete, com a mesma chance) ou uma secundária (40%; qualquer uma das sete, com a mesma chance — desde a PF-10, antes eram submetralhadora 25% e pistola 15%) (`pickGun` em `client/ai/botGuns.ts`), e uma das sete facas, também com a mesma chance. Nada é trancado para eles (bot não tem conta). Com uma secundária na mão, o Rifle Padrão aparece nas costas. O kill feed mostra a arma e a faca do bot. Dão facadas letais de perto.
  - Os bots **não lançam granadas** e **não pegam a cereja** (README).
  - Na corrida armada recebem as armas do degrau (`Bot.arm`) e, com o Sabre de Luz, correm direto para esfaquear em vez de atirar.
  - Andam por uma malha de navegação gerada dos colisores do mapa e contornam a área de mordida da Amora. O `F4` mostra a malha.
  - Comportamento em [[NPC Behavior]], [[AI Decisions]], [[States]] e [[Navigation]].
- **Opressão:** os bots também dançam em corpos (chance por dificuldade) e ficam vulneráveis enquanto dançam.
- **Pausa:** o mundo para com o menu, bots incluídos (aviso verde "Jogo pausado: os bots esperam você."; a linha do menu diz "Contra N bots · {dificuldade}" e a saída, "Sair da partida", pede confirmação). Ver [[Menus]].

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
- `client/ui/home.ts`: `#home-skills` e `#home-counts` (painel lateral), `#home-skill-sel` e `#home-count-sel` (celular deitado), `#home-play-cta`, `startBots`

## UI relacionada

[[HUD]] · [[Scoreboard]] · [[Notifications]] (kill feed) · [[Menus]]
