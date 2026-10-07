---
title: ADR - Papéis da equipe conferidos no servidor
type: decision
status: documented
area: security
source_paths:
  - shared/roles.ts
  - server/roles.ts
  - server/gestao.ts
  - server/mapRoutes.ts
  - server/moderacao.ts
  - tools/admin.ts
  - server/migrations/004_mapas.sql
  - client/tests/roles.test.ts
  - server/tests/management.test.ts
  - client/ui/management.ts
  - client/ui/managementRules.ts
  - client/ui/mapsRules.ts
  - client/tests/mapsScreen.test.ts
tags:
  - decision
  - adr
  - security
  - moderation
updated: 2026-10-06
---

# ADR - Papéis da equipe conferidos no servidor

## Contexto

Os papéis `admin` e `moderador` existiam no banco desde a autenticação (`role`, `account_role`), mas não davam poder nenhum: só o console (`tools/admin.ts`) punia contas ([[Problem - Papéis de staff sem uso no código]]). A PF-6 dá à equipe o painel **Gerenciamento** (buscar contas, punir, trocar nome, aparência e progresso, promover e rebaixar) e a manutenção dos **mapas oficiais**. Decisões do dev: P12 e P16 ("quase admin": o moderador pode tudo o que o admin pode, menos editar, rebaixar ou punir um admin e promover alguém a admin).

## Problema

Onde e como conferir quem pode fazer o quê, sem que um moderador consiga agir sobre um admin e sem que um papel tirado continue valendo.

## Opções consideradas

1. **Papéis na sessão de login** (lidos no login, guardados com a sessão). Um papel tirado só deixaria de valer no próximo login.
2. **Papéis lidos do banco a cada pedido, regras puras compartilhadas.** Escolhida.

## Decisão

- **Regras puras em `shared/roles.ts`**, as mesmas no servidor e no cliente: `podeAgirSobre(ator, alvo)` (admin sobre todos; moderador sobre quem não é admin; user sobre ninguém), `podePunir` (agir sobre o alvo e nunca sobre si mesmo), `podeConceder(ator, papel)` (moderador nunca concede admin), `podePromover`, `podeRebaixar` (não remove o último admin).
- **Papéis lidos do banco em todo pedido** que precisa deles (`server/roles.ts`: `rolesOf`, `actor`, `requireRole(ctx, ...papeis)`). `GET /api/me` traz `papeis` só para a interface; o servidor nunca confia nele.
- A remoção de admin conta os admins e remove **sob o mesmo lock** (`SELECT ... FOR UPDATE`), para dois admins não se removerem ao mesmo tempo.
- **Auditoria com o autor**: `auth_event.actor_id` (migration 004) guarda quem da equipe agiu; `sanction.issued_by` e `account_role.granted_by` passam a ser preenchidos pela API.
- `server/moderacao.ts` recebe o id da conta e `by` (quem agiu); o console continua funcionando por tag (`resolveTag`).
- **A interface só esconde (fase 4).** A aba Gerenciamento aparece só com `papeis` de `/api/me`; o painel de uma conta mostra as partes que as `permissoes` de `GET /api/gestao/contas/:id` permitem (calculadas no servidor com as regras acima para quem pergunta: `editar`, `punir`, `conceder`, `remover`), e a aba Mapas mostra Editar, Ocultar e Excluir pelo papel, pelo dono (`MapaResumo.meu`) e pelo `pode` do servidor. Cada ação é conferida de novo no servidor.

## Motivo

Um papel tirado vale na hora; as regras ficam num lugar só e testáveis sem servidor (`client/tests/roles.test.ts`), e a matriz completa roda contra o servidor real (`server/tests/management.test.ts`). As telas não repetem as regras: leem as permissões que o servidor calculou (`client/tests/mapsScreen.test.ts` confere o que cada papel vê).

### Troca de nome pela equipe (P35)

A equipe troca o nome de uma conta sem o tempo de espera, e a troca grava `name_changed_at`: a espera de 7 dias do jogador recomeça a partir dela, para um nome ofensivo tirado pela equipe não voltar na hora (`changeName` com `staffId` em `server/accounts.ts`). As demais decisões abertas na fase 2 (P33 a P38) estão em [[ADR - Sessões sob demanda por versão do mapa]].

## Consequências

- Uma consulta a mais (`account_role`) por pedido da equipe e por pedido de mapa que depende de papel.
- O primeiro admin continua vindo do console (`bun run admin papel "Nome#1234" admin`).
- O console age com acesso direto ao banco e ainda grava `by = null` (o console não sabe quem o executa).

## Código afetado

`shared/roles.ts`, `server/roles.ts`, `server/route.ts`, `server/gestao.ts`, `server/mapRoutes.ts`, `server/moderacao.ts`, `server/accounts.ts` (`audit` com o autor), `tools/admin.ts`, `server/migrations/004_mapas.sql`. Ver [[Moderation]] e [[APIs]].

Relacionado: [[ADR - Sessões sob demanda por versão do mapa]] · [[ADR - Mapas como dados com catálogo de peças]] · [[Security Overview]]
