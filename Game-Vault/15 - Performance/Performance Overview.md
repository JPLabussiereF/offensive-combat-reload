---
title: Performance Overview
type: system
status: documented
area: performance
source_paths:
  - client/main.ts
  - client/core/loop.ts
  - client/render/quality.ts
  - client/world/mapBuilder.ts
  - client/world/halloween.ts
  - client/character/character.ts
  - server/app.ts
  - server/session.ts
  - README.md
tags:
  - performance
updated: 2026-10-05
---

# Performance Overview

O jogo é um FPS em WebGL (Three.js) com física Rapier (WASM) no navegador, mirando **60 FPS** — a lógica de qualidade automática usa 45 FPS como piso e 57 FPS como meta. O `README.md` afirma que "com GPU dedicada o jogo passa de 120 FPS" e que sem aceleração de hardware cai para ~10 FPS. **Não há números de antes/depois registrados no código** para as otimizações abaixo, exceto onde indicado.

## Otimizações documentadas

| Otimização | Recurso | Nota |
| --- | --- | --- |
| Lotes estáticos por material e célula (40 m) | GPU/CPU (draw calls) | [[GPU]] |
| Um material por superfície, cor por vértice | GPU (draw calls, trocas de estado) | [[GPU]] |
| Personagem "assado" em 1 SkinnedMesh + 3 LODs | GPU | [[GPU]] |
| Qualidade automática + resolução dinâmica | GPU | [[GPU]] |
| Sombra re-renderizada a cada N frames | GPU | [[GPU]] |
| Pool fixo de luzes reais (`LightPool`) | GPU + CPU (sem recompilar shaders) | [[GPU]] |
| Peças emissivas fundidas / `InstancedMesh` | GPU | [[GPU]] |
| Passo fixo de 60 Hz com guarda contra espiral | CPU | [[CPU]] |
| HUD atualizado a 15 Hz | CPU (DOM) | [[CPU]] |
| Cache de "fechamento" do som por célula de 2 m | CPU | [[CPU]] |
| Snapshot serializado 1× por sala (pub/sub do Bun) | CPU servidor + rede | [[CPU]], [[Network Performance]] |
| Lista do lobby agrupada em 100 ms | CPU servidor + rede | [[Network Performance]] |
| Caches de geometria de personagem (limite 120 corpos) | Memória/CPU | [[Memory]] |
| gzip + cache de 1 ano em `/assets/` | Carregamento | [[Loading Performance]] |
| Texturas KTX2/Basis | Carregamento/VRAM | [[Loading Performance]] |

Gargalos e limitações: [[Known Bottlenecks]]. Aspectos de renderização em si: [[Performance Rendering]].

## Como medir

| Ferramenta | Como usar | O que mede |
| --- | --- | --- |
| Overlay **F3** | tecla F3 na partida | FPS, draw calls, triângulos, GPU, ms de simulação/tick, ms de render/frame, tempo de montagem do mapa, pixel ratio, sombras, ping |
| `window.__oc.perf()` | console, só em dev | tempos de boot (`physics`, `map`, `firstFrame`), `mapBuildMs`, `map.stats` (peças, colisores, meshes, triângulos), médias de CPU/render, draw calls, triângulos |
| `?audit=1` no laboratório | `tools/lab-personagens.html?audit=1` | orçamento de triângulos de cada item de personagem por LOD — ver [[Performance Tests]] |
| `renderer.info` | via `__oc.ctx.renderer.info` | estatísticas do Three.js |

As médias do F3 são exponenciais (fator 0,05) e o texto é atualizado a 15 Hz.

> [!info] Medição citada sem ferramenta no repositório
> O `README.md` relata que uma "varredura do mapa inteiro (260 mil ticks)" de movimento caiu de 3.374 travas para 0 após a mudança do controlador. A ferramenta dessa varredura **não foi encontrada** no repositório (status `unknown`).

## Código relacionado

- `client/main.ts` (overlay F3, `__oc.perf`, `hudTimer`), `client/core/loop.ts`
- `client/render/quality.ts`, `client/world/mapBuilder.ts`, `client/world/halloween.ts` (`LightPool`)
- `client/character/character.ts` (bake/LOD), `client/audio/spatial.ts` (`Enclosure`)
- `server/session.ts`, `server/app.ts`
