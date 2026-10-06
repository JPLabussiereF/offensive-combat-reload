---
title: Services
type: architecture
status: documented
area: code-architecture
source_paths:
  - server/app.ts
  - server/api.ts
  - server/accounts.ts
  - server/progress.ts
  - server/auth/sessions.ts
  - server/auth/password.ts
  - server/auth/discord.ts
  - server/email.ts
  - server/jobs.ts
  - server/moderacao.ts
  - server/db.ts
  - server/redis.ts
  - client/net/api.ts
  - client/audio/sfx.ts
  - client/render/effects.ts
tags:
  - architecture
  - services
updated: 2026-10-05
---

# Services

## Existe uma camada de "Service"?

**Não formalmente.** Nenhum arquivo, classe ou pasta do projeto se chama `*Service`, e não há contêiner de injeção de dependências. O código usa **módulos de funções exportadas** que recebem suas dependências como parâmetro (`db`, `deps: Deps = { db, redis }`). A tabela abaixo mostra **o que faz o papel** de serviço, para quem procura por esse conceito.

> [!info]
> A injeção de dependências é manual e explícita: `startServer()` cria `db` e `redis` e passa `deps` para `handleApi(deps, req, url)`, que repassa a cada handler. Os testes trocam as URLs (`databaseUrl`, `redisUrl`) em vez de trocar implementações.

## Servidor — módulos com papel de serviço

| Módulo | Papel equivalente | Funções principais | Dependências recebidas |
| --- | --- | --- | --- |
| `server/accounts.ts` | Acesso a dados de contas (repositório + regras de perfil) | `createAccount`, `getAccount`, `fullProfile`, `changeName`, `setAppearance`, `setEquipped`, `loadGameProfile`, `flushProgress`, `audit`, `activeBan`, `anonymizeExpired` | `db` (`Db` ou `Queryable`) |
| `server/auth/sessions.ts` | Serviço de sessão do navegador | `createSession`, `authenticate`, `revokeSession`, `revokeAll` | `db`, `redis` |
| `server/auth/password.ts` | Serviço de login por senha | `register`, `login`, `requestReset`, `resetPassword` | `deps`, e-mail |
| `server/auth/discord.ts` | Serviço OAuth Discord | `startDiscord`, `discordCallback`, `unlinkDiscord` | `deps`, `CONFIG.discord` |
| `server/progress.ts` | Progresso em memória durante a partida | `addWeaponXp`, `addAccountXp`, `addTime`, `equip`, `progressMsg`, `mergeDelta` | nenhuma (opera sobre `LiveAccount`) |
| `server/email.ts` | Envio de e-mail | `sendMail` | `CONFIG.smtp` |
| `server/jobs.ts` | Tarefas agendadas | `scheduleJobs`, `runJobs`, `ensureAuditPartitions` | `db` |
| `server/moderacao.ts` | Ações de staff | `ban`, `unban`, `mute`, `unmute`, `setRole`, `sanctions` | `deps` |
| `server/session.ts` | Serviço de partida (regras autoritativas) | `Session.join/leave/handle/tick` | `now`, `onChange`, `publish` |

Notas por domínio: [[Backend Overview]], [[Authentication]], [[Match Services]], [[Moderation]], [[Database]], [[Cache]], [[External Services]].

## Serviços externos usados

| Serviço | Biblioteca | Onde |
| --- | --- | --- |
| PostgreSQL | `pg` | `server/db.ts` (pool de 10), `server/accounts.ts` |
| Redis | `ioredis` | `server/redis.ts` (duas conexões: comandos e assinatura) |
| SMTP (Gmail com senha de app) | `nodemailer` | `server/email.ts` |
| Discord OAuth 2 + PKCE | `arctic` | `server/auth/discord.ts` |

## Cliente — objetos que funcionam como serviços compartilhados

Criados uma vez em `boot()` (`client/main.ts`) e passados por parâmetro para quem precisa:

| Objeto | Arquivo | Papel |
| --- | --- | --- |
| `sfx` (`Sfx`) | `client/audio/sfx.ts` | Toca sons procedurais (posicionais com `sfx.at(...)`); passado para mapas, bots, granadas |
| `effects` (`Effects`) | `client/render/effects.ts` | Pool de decals, partículas, traçantes e luz de boca |
| `physics` (`Physics`) | `client/world/physics.ts` | Mundo Rapier e tabela de superfícies |
| `quality` (`QualityManager`) | `client/render/quality.ts` | Presets e resolução dinâmica |
| `api()` / `fetchMe()` / `fetchProfile()` | `client/net/api.ts` | Cliente HTTP da API de contas |
| `gamepad` | `client/core/gamepad.ts` | Instância única exportada do módulo (singleton de módulo) |

## Riscos

- Sem interfaces para os serviços, os testes do servidor dependem de PostgreSQL e Redis reais (`bunfig.toml`, `server/tests/preload.ts`). Ver [[Integration Tests]].

## Código relacionado

- `server/app.ts` (montagem de `deps`), `server/api.ts` (`Ctx`, `routes`)
- Arquivos listados nas tabelas acima

Ver também: [[Controllers]], [[Modules]].
