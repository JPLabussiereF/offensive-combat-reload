---
title: Configuration Reference
type: reference
status: documented
area: configuration
source_paths:
  - server/config.ts
  - server/index.ts
  - server/email.ts
  - server/tests/env.ts
  - tools/offensive.ts
  - docker-compose.yml
  - Dockerfile
  - deploy/offensive-combat.service
  - .github/workflows/ci.yml
  - vite.config.ts
  - bunfig.toml
  - docs/DEPLOY.md
  - shared/data/progression.json
  - client/core/keybinds.ts
  - shared/data/zumbi.json
  - tools/bake-navmesh.ts
tags:
  - referencia
  - configuracao
  - env
updated: 2026-10-07
---

# Configuration Reference

Todas as variáveis de ambiente encontradas no projeto. **Nenhum valor de segredo é registrado aqui** — apenas nome, finalidade, default (quando não é segredo) e onde é usada. Os segredos são fornecidos por um arquivo **`.env` ao lado do `docker-compose.yml`** (está no `.gitignore`; nunca deve ir para o git) ou pelo ambiente do processo (systemd, shell).

## Servidor do jogo (`server/config.ts`, `server/index.ts`)

| Variável | Finalidade | Default | Segredo? | Usada em |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | `production` define `CONFIG.production` (não usado hoje); `test` silencia o log de e-mail | — (Dockerfile e systemd definem `production`) | não | `server/config.ts`, `server/email.ts` |
| `HOST` | Interface de escuta | `0.0.0.0` (systemd: `127.0.0.1`; Docker: `0.0.0.0`) | não | `server/index.ts` |
| `PORT` | Porta HTTP/WS | `8787` (`NET.port`) | não | `server/index.ts` |
| `DATABASE_URL` | Conexão PostgreSQL | Postgres local `localhost:5442`, banco/usuário `oc` (credencial de desenvolvimento do compose) | **sim** em produção | `server/config.ts` → `server/db.ts`, `tools/admin.ts` |
| `REDIS_URL` | Conexão Redis | `localhost:6392` | depende (sem senha no compose) | `server/config.ts` → `server/redis.ts` |
| `ORIGENS_PERMITIDAS` | Origens extras aceitas na API e no WebSocket, separadas por vírgula (barra final removida). O mesmo site é sempre aceito. | vazio | não | `server/http.ts` (`originAllowed`) |
| `DISCORD_CLIENT_ID` | Id do aplicativo Discord | vazio (Discord desligado) | não (mas privado) | `server/auth/discord.ts` |
| `DISCORD_CLIENT_SECRET` | Segredo OAuth do Discord | vazio | **sim** | `server/auth/discord.ts` |
| `DISCORD_RETORNOS` | URLs completas de retorno (`.../api/auth/discord/retorno`), uma por endereço do jogo, separadas por vírgula | vazio | não | `server/auth/discord.ts` |
| `SMTP_USUARIO` | Conta Gmail que envia | vazio (e-mail vai para o log) | não (dado pessoal) | `server/email.ts` |
| `SMTP_SENHA_APP` | **Senha de app** do Google (não a senha da conta) | vazio | **sim** | `server/email.ts` |
| `SMTP_REMETENTE` | Endereço "From" | `SMTP_USUARIO` | não | `server/email.ts` |
| `ADMIN_BOOTSTRAP_EMAIL` | E-mail do admin inicial, criado ao subir enquanto nenhuma conta é admin | `admin@cadu.com` | não | `server/config.ts` → `server/bootstrapAdmin.ts` |
| `ADMIN_BOOTSTRAP_PASSWORD` | Senha do admin inicial (só ao criar a conta) | `admin` (só desenvolvimento: trocar antes de expor) | **sim** | `server/config.ts` → `server/bootstrapAdmin.ts` |

No compose, o serviço `jogo` recebe `DATABASE_URL` e `REDIS_URL` montados internamente (`banco:5432`, `redis:6379`) e repassa as demais do `.env` com default vazio (as do admin inicial com os mesmos padrões do código).

## Docker Compose (`docker-compose.yml`)

