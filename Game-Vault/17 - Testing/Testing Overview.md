---
title: Testing Overview
type: system
status: documented
area: testing
source_paths:
  - bunfig.toml
  - package.json
  - server/tests/preload.ts
  - server/tests/env.ts
  - server/tests/helpers.ts
  - server/tests/auth.test.ts
  - server/tests/game.test.ts
  - server/tests/appearance.test.ts
  - client/tests/aimAssist.test.ts
  - client/tests/keybinds.test.ts
  - client/tests/spatial.test.ts
  - .github/workflows/ci.yml
  - server/tests/arsenal.test.ts
  - client/tests/arsenalText.test.ts
  - server/tests/modes.test.ts
  - server/tests/zombies.test.ts
  - server/tests/zombieBarricades.test.ts
  - server/tests/progression-modes.test.ts
  - client/tests/offlineModes.test.ts
  - client/tests/arsenalTree.test.ts
tags:
  - testes
updated: 2026-10-06
---

# Testing Overview

Os testes usam o executor nativo **`bun test`** (`bun:test`: `describe`, `it`, `expect`). Antes era Vitest; foi substituído na migração para Bun (ver [[ADR - Migração de Vitest e Node para Bun]]). Os nomes dos testes estão em português e descrevem o comportamento esperado.

## Inventário

| Arquivo | Tipo | Casos (`it`) | Assunto |
| --- | --- | --- | --- |
| `server/tests/auth.test.ts` | Integração (HTTP) | 17 | cadastro, login, limites, sessão, origem, recuperação de senha, perfil (Arsenal: melhoria e submetralhadora trancadas, comuns desligadas), exclusão |
| `server/tests/game.test.ts` | Integração (HTTP + WebSocket) / gameplay | 27 | ticket do WS, conexões por conta, progresso, mapas, pickups, Vila Assombrada, loadout (submetralhadora trancada no saguão), arma que atirou, chat |
| `server/tests/modes.test.ts` | Integração (WebSocket) + regras puras | 13 | mata-mata (equipamento travado, melhorias da conta valendo, cliente ganancioso), corrida armada (escada, rodadas, a conta ignorada) |
| `server/tests/zombies.test.ts` | Unitário + motor com relógio falso + integração | 26 | modo zumbi: regras, navmesh em dia, motor, servidor real (inclui progressão de armas, chefes com vários jogadores, entrar no meio da onda, sangrar, arma danificada na validação do servidor, barricadas no servidor e na entrada no meio da onda) |
| `server/tests/zombieBarricades.test.ts` | Unitário + motor com relógio falso | 11 | o mapa exclusivo do zumbi, as brechas na navmesh, barricadas (erguer, repregar com teto, desvio para a brecha aberta, tudo fechado, o Segurança arromba), armas danificadas (chances, defeitos, penalidades, caixão) |
| `server/tests/progression-modes.test.ts` | `Session` real sobre sockets falsos (sem rede) | 9 (dois `it` repetidos por modo) | matriz progressão × modos (`GAME_MODE_IDS` × armas × níveis e melhorias) |
| `server/tests/arsenal.test.ts` | Unitário | 24 | níveis, melhorias (comuns desligadas), trava das armas, escolha do Arsenal, atributos, migração 003 |
| `server/tests/appearance.test.ts` | Unitário + integração | 12 | regras de aparência (puras), perfil, aparência online |
| `client/tests/aimAssist.test.ts` | Unitário | 4 | assistência de mira |
| `client/tests/keybinds.test.ts` | Unitário | 28 | teclas configuráveis |
| `client/tests/arsenalText.test.ts` | Unitário | 4 (dois `it` repetidos por idioma) | textos de armas, melhorias, linhas da árvore do Arsenal e modos nos dois idiomas |
| `client/tests/arsenalTree.test.ts` | Unitário | 6 | modelo da árvore do Arsenal (linhas, armas trancadas, pontos que faltam, estado das melhorias) |
| `client/tests/offlineModes.test.ts` | Unitário | 8 | treino e bots com o Arsenal da conta (`Progress`: trava da submetralhadora, comuns desligadas, fila de salvamento e falha desfeita), armas dos bots e da escada, zumbi sozinho (`LocalZombies`) |
| `client/tests/spatial.test.ts` | Unitário | 6 | som espacial |

(Contagem dos casos em 2026-10-06; `bun test` roda 195 casos em 14 arquivos em ~97 s, dos quais ~25 s são esperas reais dos testes do modo zumbi e da corrida armada. Os testes de motor com relógio falso, como os de barricada, simulam minutos de jogo em poucos décimos de segundo.)

## Configuração (`bunfig.toml`)

- `root = "."` — o projeto inteiro é a raiz, então `client/tests` também roda (no Bun, sem navegador).
- `preload = ["./server/tests/preload.ts"]` — antes de qualquer arquivo: `DROP DATABASE ... WITH (FORCE)` + `CREATE DATABASE` do banco de teste e `FLUSHDB` no Redis de teste.
- `timeout = 20000` ms por teste.
- Arquivos rodam **um depois do outro num único processo**, cada um com **seu próprio servidor de jogo numa porta livre** (`startTestServer`, porta 0, jobs desligados).

| Variável | Default | Uso |
| --- | --- | --- |
| `DATABASE_URL_TESTE` | Postgres local na porta 5442, banco `oc_teste` | `server/tests/env.ts` |
| `REDIS_URL_TESTE` | Redis local na porta 6392, db `1` | `server/tests/env.ts` |

Pré-requisito local: `docker compose up -d banco redis`. No CI, os serviços do GitHub Actions substituem (ver [[CI CD]]).

## Camadas

- [[Unit Tests]] — lógica pura (cliente e `shared/`).
- [[Integration Tests]] — servidor real + Postgres + Redis, via HTTP e WebSocket.
- [[Gameplay Tests]] — regras de partida validadas pelo servidor.
- [[Performance Tests]] — não há testes automatizados; só ferramentas manuais.

Cenários detalhados em `Test Scenarios/`:

- [[Scenario - Ticket do WebSocket]]
- [[Scenario - Login, bloqueio e recuperação de senha]]
- [[Scenario - Abate validado e progresso gravado]]
- [[Scenario - Exclusão de conta e anonimização]]

## O que não é testado

- Renderização, física/movimento do cliente, UI/DOM, mapas (montagem; a da Vila Assombrada só pela navmesh), áudio além da lógica espacial.
- Bots e treino só pelas peças puras (`Progress`, escada, atributos das armas): `BotManager`/`Bot` e a escolha do equipamento inicial em `client/main.ts` precisam do navegador. A lentidão e o empurrão dos chefes são aplicados pelo cliente (`client/zombies/client.ts`): o teste confere só o que o servidor manda (`zhitfx`).
- Fluxo do Discord (não há mock do provedor).
- Envio real de SMTP (testes usam o `outbox` em memória).
- Build (`vite build`/`bun build`) e Docker.
- Não há testes ponta a ponta em navegador nem relatório de cobertura.

## Código relacionado

- `bunfig.toml`, `package.json` (`test`), `server/tsconfig.json` (typecheck de `client/tests`)
- `server/tests/preload.ts`, `server/tests/env.ts`, `server/tests/helpers.ts`

Decisão: [[ADR - Testes de integração contra servidor real e banco descartável]].
