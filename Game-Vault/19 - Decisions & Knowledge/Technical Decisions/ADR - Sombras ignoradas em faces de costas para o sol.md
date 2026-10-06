---
title: ADR - Sombras ignoradas em faces de costas para o sol
type: decision
status: documented
area: rendering
source_paths:
  - client/render/renderer.ts
tags:
  - adr
  - rendering
  - shadows
  - shaders
updated: 2026-10-05
---

# ADR - Sombras ignoradas em faces de costas para o sol

## Contexto

O toon do jogo é half-Lambert (segundo o comentário), então faces viradas para longe do sol ainda recebem luz direta. O Three.js renderiza as faces de trás no mapa de sombras (`shadowSide = back`).

## Problema

Essas faces comparavam a profundidade consigo mesmas e ficavam pontilhadas (*shadow acne*), visível em lados grandes e planos como o do caminhão de sorvete.

## Opções consideradas

> [!info]
> O código não registra alternativas (por exemplo, aumentar `bias`/`normalBias` além dos valores atuais, ou trocar o `shadowSide`).

## Decisão

Patch global em `THREE.ShaderChunk.lights_fragment_begin`: só chamar `getShadow` da luz direcional quando `dot(geometryNormal, directLight.direction) > 0`.

## Motivo

"A face turned away from the sun can't receive a cast shadow anyway" (comentário de `patchBackFaceShadows`).

## Consequências

- Some o acne em faces de costas.
- Depende do texto interno de um chunk do Three.js: se mudar numa atualização, o patch é pulado com `console.warn` e o problema volta. Ponto de atenção em upgrades do Three.js.
- Afeta todos os materiais iluminados (toon e standard).

## Código afetado

- `client/render/renderer.ts` (`patchBackFaceShadows`, chamado em `createRenderContext`)

Ver [[Shaders]] e [[Lighting]].
