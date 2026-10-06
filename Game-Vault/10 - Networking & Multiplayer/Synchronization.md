---
title: Synchronization
type: system
status: documented
area: networking
source_paths:
  - client/net/connection.ts
  - client/net/remote.ts
  - client/main.ts
  - server/session.ts
  - server/app.ts
  - shared/protocol.ts
tags:
  - game
  - networking
  - interpolation
  - clock
updated: 2026-10-05
---

# Synchronization

Como cliente e servidor concordam sobre **tempo**, **posição dos outros jogadores** e **ordem dos eventos**.

## Relógio do servidor

O servidor usa `performance.now()` do seu processo como relógio (`now()` em `server/app.ts`, injetado em cada `Session`). Todos os tempos do protocolo (`snap.time`, `until`, `ready`, `pong.s`) estão nessa base.

O cliente estima `offset = tempoServidor − performance.now()` em `Connection`:

| Passo | Detalhe |
|---|---|
| Semente | `conn.seed(joined.time)` ao entrar na sala (ignora latência; só vale até o primeiro `pong`) |
| Ping | `ping {c: performance.now(), rtt}` na abertura e depois a cada **1 s** |
| RTT | `rtt = agora − c`; suavizado: `rtt = 0,8·rtt + 0,2·amostra` |
| Offset | amostra = `s + rtt/2 − agora`; primeira amostra direta, depois `offset = 0,9·offset + 0,1·amostra` |
| Uso | `conn.serverNow()` = `performance.now() + offset` |

O `rtt` suavizado é reenviado no próximo `ping` e aparece como `ping` no placar (limitado a 0–9999 ms no servidor).

Usos de `serverNow()` no cliente: tempo de renderização dos remotos, janelas de humilhação dos corpos (`until`), retorno de itens (`ready`), duração de bônus (cereja, carpa dourada, poção). O relógio de gameplay local online é `conn.serverNow() / 1000` (`clock()` em `client/main.ts`).

## Interpolação dos jogadores remotos

- Os remotos são desenhados **100 ms no passado** (`NET.interpDelayMs`): `renderTime = serverNow() − 100`.
- `RemotePlayer.update(t)` encontra os dois snapshots em volta de `t` e interpola posição e pitch linearmente e yaw pelo menor ângulo (`lerpAngle`). Flags vêm do snapshot mais novo do par.
- Sem dados mais novos → **segura o último estado** (não há extrapolação).
- Buffer de até 30 snapshots; limpo no respawn.
- Velocidade e direção para a locomoção de 8 direções são derivadas da diferença de posição, suavizadas (0,8/0,2).
- As **hitboxes** do remoto seguem a pose interpolada (`CharacterRig.follow`), então o atirador acerta onde vê. Ver [[Animation]].

Com tick e envio a 20 Hz (50 ms entre snapshots), 100 ms de atraso cobrem dois intervalos, tolerando a perda/atraso de um snapshot.

## Jogador local

- **Sem predição/reconciliação**: o jogador local é simulado só no cliente (física Rapier a 60 Hz, `SIM.dt`) e envia `state` a 20 Hz. O servidor nunca corrige a posição ([[ADR - Movimento confiado ao cliente]]).
- **Vida**: a cada `snap`, se vivo localmente, `player.health = h` do servidor. Dano recebido chega também por `damage` (flash e som).
- **Respawn**: o cliente escolhe o ponto e envia `respawn`. Se após 1,5 s o `snap` ainda o mostra morto (servidor recusou por tempo), reenvia. Online, o atraso local de respawn é `NET.respawnDelay + 0,3 s` para não chegar cedo demais ao servidor (que aceita a partir de 5 s − 250 ms).

## Compensação de latência nos acertos

Não há rewind de hitboxes no servidor. O cliente acerta o alvo em sua posição interpolada (≈ 100 ms + RTT/2 atrás); o servidor compara a distância informada com a distância entre as **posições mais recentes** que tem (olho do atirador → peito do alvo, alturas fixas 1,6 m e 1,1 m) e aceita até `LAG_SLACK = 4 m` + 10 % da distância. Ver [[ADR - Acertos informados pelo cliente com tolerância de lag]].

Itens, peixes, poção e rato usam folga semelhante (`PICKUP_SLACK = 1,5 m` horizontal, 2 m vertical).

## Ordem e consistência

- WebSocket (TCP) garante ordem por conexão. O servidor processa mensagens na ordem de chegada; não há números de sequência nem *acks*.
- `hold()/release()` enfileira mensagens entre `joined` e o fim da montagem do mapa ([[Replication]]).
- Chat: o autor recebe sua própria fala do servidor, já sanitizada, garantindo que todos vejam o mesmo texto.
- O lobby agrupa mudanças de sessões em janelas de 100 ms antes de enviar `sessions`.

## Limitações

- Sem extrapolação: perda prolongada de pacotes congela o remoto na última posição.
- Offset do relógio não trata saltos grandes (só média exponencial).
- Tempo do servidor é `performance.now()` do processo: reiniciar o servidor zera a base (todas as conexões caem junto, então não há conflito).

## Código relacionado

- `client/net/connection.ts` — `onPong`, `seed`, `serverNow`, `hold`, `release`.
- `client/net/remote.ts` — `RemotePlayer.push/update`, `RemoteWorld.renderTime`.
- `client/main.ts` — `clock()`, envio de `state` (`stateTimer`), handler de `snap`.
- `server/session.ts` — `LAG_SLACK`, `PICKUP_SLACK`, `EYE`, `CHEST`, `tick()`.
- Ver também [[Network Performance]], [[Movement]].
