---
title: Problem - Fim da cereja ignora a humanidade no servidor
type: problem
status: documented
area: gameplay
source_paths:
  - server/session.ts
  - client/main.ts
tags:
  - problem
  - health
  - pickups
updated: 2026-10-05
---

# Problem - Fim da cereja ignora a humanidade no servidor

## Sintoma

Um jogador com a cereja (+50) **e** a humanidade do rato (+50) tem vida máxima 200. Quando a cereja expira, o servidor corta a vida para **100** em vez de 150.

## Causa

`Session.tick` (`server/session.ts`): ao expirar `boostUntil`, faz `p.health = Math.min(p.health, p.body.maxHealth)` — usa só a vida do corpo, sem somar `RAT.extraHealth`. O cliente (`refreshMaxHealth` em `client/main.ts`) corta corretamente para corpo + humanidade, mas online o valor do servidor prevalece no próximo `snap`.

## Impacto

Perda de até 50 HP sem dano. A regeneração devolve a diferença após 4 s sem levar dano (o teto continua 150 via `maxHealth()`). Só ocorre na combinação cereja + humanidade, que hoje exige mapas diferentes (cereja no Jardim do Dragão, rato na Vila Assombrada) — então **na prática não acontece** com os mapas atuais (inferência).

## Solução sugerida

Trocar por `Math.min(p.health, this.maxHealth(p, now))` depois de zerar `boostUntil`.

## Relacionado

[[Health System]], [[Pickups]], [[Buffs & Debuffs]].
