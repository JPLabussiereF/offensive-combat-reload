---
title: Events
type: concept
status: documented
area: liveops
source_paths:
  - shared/maps.ts
  - server/app.ts
  - shared/data/mapas/halloween.json
  - client/world/halloween.ts
tags:
  - liveops
  - eventos
updated: 2026-10-06
---

# Events

## Eventos programados (sazonais) — não existem

Não existe no código atual (verificado: nenhuma checagem de data/mês em `client/` e `shared/` — busca por `getMonth`, `new Date(` — e nenhuma configuração de calendário no servidor). Nada liga ou desliga por data.

## Conteúdo temático permanente

A **Vila Assombrada** (`halloween` em `shared/maps.ts`) tem tema de Halloween, mas é um **mapa permanente** (oficial, sempre na lista; as salas abrem sob demanda). Não é um evento por tempo limitado. Ver [[Map - Vila Assombrada]].

## Eventos dentro da partida

O que o jogo tem de "eventos" são acontecimentos de mapa sincronizados (piadas e bônus): cereja do dragão, carpas e carpa dourada, rato gigante, poção da bruxa, biscoito, sinos, gongo, buzina, abóboras, etc. São mecânicas, não live ops — ver [[Map Gags]], [[Pickups]] e [[Buffs & Debuffs]].

## Como um evento sazonal poderia ser feito hoje (inferência)

Sem infraestrutura de eventos, uma ação temporária exigiria alterar o código (mapa, dados em `shared/data/`) e publicar uma nova versão ([[Updates]]), depois reverter.

## Código relacionado

- `shared/maps.ts`, `server/app.ts`, `shared/data/mapas/halloween.json`, `client/world/halloween.ts`
