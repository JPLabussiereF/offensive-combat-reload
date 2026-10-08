---
title: Training
type: mode
status: documented
area: game-modes
source_paths:
  - client/ui/home.ts
  - client/main.ts
  - client/entities/dummy.ts
  - client/entities/localPlayer.ts
  - client/world/gameMap.ts
  - shared/data/mapas/rua.json
  - shared/data/mapas/jardim.json
  - shared/data/mapas/halloween.json
  - client/ui/strings.ts
  - client/gameplay/progress.ts
tags:
  - game
  - modes
  - offline
updated: 2026-10-08
---

# Training

**Treino offline / Campo de tiro.** Na home, o botão diz "Campo de tiro (bonecos parados)" (`playOffline`); no README, "Treino offline: o campo com os bonecos, sem servidor". No código, é `mode: 'offline'` com `variant: 'range'`.

## Objetivo

Praticar tiro, faca, granada e opressão contra **bonecos de treino** (*dummies*), conhecer o mapa e medir o TTK. Não há adversário que revida ("Dica: o boneco não revida. Ainda.").

## Condição de vitória / derrota

Nenhuma. O jogador pode morrer por queda, vazio, a própria granada ou a mordida da Amora.

## Times

Nenhum.

## Regras

- **Sem servidor e sem conta.** Com conta, usa os níveis de arma e a escolha do Arsenal da conta (secundária e melhorias). Sem conta, rifle e pistola sem melhorias; a escolha feita no Arsenal vale só para aquela partida. **Não rende progresso** ([[Progression]]).
- **Mapa:** o cartão escolhido na aba Jogar (só os mapas abertos; o último escolhido em qualquer aba) ([[Game Modes Index]]).
- **Bonecos** (`map.dummies`, só neste modo): têm hitboxes por região (cabeça, tronco, braços, pernas), barra de vida e as mesmas regras de regeneração (4 s, 25/s).
  - Quantidade por mapa: Rua dos Vizinhos **12** (4 patrulham), Jardim do Dragão **13** (5 patrulham), Vila Assombrada **13** (3 patrulham). Os que patrulham vão e voltam num eixo (`patrol`).
  - O boneco abatido fica oprimível por 6 s ([[Humiliation]]).
  - **Respawn do boneco:** 6,8 s depois de morrer se não for oprimido (janela de 6 s + 0,8 s afundando no chão), ou 2,4 s depois de uma opressão completa. Ele nunca renasce com alguém em cima.
- **Coletáveis e gags do mapa** funcionam localmente (cereja, biscoito etc.) ([[Pickups]], [[Map Gags]]).
- **Pausa:** offline, o mundo para quando o menu abre (aviso verde "Jogo pausado."). A aba **Arsenal** do menu é **editável** aqui (selo "Editável no treino"): em cada espaço, as armas liberadas com Equipar e as melhorias ligando e desligando, na mão na hora ([[Inventory UI]]). A saída é "Sair do treino", com confirmação.

## Fluxo da partida

Aba Jogar → **Campo de tiro** → clicar num mapa (só escolhe, desde a PF-32) → botão laranja **CAMPO DE TIRO** ("Bonecos parados · {mapa}") → o mapa é montado → o jogador nasce num ponto `spawnsA` → atira nos bonecos → `Esc` para pausar (ou trocar armas no Arsenal) → "Sair do treino" e confirmar para voltar à tela inicial.

## Respawn

- Jogador: **3 s** (`RESPAWN_DELAY` em `client/entities/localPlayer.ts`), em ponto sorteado de `spawnsA`, sem repetir o último. Sem proteção de nascimento.
- Ver [[Respawn]].

## Pontuação

- Usa a mesma tabela `SCORE` ([[Scoring]]): abate, cabeça, virilha, longa distância, facada, pelas costas e opressão. Os pontos aparecem em pop-ups.
- Os números ficam **só na partida local**: o HUD mostra pontos, abates e precisão (acertos ÷ tiros). Não há placar `Tab` neste modo.
- O F3 mostra o **TTK real × ideal** do último abate ([[HUD]]).

## Limites de tempo

Nenhum.

## Configurações

| Item | Valor | Fonte |
| --- | --- | --- |
| Atraso de respawn do jogador | 3 s | `client/entities/localPlayer.ts` |
| Janela de opressão do boneco | 6 s | `HUMILIATION.window` |
| Tempo de afundar | 0,8 s | `SINK_TIME` em `client/entities/dummy.ts` |
| Posições e patrulhas dos bonecos | por mapa | `dummies` em cada builder de mapa |
| Bonecos em mapas glTF | marcadores `DUMMY_*` | `client/world/gltfMap.ts`, [[Map - Arena Teste (glTF)]] |

## Sistemas utilizados

[[Combat]] · [[Weapons]] · [[Damage System]] · [[Humiliation]] · [[Grenades]] · [[Melee]] · [[Health System]] · [[Pickups]] · [[Map Gags]]

## Código relacionado

- `client/ui/home.ts`: `#home-play-cta` com o Campo de tiro escolhido (`startOffline`); na landing, `#land-range`
- `client/main.ts`: `DummyManager` só com `choice.mode === 'offline'`; `spawnsA`; `onKill` e `award` locais
- `client/entities/dummy.ts`: vida, morte, opressão e respawn dos bonecos

## UI relacionada

[[HUD]] · [[Menus]] · [[Notifications]] (kill feed local)
