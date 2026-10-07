---
title: ADR - Bots como jogadores completos
type: decision
status: documented
area: decisions
source_paths:
  - client/ai/bot.ts
  - client/ai/bots.ts
  - client/ai/botKnife.ts
  - client/ai/navmesh.ts
  - README.md
tags:
  - decision
  - adr
  - ai
  - bots
updated: 2026-10-07
---

# ADR - Bots como jogadores completos

## Contexto

O modo "Contra bots" oferece mata-mata livre offline. O comentário de `client/ai/bot.ts` cita a seção 14 do documento de design: "Bots com navmesh e árvore de comportamento simples".

## Problema

Bots que trapaceiam (mira perfeita, ver através de paredes, movimento próprio) treinam mal o jogador e divergem das regras do jogo.

## Opções consideradas

- IA com atalhos (acesso direto a posições, hitscan sem dispersão, movimento simplificado).
- Bot como um jogador dirigido por código, usando os mesmos sistemas (adotada).

## Decisão

"Um bot é um jogador dirigido por código. Usa exatamente o que um humano usa: o passo de movimento compartilhado, uma `Weapon` (cadência, dispersão, recuo), as mesmas hitboxes e avatar. Só as decisões são artificiais" (cabeçalho de `client/ai/bot.ts`). O `BotManager` aplica dano, prêmios, corpos e respawns "com as mesmas regras do servidor", tratando o jogador local como mais um `Combatant`. A navegação vem de uma navmesh Recast gerada dos **colisores** do mapa. A dificuldade só muda parâmetros humanos: reação, velocidade de giro, erro de mira, controle de recuo, rajadas, campo de visão e agressividade (`BOT_SKILLS`).

## Motivo

Justiça e coerência (README: "cada bot é um jogador completo: usa o mesmo movimento, o mesmo Rifle Padrão (...), as mesmas hitboxes e as mesmas regras de pontos"); bots percebem só por campo de visão e linha de visão, e reagem a quem atira neles.

## Consequências

- Positivas: comportamento crível; qualquer mudança em movimento/arma vale também para os bots; mapas glTF ganham bots sem trabalho extra.
- Negativas: cada bot custa um corpo Rapier + controlador + rig de hitboxes + raios de visão (custo de CPU proporcional ao número de bots, até 9); a geração da navmesh soma ao carregamento; regras de abate duplicadas com o servidor.
- Bots ainda não usam granadas, minas, coletáveis nem poções; não existem online. Ver [[Problem - Bots só existem offline]].
- Exceção deliberada (2026-10-07): a facada do bot segue as regras do golpe do jogador, mas o bot só golpeia **uma vez por aproximação** a cada alvo, uma limitação que o jogador não tem. Ver [[ADR - Facada dos bots com uma chance por aproximação]].

## Código afetado

`client/ai/bot.ts`, `client/ai/bots.ts`, `client/ai/navmesh.ts`, `client/main.ts` (seção "Bots").

Ver também: [[AI Overview]], [[AI Decisions]], [[Versus Bots]].
