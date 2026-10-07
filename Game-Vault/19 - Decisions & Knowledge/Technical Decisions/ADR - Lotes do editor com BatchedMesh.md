---
title: ADR - Lotes do editor com BatchedMesh
type: decision
status: documented
area: rendering
source_paths:
  - client/editor/batches.ts
  - client/editor/view.ts
  - client/editor/selection.ts
  - client/editor/editor.ts
  - client/tests/editorBatches.test.ts
tags:
  - decision
  - adr
  - rendering
  - performance
  - editor
updated: 2026-10-07
---

# ADR - Lotes do editor com BatchedMesh

## Contexto

O editor de mapas monta cada peça no seu grupo, sem lotes entre peças, para selecionar e reconstruir uma peça sozinha ([[ADR - Editor de mapas no jogo]]). No Jardim do Dragão isso dava 1.700 a 2.700 chamadas de desenho por quadro, contra 310 no jogo ([[Problem - Editor sem mapa de sombra com aceleração de hardware]], observação). A decisão P46 da PF-6 Revisions 01: as peças que não estão selecionadas nem em edição ficam em lotes como no jogo, para o editor não ficar lento em GPU fraca; só a seleção fica em grupos separados; selecionar tira a peça do lote, desselecionar devolve; o clique continua selecionando.

## Problema

Como desenhar o mapa do editor em lotes sem perder a peça como unidade (seleção, reconstrução de uma peça, pré-visualização do gizmo) e sem refazer o mapa a cada clique?

## Opções consideradas

1. **Montar o que não está selecionado no modo jogo** (lotes do `MapBuilder` por material e célula) e só a seleção no modo editor. Cada seleção ou edição refaria os lotes do mapa inteiro (centenas de milissegundos no Jardim) e as coleções compartilhadas.
2. **Fundir as geometrias por célula** (`mergeGeometries`) depois de montar, refazendo a célula da peça a cada seleção. Precisa refazer buffers grandes a cada clique, e malhas animadas ficam paradas.
3. **`THREE.BatchedMesh`** (escolhida): cada malha das peças fora da seleção vira uma instância num lote por material equivalente e formato de vértice; selecionar é só esconder as instâncias da peça (`setVisibleAt`) e mostrar as malhas dela.

## Decisão

- `EditorBatches` (`client/editor/batches.ts`), dono dos lotes do `MapView`: cada peça montada (ou remontada) entrega as suas malhas; as que dá para copiar entram num `BatchedMesh` por chave = material equivalente (`materialKey`: o tipo e todos os ajustes, cores por valor, texturas por identidade; cada peça cria materiais próprios, como cada lanterna de papel) + atributos de vértice + índice + sombra + `renderOrder`. O lote tem a sua cópia do material.
- As malhas próprias vão para a **camada 31** (nenhuma câmera nem a passada de sombra a desenham) e ficam na cena: o raio da seleção liga todas as camadas, e as caixas de seleção e o "centralizar" continuam medindo a peça. O lote não responde ao raio.
- `setOut(ids)`: a seleção (e tudo dentro dos grupos selecionados) desenha as próprias malhas; as cópias dela ficam escondidas.
- A cada quadro (`update`, ~1 ms no Jardim) as cópias seguem as malhas: matriz do mundo, visibilidade até o grupo da peça, instâncias e cores de malhas instanciadas, vértices (versão dos atributos). Um material que muda depois de entrar no lote (piscar, apagar) é marcado como animado e as malhas dele saem do lote para sempre.
- Peça remontada: as cópias antigas saem e as novas entram no lote já desenhado enquanto houver espaço; sem espaço, o lote é refeito com 25% de folga antes do próximo quadro.
- Ficam fora do lote: linhas, pontos, sprites, malhas com vários materiais, `ShaderMaterial`, malhas com `onBeforeCompile` ou `onBeforeRender` próprios, esqueletos, morph, malhas espelhadas e os marcadores de arame do editor.

## Motivo

Selecionar e desselecionar custam milissegundos (3 ms uma peça, 10 ms 300 peças no Jardim), não uma remontagem; o recorte objeto a objeto do `BatchedMesh` e o `WEBGL_multi_draw` dão uma chamada por lote; o carregador e as peças não mudam (o lote é só desenho), então o que o editor monta continua igual ao jogo.

## Consequências

- Medido no Chrome com GPU (RTX 4070, ANGLE D3D11), Jardim com o mapa inteiro na tela: **2.701 → 350 chamadas por quadro** sem seleção (377 com uma peça, 536 com 40). Sem recorte (teste): jogo 233, editor sem lotes 1.682, com lotes 142. Ver [[Performance Rendering]] (8b).
- A geometria das peças em lote existe duas vezes na memória do navegador (na peça e no lote); a da peça só vai para a GPU se a peça for desenhada sozinha.
- Sem `WEBGL_multi_draw` o three.js desenha cada pedaço de um lote numa chamada: o ganho cai, sem erro.
- O carregamento passou a pôr os marcadores de arame (salas, colisores, luzes, grupos) também nas peças montadas na abertura do mapa (antes só apareciam depois que a peça era remontada).

## Código afetado

- `client/editor/batches.ts` (novo), `client/editor/view.ts` (`batches`, `setOut`, `settle`), `client/editor/selection.ts` (raio em todas as camadas), `client/editor/editor.ts` (a seleção e os grupos selecionados ficam fora do lote).
- Teste: `client/tests/editorBatches.test.ts` ([[Unit Tests]]).

Relacionado: [[ADR - Lotes estáticos por material e célula]] · [[Map Editor UI]] · [[GPU]]
