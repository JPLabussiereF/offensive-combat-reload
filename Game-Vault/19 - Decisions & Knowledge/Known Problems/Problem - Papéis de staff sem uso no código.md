---
title: Problem - Papéis de staff sem uso no código
type: problem
status: documented
area: backend
source_paths:
  - server/moderacao.ts
  - tools/admin.ts
  - server/migrations/001_contas.sql
tags:
  - problem
  - moderacao
updated: 2026-10-05
---

# Problem - Papéis de staff sem uso no código

## Sintoma

O console permite conceder `admin` e `moderador` (`admin papel ...`), e a migration descreve permissões ("Gerencia papéis e aplica qualquer sanção", "Aplica e revoga sanções"), mas ter ou não um papel não muda nada.

## Causa

A tabela `account_role` só é lida/escrita em `server/moderacao.ts` (`setRole`, `sanctions`). Nenhum código de API, jogo ou console verifica papéis. O console `tools/admin.ts` age com acesso direto ao banco e chama as funções com `by = null`, então `sanction.issued_by` e `account_role.granted_by` ficam vazios.

## Impacto

- Quem tem acesso ao servidor pode tudo; quem não tem, nada — os papéis são só registro.
- A auditoria não identifica qual membro da staff aplicou uma sanção.

## Possível solução (não implementada)

Comandos de moderação no jogo/API restritos por papel, ou o console pedir a identidade de quem executa para preencher `issued_by`.

## Código relacionado

`server/moderacao.ts`, `tools/admin.ts`, `server/migrations/001_contas.sql`. Ver [[Moderation]].
