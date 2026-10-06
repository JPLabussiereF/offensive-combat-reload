---
title: ADR - Bootstrap do cliente numa única closure
type: decision
status: documented
area: decisions
source_paths:
  - client/main.ts
  - server/app.ts
tags:
  - decision
  - adr
  - client
  - architecture
updated: 2026-10-05
---

# ADR - Bootstrap do cliente numa única closure

> [!info]
> Não há registro escrito desta decisão no repositório. Esta nota descreve a decisão **implícita no código** e seus efeitos; o motivo é inferido.

## Contexto

O cliente precisa montar física, renderização, áudio, input, UI, mapa e um de três modos (treino, bots, online), e ligar tudo num laço de simulação de passo fixo.

## Problema

Onde guardar o estado da partida e como os sistemas se enxergam.

## Opções consideradas

- Um objeto "Game"/"GameManager" com sistemas registrados, ou ECS.
- Injeção de dependências entre classes.
- Uma função assíncrona que cria tudo como variáveis locais e define `step`/`render` como closures (adotada).

## Decisão

`client/main.ts` define `async function boot()` (~1.800 linhas) que cria todos os sistemas como `const` locais, guarda o estado da partida em dezenas de `let` (ex.: `simTime`, `boostEnds`, `potionKind`, `secondThrowIn`), define funções internas que os manipulam e termina com `startLoop(step, render)`. O servidor segue o mesmo estilo em `startServer()` (`server/app.ts`), com o lobby em variáveis da closure.

## Motivo (inferido)

Protótipo de fase 1 (README: "Fase 1 do roadmap: protótipo"): acesso direto a qualquer sistema sem cerimônia, nenhuma camada a manter, e "aplicar o resultado" do combate diferente por modo resolvido com `if (net) ... else if (bots) ...` no mesmo lugar.

## Consequências

- Positivas: fluxo linear e fácil de seguir do início ao fim; um só lugar com as regras de prioridade de ação; `window.__oc` expõe tudo em dev para testes de fumaça.
- Negativas: arquivo enorme; estado sem fronteiras explícitas (o bug corrigido em `d7bc9d1`, "block second throw after death", foi um `let` não zerado na morte); impossível testar a orquestração isoladamente; sem desmontagem, então trocar de modo usa `location.reload()`.
- Sinal de evolução: lógica pura foi sendo extraída para módulos testáveis (`core/keybinds.ts`, `audio/spatial.ts`, `gameplay/aimAssist.ts`, `ai/bots.ts`).

## Código afetado

`client/main.ts` (`boot`, `step`, `stepInner`, `render`), `server/app.ts` (`startServer`).

Ver também: [[Client Architecture]], [[State Management]], [[Technical Debt]].
