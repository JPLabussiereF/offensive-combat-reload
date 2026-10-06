---
title: Error Handling
type: architecture
status: documented
area: code-architecture
source_paths:
  - server/index.ts
  - server/app.ts
  - server/http.ts
  - server/api.ts
  - server/db.ts
  - server/redis.ts
  - server/jobs.ts
  - server/accounts.ts
  - server/email.ts
  - server/moderacao.ts
  - server/session.ts
  - tools/admin.ts
  - shared/account.ts
  - shared/protocol.ts
  - client/main.ts
  - client/net/api.ts
  - client/net/connection.ts
  - client/ui/home.ts
  - client/core/settings.ts
  - client/world/surfaces.ts
  - client/ai/navmesh.ts
tags:
  - architecture
  - errors
  - logging
updated: 2026-10-05
---

# Error Handling

## Princípios observados

1. **Erros esperados viram códigos estáveis em português** (`snake_case`), nunca mensagens livres: `HttpError(status, code, extra)` no servidor e `ApiError(status, code, extra)` no cliente compartilham o tipo `ApiErrorCode` (`shared/account.ts`).
2. **Mensagens inválidas do jogo são descartadas em silêncio**, não respondidas: o servidor não dá pistas a quem manda lixo (`server/app.ts`, `server/session.ts`).
3. **Falhas de infraestrutura não derrubam o processo**: são registradas com prefixo entre colchetes e, quando faz sentido, tentadas de novo.
4. **Nunca logar a requisição** (pode conter cookie ou senha) — comentário explícito em `handleApi`.

## Servidor

### API HTTP (`server/http.ts`, `server/api.ts`)

- `HttpError` carrega `status`, `code` e `extra` (ex.: `conta_suspensa` com `{ ate }`, `cooldown_nome` com `{ liberaEm }`).
- `handleApi` envolve cada rota: `HttpError` → `json(status, { erro: code, ...extra })` (preservando cookies de renovação); qualquer outro erro → log `[api] MÉTODO /caminho: mensagem` e `500 { erro: 'erro_interno' }`.
- Rota inexistente → `404 nao_encontrado`; método que muda estado com Origin de outro site → `403 origem_invalida`.
- `readJson` limita o corpo a 16 KiB (`413 corpo_grande_demais`) e rejeita JSON que não seja objeto (`400 json_invalido`).
- Lista completa de códigos: `ApiErrorCode` em `shared/account.ts` (ver [[APIs]]).

### WebSocket (`server/app.ts`, `server/session.ts`)

| Situação | Tratamento |
| --- | --- |
| Handshake sem `Upgrade` / Origin inválido / sem ticket / ticket gasto | `426` / `403` / `401` / `401` (resposta vazia) |
| Conta inativa ou banida no handshake | `403` |
| Exceção no handshake | log `[ws] handshake:` + `500` |
| Inundação (> 150 msg/s no token bucket) | mensagem descartada |
| JSON inválido ou sem `t` string | descartado |
| Campos inválidos (`vec`, `finite`, região desconhecida, distância incoerente...) | `return` silencioso em cada handler |
| Erros de fluxo esperados do lobby | `{ t: 'error', message }` em pt-BR ("Diga olá primeiro.", "Essa sessão não existe mais.", "Sessão lotada.") |
| Chat recusado | `{ t: 'chatRefused', reason: 'muted' \| 'slow' }` |
| Sessão revogada / conta conectada em outro lugar | fecha com `CLOSE.revoked` (4001) / `CLOSE.replaced` (4002) |
| Servidor reiniciando | fecha com 1001 |

### Persistência e infraestrutura

