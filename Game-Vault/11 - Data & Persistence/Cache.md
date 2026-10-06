---
title: Cache
type: system
status: documented
area: data
source_paths:
  - server/redis.ts
  - server/api.ts
  - server/app.ts
  - server/auth/password.ts
  - server/auth/sessions.ts
  - server/moderacao.ts
  - server/http.ts
  - docker-compose.yml
  - deploy/nginx/docker.conf
tags:
  - game
  - data
  - redis
  - cache
updated: 2026-10-06
---

# Cache

> [!info]
> Não há cache de **dados do banco** (perfis, estatísticas) em Redis ou em memória compartilhada. O Redis é usado como **armazenamento efêmero** de tokens, contadores e mensagens pub/sub. O único "cache" de dados de jogador é o `LiveAccount` em memória enquanto a conexão de jogo existe ([[Player Data]]).

## Redis

- **Redis 8** (`redis:8-alpine`), **sem persistência** (`--save '' --appendonly no`): "nothing here needs to survive a restart" (`docker-compose.yml`). Ver [[ADR - Redis efêmero sem persistência]].
- Cliente `ioredis`, `maxRetriesPerRequest: 2`; erros só logados.
- **Duas conexões** no servidor do jogo: uma para comandos, outra só para `SUBSCRIBE`.
- URL via `REDIS_URL` (dev: porta 6392; testes: db 1 via `REDIS_URL_TESTE`).

### Chaves

| Chave | Valor | TTL | Escrita | Leitura |
|---|---|---|---|---|
| `ws:ticket:<sha256 do ticket>` | id da conta | **30 s** | `POST /api/ws-ticket` (`SET ... EX 30`) | handshake `/ws` (`GETDEL`, uso único) |
| `rec:<sha256 do token>` | id da conta | **24 h** (`resetTtlSeconds`) | `POST /api/auth/recuperar` | `POST /api/auth/redefinir` (`GETDEL`) |
| `rl:cadastro:ip:<ip>` | contador | 60 s | cadastro | limite 5/min por IP |
| `rl:login:ip:<ip>` | contador | 60 s | login | limite 5/min por IP |
| `rl:recuperar:ip:<ip>` | contador | 60 s | pedido de redefinição | limite 5/min por IP |
| `rl:login:conta:<id>` | falhas seguidas | 900 s (renovado a cada falha) | login com senha errada | bloqueio com ≥ 10; apagada no login certo e na redefinição |
| `rl:rec:conta:<id>` | contador | 3600 s | pedido de redefinição | máx. 3 e-mails/hora por conta |

Contadores de limite usam **janela fixa**: `hit()` faz `INCR` + `EXPIRE NX` numa transação (`MULTI`), então a janela começa no primeiro acesso.

Tokens nunca são guardados em claro: a chave é o SHA-256 do token ([[Sensitive Data]]).

### Canais pub/sub

| Canal | Mensagem | Publicado por | Efeito no servidor do jogo |
|---|---|---|---|
| `oc:revogacao` | id da conta | logout, `revokeAll` (redefinição de senha, banimento), `DELETE /api/conta` | fecha a conexão de jogo da conta com `4001` |
| `oc:silencio` | id da conta | `mute`/`unmute` (`tools/admin.ts`, API de Gerenciamento) | recarrega `chatMutedUntil` da conexão viva |
| `oc:perfil` | id da conta | `PATCH /api/gestao/contas/:id` | recarrega o perfil da conexão viva e manda o progresso novo |

Permite que o console de administração (outro processo) aja sobre partidas em andamento. Ver [[Moderation]] e [[Sessions]].

## Cache HTTP

- Respostas da API: `cache-control: no-store` (`json()` e `redirect()` em `server/http.ts`; o nginx também adiciona `no-store` em `/api/`).
- nginx (produção): `/assets/` (arquivos com hash) com `expires 1y` + `immutable`; `.glb`/`.ktx2` 1 h; a página `index.html` com `no-cache` (sempre revalidada para um build novo chegar a todos). Ver [[Loading Performance]] e [[Hosting]].

## Cache em memória do servidor

- `LiveAccount` por conexão (perfil + delta).
- Lista de salas recalculada a cada pedido; difusão agrupada em 100 ms.
- `dummyHash` (hash Argon2id fictício) calculado uma vez e reutilizado para igualar o tempo de login com e-mail inexistente.

## Código relacionado

- `server/redis.ts` — `createRedis`, `hit`, `REVOCATION_CHANNEL`, `MUTE_CHANNEL`, `PROFILE_CHANNEL`.
- Chaves dos mapas (PF-6): `mapa:envios:<conta>` (envios de GLB por hora, `hit`) e `mapa:jogada:<mapa>:<conta ou ip>` (uma jogada offline por hora, `SET NX EX 3600`).
- `server/api.ts` — `ticketKey`, `TICKET_TTL_SECONDS`.
- `server/auth/password.ts` — `LIMITS`, `limitIp`.
- `server/app.ts` — `GETDEL` do ticket, assinatura dos canais.
- Ver também [[Anti Exploit]], [[Data Architecture]].
