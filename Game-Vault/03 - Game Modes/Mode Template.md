---
title: Mode Template
type: reference
status: documented
area: game-modes
source_paths:
  - client/ui/home.ts
  - client/main.ts
  - server/session.ts
tags:
  - game
  - modes
  - template
updated: 2026-10-05
---

# Mode Template

Modelo para documentar um modo de jogo. Copie o bloco abaixo para uma nota nova em `03 - Game Modes/` (ou `Other Modes/`), preencha a partir do código e adicione o modo ao [[Game Modes Index]].

**Regras de preenchimento**
- Escreva só o que **difere** das regras globais. O que vale para todos os modos fica em [[Game Rules]], [[Scoring]] e [[Respawn]]; aqui, linke essas notas.
- Cada número deve citar a fonte (constante ou JSON). O que não está no código vira `unknown` ou um aviso de inferência.
- Se o modo ainda não existe, crie a nota mesmo assim com `status: unknown` e a frase "Não existe no código atual (verificado em …)".

## Onde um modo "vive" hoje no código

Na arquitetura atual, um modo é a combinação de:
1. uma opção na home (`HomeChoice` em `client/ui/home.ts`);
2. ramificações em `client/main.ts` (`online`, `botMode`, `choice.mode === 'offline'`): pontos de nascimento, atraso de respawn, alvos, placar e pausa;
3. a autoridade das regras: `server/session.ts` (online) ou `client/ai/bots.ts` (`BotManager`, offline).

> [!info] Inferência
> Não existe uma abstração formal de "GameMode" (classe, interface ou arquivo de configuração de modo). Um modo novo exigiria novas ramificações nesses três pontos. Ver [[Code Architecture Overview]] e [[Technical Debt]].

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

[[Free For All]] · [[Versus Bots]] · [[Training]]
