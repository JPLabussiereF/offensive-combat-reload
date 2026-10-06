---
title: ADR - Pontuação da Opressão triplicada
type: decision
status: documented
area: design
source_paths:
  - shared/constants.ts
  - server/session.ts
  - client/ai/bots.ts
  - README.md
tags:
  - game
  - decision
  - scoring
updated: 2026-10-05
---

# ADR - Pontuação da Opressão triplicada

## Contexto

A [[Humiliation]] (Opressão) é a dança sobre o corpo de quem acabou de morrer. Ela dura 3,2 s em terceira pessoa, o jogador não pode atirar e só a morte interrompe a dança.

## Problema

Com o valor original, ficar parado e exposto durante 3 s não compensava o risco, e a mecânica-assinatura do jogo tenderia a ser ignorada.

## Opções consideradas

- Manter o valor original. O README diz que 150 é "o triplo do valor original", o que implica 50 pontos.
- Aumentar o valor para compensar a exposição.

> [!info] Inferência
> Não há registro de outras alternativas (encurtar a dança, dar invulnerabilidade). Elas são mencionadas só como contraste.

## Decisão

`SCORE.humiliation = 150`, mais que o próprio abate (`SCORE.kill = 100`).

## Motivo

Comentário em `shared/constants.ts`: *"Tripled: dancing on a body leaves you exposed for 3 s, it has to pay off."* O README repete: "rende 150 pontos (o triplo do valor original, porque você fica exposto dançando)".

## Consequências

- A Opressão vira uma escolha real de **risco × recompensa** e reforça o pilar "zoeira como recompensa" ([[Core Pillars]]).
- O design de mapas protege quem oprime: no Jardim do Dragão, os muros entre setores têm 4 m e nenhum portão fica de frente para outro, "quem oprime um corpo não leva tiro do outro lado do mapa" (README).
- A Opressão soma à pontuação da sessão e dá +50 de XP da conta, mas **não** dá XP de arma ([[Progression]]).
- Quem baixar esse valor deve rever o equilíbrio entre abate e provocação.

## Código afetado

- `shared/constants.ts` (`SCORE.humiliation`, `HUMILIATION`)
- `server/session.ts` (`onTauntEnd`)
- `client/ai/bots.ts` (`finishTaunt`)
- `client/main.ts` (`finishTaunt` no treino)

Relacionado: [[Scoring]] · [[Humiliation]]
