---
title: Performance Rendering
type: system
status: documented
area: rendering
source_paths:
  - client/render/shadows.ts
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
  - client/editor/batches.ts
  - client/editor/view.ts
  - client/tests/editorBatches.test.ts
  - shared/mapData.ts
  - shared/data/mapas/jardim.json
  - shared/data/mapas/halloween.json
  - client/main.ts
  - client/core/settings.ts
  - client/render/packedInstances.ts
  - client/world/simplify.ts
  - client/world/mapLoader.ts
  - client/render/weaponModels.ts
  - client/ui/galpao/scene.ts
  - client/dev/bench.ts
  - client/tests/polyBudget.test.ts
  - tools/orcamento.ts
  - tools/prints-mapas.ts
  - docs/MAPAS.md
  - docs/PERSONAGENS.md
tags:
  - game
  - rendering
  - performance
  - gpu
updated: 2026-10-08
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

Desde a PF-6 o teto de um mapa é **400 chamadas de desenho e 750 mil triângulos** (`MAP_BUDGET` em `shared/mapData.ts`; decisão do plano da PF-6, que cabe a Vila Assombrada). No editor de mapas (fase 3), um mapa acima disso não salva: a barra de orçamento monta o mapa de novo no modo jogo, fora da tela, e mede com a mesma função do servidor ([[ADR - Editor de mapas no jogo]]). `client/world/budget.ts` mede sem GPU, como o `renderer.info` (F3) contaria: a **pior câmera de amostra** (em cada spawn e numa grade sobre o mapa, olhando em 8 direções, FOV 75°, alcance 400 m, com o *frustum culling* de cada objeto) **mais a passada de sombra** do sol (o que projeta sombra dentro da câmera de sombra). Malha com vários materiais conta uma chamada por grupo; malha instanciada, os triângulos vezes as instâncias. Os oficiais medidos (`client/tests/budget.test.ts`):

| Mapa | Chamadas de desenho (câmera + sombra) | Triângulos (câmera + sombra) |
| --- | --- | --- |
| Rua dos Vizinhos | 164 (97 + 67) | 115.670 (75.526 + 40.144) |
| Jardim do Dragão | 310 (233 + 77) | 704.428 (524.204 + 180.224) |
| Vila Assombrada | 265 (187 + 78) | 642.603 (385.601 + 257.002) |
| Cemitério da Capela | 82 (54 + 28) | 133.522 (82.178 + 51.344) |

Números de antes da PF-35 (o Cemitério estava registrado errado aqui, com 122.322). A medida é conservadora (pior direção em cada ponto, sombra somada); o Jardim usava 94% do teto de triângulos. Depois da PF-35, ver a seção seguinte.

## Detalhe geométrico e orçamentos da PF-35

A PF-35 cortou o que não aparece para todo mundo (T1–T9) e criou a opção **Detalhe dos objetos: Normal / Leve** ([[Settings]]), Leve por padrão no celular e com renderização por software, com cortes com alguma perda só no Leve (L1–L7). Decisão e motivos: [[ADR - Detalhe geométrico Normal e Leve]].

**Orçamentos** (Normal / Leve; `DETAIL_BUDGET` em `client/world/budget.ts`; o teste aceita 5% acima do orçamento e 5% acima do último medido):

| Item | Normal | Leve |
| --- | --- | --- |
| Mapa, pior câmera | 400 mil | 300 mil |
| Mapa, câmera mediana | 300 mil | 220 mil |
| Sombra do sol | 220 mil | 220 mil |
| Chamadas (pior câmera + sombra) | 320 | 250 |
| Instâncias em escala zero em repouso | 0 | 0 |
| Personagem, p90 de 200 visuais (LOD0 / LOD1 / LOD2) | 5.000 / 3.200 / 2.000, LOD1/LOD0 ≤ 0,65, LOD2/LOD0 ≤ 0,40 | (iguais) |
| Arma em 3ª pessoa | 800 | 800 |
| Viewmodel | 3.500 | 3.500 |
| Efeitos (repouso / pico com todos os pools cheios) | 0 / 15 mil | 0 / 10 mil |
| Galpão (passada da câmera, P14) | 80 mil | 40 mil |
| Quadro inteiro (P8: pior câmera + 9 personagens LOD0 p90 + 10 armas + viewmodel + pico de efeitos; no Normal mais a sombra do mapa e dos personagens) | 700 mil | 400 mil |

