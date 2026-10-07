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
  - client/tests/mapConversion.test.ts
  - client/tests/mapData.test.ts
  - client/tests/budget.test.ts
  - client/tests/seeded.test.ts
  - client/tests/arsenalTree.test.ts
  - client/tests/arsenalCanvasLayout.test.ts
  - client/tests/damageNumbers.test.ts
  - server/tests/album.test.ts
  - server/tests/albumSession.test.ts
tags:
  - testes
updated: 2026-10-07
---

# Testing Overview

Os testes usam o executor nativo **`bun test`** (`bun:test`: `describe`, `it`, `expect`). Antes era Vitest; foi substituído na migração para Bun (ver [[ADR - Migração de Vitest e Node para Bun]]). Os nomes dos testes estão em português e descrevem o comportamento esperado.

## Inventário

| Arquivo | Tipo | Casos (`it`) | Assunto |
| --- | --- | --- | --- |
| `server/tests/auth.test.ts` | Integração (HTTP) | 19 | cadastro, login, limites, sessão, origem, recuperação de senha, perfil (Arsenal: melhoria, submetralhadora, rifle e faca trancados, comuns desligadas, o sabre-forma antigo virando a faca sabre), exclusão |
| `server/tests/game.test.ts` | Integração (HTTP + WebSocket) / gameplay | 27 | ticket do WS, conexões por conta, progresso, mapas, pickups, Vila Assombrada, loadout (submetralhadora trancada no saguão), arma que atirou, chat |
| `server/tests/modes.test.ts` | Integração (WebSocket) + regras puras | 16 | mata-mata (equipamento travado, melhorias da conta valendo, cliente ganancioso, rifles e facas antigos), corrida armada (escada de 9 degraus com a garrucha e o grampeador, rodadas, a conta ignorada) |
| `server/tests/zombies.test.ts` | Unitário + motor com relógio falso + integração | 30 | modo zumbi: regras, navmesh em dia, motor, servidor real (inclui as secundárias novas no caixão, progressão de armas, chefes com vários jogadores, entrar no meio da onda, sangrar, arma danificada na validação do servidor, barricadas no servidor e na entrada no meio da onda) |
| `server/tests/zombieBarricades.test.ts` | Unitário + motor com relógio falso | 11 | o mapa exclusivo do zumbi, as brechas na navmesh, barricadas (erguer, repregar com teto, desvio para a brecha aberta, tudo fechado, o Segurança arromba), armas danificadas (chances, defeitos, penalidades, caixão) |
| `server/tests/progression-modes.test.ts` | `Session` real sobre sockets falsos (sem rede) | 9 (dois `it` repetidos por modo) | matriz progressão × modos (`GAME_MODE_IDS` × armas × níveis e melhorias) |
| `server/tests/arsenal.test.ts` | Unitário | 33 | níveis, melhorias (comuns desligadas), travas das armas (em pontos, inclusive as 7 secundárias), escolha do Arsenal (rifle, secundária, faca), atributos, rifles e facas antigos, miras dos níveis 7 a 9, migração 003 |
| `server/tests/secondaries.test.ts` | Unitário + integração (WebSocket) | 7 | secundárias da PF-10: ficha do plano, TTK contra o rifle com qualquer combinação de melhorias, tiro único na cabeça só de perto, limite de acertos da garrucha (8 bagos) no servidor |
| `server/tests/appearance.test.ts` | Unitário + integração | 12 | regras de aparência (puras), perfil, aparência online |
| `client/tests/aimAssist.test.ts` | Unitário | 4 | assistência de mira |
| `client/tests/keybinds.test.ts` | Unitário | 28 | teclas configuráveis |
| `client/tests/arsenalText.test.ts` | Unitário | 6 (três `it` repetidos por idioma) | textos de armas (todas as da árvore, inclusive rifles e facas antigos), melhorias, linhas da árvore e quadros do canvas do Arsenal e modos nos dois idiomas |
| `client/tests/arsenalCanvasLayout.test.ts` | Unitário | 6 | canvas do Arsenal da tela inicial: quadros e nós (7, 7, 7 e 1 armas), cadeia de melhorias sob a arma mostrada, estado das linhas, câmera (zoom 25–200% em volta do ponteiro, ver tudo, primeira vista, seguir o foco) |
| `server/tests/album.test.ts` | Unitário | 14 | álbum de figurinhas: dados coerentes, do número ao acabamento, destaque e títulos, do perfil para o álbum |
| `server/tests/albumSession.test.ts` | `Session` com relógio falso + servidor real | 14 | contadores próprios do álbum numa sessão (sequências, combos, vexames, corrida armada, poção crítico, objetos de mapa) e no servidor (mensagem `figurinha`, gravação e leitura) |
| `client/tests/arsenalTree.test.ts` | Unitário | 8 | modelo da árvore do Arsenal (linhas com 7, 7, 7 e 1 armas, as secundárias pelos pontos de pistola, armas trancadas, pontos que faltam, estado das melhorias) |
| `client/tests/offlineModes.test.ts` | Unitário | 10 | treino e bots com o Arsenal da conta (`Progress`: travas, rifle e faca antigos, comuns desligadas, fila de salvamento e falha desfeita), sorteio da arma dos bots (60% rifle, 40% secundárias por igual), armas dos bots e da escada, zumbi sozinho (`LocalZombies`) |
| `client/tests/damageNumbers.test.ts` | Unitário (DOM falso) | 12 | números de dano: cor por região e com a poção do crítico, um número por alvo por disparo com teto na vida, animação, camada (projeção, duração, atrás da câmera, limite de 24) |
| `client/tests/spatial.test.ts` | Unitário | 6 | som espacial |
| `client/tests/mapConversion.test.ts` | Unitário (monta os mapas sem tela) | 5 | os 4 mapas oficiais a partir do JSON iguais ao golden (1e-6) e o modo editor ([[ADR - Mapas como dados com catálogo de peças]]) |
| `client/tests/mapData.test.ts` | Unitário | 18 | formato dos mapas (`validateMapData`), esquema e adaptadores das peças, coerência com as tabelas do servidor |
| `client/tests/budget.test.ts` | Unitário (monta os mapas sem tela) | 5 | orçamento de desenho (400 chamadas, 750 mil triângulos) e os números dos oficiais |
| `client/tests/seeded.test.ts` | Unitário | 4 | `seeded()` e o estado exposto (`Peca.semente`) |
| `server/tests/maps.test.ts` | Integração (HTTP) | 13 | API de mapas: criar, versões, 409, restaurar, ocultar, apagar, duplicar, busca, orçamento, GLB, os 4 originais protegidos (P44, P45) |
| `server/tests/management.test.ts` | Integração (HTTP + WebSocket) | 8 | Gerenciamento: matriz de papéis, banimento derruba, silêncio e progresso na partida |
| `server/tests/sessions.test.ts` | Integração (WebSocket) | 6 | sessões sob demanda, versões por sala, mapa da comunidade online |
| `client/tests/roles.test.ts` | Unitário | 6 | regras dos papéis (`shared/roles.ts`) |
| `client/tests/mapPose.test.ts` | Unitário (monta peças sem tela) | 10 | pose das peças (P32) e lanternas e recortes de lago levados pela pose (P42) |
| `client/tests/editorHistory.test.ts` | Unitário | 20 | editor sem tela: desfazer e refazer, gizmo, peças novas, marcadores, pontas e vãos |
| `client/tests/editorRecovery.test.ts` | Unitário | 5 | rascunho automático (P40), salvar sobre a versão atual após o 409 (P39), o que Testar abre (P41) |
| `client/tests/mapsScreen.test.ts` | Unitário | 15 | abas Mapas (botões por papel e dono, originais sem Excluir e Ocultar, contra bots e campo de tiro, modos, busca e ordem, ocultos, mapas da tela inicial) e Gerenciamento (painel pelas permissões, sanção, progresso) |
| `client/tests/weapon.test.ts` | Unitário | 11 | arma do cliente: rajada do grampeador (3 por clique, pausa, sem repetir segurando), bagos da garrucha no cone, modelo, mão e voz próprios de cada secundária, coice na tela |

