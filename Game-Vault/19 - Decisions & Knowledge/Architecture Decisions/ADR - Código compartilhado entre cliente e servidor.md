---
title: ADR - Código compartilhado entre cliente e servidor
type: decision
status: documented
area: decisions
source_paths:
  - shared/protocol.ts
  - shared/constants.ts
  - shared/weapons.ts
  - shared/movement.ts
  - shared/progression.ts
  - shared/appearance.ts
  - tsconfig.json
  - server/tsconfig.json
  - vite.config.ts
  - server/session.ts
  - client/ai/bots.ts
  - README.md
tags:
  - decision
  - adr
  - shared
  - architecture
updated: 2026-10-05
---

# ADR - Código compartilhado entre cliente e servidor

## Contexto

O jogo tem modos offline (treino, bots), em que o cliente aplica as regras, e um modo online em que o servidor é a autoridade. Os dois precisam calcular dano, pontos, níveis de arma e efeitos da aparência da mesma forma.

## Problema

Evitar que cliente e servidor divirjam em regras e no formato das mensagens.

## Opções consideradas

- Reimplementar as regras em cada lado.
- Um módulo comum importado pelos dois (adotada).

## Decisão

A pasta `shared/` contém protocolo, constantes, dados de armas em JSON, fórmulas de dano, progressão, nível da conta, mapas (posições que o servidor valida), aparência, catálogo e paleta. É importada como `@shared/*` (alias em `tsconfig.json`, `server/tsconfig.json` e `vite.config.ts`) e compilada nos dois projetos TypeScript. O README: o servidor "usa as mesmas regras de `shared/` que o cliente (dados das armas, níveis de granada, tabela de pontos)".

## Motivo

Uma única fonte para regras e formatos; tipos de mensagens (`ClientMsg`/`ServerMsg`) verificados pelo compilador nos dois lados; `shared/movement.ts` foi escrito como "pure function of (state, input, dt)" para, no futuro, o servidor rodar a mesma simulação (comentário do arquivo).

## Consequências

- Positivas: `computeDamage`, `bodyStats`, `sanitizeChat`, `SCORE`, `NET` iguais nos dois lados; testes do servidor validam regras usadas pelo cliente.
- Negativas: cliente e servidor precisam ser publicados juntos quando `shared/` muda; `shared/movement.ts` depende do Rapier (só o cliente usa hoje).
- Limite atual: nem toda regra foi para `shared/` — a aplicação de prêmios/abates está duplicada entre `server/session.ts` e `client/ai/bots.ts`, e a regeneração dos bots usa números literais. Ver [[Technical Debt]].

## Código afetado

`shared/**`, `tsconfig.json`, `server/tsconfig.json`, `vite.config.ts`; consumidores em `client/**` e `server/**`.

Ver também: [[Shared Systems]], [[Client Server Model]].
