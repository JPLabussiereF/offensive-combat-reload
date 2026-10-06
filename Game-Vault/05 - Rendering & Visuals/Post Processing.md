---
title: Post Processing
type: system
status: unknown
area: rendering
source_paths:
  - client/render/renderer.ts
  - client/main.ts
  - client/styles.css
  - package.json
tags:
  - game
  - rendering
  - post-processing
updated: 2026-10-05
---

# Post Processing

> [!warning] Não existe no código atual
> Verificado com busca por `EffectComposer`, `RenderPass`, `postprocessing`, `UnrealBloom`, `OutlinePass` e `toneMapping` em `client/`, `shared/` e `package.json`: nenhum resultado. O renderizador desenha direto no canvas (`renderer.render(scene, camera)` e `renderer.render(vmScene, vmCamera)` em `client/render/renderer.ts`).

## O que existe no lugar

| Necessidade | Como é resolvida hoje | Nota |
| --- | --- | --- |
| Anti-aliasing | MSAA do contexto WebGL (`antialias: true`) | [[Rendering Overview]] |
| Cor final | saída em sRGB (`outputColorSpace = SRGBColorSpace`), sem tone mapping | [[Rendering Overview]] |
| Profundidade atmosférica | névoa linear (`THREE.Fog`) por mapa | [[Lighting]] |
| Brilho (bloom) | geometria sem luz (`MeshBasicMaterial`) e halos aditivos (`Points` com textura radial) | [[Visual Effects]] |
| Luneta | overlay HTML/CSS (`#scope`) sobre o canvas | [[Camera]], [[HUD]] |
| Vinheta de dano / vida baixa | `#vignette` em CSS (degradê radial vermelho; opacidade por `--low` e flash por `--hit`) | [[HUD]] |
| Arma sem atravessar paredes | segunda passada com `clearDepth()` | [[ADR - Viewmodel em cena e câmera próprias]] |

> [!info] Inferência
> A ausência combina com as metas de desempenho declaradas (rodar em GPUs integradas e celulares, ver [[Performance Rendering]]), mas o código não registra uma decisão explícita contra pós-processamento.

## Código relacionado

- `client/render/renderer.ts` (`render()`)
- `client/styles.css` (`#scope`)
