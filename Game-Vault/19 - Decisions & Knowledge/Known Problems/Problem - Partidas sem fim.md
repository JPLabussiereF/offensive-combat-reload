---
title: Problem - Partidas sem fim
type: problem
status: documented
area: game-modes
source_paths:
  - server/modes.ts
  - server/session.ts
  - server/app.ts
  - client/ai/bots.ts
  - README.md
tags:
  - game
  - problem
  - modes
updated: 2026-10-06
---

# Problem - Partidas sem fim

> [!info] Resolvido em parte (2026-10-06)
> A [[Gun Game|corrida armada]] tem fim de rodada: o abate com o Sabre de Luz vence, todos veem o vencedor e uma rodada nova começa ([[ADR - Corrida armada]]). O **mata-mata** continua sem fim; nele, "partida" passou a significar a estadia na sessão, que é quando o equipamento fica travado ([[ADR - Equipamento travado no mata-mata]]).

## Contexto

Os modos competitivos de mata-mata, [[Free For All]] (online) e [[Versus Bots]] (offline), não terminam.

## Problema

Não existe **fim de partida**: nenhum limite de abates, limite de tempo, rodada, tela de vitória, pódio, troca nem votação de mapa.

- `server/session.ts` não tem estado de partida. A sessão roda um `tick` contínuo enquanto existe, e as sessões só terminam quando esvaziam (desde a PF-6 não há sessões permanentes; `server/app.ts`).
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
- `server/app.ts` (salas sob demanda, lobby)
- `client/ai/bots.ts` (`BotManager`)
- `client/ui/scoreboard.ts`

Relacionado: [[Game Modes Index]] · [[Scoring]] · [[Sessions]] · [[Technical Debt]]
