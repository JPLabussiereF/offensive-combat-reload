---
title: Network Performance
type: system
status: documented
area: performance
source_paths:
  - shared/zombieMatch.ts
  - shared/protocol.ts
  - server/session.ts
  - server/app.ts
  - client/net/connection.ts
  - client/main.ts
  - deploy/nginx/docker.conf
  - README.md
tags:
  - performance
  - rede
updated: 2026-10-06
---

# Network Performance

Custos e escolhas de rede. O modelo de replicação está em [[Replication]] e [[Synchronization]]; aqui ficam taxas, tamanhos e otimizações.

## Taxas (código confirmado, `NET` em `shared/protocol.ts`)

| Fluxo | Taxa | Conteúdo |
| --- | --- | --- |
| Servidor → clientes: `snap` | **20 Hz** (`tickRate`) | id, estado, vida (arredondada para cima) e vivo/morto de cada jogador |
| Servidor → clientes: `scores` | 1 Hz | placar completo |
| Cliente → servidor: estado | **20 Hz** (`stateRate`) | posição/estado do jogador local |
| Cliente → servidor: `ping` | 1 Hz | relógio do cliente + RTT atual |
| Interpolação | atraso de **100 ms** (`interpDelayMs`) | jogadores remotos desenhados no passado entre dois snapshots |

Com no máximo **10 jogadores** por sala, cada snapshot carrega até 10 entradas.

**Modo zumbi:** numa onda, depois de cada `snap` vai um `zsnap` (também 20 Hz) com cada zumbi como 7 números arredondados (`[id, tipo, x, y, z, yaw, flags]`, 2 casas): ~45 bytes por zumbi em JSON, ~1–1,5 KB por mensagem com a horda cheia (até 24 andando + chefe e chamados), ~20–30 KB/s por jogador. Os eventos (`zdie`, `zfx`, `zbox`…) são esporádicos. No intervalo, sem zumbis, o `zsnap` não é enviado. Ver [[Zombie]].

## Otimizações

### Serialização única por sala

- **Problema:** enviar o mesmo snapshot a N jogadores serializando N vezes.
- **Solução:** pub/sub do Bun — um `JSON.stringify` e um `publish` por tick por sala (`Session.broadcast`). Ver [[CPU]].
- **Trade-off:** todos recebem tudo (sem *interest culling*).
- **Métrica:** não registrada.

### Lobby agrupado

- **Problema:** rajadas de entradas/saídas gerariam várias listas de sessões seguidas.
- **Solução:** `sessionsChanged()` em `server/app.ts` agrupa mudanças em **100 ms** antes de enviar `sessions` a quem está no lobby.

### Aparência só na entrada

`playerInfo(p, withLook)` inclui a aparência (`ap`) apenas quando o jogador aparece, porque ela não muda durante a sessão (`server/session.ts`).

### HTTP

- `gzip` no nginx; `docs/DEPLOY.md` cita o JavaScript de ~5 MB caindo para ~1,8 MB.
- Cache de 1 ano em `/assets/` (nomes com hash); `index.html` sempre revalidado.
- WebSocket sem buffer no proxy (`proxy_buffering off`).

## Limites de proteção

- 150 mensagens/s por conexão (token bucket), mensagem até 16 KiB.
- nginx: 6 conexões `/ws` por IP.

## Pendências registradas

O `README.md` lista como "ainda não feito": **mensagens binárias** (hoje tudo é JSON texto), predição/reconciliação com movimento simulado no servidor, compensação de lag (rewind de hitboxes) e *interest culling* (`server/session.ts`). Hoje o servidor valida acertos contra suas últimas posições com folga `LAG_SLACK = 4` m. Ver [[Known Bottlenecks]].

## Como medir

- F3: `ping` (RTT com média 0,8/0,2) e `interp`.
- DevTools → Network → WS para tamanho/frequência das mensagens.
- Não há métrica de banda no servidor.

## Código relacionado

- `shared/protocol.ts` (`NET`), `server/session.ts` (`tick`, `broadcast`, `playerInfo`), `server/app.ts` (`sessionsChanged`, token bucket)
- `client/net/connection.ts` (ping/RTT, relógio), `client/main.ts` (envio a `NET.stateRate`)
- `deploy/nginx/docker.conf`
