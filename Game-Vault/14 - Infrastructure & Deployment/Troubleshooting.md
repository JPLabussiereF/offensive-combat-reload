---
title: Troubleshooting
type: infrastructure
status: documented
area: infrastructure
source_paths:
  - docs/DEPLOY.md
  - README.md
  - server/index.ts
  - server/app.ts
  - server/http.ts
  - client/net/api.ts
  - client/render/quality.ts
  - tools/offensive.ts
tags:
  - infra
  - troubleshooting
updated: 2026-10-05
---

# Troubleshooting

Tabela consolidada de `docs/DEPLOY.md` (seção 4) e `README.md`, conferida com o código.

| Sintoma | Causa provável | O que fazer | Evidência no código |
| --- | --- | --- | --- |
| Terminal mostra `[servidor] não subiu` | Postgres ou Redis fora do ar | `docker compose up -d banco redis` | `server/index.ts` |
| "Servidor fora do ar" logo na tela inicial | Servidor não conecta no banco/Redis, ou `bun run dev` sem servidor | `docker compose logs jogo`; use `bun run dev:online` | `client/net/api.ts` converte rede/5xx/não-JSON em `offline` |
| A página abre mas diz "Servidor fora do ar" | Container `jogo` caiu ou nginx não repassa `/ws` | `docker compose logs jogo` | — |
| Os amigos não abrem a página | Firewall do Windows, porta não redirecionada, CGNAT | `offensive firewall`; usar Radmin ou túnel | `tools/offensive.ts` |
| Todo mundo a ~10 FPS | Navegador sem aceleração de hardware (WebGL por software) | Ativar aceleração gráfica no navegador; F3 mostra a GPU | `client/render/quality.ts` (`SOFTWARE_RENDERERS`) |
| Mudei o código e nada mudou | Imagem antiga | `docker compose up -d --build` e recarregar | `index.html` com `no-cache` no nginx |
| Botão "Entrar com Discord" não aparece | Endereço não está em `DISCORD_RETORNOS` ou faltam id/segredo | Configurar `.env` | `server/auth/discord.ts` (`returnUrlFor`) |
| Link de recuperação não chega | Sem `SMTP_USUARIO`/`SMTP_SENHA_APP` (vai para o log) ou senha de app errada | Ver log `[email]`; checar senha de app | `server/email.ts` |
| Todo login devolve `origem_invalida` | `Origin` não bate com o `Host` que chega ao servidor | Usar o nginx do pacote (repassa `$http_host`) ou listar a origem em `ORIGENS_PERMITIDAS` | `server/http.ts` (`originAllowed`) |
| `muitas_tentativas` (429) | 5 tentativas/min por IP no servidor, ou 10/min no nginx | Esperar | `server/auth/password.ts`, nginx |
| Login certo responde `credenciais_invalidas` | Conta bloqueada por 15 min após 10 falhas | Esperar ou redefinir a senha (zera o bloqueio) | `server/auth/password.ts` |
| Conexão de jogo cai com código 4002 | Mesma conta entrou em outro lugar | — | `server/app.ts` (`CLOSE.replaced`) |
| Conexão cai com código 4001 | Logout, redefinição de senha, banimento ou exclusão | — | `shared/protocol.ts` (`CLOSE.revoked`) |
| Página em `:8787` diz "rode bun run build" | `bun start` sem `dist/` | `bun run build` | `server/app.ts` (`staticFile`) |
| `offensive` diz que o jogo não respondeu em 60 s | Build falhou ou servidor não conecta | O comando mostra as últimas 30 linhas do log de `jogo` | `tools/offensive.ts` |
| Testes falham ao conectar | Banco/Redis de desenvolvimento parados | `docker compose up -d banco redis` | `bunfig.toml`, `server/tests/preload.ts` |

## Código relacionado

- `docs/DEPLOY.md` (seção 4), `README.md` ("Desempenho")
- `server/index.ts`, `server/app.ts`, `server/http.ts`, `server/auth/*.ts`, `client/net/api.ts`, `client/render/quality.ts`, `tools/offensive.ts`

Ver também: [[Logging]], [[Hosting]], [[Known Bottlenecks]].
