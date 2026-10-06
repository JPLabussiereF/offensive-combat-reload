---
title: Mode Template
type: reference
status: documented
area: game-modes
source_paths:
  - server/modes.ts
  - shared/modes.ts
  - client/ui/home.ts
  - client/main.ts
  - server/session.ts
tags:
  - game
  - modes
  - template
updated: 2026-10-06
---

# Mode Template

Modelo para documentar um modo de jogo. Copie o bloco abaixo para uma nota nova em `03 - Game Modes/` (ou `Other Modes/`), preencha a partir do código e adicione o modo ao [[Game Modes Index]].

**Regras de preenchimento**
- Escreva só o que **difere** das regras globais. O que vale para todos os modos fica em [[Game Rules]], [[Scoring]] e [[Respawn]]; aqui, linke essas notas.
- Cada número deve citar a fonte (constante ou JSON). O que não está no código vira `unknown` ou um aviso de inferência.
- Se o modo ainda não existe, crie a nota mesmo assim com `status: unknown` e a frase "Não existe no código atual (verificado em …)".

## Onde um modo "vive" no código

Um **modo de jogo** (regra) é separado de **onde se joga** (online, bots, treino):
1. id e regras declaradas em `MODE_RULES` (`shared/modes.ts`): de onde vêm as armas, loadout travado, granadas, XP de arma, rodadas, bots;
2. o lado do servidor: uma classe `SessionMode` em `server/modes.ts` (ganchos `joinLoadout`, `info`, `combatOpen`, `onKill`, `tick`…), escolhida por `createMode`;
3. regras puras compartilhadas (se houver) num `shared/<modo>.ts`, usadas pelo servidor e pelo `BotManager` (`client/ai/bots.ts`);
4. o que o cliente mostra: a home (`client/ui/home.ts`) lista o modo sozinha; HUD e comportamento próprios em `client/main.ts`.

O roteiro completo está em [[ADR - Modos de jogo com regras declaradas e ganchos no servidor]].

---

```markdown
---
title: <Nome do modo>
type: mode
status: draft
area: game-modes
source_paths:
  - <arquivo real>
tags:
  - game
  - modes
updated: AAAA-MM-DD
---

# <Nome do modo>

## Objetivo

## Condição de vitória

## Condição de derrota

## Times

## Regras

## Fluxo da partida

## Respawn

## Pontuação

## Limites de tempo

## Configurações

## Sistemas utilizados

## Código relacionado

## UI relacionada
```

## Exemplos preenchidos

[[Free For All]] · [[Gun Game]] · [[Versus Bots]] · [[Training]]
