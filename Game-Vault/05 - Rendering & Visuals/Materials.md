---
title: Materials
type: system
status: documented
area: rendering
source_paths:
  - client/render/materials.ts
  - client/world/surfaces.ts
  - client/world/gltfMap.ts
  - client/world/mapBuilder.ts
  - client/character/material.ts
  - client/render/viewmodel.ts
  - client/entities/heldWeapons.ts
  - client/render/weaponModels.ts
  - client/world/halloween.ts
tags:
  - game
  - rendering
  - materials
updated: 2026-10-05
---

# Materials

## Visão geral

O jogo tem poucos materiais e os reaproveita ao máximo. A regra central, repetida em vários comentários do código: **a cor não cria material novo**. A cor vem de um *tint* por vértice (atributo `color`), e o material é compartilhado. Isso permite fundir geometria de cores diferentes num só lote e economiza draw calls (ver [[Performance Rendering]]).

As cores em si estão em [[Material Palette]]; as texturas em [[Texture System]].

## Famílias de material

### 1. Toon do mapa e dos props

| Função | O que cria | Detalhes |
| --- | --- | --- |
| `toonGradient()` | `DataTexture` 3×1, `RedFormat`, valores `[95, 175, 255]`, filtro `Nearest`, sem mipmaps | a rampa de 3 tons, criada uma vez. Ver [[ADR - Toon shading com rampa de 3 tons]] |
| `toon(color, { emissive })` | `MeshToonMaterial` com a rampa | cache por `cor + emissive`: a mesma cor devolve o mesmo material. Usado em props animados, armas, granada, mina |
| `surfaceMaterial(key)` | `MeshToonMaterial` branco, `vertexColors: true`, rampa, `map` = textura da superfície com repeat `1/metros` | **um por superfície** para o mapa inteiro; nome `MAT_<key>` (ex.: `MAT_tijolo`). Ver [[Texture System]] |
| `toToon(src)` (glTF) | `MeshToonMaterial` que mantém `map`, `transparent`, `alphaTest` e `side` do material do Blender | a cor base vira tint por vértice para o lote poder compartilhar o material. Cache por material de origem |

### 2. Cor por vértice fundida ("bake" de cores)

Objetos feitos de várias primitivas coloridas viram **uma geometria** com atributo `color` e **um** material:

- `mergeColoredParts(parts)` (`materials.ts`): usado no cachorro, no topo de sorvete, nos flamingos, nas lanternas do céu, no pato-granada etc. Remove UVs.
- `bakeStaticParts` (`viewmodel.ts`): o rifle e os braços em primeira pessoa (~18 caixas) viram um mesh com `MeshToonMaterial({ vertexColors: true })`; ficam de fora o carregador (animado), o clarão, os braços e as partes que brilham.
- `mergeColored` (`heldWeapons.ts`): as armas vistas em terceira pessoa, com **um** material toon compartilhado por todas as armas de todos os personagens. Partes transparentes ou `MeshBasicMaterial` (brilhos) são descartadas ("são minúsculas de longe").
- `MapBuilder.addGeometry`: toda peça estática recebe o tint como cor de vértice (multiplicado por `shade`, se houver).

### 3. Personagens

`paintedMaterial()` (`character/material.ts`): `MeshStandardMaterial` com `flatShading: true`, `roughness 0.85`, `metalness 0`, `map` = atlas de paleta 256×256, `vertexColors` como oclusão, e patch de shader para tints e regiões escondidas ([[Shaders]]).

- Personagem "vivo" (editor, laboratório): uma instância por peça (os tints e a máscara de regiões são uniforms), programa de shader compartilhado.
- Personagem no jogo (bakeado): **um** material compartilhado por todos, `bakedMaterial()`, com as cores finais nos vértices.
- Peça vinda de GLB com textura própria: usa o `map` do arquivo, sem paleta.

> [!info]
> Personagens **não** usam o toon do mapa. O comentário de `material.ts` cita a seção "Configuração no Three.js" do guia de estilo de personagens como origem da escolha (standard + flat shading). O guia não está no repositório.

### 4. Sem iluminação (brilho)

`MeshBasicMaterial` é usado para tudo que "emite" luz ou deve ler igual em qualquer iluminação:

- `Glow` (`halloween.ts`): janelas acesas, velas, rostos de abóbora, fundidos num mesh com `vertexColors`.
- Retículos, ponto vermelho, luzes de Natal da arma (`glowMat` em `weaponModels.ts`): opacos, ou aditivos quando têm opacidade < 1.
- Traçantes e clarão do disparo (aditivos), bolas de fogo, anel de choque, partículas de impacto, puffs, gotas, chamas.
- Céu e lua da Vila; lanternas do céu do Jardim (`fog: false`).

## Transparência e ordem de desenho

- Efeitos transparentes usam `depthWrite: false` (decals, fumaça, névoa, halos, traçantes) para não recortar o que está atrás.
- Decals usam `polygonOffset` (fator −4) e ficam a 4 mm da superfície para não brigar no depth.
- `renderOrder` negativo para céu (−10/−9 no Jardim, −2/−1 na Vila) e 2 para a névoa rasteira.
- Molduras de portas e janelas avançam 8 mm para dentro do vão para não ficarem coplanares com a parede (evita *z-fighting*, segundo o comentário de `MapBuilder.wall`).

## Código relacionado

- `client/render/materials.ts` (`toonGradient`, `toon`, `mergeColoredParts`, `PALETTE`)
- `client/world/surfaces.ts` (`surfaceMaterial`, `SURFACES`)
- `client/world/gltfMap.ts` (`toToon`)
- `client/character/material.ts` (`paintedMaterial`, `bakedMaterial`, `setChannels`, `setTints`)
- `client/render/viewmodel.ts` (`bakeStaticParts`)
- `client/entities/heldWeapons.ts` (`sharedMaterial`, `mergeColored`)
- `client/render/weaponModels.ts` (`glowMat`)
- `client/world/halloween.ts` (`Glow`)

## Ver também

[[Material Palette]] · [[Texture System]] · [[Shaders]] · [[Art Direction]]
