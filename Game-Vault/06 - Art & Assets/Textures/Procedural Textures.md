---
title: Procedural Textures
type: asset
status: documented
area: art
source_paths:
  - client/world/textures.ts
  - client/world/surfaces.ts
  - client/render/effects.ts
  - client/render/viewmodel.ts
  - client/world/halloween.ts
  - client/world/jardim/luzes.ts
  - public/textures/manifest.json
tags:
  - game
  - art
  - textures
  - procedural
updated: 2026-10-05
---

# Procedural Textures

## Visão geral

Não há arquivos de imagem de textura no projeto (`public/textures/` só tem o `manifest.json`). Todas as texturas são **pintadas em canvas 2D no carregamento**. As da biblioteca de superfícies são *placeholders* "pintados à mão" (comentário de `textures.ts`), pensados para serem trocados por arte real pelo manifesto. Como são aplicadas: [[Texture System]].

## Regras comuns dos pintores (`textures.ts`)

- **Tamanho:** 512 × 512 (`SIZE`), uma por superfície, em cache.
- **Determinismo:** PRNG `mulberry32` com semente derivada do nome da superfície; a textura é igual em todo carregamento.
- **Repetição perfeita:** `wrapRect` e os laços com deslocamento de ±tamanho desenham cada forma também do outro lado da borda.
- **Valores claros, quase cinza:** o tint por vértice dá o matiz (uma textura de tijolo serve para tijolo vermelho, amarelo ou branco). Exceção: `papel`, pintado nas cores finais.
- **Granulação:** um ladrilho de ruído de 128² gerado uma vez e aplicado como *pattern* em modo `overlay` (`grain`), em vez de loop por pixel (o comentário cita ~10 ms economizados por textura).
- **Manchas:** `blotches` (círculos claros e escuros semitransparentes).

## Os 19 pintores

| Pintor | Aparência |
| --- | --- |
| `tijolo` | aparelho corrido, 8 fiadas × 4 tijolos por ladrilho, argamassa clara, luz no topo de cada tijolo |
| `reboco` | lambri horizontal (8 tábuas com degradê e sombra embaixo), apesar do nome |
| `madeira` | 5 tábuas verticais com frestas, veios em curva e nós |
| `piso` | assoalho: 6 fileiras de tábuas horizontais com emendas desencontradas |
| `telhado` | telhas arredondadas em fileiras deslocadas (8 × 8) |
| `concreto` | manchas suaves e uma junta |
| `calcada` | 2 × 2 placas com juntas e uma rachadura |
| `asfalto` | manchas e 2.600 pontinhos claros e escuros |
| `grama` | manchas e 1.800 folhinhas em traços curtos |
| `folhagem` | tapete de folhas em 3 camadas (650, 560 e 420 folhas, mais escuras atrás), cada uma com sombra e nervura clara |
| `feno` | 1.400 palhas curtas em várias direções |
| `tecido` | trama fina (64 fios por eixo) com manchas suaves |
| `casca` | 70 fissuras onduladas verticais entre cristas claras (períodos inteiros para emendar) |
| `azulejo` | 8 × 8 pastilhas com rejunte e brilho |
| `metal` | painel com degradê, bordas e 6 rebites |
| `lataria` | pintura de carro brilhante: 1 ladrilho = 2 m de altura; faixa escura da soleira, reflexo do horizonte logo abaixo da linha de cintura (~0,85 m), painéis superiores claros |
| `papel` | shoji: papel de arroz creme `#f7f1e3` com fibras, treliça marrom `#6e4428` de 6 × 4 células (30 × 45 cm) com borda iluminada |
| `pedra` | lajotas irregulares em 4 fiadas, juntas escuras, cantos arredondados |
| `vidro` | cinza claro com um reflexo diagonal |

A superfície `pintura` não tem pintor (cor lisa).

## Outras texturas procedurais

| Textura | Tamanho | Aparência | Fonte |
| --- | --- | --- | --- |
| Furo de bala | 64² | degradê radial marrom-escuro até transparente | `effects.ts` `holeTexture` |
| Clarão do disparo | 64² | estrela de 7 pontas, branco → amarelo → laranja transparente | `viewmodel.ts` `flashTexture` |
| Brilho radial | 64² | branco no centro sumindo nas bordas (tingido pelo material) | `jardim/luzes.ts` `glowTexture` |
| Lua | 256² | disco creme `#fff4d6` com 6 crateras | `halloween.ts` |
| Halo da lua | 256² | degradê creme → lilás → transparente | `halloween.ts` |
| Névoa | 128² | mancha radial branca | `halloween.ts` `GroundMist` |
| Placas, epitáfios, inscrições, pinturas | variável | texto e desenho em canvas | `canvasTexture`, `kit.ts` (`plaque`, `inscription`, `painting`) |
| Atlas de paleta (personagens) | 256² | células 16 × 16 com degradê vertical | `character/palette.ts` ([[Material Palette]]) |

## Código relacionado

- `client/world/textures.ts` (`PAINTERS`, `paintTexture`, `mulberry32`, `grain`, `blotches`, `wrapRect`)
- `client/world/surfaces.ts` (`SURFACES[key].painter`)
- `client/world/halloween.ts` (`canvasTexture`)

## Ver também

[[Texture System]] · [[Material Palette]] · [[Art Direction]] · [[ADR - Texturas procedurais claras tingidas por vértice]]
