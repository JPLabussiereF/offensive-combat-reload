---
title: Performance Rendering
type: system
status: documented
area: rendering
source_paths:
  - client/render/quality.ts
  - client/render/renderer.ts
  - client/world/mapBuilder.ts
  - client/world/surfaces.ts
  - client/world/textures.ts
  - client/render/effects.ts
  - client/render/viewmodel.ts
  - client/entities/heldWeapons.ts
  - client/entities/avatar.ts
  - client/character/character.ts
  - client/world/halloween.ts
  - client/world/budget.ts
  - shared/mapData.ts
  - shared/data/mapas/jardim.json
  - shared/data/mapas/halloween.json
  - client/main.ts
  - client/core/settings.ts
  - docs/MAPAS.md
  - docs/PERSONAGENS.md
tags:
  - game
  - rendering
  - performance
  - gpu
updated: 2026-10-06
---

# Performance Rendering

## Visão geral

O jogo foi feito para rodar no navegador, inclusive em GPUs integradas e celulares. As otimizações de renderização atacam três custos: **draw calls** (fundir geometria e compartilhar materiais), **fill-rate/resolução** (pixel ratio dinâmico) e **sombras** (atualização sob demanda e por preset). Metas e medições gerais do jogo estão em [[Performance Overview]] e [[GPU]]; esta nota descreve as técnicas do lado da renderização, com a evidência no código.

## Metas declaradas

De `docs/MAPAS.md` ("seção 3 do documento de design"), medidas pelo autor (não refeitas nesta documentação):

| Item | Meta | Rua dos Vizinhos | Jardim do Dragão | Vila Assombrada |
| --- | --- | --- | --- | --- |
| Draw calls por quadro | < 300 | ~150 com sombras | ~100–250 | ~75–290 |
| Triângulos visíveis | < 500 mil | ~50 mil | ~290–410 mil | ~130–520 mil |
| Construção do mapa | — | ~50–90 ms | ~380–480 ms | ~400–500 ms |
| Texturas | < 256 MB | ~16 MB (12 × 512²) | + 4 texturas | idem |

> [!warning]
> A Vila Assombrada, pelos números do próprio doc, chega a ~520 mil triângulos em alguns pontos, acima da meta de 500 mil.

## Orçamento de desenho dos mapas (PF-6)

Desde a PF-6 o teto de um mapa é **400 chamadas de desenho e 750 mil triângulos** (`MAP_BUDGET` em `shared/mapData.ts`; decisão do plano da PF-6, que cabe a Vila Assombrada). No editor de mapas (fase 3), um mapa acima disso não salva. `client/world/budget.ts` mede sem GPU, como o `renderer.info` (F3) contaria: a **pior câmera de amostra** (em cada spawn e numa grade sobre o mapa, olhando em 8 direções, FOV 75°, alcance 400 m, com o *frustum culling* de cada objeto) **mais a passada de sombra** do sol (o que projeta sombra dentro da câmera de sombra). Malha com vários materiais conta uma chamada por grupo; malha instanciada, os triângulos vezes as instâncias. Os oficiais medidos (`client/tests/budget.test.ts`):

| Mapa | Chamadas de desenho (câmera + sombra) | Triângulos (câmera + sombra) |
| --- | --- | --- |
| Rua dos Vizinhos | 164 (97 + 67) | 115.670 (75.526 + 40.144) |
| Jardim do Dragão | 310 (233 + 77) | 704.428 (524.204 + 180.224) |
| Vila Assombrada | 265 (187 + 78) | 642.603 (385.601 + 257.002) |
| Cemitério da Capela | 80 (52 + 28) | 122.322 (70.978 + 51.344) |

A medida é conservadora (pior direção em cada ponto, sombra somada); o Jardim usa 94% do teto de triângulos.

Personagens: orçamento de 4.500 triângulos vestido (guia), 3,5–4,5 mil na prática, segundo `docs/PERSONAGENS.md`.

## Técnicas

### 1. Lotes estáticos por material e célula

`MapBuilder.addGeometry` agrupa toda geometria parada pela chave `(material, célula X, célula Z, castShadow)`. `finish()` funde cada grupo (`mergeGeometries`) num `Mesh` com `matrixAutoUpdate = false`. Resultado: poucos draw calls, e células fora da câmera são descartadas pelo **frustum culling** do Three.js.

| Mapa | Tamanho da célula | Motivo no código |
| --- | --- | --- |
| Padrão (Rua dos Vizinhos, glTF) | 40 m | `CELL = 40` |
| Jardim do Dragão | 45 m (`W`) | "os quatro quadrantes da propriedade (células de 40 m cortavam em 16 pedaços, dobrando os draw calls)" |
| Vila Assombrada | 60 m | `new MapBuilder(physics, scene, 60)` |

Ver [[ADR - Lotes estáticos por material e célula]].

### 2. Um material por superfície, cor por vértice

As 20 superfícies da biblioteca têm um material cada para o mapa inteiro; a cor é tint por vértice. Mudar a cor de uma parede não cria material nem draw call. Ver [[Materials]] e [[Texture System]].

### 3. Fusão de objetos multipartes

| Objeto | Técnica | Resultado |
| --- | --- | --- |
| Arma de fogo + braços em 1ª pessoa | `bakeStaticParts`, um *kit* por visual guardado em cache (trocar de arma não recria nada) | "~18 caixas custam 1 draw call em vez de 18" |
| Armas em 3ª pessoa | `mergeColored`, cache por visual (`gunModelKey`), material único | 1 draw call por arma, geometria compartilhada entre personagens |
| Personagem | `Character.bake()`: corpo, roupas, cabelo e acessórios num `SkinnedMesh` com cores nos vértices, sem triângulos escondidos | 1 draw call por personagem + armas |
| Props de várias primitivas | `mergeColoredParts`; móveis e veículos vão para os lotes estáticos | sem draw call extra |
| Janelas, velas, rostos acesos | `Glow` | 1 mesh para o mapa |

