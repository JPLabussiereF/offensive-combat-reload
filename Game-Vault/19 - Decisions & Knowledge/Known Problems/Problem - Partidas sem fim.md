---
title: Problem - Partidas sem fim
type: problem
status: documented
area: game-modes
source_paths:
  - server/session.ts
  - server/app.ts
  - client/ai/bots.ts
  - README.md
tags:
  - game
  - problem
  - modes
updated: 2026-10-05
---

# Problem - Partidas sem fim

## Contexto

Os dois modos competitivos, [[Free For All]] (online) e [[Versus Bots]] (offline), são mata-mata livre.

## Problema

Não existe **fim de partida**: nenhum limite de abates, limite de tempo, rodada, tela de vitória, pódio, troca nem votação de mapa.

- `server/session.ts` não tem estado de partida. A sessão roda um `tick` contínuo enquanto existe, e as sessões permanentes nunca terminam (`server/app.ts`).
- O placar da sessão só cresce. Ele fica em memória por jogador e zera quando o jogador sai e volta, mas não para quem continua na sala.
- O README lista em "Ainda não feito": *"fim de partida (limite de abates e tempo) e votação de mapa"*. A Fase 2 cita de novo "fim de partida".

## Sintomas

- Não há "vencedor". Quem entrou antes acumula mais pontos.
- A coluna `player_stats.matches_played` conta **entradas em sessões** (cada `openParticipation`), não partidas.

## Opções consideradas

Nenhuma registrada no repositório. O README sugere limite de abates e de tempo, mais votação de mapa.

## Consequências / impacto

- O pilar competitivo fica sem fechamento ([[Player Experience]]).
- Um modo ranqueado (há `player_stats.mmr` "unused until ranked play exists") depende disso.

## Código afetado

- `server/session.ts` (`Session`)
- `server/app.ts` (sessões permanentes, lobby)
- `client/ai/bots.ts` (`BotManager`)
- `client/ui/scoreboard.ts`

Relacionado: [[Game Modes Index]] · [[Scoring]] · [[Sessions]] · [[Technical Debt]]
