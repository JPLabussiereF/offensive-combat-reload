---
title: Problem - Estado das partidas só em memória de um processo
type: problem
status: documented
area: networking
source_paths:
  - server/app.ts
  - server/session.ts
  - server/db.ts
  - docker-compose.yml
tags:
  - problem
  - scalability
  - networking
updated: 2026-10-05
---

# Problem - Estado das partidas só em memória de um processo

## Contexto
`server/app.ts` mantém em memória `sessions`, `conns` e `byAccount`; cada `Session` guarda jogadores, corpos e itens. O deploy (`docker-compose.yml`) tem um serviço `jogo` com uma instância.

## Problema
- Reiniciar ou derrubar o processo encerra todas as partidas (o progresso é gravado no desligamento normal; numa queda abrupta perde-se até ~60 s).
- Não há descoberta de salas entre processos nem roteamento de jogadores para o processo certo: escalar horizontalmente não é suportado.
- "Uma conexão por conta" (`byAccount`) vale só por processo; com duas instâncias a mesma conta poderia jogar em ambas.
- `migrate()` roda em todo início, sem lock entre instâncias (inferência).
- A revogação e o silêncio **já** funcionam entre processos (pub/sub do Redis) — é o único estado compartilhado.

## Impacto
Hoje baixo (uma instância, até 10 jogadores por sala). Vira limite ao crescer.

## Código afetado
`server/app.ts`, `server/session.ts`, `server/db.ts`. Ver [[Sessions]], [[Matchmaking]], [[Server Architecture]].
