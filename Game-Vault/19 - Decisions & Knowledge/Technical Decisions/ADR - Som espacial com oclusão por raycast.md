---
title: ADR - Som espacial com oclusão por raycast
type: decision
status: documented
area: audio
source_paths:
  - client/audio/spatial.ts
  - client/audio/sfx.ts
  - client/main.ts
  - client/core/settings.ts
  - client/tests/spatial.test.ts
tags:
  - game
  - audio
  - spatial
  - decision
updated: 2026-10-05
---

# ADR - Som espacial com oclusão por raycast

## Contexto

Num FPS, ouvir de onde vêm tiros e passos é informação tática. Os mapas têm muitos ambientes fechados (casas de dois andares, mansão, porão, esgoto) e paredes finas de materiais diferentes (paredes de papel no Jardim do Dragão, que balas atravessam).

## Problema

Um `PannerNode` sozinho dá direção e distância, mas não sabe de paredes: um tiro do outro lado de um muro soaria igual a um em linha de visão. Também é preciso funcionar bem em fone e em alto-falante de celular.

## Opções consideradas

- Apenas panner com distância (sem oclusão nem eco).
- **Oclusão e eco calculados com o próprio motor de física (Rapier) + matemática pura testável** (escolhida).
- *Inferência*: soluções de propagação mais caras (caminhos de som, portais) não aparecem no código.

## Decisão

- Cada som do mundo passa por uma cadeia própria: ganho de oclusão → low-pass (ar + paredes) → `PannerNode` → master, com envios para dois convolvers sintéticos (sala curta e cauda ao ar livre).
- A **oclusão** é medida com dois raycasts (ouvido→som e som→ouvido) contra colisores do mundo; o peso depende do **material da superfície** (`OCCLUSION_WEIGHT`: papel 0,25, vidro 0,35, madeira 0,7, demais 1).
- O **eco** depende de quão fechado é o ponto (`Enclosure`: 1 raio para o teto + 6 horizontais), com cache por célula de 2 m.
- Uma parede **nunca silencia** o som (ganho mínimo 0,2).
- Toda a matemática fica em `client/audio/spatial.ts`, "livre de Web Audio e física para poder ser testada" (comentário do arquivo), com testes em `client/tests/spatial.test.ts`.
- Modo **HRTF** para fone e **equalpower** (estéreo) para caixa; "auto" escolhe estéreo em celulares ("mais leve, e muitas vezes tocado no alto-falante", comentário em `settings.ts`).

## Motivo

- Reaproveita a geometria de colisão e os materiais de superfície que já existem para passos, impactos e penetração de balas.
- Mantém informação tática ("você ainda ouve a briga no cômodo ao lado") sem esconder sons.
- Testável sem navegador.

## Consequências

- Custo de raycasts por som tocado e por loop a cada 0,2 s; limite de 36 vozes com prioridade (passos e ambiente caem primeiro).
- O cache de fechamento assume mapa estático; objetos móveis e portas não entram no cálculo.
- Passos de outros jogadores são deduzidos localmente do movimento replicado (`BodySounds`), sem tráfego de rede extra.

## Código afetado

- `client/audio/spatial.ts`, `client/audio/sfx.ts`
- `client/main.ts` (`sfx.setWorld`, `soundCast`, `occluder`, `playBody`)
- `client/core/settings.ts` (`spatialAudio`, `spatialMode`)

Ver [[Spatial Audio]].
