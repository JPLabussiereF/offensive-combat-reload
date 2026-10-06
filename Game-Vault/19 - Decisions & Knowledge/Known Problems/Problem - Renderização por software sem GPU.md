---
title: Problem - Renderização por software sem GPU
type: problem
status: documented
area: rendering
source_paths:
  - client/render/quality.ts
  - client/main.ts
  - docs/MAPAS.md
  - README.md
tags:
  - problem
  - rendering
  - performance
updated: 2026-10-05
---

# Problem - Renderização por software sem GPU

## Sintoma

O jogo roda a ~5–10 FPS mesmo em máquinas boas.

## Causa

O navegador está desenhando WebGL na CPU: aceleração gráfica desligada ou GPU na lista de bloqueio. Renderizadores típicos: SwiftShader, llvmpipe, softpipe, "Microsoft Basic Render".

## Métrica

`docs/MAPAS.md`: ~1.700 FPS com RTX 3070 Ti contra 5–10 FPS por software, no mesmo mapa (medição do autor).

## O que o jogo faz

- `QualityManager` lê o nome da GPU (`WEBGL_debug_renderer_info`) e testa a regex `SOFTWARE_RENDERERS`; se bater, `auto` usa o preset Baixa.
- O menu mostra um aviso (`screens.showGpuWarning`) e o F3 mostra "⚠ SOFTWARE".

## Solução (do lado do usuário)

No Chrome/Edge, ativar "Usar aceleração gráfica quando disponível" em `chrome://settings/system` e reiniciar.

## Limitação

O jogo não consegue resolver sozinho; só detecta e avisa.

## Código afetado

- `client/render/quality.ts` (`SOFTWARE_RENDERERS`, `software`)
- `client/main.ts` (`showGpuWarning`, overlay F3)

Ver [[Performance Rendering]] e [[Troubleshooting]].
