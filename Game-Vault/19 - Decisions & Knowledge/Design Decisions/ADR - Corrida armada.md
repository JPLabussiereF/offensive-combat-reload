---
title: ADR - Corrida armada
type: decision
status: documented
area: design
source_paths:
  - shared/gunGame.ts
  - shared/data/corrida_armada.json
  - shared/modes.ts
  - shared/arsenal.ts
  - server/modes.ts
  - server/session.ts
  - server/app.ts
  - client/main.ts
  - client/ai/bots.ts
  - client/ai/bot.ts
  - client/render/viewmodel.ts
  - client/ui/strings.ts
tags:
  - game
  - decision
  - modes
updated: 2026-10-07
---

# ADR - Corrida armada

## Contexto

Até aqui a progressão por melhorias trocava a arma do jogador no meio da partida assim que um nível subia. O usuário observou que isso combina com um modo "corrida armada" (gun game), e pediu dois modos padrão: **mata-mata** (equipamento travado, ver [[ADR - Equipamento travado no mata-mata]]) e **corrida armada**, com estas regras:

- matar **3 inimigos com a mesma arma** para passar à próxima;
- **morrer por facada volta uma arma**, e é preciso fazer 3 abates de novo;
- o **último abate, que decide a partida, é com o Sabre de Luz**; nesse ponto o sabre fica sempre na mão e o ataque não exige a tecla de faca — o tiro golpeia; esse "andar com a faca na mão" é **exclusivo** deste modo;
- a vitória mostra o vencedor a todos e começa uma nova rodada, todos de volta à primeira arma; placar e HUD mostram a posição de cada um na escada;
- funcionar online com autoridade do servidor e, se couber, contra bots.

## Problema

Definir a escada, como as regras ficam iguais online e offline, o que acontece com o XP, e o que fica ambíguo no pedido (quantos abates com o sabre, o que a facada dá a quem esfaqueia, granadas, quem entra no meio).

## Opções consideradas

- **Escada com as melhorias do próprio jogador** — injusto: quem tem mais níveis teria armas melhores no mesmo degrau. Descartada.
- **Escada com atributos fixos por degrau** (adotada): arma + lista de melhorias no JSON, montada com `gunStats`/`meleeStats` — a API de [[ADR - Progressão por melhorias de arma]] foi feita para isso.
- **Regras só no servidor** × **funções puras compartilhadas** (adotada): `shared/gunGame.ts` é usado pelo servidor e pelo `BotManager`, como as demais regras compartilhadas ([[ADR - Código compartilhado entre cliente e servidor]]).
- Sabre exigindo 3 abates × **1 abate** (adotado): o pedido fala do "último abate que decide"; 1 abate é a convenção do gênero e evita uma reta final arrastada só com faca.

## Decisão

1. **Escada** (`shared/data/corrida_armada.json`): 6 degraus de arma de fogo e o sabre — Rifle Completo, Liquidificador Turbo, Rifle com Luneta, Rifle Silenciado, Pistola Ligeira, Pistola da Batata, Sabre de Luz. Das armas mais fáceis às mais difíceis. 3 abates por degrau, 1 com o sabre. Ver [[Gun Game]].
2. **Abate que conta** (revisado em 2026-10-07, ver abaixo): com a arma do degrau ou **com a faca** (no último, a facada do sabre). Originalmente a faca comum (golpe rápido) nos outros degraus **não contava** para quem esfaqueava — só derrubava a vítima.
3. **Facada** (revisada em 2026-10-06, ver abaixo): a vítima **perde um abate**. Sem abates no degrau, volta à arma anterior com um abate a menos que o necessário para subir de novo; no primeiro degrau sem abates, nada muda. Vale para faca e sabre.
4. **Sabre na mão**: novo campo `Loadout.soFaca` (só a escada o entrega). O cliente mostra a lâmina sempre na mão e o tiro golpeia; o servidor recusa tiros de armas de fogo desse loadout.
5. **Sem granadas** neste modo (`MODE_RULES.grenades = false`): um abate de granada nunca contaria, e minas/explosões estragariam a corrida.
6. **Rodadas**: vitória → `roundEnd` → 6 s sem dano → `roundStart`: degraus, abates, mortes e pontos zerados, todos renascem já. É o primeiro modo com fim de partida ([[Problem - Partidas sem fim]]).
7. **XP**: abates **não dão XP de arma** (as armas são da escada, não do Arsenal do jogador); a conta ganha XP normalmente e **+150** ao vencer (`xpVitoria`).
8. **Entrada no meio**: começa no primeiro degrau.
9. **Sessões**: cada mapa tem uma sala fixa de corrida armada (`corrida-armada-<mapa>`) e sempre uma com vaga ([[Matchmaking]]).
10. **Bots**: o `BotManager` aplica a mesma escada; o bot recebe as armas do degrau (`Bot.arm`) e, com o sabre, corre para esfaquear em vez de atirar ([[ADR - Bots como jogadores completos]]).