| Variável | Finalidade | Default | Segredo? |
| --- | --- | --- | --- |
| `PG_SENHA` | Senha do PostgreSQL (usada em `POSTGRES_PASSWORD` e na `DATABASE_URL` do `jogo`) | valor de desenvolvimento — **trocar antes de expor** | **sim** |
| `PORTA` | Porta pública do nginx (`web`) | `8080` | não |
| `PG_PORTA` | Porta do Postgres publicada em `127.0.0.1` | `5442` | não |
| `REDIS_PORTA` | Porta do Redis publicada em `127.0.0.1` | `6392` | não |

`PORTA` também é lida por `tools/offensive.ts` (validação `^\d{1,5}$`, espera e regra de firewall).

## Testes (`server/tests/env.ts`, CI)

| Variável | Finalidade | Default |
| --- | --- | --- |
| `DATABASE_URL_TESTE` | Banco de teste (é **apagado e recriado** a cada `bun test`) | Postgres local `:5442`, banco `oc_teste` |
| `REDIS_URL_TESTE` | Redis de teste (é **esvaziado** a cada execução) | Redis local `:6392`, db `1` |

> [!warning] Cuidado
> Nunca aponte `DATABASE_URL_TESTE` para o banco real: o preload executa `DROP DATABASE ... WITH (FORCE)`.

## Configuração não-ambiente

| Arquivo | Configura |
| --- | --- |
| `vite.config.ts` | Porta 5173, `host: true`, proxy `/api` e `/ws` → `:8787` com `xfwd`, alias `@shared`, `target: es2022`, `chunkSizeWarningLimit: 6000` |
| `bunfig.toml` | `[run] bun = true`; testes: `root = "."`, `preload`, `timeout = 20000` |
| `tsconfig.json` / `server/tsconfig.json` | Dois programas de typecheck (navegador e Bun) |
| `deploy/nginx/*.conf` | Limites, cache, proxy (ver [[Hosting]]) |
| `deploy/offensive-combat.service` | `NODE_ENV=production HOST=127.0.0.1 PORT=8787`, usuário `www-data` |
| `Dockerfile` | `NODE_ENV=production HOST=0.0.0.0 PORT=8787` na imagem `server` |
| `shared/protocol.ts` (`NET`), `shared/constants.ts`, `shared/data/*.json` (armas em `weapons/*.json`, melhorias em `progression.json`) | Parâmetros de jogo — ver [[Constants Reference]] e [[Configurable Content]] |
| `shared/data/zumbi.json` | Todos os números do modo zumbi: tempos, ondas, tipos de zumbi, chefes, dinheiro, XP, o caixão (preço, raridades, armas, `danificada`: chances e penalidades), as barricadas (`barricadas`: tábuas, vida, preço, tempos, prêmio e teto, dano por tipo); os dados de zumbi de cada mapa (o muro `dentro`, os pontos de surgimento, o lugar do caixão, os chefes e as brechas) ficam no campo `zumbi` do JSON do mapa (`shared/data/mapas/cemiterio.json`) — ver [[Zombie]] |
| `shared/data/mapas/<id>.json` | Os mapas oficiais como dados (`MapData`, `shared/mapData.ts`): ambiente (céu, célula de lote, sombra, `killY`, sons), peças do catálogo (`shared/mapCatalog.ts`), arquivos, spawns, bonecos, objetos que o servidor acompanha e, no Cemitério, os dados de zumbi. Os `*.golden.json` ao lado são o retrato de cada mapa feito do código original antes da conversão (teste de fidelidade) — ver [[World Structure]] |
| `shared/data/navmesh/<mapa>.json` | Navmesh **gerada** (não editar) para os zumbis do servidor: `bun run navmesh` (`tools/bake-navmesh.ts`) a refaz a partir do código do mapa; um teste falha se estiver desatualizada — ver [[Navigation]] |
| `localStorage` do navegador | Preferências do jogador (inclusive as teclas de troca de arma `weapon1`/`weapon2`/`swapWeapon`) — ver [[Settings]]. A escolha do Arsenal **não** fica aqui: vai para a conta (`player_profile.loadout`, [[Player Data]]) |

O cliente não lê variáveis `VITE_*`; usa apenas `import.meta.env.DEV`.

Ver também: [[Configuration]], [[Environments]], [[Sensitive Data]], [[Feature Flags]].
