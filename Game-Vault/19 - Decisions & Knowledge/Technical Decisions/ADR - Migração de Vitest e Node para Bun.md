---
title: ADR - Migração de Vitest e Node para Bun
type: decision
status: documented
area: infrastructure
source_paths:
  - package.json
  - bunfig.toml
  - server/tsconfig.json
  - README.md
tags:
  - adr
  - bun
  - ferramentas
updated: 2026-10-05
---

# ADR - Migração de Vitest e Node para Bun

## Contexto

Antes do PR #10 (2026-10-01) o projeto usava Node em partes do fluxo e Vitest para testes (havia `vitest.config.ts` e `package-lock.json`). Uma branch `bun` migrou o servidor e as ferramentas.

## Problema

Dois runtimes e dois executores de teste no mesmo projeto.

## Opções consideradas

Manter Node + Vitest, ou unificar em Bun. A mensagem do merge `f92d22a` registra a escolha, não uma comparação.

## Decisão

Bun é o único runtime: "The character remodel now runs on Bun like the rest of the project; Node is no longer used anywhere." `vitest.config.ts` foi apagado ("bun test replaces Vitest"); a inclusão de `client/tests` passou para o `bunfig.toml`; `client/tests` é verificado pelo programa TypeScript do Bun (`server/tsconfig.json`). `bunfig.toml` `[run] bun = true` faz Vite e tsc rodarem no Bun.

## Motivo

Inferência: simplificar ferramentas (um gerenciador, um runtime, um executor de testes) e aproveitar `Bun.serve`, `Bun.password` e pub/sub nativos.

## Consequências

- Requisito único: Bun 1.4+ (`packageManager: bun@1.4.2`).
- Testes do cliente rodam no Bun (sem DOM), então só lógica pura é testável ali.

## Código afetado

`package.json`, `bunfig.toml`, `server/tsconfig.json`, `client/tests/*`. Ver [[Local Development]] e [[Release Notes - Histórico]].

## Ver também

- [[ADR - Bun como runtime único]]: o lado do runtime (Bun.serve, pub/sub, Bun.password) dessa mesma migração.