## Revisão 2026-10-06: a facada tira um abate

A regra original (descer o degrau inteiro e zerar os abates) foi achada punitiva demais jogando: uma facada desfazia até 5 abates de progresso. A pedido de um jogador do grupo (JPLabussiereF), a facada passa a tirar **um abate**, cruzando para a arma anterior só quando não há abates no degrau. A figurinha **Esfaqueador** do álbum conta cada abate tirado na faca.

Alternativas consideradas: manter a regra (descartada pelo pedido); tirar um abate sem nunca voltar de arma (descartada: a facada ficaria inútil contra quem acabou de subir).

## Revisão 2026-10-07: a facada conta como abate

A pedido do usuário ("na corrida armada, matar com a faca deve contar como uma kill para a progressão de arma"), o abate com a faca de cozinha num degrau de arma de fogo passa a valer **um abate** do degrau, exatamente como um abate com a arma da vez: o terceiro abate do degrau, com a faca, sobe de arma. A regra da vítima não muda: morrer por facada ainda tira um abate dela, então a facada agora vale dos dois lados (o atacante ganha um, a vítima perde um).

- **Último degrau**: o sabre já vencia com uma facada; nada muda.
- **Penúltimo degrau**: a facada que completa os abates leva ao sabre, como um tiro; não pula o sabre nem vence direto (a vitória continua exigindo o abate com o sabre na mão).
- Outros tipos de abate (granada, mina, queda, cachorro) continuam sem contar.

Alternativas consideradas: a facada subir um degrau inteiro (como em alguns gun games) — descartada: o pedido fala de "uma kill", e subir direto deixaria a corrida curta demais com a faca sempre à mão; manter a faca fora da progressão — descartada pelo pedido.

Código: `killCounts` em `shared/gunGame.ts` (servidor e `BotManager` usam a mesma função, então online e offline mudam juntos); texto da regra na pausa (`pmRuleClimb` em `client/ui/strings.ts`); testes em `server/tests/modes.test.ts` e `client/tests/offlineModes.test.ts`.

## Motivo

Regras do usuário, justiça (mesmas armas para todos), uma só implementação das regras para online e offline, e números em JSON para balancear sem mexer em código.

## Consequências

- Protocolo novo: `SessionInfo.mode`, `create.mode`, `PlayerInfo.ladder`, `roundEnd`, `roundStart`; `playerLoadout` agora chega também ao próprio jogador ([[Remote Calls]]). Cliente e servidor precisam ser publicados juntos.
- Ao subir de degrau, tiros da arma anterior que chegam em até 1 s ainda contam (latência), como na troca de arma.
- A sala fica 6 s sem dano entre rodadas.
- Quem abandona a rodada perde o degrau (o estado da escada fica só em memória, como o resto da sessão).

## Código afetado

`shared/gunGame.ts` (novo), `shared/data/corrida_armada.json` (novo), `shared/modes.ts` (novo), `shared/arsenal.ts` (`soFaca`), `shared/protocol.ts`, `server/modes.ts` (novo), `server/session.ts`, `server/app.ts`, `client/main.ts`, `client/ai/bots.ts`, `client/ai/bot.ts`, `client/render/viewmodel.ts`, `client/character/animator.ts`, `client/entities/avatar.ts`, `client/net/remote.ts`, `client/ui/hud.ts`, `client/ui/scoreboard.ts`, `client/ui/ladder.ts` (novo), `client/ui/home.ts`, `client/ui/strings.ts`, `index.html`, `client/styles.css`, `server/tests/modes.test.ts` (novo).

Relacionado: [[Gun Game]] · [[ADR - Modos de jogo com regras declaradas e ganchos no servidor]] · [[Weapons]] · [[Melee]]
