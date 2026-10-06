---
title: ADR - Testes de integração contra servidor real e banco descartável
type: decision
status: documented
area: testing
source_paths:
  - bunfig.toml
  - server/tests/preload.ts
  - server/tests/helpers.ts
  - server/tests/env.ts
  - .github/workflows/ci.yml
tags:
  - adr
  - testes
updated: 2026-10-05
---

# ADR - Testes de integração contra servidor real e banco descartável

## Contexto

As regras críticas (autenticação, tickets, revogação, progresso, validação de partida) dependem de PostgreSQL, Redis, cookies e WebSocket.

## Problema

Mocks de banco/Redis/rede esconderiam justamente os comportamentos a testar (atomicidade do `GETDEL`, cabeçalhos, códigos de fechamento).

## Opções consideradas

Não registradas.

## Decisão

`bun test` com preload que **apaga e recria** o banco `oc_teste` e esvazia o Redis db 1 a cada execução; cada arquivo sobe um servidor real numa porta livre (`startServer` com `jobs: false`); clientes simulados (`Browser` com cookies/Origin/IP próprio, `Player` WebSocket). No CI, Postgres e Redis são serviços do GitHub Actions.

## Motivo

`bunfig.toml`: "They need the database and Redis from docker compose ... and use their own database (oc_teste) and Redis db 1, recreated by the preload on every run."

## Consequências

- Alta fidelidade; testes refletem o comportamento real de produção.
- Exigem Docker local (`docker compose up -d banco redis`); arquivos rodam em série num processo.
- `DATABASE_URL_TESTE` nunca pode apontar para dados reais (é destruído).

## Código afetado

`bunfig.toml`, `server/tests/*`, `.github/workflows/ci.yml`. Ver [[Testing Overview]] e [[Integration Tests]].
