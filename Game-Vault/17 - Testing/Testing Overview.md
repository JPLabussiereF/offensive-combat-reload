---
title: Testing Overview
type: system
status: documented
area: testing
source_paths:
  - bunfig.toml
  - package.json
  - server/tests/preload.ts
  - server/tests/env.ts
  - server/tests/helpers.ts
  - server/tests/auth.test.ts
  - server/tests/game.test.ts
  - server/tests/appearance.test.ts
  - client/tests/aimAssist.test.ts
  - client/tests/keybinds.test.ts
  - client/tests/spatial.test.ts
  - .github/workflows/ci.yml
  - server/tests/arsenal.test.ts
  - client/tests/arsenalText.test.ts
tags:
  - testes
updated: 2026-10-06
---

# Testing Overview

Os testes usam o executor nativo **`bun test`** (`bun:test`: `describe`, `it`, `expect`). Antes era Vitest; foi substituído na migração para Bun (ver [[ADR - Migração de Vitest e Node para Bun]]). Os nomes dos testes estão em português e descrevem o comportamento esperado.

## Inventário

| Arquivo | Tipo | Casos (`it`) | Assunto |
| --- | --- | --- | --- |
| `server/tests/auth.test.ts` | Integração (HTTP) | 16 | cadastro, login, limites, sessão, origem, recuperação de senha, perfil, exclusão |
| `server/tests/game.test.ts` | Integração (HTTP + WebSocket) / gameplay | 26 | ticket do WS, conexões por conta, progresso, mapas, pickups, Vila Assombrada, loadout, arma que atirou, chat |
| `server/tests/arsenal.test.ts` | Unitário | 18 | níveis, melhorias, escolha do Arsenal, atributos, migração 003 |
| `server/tests/appearance.test.ts` | Unitário + integração | 12 | regras de aparência (puras), perfil, aparência online |
| `client/tests/aimAssist.test.ts` | Unitário | 4 | assistência de mira |
| `client/tests/keybinds.test.ts` | Unitário | 28 | teclas configuráveis |
| `client/tests/arsenalText.test.ts` | Unitário | 2 (um `it` repetido por idioma) | textos de armas e melhorias nos dois idiomas |
| `client/tests/spatial.test.ts` | Unitário | 6 | som espacial |

(Contagem por `it(` nos arquivos em 2026-10-06; `bun test` roda 112 casos.)

## Configuração (`bunfig.toml`)

- `root = "."` — o projeto inteiro é a raiz, então `client/tests` também roda (no Bun, sem navegador).
- `preload = ["./server/tests/preload.ts"]` — antes de qualquer arquivo: `DROP DATABASE ... WITH (FORCE)` + `CREATE DATABASE` do banco de teste e `FLUSHDB` no Redis de teste.
- `timeout = 20000` ms por teste.
- Arquivos rodam **um depois do outro num único processo**, cada um com **seu próprio servidor de jogo numa porta livre** (`startTestServer`, porta 0, jobs desligados).

| Variável | Default | Uso |
| --- | --- | --- |
| `DATABASE_URL_TESTE` | Postgres local na porta 5442, banco `oc_teste` | `server/tests/env.ts` |
| `REDIS_URL_TESTE` | Redis local na porta 6392, db `1` | `server/tests/env.ts` |

Pré-requisito local: `docker compose up -d banco redis`. No CI, os serviços do GitHub Actions substituem (ver [[CI CD]]).

## Camadas

- [[Unit Tests]] — lógica pura (cliente e `shared/`).
- [[Integration Tests]] — servidor real + Postgres + Redis, via HTTP e WebSocket.
- [[Gameplay Tests]] — regras de partida validadas pelo servidor.
- [[Performance Tests]] — não há testes automatizados; só ferramentas manuais.

Cenários detalhados em `Test Scenarios/`:

- [[Scenario - Ticket do WebSocket]]
- [[Scenario - Login, bloqueio e recuperação de senha]]
- [[Scenario - Abate validado e progresso gravado]]
- [[Scenario - Exclusão de conta e anonimização]]

## O que não é testado

- Renderização, física/movimento do cliente, UI/DOM, bots, mapas (montagem), áudio além da lógica espacial.
- Fluxo do Discord (não há mock do provedor).
- Envio real de SMTP (testes usam o `outbox` em memória).
- Build (`vite build`/`bun build`) e Docker.
- Não há testes ponta a ponta em navegador nem relatório de cobertura.

## Código relacionado

- `bunfig.toml`, `package.json` (`test`), `server/tsconfig.json` (typecheck de `client/tests`)
- `server/tests/preload.ts`, `server/tests/env.ts`, `server/tests/helpers.ts`

Decisão: [[ADR - Testes de integração contra servidor real e banco descartável]].
