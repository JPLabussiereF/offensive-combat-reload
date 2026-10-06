---
title: Decals
type: system
status: documented
area: rendering
source_paths:
  - client/render/effects.ts
  - client/main.ts
tags:
  - game
  - rendering
  - decals
  - vfx
updated: 2026-10-05
---

# Decals

## Visão geral

Marcas de bala e de explosão nas superfícies do mapa. São quadrados com a textura de um furo, colados sobre o ponto de impacto, todos num **único `InstancedMesh`** (uma chamada de desenho). Não são decals projetados (sem `DecalGeometry`): cada marca é um plano plano alinhado à normal.

## Regras

| Parâmetro | Valor | Constante |
| --- | --- | --- |
| Máximo de marcas ao mesmo tempo | 160 | `MAX_DECALS` |
| Tamanho base do plano | 0,13 × 0,13 m | `PlaneGeometry(0.13, 0.13)` |
| Escala aleatória | 0,8 a 1,3 × `size` | `decal()` |
| Vida de um furo de bala | 14 s | `DECAL_LIFE` |
| Vida da marca de explosão | 24 s, `size = 9` (≈ 1,2 m) | `SCORCH_LIFE` |
| Desaparecimento | 4 s de fade depois da vida | `DECAL_FADE` |
| Afastamento da superfície | 4 mm ao longo da normal | `decal()` |

- Cada marca recebe uma rotação aleatória em torno da normal (variação visual).
- **Buffer circular:** o cursor avança a cada marca; a 161ª sobrescreve a mais antiga, mesmo que ainda visível.
- Marcas totalmente apagadas recebem matriz de escala zero e deixam de custar fill-rate.

## Quando aparecem

| Evento | Marca | Onde no código |
| --- | --- | --- |
| Tiro local acerta o mapa | um furo no ponto, com detritos e faíscas | `main.ts` (ramo `else` do acerto) |
| Tiro local atravessa madeira/vidro/papel | furo de entrada **e** de saída | `main.ts` (laço `through`) |
| Explosão com chão a até 1,5 m | marca de queimado (`size 9`, 24 s) + anel de choque | `Effects.explosion` |

> [!note]
> Pelo código de `conn.on('shot')` em `main.ts`, tiros de **outros jogadores** online mostram só o traçante e o som; não criam furos locais. Personagens nunca recebem decal (acertos neles geram confete/estrelas, ver [[Particles]]).

## Implementação

- Material: `MeshBasicMaterial` com `map: holeTexture()` (canvas 64×64, degradê radial marrom-escuro até transparente), `transparent`, `depthWrite: false`, `polygonOffset` com fator −4.
- Fade individual: atributo instanciado `aFade` (0..1) injetado no shader por `onBeforeCompile`, que multiplica o alfa. Ver [[Shaders]].
- `frustumCulled = false`: o mesh de instâncias é sempre enviado à GPU (as instâncias estão espalhadas pelo mapa inteiro).

## Código relacionado

- `client/render/effects.ts` (`Effects.decal`, `Effects.update`, `holeTexture`)
- `client/main.ts` (chamadas a `effects.decal`)

## Ver também

[[Particles]] · [[Visual Effects]] · [[Combat]] · [[VFX Assets]] · [[Performance Rendering]]
