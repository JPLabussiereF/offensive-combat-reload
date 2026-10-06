---
title: ADR - nginx na frente do servidor do jogo com Docker Compose
type: decision
status: documented
area: infrastructure
source_paths:
  - Dockerfile
  - docker-compose.yml
  - deploy/nginx/docker.conf
  - deploy/nginx/offensive-combat.conf
  - docs/DEPLOY.md
tags:
  - adr
  - infra
updated: 2026-10-05
---

# ADR - nginx na frente do servidor do jogo com Docker Compose

## Contexto

O jogo é hospedado por jogadores (PC com Docker Desktop ou VPS) e precisa de quatro peças: arquivos estáticos, servidor do jogo (API + WebSocket), PostgreSQL e Redis. Introduzido no PR #3 (contas).

## Problema

Expor o processo do jogo diretamente obrigaria o Bun a servir arquivos grandes, comprimir, aplicar limites por IP e cache — e a ficar acessível da internet junto com banco e Redis.

## Opções consideradas

- Servidor Bun em porta única (existe como modo `bun start`, sem nginx).
- nginx na frente + serviços internos (escolhida para hospedagem).
- (Não há evidência de outras opções avaliadas, como CDN ou PaaS.)

## Decisão

Um `Dockerfile` multi-stage gera duas imagens a partir do mesmo build (`server` e `web`), e o `docker-compose.yml` sobe `web` (nginx, única porta pública), `jogo` (rede interna), `banco` e `redis` (só em `127.0.0.1`). A mesma configuração de nginx existe para instalação sem Docker (`offensive-combat.conf` + systemd).

## Motivo

Comentários dos arquivos: "nginx is the only thing exposed to the internet"; gzip e cache imutável para `/assets/`; limites de requisição e conexões por IP (inclusive limite extra em login/cadastro); repasse de `Host` e `X-Forwarded-Proto` para checagem de origem e cookie `Secure`.

## Consequências

- Um comando (`docker compose up -d --build` / `offensive`) sobe tudo.
- O servidor confia em `X-Forwarded-For` apenas de endereço privado (o nginx).
- Atualizar exige rebuild das duas imagens; não há registry nem CD.

## Código afetado

`Dockerfile`, `docker-compose.yml`, `deploy/nginx/*.conf`, `deploy/offensive-combat.service`, `server/http.ts`, `tools/offensive.ts`. Ver [[Infrastructure Overview]] e [[Hosting]].
