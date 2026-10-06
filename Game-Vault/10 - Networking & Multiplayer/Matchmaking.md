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
  - server/maps.ts
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

Desde a PF-6 (fase 2) **as salas abrem sob demanda**: não há sala fixa. Uma sala existe enquanto alguém joga nela e fecha quando esvazia. Ver [[ADR - Sessões sob demanda por versão do mapa]].

1. Após o `hello`, o cliente recebe `welcome.sessions` (as salas abertas agora; pode ser vazia).
2. Enquanto está no lobby (sem sala), recebe `sessions {list}` sempre que algo muda (entrada/saída/criação/remoção), **agrupado em 100 ms** (`sessionsChanged()`).
3. O jogador escolhe:
   - **Jogar um mapa**: `play {map, mode}`. O servidor confere o mapa no banco (existe, não está oculto nem apagado, o modo é jogado nele: `modeAllowsMap`) e põe o jogador numa sala **da versão atual** do mapa naquele modo com vaga; se não houver, abre uma. É o que a entrada rápida da tela inicial manda.
   - **Entrar** numa sala listada: `join {session}`; recusado se a sala não existe mais ou está cheia (`players >= 10`).
   - **Criar** uma sala com nome: `create {name, map, mode}`; o nome passa por `sanitizeName` (máx. 24 caracteres) e, vazio, vira `Sala de <nome>`; um mapa indisponível ou onde o modo não é jogado cai no primeiro mapa oficial do modo (`defaultMapFor`: `rua`, ou `cemiterio` no zumbi). O criador entra na hora.
4. Entrar/criar/jogar sempre **sai da sala anterior** (e grava o progresso dela). Enquanto um pedido de entrada espera o banco, outro da mesma conexão é ignorado (`Peer.entering`).

## Salas abertas por `play`

- O nome é o do mapa (`mapaNome`); se já houver sala desse mapa e modo com esse nome, `<Mapa> 2`, `<Mapa> 3`…
- Um mapa de promessas por `mapa@versão|modo` (`opening` em `server/app.ts`) evita duas salas iguais quando dois jogadores pedem ao mesmo tempo.
- A sala guarda a **versão** do mapa com que abriu até o fim. Salvar uma versão nova no editor não muda as partidas em andamento: os próximos `play` abrem salas da versão nova (uma sala antiga com vaga ainda aceita `join` pelo id).
- Mapas da comunidade são jogados online como os oficiais.
- **Jogadas**: cada sala conta uma jogada do mapa por conta (`map.play_count`), na primeira vez que a conta entra nela. Partidas offline contam por `POST /api/mapas/:id/jogadas` ([[APIs]]).

## Salas criadas com nome

- id aleatório de 6 caracteres base36 (`Math.random`), único no processo (também nas salas abertas por `play`).
- O `create` leva o mapa e o **modo** (`mode`; desconhecido → `mata-mata`).
- Como toda sala, fecha quando fica **vazia**, na próxima rodada de `sessionsChanged()`.

## Ordenação da lista

Por número de jogadores (decrescente), depois pelo nome. Cada item é um `SessionInfo`: `{ id, name, map, versao, mapaNome, mode, players, max }` (o campo `permanent` saiu). A mesma lista sai no `welcome`/`sessions` do WebSocket e em `GET /api/sessoes` (sem conexão de jogo, ver [[APIs]]).

## Regras da sala

Toda sala é um **mata-mata livre infinito** (sem fim de partida, sem limite de abates/tempo) — ver [[Free For All]]. O mapa da sessão define o mapa carregado; o seletor de mapa da home vale apenas para bots e treino.

## UI

A lista, o botão de entrar (desabilitado quando cheia) e o campo de criar sala ficam em `client/ui/home.ts`. Ver [[Matchmaking UI]] e [[Flow - Join Online Match]].

## Limitações

- Um único processo: as salas existem só na memória dele; não há descoberta entre servidores. Ver [[Problem - Estado das partidas só em memória de um processo]].
- Sem senha/convite para salas privadas; qualquer conta logada pode entrar em qualquer sala listada.
- Sem limite explícito de salas por jogador (criar uma sala nova sai da anterior, que é removida se ficar vazia).
- A lista da tela inicial ainda mostra só os mapas oficiais como filtro; a lista de mapas vinda de `/api/mapas` somada às salas abertas é da fase 4 da PF-6.

## Código relacionado

- `server/app.ts` — `sessions`, `sessionList()`, `sessionsChanged()`, `createSession()`, `sessionFor()`, `enter()`, casos `play`/`create`/`join`/`leave`/`list`.
- `server/maps.ts` — `mapRow`, `playable`, `allows`, `defaultMapFor`, `MapStore` (as versões que as salas jogam).
- `server/session.ts` — `Session.info`, `Session.full`.
- `client/ui/home.ts` — `renderList`, `join`, `create`.
- Ver também [[Sessions]], [[Match Services]].
