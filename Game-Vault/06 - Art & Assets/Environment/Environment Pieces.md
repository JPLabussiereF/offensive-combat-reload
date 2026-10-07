---
title: Environment Pieces
type: asset
status: documented
area: art
source_paths:
  - client/world/mapBuilder.ts
  - client/world/oriental.ts
  - client/world/jardim/kit.ts
  - client/world/halloween.ts
  - shared/data/mapas/halloween.json
  - client/world/gameMap.ts
  - shared/data/mapas/rua.json
  - client/world/gltfMap.ts
  - docs/MAPAS.md
tags:
  - game
  - art
  - environment
  - assets
updated: 2026-10-06
---

# Environment Pieces

## Visão geral

Os cenários são montados em código a partir de um **kit de peças** que vão para os lotes estáticos do `MapBuilder` (um material por superfície, cor por vértice, UV em metros). Esta nota lista as peças e o que cada uma produz visualmente. A organização espacial dos mapas está em [[World Structure]] e nas notas de cada mapa; o desempenho, em [[Performance Rendering]].

## Primitivas do `MapBuilder` (todos os mapas)

| Método | Gera | Detalhes visuais |
| --- | --- | --- |
| `box`, `span` | caixa (centro+tamanho ou cantos) | UV em metros (`worldUVs`), colisor de caixa |
| `cylinder` | cilindro em pé (postes, colunas, hidrantes) | 12 segmentos por padrão |
| `wall` | parede com vãos `[início, fim, base, topo]` | aceita vãos empilhados (porta sob janela); com `frame`, moldura e peitoril que avançam 8 mm no vão (evita *z-fighting*) e não colidem |
| `stairs` | escada | degraus de no máx. **0,3 m** de altura e **0,38 m** de profundidade só visuais; colisão em rampa sólida; `gentle` acrescenta degraus para ficar abaixo de 45° |
| `gableRoof` | telhado de duas águas com oitões | beiral de 0,45 m, espessura de 0,12 m, UV próprio |
| `addGeometry` | qualquer geometria em espaço de mundo | tint por vértice × atributo `shade` (luz embutida) |

Regras de medida verificadas por teste (doc): porta ≥ 1,6 × 2,3 m; janela atravessável com peitoril ≤ 0,9 m e topo ≥ 2,3 m. Ver [[Map Design Rules]].

## Kit oriental (`oriental.ts`) — [[Map - Jardim do Dragão]]

| Peça | Visual |
| --- | --- |
| `pavilion` | pavilhão de vários andares: paredes de estuque, papel ou madeira, portas, janelas, varanda com guarda-corpo, beiral de telhas sob a laje (visual de pagode), escada interna, telhado curvo no topo |
| `curvedRoof` | telhado chinês côncavo com pontas levantadas: quatro águas, pirâmide (com pináculo dourado) ou só beiral |
| `paperWall`, `moonGateWall`, `railing`, `column`, `wallCap` | parede de shoji, portão lua, guarda-corpo, coluna, capa de muro |
| `rock` | pedra irregular (colisão convexa) |
| `pine`, `bonsai`, `bamboo`, `stoneLantern` | pinheiro de nuvens (cerejeira com outras cores), bonsai, bambu, lanterna de pedra |
| `leafClump`, `foliageCrown`, `limb` | tufo de folhas (esfera ondulada, textura `folhagem`, mais escuro embaixo), copa (só o tufo grande projeta sombra), galho/tronco afinando em `casca` |
| `dragonGeometry` | dragão em volta de uma curva: cabeça, chifres, bigodes, crista, patas |

Aleatoriedade com `seeded(semente)`, nunca `Math.random`, porque a colisão precisa ser igual em todos os clientes.

### Kit do jardim (`jardim/kit.ts`)

Muro de jardim com portões (`gardenWall`: portal com telhado e placa, lua, porta), laje com furos (`slab`), piso de pedra (`pave`), espelho d'água (`waterPlane`), lago num buraco (`basin`), nenúfares e juncos, ponte em arco (`archBridge`), deque, pavilhão aberto (`ting`), bambuzal (`bambooGrove`, colide como bloco), cerca viva podada (`hedge`), caminho de pedras (`steppingPath`), placas, inscrições e pinturas em canvas, cordão de lanternas (`lanternString`), luminária (`lamp`). Constantes: meia-largura `W = 45 m`, muros de **4 m** (`WALL_H`) e 0,6 m de espessura.

## Kit de Halloween (`halloween.ts`) — [[Map - Vila Assombrada]]

| Peça | Visual |
| --- | --- |
| `deadTree` | árvore seca com galhos em garra (tubos afinando) |
| `tombstone` + `epitaph` | lápides `arco`, `cruz`, `laje`, `obelisco` com epitáfio em canvas |
| `ironFence` | grade de ferro (o colisor para jogadores e granadas, mas balas passam) |
| `gateArch` | portão com pilares e placa acesa |
| `hedge` | cerca viva (2,6 m de altura por padrão) |
| `signBoard`, `boardFaces` | placas com texto que cabe na tábua (`fitText`) |
| `slabWithHoles` | laje com buracos (chão com as escadas do esgoto) |
| `nightSky`, `GroundMist` | céu e névoa (ver [[Visual Effects]]) |

A Vila tem 120 × 110 m (`W = 60`, `D = 55` de meia-extensão) e usa células de 60 m.

## Rua dos Vizinhos (`rua.json`, `catalog/street.ts`)

Montada só com as primitivas do `MapBuilder`: casas de dois andares com telhado de duas águas (paredes `reboco`/`tijolo`, molduras), rua de `asfalto`, `calcada`, quintais cercados, piscina vazia (`azulejo`, 2 m de queda), casa na árvore, torre de vigia de 7 m, veículos (`vehicles.ts`). 80 × 60 m, três faixas leste-oeste.

## Peças vindas do Blender

Qualquer malha de um `.glb` vira peça de cenário pelo `addGltfToMap`, com as convenções `MAT_`, `COL_`, `NOCOL`. Ver [[Asset Pipeline]] e [[Map - Arena Teste (glTF)]].

## Código relacionado

- `client/world/mapBuilder.ts` (`MapBuilder`, `STEP_H`, `STEP_D`, `stairSteps`, `worldUVs`, `boxProjectUVs`)
- `client/world/oriental.ts`, `client/world/jardim/kit.ts`
- `client/world/halloween.ts`, `client/world/catalog/haunted.ts`
- `client/world/catalog/street.ts`, `client/world/vehicles.ts`

## Ver também

[[Props Catalog]] · [[Texture System]] · [[Procedural Textures]] · [[World Structure]] · [[Cover & Combat Spaces]]
