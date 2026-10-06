---
title: Integrations
type: service
status: documented
area: backend
source_paths:
  - server/auth/discord.ts
  - server/email.ts
  - server/redis.ts
  - server/db.ts
  - server/app.ts
  - server/moderacao.ts
  - client/ui/home.ts
  - vite.config.ts
tags:
  - backend
  - integracao
updated: 2026-10-05
---

# Integrations

Como o código se conecta a cada peça externa ou de infraestrutura, e como se comporta quando ela não está disponível. A lista de serviços está em [[External Services]].

## Mapa de integrações

| Integração | Biblioteca | Ponto de contato | Comportamento sem a peça |
| --- | --- | --- | --- |
| PostgreSQL | `pg` (`Pool`, `max: 10`) | `createDb`, `migrate`, `transaction` (`server/db.ts`) | Servidor **não sobe** (`[servidor] não subiu`). Conexão ociosa que cai → log `[banco] conexão ociosa falhou`. |
| Redis (comandos) | `ioredis` (`maxRetriesPerRequest: 2`) | `createRedis`, `hit` (`server/redis.ts`) | Erros vão ao log `[redis]`; pedidos que dependem de Redis falham (500). |
| Redis (pub/sub) | segunda conexão `ioredis` | `sub.subscribe(REVOCATION_CHANNEL, MUTE_CHANNEL)` (`server/app.ts`) | Revogação/silêncio não chegam à partida em andamento. |
| Discord | `arctic` (`Discord`) + `fetch` | `startDiscord`, `discordCallback` | Botão escondido (`/api/auth/provedores` → `discord: false`). |
| SMTP | `nodemailer` | `sendMail` (`server/email.ts`) | Mensagem guardada em `outbox` (até 50) e impressa no log (exceto com `NODE_ENV=test`). |
| Vite (dev) | proxy do Vite | `vite.config.ts` → `/api` e `/ws` para `localhost:8787` com `xfwd` | Cliente mostra "offline" ao chamar a API. |

## Canais pub/sub

| Canal | Publicado por | Efeito no servidor do jogo |
| --- | --- | --- |
| `oc:revogacao` | logout, redefinição de senha, banimento, exclusão de conta | Fecha a conexão de jogo da conta com código `4001` ("sessao encerrada"). |
| `oc:silencio` | `mute`/`unmute` em `server/moderacao.ts` | Recarrega `chatMutedUntil` do banco para a conexão viva. |

> [!info] Inferência
> Como o canal é do Redis (e não do processo), o comentário de `server/moderacao.ts` diz que o banimento fecha a conexão "em todo servidor". Hoje só existe um processo de jogo por implantação; o desenho já permitiria mais de um.

## Retornos para o cliente por fragmento de URL

Fluxos que saem do site (Discord, link de e-mail) voltam por **fragmento** (`#`), lido por `client/ui/home.ts` e apagado do histórico:

| Fragmento | Origem | Ação no cliente |
| --- | --- | --- |
| `#redefinir=<token>` | link do e-mail | Abre a tela de nova senha. |
| `#escolher-nome` | primeira entrada pelo Discord | Abre a escolha de nome. |
| `#perfil` | vínculo do Discord | Abre o perfil. |
| `#erro=<código>` | falhas do Discord | Mostra a mensagem de erro traduzida. |

## Endereço público e proxies

- `publicOrigin(req)` monta `http(s)://<Host>` usando `X-Forwarded-Proto` — usado no link de recuperação e na escolha da URL de retorno do Discord.
- `clientIp(req)` só confia em `X-Forwarded-For` quando a conexão vem de endereço privado/local (nginx, Vite).

## Código relacionado

- `server/db.ts`, `server/redis.ts`, `server/email.ts`, `server/auth/discord.ts`, `server/http.ts`
- `server/app.ts` (assinatura dos canais), `server/moderacao.ts` (publicação)
- `client/ui/home.ts` (fragmentos), `vite.config.ts` (proxy)

Ver também: [[Events & Messaging]], [[Configuration Reference]].
