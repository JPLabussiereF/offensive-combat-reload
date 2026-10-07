---
title: CPU
type: system
status: documented
area: performance
source_paths:
  - client/core/loop.ts
  - shared/constants.ts
  - client/main.ts
  - client/audio/spatial.ts
  - client/world/halloween.ts
  - server/session.ts
  - server/app.ts
tags:
  - performance
  - cpu
updated: 2026-10-06
---

# CPU

Otimizações e cuidados de CPU no cliente e no servidor. Cada item segue o modelo de registro de otimização do Vault.

## 1. Passo fixo de simulação com guarda contra espiral

- **Problema:** simulação dependente do frame rate gera física inconsistente; em frames lentos, recuperar o atraso pode custar ainda mais e travar o jogo.
- **Sintoma:** "espiral da morte" (cada frame mais lento que o anterior) após uma travada longa.
- **Causa:** acumular tempo e simular tudo que faltou sem limite.
- **Métrica:** não registrada no código.
- **Solução:** `startLoop` (`client/core/loop.ts`) simula em passos fixos de `SIM.dt = 1/60` s, no máximo `SIM.maxStepsPerFrame = 5` por frame; `frameDt` é limitado a 0,25 s; ao atingir o limite, o acumulador é zerado. O render interpola entre os dois últimos estados (`alpha`).
- **Trade-off:** em máquinas muito lentas o jogo "anda em câmera lenta" em vez de pular; o tempo descartado é perdido.
- **Como medir novamente:** F3 → `CPU sim ... ms/tick`; `__oc.perf().simMsAvg`.

## 2. HUD atualizado a 15 Hz

- **Problema:** atualizar texto do DOM a cada frame custa layout/estilo.
- **Sintoma:** não registrado.
- **Causa:** vida, munição, granadas, pontuação e overlay F3 são DOM.
- **Métrica:** não registrada.
- **Solução:** em `client/main.ts`, `hudTimer` dispara a cada `1/15` s para `setHealth`, `setBoost`, `setBuffs`, `setAmmo`, `setGrenades`, `setScore` e o texto do F3. O que precisa ser suave (barra de recarga, anel de granada do toque) continua por frame.
- **Trade-off:** até ~67 ms de atraso visual nesses números.
- **Como medir novamente:** perfil de desempenho do navegador (Recalculate Style/Layout).

## 3. Cache de "fechamento" do som por célula de 2 m

- **Problema:** saber se um ponto está num ambiente fechado (para eco) exige vários raios contra o mapa.
- **Solução:** `Enclosure` (`client/audio/spatial.ts`) guarda o resultado por célula de 2 m (`Map` com chave `x,y,z`), já que o mapa não se move.
- **Trade-off:** memória cresce com as células visitadas (sem limite); mudanças no mapa não invalidam o cache.
- **Métrica / medição:** não registradas; ver [[Spatial Audio]].

## 4. Escolha das luzes reais 5× por segundo

- **Problema:** ordenar todas as fontes de luz da Vila Assombrada por distância a cada frame.
- **Solução:** `LightPool.update` só reescolhe as luzes a cada **0,2 s**; entre escolhas só ajusta intensidade/cintilação das luzes já atribuídas. Detalhe de GPU em [[GPU]].
- **Trade-off:** uma luz nova pode "acender" até 0,2 s depois (atenuado pelo fade de 0,25 s).

## 5. Servidor: snapshot serializado uma vez por sala

- **Problema:** com N jogadores, serializar o snapshot por destinatário custa N×`JSON.stringify` por tick.
- **Solução:** cada `Session` publica num tópico do pub/sub do Bun (`sessao:<id>`); `broadcast` faz **um** `JSON.stringify` e `publish` (o `README.md` registra isso como decisão). Mensagens causadas por um jogador usam `ws.publish` do próprio socket para não ecoar para ele.
- **Trade-off:** todos recebem o mesmo snapshot completo (sem *interest culling*, citado como "ainda não feito" em `server/session.ts`).
- **Métrica:** não registrada.
- **Como medir novamente:** perfilar o processo Bun com várias salas cheias (não há ferramenta no repositório).

## 6. Servidor: proteção de CPU contra inundação

- **Token bucket** de 150 mensagens/s por conexão (`server/app.ts`): excedentes são descartados antes do `JSON.parse`.
- `maxPayloadLength` 16 KiB por mensagem WebSocket; corpo HTTP até 16 KiB (2 MiB nos dados de mapa, 10 MB no GLB).
- Chat: rajada de 4 e depois 1 a cada 1,5 s.

## 7. Servidor: tick por sessão

Cada sessão roda `setInterval` a 20 Hz (`NET.tickRate`) com regeneração de vida, tempo de XP, limpeza de corpos e snapshot; placar completo só 1×/s. Salas vazias não enviam snapshot e fecham na atualização seguinte do lobby (não há salas fixas). Montar um mapa ao salvá-lo (0,2 a 0,6 s nos oficiais) roda numa thread própria (`server/mapWorker.ts`), fora do tick.

## Código relacionado

- `client/core/loop.ts`, `shared/constants.ts` (`SIM`), `client/main.ts` (`hudTimer`)
- `client/audio/spatial.ts` (`Enclosure`), `client/world/halloween.ts` (`LightPool`)
- `server/session.ts` (`broadcast`, `tick`), `server/app.ts` (token bucket)

Ver também: [[Performance Overview]], [[Known Bottlenecks]], [[Synchronization]].
