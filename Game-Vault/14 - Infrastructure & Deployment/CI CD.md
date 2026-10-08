---
title: CI CD
type: infrastructure
status: documented
area: infrastructure
source_paths:
  - Dockerfile
  - server/deploy.ts
  - .github/workflows/ci.yml
  - package.json
  - bunfig.toml
  - server/tests/env.ts
tags:
  - infra
  - ci
  - github-actions
updated: 2026-10-08
---

# CI CD

## CI — existe

Um único workflow: `.github/workflows/ci.yml` ("CI"), adicionado pelo PR #7 (2026-10-01, ver [[Release Notes - Histórico]]).

| Aspecto | Valor |
| --- | --- |
| Gatilho | `pull_request` com destino `main` (não roda em push direto). |
| Permissões | `contents: read`. |
| Concorrência | grupo `ci-<número do PR>`, cancela execução antiga ao chegar push novo. |
| Runner | `ubuntu-latest`, timeout 15 min. |
| Serviços | `postgres:18-alpine` (usuário/banco `oc`, porta 5432, healthcheck `pg_isready`) e `redis:8-alpine` (6379, healthcheck `redis-cli ping`). |
| Variáveis | `DATABASE_URL_TESTE` (banco `oc_teste`) e `REDIS_URL_TESTE` (db 1) apontando para os serviços acima. |

Passos:

1. `actions/checkout@v5`
2. `oven-sh/setup-bun@v2` com `bun-version-file: package.json` (usa o `packageManager`)
3. `bun install --frozen-lockfile`
4. `bun run typecheck` (cliente e servidor)
5. `bun test` (o preload recria o banco de teste; ver [[Testing Overview]])

> [!info] O que o CI não faz
> Não roda `vite build` nem `bun run build:server` (o typecheck cobre os tipos, mas um erro só do bundler passaria). Não há lint, cobertura, cache de dependências nem artefatos.

## CD — não existe

Não existe no código atual (verificado em `.github/workflows/` — só `ci.yml` — e em `deploy/`). Não há publicação de imagens em registry, deploy automático nem ambiente de staging.

O que existe no lugar: deploy **manual**, rodando no host

- `docker compose up -d --build` (ou `offensive`) — reconstrói e reinicia; ou
- na VPS sem Docker: `git pull`/cópia, `bun install --frozen-lockfile && bun run build` e `systemctl restart offensive-combat` (inferido do arquivo de serviço; o comando de reinício não está escrito em `docs/DEPLOY.md`).

Ver [[Hosting]] e [[Updates]].

### Deploy remoto (pedido pela API)

Desde 2026-10-08 o servidor aceita **pedidos** de deploy em `POST /api/deploy` (chave `X-Deploy-Key`, ver [[APIs]]): CI ou um operador pede `atualizar`/`voltar` em `prd` (só versão final) ou `hml` (só `.rc.`). O servidor só enfileira no Redis; quem executa (backup, build com `--build-arg APP_VERSION=<tag>`, troca das imagens e conferência por `GET /api/saude`) é um programa de bandeja no Windows, fora deste repositório. Sem `DEPLOY_KEY_HASH` o recurso fica desligado (404). Nenhum workflow deste repositório chama a rota ainda.

## Proteção da branch

Não verificável pelo repositório (configuração do GitHub). O histórico mostra que tudo entra na `main` por **merge de pull request** (ver [[Release Notes - Histórico]]).

## Código relacionado

- `.github/workflows/ci.yml`
- `package.json` (`typecheck`, `test`), `bunfig.toml`, `server/tests/env.ts`, `server/tests/preload.ts`
