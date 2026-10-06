---
title: Problem - Comentários dizem que a granada nível 1 não é letal
type: problem
status: documented
area: gameplay
source_paths:
  - shared/protocol.ts
  - client/main.ts
  - shared/data/weapons/granada_frag.json
  - README.md
tags:
  - problem
  - grenades
  - documentation-drift
updated: 2026-10-05
---

# Problem - Comentários dizem que a granada nível 1 não é letal

## Sintoma

- `shared/protocol.ts`: "Everyone throws this grenade level online until progression exists (level 1 = non-lethal)."
- `client/main.ts`: "Grenade progression is decided later; everyone throws level 1 (non-lethal) for now."

## Realidade no código

`granada_frag.json` tem um único nível, com `podeMatar: true`; o README diz que a granada mata quem tem menos de 85 de vida. A progressão da granada já existe, mas muda o **tipo** (granada/mina/dupla), não o nível de dano.

## Impacto

Quem ler os comentários pode achar que explosões nunca matam outros jogadores ou "corrigir" o JSON para `false`, mudando o balanceamento. O código efetivo segue o JSON.

## Solução sugerida

Atualizar os dois comentários (e talvez renomear `ONLINE_GRENADE_LEVEL` para deixar claro que é o nível de **dano**).

## Relacionado

[[Grenades]], [[Damage System]], [[Technical Debt]].
