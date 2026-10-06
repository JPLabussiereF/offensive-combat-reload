---
title: VFX Assets
type: asset
status: documented
area: art
source_paths:
  - client/render/effects.ts
  - client/render/viewmodel.ts
  - client/world/halloween.ts
  - client/world/jardim/luzes.ts
  - client/world/hydrant.ts
  - client/world/oriental.ts
  - client/world/decor.ts
tags:
  - game
  - art
  - vfx
  - assets
updated: 2026-10-05
---

# VFX Assets

## Visão geral

Não há arquivos de VFX (spritesheets, flipbooks, texturas de partícula em disco). Todo efeito é feito de **primitivas sólidas** (cubos, icosaedros, anéis, planos) e de algumas **texturas pintadas em canvas**. Esta nota é o inventário do "conteúdo" dos efeitos; o comportamento está em [[Visual Effects]], [[Particles]] e [[Decals]].

## Texturas

| Asset | Tamanho | Uso |
| --- | --- | --- |
| Furo de bala | 64² | decals de tiro e de explosão (escalado ×9) |
| Estrela de 7 pontas | 64² | clarão do disparo (3 quadrados cruzados) |
| Brilho radial branco | 64² | halos das lanternas (Jardim) |
| Mancha radial branca | 128² | névoa rasteira (Vila) |
| Lua com crateras / halo | 256² | céu da Vila |

Detalhes de pintura em [[Procedural Textures]].

## Formas e cores

| Efeito | Forma | Cor / material |
| --- | --- | --- |
| Faísca | cubo de 2,5 cm | `#fff0a0`, sem luz |
| Detrito | cubo de 3,5–6,5 cm | cor da superfície escurecida (`#9a8f80` concreto, `#9a6a3a` madeira, `#5a4a3a` explosão) |
| Confete | lâmina 7 × 0,8 × 5 cm | 6 cores: rosa `#ff4f9a`, amarelo `#ffd23f`, ciano `#3fd3ff`, verde `#7dff5a`, lilás `#b27dff`, laranja `#ff7a1a` |
| Estrela (cabeça/virilha) | placa 9 × 9 × 2,7 cm | `#ffe14d` |
| Traçante | caixa 2,5 cm × até 6 m | `#ffe28a`, aditivo, 90% |
| Bola de fogo | icosaedro facetado (detalhe 1) | branco quente → amarelo → laranja → fuligem |
| Fumaça | icosaedro toon | cinza 45–75% |
| Anel de choque | anel 0,85–1,0 de raio | `#fff1c4`, 50% |
| Puffs (Vila) | icosaedro (detalhe 0) | cor por emissão (chama, vapor, fumaça) |
| Pedaços de abóbora | icosaedro achatado, toon | cor da abóbora |
| Gotas d'água | icosaedro | `#bfeaff`, 85% |
| Chama do dragão | instanciado | amarelo → vermelho escuro |
| Lanterna do céu | tubo de papel 0,42/0,33 × 0,95 m, aberto, degradê `#ffe0a0` → `#d8742c`, chama `#fff6d8` | sem luz, sem névoa; halo `#ffa046` |
| Nuvem | 4 icosaedros fundidos | toon branco com emissivo `#9fb8cc` |
| Estrelas do céu | `Points` 1,6 px | Vila `#e8e4ff` 85%; Jardim `#fff4dc` 45% |
| Retículos e luzes da arma | esferas, toros, círculos | sem luz (ver [[Weapon Models]]) |

## Código relacionado

- `client/render/effects.ts` (`holeTexture`, `CONFETTI_COLORS`, construtor de `Effects`)
- `client/render/viewmodel.ts` (`flashTexture`)
- `client/world/halloween.ts` (`Puffs`, `Debris`, `nightSky`, `GroundMist`)
- `client/world/jardim/luzes.ts` (`glowTexture`, `SkyLanterns`)
- `client/world/hydrant.ts`, `client/world/oriental.ts` (`FireBreath`), `client/world/decor.ts` (`skyClouds`)

## Ver também

[[Visual Effects]] · [[Particles]] · [[Decals]] · [[Material Palette]] · [[Art Direction]]
