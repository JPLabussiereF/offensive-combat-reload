---
title: Matchmaking
type: system
status: documented
area: networking
source_paths:
  - shared/modes.ts
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
updated: 2026-10-06
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

Ao iniciar, o servidor cria **uma sala fixa por mapa e por modo de jogo** (cada modo nos mapas em que é jogado, `modeMaps`: o zumbi só no Cemitério da Capela, sala `zumbi-cemiterio`; os outros modos só nos mapas abertos, `PVP_MAPS`, nunca no cemitério), que nunca é removida. O nome é o do mapa; o modo aparece ao lado na lista:

| id (`permanentSessionId`) | Nome (de `MAPS[...].nome`) | Mapa | Modo |
|---|---|---|---|
| `principal` | Rua dos Vizinhos | `rua` | mata-mata |
| `jardim` | Jardim do Dragão | `jardim` | mata-mata |
| `halloween` | Vila Assombrada | `halloween` | mata-mata |
| `corrida-armada-rua` | Rua dos Vizinhos | `rua` | corrida armada |
| `corrida-armada-jardim` | Jardim do Dragão | `jardim` | corrida armada |
| `corrida-armada-halloween` | Vila Assombrada | `halloween` | corrida armada |
| `zumbi-cemiterio` | Cemitério da Capela | `cemiterio` | zumbi |

Os ids do mata-mata são os de antes dos modos (`principal` foi mantido "de quando só havia a rua"); os outros modos usam `<modo>-<mapa>`. Ver [[Maps Index]] e [[Game Modes Index]].

## Sempre uma vaga por mapa e por modo

Todo par mapa/modo tem sempre **pelo menos uma sala com vaga** (`keepRoom()` em `server/app.ts`, chamado em cada rodada de `sessionsChanged()`):

- Quando todas as salas de um mapa num modo estão cheias (`players >= 10`), o servidor abre outra, não permanente e do mesmo modo, chamada `<Mapa> 2` (ou o próximo número livre: `<Mapa> 3`…).
- Uma sala vazia não permanente só é removida se o mesmo mapa e modo tiverem vaga em **outra** sala. Assim, a sala extra fica aberta enquanto for a única vaga do mapa e fecha quando a fixa volta a ter lugar.
- Como `sessionsChanged()` agrupa as mudanças em 100 ms, a sala extra aparece até 100 ms depois da sala que lotou.

## Salas criadas por jogadores

- id aleatório de 6 caracteres base36 (`Math.random`), único no processo.
- O `create` leva o mapa e o **modo** (`mode`; desconhecido → `mata-mata`).
- Removidas (com `dispose()` do timer) quando ficam **vazias**, na próxima rodada de `sessionsChanged()`, salvo se forem a única vaga do mapa (ver acima).

## Ordenação da lista

Permanentes primeiro; depois por número de jogadores (decrescente). Cada item é um `SessionInfo`: `{ id, name, map, mode, players, max, permanent }`. A mesma lista sai no `welcome`/`sessions` do WebSocket e em `GET /api/sessoes` (sem conexão de jogo, ver [[APIs]]).

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
