---
title: Problem - Sem monitoramento nem métricas de servidor
type: problem
status: documented
area: infrastructure
source_paths:
  - server/app.ts
  - docker-compose.yml
  - package.json
  - server/index.ts
tags:
  - problem
  - infra
  - monitoramento
updated: 2026-10-05
---

# Problem - Sem monitoramento nem métricas de servidor

## Sintoma

Não é possível saber, sem abrir logs ou o banco, quantos jogadores estão online, a latência do tick, erros por minuto ou se o servidor está saudável.

## Causa

Não há endpoint de saúde/métricas no `Bun.serve` (`server/app.ts`), nem biblioteca de métricas/APM (`package.json`), nem healthcheck para os serviços `jogo`, `web` e `redis` no `docker-compose.yml` (só o Postgres tem). Logs são texto livre no console.

## Impacto

- Falhas só são percebidas pelos jogadores ("Servidor fora do ar").
- `restart: unless-stopped` reinicia um processo que caiu, mas não um processo travado.
- Sem dados para dimensionar desempenho do servidor ([[Known Bottlenecks]]).

## O que existe no lugar

Prontidão verificada por `tools/offensive.ts` (401 em `/api/me`) só na subida; overlay F3 no cliente; auditoria `auth_event`. Ver [[Monitoring]] e [[Logging]].

## Código relacionado

`server/app.ts`, `server/index.ts`, `docker-compose.yml`, `tools/offensive.ts`.
