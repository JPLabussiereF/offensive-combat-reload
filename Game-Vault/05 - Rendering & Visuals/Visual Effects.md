---
title: Visual Effects
type: system
status: documented
area: rendering
source_paths:
  - client/render/effects.ts
  - client/render/viewmodel.ts
  - client/render/weaponModels.ts
  - client/main.ts
  - client/world/halloween.ts
  - client/world/jardim/luzes.ts
  - client/world/decor.ts
  - client/world/oriental.ts
  - client/weapons/mines.ts
  - client/zombies/view.ts
  - client/zombies/barricades.ts
  - client/zombies/coffin.ts
  - client/world/cemetery.ts
  - shared/data/weapons/rifle_padrao.json
  - shared/data/weapons/pistola.json
  - shared/data/weapons/smg.json
tags:
  - game
  - rendering
  - vfx
updated: 2026-10-06
---

# Visual Effects

## Visão geral

Efeitos de combate ficam em `client/render/effects.ts` (classe `Effects`, criada uma vez com a cena), no viewmodel e em cada mapa. Todos usam **pools pré-alocados**; nenhum efeito cria malha durante a partida. As partículas estão em [[Particles]] e as marcas em [[Decals]]; esta nota cobre o resto. Os "assets" (texturas, cores, formas) estão em [[VFX Assets]].

## Efeitos de combate

### Disparo

| Efeito | Detalhe |
| --- | --- |
| Clarão na boca (1ª pessoa) | 2 quadrados cruzados de 0,16 m + 1 de 0,10 m com textura de estrela de 7 pontas, aditivos, no cano (`MUZZLE_LOCAL`). Visível 0,045 s, com rotação e escala (0,8–1,3, alongado 1,4× em Z) aleatórias |
| Luz do disparo | `PointLight` `0xffc36b`, alcance 9 m, intensidade 30 caindo a 0 em 0,05 s |
| Traçante | 16 no pool; caixa aditiva `0xffe28a`, 0,025 m de espessura, 6 m de comprimento, a 450 m/s, do cano até o impacto. Sai **1 a cada N tiros** (`tracanteACada` no JSON da arma: 3 no rifle, 2 na pistola e na submetralhadora); tiros de outros jogadores sempre mostram traçante, **exceto** os de arma com silenciador (sem traçante) |
| Recuo visual | mola no viewmodel (ver [[Animation]]) |

### Impacto

Furo (decal) + detritos + faíscas no mapa; confete ou estrelas em personagens. Ver [[Decals]] e [[Particles]].

### Explosão de granada (`Effects.explosion`)

Sequência "cartoon" disparada por `explosionFx` em `main.ts`, com tamanho derivado do raio de dano da granada:

1. **Bolas de fogo:** 3 (de 12 no pool) icosaedros opacos com flat shading, entrando com 0,04 s de atraso entre si, vida 0,28–0,38 s, crescimento *ease-out* cúbico. Cor: branco quente → amarelo → laranja → fuligem, com fade nos últimos 40%. O comentário explica: puffs opacos "leem melhor como fogo de desenho que brilho aditivo, que lava no céu".
2. **Fumaça:** até 12 (de 48) esferas toon cinza (0,45–0,75), vida 1,2–2,1 s, sobem e crescem; opacidade 0,75 → 0.
3. **Anel de choque:** 1 (de 4) anel no chão, de 0,5 a 4× em 0,4 s, opacidade 0,5 → 0.
4. **Clarão:** `PointLight` `0xffa640`, alcance 22 m, pico 400 por 0,25 s.
5. **Partículas:** 30 faíscas + 24 detritos.
6. **Marca no chão** (se houver chão a até 1,5 m): decal de 24 s.
7. **Tremor de câmera** proporcional à distância (até 18 m). Ver [[Camera]].

### Outros

- **Mina terrestre:** LED vermelho que pisca devagar enquanto arma e rápido depois de armada (`mines.ts`). Ver [[Land Mines]].
- **Overlay de luneta** e **vinheta de dano**: CSS, ver [[Post Processing]] e [[HUD]].

### Modo zumbi