(Contagem dos casos em 2026-10-07, antes do merge. Na sandbox-gregory, depois da fase 4 da PF-6, `bun test` rodava 300 testes em 25 arquivos em ~107 s (na fase 1 eram 218 em 17); na main, depois da PF-11, 271 casos em 19 arquivos em ~111 s. As duas partiram de 178 casos em 13 arquivos em ~95 s; somando o que cada uma acrescentou, o merge deve ficar perto de 393 casos em ~31 arquivos. Em todos os casos ~25 s são esperas reais dos testes do modo zumbi e da corrida armada. Os testes de motor com relógio falso, como os de barricada, simulam minutos de jogo em poucos décimos de segundo.)

> [!info] Depois do merge da main na sandbox-gregory (07/10/2026), com a PF-2 a PF-11, o admin inicial e o deslize de joelhos: `bun test` roda **622 testes em 57 arquivos**, todos passando, e `bun run typecheck` sem erros. As contagens por arquivo acima são as de cada branch antes do merge.

## Configuração (`bunfig.toml`)

- `root = "."` — o projeto inteiro é a raiz, então `client/tests` também roda (no Bun, sem navegador).
- `preload = ["./server/tests/preload.ts"]` — antes de qualquer arquivo: `DROP DATABASE ... WITH (FORCE)` + `CREATE DATABASE` do banco de teste e `FLUSHDB` no Redis de teste.
- **20 s por teste**, definidos em `server/tests/preload.ts` com `setDefaultTimeout(20_000)`. O `timeout = 20000` do `bunfig.toml` é **ignorado pelo Bun 1.4.2** (conferido: um teste de 6 s falhava aos 5 s), e até 2026-10-06 valia o padrão de 5 s. Por isso testes online mais longos (por exemplo "as melhorias liberadas valem nas armas travadas", 3–5 s) falhavam de vez em quando numa máquina ocupada, inclusive no CI.
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
