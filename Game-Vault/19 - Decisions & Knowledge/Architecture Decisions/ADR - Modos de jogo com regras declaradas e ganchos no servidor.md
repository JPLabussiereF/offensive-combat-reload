---
title: ADR - Modos de jogo com regras declaradas e ganchos no servidor
type: decision
status: documented
area: architecture
source_paths:
  - shared/modes.ts
  - server/modes.ts
  - server/session.ts
  - server/app.ts
  - shared/protocol.ts
  - client/main.ts
  - client/ai/bots.ts
  - client/ui/home.ts
  - shared/zombieMatch.ts
tags:
  - decision
  - adr
  - architecture
  - modes
updated: 2026-10-06
---

# ADR - Modos de jogo com regras declaradas e ganchos no servidor

## Contexto

Não havia abstração de modo: "online", "contra bots" e "campo de tiro" eram ramificações em `client/main.ts`, e o servidor só sabia fazer mata-mata. Chegaram dois modos de regra (mata-mata e corrida armada) e há um terceiro previsto (zumbi).

## Problema

Separar **onde se joga** (online, bots, treino) de **que regra se joga** (modo), sem espalhar `if (modo === ...)` pela `Session` e pelo cliente.

## Opções consideradas

- Uma classe `Session` por modo (herança). Duplica o que todos compartilham (movimento, dano, corpos, coletáveis, chat).
- **Regras declaradas + ganchos** (adotada).

## Decisão

1. `shared/modes.ts`: `GameModeId` e `MODE_RULES` com as diferenças que o cliente também precisa saber — `weapons` (`'arsenal'` | `'mode'`), `lockedLoadout`, `grenades`, `weaponXp`, `rounds`, `bots`.
2. `server/modes.ts`: interface `SessionMode` com ganchos — `joinLoadout`, `info` (campos extras do jogador, como `ladder`), `combatOpen`, `onJoin`, `onLeave`, `onKill` (roda antes do `kill` ser anunciado e devolve mensagens para depois), `tick`. O modo age pela `ModeHost` (`broadcast`, `setLoadout`, `info`, `giveAccountXp`, `resetForRound`). `createMode(id, host)` escolhe a implementação.
3. A `Session` recebe o modo no construtor e aplica as regras declaradas (recusa `loadout` com `lockedLoadout`, ignora `grenade` sem granadas, XP de arma só com `weaponXp`, sem dano com `combatOpen()` falso).
4. Sessões têm modo (`SessionInfo.mode`); o lobby mantém uma sala fixa e sempre uma com vaga **por mapa e por modo**.
5. Offline, o `BotManager` recebe o modo (`game`) e aplica as mesmas funções puras compartilhadas.

## Como adicionar um modo (ex.: zumbi)

1. Id e regras em `MODE_RULES` (`shared/modes.ts`); regras puras próprias num módulo `shared/<modo>.ts` (como `shared/gunGame.ts`).
2. Uma classe que implementa `SessionMode` em `server/modes.ts` e um `case` em `createMode`. Mensagens de fim de rodada podem reusar `roundEnd` (`winner: null` quando ninguém vence) e `roundStart`.
3. O lobby cria as salas fixas sozinho (`GAME_MODE_IDS × MAP_IDS`, ids `<modo>-<mapa>`).
4. Strings `gameMode_<id>` e `gameModeDesc_<id>` (pt-BR e en; o teste `client/tests/arsenalText.test.ts` cobra).
5. No cliente, a home já lista o modo (online; contra bots se `bots: true`); comportamento próprio em `client/main.ts` lendo `gameMode`/`rules`, e no `BotManager` se tiver bots.
6. Uma nota em `03 - Game Modes/` a partir do [[Mode Template]].

## Atualização: o modo zumbi (2026-10-06)

O terceiro modo previsto chegou ([[Zombie]]) e precisou de inimigos simulados pelo servidor e de um estado "caído". A estrutura continuou a mesma, com acréscimos:

- `ModeRules` ganhou `coop` (todos contra os inimigos do modo: sem fogo amigo, sem opressão de colegas, sem mexer em abates/mortes da conta) e `maps` (os mapas em que o modo é jogado; `modeMaps(id)`). O lobby só cria salas do modo nesses mapas, e `create` num mapa fora da lista cai no primeiro deles.
- `SessionMode` ganhou ganchos opcionais: `handle` (mensagens que a `Session` não conhece: `zhit`, `zstab`, `box`, `revive`), `blast` (o que uma granada já validada atingiu dos inimigos do modo), `onLethal` (vida a zero: `true` quando o modo assume no lugar da morte), `joinState` (campos extras do `joined`), `snapshot` (mensagem enviada logo depois de cada `snap`) e `dispose`.
- `ModeHost` ganhou `map`, `damage` (dano dos inimigos do modo, passando pelas regras comuns e pelo `onLethal`), `kill` (uma morte decidida pelo modo, anunciada como as outras), `firedGun` e `fireRate` (as mesmas checagens de tiro da `Session`).
- `SPlayer.downed`: caído, não morto (não leva dano, não regenera, não acerta nada); o modo decide quando acaba.
- Decisões do modo: [[ADR - Zumbis simulados no servidor sobre navmesh pré-gerada]] e [[ADR - Modo zumbi cooperativo com caixão e raridades]].

## Motivo

O que muda entre modos fica num lugar só e com nome; a `Session` continua dona das regras comuns; online e offline usam os mesmos dados.

## Consequências

- O número de salas fixas cresce com os modos (3 mapas × 2 modos + 1 sala zumbi = 7 hoje).
- O cliente ainda tem ramificações por modo em `client/main.ts` (HUD da escada, modo lâmina), agora guiadas por `MODE_RULES`.
- Os ids das salas fixas do mata-mata (`principal`, `jardim`, `halloween`) foram mantidos para não quebrar links e testes.

## Código afetado

`shared/modes.ts`, `server/modes.ts`, `server/session.ts`, `server/app.ts`, `shared/protocol.ts`, `client/main.ts`, `client/ai/bots.ts`, `client/ui/home.ts`.

Relacionado: [[Game Modes Index]] · [[Sessions]] · [[Matchmaking]] · [[Server Architecture]] · [[ADR - Corrida armada]] · [[ADR - Equipamento travado no mata-mata]]
