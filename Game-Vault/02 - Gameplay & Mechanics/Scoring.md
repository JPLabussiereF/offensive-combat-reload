---
title: Scoring
type: mechanic
status: documented
area: gameplay
source_paths:
  - shared/constants.ts
  - shared/protocol.ts
  - server/session.ts
  - server/progress.ts
  - server/accounts.ts
  - client/ai/bots.ts
  - client/main.ts
  - client/ui/scoreboard.ts
  - client/ui/strings.ts
  - shared/progression.ts
tags:
  - game
  - gameplay
  - scoring
updated: 2026-10-07
---

# Scoring

## Objetivo

Recompensar o abate e, acima dele, o **estilo**: tiro na cabeça, na virilha, de longe, facada pelas costas e, principalmente, a [[Humiliation]]. Os pontos definem a ordem do placar e, online, viram XP da arma que matou ([[Progression]]).

## Tabela de pontos (`SCORE` em `shared/constants.ts`)

| Prêmio (`AwardLabel`) | Nome no jogo (pt-BR / en) | Pontos | Quando |
| --- | --- | --- | --- |
| `kill` | Abate / Kill | **100** | todo abate de outro jogador ou bot |
| `headshot` | Tiro na cabeça / Headshot | **+50** | o tiro que matou acertou a cabeça |
| `groin` | No pássaro / Right in the birdie | **+100** | o tiro que matou acertou a virilha (que mata na hora) |
| `longShot` | Longa distância / Long shot | **+50** | o tiro que matou veio de **mais de 50 m** (`longShotDistance`) |
| `knife` | Facada / Knifed | **+50** | abate com a faca |
| `backstab` | Pelas costas / Backstab | **+50** | facada pelas costas (soma com `knife`); **+100** com o Peixe Congelado (passiva Tapa Gelado, [[Melee#Passivas]]) |
| `humiliation` | Opressão / Humiliation | **150** | dança completa sobre um corpo (evento separado do abate) |

O comentário no código explica o valor da opressão: *"Tripled: dancing on a body leaves you exposed for 3 s, it has to pay off."* Ver [[ADR - Pontuação da Opressão triplicada]].

### Combinações típicas

| Abate | Pontos |
| --- | --- |
| Rifle no corpo | 100 |
| Rifle na cabeça | 150 |
| Rifle na cabeça a mais de 50 m | 200 |
| "No pássaro" (virilha) | 200 |
| Facada de frente | 150 |
| Facada pelas costas | 200 |
| Granada ou mina | 100 (sem bônus) |
| Abate + opressão do mesmo corpo | abate + 150 |

## Regras

- **Os bônus só valem no golpe que mata.** No servidor, os prêmios são montados a cada acerto e só são somados se aquele dano matar (`damage` → `kill`).
- `headshot` e `groin` se excluem: a região do acerto decide o tipo (`head`, `groin` ou `gun`).
- `longShot` vale só para armas de fogo (rifles e secundárias). A distância usada é a informada pelo cliente, limitada ao alcance máximo da arma que atirou e conferida pelo servidor.
- **Poção crítica** ([[Buffs & Debuffs]]): todo tiro causa dano de cabeça, mas o prêmio continua sendo da região que foi acertada.
- **Mortes sem atacante** (queda, vazio, a própria granada, a Amora) não dão pontos a ninguém e **não tiram pontos** de ninguém. Só somam uma morte. Não há pontuação negativa.
- **Opressão:** a pontuação só sai se a dança durar pelo menos `HUMILIATION.duration` (3,2 s, com 0,4 s de tolerância no servidor). Se for interrompida, não pontua.

## Onde cada número vai

| Contador | Online | Contra bots | Treino |
| --- | --- | --- | --- |
| Pontos, abates, mortes e opressões **da sessão** | servidor, em memória; zera ao reentrar | `BotManager`, em memória | contador local |
| XP da arma que matou (`kill.arma`; um abate de pistola evolui a pistola) | soma dos pontos do abate | — | — |
| XP da conta | +25 por abate, +50 por opressão | — | — |
| Estatísticas da conta (abates, mortes, cabeça, virilha, facadas, pelas costas, granadas, opressões, tempo) | `player_stats` | — | — |
| Participação (pontos, abates, mortes e opressões daquela entrada) | `session_participation` | — | — |

A opressão soma à pontuação da sessão e ao XP da conta, mas **não** ao XP de nenhuma arma. Ver [[Progression]] e [[Player Data]].

## Saídas (feedback)

- **Pop-ups** com o nome e o valor de cada prêmio ([[HUD]]). Faixas "NO PÁSSARO!" e "OPRIMIDO!".
- **Kill feed** com o atacante, a arma que matou (nome da arma: "Rifle do Vovô", "Sabre de Luz Paraguaio"; ou do modo da granada: "Mina Terrestre") e a vítima ([[Notifications]]).
- **Placar** (`Tab`): #, jogador, nível, pontos, abates, mortes, opressões e ping. A ordem é por **pontos ↓**, depois **abates ↓**, depois **mortes ↑**. Online, o servidor manda `scores` a cada 1 s. Ver [[Scoreboard]].

## Estados / exceções

- Não há limite de pontos nem condição de vitória ([[Problem - Partidas sem fim]]).
- O nome de quem matou aparece na tela de morte da vítima.

## Dependências

[[Damage System]] (região e distância) · [[Combat]] · [[Melee]] · [[Grenades]] · [[Humiliation]] · [[Client Server Model]] (autoridade)

## Código relacionado

- `shared/constants.ts`: `SCORE`
- `shared/protocol.ts`: `AwardLabel`, `Award`, `KillKind`, mensagens `kill`, `tauntEnd` e `scores`
- `server/session.ts`: `onHit`, `onStab` (montam os prêmios), `kill` (soma, estatísticas e XP), `onTauntEnd`
- `client/ai/bots.ts`: `BotManager.kill` e `finishTaunt` (as mesmas regras, offline)
- `client/main.ts`: `award` e `onKill` (treino), popups dos prêmios online e contra bots
- `client/ui/scoreboard.ts`: ordenação e colunas
- `client/ui/strings.ts`: nomes dos prêmios (`kill`, `headshot`, `groin`, `longShot`, `knife`, `backstab`, `humiliation`)

## Configurações relacionadas

`SCORE` em `shared/constants.ts` (ver [[Constants Reference]]). `ACCOUNT_XP` vem de `shared/data/nivel_conta.json`.
