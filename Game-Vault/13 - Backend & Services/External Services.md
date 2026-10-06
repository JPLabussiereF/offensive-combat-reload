---
title: External Services
type: service
status: documented
area: backend
source_paths:
  - server/auth/discord.ts
  - server/email.ts
  - server/config.ts
  - docs/DEPLOY.md
  - docker-compose.yml
  - .github/workflows/ci.yml
tags:
  - backend
  - externo
  - discord
  - smtp
updated: 2026-10-05
---

# External Services

Serviços fora do processo do jogo dos quais o projeto depende ou que a documentação recomenda. Bibliotecas e versões ficam em [[External References]]; a forma de ligar cada um no código fica em [[Integrations]].

## Serviços chamados pelo código

| Serviço | Para quê | Obrigatório? | Onde | Configuração |
| --- | --- | --- | --- | --- |
| **PostgreSQL 18** | Contas, perfis, progresso, sanções, auditoria | Sim | `server/db.ts` | `DATABASE_URL` |
| **Redis 8** | Limites, bloqueios, tickets, tokens de recuperação, pub/sub | Sim | `server/redis.ts` | `REDIS_URL` |
| **Discord OAuth 2** (`discord.com/api/v10/users/@me` + endpoints de OAuth via `arctic`) | "Entrar com Discord" e vínculo de conta | Não (botão some sem config) | `server/auth/discord.ts` | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_RETORNOS` |
| **Gmail SMTP** (`smtp.gmail.com:465`, TLS) | E-mail de recuperação de senha | Não (sem config o link vai para o log) | `server/email.ts` | `SMTP_USUARIO`, `SMTP_SENHA_APP`, `SMTP_REMETENTE` |

> [!info] PostgreSQL e Redis
> Embora sejam "serviços externos" ao processo, eles rodam como containers do próprio `docker-compose.yml` (`banco` e `redis`), não como serviços gerenciados. Ver [[Database]], [[Cache]] e [[Hosting]].

### Discord

- Escopo pedido: apenas `identify`. O e-mail do Discord não é lido.
- As URLs de retorno precisam estar cadastradas no aplicativo Discord **e** em `DISCORD_RETORNOS`, uma por endereço de onde o jogo é aberto. O `docs/DEPLOY.md` observa que o Discord pode recusar `http://` que não seja `localhost`.
- Falha na troca do código ou em `users/@me` → log `[discord] troca do código falhou` e redirecionamento `/#erro=nao_autorizado`.

### Gmail SMTP

- Usa uma **senha de app** do Google (não a senha da conta), conforme `server/email.ts` e `docs/DEPLOY.md`.
- O `docs/DEPLOY.md` cita o limite do Gmail de ~500 e-mails/dia; o jogo limita 3 links por hora por conta.
- Falha de envio vira evento de auditoria `email_fail` (o pedido continua respondendo 204).

## Serviços citados apenas na documentação de hospedagem

Não são chamados pelo código; são opções de rede para os jogadores chegarem ao servidor (ver [[Hosting]]):

| Serviço | Uso sugerido em `docs/DEPLOY.md` |
| --- | --- |
| Radmin VPN | Rede local virtual entre amigos, sem expor nada. |
| Cloudflare Tunnel (`cloudflared`) | URL `https://*.trycloudflare.com` sem abrir porta (contorna CGNAT). |
| Let's Encrypt / certbot | HTTPS no nginx em VPS. |
| VPS (Oracle Cloud Free, Hetzner, DigitalOcean...) | Servidor 24 h com endereço fixo. |
| Docker Desktop | Executar a pilha no Windows (o `tools/offensive.ts` abre o app se estiver fechado). |

## Serviços de desenvolvimento

- **GitHub Actions** — CI em pull requests (ver [[CI CD]]).

## Não existe

Não há telemetria, analytics, crash reporting, CDN, serviço de e-mail transacional dedicado, nem provedor de identidade além do Discord (verificado em `package.json` e `server/`).

## Código relacionado

- `server/auth/discord.ts`, `server/email.ts`, `server/config.ts`, `server/db.ts`, `server/redis.ts`
- `docs/DEPLOY.md` (seções 2 e 5)
