---
title: External References
type: reference
status: documented
area: reference
source_paths:
  - package.json
  - bun.lock
  - Dockerfile
  - docker-compose.yml
  - .github/workflows/ci.yml
  - server/auth/discord.ts
  - server/email.ts
  - docs/DEPLOY.md
  - README.md
tags:
  - referencia
  - dependencias
updated: 2026-10-05
---

# External References

## Runtime e gerenciador

| Item | Versão | Fonte |
| --- | --- | --- |
| Bun | `1.4.2` (`packageManager`); imagens `oven/bun:1.4-alpine` | `package.json`, `Dockerfile` |
| Node.js | **não usado** | `README.md`, `bunfig.toml` |

## Dependências de produção (`package.json`)

Versão declarada (faixa) e instalada em `node_modules` em 2026-10-05.

| Pacote | Declarada | Instalada | Uso |
| --- | --- | --- | --- |
| `three` | ^0.186.1 | 0.186.1 | Renderização 3D (WebGL), loaders glTF/KTX2 — [[Rendering Overview]] |
| `@dimforge/rapier3d-compat` | ^0.21.0 | 0.21.0 | Física (WASM) — movimento, raios, colisores — [[Movement]] |
| `recast-navigation` | ^0.43.1 | 0.43.1 | Malha de navegação dos bots — [[Navigation]] |
| `pg` | ^8.23.1 | 8.23.1 | Cliente PostgreSQL — [[Database]] |
| `ioredis` | ^6.0.0 | 6.0.0 | Cliente Redis + pub/sub — [[Cache]] |
| `arctic` | ^3.7.0 | 3.7.0 | OAuth 2 (Discord, PKCE) — [[Authentication]] |
| `nodemailer` | ^10.0.13 | 10.0.13 | SMTP — [[External Services]] |

## Dependências de desenvolvimento

| Pacote | Declarada | Instalada | Uso |
| --- | --- | --- | --- |
| `vite` | ^8.3.1 | 8.3.2 | Dev server, proxy e build do cliente |
| `typescript` | ^7.0.2 | 7.0.2 | Typecheck (compilador nativo, segundo o README) |
| `@gltf-transform/core` | ^4.5.1 | 4.5.1 | Gerar `.glb` de exemplo (`tools/gerar-props-exemplo.mjs`) |
| `@types/bun`, `@types/three`, `@types/pg`, `@types/nodemailer` | ^1.4.2, ^0.186.0, ^8.23.1, ^8.0.2 | — | Tipos |

Arquivos de terceiros versionados: `public/basis/basis_transcoder.js` e `.wasm` (transcoder Basis Universal para KTX2; versão não registrada — `unknown`).

## Imagens e ações

| Item | Versão | Onde |
| --- | --- | --- |
| `oven/bun` | `1.4-alpine` | `Dockerfile` |
| `nginx` | `1.27-alpine` | `Dockerfile` |
| `postgres` | `18-alpine` | `docker-compose.yml`, CI |
| `redis` | `8-alpine` | `docker-compose.yml`, CI |
| `actions/checkout` | `v5` | CI |
| `oven-sh/setup-bun` | `v2` | CI |

## Serviços externos

| Serviço | Endpoint/uso | Configuração |
| --- | --- | --- |
| Discord OAuth 2 | autorização via `arctic`; `https://discord.com/api/v10/users/@me`; escopo `identify` | Portal de desenvolvedores do Discord (aplicativo, Client ID/Secret, Redirects) |
| Gmail SMTP | `smtp.gmail.com:465` TLS, senha de app | Conta Google com verificação em duas etapas |
| Radmin VPN, Cloudflare Tunnel (`cloudflared`), certbot/Let's Encrypt | só documentação de hospedagem | [[Hosting]] |
| Docker Desktop | execução local da pilha | `tools/offensive.ts` |

Detalhes em [[External Services]] e [[Integrations]].

## Referências de design citadas

- Jogo original: *Offensive Combat* (FPS de navegador da **U4iA Games**) — o projeto é uma "homenagem de mecânicas" (`README.md`). Ver [[Game Concept]].
- "Documento de design" com seções numeradas (ex.: seção 4 valores de movimento, seção 6 nascimento, seção 14 netcode) e "plano de autenticação" (resposta P27) são citados em comentários e no README, mas **não estão no repositório** (`unknown`).
- OWASP (parâmetros mínimos de Argon2id), citado em `server/auth/password.ts`.
- Referências culturais nos mapas/README ("Enrolados", Dark Souls, Scooby-Doo, CoD Mobile, "Criar um Sim") — inspiração de conteúdo.

## Documentação interna

- `README.md`, `docs/DEPLOY.md`, `docs/MAPAS.md`, `docs/PERSONAGENS.md`.