### 4. LOD de personagens

- **Malha:** `bake()` gera 3 níveis num `THREE.LOD`: nível 0 até 20 m, nível 1 a partir de 20 m, nível 2 a partir de 45 m, com **10% de histerese**. Os níveis distantes são as mesmas peças regeradas com menos detalhe (`withLod`: tubos com ¾ e ½ dos lados, anéis alternados, sem faixas de espessura no LOD2, peças menores que um botão/bolso somem). Segundo `docs/PERSONAGENS.md`, LOD1 ≈ 60% e LOD2 ≈ 35% dos triângulos.
- **Animação:** fora da tela não anima; > 30 m a cada 2 quadros; > 60 m a cada 4. Ver [[Animation]].

Ver [[ADR - Personagem bakeado em um mesh com LOD]].

### 5. Instancing e pools

Tudo que aparece em quantidade é `InstancedMesh` com capacidade fixa (1 draw call por pool): decals 160, partículas 480, puffs 260, detritos 160, gotas 360, chamas 160, lanternas do céu 650, nuvens 10, névoa rasteira, frutas, lâmpadas da roda-gigante. Traçantes (16), bolas de fogo (12), fumaça (48) e anéis (4) são pools de meshes. Ver [[Particles]].

> [!note] Trade-off
> Esses `InstancedMesh` têm `frustumCulled = false` (as instâncias se espalham pelo mapa), então são sempre enviados à GPU, mesmo vazios (instâncias com escala zero).

### 6. Luzes em número fixo

Mapas noturnos usam um pool fixo de luzes pontuais (6 no Jardim, 10 na Vila) redistribuído entre os pontos de luz mais próximos. O custo não cresce com o número de velas e os shaders não recompilam. Ver [[Lighting]] e [[ADR - Pool fixo de luzes reais]].

### 7. Presets de qualidade e resolução dinâmica

`QualityManager` (`client/render/quality.ts`), escolhido em [[Settings]] (`settings.quality`, padrão `auto`):

| Preset | DPR máx. | Sombras | Mapa de sombras | Atualiza sombras a cada |
| --- | --- | --- | --- | --- |
| `baixa` | 0,75 | não | 512² | 4 quadros |
| `media` | 1 | sim | 1024² | 2 quadros |
| `alta` | 1,5 | sim | 2048² | 1 quadro |
| celular (`auto`) | 1,25 | não (no início) | 1024² | 3 quadros |

- `auto` = `media` no desktop, `MOBILE` em celular/tablet (`IS_MOBILE`), `baixa` se o renderizador for por software.
- **Resolução dinâmica (só `auto`):** mede o FPS a cada 1 s. Abaixo de 45 FPS, reduz a escala em 0,15 até o mínimo de **0,5**; já no mínimo, desliga as sombras. Acima de 57 FPS por 3 s seguidos, sobe 0,1 até 1.
- **Celular:** se segurar 57+ FPS em resolução cheia por 10 s, liga as sombras **uma vez**; se ficarem caras, a regra acima desliga de vez.
- Só roda com o ponteiro travado (`if (input.locked) quality.update(frameDt)`), ou seja, durante o jogo.
- Ligar/desligar sombras recompila todos os materiais da cena uma vez.

Ver [[ADR - Qualidade automática com resolução dinâmica]].

### 8. Sombras sob demanda

`shadowMap.autoUpdate = false`; o mapa de sombras é redesenhado conforme `shadowEvery`. Ver [[Lighting]].

### 9. Custo de carregamento das texturas

`textures.ts` gera o ruído uma vez num canvas 128² e o reaproveita como *pattern*: o comentário diz que loops de `ImageData` por pixel em cada 512² custavam ~10 ms por textura. Ver [[Procedural Textures]] e [[Loading Performance]].

### 10. Detecção de renderização por software

`QualityManager` lê o nome da GPU (`WEBGL_debug_renderer_info`) e marca `software` para SwiftShader, llvmpipe, softpipe, "Basic Render" etc. O menu mostra um aviso. Ver [[Problem - Renderização por software sem GPU]].

## Como medir

- **F3** no jogo: FPS, draw calls, triângulos, ms de simulação e de render, tempo de construção do mapa (meshes e colliders), GPU, preset, pixel ratio e sombras.
- Em `bun run dev`: `window.__oc.perf()` devolve `boot`, `mapBuildMs`, `map.stats`, `simMsAvg`, `renderMsAvg`, `calls`, `tris`.
- Laboratório de personagens: triângulos e draw calls por visual e por peça; `?lod=1|2`. Ver [[Asset Pipeline]].
- `renderer.info` é zerado manualmente a cada quadro, então os números somam a cena e o viewmodel.

## Código relacionado

- `client/render/quality.ts` (`PRESETS`, `MOBILE`, `QualityManager`)
- `client/world/mapBuilder.ts` (`addGeometry`, `finish`, `CELL`)
- `client/render/viewmodel.ts` (`bakeStaticParts`)
- `client/entities/heldWeapons.ts` (`mergeColored`, cache)
- `client/character/character.ts` (`bake`, `LOD_DISTANCES`)
- `client/entities/avatar.ts` (LOD de animação)
- `client/main.ts` (overlay F3, `__oc.perf`)
- `client/world/budget.ts` (`measureBudget`, `measureMapBudget`), `shared/mapData.ts` (`MAP_BUDGET`)

## Ver também

[[Performance Overview]] · [[GPU]] · [[CPU]] · [[Memory]] · [[Known Bottlenecks]] · [[Rendering Overview]]
