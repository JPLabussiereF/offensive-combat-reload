---
title: Scoreboard
type: system
status: documented
area: ui
source_paths:
  - client/ui/scoreboard.ts
  - client/main.ts
  - index.html
  - shared/protocol.ts
tags:
  - game
  - ui
  - scoreboard
updated: 2026-10-05
---

# Scoreboard

Tabela de classificação da partida (`#scoreboard`, classe `Scoreboard` em `client/ui/scoreboard.ts`).

## Como abrir

- **Computador:** **segurar** a ação "Placar" (Tab por padrão; remapeável).
- **Controle:** segurar Share/View ou o touchpad do PlayStation.
- **Celular:** botão de placar na fileira de cima, que **alterna** (segurar não funciona com o polegar ocupado mirando).
- Só aparece **online e contra bots** e com o jogo em andamento (não no menu). No treino offline (bonecos) não há placar.

## Conteúdo

Cabeçalho com "Placar" e o nome da sessão (online) ou "Contra N bots · mata-mata livre". Colunas:

| # | Jogador | Nível | Pontos | Abates | Mortes | Opress. | Ping |
| --- | --- | --- | --- | --- | --- | --- | --- |

- **Ordenação:** pontos (desc.), depois abates (desc.), depois mortes (asc.).
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
