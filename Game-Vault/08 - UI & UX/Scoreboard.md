---
title: Scoreboard
type: system
status: documented
area: ui
source_paths:
  - shared/gunGame.ts
  - client/ui/scoreboard.ts
  - client/main.ts
  - index.html
  - shared/protocol.ts
tags:
  - game
  - ui
  - scoreboard
updated: 2026-10-06
---

# Scoreboard

Tabela de classificação da partida (`#scoreboard`, classe `Scoreboard` em `client/ui/scoreboard.ts`).

## Como abrir

- **Computador:** **segurar** a ação "Placar" (Tab por padrão; remapeável).
- **Controle:** segurar Share/View ou o touchpad do PlayStation.
- **Celular:** botão de placar na fileira de cima, que **alterna** (segurar não funciona com o polegar ocupado mirando).
- Só aparece **online e contra bots** e com o jogo em andamento (não no menu). No treino offline (bonecos) não há placar.

## Conteúdo

Cabeçalho com "Placar" e o nome da sessão (online) ou "Contra N bots · {modo}". Colunas:

| # | Jogador | Nível | (Arma) | Pontos | Abates | Mortes | Opress. | Ping |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

- **Arma** só existe na corrida armada (`new Scoreboard(true)`): degrau e abates nele, ex. "3/7 · 1/3" (`PlayerInfo.ladder`). Ver [[Gun Game]].
- **Ordenação:** na corrida armada, primeiro pela escada (degrau, depois abates no degrau); depois pontos (desc.), abates (desc.), mortes (asc.). Os números zeram a cada rodada.
- **Destaques:** a linha do próprio jogador recebe a classe `me`; jogadores mortos, `dead`.
- **Nível:** nível da conta; bots e jogadores sem conta mostram "—".
- **Ping** em ms.
- A tabela só é redesenhada quando os dados mudam (chave = nome da sessão + JSON das linhas).

## Fonte dos dados

- **Online:** `net.info` — `PlayerInfo` recebido do servidor (`scores`, `kill`, entrada de jogadores). Ver [[Replication]].
- **Contra bots:** `bots.standings()` do gerenciador local. Ver [[Versus Bots]].

As regras de pontuação estão em [[Scoring]]; o modo em [[Free For All]].

## Código relacionado

- `client/ui/scoreboard.ts` — `Scoreboard.update(players, me, sessionName)`, `visible`.
- `client/main.ts` — `showBoard` (input `scoreboard` + modo).
- `shared/protocol.ts` — `PlayerInfo`.