- **Progresso**: falha no `flushProgress` → `mergeDelta` devolve o delta e loga `[progresso] gravação falhou, tento de novo no próximo ciclo`. Falha ao abrir a participação → loga e segue com `null` (`server/app.ts`).
- **Banco**: `transaction()` faz `ROLLBACK` (ignorando erro do próprio rollback) e relança; erro de conexão ociosa do pool → log `[banco]` (`server/db.ts`). Cada migration roda numa transação.
- **Redis**: evento `error` → log `[redis]`; `maxRetriesPerRequest: 2` (`server/redis.ts`).
- **Auditoria**: `audit()` não bloqueia; erro → log `[auditoria]` (`server/accounts.ts`).
- **Jobs**: erro de uma partição é logado e os demais seguem; erro geral → `[jobs]` (`server/jobs.ts`).
- **Discord**: como é um fluxo de redirecionamento, os erros voltam na URL: `redirect('/#erro=<código>')` (ex.: `discord_indisponivel`, `nao_autorizado`); falha na troca do código também loga `[discord]` (`server/auth/discord.ts`).
- **E-mail sem SMTP**: não é erro — a mensagem vai para `outbox` (máx. 50) e o link é impresso no console (`server/email.ts`).
- **Inicialização**: falha em `startServer` → `[servidor] não subiu: ...` + dica de subir banco e Redis + `process.exit(1)` (`server/index.ts`).
- **Desligamento**: `SIGTERM`/`SIGINT` → `close()` gravando progresso, com saída forçada após 3 s.

### Moderação (CLI)

`ModerationError` (`server/moderacao.ts`) sinaliza erro de uso ("Conta não encontrada", "Duração inválida", "Papel desconhecido"); `tools/admin.ts` lança-o com o texto de uso.

## Cliente

| Onde | Tratamento |
| --- | --- |
| `boot().catch` (`client/main.ts`) | `console.error` + texto "Erro ao iniciar: ..." em `#loading-tip` (erro fatal de inicialização) |
| `api()` (`client/net/api.ts`) | `fetch` falhou → `ApiError(0, 'offline')`; resposta não-JSON (Vite sem servidor) ou 5xx sem código → `'offline'`; caso contrário o código `erro` do servidor |
| `fetchMe()` | nunca lança: devolve `{ me: null, offline }` para a home mostrar "servidor fora do ar" ou "não logado" |
| `Connection.open()` | rejeita com "não foi possível conectar ao servidor"; a home traduz para `errOffline` |
| `Connection` mensagens | JSON inválido é ignorado |
| `conn.onClose` | HUD mostra `closeReason(code)` (sessão encerrada / conectado em outro lugar) ou "conexão perdida" (`hud.setNetStatus`) |
| `localStorage` | todo acesso em `try/catch` vazio ("storage unavailable") (`client/core/settings.ts`, `client/ui/home.ts`) |
| Texturas trocáveis | manifest ausente → ignora; arquivo que falha → `console.warn('[texturas] ...')` e mantém a procedural (`client/world/surfaces.ts`) |
| Navmesh | falha do Recast → `console.warn('[bots] falha ao gerar a malha de navegação')` e `null`; o `BotManager` só é criado se `nav` existir (`if (botMode && nav)`) — a partida contra bots começa sem bots nesse caso (inferência pelo código) |
| Respawn online não aceito | se o `snap` diz morto 1,5 s depois do respawn local, o cliente pede de novo (`client/main.ts`) |

## Logging

Logs são `console.log/warn/error` com **prefixo de módulo em português** entre colchetes: `[servidor]`, `[banco]`, `[redis]`, `[ws]`, `[api]`, `[progresso]`, `[jobs]`, `[chat]`, `[auditoria]`, `[discord]`, `[email]`, `[texturas]`, `[bots]`. Não há biblioteca de log nem níveis configuráveis. Ver [[Logging]] e [[Monitoring]].

## Riscos

- Descarte silencioso dificulta depurar clientes legítimos com bug (nenhum contador de mensagens rejeitadas).
- Não há tratamento global de `unhandledrejection` no cliente nem no servidor (busca por esses handlers não encontrou nada).

## Código relacionado

- `server/http.ts` (`HttpError`, `readJson`), `server/api.ts` (`handleApi`), `server/app.ts` (`upgrade`, `flush`, `message`), `server/db.ts` (`transaction`), `server/index.ts`
- `client/net/api.ts` (`ApiError`, `fetchMe`), `client/net/connection.ts`, `client/ui/home.ts` (`closeReason`), `client/main.ts` (`boot().catch`)

Ver também: [[Validation]], [[Troubleshooting]].