`MAP_BUDGET` (750 mil, 400 chamadas) continua o teto do editor e do servidor para qualquer mapa.

**Mapas oficiais, antes e depois** (`bun tools/orcamento.ts`; triângulos e chamadas):

| Mapa | Antes: pior câmera / mediana / sombra / chamadas | Depois Normal | Depois Leve |
| --- | --- | --- | --- |
| Rua dos Vizinhos | 75,5k / 40,0k / 40,1k / 164 | 48,4k / 21,5k / 30,4k / 163 | 36,4k / 18,0k / 19,3k / 163 |
| Jardim do Dragão | 524,2k / 408,2k / 180,2k / 310 | 394,2k / 281,5k / 180,2k / 253 | 312,4k / 227,5k / 148,5k / 253 |
| Vila Assombrada | 385,6k / 222,1k / 257,0k / 265 | 322,8k / 188,3k / 228,3k / 263 | 266,4k / 154,4k / 169,4k / 263 |
| Cemitério da Capela | 82,2k / 51,6k / 51,3k / 82 | 75,6k / 47,9k / 51,3k / 82 | 64,8k / 42,7k / 33,3k / 82 |

Instâncias em escala zero ("fantasmas"): Jardim 44,2 mil, Vila 8,4 mil, Rua 7,2 mil e efeitos 6,5 mil antes; 0 depois. Quadro inteiro depois (Normal / Leve): Jardim 687k / 375k, Vila 663k / 329k, Rua 191k / 99k, Cemitério 239k / 128k. Desvios aceitos, dentro da folga de 5%: o Jardim no Leve fica em 312 mil na pior câmera, a sombra da Vila no Normal em 228 mil e as chamadas da Vila nos dois níveis em 263 (orçamento leve 250; o resto são objetos únicos com textura própria, P13). Os gravetos sem sombra do L2 caíam num lote a mais por célula (Vila 271 e Cemitério 90 chamadas no Leve); desde a P15 vão no lote do próprio tronco e ficam fora só da passada de sombra (`MapBuilder.addShadowless`: o lote desenha o índice inteiro na câmera e, em `onBeforeShadow`, só o começo dele), e o Leve não tem mais chamadas que o Normal.

**Cortes para todos (T):**

| Item | O que mudou | Ganho medido |
| --- | --- | --- |
| T1 | Pools instanciados (gotas do hidrante e da fonte, sopro do dragão, fumaça e detritos da Vila, frutas e suco, marcas de tiro, partículas) desenham só os slots em uso: `PackedInstances` (`client/render/packedInstances.ts`) junta os ativos no começo do `InstancedMesh` e `mesh.count` é quantos são (como os corvos do zumbi já faziam). O editor de mapas deixa esses pools fora dos lotes (a contagem muda todo quadro) | Jardim −44,2 mil, Vila −8,4 mil, Rua −7,2 mil, efeitos −6,5 mil |
| T2 | Lanternas do céu de 126 para 34 triângulos (cilindro de 6 lados, chama 4×3) | Jardim −59,8 mil (650 lanternas) |
| T3 | Veículos: caixas arredondadas com 1 segmento, chanfro 1, curva 6, rodas de 12 lados; carrinhos bate-bate com 1 segmento | carro 5.816 → 2.776 |
| T4 | Grades sem as tampas escondidas das barras (12 → 8) e pontas sem base (8 → 4), na Vila e no muro do Cemitério | Vila e Cemitério |
| T5–T7 | Anéis do bambu sem tampas; lanternas de papel com esfera 8×6 e cintas de 8 lados; abóboras 16×8 mantendo os 8 gomos | Jardim e Vila |
| T8 | Armas em 3ª pessoa com modelo próprio (`gunParts(g, true)`, `knifeModel(f, true)`): ver [[Weapon Models]] | pistolão 2.786 → 252, a mais pesada 580 |
| T9 | LOD1 e LOD2 de verdade nos personagens (P10): ver [[Character Models]] | ver lá |
| P13 | Placas, quadros e inscrições do Jardim: a moldura vai para o lote estático, só a face pintada fica separada | Jardim 302 → 253 chamadas |

