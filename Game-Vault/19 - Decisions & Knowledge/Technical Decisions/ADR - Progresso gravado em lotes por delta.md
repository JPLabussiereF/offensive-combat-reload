---
title: ADR - Progresso gravado em lotes por delta
type: decision
status: documented
area: data
source_paths:
  - server/app.ts
  - server/progress.ts
  - server/accounts.ts
tags:
  - decision
  - data
  - persistence
updated: 2026-10-05
---

# ADR - Progresso gravado em lotes por delta

## Contexto
Cada abate, humilhação, carpa e minuto vivo gera XP e estatísticas, com até 10 jogadores por sala.

## Problema
Gravar cada evento no banco custaria muitas escritas; guardar só em memória arrisca perder progresso.

## Opções consideradas
- Escrita por evento.
- Sobrescrever o total a cada gravação.
- **Acumular um delta em memória e somá-lo ao banco periodicamente.**

## Decisão
`LiveAccount.delta` acumula o ganho; `flush()` grava a cada **60 s** (se não vazio), ao sair da sala, ao desconectar e no desligamento, numa transação com `col = col + $n`. Em falha, o delta volta (`mergeDelta`) e é tentado no próximo ciclo.

## Motivo
Comentário de `server/progress.ts`: "The delta since the last write is flushed to the database every minute and when the player leaves a session". Somar é idempotente em relação ao estado em memória e tolera falhas.

## Consequências
- Poucas escritas; tolerante a falha temporária do banco.
- Queda abrupta do processo perde até ~60 s de progresso por jogador (inferência).
- O perfil em memória é a verdade durante a conexão.

## Código afetado
`server/app.ts` (`flush`, `flushTimer`, `FLUSH_EVERY_MS`), `server/progress.ts`, `server/accounts.ts` (`flushProgress`). Ver [[Save System]].
