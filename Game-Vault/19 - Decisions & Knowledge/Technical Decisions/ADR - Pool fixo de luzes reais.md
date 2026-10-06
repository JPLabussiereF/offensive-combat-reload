---
title: ADR - Pool fixo de luzes reais
type: decision
status: documented
area: rendering
source_paths:
  - client/world/halloween.ts
  - client/world/hauntedTown.ts
  - client/world/jardim/luzes.ts
tags:
  - adr
  - rendering
  - lighting
  - performance
updated: 2026-10-05
---

# ADR - Pool fixo de luzes reais

## Contexto

Os mapas noturnos ([[Map - Vila Assombrada]], [[Map - Jardim do Dragão]]) têm dezenas de velas, lampiões, lareira e lanternas que deveriam iluminar o entorno.

## Problema

No Three.js, cada luz pontual encarece cada fragmento iluminado, e o número de luzes faz parte do programa de shader: mudar a quantidade recompila os materiais.

## Opções consideradas

- Uma `PointLight` por fonte (custo cresce com o mapa, recompilações).
- Só brilho visual, sem luz real.
- Um número fixo de luzes realocado entre as fontes mais próximas da câmera (escolhida), combinado com brilho visual (`Glow`, halos) em todas as fontes.

> [!info]
> O código não registra outras alternativas além dessas implícitas.

## Decisão

- `LightPool` (Vila, `new LightPool(scene, 10)`; padrão 8): a cada 0,2 s os `LightSpot` são ordenados por `distância − 0,4 × alcance` (fora: apagados ou além de `alcance + 14 m`); a luz que segue entre as N mais próximas mantém o ponto; fade 4/s; tremulação por ponto.
- `LanternLights` (Jardim, `LIGHTS = 6`, alcance 10 m): a cada 0,25 s, as 6 lanternas mais próximas; fade-in 2,5/s; tremulação de vela.

## Motivo

Comentário de `LightPool`: "The number of lights never changes, so shaders never recompile, and the cost stays the same however many candles and lamps the map has."

## Consequências

- Custo de iluminação constante, independente do número de fontes.
- Só o entorno da câmera tem luz real; fontes distantes apenas brilham.
- As luzes "pulam" de fonte (suavizado com fade).
- Lampiões apagados a tiro saem da lista (`on()`).

## Código afetado

- `client/world/halloween.ts` (`LightSpot`, `LightPool`)
- `client/world/hauntedTown.ts`
- `client/world/jardim/luzes.ts` (`LanternLights`)

Ver [[Lighting]] e [[Performance Rendering]].