**Modo Leve (L)**, aplicado ao montar o mapa (`MapBuilder.seg(normal, leve)` e `BuildCtx.seg`): L1 folhagem (`leafClump`, `foliageCrown`, brotos da sebe: uma subdivisão e metade dos tufos pequenos, cada um ∛2 maior; a cerejeira mantém todos porque as cerejas penduram neles); L2 árvores mortas (tronco 8×5, galhos 5×4, gravetos sem sombra no lote do tronco, P15); L3 250 lanternas do céu; L4 telhados curvos com 4 × 3 segmentos; L5 props esculpidos (bruxa, dragões, leões, panda, flamingo, cachorro, caminhão de sorvete, trailer, roda-gigante) simplificados na carga com meshoptimizer (`client/world/simplify.ts`; erro de 0,7% do tamanho do prop, 2% no cachorro, cuja pelagem é ruído; a geometria estática do prop é juntada por material e simplificada inteira); L6 livros como um bloco escuro por fileira com as lombadas pintadas; L7 personagens trocam de LOD a 10 e 25 m; P7 bolas de fogo e fumaça com icosaedro de detalhe 0. Colisão e navmesh saem sempre da malha cheia (o teste compara os colisores dos dois níveis).

**Ferramentas:** `bun tools/orcamento.ts` (tabela e `build/orcamento.json`; `--pecas` mostra o custo peça a peça); `bun tools/prints-mapas.ts` (prints nos pontos fixos de `client/dev/benchPontos.json`, nos dois níveis, e `--lado-a-lado`); a rota de desenvolvimento `/?bench=<mapa>&detalhe=normal|leve` (`client/dev/bench.ts`: o mapa sozinho, `renderer.info` e FPS por ponto, em `window.__ocBench`) e `/?bench=galpao` (a tela inicial sozinha: passada da câmera e quadro inteiro por estação; `window.__ocGalpao` em desenvolvimento).

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

- **Malha:** `bake()` gera 3 níveis num `THREE.LOD`: nível 0 até 20 m, nível 1 a partir de 20 m, nível 2 a partir de 45 m (10 e 25 m com o detalhe Leve, L7 da PF-35), com **10% de histerese**. Os níveis distantes são as mesmas peças regeradas com menos detalhe (`withLod`: tubos com ¾ e ½ dos lados, anéis alternados, sem faixas de espessura no LOD2, peças menores que um botão/bolso somem). Segundo `docs/PERSONAGENS.md`, LOD1 ≈ 60% e LOD2 ≈ 35% dos triângulos.
- **Animação:** fora da tela não anima; > 30 m a cada 2 quadros; > 60 m a cada 4. Ver [[Animation]].

Ver [[ADR - Personagem bakeado em um mesh com LOD]].

### 5. Instancing e pools

Tudo que aparece em quantidade é `InstancedMesh` com capacidade fixa (1 draw call por pool): decals 384, partículas 480, puffs 260, detritos 160, gotas 360, chamas 160, lanternas do céu 650, nuvens 10, névoa rasteira, frutas, lâmpadas da roda-gigante. Traçantes (16), bolas de fogo (12), fumaça (48) e anéis (4) são pools de meshes. Ver [[Particles]].

> [!note] Trade-off
> Esses `InstancedMesh` têm `frustumCulled = false` (as instâncias se espalham pelo mapa), então são sempre enviados à GPU. Desde a PF-35 (T1) só os slots em uso vão (`PackedInstances`, `mesh.count`): vazio, o pool não desenha nada.

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

`shadowMap.autoUpdate = false`; o mapa de sombras é redesenhado conforme `shadowEvery` (laço da partida e do editor de mapas), e todo quadro pede o mapa se ele ainda não existe (`ensureShadowMap`). Ver [[Lighting]] e [[Problem - Editor sem mapa de sombra com aceleração de hardware]].

### 8b. Lotes do editor de mapas (P46, PF-6 Revisions 01)

