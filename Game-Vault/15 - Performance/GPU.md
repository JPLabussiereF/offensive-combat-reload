---
title: GPU
type: system
status: documented
area: performance
source_paths:
  - client/render/quality.ts
  - client/render/renderer.ts
  - client/world/mapBuilder.ts
  - client/world/dragonGarden.ts
  - client/world/halloween.ts
  - client/world/hauntedTown.ts
  - client/world/hydrant.ts
  - client/character/character.ts
  - client/main.ts
tags:
  - performance
  - gpu
  - rendering
updated: 2026-10-05
---

# GPU

Otimizações que reduzem custo de GPU (pixels, draw calls, sombras, luzes). O pipeline de renderização em si está em [[Rendering Overview]] e [[Performance Rendering]].

## 1. Lotes estáticos por material e célula

- **Problema:** um mapa com milhares de peças (paredes, móveis, adereços) desenhado peça a peça.
- **Sintoma:** muitas draw calls; CPU do driver saturada.
- **Causa:** cada `Mesh` é uma draw call.
- **Métrica:** não há número de antes/depois. O F3 mostra `draw calls` e `map.stats` (`pieces`, `meshes`, `triangles`).
- **Solução:** `MapBuilder` (`client/world/mapBuilder.ts`) junta geometria estática por **(material, célula de 40 m)** com `mergeGeometries` e gera um `Mesh` por lote (`matrixAutoUpdate = false`). Células fora da câmera são descartadas pelo *frustum culling*. Um mapa pode escolher o tamanho da célula: o Jardim do Dragão usa **45 m** porque, segundo o comentário em `dragonGarden.ts`, células de 40 m cortavam a propriedade em 16 pedaços, **dobrando as draw calls**.
- **Trade-off:** células grandes desenham geometria fora da tela; células pequenas aumentam draw calls. Peças em lote não podem se mover individualmente (adereços animados ficam fora dos lotes).
- **Como medir novamente:** F3 (`draw calls`, `tris`) em pontos fixos do mapa; `__oc.perf().map`.

Decisão: [[ADR - Lotes estáticos por material e célula]].

## 2. Um material por superfície, cor por vértice

- **Problema:** um material por cor multiplicaria materiais e lotes.
- **Solução:** a cor é um atributo de vértice (*tint*) multiplicado pela textura da superfície; segundo o comentário do `MapBuilder`, "13 superfícies cobrem o mapa". O carregador glTF faz o mesmo (`client/world/gltfMap.ts`: "o tint por vértice carrega a cor base para que meshes em lote compartilhem este material").
- **Trade-off:** variação de cor limitada a multiplicar a textura.
- **Métrica:** não registrada. Ver [[Materials]].

## 3. Personagem assado em 1 SkinnedMesh com LOD

- **Problema:** personagens modulares (corpo + roupas + acessórios) teriam dezenas de meshes cada.
- **Solução:** `bake()` (`client/character/character.ts`) funde corpo, peças e acessórios rígidos num **único SkinnedMesh** com cores por vértice e um material compartilhado — "outros jogadores: 1 draw call + armas". Três níveis de detalhe (LOD0/1/2) trocados por distância em **0, 20 e 45 m** via `THREE.LOD`.
- **Trade-off:** trocar de roupa exige re-assar; morphs que sobrevivem ao bake são só os das mãos (`punho_L`, `punho_R`).
- **Métrica:** `drawCalls()` e `lodTriangles()` do personagem existem para o overlay/lab; orçamentos de triângulos em `client/dev/audit.ts`. Ver [[Character Models]].

## 4. Qualidade automática e resolução dinâmica

- **Problema:** a mesma página roda em GPUs dedicadas, integradas, celulares e renderização por software.
- **Sintoma:** FPS baixo em aparelhos fracos.
- **Solução:** `QualityManager` (`client/render/quality.ts`):

| Preset | `maxDpr` | Sombras | Mapa de sombra | Atualiza sombra a cada |
| --- | --- | --- | --- | --- |
| `baixa` | 0,75 | não | 512 | 4 frames |
| `media` | 1 | sim | 1024 | 2 frames |
| `alta` | 1,5 | sim | 2048 | 1 frame |
| celular (auto) | 1,25 | não (liga depois se aguentar) | 1024 | 3 frames |

  No modo `auto`: a cada segundo mede o FPS; **abaixo de 45** reduz a escala de resolução em 0,15 (mínimo 0,5) e, já no mínimo, desliga as sombras; **acima de 57** por 3 s seguidos sobe 0,1. Celulares que mantêm 57+ FPS por 10 s ganham sombras uma vez. Renderizador por software (`swiftshader`, `llvmpipe`, etc.) começa em `baixa` e mostra aviso.
- **Trade-off:** imagem mais borrada sob carga; alternar sombras força **recompilação** de todos os materiais iluminados (pico pontual).
- **Métrica:** limiares 45/57 FPS estão no código; ganho não registrado.
- **Como medir novamente:** F3 (`quality`, `pixel ratio`, `shadows`, FPS).

Decisão: [[ADR - Qualidade automática com resolução dinâmica]].

## 5. Sombra re-renderizada a cada N frames

- **Problema:** re-renderizar o mapa de sombra todo frame dobra o custo de geometria.
- **Solução:** `shadowMap.autoUpdate = false`; `beforeRender()` marca `needsUpdate` a cada `shadowEvery` frames (o mapa é estático; só personagens se movem). Se o mapa de sombra não existir (primeiro frame, redimensionamento), renderiza já, para evitar erro de GL.
- **Trade-off:** sombras de personagens podem "atrasar" 1–3 frames em `baixa`/`media`/celular.

## 6. Pool fixo de luzes reais (`LightPool`)

- **Problema:** a Vila Assombrada tem muitas velas, lampiões, lareira e lâmpadas; cada `PointLight` encarece todos os shaders, e mudar o número de luzes recompila shaders.
- **Solução:** `LightPool` (`client/world/halloween.ts`) cria um número **fixo** de `PointLight` (padrão 8; `hauntedTown.ts` usa **10**) e as entrega às fontes mais próximas da câmera (reescolha a cada 0,2 s, com fade). Fontes apagadas (lâmpada atingida) ou fora do alcance + 14 m não concorrem. O comentário diz: "o número de luzes nunca muda, então shaders nunca recompilam, e o custo é o mesmo quantas velas houver".
- **Trade-off:** luzes distantes não iluminam de verdade (só o brilho emissivo); troca de luz perceptível ao andar rápido.
- **Métrica:** não registrada.

Decisão: [[ADR - Pool fixo de luzes reais]].

## 7. Peças emissivas fundidas e instanciadas

- Janelas acesas, velas e rostos de abóbora sem iluminação são fundidos num único mesh de cores por vértice — "uma draw call" (`client/world/halloween.ts`).
- Gotas dos hidrantes: um `InstancedMesh` para todos (`client/world/hydrant.ts`).
- Placas com duas faces pintadas: uma draw call (`halloween.ts`).

## 8. Configuração base do renderizador

`WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })`, pixel ratio inicial limitado a 1,5, `PCFShadowMap` (`client/render/renderer.ts`).

## Código relacionado

- `client/render/quality.ts`, `client/render/renderer.ts`
- `client/world/mapBuilder.ts`, `client/world/dragonGarden.ts`, `client/world/gltfMap.ts`
- `client/world/halloween.ts`, `client/world/hauntedTown.ts`, `client/world/hydrant.ts`
- `client/character/character.ts`

Ver também: [[Lighting]], [[Known Bottlenecks]].
