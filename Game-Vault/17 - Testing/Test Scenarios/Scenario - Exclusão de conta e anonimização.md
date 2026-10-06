---
title: Scenario - Exclusão de conta e anonimização
type: reference
status: documented
area: testing
source_paths:
  - server/tests/auth.test.ts
  - server/api.ts
  - server/accounts.ts
  - server/jobs.ts
  - shared/account.ts
tags:
  - testes
  - cenario
  - lgpd
updated: 2026-10-05
---

# Scenario - Exclusão de conta e anonimização

**Objetivo:** garantir o fluxo de exclusão com carência (LGPD): bloqueio do online durante a carência, cancelamento possível e anonimização após 30 dias.

**Arquivo:** `server/tests/auth.test.ts`, `it('bloqueia o online durante a carência, deixa cancelar e anonimiza depois de 30 dias')`.

## Passos

| # | Ação | Esperado |
| --- | --- | --- |
| 1 | Cadastro da conta "Saindo"; `DELETE /api/conta` | 204 |
| 2 | `GET /api/me` | `exclusaoEm` preenchido |
| 3 | `POST /api/ws-ticket` | `erro: conta_em_exclusao` (online bloqueado) |
| 4 | `POST /api/conta/cancelar-exclusao` | 204; ticket volta a ser emitido (200) |
| 5 | Pede exclusão de novo; teste envelhece `deletion_requested_at` em 31 dias via SQL | — |
| 6 | Chama `anonymizeExpired(db)` diretamente (jobs estão desligados nos testes) | ≥ 1 conta anonimizada |
| 7 | `GET /api/me` com a sessão antiga | 401 |
| 8 | Login com e-mail e senha | 401 |
| 9 | SQL: contas `deleted` com `display_name = 'Jogador excluído'` | existem e todas com `email` nulo |

## O que o cenário prova

- Carência de `DELETION_GRACE_DAYS = 30` (`shared/account.ts`).
- Job de anonimização (`server/jobs.ts` → `anonymizeExpired`) remove dados pessoais e mantém estatísticas.
- Sessões deixam de valer para conta `deleted`.

## Código relacionado

- `server/tests/auth.test.ts`, `server/api.ts` (`DELETE /api/conta`, `cancelar-exclusao`, `ws-ticket`)
- `server/accounts.ts` (`requestDeletion`, `cancelDeletion`, `anonymizeExpired`), `server/jobs.ts`

Ver também: [[Player Data]], [[Sensitive Data]], [[Integration Tests]].
