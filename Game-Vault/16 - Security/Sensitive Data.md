---
title: Sensitive Data
type: system
status: documented
area: security
source_paths:
  - server/auth/sessions.ts
  - server/auth/password.ts
  - server/auth/discord.ts
  - server/accounts.ts
  - server/api.ts
  - server/http.ts
  - server/config.ts
  - server/email.ts
  - server/jobs.ts
  - server/migrations/001_contas.sql
  - client/net/api.ts
  - docker-compose.yml
  - docs/DEPLOY.md
tags:
  - game
  - security
  - privacy
  - secrets
updated: 2026-10-05
---

# Sensitive Data

> [!important]
> Este vault não contém nenhum segredo real. Para credenciais, só o nome da variável, a finalidade, onde é usada e como é fornecida.

## Dados pessoais e de autenticação armazenados

| Dado | Onde | Proteção |
|---|---|---|
| E-mail | `account.email` (citext) | Só usado para login e redefinição; apagado na anonimização |
| Senha | `password_credential.password_hash` | **Argon2id** (`Bun.password`, memória 19 MiB = 19456 KiB, 2 passadas, 1 via: mínimo da OWASP); tabela separada de `account` para nenhuma consulta de conta carregar o hash |
| Token de sessão | cookie `oc_sessao`; banco guarda só `session.token_hash` (SHA-256, `bytea`) | 32 bytes aleatórios; cookie `HttpOnly; SameSite=Lax; Path=/; Max-Age=30 dias` + `Secure` em HTTPS; renovação deslizante no máx. 1×/hora |
| Ticket do WebSocket | Redis `ws:ticket:<sha256>` | 30 s, uso único |
| Link de redefinição | Redis `rec:<sha256>`; token só no e-mail (fragmento `#redefinir=` da URL) | 24 h, uso único |
| Estado OAuth Discord | cookie `oc_oauth` (`state`, `verifier` PKCE) | `HttpOnly`, 10 min, `Path=/api/auth/discord` |
| Id do Discord | `auth_identity.provider_subject` | Só escopo `identify` (sem e-mail do Discord); token de acesso do Discord não é guardado |
| IP e user agent | `session.ip`, `session.device_label` (UA ≤ 120), `auth_event.ip`, `auth_event.user_agent` (≤ 300) | Auditoria; IP do cliente via `clientIp` |
| Histórico de nomes | `display_name_history` | Apagado na anonimização |
| Sanções | `sanction` (motivo, quem aplicou) | Histórico permanente |

O navegador **não guarda nenhum token legível por script**: nada de autenticação em `localStorage` (comentário de `client/net/api.ts`). O servidor faz o papel de BFF. Ver [[Authentication]].

## Segredos de configuração

| Variável | Finalidade | Onde é usada | Como fornecer |
|---|---|---|---|
| `PG_SENHA` | Senha do PostgreSQL no Docker | `docker-compose.yml` (monta `DATABASE_URL`) | `.env` ao lado do `docker-compose.yml` (no `.gitignore`); padrão `oc` só para dev — **trocar antes de expor** |
| `DATABASE_URL` | String de conexão do banco (contém a senha) | `server/config.ts` | ambiente / compose |
| `REDIS_URL` | Conexão do Redis | `server/config.ts` | ambiente / compose |
| `DISCORD_CLIENT_SECRET` | Segredo do app OAuth do Discord | `server/auth/discord.ts` | `.env` |
| `DISCORD_CLIENT_ID`, `DISCORD_RETORNOS` | Id e URLs de retorno (não secretos, mas configuração sensível) | `server/auth/discord.ts` | `.env` |
| `SMTP_SENHA_APP` | Senha de app do Gmail (não a senha da conta) | `server/email.ts` | `.env` |
| `SMTP_USUARIO`, `SMTP_REMETENTE` | Conta de envio | `server/email.ts` | `.env` |
| `ORIGENS_PERMITIDAS` | Origens extras confiáveis (não secreta; afeta segurança) | `server/http.ts` | `.env` |
| `DATABASE_URL_TESTE`, `REDIS_URL_TESTE` | Bancos de teste | `server/tests/env.ts` | ambiente local |

Procedimento em `docs/DEPLOY.md`; ver [[Configuration Reference]] e [[Environments]].

## Logs

- A API **nunca loga a requisição** ("may carry cookies or passwords"): só método, caminho e mensagem de erro.
- Erros de e-mail são auditados com a mensagem cortada em 200 caracteres.
- **Sem SMTP configurado** (dev/testes), o e-mail de redefinição — com o link de uso único — é impresso no console do servidor (exceto em `NODE_ENV=test`) e guardado num `outbox` em memória (máx. 50). Em produção sem SMTP, isso significa links válidos no log. Ver [[Logging]].
- Auditoria de autenticação em `auth_event` (tipos: `register`, `login_ok`, `login_fail`, `lockout`, `logout`, `pwd_reset_request`, `pwd_reset`, `email_fail`, `discord_login`, `discord_link`, `discord_unlink`, `name_change`, `delete_request`, `delete_cancel`, `anonymized`, `ban`, `unban`, `chat_mute`, `chat_unmute`, `role_grant`, `role_revoke`). Falha de auditoria não quebra o login.

## Retenção e exclusão (LGPD)

- Pedido de exclusão → `pending_deletion` por **30 dias** (cancelável); online bloqueado; outras sessões revogadas.
- Após a carência, `anonymizeExpired` (job diário): e-mail e verificação → NULL; credenciais, identidades e sessões apagadas; perfil vira "Jogador excluído" com novo discriminador, `avatar_url` e `bio` → NULL; histórico de nomes apagado; evento `anonymized`.
- **Mantidos**: ids, estatísticas, participações (sustentam o histórico de outros jogadores) e os registros de `auth_event` (com IP e user agent) e `sanction`.

> [!warning]
> Não há rotina de expurgo de `auth_event` antigos nem de sessões vencidas/revogadas: as partições mensais são só criadas (verificado em `server/jobs.ts`).

## Dados expostos a outros jogadores

Tag `Nome#1234`, nível da conta, sexo, aparência, loadout, kills/deaths/score/humiliations e **ping** (via `PlayerInfo`). Nenhum e-mail, IP ou id de conta é enviado a outros jogadores (o `id` do protocolo é um número por conexão, não o id da conta).

## Código relacionado

- `server/auth/sessions.ts`, `server/auth/password.ts`, `server/auth/discord.ts`, `server/http.ts` (`cookie`, `randomToken`, `sha256`), `server/accounts.ts` (`audit`, `anonymizeExpired`), `server/email.ts`, `server/config.ts`, `server/jobs.ts`.
- Ver também [[Security Overview]], [[Player Data]], [[Database]].
