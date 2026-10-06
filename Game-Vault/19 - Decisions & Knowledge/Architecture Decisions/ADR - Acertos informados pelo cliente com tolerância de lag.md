---
title: ADR - Acertos informados pelo cliente com tolerância de lag
type: decision
status: documented
area: networking
source_paths:
  - server/session.ts
  - client/main.ts
  - client/net/remote.ts
  - shared/weapons.ts
tags:
  - decision
  - networking
  - combat
updated: 2026-10-05
---

# ADR - Acertos informados pelo cliente com tolerância de lag

## Contexto
O servidor não tem hitboxes nem geometria; o cliente desenha os remotos 100 ms no passado com as mesmas hitboxes dos bonecos.

## Problema
Decidir quem detecta o acerto e como compensar a latência sem rewind de hitboxes no servidor.

## Opções consideradas
- Rewind de hitboxes no servidor (lag compensation clássica) — listado como "ainda não feito" no `README.md`.
- **Cliente detecta e informa** (`hit {target, region, dist, keep?}`); servidor valida com folga.

## Decisão
O servidor aceita o acerto se: ambos vivos, região válida, no máx. `ceil(cadência/60)+2` acertos/s, distância do servidor (olho 1,6 m → peito 1,1 m) dentro do alcance da arma e `|servidor − informada| ≤ LAG_SLACK (4 m) + 10 %`. O dano é calculado no servidor com a distância informada (limitada ao alcance) e `keep` limitado ao mínimo de penetração da arma. Mesma ideia para facada (+1,5 m) e explosões (±3 m).

## Motivo
Simples, sem física no servidor, e o atirador acerta onde vê ("favor the shooter").

## Consequências
- Bom feeling para quem atira; quem leva o tiro pode morrer "atrás da parede" com latência alta.
- Linha de visão e região do acerto não são verificadas ([[Problem - Lacunas de validação de gameplay online]]).

## Código afetado
`server/session.ts` (`onHit`, `onStab`, `onBoom`, `LAG_SLACK`), `client/main.ts` (envio de `hit`), `client/net/remote.ts`. Ver [[Anti Cheat]], [[Damage System]].
