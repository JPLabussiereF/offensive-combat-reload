---
title: ADR - Migrations SQL numeradas aplicadas na inicialização
type: decision
status: documented
area: data
source_paths:
  - server/db.ts
  - server/migrations/001_contas.sql
  - server/migrations/001_contas.down.sql
  - server/migrations/002_aparencia.sql
  - server/migrations/002_aparencia.down.sql
  - Dockerfile
  - tools/admin.ts
tags:
  - adr
  - banco
  - migrations
updated: 2026-10-05
---

# ADR - Migrations SQL numeradas aplicadas na inicialização

## Contexto

O esquema do PostgreSQL evolui junto com o código e precisa ser aplicado em máquinas de jogadores sem passo manual.

## Problema

Exigir um comando de migração separado tornaria a hospedagem mais frágil (esquecer o passo quebra o servidor).

## Opções consideradas

Não registradas (não há ferramenta de migração de terceiros no `package.json`).

## Decisão

Arquivos `NNN_nome.sql` em `server/migrations/`, aplicados em ordem por `migrate()` (`server/db.ts`) **a cada partida do servidor** (e do console `admin`), cada um numa transação e registrado em `schema_migrations`. Os `.down.sql` são rollbacks **manuais**.

## Motivo

Comentário em `server/db.ts`: "each runs once, in a transaction, recorded in schema_migrations". Zero dependências e funciona igual em dev, Docker, testes (banco novo a cada execução) e CI.

## Consequências

- Atualizar o servidor atualiza o banco automaticamente.
- Sem trava entre processos: dois servidores subindo juntos poderiam disputar a mesma migração (inferência; hoje há um processo).
- Sem rollback automático.

## Código afetado

`server/db.ts`, `server/migrations/*`, `Dockerfile` (copia as migrations). Ver [[Data Migrations]] e [[Updates]].
