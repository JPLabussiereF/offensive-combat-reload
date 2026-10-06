---
title: Problem - Bots só existem offline
type: problem
status: documented
area: decisions
source_paths:
  - README.md
  - client/main.ts
  - client/ai/bots.ts
  - server/session.ts
  - server/navmesh.ts
  - shared/zombieMatch.ts
  - tools/bake-navmesh.ts
tags:
  - problem
  - ai
  - bots
  - multiplayer
updated: 2026-10-06
---

# Problem - Bots só existem offline

## Descrição

Os bots rodam inteiramente no cliente, dentro do modo "Contra bots". Sessões online não têm bots: uma sessão com poucos jogadores fica vazia.

## Evidência

- README, seção "Bots": "Por enquanto os bots existem só offline; bots nas sessões online precisam de simulação no servidor." e "Próximo passo (Fase 2): ... bots nas sessões online (simulados no servidor)".
- `client/main.ts`: `NavMap.build` e `BotManager` só são criados quando `choice.mode === 'bots'`.
- `server/session.ts` não simula movimento nem física (o movimento é confiado ao cliente: "Not yet: server-side movement simulation"), então não tem como mover um bot.

## Causa

A IA depende de Rapier (movimento compartilhado, raios de visão, tiros) e de Recast (navmesh), que hoje só rodam no navegador. O servidor não tem mundo físico.

## Impacto

- Online, salas com 1–2 pessoas não têm oponentes.
- Regras de abate/prêmio existem em duas implementações (servidor e `BotManager`), o que pode divergir.

## Caminho apontado pelo projeto

Simulação de movimento no servidor (que também habilitaria predição/reconciliação e compensação de lag, listadas como "Ainda não feito" no README). Exigiria rodar Rapier/Recast no Bun (inferência).

## Atualização (2026-10-06): o servidor já anda no mapa

O [[Zombie|modo zumbi]] pôs **Recast/Detour para rodar no servidor** (Bun), sobre uma navmesh do mapa **pré-gerada** a partir do código do cliente (`tools/bake-navmesh.ts`, `server/navmesh.ts`): os zumbis são simulados lá, com hitboxes e validação de acertos iguais às dos jogadores ([[ADR - Zumbis simulados no servidor sobre navmesh pré-gerada]]). Bots online continuam não existindo, mas a parte de **navegação** do problema está resolvida para os mapas com malha pré-gerada (hoje só a Vila Assombrada). Para bots completos online ainda faltariam o movimento compartilhado com física no servidor (Rapier) e linha de visão de verdade (a do zumbi é um raycast na navmesh).

## Código relacionado

`client/ai/*`, `client/main.ts`, `server/session.ts`.

Ver também: [[AI Overview]], [[ADR - Bots como jogadores completos]], [[Client Server Model]], [[Technical Debt]].
