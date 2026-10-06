---
title: Environments
type: infrastructure
status: documented
area: infrastructure
source_paths:
  - package.json
  - vite.config.ts
  - server/config.ts
  - server/index.ts
  - server/tests/env.ts
  - bunfig.toml
  - docker-compose.yml
  - .github/workflows/ci.yml
  - deploy/offensive-combat.service
tags:
  - infra
  - ambientes
updated: 2026-10-05
---

# Environments

Não há ambientes nomeados formalmente (sem `staging`, sem arquivos `.env.<ambiente>`). O que existe são **modos de execução**, diferenciados por comando e variáveis de ambiente. O único sinal de ambiente lido no código é `NODE_ENV` (`production` em `CONFIG.production` — definido, mas **não usado** em nenhum lugar; `test` silencia o log de e-mail).

| Ambiente | Como sobe | Cliente | Servidor | Banco/Redis | Observações |
| --- | --- | --- | --- | --- | --- |
| **Dev só cliente** | `bun run dev` | Vite `:5173` (HMR) | — | — | Treino e contra bots funcionam; online aparece "offline". |
| **Dev online** | `bun run dev:online` | Vite `:5173` (`host: true`, acessível na rede) | `bun --watch server/index.ts` `:8787` | compose `banco` (`:5442`) e `redis` (`:6392`) | Vite faz proxy de `/api` e `/ws` (mesma origem). `tools/dev-online.ts` prefixa os logs com `[jogo]` e `[vite]`. |
| **Produção local, porta única** | `bun run build && bun start` | servido pelo Bun de `dist/` | `build/server.js` `:8787` | defaults locais ou `DATABASE_URL`/`REDIS_URL` | Sem nginx. |
| **Produção Docker** | `docker compose up -d --build` ou `offensive` | nginx `:8080` (`PORTA`) | container `jogo` | containers `banco`/`redis` | Segredos e endereços via `.env` ao lado do compose. |
| **Produção VPS sem Docker** | systemd + nginx | nginx `:80/443` | `bun build/server.js` em `127.0.0.1:8787` | Postgres/Redis próprios | Ver [[Hosting]]. |
| **Teste local** | `bun test` | — | servidor real em porta livre por arquivo de teste | banco `oc_teste` e Redis db 1 (recriados a cada execução) | Ver [[Testing Overview]]. |
| **CI** | GitHub Actions em PR para `main` | — | idem teste | serviços `postgres:18-alpine` e `redis:8-alpine` do runner | Ver [[CI CD]]. |

## Defaults sem `.env`

`server/config.ts` foi escrito para que `bun run dev:online` funcione **sem nenhum arquivo `.env`**: os defaults de `DATABASE_URL` e `REDIS_URL` apontam para os containers do compose publicados em `localhost:5442` e `localhost:6392`. Sem Discord e SMTP configurados, o login é só por e-mail e senha e o link de recuperação aparece no log. Lista completa em [[Configuration Reference]].

## Código relacionado

- `package.json` (scripts), `vite.config.ts`, `tools/dev-online.ts`
- `server/config.ts`, `server/index.ts`, `server/tests/env.ts`, `bunfig.toml`
- `docker-compose.yml`, `deploy/offensive-combat.service`, `.github/workflows/ci.yml`

Ver também: [[Local Development]], [[Configuration]].
