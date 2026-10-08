---
title: ADR - Redis efêmero sem persistência
type: decision
status: documented
area: data
source_paths:
  - server/deploy.ts
  - docker-compose.yml
  - server/redis.ts
  - server/api.ts
  - server/auth/password.ts
tags:
  - decision
  - data
  - redis
updated: 2026-10-08
---

# ADR - Redis efêmero sem persistência

## Contexto
O Redis guarda tickets do WebSocket, links de redefinição, contadores de limite, bloqueios de login e os canais pub/sub de revogação e silêncio.

## Problema
Decidir se esses dados precisam sobreviver a um reinício.

## Opções consideradas
- Redis com RDB/AOF.
- **Redis puramente em memória**; tudo que é durável fica no PostgreSQL.

## Decisão
`redis-server --save '' --appendonly no`. Comentário do `docker-compose.yml`: "Nothing here needs to survive a restart, so persistence is off."

## Motivo
Todos os dados têm TTL curto (30 s a 24 h) ou são mensagens instantâneas.

## Consequências
- Reiniciar o Redis invalida tickets e links de redefinição pendentes e zera limites/bloqueios (janela pequena para força bruta).
- Nenhum backup necessário para o Redis.
- **Revisão (2026-10-08):** o deploy remoto (`server/deploy.ts`) guarda aqui a fila, os pedidos (TTL de 30 dias) e o estado do deploy. Um reinício do `redis` os perde: o histórico de pedidos não é durável e o programa de deploy precisa reescrever `deploy:estado`. A decisão de não persistir foi mantida. Ver [[Cache]].

## Código afetado
`docker-compose.yml`, `server/redis.ts`. Ver [[Cache]].
