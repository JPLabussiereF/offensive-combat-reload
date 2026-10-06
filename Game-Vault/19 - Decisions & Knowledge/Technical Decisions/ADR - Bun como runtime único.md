---
title: ADR - Bun como runtime único
type: decision
status: documented
area: decisions
source_paths:
  - package.json
  - bunfig.toml
  - Dockerfile
  - .github/workflows/ci.yml
  - server/app.ts
  - server/auth/password.ts
  - server/http.ts
  - server/db.ts
  - tools/dev-online.ts
  - README.md
tags:
  - decision
  - adr
  - bun
  - runtime
updated: 2026-10-05
---

# ADR - Bun como runtime único

## Contexto

Até o commit `6c6f68d` ("change to Bun", 2026-10-01), o projeto usava a cadeia do Node: `tsx` para rodar o servidor, `esbuild` para empacotá-lo (`build/server.mjs`), `vitest` para testes, `ws` para WebSocket, `@node-rs/argon2` para senhas e `package-lock.json`.

## Problema

Muitas ferramentas e dependências para um servidor pequeno; o WebSocket do `ws` serializava o snapshot de cada tick para cada jogador; dois mundos de tipos (`IncomingMessage` do Node × `Request` web).

## Opções consideradas

- Manter Node + `tsx` + `esbuild` + `vitest` + `ws` (estado anterior, visível no diff).
- Migrar tudo para o Bun (escolhida).

> [!info]
> Não há registro de outras alternativas avaliadas (Deno, Node com uWebSockets etc.).

## Decisão

Bun 1.4 (`packageManager: bun@1.4.2`) é o **único runtime** do projeto: o README diz "o Node não é usado em nenhuma etapa".

- Servidor em `Bun.serve` (API, estáticos e WebSocket nativo numa porta) — detalhado em [[ADR - Um único Bun.serve para API, arquivos e WebSocket]].
- Difusão por sessão com o **pub/sub do Bun** (`ws.subscribe`/`publish`): o snapshot é serializado uma vez por sala (`server/session.ts`).
- Senhas com `Bun.password` (Argon2id, `memoryCost: 19456`, `timeCost: 2`, os mesmos parâmetros dos hashes já gravados).
- Hashes e tokens com `Bun.CryptoHasher` (`server/http.ts`), arquivos com `Bun.file`, migrations listadas com `Bun.Glob` (`server/db.ts`).
- Testes com `bun test` (`bunfig.toml` com `preload`), build do servidor com `bun build --target=bun --packages=external`, scripts e ferramentas em `.ts` rodados direto (`tools/dev-online.ts`, `tools/offensive.ts`).
- `[run] bun = true` faz até `vite` e `tsc` iniciarem no Bun.

## Motivo

Uma ferramenta para rodar, testar, empacotar e gerenciar pacotes; WebSocket e hash de senha nativos (removendo `ws` e `@node-rs/argon2`); APIs web padrão (`Request`/`Response`). O motivo de desempenho do pub/sub está explícito no README ("o snapshot de cada tick é serializado uma vez por sala, não uma vez por jogador").

## Consequências

- Positivas: menos dependências; imagem Docker `oven/bun:1.4-alpine`; CI com `oven-sh/setup-bun` lendo a versão do `package.json`.
- Negativas/risco: o código do servidor depende de APIs exclusivas do Bun (`Bun.serve`, `Bun.password`, `Bun.file`, `ServerWebSocket`); voltar ao Node exigiria reescrever essas partes. Vite e `tsc` continuam sendo ferramentas do ecossistema Node, só executadas pelo Bun.

## Código afetado

`package.json`, `bunfig.toml`, `Dockerfile`, `.github/workflows/ci.yml`, `server/app.ts`, `server/session.ts`, `server/http.ts`, `server/db.ts`, `server/auth/password.ts`, `server/tests/*`, `tools/*.ts`.

Ver também: [[Server Architecture]], [[Build Pipeline]], [[Code Architecture Overview]].

## Ver também

- [[ADR - Migração de Vitest e Node para Bun]]: o lado das ferramentas de teste e build dessa mesma migração.
