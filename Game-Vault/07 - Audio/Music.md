---
title: Music
type: system
status: partial
area: audio
source_paths:
  - client/audio/sfx.ts
  - client/main.ts
  - client/gameplay/taunt.ts
  - client/world/blockoutMap.ts
  - client/world/hauntedTown.ts
  - client/world/jardim/lanternas.ts
tags:
  - game
  - audio
  - music
updated: 2026-10-05
---

# Music

## Não existe trilha sonora

**Não há música de fundo, de menu nem de partida** no código atual. Verificado em `client/` (busca por arquivos `.mp3`/`.ogg`/`.wav`, `new Audio(`, `<audio>` e chamadas de música em `client/main.ts` e `client/ui/*.ts`): o menu inicial, a tela de carregamento e a partida são silenciosos, exceto pelos efeitos ([[SFX]]) e pelo ambiente ([[Ambient Audio]]).

O que existe de "musical" são trechos curtos sintetizados no momento, todos ligados a eventos de gameplay.

## Música da dança (humilhação)

`Sfx.danceMusic(duração)` — um loop funk curto a **150 bpm** (batida de 0,4 s) tocado enquanto o jogador dança sobre um corpo ([[Humiliation]]):

- bumbo (seno 140→45 Hz) em toda batida;
- baixo em onda quadrada com padrão de 8 notas (sol, sol, ré, dó, sol, sol, fá, mi graves);
- chimbal (ruído passa-alta 7 kHz) no contratempo;
- melodia em triângulo com padrão de 16 colcheias.

A duração vem da dança (`HUMILIATION.duration` = 3,2 s em `shared/constants.ts`, lida por `Taunt.duration` em `client/gameplay/taunt.ts`). A função devolve um "stop" que faz fade-out rápido e desconecta o barramento — guardado em `Taunt.stopMusic` e chamado por `Taunt.cancel()` quando a dança é interrompida (morte do dançarino). É chamada em `client/main.ts` via `taunt.start(corpse, ..., (d) => sfx.danceMusic(d))`.

> [!info]
> A música da dança toca "na cabeça" (barramento `sfx`) apenas para quem dança. Outros jogadores não ouvem a música de quem os humilha: inferido porque `danceMusic` não é chamada a partir de eventos de rede em `client/main.ts`.

## Jingles de props

| Som | Onde | Descrição |
| --- | --- | --- |
| `iceCream()` | Caminhão de sorvete, [[Map - Rua dos Vizinhos]] | Melodia de caixinha de música (15 notas em triângulo), quando o caminhão leva tiro (no máx. 1 a cada 4 s). |
| `carnivalJingle()` | Barraca de tiro ao alvo, [[Map - Vila Assombrada]] | Fanfarra de calíope quando todos os alvos caem. |
| `bell(tamanho, nota)` | Carrilhão do mercado, [[Map - Jardim do Dragão]] | Cinco sinos afinados em dó, ré, mi, fá e sol: os jogadores podem "tocar" uma melodia atirando. |
| `levelUp()` | Global | Fanfarra curta de subida de nível. |
| `sadTrombone()` | Global | Trombone triste na própria morte. |

## Código relacionado

- `client/audio/sfx.ts` — `danceMusic`, `iceCream`, `carnivalJingle`, `bell`, `levelUp`, `sadTrombone`.
- `client/main.ts` — chamada de `danceMusic` ao iniciar a dança.
- `client/world/blockoutMap.ts`, `client/world/hauntedTown.ts`, `client/world/jardim/lanternas.ts` — jingles de props.

## Ver também

[[Audio Overview]] · [[Audio Events]] · [[Humiliation]] · [[Map Gags]]
