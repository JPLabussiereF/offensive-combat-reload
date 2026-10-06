---
title: Matchmaking
type: system
status: documented
area: networking
source_paths:
  - server/app.ts
  - server/session.ts
  - shared/protocol.ts
  - shared/maps.ts
  - client/ui/home.ts
  - server/migrations/001_contas.sql
tags:
  - game
  - networking
  - lobby
updated: 2026-10-05
---

# Matchmaking

> [!info]
> **Não existe matchmaking automático no código atual** (sem fila, sem MMR, sem balanceamento). Verificado em `server/app.ts` (lobby), `server/session.ts` e por busca por `queue`/`fila`/`matchmak` em `server/`, `client/` e `shared/`. A coluna `player_stats.mmr` existe no banco com comentário *"unused until ranked play exists"*.

O que existe é um **lobby com lista de salas** (browser de servidores), no próprio processo do jogo.

## Como funciona

1. Após o `hello`, o cliente recebe `welcome.sessions` (lista inicial).
2. Enquanto está no lobby (sem sala), recebe `sessions {list}` sempre que algo muda (entrada/saída/criação/remoção), **agrupado em 100 ms** (`sessionsChanged()`).
3. O jogador escolhe:
   - **Entrar** numa sala: `join {session}`; recusado se a sala não existe mais ou está cheia (`players >= 10`).
   - **Criar** uma sala: `create {name, map}`; o nome passa por `sanitizeName` (máx. 24 caracteres) e, vazio, vira `Sala de <nome>`; mapa inválido vira `DEFAULT_MAP`. O criador entra na hora.
4. Entrar/criar sempre **sai da sala anterior** (e grava o progresso dela).

## Salas permanentes

Ao iniciar, o servidor cria **uma sala fixa por mapa**, que nunca é removida:

| id | Nome (de `MAPS[...].nome`) | Mapa |
|---|---|---|
| `principal` | Rua dos Vizinhos | `rua` |
| `jardim` | Jardim do Dragão | `jardim` |
| `halloween` | Vila Assombrada | `halloween` |

O id `principal` foi mantido "de quando só havia a rua" (comentário em `server/app.ts`). Ver [[Maps Index]].

## Salas criadas por jogadores

- id aleatório de 6 caracteres base36 (`Math.random`), único no processo.
- Removidas (com `dispose()` do timer) quando ficam **vazias**, na próxima rodada de `sessionsChanged()`.

## Ordenação da lista

Permanentes primeiro; depois por número de jogadores (decrescente). Cada item é um `SessionInfo`: `{ id, name, map, players, max, permanent }`.

## Regras da sala

Toda sala é um **mata-mata livre infinito** (sem fim de partida, sem limite de abates/tempo) — ver [[Free For All]]. O mapa da sessão define o mapa carregado; o seletor de mapa da home vale apenas para bots e treino.

## UI

A lista, o botão de entrar (desabilitado quando cheia) e o campo de criar sala ficam em `client/ui/home.ts`. Ver [[Matchmaking UI]] e [[Flow - Join Online Match]].

## Limitações

- Um único processo: as salas existem só na memória dele; não há descoberta entre servidores. Ver [[Problem - Estado das partidas só em memória de um processo]].
- Sem senha/convite para salas privadas; qualquer conta logada pode entrar em qualquer sala listada.
- Sem limite explícito de salas por jogador (criar uma sala nova sai da anterior, que é removida se ficar vazia).

## Código relacionado

- `server/app.ts` — `sessions`, `sessionList()`, `sessionsChanged()`, `createSession()`, casos `create`/`join`/`leave`/`list`.
- `server/session.ts` — `Session.info`, `Session.full`.
- `client/ui/home.ts` — `renderList`, `join`, `create`.
- Ver também [[Sessions]], [[Match Services]].
