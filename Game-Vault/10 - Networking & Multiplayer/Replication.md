---
title: Replication
type: system
status: documented
area: networking
source_paths:
  - server/session.ts
  - server/app.ts
  - shared/protocol.ts
  - client/net/remote.ts
  - client/main.ts
  - shared/arsenal.ts
tags:
  - game
  - networking
  - replication
updated: 2026-10-06
---

# Replication

Como o estado de uma sala chega a todos os clientes. Não há replicação de objetos genérica: há **snapshots periódicos** do estado dos jogadores, **eventos** pontuais e um **estado inicial** completo ao entrar.

## Canal de difusão

Cada `Session` tem um tópico do pub/sub nativo do Bun: `sessao:<id>`. Ao entrar, a conexão faz `ws.subscribe(topic)`; ao sair, `unsubscribe`.

- `Session.broadcast(msg, except?)` serializa a mensagem **uma única vez** (`JSON.stringify`) e publica no tópico.
- Para excluir o autor, usa `ws.publish` do próprio socket do autor (o pub/sub do Bun entrega a todos os inscritos **menos** o próprio socket). Se o socket do autor não estiver aberto, usa `server.publish` (todos).
- Mensagens só para um jogador (`joined`, `pong`, `progresso`, `chatRefused`, `error`) usam `conn.send`.

> Decisão registrada no `README.md`: "Cada sessão é um tópico do pub/sub do Bun, então o snapshot de cada tick é serializado uma vez por sala, não uma vez por jogador." Ver [[Network Performance]].

## Snapshot (`snap`) — 20 Hz

Enviado em `Session.tick()` (intervalo de `1000 / NET.tickRate` = 50 ms) **se a sala tem jogadores**:

```text
{ t: 'snap', time: <ms servidor>, players: [{ id, s: NetState, h: ceil(vida), alive }] }
```

- Contém **todos** os jogadores da sala (sem *interest culling*, sem compressão delta, sem quantização além do arredondamento feito pelo cliente: yaw/pitch com 3 casas).
- `s` é o último `state` recebido do cliente (eco do que ele enviou), não uma simulação do servidor.
- O próprio jogador usa o snapshot para receber sua **vida** (`h`) e detectar respawn não aceito.

## Placar (`scores`) — 1 Hz

A cada 1 s acumulado no tick, `scores` com `PlayerInfo` de todos (kills, deaths, score, humiliations, alive, ping, nível, loadout: armas e melhorias em efeito). Sem aparência (só vai no `joined`/`playerJoined`). Ver [[Scoreboard]].

## Eventos

Eventos de gameplay vão no momento em que o servidor os processa: `damage`, `kill`, `spawned`, `shot`, `swing`, `grenade`, `boom`, `taunt`, `tauntEnd`, `playerLoadout`, `prop`, `pickup`, `fish`, `rat`, `potion`, `chat`, `playerJoined`, `playerLeft`. Catálogo completo em [[Remote Calls]].

Eventos que carregam **cópias de `PlayerInfo`** para manter o placar local coerente sem esperar o `scores`: `kill.players` (vítima e atacante), `tauntEnd.players` (dançarino).

## Estado inicial (`joined`)

Ao entrar, o jogador recebe tudo o que precisa para montar a sala:

| Campo | Conteúdo |
|---|---|
| `session` | `SessionInfo` (id, nome, mapa, `versao` e `mapaNome` do mapa, modo, jogadores, máx.) |
| `you` | id do jogador |
| `players` | `PlayerInfo` de todos, **com aparência** (`ap`) |
| `corpses` | corpos ainda não humilhados (posição, aparência, `until`) |
| `time` | tempo do servidor (semente do relógio, ver [[Synchronization]]) |
| `pickups` | só os itens que ainda estão voltando (`ready` no futuro) |
| `fish` | carpas mortas (com `ready`) e/ou douradas |
| `rats` | ratos ainda mortos |

O jogador **entra morto** (`alive: false`, posição `[0, -50, 0]`) e o cliente envia `respawn` em seguida com o ponto de nascimento escolhido localmente ([[Spawn Design]], [[Respawn]]).

## Lado do cliente

- `client/main.ts` registra handlers (`conn.on(...)`) para cada evento; `RemoteWorld` (`client/net/remote.ts`) mantém `players`, `corpses` e `info`.
- **Hold/release**: `home.ts` chama `conn.hold()` logo após o `joined`; as mensagens ficam enfileiradas enquanto o mapa é construído e são despachadas em ordem por `conn.release()` no fim do `main.ts`. Evita perder abates, entradas e corpos chegados durante o carregamento.
- `RemotePlayer.push()` guarda até **30 snapshots** por jogador remoto; ao mudar de morto → vivo, limpa o buffer para não interpolar através do mapa.
- A aparência só chega quando o jogador aparece; `upsertInfo` preserva `ap` nas atualizações seguintes.

## O que não é replicado

- Física de granadas (cada cliente simula a trajetória a partir de `p`, `v`, `fuse` do evento `grenade`).
- Ragdoll/corpo, animações e efeitos: derivados localmente das flags (`FLAG`) e eventos. A arma na mão de cada um sai de `FLAG.secondary` + o `Loadout` replicado (`RemotePlayer.gun`): o modelo, a pose da mão de apoio, o som do tiro e o tempo de recarga.
- Estado de gags dos mapas além do evento `prop` (cada cliente reproduz o efeito).
- Bots: não existem online ([[Versus Bots]]).

## Código relacionado

- `server/session.ts` — `broadcast()`, `tick()`, `join()`, `leave()`, `playerInfo()`.
- `server/app.ts` — `publish` (`server.publish`), `sessionsChanged()`.
- `client/net/remote.ts` — `RemotePlayer.push/update`, `RemoteWorld.snapshot/upsertInfo/addCorpse`.
- `client/net/connection.ts` — `hold()`, `release()`.
- Ver também [[Synchronization]], [[State Management]].
