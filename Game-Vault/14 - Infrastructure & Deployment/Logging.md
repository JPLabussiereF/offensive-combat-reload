---
title: Logging
type: infrastructure
status: documented
area: infrastructure
source_paths:
  - server/index.ts
  - server/app.ts
  - server/api.ts
  - server/db.ts
  - server/redis.ts
  - server/jobs.ts
  - server/email.ts
  - server/auth/discord.ts
  - server/accounts.ts
  - tools/dev-online.ts
  - deploy/offensive-combat.service
tags:
  - infra
  - logs
updated: 2026-10-05
---

# Logging

O servidor registra **apenas no console** (`console.log` / `console.error`), sem biblioteca de log, sem níveis configuráveis, sem formato estruturado (JSON) e sem arquivo próprio. Quem coleta é o ambiente:

| Ambiente | Onde ler |
| --- | --- |
| Docker | `docker compose logs -f jogo` ou `offensive logs` |
| systemd | `journalctl -u offensive-combat -f` |
| `bun run dev:online` | terminal, com prefixo `[jogo]` / `[vite]` (`tools/dev-online.ts`) |

## Prefixos usados

| Prefixo | Origem | Exemplos de mensagem |
| --- | --- | --- |
| `[servidor]` | `server/index.ts` | endereço ao subir; "não subiu" + dica de subir banco e Redis |
| `[banco]` | `server/db.ts` | "migration aplicada: <arquivo>"; "conexão ociosa falhou" |
| `[redis]` | `server/redis.ts` | erros de conexão do ioredis |
| `[api]` | `server/api.ts` | `MÉTODO caminho: mensagem` em erro 500 |
| `[ws]` | `server/app.ts` | erro no handshake |
| `[progresso]` | `server/app.ts` | falha ao gravar (tenta de novo no próximo ciclo); falha ao abrir participação |
| `[chat]` | `server/app.ts` | falha ao recarregar silêncio |
| `[jobs]` | `server/jobs.ts` | partição não criada; "N conta(s) anonimizada(s)" |
| `[email]` | `server/email.ts` | sem SMTP: imprime destinatário e **texto do e-mail** (inclui o link de recuperação) |
| `[discord]` | `server/auth/discord.ts` | troca de código falhou |

## Regras de privacidade nos logs

- `server/api.ts`: "Never log the request itself: it may carry cookies or passwords" — só método, caminho e mensagem do erro.
- Tickets e tokens de recuperação são guardados como **hash** no Redis; o comentário em `server/app.ts` observa que "um ticket visto num log já está gasto" (uso único).

> [!warning] Link de recuperação no log
> Sem SMTP configurado, o link de redefinição de senha (que dá acesso à conta por 24 h) é impresso no log do servidor. É o comportamento esperado em desenvolvimento, mas em produção sem SMTP qualquer pessoa com acesso ao log pode redefinir senhas. Ver [[Sensitive Data]].

## Logs de auditoria (banco)

Separado do console: `auth_event` (particionada por mês) guarda eventos de autenticação e moderação com IP e user-agent. Ver [[Moderation]] e [[Database]].

## Cliente

O cliente só usa `console.error` no boot (`client/main.ts`) e mostra o erro na tela de carregamento ("Erro ao iniciar: ..."). Não há envio de erros do cliente para o servidor.

## Código relacionado

- `server/*.ts` (pontos listados acima), `tools/dev-online.ts`, `deploy/offensive-combat.service`

Ver também: [[Monitoring]], [[Error Handling]], [[Troubleshooting]].
