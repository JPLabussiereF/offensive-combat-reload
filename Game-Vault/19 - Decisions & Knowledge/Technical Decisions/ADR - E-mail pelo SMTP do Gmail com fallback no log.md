---
title: ADR - E-mail pelo SMTP do Gmail com fallback no log
type: decision
status: documented
area: backend
source_paths:
  - server/email.ts
  - server/auth/password.ts
  - docs/DEPLOY.md
tags:
  - adr
  - email
updated: 2026-10-05
---

# ADR - E-mail pelo SMTP do Gmail com fallback no log

## Contexto

A recuperação de senha precisa enviar um link por e-mail. O projeto é auto-hospedado, sem orçamento de serviço transacional.

## Problema

Exigir um provedor de e-mail impediria rodar o jogo sem configuração.

## Opções consideradas

Não registradas; só a escolha existe no código.

## Decisão

`nodemailer` com `smtp.gmail.com:465` e **senha de app** (`SMTP_USUARIO`, `SMTP_SENHA_APP`, `SMTP_REMETENTE`). Sem essas variáveis, a mensagem vai para `outbox` (até 50, usado pelos testes) e é **impressa no log**.

## Motivo

`server/email.ts`: "Without SMTP settings (development, tests) messages are kept in `outbox` and the link is printed on the console instead." O `docs/DEPLOY.md` lembra o limite do Gmail (~500/dia) frente ao limite do jogo (3 links/h por conta).

## Consequências

- Funciona sem configuração; testes leem o link do `outbox`.
- Em produção sem SMTP, links de redefinição ficam no log (ver [[Logging]] e [[Sensitive Data]]).
- Falha de envio vira `email_fail` na auditoria, sem erro para o usuário.

## Código afetado

`server/email.ts`, `server/auth/password.ts`. Ver [[External Services]].
