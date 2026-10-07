---
title: Lighting
type: system
status: documented
area: rendering
source_paths:
  - client/render/renderer.ts
  - client/render/quality.ts
  - client/render/effects.ts
  - client/world/halloween.ts
  - shared/data/mapas/halloween.json
  - client/world/jardim/luzes.ts
  - shared/data/mapas/jardim.json
  - client/world/mapBuilder.ts
  - client/main.ts
  - client/ui/customize.ts
  - docs/MAPAS.md
tags:
  - game
  - rendering
  - lighting
  - shadows
updated: 2026-10-06
---

# Lighting

## Visão geral

A iluminação é simples e quase toda dinâmica: **uma luz hemisférica** (ambiente céu/chão), **um sol direcional** (a única luz que projeta sombra) e, nos mapas noturnos, um **número fixo de luzes pontuais** redistribuído entre os pontos de luz mais próximos da câmera. O viewmodel tem suas próprias duas luzes. Não há lightmaps nem ambient occlusion em tela; a "luz embutida" que existe vem de cores por vértice.

## Luzes da cena

### Padrão (dia ensolarado, `createRenderContext`)

| Luz | Cor | Intensidade | Outros |
| --- | --- | --- | --- |
| `HemisphereLight` | céu `0xcfeeff`, chão `0x6b8f4a` | 1,4 | — |
| `DirectionalLight` (sol) | `0xfff1d6` | 2,2 | posição (−30, 45, 20), alvo na origem, `castShadow` |
| Fundo | `0x6ec3ff` | — | — |
| Névoa | `0xa9dcff` | — | linear, 70 a 180 m |

### Viewmodel (cena separada)

| Luz | Cor | Intensidade |
| --- | --- | --- |
| `vmHemi` | `0xe8f6ff` / `0x5a6a48` | 1,6 |
| `vmSun` | `0xfff1d6`, posição (−1, 2, 1,5) | 1,8 |

As luzes do viewmodel seguem o clima do mapa (campo `viewmodel` da `Atmosphere`), para a arma não parecer "de dia" num mapa noturno.

### Por mapa (`Atmosphere`)

| Campo | [[Map - Jardim do Dragão]] (`NIGHT`) | [[Map - Vila Assombrada]] |
| --- | --- | --- |
| Fundo | `0x05060c` | `0x120f26` |
| Névoa | `0x1c1418`, 40–165 m | `0x2e2648`, 55–210 m |
| Hemi | céu `0x8a82b8`, chão `0x8a5a3a`, 1,6 | céu `0xbab6f2`, chão `0x625668`, 2,3 |
| Sol | `0xffc080`, 1,2, de (15, 60, 25) ("luz das lanternas no céu") | `0xd2daff`, 2,0, de `MOON` (45, 62, −38) (luar) |
| Viewmodel | hemi 1,45, sol 1,15, `0xffc088` | hemi 1,6, sol 1,6, `0xd2daff` |

[[Map - Rua dos Vizinhos]] e [[Map - Arena Teste (glTF)]] usam o padrão.

## Sombras

- Tipo `PCFShadowMap`; só o sol projeta. Mapa de sombras de 2048² na criação, depois definido pelo preset de qualidade (512 / 1024 / 2048).
- Câmera de sombra ortográfica padrão: ±48 m em X, ±40 m em Y, near 5, far 120; `bias −0.0006`, `normalBias 0.05`.
- Mapas grandes informam `shadowExtent`; `main.ts` então usa ±`shadowExtent` e far 150: Jardim do Dragão **57 m** (`W + 12`, com `W = 45`), Vila Assombrada **84 m** (`max(60, 55) + 24`).
- O mapa de sombras **não** é atualizado automaticamente (`shadowMap.autoUpdate = false`): `QualityManager.beforeRender()` marca `needsUpdate` a cada `shadowEvery` quadros (1 na Alta, 2 na Média, 4 na Baixa; 3 no celular), ou imediatamente quando ainda não existe. Motivo no código: "o mapa é estático; só personagens se movem". Ver [[ADR - Qualidade automática com resolução dinâmica]].
- Lotes estáticos recebem sombra; peças marcadas `castShadow: false` (molduras de portas, por exemplo) não projetam. Personagens, armas na mão, granadas e minas projetam.
- Faces de costas para o sol não testam sombra (patch no shader). Ver [[ADR - Sombras ignoradas em faces de costas para o sol]].

