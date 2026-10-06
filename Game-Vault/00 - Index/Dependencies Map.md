---
title: Dependencies Map
type: architecture
status: documented
area: index
source_paths:
  - client/main.ts
  - client/ai/bots.ts
  - client/ai/navmesh.ts
  - client/world/mapBuilder.ts
  - client/net/connection.ts
  - server/app.ts
  - server/session.ts
  - server/api.ts
  - server/auth/password.ts
  - server/auth/discord.ts
  - server/db.ts
  - server/redis.ts
  - server/email.ts
  - tools/admin.ts
  - package.json
tags:
  - game
  - index
  - architecture
updated: 2026-10-05
---

# Mapa de dependências

Quem depende de quem, levantado dos `import` reais (código confirmado em 2026-10-05). Para o papel de cada módulo, ver [[Modules]]. Para bibliotecas externas e versões, ver [[External References]].

## Cliente

`client/main.ts` é o ponto de integração: importa todas as pastas do cliente e as amarra dentro de `boot()` ([[ADR - Bootstrap do cliente numa única closure]]). As pastas não se conhecem diretamente, exceto onde o diagrama mostra.

```mermaid
flowchart TD
  main["client/main.ts (boot)"] --> core["core/ (loop, input, keybinds, settings, device)"]
  main --> world["world/ (mapas, MapBuilder, superfícies, props)"]
  main --> render["render/ (renderer, materiais, efeitos, viewmodel)"]
  main --> weapons["weapons/ (rifle, faca, granadas, minas, hitscan)"]
  main --> entities["entities/ (jogador local, avatar, rig, hitboxes, bonecos)"]
  main --> gameplay["gameplay/ (oprimir, corpos, mira, spawn, progresso)"]
  main --> character["character/ (personagens procedurais)"]
  main --> ai["ai/ (bots, navmesh)"]
  main --> net["net/ (connection, remote, api)"]
  main --> ui["ui/ (home, HUD, menus, chat, toque)"]
  main --> audio["audio/ (sfx, spatial)"]
  ai --> world
  ai --> weapons
  ai --> gameplay
  ai --> render
  ai --> audio
  world --> physics["world/physics (Rapier)"]
  net --> api["net/api (REST)"]
  main --> shared["@shared"]
  ai --> shared
  net --> shared
```

## Servidor

```mermaid
flowchart TD
  index["server/index.ts"] --> app["app.ts (Bun.serve, lobby, WebSocket)"]
  app --> session["session.ts (partida 20 Hz)"]
  app --> apiMod["api.ts (REST /api)"]
  app --> accounts["accounts.ts"]
  app --> progress["progress.ts"]
  app --> db["db.ts (pg, migrations)"]
  app --> redis["redis.ts (ioredis)"]
  app --> jobs["jobs.ts"]
  app --> auth["auth/ (sessions, password, discord)"]
  apiMod --> accounts
  apiMod --> auth
  apiMod --> redis
  session --> progress
  auth --> email["email.ts (nodemailer)"]
  admin["tools/admin.ts"] --> moderacao["moderacao.ts"]
  session --> shared["@shared"]
  app --> shared
  apiMod --> shared
```

- `session.ts` só depende de `progress.ts` e de `@shared`: a lógica da partida não acessa banco nem Redis diretamente. O progresso é gravado por `app.ts` ([[ADR - Progresso gravado em lotes por delta]]).
- A moderação (`moderacao.ts`) é usada pelo console `tools/admin.ts`. O aviso de silêncio ou revogação chega às partidas pelos canais Redis ([[Moderation]], [[Events & Messaging]]).

## Compartilhado

`shared/` não importa nada de `client/` nem de `server/`. Cliente e servidor importam `@shared/*` (protocolo, constantes, armas, movimento, mapas, progressão, aparência e catálogo) ([[ADR - Código compartilhado entre cliente e servidor]], [[Shared Systems]]).

## Bibliotecas externas e onde entram

| Biblioteca | Usada em | Para |
|---|---|---|
| `three` | cliente inteiro | render ([[Rendering Overview]]) |
| `@dimforge/rapier3d-compat` | `client/main.ts`, `client/world/` | física e raycasts ([[World Structure]], [[Spatial Audio]]) |
| `recast-navigation` | `client/ai/navmesh.ts` | navmesh dos bots ([[Navigation]]) |
| `pg` | `server/db.ts` | PostgreSQL ([[Database]]) |
| `ioredis` | `server/redis.ts` | Redis ([[Cache]]) |
| `arctic` | `server/auth/discord.ts` | OAuth do Discord ([[Authentication]]) |
| `nodemailer` | `server/email.ts` | e-mail SMTP ([[External Services]]) |

## Dependências de sistema (comportamento)

| Sistema | Depende de |
|---|---|
| [[Damage System]] | [[Weapons]], regiões de [[Combat]] e hitboxes, penetração das superfícies ([[Cover & Combat Spaces]]) |
| [[Scoring]] | [[Damage System]] (tipo do abate), [[Humiliation]] |
| [[Progression]] | [[Scoring]] (pontos por arma), [[Player Data]] |
| [[Humiliation]] | corpos e tempo de morte de [[Respawn]], [[Interaction System]] |
| [[Buffs & Debuffs]] | [[Pickups]], [[Map Gags]], [[Health System]] |
| [[Versus Bots]] | [[NPC Behavior]], [[Navigation]] (navmesh dos colisores do mapa) |
| [[Spatial Audio]] | colisores e superfícies do mapa (oclusão por raycast) |
| [[Free For All]] online | [[Sessions]], [[Authentication]] (ticket), [[Validation]] |
