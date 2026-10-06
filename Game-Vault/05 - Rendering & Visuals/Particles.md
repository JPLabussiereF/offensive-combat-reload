---
title: Particles
type: system
status: documented
area: rendering
source_paths:
  - client/render/effects.ts
  - client/world/halloween.ts
  - client/world/hydrant.ts
  - client/world/oriental.ts
  - client/world/jardim/luzes.ts
  - client/world/jardim/frutas.ts
  - client/main.ts
tags:
  - game
  - rendering
  - particles
  - vfx
updated: 2026-10-05
---

# Particles

## Visão geral

Não há sistema de partículas genérico nem sprites de partícula. Cada efeito é um **`InstancedMesh` de primitivas sólidas** (cubos ou icosaedros) com física simples feita na CPU (velocidade, arrasto, gravidade), em **buffer circular de tamanho fixo**. Regra declarada no topo de `effects.ts`: "nunca criar/destruir por tiro" (seção 3 do documento de design). Instâncias mortas recebem matriz de escala zero.

## Pools de partículas

| Pool | Capacidade | Geometria / material | Onde | Uso |
| --- | --- | --- | --- | --- |
| `Effects.particles` | 480 | cubo, `MeshBasicMaterial`, cor por instância | todos os mapas | impactos, mortes, explosões |
| `Puffs` | 260 | icosaedro, `MeshBasicMaterial` 0,8 de opacidade | [[Map - Vila Assombrada]] | chamas, vapor, fumaça, "puf" do fantasma |
| `Debris` | 160 | icosaedro, `MeshToonMaterial` | Vila Assombrada | pedaços de abóbora esmagada (quicam no chão) |
| `WaterDrops` | 360 | icosaedro, `0xbfeaff` 0,85 | [[Map - Rua dos Vizinhos]] (hidrantes) e fontes | jato d'água |
| `FireBreath` | 160 | instanciado, blending normal | [[Map - Jardim do Dragão]] | baforada do dragão da fonte |
| `SkyLanterns` | 650 | lanterna de papel (cilindro + base), `MeshBasicMaterial` sem névoa, + halos `Points` aditivos | Jardim do Dragão | lanternas subindo no céu (ambiente) |
| Suco/metades de frutas | por fruta | instanciado | Jardim do Dragão | frutas cortadas |

## Tipos de `Effects.burst`

| Tipo | Velocidade | Vida | Tamanho | Arrasto | Cor | Forma |
| --- | --- | --- | --- | --- | --- | --- |
| `spark` | 7 | 0,12–0,22 s | 0,025 | 1 | `0xfff0a0` | cubo |
| `debris` | 3,5 | 0,5–0,9 s | 0,035–0,065 | 1 | tint × 0,6–0,9, ou `0x777777` | cubo |
| `confetti` | 4,5 | 1,2–2,0 s | 0,07 | 3,5 | sorteada de 6 cores | lâmina achatada (1 × 0,12 × 0,7) |
| `star` | 3 | 0,5–0,8 s | 0,09 | 2 | `0xffe14d` | placa (1 × 1 × 0,3) |

- Direção: a normal do impacto mais ruído de ±0,8 por eixo e +0,4 para cima; velocidade × 0,5–1,2.
- Gravidade: −12 m/s² dividido pelo arrasto (confete cai devagar). Rotação contínua aleatória.
- Encolhem nos últimos 40% da vida.

### Quem dispara cada tipo (`main.ts`)

| Evento | Partículas |
| --- | --- |
| Tiro acerta o mapa | 5 `debris` (`0x9a8f80`) + 3 `spark` |
| Tiro atravessa madeira/vidro | 3 `debris` na entrada, 5 na saída (`0x9a6a3a`) |
| Acerto em personagem | 6 `confetti`; na cabeça ou virilha, 10 `star` |
| Abate | 40 `confetti` a 1,2 m de altura |
| Tiro na virilha ("No pássaro!") | 25 `confetti` amarelos |
| Humilhação concluída | 60 `confetti` |
| Explosão | 30 `spark` + 24 `debris` (`0x5a4a3a`) |
| Fruta ou peixe atingido | 4 `confetti` vermelhos (fruta) ou azul-claros (peixe) |
| Deslizando | 2 `debris` de poeira (`0xb8aa90`) nos pés, com 35% de chance por tick |

> [!info]
> O jogo não mostra sangue: acertos em personagens soltam confete e estrelas. Ver [[Art Direction]].

## Código relacionado

- `client/render/effects.ts` (`Effects.burst`, `Effects.update`, `CONFETTI_COLORS`)
- `client/world/halloween.ts` (`Puffs`, `Debris`)
- `client/world/hydrant.ts` (`WaterDrops`)
- `client/world/oriental.ts` (`FireBreath`)
- `client/world/jardim/luzes.ts` (`SkyLanterns`)
- `client/world/jardim/frutas.ts`
- `client/main.ts` (chamadas a `effects.burst`)

## Ver também

[[Visual Effects]] · [[Decals]] · [[VFX Assets]] · [[Performance Rendering]]
