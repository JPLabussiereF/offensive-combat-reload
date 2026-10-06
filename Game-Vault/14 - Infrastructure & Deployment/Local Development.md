---
title: Local Development
type: infrastructure
status: documented
area: infrastructure
source_paths:
  - tools/bake-navmesh.ts
  - README.md
  - package.json
  - vite.config.ts
  - tools/dev-online.ts
  - tools/offensive.ts
  - tools/gerar-props-exemplo.mjs
  - tools/lab-personagens.html
  - bunfig.toml
  - tsconfig.json
  - server/tsconfig.json
  - docker-compose.yml
tags:
  - infra
  - dev
  - bun
updated: 2026-10-06
---

# Local Development

## Pré-requisitos

- **Bun 1.4+** (`packageManager: bun@1.4.2`). O Node **não** é usado em nenhuma etapa: `bunfig.toml` (`[run] bun = true`) faz até os binários de pacote (Vite, tsc) rodarem no Bun. Ver [[ADR - Migração de Vitest e Node para Bun]].
- **Docker** (Docker Desktop no Windows) para PostgreSQL e Redis.

## Primeira vez

```bash
bun install
docker compose up -d banco redis   # PostgreSQL :5442 e Redis :6392 em 127.0.0.1
```

## Comandos do dia a dia (`package.json`)

| Script | O que faz |
| --- | --- |
| `bun run dev` | Só o cliente (Vite `:5173`). Treino offline e bots funcionam sem servidor. |
| `bun run dev:online` | `tools/dev-online.ts`: servidor com `--watch` + Vite juntos; amigos na mesma rede abrem `http://<seu-ip>:5173`. |
| `bun run server` | Só o servidor, com `--watch`. |
| `bun run start:dev` | Servidor sem watch (direto do TypeScript). |
| `bun test` | Testes (servidor + lógica pura do cliente). Precisa do banco e Redis acima. Ver [[Testing Overview]]. |
| `bun run typecheck` | `tsc --noEmit` (cliente + shared) e `tsc --noEmit -p server` (servidor, shared, tools e `client/tests`). TypeScript 7 (compilador nativo). |
| `bun run build` / `bun start` | Build de produção e servidor em porta única `:8787`. Ver [[Build Pipeline]]. |
| `bun run preview` | `vite preview` do `dist/`. |
| `bun run admin ...` | Console de moderação ([[Moderation]]). |
| `bun run navmesh` | `tools/bake-navmesh.ts`: refaz a navmesh dos mapas do modo zumbi (`shared/data/navmesh/*.json`) a partir dos dados dos mapas (`shared/data/mapas/*.json`, montados pelo mesmo carregador do cliente), headless em Bun. Rode depois de mudar o mapa do cemitério (`shared/data/mapas/cemiterio.json`, inclusive as brechas no campo `zumbi`); senão `bun test` falha. Ver [[Navigation]]. |
| `bun tools/snapshot-mapas.ts` | Retrato (golden) de cada mapa oficial em `shared/data/mapas/<id>.golden.json`: colisores, piadas, vãos, salas, spawns, lotes e objetos da cena. Gravado do código original antes da conversão (PF-6); só regrave quando um mapa mudar de propósito. Ver [[World Structure]]. |
| `bun tools/converter-mapas.ts` | Reproduz a conversão dos mapas em código para JSON (`client/world/conversao/`) e confere contra o golden. O JSON é a fonte da verdade: só serve para reproduzir a conversão. |
| `bun run exemplos:glb` | Gera `public/models/casinha_cachorro.glb` e `public/maps/arena_teste.glb` (`tools/gerar-props-exemplo.mjs`, usa `@gltf-transform/core`). Ver [[Asset Pipeline]]. |
| `bun run offensive [subir\|parar\|logs\|status\|firewall]` | Pilha Docker completa (ver [[Hosting]]). Com `bun link`, vira o comando global `offensive`. |

## Proxy do Vite

`vite.config.ts` repassa `/api` → `http://localhost:8787` e `/ws` → `ws://localhost:8787`, com `xfwd: true` (manda o IP do jogador). Assim página, API e WebSocket ficam na **mesma origem**, o que o cookie de sessão e a checagem de `Origin` exigem. Alias `@shared` → `./shared`.

## Ferramentas de desenvolvimento no cliente

| Ferramenta | Como abrir | Para quê |
| --- | --- | --- |
| Overlay de depuração | `F3` (tecla fixa) | FPS, draw calls, triângulos, GPU, ms de simulação e de render, qualidade, ping. Ver [[Performance Overview]]. |
| Hitboxes / navmesh | `F4` | Visualização das hitboxes e da malha de navegação. |
| Painel de ajuste | `F6` | `TuningPanel` com `VM_FEEL` e `ANIM`. |
| Handle `window.__oc` | só em `import.meta.env.DEV` | Acesso a player, arma, física, `perf()`, `stats()`, `trace()` para testes de fumaça e console. |
| Mapa glTF | `?mapa=/maps/arena_teste.glb` | Carrega um mapa exportado do Blender por cima do escolhido. Ver [[Map - Arena Teste (glTF)]]. |
| Forçar plataforma | `?mobile=1` / `?mobile=0` | Força modo toque ou PC. |
| Laboratório de personagens | `tools/lab-personagens.html` no Vite (`client/dev/characterLab.ts`) | Grades de itens e auditoria `?audit=1[&category=]`. Ver [[Performance Tests]]. |

## Dicas

- `docker compose up -d banco redis` precisa estar rodando antes de `bun test` e `dev:online`; senão o servidor imprime `[servidor] não subiu` (ver [[Troubleshooting]]).
- Para testar online com amigos via LAN/Radmin no dev, o Vite já escuta em todas as interfaces (`host: true`).

## Código relacionado

- `package.json`, `bunfig.toml`, `tsconfig.json`, `server/tsconfig.json`, `vite.config.ts`
- `tools/dev-online.ts`, `tools/offensive.ts`, `tools/gerar-props-exemplo.mjs`, `tools/lab-personagens.html`
- `client/main.ts` (overlay F3 e `__oc`), `client/core/keybinds.ts` (`FIXED_KEYS`)
