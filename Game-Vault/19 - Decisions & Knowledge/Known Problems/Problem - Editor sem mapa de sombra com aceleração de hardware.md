---
title: Problem - Editor sem mapa de sombra com aceleração de hardware
type: problem
status: resolved
area: rendering
source_paths:
  - client/render/shadows.ts
  - client/render/renderer.ts
  - client/render/quality.ts
  - client/editor/editor.ts
  - client/main.ts
  - client/tests/shadowMap.test.ts
tags:
  - problem
  - rendering
  - editor
updated: 2026-10-07
---

# Problem - Editor sem mapa de sombra com aceleração de hardware

> [!success] Resolvido na PF-6 Revisions 01 (2026-10-07)
> Todo quadro pede o mapa de sombra quando ele ainda não existe (`ensureShadowMap`, em `client/render/shadows.ts`, chamado por `RenderContext.render`), e o laço do editor chama `QualityManager.beforeRender()` como o da partida. Reproduzido e conferido num Chrome com GPU (NVIDIA RTX 4070, ANGLE Direct3D11).

## Sintoma

No editor de mapas ([[ADR - Editor de mapas no jogo]]), com a aceleração de hardware do navegador **ligada**, só apareciam as lanternas, as velas e as lanternas do céu. O chão, as construções e o resto do cenário sumiam (Jardim do Dragão, Vila Assombrada, qualquer mapa). Com a aceleração **desligada** tudo aparecia. Na partida, o mesmo mapa aparecia normal.

## Causa

- O `QualityManager` desliga o `shadowMap.autoUpdate` do three.js: o mapa de sombra do sol só é desenhado quando alguém marca `needsUpdate` ([[Lighting]], sombras sob demanda).
- Quem marcava era só `QualityManager.beforeRender()`, chamado pelo laço da partida (`client/main.ts`). O editor tem laço próprio (`client/editor/editor.ts`) e não chamava: o mapa de sombra **nunca era alocado** (`sun.shadow.map` nulo).
- Todo material iluminado (os `MeshToonMaterial` das superfícies, que recebem sombra) amostra `directionalShadowMap` (`sampler2DShadow`). Sem o mapa, o three.js r186 liga uma textura que não é de profundidade; na GPU (ANGLE) cada desenho falha com `GL_INVALID_OPERATION: glDrawElements: Mismatch between texture format and sampler type (signed/unsigned/float/shadow)` e é descartado. O que não é iluminado (`MeshBasicMaterial`: lanternas, velas, halos) não amostra sombra e aparecia.
- Por software (SwiftShader) não se via: a qualidade `auto` vira `baixa` num renderizador por software, e a `baixa` desliga as sombras ([[Problem - Renderização por software sem GPU]]). Por isso os testes anteriores, num Chrome headless (SwiftShader), não pegaram o defeito.

## Evidência (GPU real, antes da correção)

- Console: centenas de `Mismatch between texture format and sampler type`; contexto WebGL **não** perdido.
- Os desenhos de todo programa com `directionalShadowMap` davam erro 1282 (`INVALID_OPERATION`) e os outros não; `sun.shadow.map` era `null`. Marcando `needsUpdate` uma vez, o mapa inteiro apareceu.
- Descartadas: perda de contexto, falta de memória, limites de uniforms/varyings/texturas, bounding spheres e NaN.

## Correção

- `ensureShadowMap(renderer, sun)` em `RenderContext.render` (todo laço): com sombras ligadas e o sol projetando, pede o mapa se ele falta. O `QualityManager.beforeRender()` ficou só com a cadência (`shadowEvery`).
- `EditorOptions.quality`: o editor chama `beforeRender()` em cada quadro, e a sombra acompanha as peças movidas como na partida.

## Testes

- `client/tests/shadowMap.test.ts` ([[Unit Tests]]).
- Conferido no Chrome com GPU (ANGLE D3D11): Jardim do Dragão e Vila Assombrada no editor desenham tudo, sem erros de GL.

## Observação

O editor desenha cada peça no seu grupo (sem lotes entre peças): no Jardim, cerca de 1.400 malhas estáticas e 1.700 a 2.700 chamadas de desenho por quadro, contra 310 no jogo. Não causa o defeito (a GPU de teste segura) e é o custo de poder selecionar e reconstruir cada peça sozinha. Ver [[Performance Rendering]].