- **Telegrafia de surgimento** (`zfx 'rise'`, `ZombieView.fx`): 0,9 s antes de um zumbi aparecer, um disco verde aditivo no chão (pulsa e some 0,9 s depois), **duas mãos** de toon verde-acinzentado (`handGeometry`: palma, quatro dedos e polegar, geometria e material compartilhados) que sobem da terra e arranham, um **feixe de luz** verde aditivo de 3,2 m (cilindro aberto, visível por cima do muro do cemitério) e um punhado de terra (`burst('debris')`). Ver [[Zombie]].
- **Barricadas** (`client/zombies/barricades.ts`): 5 tábuas de toon em tons de madeira, levemente tortas, com pregos, e dois postes, na face de fora da brecha. A tábua de cima frouxa (inclina) e, abaixo de 1/3 da vida, pendurada por um prego; cada golpe a faz tremer e solta lascas; uma tábua que cai vira uma cópia solta que gira, quica no chão e some em 1,6 s; tábuas pregadas entram deslizando. Ver [[Map - Cemitério da Capela]].
- **Caixão** (`client/zombies/coffin.ts`): a arma danificada flutua torta, com o brilho da raridade puxado para o vermelho e piscando, sob uma placa (sprite de canvas) "DANIFICADA" com uma rachadura.

## Efeitos de ambiente por mapa

| Mapa | Efeito | Implementação |
| --- | --- | --- |
| [[Map - Rua dos Vizinhos]] | 10 nuvens que deslizam no céu | `skyClouds` (`decor.ts`): `InstancedMesh` toon com emissivo `0x9fb8cc` |
| Rua dos Vizinhos | jato d'água dos hidrantes | `WaterDrops` (`hydrant.ts`) |
| [[Map - Vila Assombrada]] | céu noturno: cúpula raio 290 m com degradê por vértice, 700 estrelas (`Points`), lua com crateras e halo aditivo de 90 m | `nightSky` (`halloween.ts`) |
| Vila Assombrada | névoa rasteira: 2 planos por mancha, textura radial, cor `0x9a94c4`, opacidade 0,12 (de propósito "fina para nunca esconder um jogador"), deriva lenta | `GroundMist` |
| Vila Assombrada | janelas, velas e rostos de abóbora acesos (um mesh sem luz) | `Glow` |
| Vila Assombrada | chamas, vapor do caldeirão, fogueira, morcegos, roda-gigante iluminada, cogumelos que brilham | `Puffs`, `Bonfire`, `Bats`, `FerrisWheel`, `GlowShrooms` |
| [[Map - Jardim do Dragão]] | céu com shader, 260 estrelas fracas, 650 lanternas de papel subindo com halo | `nightSky`, `SkyLanterns` (`jardim/luzes.ts`) |
| Jardim do Dragão | halo em cada lanterna pendurada e de pedra (balançam com tiros) | `LanternLights` (`Points` aditivos) |
| Jardim do Dragão | baforada de fogo do dragão da fonte | `FireBreath` (`oriental.ts`) |
| [[Map - Cemitério da Capela]] | o céu, a névoa rasteira (só no campo de fora, baixa), morcegos em volta do campanário, lanternas das brechas e velas da capela (`Glow`) | `nightSky`, `GroundMist`, `Bats`, `Glow` (`halloween.ts`) |

O comportamento de jogo desses objetos (o que acontece ao atirar, sincronização online) está em [[Map Gags]] e [[Interactive Objects]].

## Código relacionado

- `client/render/effects.ts` (`Effects`: `flash`, `tracer`, `explosion`, `update`)
- `client/render/viewmodel.ts` (`flash`, `flashTexture`)
- `client/main.ts` (`explosionFx`, `killFx`, `groinFx`, `humiliationFx`, `weapon.shoot`)
- `client/world/halloween.ts`, `client/world/jardim/luzes.ts`, `client/world/decor.ts`, `client/world/oriental.ts`, `client/world/hydrant.ts`
- `client/weapons/mines.ts`
- `client/zombies/view.ts` (telegrafias do modo zumbi), `client/zombies/barricades.ts`, `client/zombies/coffin.ts`, `client/world/cemetery.ts`

## Ver também

[[Particles]] · [[Decals]] · [[Lighting]] · [[VFX Assets]] · [[Grenades]] · [[Combat]]