| | |
| --- | --- |
| **Problema** | No modo editor cada peça fica no seu grupo (para ser selecionada e reconstruída sozinha), sem lotes entre peças. |
| **Sintoma** | Jardim do Dragão no editor: ~1.400 malhas estáticas e **1.700 a 2.700 chamadas de desenho por quadro** (contra 310 no jogo); GPU fraca fica lenta. |
| **Causa** | Os lotes por material e célula do `MapBuilder` e as coleções instanciadas fecham por peça no modo editor; cada peça desenha as suas malhas à parte. |
| **Solução** | `EditorBatches` (`client/editor/batches.ts`): as malhas das peças **fora da seleção** são copiadas para `THREE.BatchedMesh`, uma por material equivalente (mesmos ajustes, cores por valor, texturas por identidade: cada lanterna de papel cria o seu material) e formato de vértice, com recorte objeto a objeto (`perObjectFrustumCulled`) e `WEBGL_multi_draw` (uma chamada por lote). As malhas próprias vão para a camada 31, que nenhuma câmera nem a sombra desenham, e continuam na cena (o raio da seleção liga todas as camadas). A peça selecionada (e o que está dentro de um grupo selecionado) volta a desenhar as próprias malhas e esconde as cópias. As cópias seguem matriz, visibilidade, instâncias e vértices da malha a cada quadro; um material que muda depois de entrar no lote (piscar, apagar) tira as malhas dele do lote para sempre. Ficam fora: linhas, pontos, sprites, malhas com vários materiais, `ShaderMaterial`, malhas com `onBeforeCompile`/`onBeforeRender`, esqueletos, morph e espelhadas. Ver [[ADR - Lotes do editor com BatchedMesh]]. |
| **Métrica** | Chrome com GPU (RTX 4070, ANGLE D3D11), Jardim com o mapa inteiro na tela, `renderer.info.render.calls`: **2.701 antes, 350 depois** sem seleção; 377 com uma peça selecionada; 536 com 40; 1.049 com 300. Sem recorte (`drawCount`, teste): jogo 233, editor sem lotes 1.682, editor com lotes 142 (43 lotes com 1.601 malhas). |
| **Trade-off** | A geometria das peças em lote fica em dobro na memória (a cópia no lote e a da peça, que a GPU só recebe se a peça for desenhada à parte). `update()` custa ~1 ms por quadro no Jardim (comparar as matrizes); selecionar ~3 ms, 300 peças ~10 ms. Uma edição põe as malhas novas no lote sem refazê-lo (enquanto houver espaço; senão o lote é refeito com folga de 25%). Sem `WEBGL_multi_draw` o three.js desenha cada pedaço do lote numa chamada (o ganho cai). |
| **Como medir** | `client/tests/editorBatches.test.ts` (chamadas sem recorte, jogo × editor) e, no navegador, `window.__ocEditor.renderer.info.render.calls` (só em desenvolvimento). |

### 9. Custo de carregamento das texturas

`textures.ts` gera o ruído uma vez num canvas 128² e o reaproveita como *pattern*: o comentário diz que loops de `ImageData` por pixel em cada 512² custavam ~10 ms por textura. Ver [[Procedural Textures]] e [[Loading Performance]].

### 10. Detecção de renderização por software

`QualityManager` lê o nome da GPU (`WEBGL_debug_renderer_info`) e marca `software` para SwiftShader, llvmpipe, softpipe, "Basic Render" etc. O menu mostra um aviso. Ver [[Problem - Renderização por software sem GPU]].

## Como medir

- **F3** no jogo: FPS, draw calls, triângulos, ms de simulação e de render, tempo de construção do mapa (meshes e colliders), GPU, preset, pixel ratio e sombras.
- Em `bun run dev`: `window.__oc.perf()` devolve `boot`, `mapBuildMs`, `map.stats`, `simMsAvg`, `renderMsAvg`, `calls`, `tris`.
- Laboratório de personagens: triângulos e draw calls por visual e por peça; `?lod=1|2`. Ver [[Asset Pipeline]].
- PF-35: `bun tools/orcamento.ts`, `bun tools/prints-mapas.ts` e as rotas `/?bench=<mapa>` e `/?bench=galpao` (ver a seção "Detalhe geométrico e orçamentos da PF-35").
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
