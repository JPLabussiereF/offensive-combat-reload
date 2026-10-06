---
title: Live Game Structure
type: concept
status: documented
area: liveops
source_paths:
  - server/app.ts
  - shared/maps.ts
  - server/jobs.ts
  - README.md
  - docs/DEPLOY.md
tags:
  - liveops
updated: 2026-10-05
---

# Live Game Structure

O Offensive Combat **não tem estrutura de live game** no sentido comercial (temporadas, passe de batalha, loja, eventos com data, conteúdo remoto). É um projeto em "Fase 1" (README), auto-hospedado por jogadores para jogar com amigos. Esta nota registra o que existe de "operação contínua".

## O que está sempre no ar

| Elemento | Como funciona | Fonte |
| --- | --- | --- |
| Salas permanentes | Uma por mapa, criadas na partida do servidor: `principal` (Rua dos Vizinhos), `jardim` (Jardim do Dragão), `halloween` (Vila Assombrada). Nunca são descartadas. | `server/app.ts` |
| Salas de jogadores | Criadas sob demanda; somem quando ficam vazias. | `server/app.ts` |
| Lista de mapas | Fixa em código (`MAPS` em `shared/maps.ts`); mudar exige novo build. | `shared/maps.ts` |
| Modo online | Só mata-mata livre, sem fim de partida (contínuo). | [[Free For All]], [[Problem - Partidas sem fim]] |
| Progressão | Persistente por conta (XP de armas e conta). | [[Progression]] |

## Rotinas automáticas

`server/jobs.ts`, na partida do servidor e a cada 24 h:

- cria partições mensais da auditoria (`auth_event`) para o mês atual e os dois seguintes;
- anonimiza contas com exclusão pedida há mais de 30 dias.

## Operação manual

- Atualizar o jogo: reconstruir e reiniciar ([[Updates]]).
- Moderação: console `admin` ([[Moderation]]).
- Backup: `pg_dump` manual ([[Hosting]]).

## O que não existe

Temporadas, eventos programados, feature flags, configuração remota, A/B, economia/loja, notícias no menu, telemetria. Ver [[Events]], [[Feature Flags]], [[Configurable Content]].

## Código relacionado

- `server/app.ts`, `shared/maps.ts`, `server/jobs.ts`
