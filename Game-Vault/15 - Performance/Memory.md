---
title: Memory
type: system
status: partial
area: performance
source_paths:
  - client/character/body.ts
  - client/character/character.ts
  - client/world/mapBuilder.ts
  - client/audio/spatial.ts
  - server/email.ts
  - server/db.ts
  - server/app.ts
  - server/http.ts
  - docker-compose.yml
tags:
  - performance
  - memoria
updated: 2026-10-06
---

# Memory

Não há medição de memória no código (nenhum uso de `performance.memory` ou similar). Esta nota reúne os **limites e caches** que afetam memória.

## Cliente

### Cache de corpos com limite

- **Problema:** cada combinação de sexo × rosto × LOD gera uma geometria de corpo; reconstruí-la é caro.
- **Solução:** `bodyCache` em `client/character/body.ts`, com limite `BODY_CACHE_MAX = 120`. O comentário estima **~0,7 MB por corpo** e que "uma partida de 32 jogadores precisa no máximo de 32 × 3 níveis".
- **Trade-off:** geometrias despejadas do cache **não são liberadas** (`dispose`), porque um personagem vivo ainda pode usá-las — dependem do coletor de lixo.
- **Métrica:** só a estimativa do comentário (~0,7 MB cada → ~84 MB no limite, inferência).
- **Como medir novamente:** heap snapshot do navegador com várias aparências diferentes.

### Outros caches sem limite explícito

| Cache | Arquivo | Chave |
| --- | --- | --- |
| `pieceCache`, `stumpCache`, `gltfCache` | `client/character/character.ts` | gerador/item/sexo/LOD |
| `headShapes` | `client/character/body.ts` | forma do rosto |
| `Enclosure.cache` | `client/audio/spatial.ts` | célula de 2 m |

> [!warning] Inferência
> Esses caches crescem conforme o conteúdo visto e não têm despejo. Com o catálogo atual o volume é limitado, mas não há garantia no código.

### Liberação de geometria temporária

Construtores de mapa (`mapBuilder.ts`, `halloween.ts`, `oriental.ts`, `furniture.ts`...) chamam `dispose()` nas geometrias intermediárias logo após fundi-las nos lotes; `MapBuilder.finish()` descarta as listas de lotes. Não há descarregamento de mapa: trocar de mapa recarrega a página/fluxo (inferência a partir de `client/main.ts`, que monta o mapa uma vez no boot).

## Servidor

| Limite | Valor | Onde |
| --- | --- | --- |
| Pool Postgres | 10 conexões | `server/db.ts` |
| Corpo HTTP | 16 KiB (2 MiB nos dados de mapa, 10 MB no GLB) | `server/http.ts`, `server/mapRoutes.ts` |
| Mensagem WebSocket | 16 KiB | `server/app.ts` |
| `outbox` de e-mails sem SMTP | 50 mensagens | `server/email.ts` |
| Jogadores por sala | 10 | `NET.maxPlayers` |
| Corpos | removidos ~2 s após a janela de opressão se não reclamados | `server/session.ts` |

Salas vazias são descartadas (`dispose` limpa o timer). As versões de mapa em uso ficam num cache do processo (`MapStore`, por `mapa@versão`) e as navmesh por versão (`server/navmesh.ts`), sem expirar. O estado de todas as partidas fica em memória do processo.

## Infraestrutura

- Redis roda **sem persistência** (`--save '' --appendonly no`): só memória; nada precisa sobreviver a reinício.
- Postgres usa o volume `oc-pg`. Nenhum limite de memória/CPU é definido nos serviços do `docker-compose.yml`.

## Código relacionado

- `client/character/body.ts` (`bodyCache`, `BODY_CACHE_MAX`), `client/character/character.ts`
- `client/audio/spatial.ts`, `client/world/mapBuilder.ts`
- `server/db.ts`, `server/http.ts`, `server/app.ts`, `server/email.ts`, `server/session.ts`
- `docker-compose.yml`

Ver também: [[Known Bottlenecks]], [[Cache]].
