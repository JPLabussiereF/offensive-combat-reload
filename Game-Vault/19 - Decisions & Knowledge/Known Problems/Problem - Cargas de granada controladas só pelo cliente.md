---
title: Problem - Cargas de granada controladas só pelo cliente
type: problem
status: documented
area: gameplay
source_paths:
  - client/weapons/grenades.ts
  - shared/data/weapons/granada_frag.json
  - server/session.ts
tags:
  - problem
  - grenades
  - anti-cheat
updated: 2026-10-05
---

# Problem - Cargas de granada controladas só pelo cliente

## Sintoma

O número de granadas (2 por vida) e a recarga (+1 a cada 10 s) existem apenas no `GrenadeThrower` do cliente. O servidor não conta cargas.

## Causa

- `granada_frag.json` descreve `recargaSegundos` como "Offline prototype convenience", mas `GrenadeThrower.update` aplica a recarga em todos os modos, inclusive online.
- `server/session.ts` (case `grenade`) só limita **granadas vivas ao mesmo tempo** (4 granadas, 3 minas) e valida a explosão (`onBoom`); não verifica cargas nem o intervalo de 0,8 s.

## Impacto

Um cliente modificado pode lançar granadas sem limite de cargas (até 4 no ar por vez). Jogadores honestos recebem a recarga de 10 s também online, o que pode ou não ser o design pretendido (o comentário sugere que não).

## Solução sugerida

Decidir se a recarga vale online; contar cargas e o intervalo no servidor (por vida, zerando no `respawn`).

## Relacionado

[[Grenades]], [[Land Mines]], [[Anti Cheat]], [[Anti Exploit]].
