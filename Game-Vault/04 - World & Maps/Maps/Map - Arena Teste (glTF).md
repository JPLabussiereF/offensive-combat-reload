---
title: Map - Arena Teste (glTF)
type: map
status: documented
area: world
source_paths:
  - public/maps/arena_teste.glb
  - tools/gerar-props-exemplo.mjs
  - client/world/gltfMap.ts
  - client/main.ts
  - package.json
  - docs/MAPAS.md
tags:
  - world
  - map
  - gltf
  - tooling
updated: 2026-10-06
---

# Map - Arena Teste (glTF)

| Campo | Valor |
| --- | --- |
| Arquivo | `public/maps/arena_teste.glb` |
| Gerado por | `tools/gerar-props-exemplo.mjs` (`bun run exemplos:glb`), que faz o papel de um arquivo exportado do Blender |
| Como abrir | `http://localhost:5173/?mapa=/maps/arena_teste.glb` |
| Construtor | `buildGltfMap` (`client/world/gltfMap.ts`) |
| Tamanho | 36 × 36 m (x/z −18..18) |
| É um mapa do servidor (`map`)? | **Não** — não aparece no seletor nem tem sessão online |
| `killY` | −10 (do marcador `KILLVOLUME`) |

## Visão geral

Mapa de **teste do pipeline Blender → glTF**, não um mapa de jogo. Serve para validar as convenções de nome (`MAT_`, `SPAWN_`, `DUMMY_`, `KILLVOLUME`) e a colisão automática. Não tem `COL_`: toda malha visível ganha colisão por malha de triângulos. Pipeline em [[Asset Pipeline]] e [[World Structure]].

## Layout

| Elemento | Medidas | Material |
| --- | --- | --- |
| Chão | 36 × 36 m, 1 m de espessura | `MAT_grama` |
| Muros perimetrais | 3 m de altura, 0,5 m de espessura | `MAT_tijolo` |
| Plataforma central | 6 × 6 m, 2 m de altura | `MAT_concreto` |
| Rampas | duas, x −9..−3 (oeste) e espelhada a leste (x 3..9), 3 m de largura, sobem 2 m | `MAT_concreto` |
| Caixotes (6) | 2 × 2 × 1,2 m em (±12, ±8), (0, 12), (0, −12) | `MAT_madeira` |

## Rotas principais / alternativas

Arena aberta simétrica: rota pelo centro (plataforma pelas rampas leste-oeste) ou pelas bordas entre os caixotes. Sem rotas alternativas.

## Áreas abertas / fechadas

Totalmente aberta; não há áreas fechadas.

## Cobertura

Seis caixotes de 1,2 m (cobertura agachado) e a plataforma de 2 m.

## Spawn points

- `SPAWN_A_01` (−15, 0,2, −3) e `SPAWN_A_02` (−15, 0,2, 3), olhando +X.
- `SPAWN_B_01` (15, 0,2, 0), olhando −X.
- Sem `SPAWN_FFA_*`: online e contra bots o jogo usa A + B (3 pontos, bem abaixo dos 16–20 recomendados). Ver [[Spawn Design]].

Bonecos: `DUMMY_01` sobre a plataforma (0, 2, 0); `DUMMY_02` (10, 0, 0) patrulhando no eixo z (amplitude 4 m, velocidade 1 rad/s, via propriedades `eixo`/`amplitude`/`velocidade`); `DUMMY_03` sobre um caixote (12, 1,2, 8).

## Objetivos

Nenhum.

## Zonas especiais

`KILLVOLUME` a −10 m (cair abaixo morre). Nenhuma outra.

## Objetos interativos

Nenhum: `buildGltfMap` devolve um `PropBus` vazio e um `update` vazio; marcadores `GAG_*` dependem de código específico do mapa. Ver [[Interactive Objects]].

## Fluxo esperado dos jogadores

Uso pelo criador de mapas: abrir com `?mapa=`, andar, testar colisão, rampas, spawns e bonecos.

## Problemas conhecidos

- O parâmetro `?mapa=` **sobrepõe o mapa escolhido em qualquer modo**, inclusive online, onde os outros jogadores e o servidor seguem no mapa da sessão. Ver [[Problem - Prévia glTF por URL sobrepõe o mapa da sessão]].
- Só 3 spawns e nenhum FFA.
- Não existe exemplo de mapa com `COL_` explícito (o exemplo de `COL_..._BOX` está só na casinha da Amora, `public/models/casinha_cachorro.glb`).

## Código relacionado

- `tools/gerar-props-exemplo.mjs` — geração da arena (bloco "Test arena").
- `client/world/gltfMap.ts` — `addGltfToMap`, `buildGltfMap`, `gltfLoader`.
- `client/main.ts` — leitura de `?mapa=`.
- `docs/MAPAS.md` — seção "Blender → .glb".
