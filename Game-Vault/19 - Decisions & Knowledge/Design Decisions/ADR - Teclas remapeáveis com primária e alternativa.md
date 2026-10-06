---
title: ADR - Teclas remapeáveis com primária e alternativa
type: decision
status: documented
area: ui
source_paths:
  - client/core/keybinds.ts
  - client/core/input.ts
  - client/core/settings.ts
  - client/ui/menu.ts
  - client/tests/keybinds.test.ts
tags:
  - game
  - input
  - decision
updated: 2026-10-05
---

# ADR - Teclas remapeáveis com primária e alternativa

## Contexto

O input foi escrito desde o início com ações nomeadas "para que toda tecla possa ser remapeada depois" (comentário de `client/core/input.ts`). Jogadores usam layouts de teclado diferentes (AZERTY, Dvorak) e navegadores com limitações próprias.

## Problema

Permitir remapear sem criar conflitos, sem prender o jogador em atalhos perigosos do navegador e sem quebrar configurações salvas quando novas ações forem adicionadas.

## Opções consideradas

- Teclas fixas (estado anterior implícito; *inferência*).
- Uma tecla por ação.
- **Dois espaços por ação (primária e alternativa)**, com regras puras e testadas (escolhida).

## Decisão

- Cada ação tem `[primária, alternativa]`; qualquer uma pode ficar vazia. Padrão do chat: Enter e T.
- Uma tecla pertence a um único espaço: atribuí-la remove-a de onde estava e o menu avisa qual ação perdeu a tecla.
- **Ctrl é proibido** (Ctrl+W fecha a aba e não pode ser interceptado fora da tela cheia com Keyboard Lock) — por isso **agachar é C**. F3/F4/F6 são fixas (depuração) e Esc é do navegador (pausa).
- A roda do mouse só vale em ações de um toque.
- Ao carregar, as teclas salvas são mescladas ação por ação com os padrões.
- As regras vivem em funções puras sem DOM (`keybinds.ts`) para serem testadas com Bun (`client/tests/keybinds.test.ts`).

## Motivo

Comentários em `keybinds.ts`: o tipo `Action` fica fora de `input.ts` para que os testes (checados pelo `server/tsconfig.json`, sem DOM) não carreguem código de DOM; a mescla por ação evita que "um spread simples apague os padrões de ações adicionadas depois" (`settings.ts`).

## Consequências

- Nomes de teclas dependem do navegador (layout map no Chrome/Edge; caractere aprendido no Firefox; QWERTY como último recurso).
- O selo "E" desenhado no contador 3D sobre corpos (`corpseTimer.ts`) não segue o remapeamento (o prompt do HUD segue).
- Controle e toque não são remapeáveis (layout fixo estilo CoD).

## Código afetado

- `client/core/keybinds.ts`, `client/core/input.ts`, `client/core/settings.ts`, `client/ui/menu.ts`, `client/tests/keybinds.test.ts`

Ver [[Input & Controls]].
