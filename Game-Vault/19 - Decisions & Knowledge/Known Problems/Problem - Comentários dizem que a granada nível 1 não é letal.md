---
title: Problem - Comentários dizem que a granada nível 1 não é letal
type: problem
status: outdated
area: gameplay
source_paths:
  - shared/protocol.ts
  - client/main.ts
  - shared/data/weapons/granada_frag.json
  - README.md
  - shared/arsenal.ts
  - server/session.ts
tags:
  - problem
  - grenades
  - documentation-drift
  - resolvido
updated: 2026-10-06
---

# Problem - Comentários dizem que a granada nível 1 não é letal

> [!success] Resolvido (branch `feat/home-e-modos`, 2026-10-06)
> A constante `ONLINE_GRENADE_LEVEL` e os dois comentários enganosos foram removidos de `shared/protocol.ts` e `client/main.ts`. A explosão agora vem de `grenadeStats(melhorias).explosao` (`shared/arsenal.ts`): o nível 1 de `granada_frag.json` (`podeMatar: true`), com os raios ×1,2 na melhoria Pólvora. O servidor guarda a explosão de cada granada no lançamento. O texto abaixo fica como registro histórico. Ver [[Grenades]] e [[ADR - Progressão por melhorias de arma]].

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
