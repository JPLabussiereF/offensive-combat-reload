---
title: Decals
type: system
status: documented
area: rendering
source_paths:
  - client/render/effects.ts
  - client/main.ts
  - client/weapons/remoteImpact.ts
tags:
  - game
  - rendering
  - decals
  - vfx
updated: 2026-10-08
---

# Decals

## Visão geral

Marcas de bala e de explosão nas superfícies do mapa. São quadrados com a textura de um furo, colados sobre o ponto de impacto, todos num **único `InstancedMesh`** (uma chamada de desenho). Não são decals projetados (sem `DecalGeometry`): cada marca é um plano plano alinhado à normal.

## Regras

| Parâmetro | Valor | Constante |
| --- | --- | --- |
| Máximo de marcas ao mesmo tempo | 384 (eram 160 até a PF-5) | `MAX_DECALS` |
| Tamanho base do plano | 0,13 × 0,13 m | `PlaneGeometry(0.13, 0.13)` |
| Escala aleatória | 0,8 a 1,3 × `size` | `decal()` |
| Vida de um furo de bala | 14 s | `DECAL_LIFE` |
| Vida da marca de explosão | 24 s, `size = 9` (≈ 1,2 m) | `SCORCH_LIFE` |
| Desaparecimento | 4 s de fade depois da vida | `DECAL_FADE` |
| Afastamento da superfície | 4 mm ao longo da normal | `decal()` |

- Cada marca recebe uma rotação aleatória em torno da normal (variação visual).
- **Buffer circular:** o cursor avança a cada marca; a 385ª sobrescreve a mais antiga, mesmo que ainda visível. Com 160, em combate cheio online as marcas sumiam em 1 a 2 s; 384 mantém uma única chamada de desenho.
- Marcas totalmente apagadas deixam de ser desenhadas: desde a PF-35 (T1) só as marcas vivas vão para a GPU, juntas no começo do `InstancedMesh` com o `aFade` de cada uma (`PackedInstances`, `client/render/packedInstances.ts`); sem marcas, o mesh não desenha nada.

## Quando aparecem

| Evento | Marca | Onde no código |
| --- | --- | --- |
| Tiro local acerta o mapa | um furo no ponto, com detritos e faíscas | `main.ts` (ramo `else` do acerto) |
| Tiro local atravessa madeira/vidro/papel | furo de entrada **e** de saída | `main.ts` (laço `through`) |
| Explosão com chão a até 1,5 m | marca de queimado (`size 9`, 24 s) + anel de choque | `Effects.explosion` |
| Tiro de **outro jogador** online acerta o mapa | um furo no ponto, com detritos (5), faíscas (3) e o som de impacto do material | `main.ts` (`conn.on('shot')`) + `remoteImpact` |

### Tiros dos outros jogadores (PF-5)

A mensagem `shot` traz só o cano (`o`) e o ponto final (`e`), que é o ponto de impacto quando o tiro acertou algo. Quem recebe faz um raycast curto **só contra o mapa** (filtro `WORLD_ONLY`: sem jogadores nem hitboxes), de 0,25 m antes a 0,05 m depois de `e`, na direção `normalize(e − o)` (`client/weapons/remoteImpact.ts`). Achou: marca, detritos, faíscas e `impact(material)` no ponto. Não achou (céu, jogador longe da parede): nada.

- Sem mudança de protocolo nem de servidor.
- A janela de 5 cm depois do ponto evita marca na parede atrás de um jogador atingido encostado nela.
- O receptor **não** chama `surface.onShot`: as reações do cenário (hidrante, gongo…) já chegam pela mensagem `prop`.
- Furos de penetração (entrada e saída em madeira, vidro, papel) continuam só para quem atirou; para os outros a marca fica onde o tiro parou.
- Quem entra no meio da partida não recebe as marcas antigas.

> [!note]
> Personagens nunca recebem decal (acertos neles geram confete/estrelas, ver [[Particles]]).

## Implementação

- Material: `MeshBasicMaterial` com `map: holeTexture()` (canvas 64×64, degradê radial marrom-escuro até transparente), `transparent`, `depthWrite: false`, `polygonOffset` com fator −4.
- Fade individual: atributo instanciado `aFade` (0..1) injetado no shader por `onBeforeCompile`, que multiplica o alfa. Ver [[Shaders]].
- `frustumCulled = false`: o mesh de instâncias é sempre enviado à GPU (as instâncias estão espalhadas pelo mapa inteiro), mas só com as marcas vivas (`mesh.count`).

## Código relacionado

- `client/render/effects.ts` (`Effects.decal`, `Effects.update`, `holeTexture`)
- `client/main.ts` (chamadas a `effects.decal`)
- `client/weapons/remoteImpact.ts` (onde o tiro de outro jogador bateu no mapa)

## Ver também

[[Particles]] · [[Visual Effects]] · [[Combat]] · [[VFX Assets]] · [[Performance Rendering]]