## Luzes pontuais dinâmicas

| Luz | Onde | Parâmetros | Duração |
| --- | --- | --- | --- |
| Clarão do disparo (`muzzleLight`) | `effects.ts` | `0xffc36b`, alcance 9 m, decay 2, pico 30 | 0,05 s, linear |
| Clarão da explosão (`boomLight`) | `effects.ts` | `0xffa640`, alcance 22 m, decay 2, pico 400 | 0,25 s, linear |
| `LightPool` | Vila Assombrada (`new LightPool(scene, 10)`; padrão 8) | `PointLight` com alcance do ponto, decay 1,6 | contínuo |
| `LanternLights` | Jardim do Dragão (`LIGHTS = 6`) | `0xffa24e`, alcance 10 m, decay 1,7, intensidade 4,5 | contínuo |

### Como o pool funciona

Os mapas registram muitos **pontos de luz** (`LightSpot`: velas, lampiões, fogueira, lanternas) mas criam só N luzes reais:

1. A cada 0,2 s (Vila) ou 0,25 s (Jardim), os pontos são ordenados pela distância à câmera (na Vila, `distância − 0,4 × alcance`, para luzes grandes contarem como mais perto; pontos apagados ou além de `alcance + 14 m` ficam fora).
2. Uma luz que continua entre as N mais próximas mantém o seu ponto; as outras pegam os novos.
3. A luz entra com fade (4/s na Vila, 2,5/s no Jardim) e tremula (`flicker` por ponto na Vila; 0,92–1,0 no Jardim).

Como o número de luzes nunca muda, os shaders nunca recompilam e o custo não cresce com o número de velas. Lampiões apagados a tiro saem da lista (`on()`). Ver [[ADR - Pool fixo de luzes reais]].

## Luz "pintada" (sem custo de iluminação)

- **Atributo `shade`:** `MapBuilder.addGeometry` multiplica o tint de cada vértice por `shade` (1 ou 3 floats). É usado para luz e oclusão embutidas na folhagem do Jardim do Dragão (mais escura embaixo).
- **Glow:** janelas acesas, velas, rostos de abóbora, núcleos de lanternas são `MeshBasicMaterial` (não recebem luz) fundidos num mesh. Halos são `Points` com textura radial e blending aditivo. Ver [[Visual Effects]].
- **Personagens:** a oclusão vem da cor de vértice (AO) e do degradê vertical das células do atlas de paleta. Ver [[Character Models]].

## O que não existe

- Lightmaps: previstos no documento de design (seção 10, segundo `docs/MAPAS.md`), mas "o suporte do lado do jogo ainda não está pronto". Nenhum código lê um segundo canal de UV.
- Ambient occlusion em tela (SSAO), luz volumétrica, environment map/IBL: nada disso aparece no código. Ver [[Post Processing]].

## Iluminação do editor de personagem

O palco do editor (`client/ui/customize.ts`) tem renderizador próprio, com hemi `0xc4d8ff`/`0x5a4c40` 1,6, sol `0xffe2bd` 2,8 e uma luz de recorte `0x9db8ff` 0,8. Ver [[Character Customization]].

## Código relacionado

- `client/render/renderer.ts` (`createRenderContext`, `applyAtmosphere`, `Atmosphere`)
- `client/render/quality.ts` (`beforeRender`, `applyShadows`)
- `client/render/effects.ts` (`muzzleLight`, `boomLight`)
- `client/world/halloween.ts` (`LightSpot`, `LightPool`)
- `client/world/jardim/luzes.ts` (`NIGHT`, `LanternLights`)
- `client/main.ts` (aplicação de `atmosphere` e `shadowExtent`)
