---
title: ADR - Build do servidor com bun build e pacotes externos
type: decision
status: documented
area: infrastructure
source_paths:
  - package.json
  - Dockerfile
  - server/db.ts
  - server/app.ts
tags:
  - adr
  - build
updated: 2026-10-05
---

# ADR - Build do servidor com bun build e pacotes externos

## Contexto

O servidor é TypeScript e importa `@shared/*`. Em produção ele roda a partir de `build/`.

## Problema

Rodar o TypeScript direto em produção é possível no Bun (`start:dev`), mas o projeto quer um artefato único e um console admin empacotado na imagem.

## Opções consideradas

Não registradas além do que existe: `bun server/index.ts` (dev) vs. `bun build` (produção).

## Decisão

`build:server` gera `build/server.js` e `build/admin.js` com `bun build --target=bun --packages=external`. As dependências ficam externas e são instaladas com `bun install --production` na imagem `server`. Caminhos de `dist/` e `server/migrations` são resolvidos relativos a `import.meta.dir` de modo a funcionar tanto do código-fonte quanto do bundle.

## Motivo

Inferência: pacotes com binários/WASM ou dinâmicos (`pg`, `ioredis`, `nodemailer`) são mais seguros fora do bundle; o artefato fica pequeno e o alias `@shared` é resolvido no build.

## Consequências

- A imagem precisa de `node_modules` de produção e de `server/migrations` copiados.
- O CI não roda o build (só typecheck), então erros só do bundler não são detectados no PR.

## Código afetado

`package.json`, `Dockerfile`, `server/db.ts`, `server/app.ts`. Ver [[Build Pipeline]].
