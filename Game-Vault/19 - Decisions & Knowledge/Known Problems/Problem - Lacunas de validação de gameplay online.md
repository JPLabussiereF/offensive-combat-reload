---
title: Problem - Lacunas de validação de gameplay online
type: problem
status: documented
area: networking
source_paths:
  - server/session.ts
  - shared/weapons.ts
  - shared/data/weapons/granada_frag.json
  - client/main.ts
  - shared/data/weapons/revolver.json
  - shared/data/weapons/pistolao.json
  - shared/data/weapons/garrucha.json
tags:
  - problem
  - anti-cheat
  - security
updated: 2026-10-07
---

# Problem - Lacunas de validação de gameplay online

## Contexto
O servidor valida relatórios do cliente ([[Anti Cheat]]), mas sem física, geometria nem simulação de movimento.

## Problema (código confirmado)
| Lacuna | Onde | Impacto |
|---|---|---|
| Posição livre em `state` | `case 'state'` | *speed hack*, teleporte, atravessar paredes |
| Ponto de respawn livre | `case 'respawn'` | nascer em qualquer lugar |
| Região do acerto só checada contra a lista | `onHit` | informar `virilha` sempre = morte instantânea (`computeDamage` devolve `LETHAL_DAMAGE`); `cabeca` = 2,5× no rifle — e, desde a PF-10, **um tiro só** com o revólver (até 10 m) e o pistolão (até ~27 m) |
| Acertos por segundo da garrucha | `fireRate` (`hitsPerSecond`) | o limite é 8× maior (56/s, 72/s com o Gatilho) porque cada bago é um acerto; somado à região livre, cada disparo pode valer 8 acertos de `cabeca` (desde a PF-10, [[ADR - Secundárias novas no Arsenal]]) |
| Sem linha de visão | `onHit`, `onBoom` | acertos através de paredes aceitos se a distância bater |
| `behind` da facada confiado | `onStab` | bônus de facada pelas costas sempre |
| Explosão de granada com pavio sem checagem de posição; `fuse` mínimo 0 | `case 'grenade'`, `onBoom` | `grenade {fuse: 0}` seguido de `boom` em qualquer ponto; dano até 85 e letal (nível 1 tem `podeMatar: true`) |
| `quantidade`/`recargaSegundos` da granada não aplicados no servidor | `case 'grenade'` | lançamentos ilimitados (só 4 vivas por vez) |

## Mitigações atuais
Conta obrigatória, banimento imediato, uma conexão por conta, limite de 150 msg/s, cadência máxima de acertos.

## Caminho previsto
Servidor simulando movimento com `shared/movement.ts`, rewind de hitboxes (`README.md`, cabeçalho de `server/session.ts`). Ver [[ADR - Movimento confiado ao cliente]] e [[ADR - Acertos informados pelo cliente com tolerância de lag]].

## Código afetado
`server/session.ts`, `shared/weapons.ts`.
