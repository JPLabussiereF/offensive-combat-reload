---
title: Material Palette
type: reference
status: documented
area: art
source_paths:
  - client/render/materials.ts
  - client/world/halloween.ts
  - client/world/oriental.ts
  - client/render/weaponModels.ts
  - client/render/effects.ts
  - shared/palette.ts
  - client/character/palette.ts
  - client/styles.css
tags:
  - game
  - art
  - palette
  - colors
updated: 2026-10-05
---

# Material Palette

## Visão geral

As cores do jogo vivem em constantes TypeScript, não em arquivos de material. Há **paletas de cenário** (usadas como tint por vértice sobre as superfícies, ver [[Materials]]), a **paleta de personagens** (famílias fechadas, compartilhadas com o servidor) e as **pinturas das armas**.

## Paletas de cenário

### `PALETTE` (`render/materials.ts`) — dia, Rua dos Vizinhos e geral

| Nome | Hex | Nome | Hex |
| --- | --- | --- | --- |
| grass | `#7cc750` | glass | `#9fd8ff` |
| asphalt | `#6d7078` | foliage | `#4fa83a` |
| sidewalk | `#c9c4b8` | trunk | `#7a5230` |
| brick | `#c8663d` | flamingo | `#ff6fb5` |
| house | `#f1e3c2` | truck | `#ffd1e8` |
| houseAlt | `#bfe0e8` | truckTrim | `#ff4f9a` |
| houseAlt2 | `#f4c7d0` | carRed | `#e0463c` |
| floor | `#b99a74` | carYellow | `#f2c230` |
| roof | `#8e4b3a` | carGreen | `#3fae6a` |
| wood | `#b07a45` | metal | `#8c96a3` |
| concrete | `#a9a9a4` | skin | `#f2b58f` |
| poolTile | `#7fd3e6` | sleeve | `#55733a` |
| **teamA** | `#ff7a1a` | **teamB** | `#2f9bff` |

### `SPOOKY` (`halloween.ts`) — Vila Assombrada

grass `#5b6640`, grassDark `#48522f`, dirt `#5e4a35`, path `#7a6e5e`, stone `#9a968e`, stoneDark `#66635e`, moss `#5f6b4a`, wood `#6b4a32`, woodDark `#3f2a1e`, plank `#8a6a4a`, iron `#26242c`, roof `#3a3442`, roofRed `#5a2a2e`, wine `#6e2f3a`, mansion `#6a5560`, trim `#cfc6b0`, pumpkin `#f07a1a`, stem `#4a5a2a`, purple `#6a3a9a`, hedge `#2f4a2a`, asphalt `#45474e`, candle `#ffc861`, window `#ffb347`.

### `ORIENTAL` (`oriental.ts`) — Jardim do Dragão

plaster `#f3eee2`, lacquer `#c0352b`, lacquerDark `#8a2a22`, wood `#8a5432`, woodDark `#5a3420`, beam `#2f7f78` (vigas pintadas sob o beiral), gold `#e7b847`, roof `#5d6575`, roofDark `#3a3f4b`, stone `#c9c3b6`, stoneDark `#8f8a80`, rock `#a6a69e`, floor `#c49a6c`, paper `#ffffff`.

> [!info]
> Os setores do jardim têm ainda uma paleta local `C` em `client/world/jardim/kit.ts` (não detalhada aqui).

## Paleta de personagens (`shared/palette.ts`)

Famílias do guia de estilo. O servidor encaixa toda cor salva nelas (`snap`).

| Família | Cores |
| --- | --- |
| `skin` | 8 tons, de `#f3d4c0` a `#4e2c1b` |
| `hair` | 16: preto, expresso, castanhos, loiros, ruivo, cinza, e fantasia (vermelho, azul, verde, roxo, rosa, platinado) |
| `metal` | aço `#9aa3aa`, latão `#b8923e`, bronze `#8c5e34`, metal pintado `#4f5536`, aço escuro `#4a4f55`, gunmetal `#2e3236` |
| `fabricNeutral` | preto `#1f2226`, grafite, cinza, off-white `#e8e2d6`, bege, cáqui |
| `fabricEarth` | oliva `#5c6435`, musgo, marrom, caramelo, ferrugem, mostarda |
| `fabricCold` | marinho `#1f2a44`, denim, petróleo, vinho, roxo escuro |
| `leather` | 5 couros + borracha e borracha cinza |
| `accent` | laranja `#e0702a`, amarelo `#e6c23a`, vermelho `#c0392f`, turquesa `#2fb0a8`, lima `#9ccb3b` |

Íris (fora das famílias): 8 cores (`EYE_COLORS`).

**Regra de saturação:** no máximo ~15% do personagem em cor saturada; a primária das peças grandes só aceita tecidos e couros.

### Atlas de paleta (`client/character/palette.ts`)

Textura 256 × 256 com células de 16 × 16 px, cada uma um degradê vertical curto (~10% mais escuro embaixo). Linha 0 = valores neutros (1,0 descendo 0,06 por coluna até 0,1), usados pelas faces com tint; depois uma linha por família, e uma linha `special` (branco do olho, brilho, pupila, dentes, lentes escura e clara, boca). Cada face tem a UV colapsada num ponto da célula: faces para cima amostram o topo, para baixo a base ("oclusão falsa de graça"). Ver [[Character Models]].

## Pinturas das armas (`LOOKS` em `weaponModels.ts`)

| Pintura | metal | escuro | coronha/guarda-mão | faixa | óptica |
| --- | --- | --- | --- | --- | --- |
| `padrao` | `#3a3f47` | `#24272c` | `#6b5a45` | teamA | `#2a2d33` |
| `fita` | `#3a3f47` | `#24272c` | `#5d5347` | teamA | `#2a2d33` |
| `tia` | `#e9e4ee` | `#6b4a6e` | `#ff8fc8` | `#7fe0c8` | `#8a5a8e` |
| `natal` | `#3a3f47` | `#24272c` | `#c0392b` | `#2e8b57` | `#2a2d33` |
| `chamas` | `#1f1f23` | `#141417` | `#2b2b30` | `#ff6a1a` | `#1a1a1e` |
| `vovo` | `#2d3440` | `#1e232b` | `#8a4f25` | `#c8a24a` | `#c8a24a` |
| `ouro` | `#f2c230` | `#b8860b` | `#d9a520` | `#fff1a8` | `#e0b020` |

## Cores de efeitos

Confete: `#ff4f9a`, `#ffd23f`, `#3fd3ff`, `#7dff5a`, `#b27dff`, `#ff7a1a`. Faísca `#fff0a0`, estrela `#ffe14d`, traçante `#ffe28a`. Ver [[VFX Assets]].

## UI

Variáveis CSS (`client/styles.css`): `--ink #1b1530`, `--paper #fff8ec`, `--team-a #ff7a1a`, `--team-b #2f9bff`, `--good #7dff5a`, `--warn #ffd23f`, `--bad #ff4a3d`. Ver [[UI Assets]].

## Código relacionado

- `client/render/materials.ts` (`PALETTE`)
- `client/world/halloween.ts` (`SPOOKY`), `client/world/oriental.ts` (`ORIENTAL`)
- `shared/palette.ts` (`FAMILIES`, `snap`, `CLOTH_COLORS`, `ALL_ITEM_COLORS`)
- `client/character/palette.ts` (atlas, `TINT`, `NEUTRAL_VALUES`)
- `client/render/weaponModels.ts` (`LOOKS`)

## Ver também

[[Materials]] · [[Art Direction]] · [[Character Customization]] · [[Constants Reference]]
