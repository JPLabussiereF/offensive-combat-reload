---
title: ADR - Qualidade automática com resolução dinâmica
type: decision
status: documented
area: rendering
source_paths:
  - client/render/quality.ts
  - client/render/renderer.ts
  - client/core/settings.ts
  - client/main.ts
  - README.md
tags:
  - adr
  - rendering
  - performance
  - gpu
updated: 2026-10-08
---

# ADR - Qualidade automática com resolução dinâmica

## Contexto

O jogo roda em navegadores de PC (GPU dedicada ou integrada), celulares e até renderizadores por software.

## Problema

Um preset fixo é pesado demais para aparelhos fracos ou desperdiça qualidade nos fortes; o jogador não deveria precisar ajustar gráficos.

## Opções consideradas

- Só presets manuais (`baixa`, `media`, `alta`): mantidos.
- Modo `auto` adaptativo: escolhido como padrão (`settings.quality = 'auto'`).

## Decisão

`QualityManager`:

- `auto` começa em Média no desktop, num preset leve no celular (DPR 1,25, sem sombras) ou em Baixa por software.
- Mede o FPS a cada 1 s: abaixo de 45, reduz a escala de resolução em 0,15 até 0,5; já no mínimo, desliga as sombras. Acima de 57 por 3 s seguidos, sobe 0,1 até 1.
- Celular que segura 57+ FPS em resolução cheia por 10 s ganha sombras **uma vez**.
- Mapa de sombras com `autoUpdate = false`, atualizado a cada 1/2/4 quadros (Alta/Média/Baixa), porque "o mapa é estático; só personagens se movem".

## Motivo

Comentários em `quality.ts` e em `renderer.ts` ("Integrated GPUs choke on 2x+ DPR at full screen"); README: "Os gráficos começam leves (sem sombras) e melhoram sozinhos se o aparelho aguentar 60 FPS".

## Consequências

- A imagem pode ficar mais borrada sob carga (escala até 50%).
- Ligar/desligar sombras recompila todos os materiais (engasgo pontual).
- Só ajusta durante o jogo (ponteiro travado).
- Sombras de personagens podem atrasar 1 a 3 quadros nos presets mais baixos.

## Código afetado

- `client/render/quality.ts` (`PRESETS`, `MOBILE`, `SOFTWARE_RENDERERS`, `QualityManager`)
- `client/main.ts` (`quality.beforeRender`, `quality.update`)

Ver [[Performance Rendering]], [[Settings]] e [[Problem - Renderização por software sem GPU]].

> [!info] Extensão (PF-35)
> Os presets continuam só com resolução e sombras. O quanto de geometria o mapa monta virou uma opção à parte, "Detalhe dos objetos: Normal / Leve" (Leve por padrão no celular e com renderização por software, lida ao montar o mapa): [[ADR - Detalhe geométrico Normal e Leve]].
