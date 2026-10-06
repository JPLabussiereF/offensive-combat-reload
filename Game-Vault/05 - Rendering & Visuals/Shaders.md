---
title: Shaders
type: system
status: documented
area: rendering
source_paths:
  - client/render/renderer.ts
  - client/render/effects.ts
  - client/character/material.ts
  - client/world/jardim/luzes.ts
  - client/render/quality.ts
  - client/world/halloween.ts
tags:
  - game
  - rendering
  - shaders
  - glsl
updated: 2026-10-05
---

# Shaders

## Visão geral

O projeto **não tem arquivos de shader próprios** (`.glsl`, `.vert`, `.frag`). Quase tudo usa os materiais prontos do Three.js. As exceções são **três patches** de shader feitos em tempo de execução e **um** `ShaderMaterial` escrito à mão. Encontrados com busca por `ShaderMaterial`, `onBeforeCompile` e `ShaderChunk` em `client/`.

| # | Onde | Tipo | O que faz |
| --- | --- | --- | --- |
| 1 | `render/renderer.ts` (`patchBackFaceShadows`) | troca de texto em `THREE.ShaderChunk.lights_fragment_begin` (global) | só testa sombra do sol se `dot(geometryNormal, directLight.direction) > 0` |
| 2 | `render/effects.ts` (material dos decals) | `onBeforeCompile` | atributo por instância `aFade` multiplica o alfa |
| 3 | `character/material.ts` (`paintedMaterial`) | `onBeforeCompile` + `customProgramCacheKey` | tint por canal e descarte de regiões escondidas |
| 4 | `world/jardim/luzes.ts` (`nightSky`) | `ShaderMaterial` | cúpula do céu noturno do [[Map - Jardim do Dragão]] |

## 1. Sombras em faces de costas (patch global)

O toon do jogo é *half-Lambert* (`dot(N, L) × 0,5 + 0,5`, segundo o comentário), então faces viradas para longe do sol ainda recebem luz direta. Com `shadowSide = back`, essas faces são exatamente as que entram no mapa de sombras, e se comparavam consigo mesmas, gerando *shadow acne* (pontilhado) em lados grandes e planos, como o do caminhão de sorvete. O patch acrescenta a condição `dot(geometryNormal, directLight.direction) > 0.0` antes de `getShadow(...)`.

- É aplicado uma vez, em `createRenderContext`, e afeta **todos** os materiais iluminados (toon e standard).
- Se o trecho procurado mudar numa versão futura do Three.js, o patch é pulado com o aviso `[render] lights_fragment_begin changed; back-face shadow patch skipped`.
- Decisão registrada em [[ADR - Sombras ignoradas em faces de costas para o sol]].

## 2. Fade por instância dos decals

O material base é `MeshBasicMaterial` (textura do furo, transparente). O patch declara `attribute float aFade` no vertex shader, passa como `varying vFade` e faz `diffuseColor.a *= vFade` depois de `#include <map_fragment>`. Assim cada marca some no seu tempo e todas continuam em **uma** chamada de desenho. Ver [[Decals]].

## 3. Material pintado dos personagens

Base `MeshStandardMaterial` com flat shading. O patch:

- lê dois atributos por vértice, `_tint` e `_region`;
- **regiões escondidas:** `uHidden` é uma máscara de bits; se o bit da região do vértice estiver ligado (e a região for menor que 31), o fragmento é descartado (`discard`). É assim que a pele some debaixo da roupa e o membro ausente some no modo PCD, sem editar geometria;
- **tint:** faces com `tint > 0` usam o canal vermelho da linha neutra do atlas multiplicado por `uTints[tint]` (8 cores: nenhuma, primária, secundária, detalhe, pele, cabelo, olhos, equipe). O degradê e a oclusão ficam; só o matiz muda;
- `customProgramCacheKey` = `char|p` (paleta), `char|b` (bakeado) ou `char|t` (textura própria de GLB): todas as instâncias com as mesmas opções compartilham o programa.

Ver [[Character Models]] e [[Material Palette]].

## 4. Céu do Jardim do Dragão

Esfera de raio 330 com `side: BackSide`, `fog: false`, `depthWrite: false`, que segue a câmera. O fragment shader mistura quatro cores por altura da direção de visão: `horizon 0x2a1812` → `mid 0x0b0a15` → `top 0x040509`, soma um brilho quente `glow 0x4a2410` perto do horizonte ("a névoa iluminada pelas lanternas") e escurece abaixo do horizonte. Termina com `#include <colorspace_fragment>`.

A [[Map - Vila Assombrada]] faz um céu parecido **sem** shader próprio: cúpula com cores por vértice (`MeshBasicMaterial` com `vertexColors`). Ver [[Visual Effects]].

## Recompilação de shaders (cuidados no código)

- Ligar/desligar sombras muda os *defines* dos materiais: `QualityManager.applyShadows()` percorre a cena e marca `material.needsUpdate = true` em todos (uma recompilação por material).
- O número de luzes faz parte do programa de shader no Three.js; por isso as luzes noturnas são um **pool fixo** criado no carregamento ([[ADR - Pool fixo de luzes reais]]).
- Trocar a textura de uma superfície pelo manifesto (`loadTextureOverrides`) marca `needsUpdate` no material afetado.

## Código relacionado

- `client/render/renderer.ts` (`patchBackFaceShadows`)
- `client/render/effects.ts` (construtor de `Effects`)
- `client/character/material.ts` (`paintedMaterial`, `bakedMaterial`)
- `client/world/jardim/luzes.ts` (`nightSky`)
- `client/render/quality.ts` (`applyShadows`)

## Ver também

[[Materials]] · [[Lighting]] · [[Rendering Overview]]
