---
title: ADR - Facada dos bots com uma chance por aproximação
type: decision
status: documented
area: decisions
source_paths:
  - client/ai/bot.ts
  - client/ai/bots.ts
  - client/ai/botKnife.ts
  - client/weapons/melee.ts
  - client/tests/botKnife.test.ts
tags:
  - decision
  - adr
  - ai
  - bots
  - melee
updated: 2026-10-07
---

# ADR - Facada dos bots com uma chance por aproximação

## Contexto

Na mesma data, a facada passou a contar como abate na [[Gun Game|corrida armada]] ([[ADR - Corrida armada]], revisão 2026-10-07). Jogando contra bots, o usuário relatou que eles ficaram "invencíveis por conta da facada" e que "dão facada até mesmo quando estão de costas". Ele pediu que os bots tenham **apenas uma chance de dar uma facada ao se aproximar**.

## Problema

Pelo código, a facada do bot (`client/ai/bot.ts` e `BotManager.stab`) não seguia a regra do golpe do jogador ([[Melee]]):

- golpeava com o alvo a menos de 2,2 m **em qualquer direção**: sem cone e sem linha de visão, e o bot percebe quem está a menos de 4 m mesmo fora do campo de visão;
- ignorava o tempo de reação (`reactionLeft`), que só valia para o tiro;
- o golpe acertava **na hora**, sem o `impacto` de 0,14 s;
- repetia o golpe a cada `intervalo + 0,3` s (0,9 s com a faca de cozinha) enquanto o alvo estivesse perto, e o bot avançava para a faca sempre que o alvo estava a menos de 3,5 m.

## Opções consideradas

- **Só aplicar ao bot as regras do golpe do jogador** (cone, visão, reação, impacto). É justo, mas o bot ainda golpearia de novo a cada 0,6 s, e o pedido era de uma só chance.
- **Tirar a faca dos bots na corrida armada.** Mudaria o modo de jogo, e o último degrau é só o sabre.
- **Chance aleatória de errar.** É opaca para o jogador, que não entende por que o golpe errou.
- **Regras do jogador + uma chance por aproximação + hesitação por dificuldade** (adotada).

## Decisão

1. O bot só começa o golpe com o tempo de reação esgotado e o alvo no alcance e na frente, pelo mesmo `findMeleeTarget` do jogador: `alcance` da faca, cone de `anguloGraus` (±45°), altura e linha de visão. De costas, ele precisa virar primeiro, no limite de `turnSpeed`.
2. Com isso valendo, o bot hesita `knifeDelay` (fácil 0,30 s, normal 0,20 s, difícil 0,12 s, ×0,8–1,3).
3. O golpe acerta no `impacto` da faca, se o alvo ainda estiver a até `alcance + 0,4` m, no cone e à vista (a regra do jogador sem investida). Fora disso, é um golpe no vazio.
4. **Uma chance por aproximação:** depois de golpear um alvo, acertando ou errando, o bot só pode golpear esse alvo de novo depois de se afastar mais de `KNIFE_REARM` = 5 m dele. A chance é por alvo e volta toda a cada vida.
5. Sem a chance, o bot de arma de fogo não avança mais para a faca: recua e atira. O bot só com o sabre recua de frente até passar de 5 m e então volta a correr para o alvo.

## Motivo

- O jogador consegue ver o golpe chegando (o bot precisa estar virado para ele) e esquivar dele (hesitação + impacto).
- Errar o único golpe deixa o bot exposto: é a janela para o jogador revidar.
- A regra é por aproximação, e não por tempo, como foi pedido: ficar colado ao bot não lhe dá um segundo golpe.

## Consequências

- **Positivas:** a facada dos bots volta a ser um risco, e não uma sentença; as dificuldades se diferenciam também de perto; a regra é pura e testada (`client/tests/botKnife.test.ts`).
- **Negativas:**
  - É uma exceção ao [[ADR - Bots como jogadores completos]]: o jogador não tem a regra da uma chance.
  - Os bots do sabre ficam mais fracos no último degrau, porque recuam depois de cada golpe errado. A rodada pode durar mais contra bots.
- **A conferir jogando:** os valores de `knifeDelay` e de `KNIFE_REARM` saíram de cálculo, não de medição.

## Código afetado

- `client/ai/bot.ts`: `BotSkill.knifeDelay`, golpe em andamento (`swingTarget`/`swingT`), movimento em `engage`.
- `client/ai/bots.ts`: `stab` acerta só no alcance, no cone e à vista.
- `client/ai/botKnife.ts`: `BotKnife`, `KNIFE_REARM`.
- `client/weapons/melee.ts`: `findMeleeTarget` aceita qualquer `{ world }`.

Ver também: [[AI Decisions]], [[Melee]], [[Gun Game]].
