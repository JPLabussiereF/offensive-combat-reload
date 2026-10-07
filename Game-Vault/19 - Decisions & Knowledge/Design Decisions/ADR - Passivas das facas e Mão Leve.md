---
title: ADR - Passivas das facas e Mão Leve
type: decision
status: documented
area: decisions
source_paths:
  - shared/data/weapons/faca.json
  - shared/data/weapons/colher.json
  - shared/data/weapons/frango.json
  - shared/data/weapons/baguete.json
  - shared/data/weapons/peixe.json
  - shared/data/weapons/macarrao.json
  - shared/data/weapons/sabre.json
  - shared/data/progression.json
  - shared/weapons.ts
  - shared/arsenal.ts
  - server/session.ts
  - client/main.ts
  - client/ai/bots.ts
  - client/ai/bot.ts
  - client/ui/arsenal.ts
  - client/ui/arsenalCanvas.ts
tags:
  - decision
  - adr
  - melee
  - progression
updated: 2026-10-07
---

# ADR - Passivas das facas e Mão Leve

## Contexto

O usuário perguntou se existe vantagem em evoluir a faca: "hoje todas elas têm as mesmas passivas [...] não parece ter, ou se tem, não está descrito de forma clara". Ele pediu para melhorar isso e incentivar o jogador a evoluir a faca.

## Problema

Estado em 2026-10-06 ([[ADR - Rifles e facas antigos como armas próprias]], decisão 7):

- **Poucos níveis:** a árvore da faca tinha 3 níveis, contra 9 do rifle e 5 da pistola. As duas melhorias valiam igual para as 7 facas.
- **Afiador fraco:** o intervalo ×0,8 quase não pesa, porque a facada mata com um golpe e o intervalo só conta quando se erra.
- **Só o Tênis tinha efeito real:** investida +0,6 m e ×1,2 de velocidade. É uma vantagem sutil.
- **Facas antigas como trocas:** liberadas até 9.000 pts, são trocas de alcance, investida e velocidade, e nenhuma é melhor que as outras. Liberar uma faca dava variedade, mas nada de novo para fazer.
- **Nada visível no Arsenal:** as armas de fogo mostram barras de atributo, as facas não. Elas só tinham uma descrição em prosa.

## Opções consideradas

- **Só deixar claro no Arsenal:** barras e números. Mostra a diferença, mas a diferença continua pequena.
- **Só uma árvore nova:** mais níveis. Dá vontade de evoluir, mas as facas continuam parecidas entre si.
- **Árvore nova + clareza + uma passiva por faca** (adotada, escolhas do usuário em 2026-10-07):
  - Das melhorias propostas, o usuário escolheu a Mão Leve e o Afiador revisto. O "Golpe Largo" (cone de 60°) e o "Embrulho de Jornal" (abafar o som) ficaram de fora.
  - O usuário aprovou a lista de passivas como proposta.

## Decisão

1. **Árvore da faca com 4 níveis**, todos comuns e valendo para as 7 facas:
   - Afiador (nível 2, 600 pts): intervalo ×0,8 e **+0,2 m de alcance do golpe**.
   - Tênis de Molinha (nível 3, 2.800 pts): sem mudança.
   - **Mão Leve** (nível 4, 4.500 pts): duração do golpe ×0,7, pelo efeito novo `duracao`. A arma volta à mão antes.

   Ninguém perde nível e não há migração: os limiares antigos não mudaram.
2. **Uma passiva por faca** (`passiva` no JSON; tabela em [[Melee#Passivas]]): Discreta (faca de cozinha), Colo de Vó (colher, +50 de vida por abate), Fuga Escandalosa (frango, ×1,15 de velocidade por 3 s após um abate), Pausa pro Lanche (baguete, pente cheio por abate), Tapa Gelado (peixe, "Pelas costas" +100), Boia (macarrão, sem dano de queda) e Vuuum (sabre, o golpe acerta todos no alcance e no cone).
3. **Só com a faca da conta** (escolha do usuário): `knifePassive(faca, modo)` devolve null quando as armas vêm do modo (`MODE_RULES[modo].weapons === 'mode'`: corrida armada e zumbi). Valem no mata-mata, no campo de tiro e contra bots, para o jogador e para os bots. A Discreta é o som da faca de cozinha e continua valendo em todo modo.
4. **Clareza no Arsenal** (tela inicial e menu de pausa): as facas ganham barras (alcance do golpe, investida, rapidez, discrição) e um bloco com a passiva e onde ela vale ([[Inventory UI]]).
5. **Autoridade:**
   - O servidor aplica o que é dele: vida (colher), prêmio (peixe), queda relatada (macarrão) e a validação dos golpes (sabre: os `stab` do mesmo golpe em até 150 ms, cada alvo uma vez).
   - O cliente aplica o que já é confiado a ele: velocidade (frango) e munição (baguete).

## Motivo

- Cada passiva dá uma razão para liberar e escolher aquela faca, e as trocas de alcance e velocidade continuam. Escolher a faca segue sendo questão de estilo, como pede o ADR das facas antigas.
- As passivas agem no abate ou no próprio jogador, porque a facada já mata de um golpe e um efeito na vítima não serviria para nada.
- Limitar as passivas à faca da conta mantém o equilíbrio da corrida armada (o sabre do último degrau não acerta vários) e do zumbi.

## Consequências

- **Positivas:**
  - Evoluir a faca muda o jogo: cada nível e cada faca liberada traz algo que se sente.
  - O Arsenal mostra o que muda.
- **Negativas:**
  - O sabre fica forte em grupos no mata-mata, mas é a última faca a liberar (9.000 pts) e tem o golpe mais lento.
  - A colher dá sobrevida a quem fica no corpo a corpo.
  - A velocidade do frango e o pente da baguete confiam no cliente, como o movimento e a munição já confiavam ([[ADR - Movimento confiado ao cliente]]).
- **A conferir jogando:** os valores (50 de vida, ×1,15 por 3 s, +100, 150 ms) saíram de cálculo, não de medição.

## Código afetado

- `shared/weapons.ts` (`KnifePassive`, `MeleeData.passiva`), os JSONs das facas, `shared/data/progression.json`, `shared/progression.ts` (`Efeitos.duracao`), `shared/arsenal.ts` (`meleeStats`, `knifePassive`).
- `server/session.ts` (`onStab`, `selfDamage`, `SWEEP_MS`, `SPlayer.stabbed`).
- `client/main.ts` (`stabOne`, `knifeKillPassive`, `ownPassive`, velocidade), `client/entities/localPlayer.ts` (`noFallDamage`), `client/weapons/weapon.ts` (`fillMag`), `client/weapons/melee.ts` (`meleeTargets`).
- `client/ai/bots.ts` (`HitInfo.knife`, `stab`, `kill`), `client/ai/bot.ts` (`knifeKill`).
- `client/ui/arsenal.ts` e `client/ui/arsenalCanvas.ts` (barras e passiva), `client/ui/strings.ts`.
- Testes: `server/tests/knifePassives.test.ts`, `server/tests/arsenal.test.ts`.

Ver também: [[Melee]], [[Progression]], [[Inventory UI]].
