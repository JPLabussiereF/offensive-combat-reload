---
title: ADR - UVs em coordenadas do mundo
type: decision
status: documented
area: rendering
source_paths:
  - client/world/mapBuilder.ts
  - client/world/surfaces.ts
  - client/world/gltfMap.ts
  - docs/MAPAS.md
tags:
  - adr
  - rendering
  - textures
updated: 2026-10-05
---

# ADR - UVs em coordenadas do mundo

## Contexto

Os mapas são montados com muitas caixas e segmentos de parede, e mapas glTF vêm de blockouts sem UV.

## Problema

UVs por peça reiniciam a textura em cada segmento: "paredes remendadas pareciam uma segunda estrutura" (comentário de `worldUVs`). Exigir UV no Blender atrasa o blockout.

## Opções consideradas

- UV por peça (padrão das geometrias do Three.js).
- UV manual no Blender.
- UV calculada das coordenadas do mundo em metros (escolhida), com escape `uv_proprio` para glTF.

## Decisão

- Mapas em código: `worldUVs` projeta por vértice pelo eixo dominante da normal.
- glTF com `MAT_<superfície>`: `boxProjectUVs` por triângulo.
- Texturas com `repeat = 1 / metros` da superfície.

## Motivo

Tábuas e fiadas de tijolo se alinham entre peças vizinhas; densidade de pixels igual em toda parede; "sem mapeamento UV manual" (`docs/MAPAS.md`).

## Consequências

- Arte exclusiva de objeto (placa, mural) precisa de material próprio ou `uv_proprio = true`.
- Telhados e lataria de carro têm UVs próprias.
- Texturas devem ser repetíveis.

## Código afetado

- `client/world/mapBuilder.ts` (`worldUVs`, `boxProjectUVs`)
- `client/world/surfaces.ts` (`withRepeat`), `client/world/gltfMap.ts`

Ver [[Texture System]].
