---
title: Map - Vila Assombrada
type: map
status: documented
area: world
source_paths:
  - client/world/hauntedTown.ts
  - client/world/halloween.ts
  - client/world/furniture.ts
  - client/world/vehicles.ts
  - client/world/oriental.ts
  - shared/maps.ts
  - shared/constants.ts
  - docs/MAPAS.md
  - README.md
  - shared/modes.ts
tags:
  - world
  - map
  - halloween
updated: 2026-10-06
---

# Map - Vila Assombrada

| Campo | Valor |
| --- | --- |
| Id interno | `halloween` |
| Sessão fixa | id `halloween` |
| Construtor | `buildHauntedTownMap` (`client/world/hauntedTown.ts`), peças em `halloween.ts` e `furniture.ts` |
| Tamanho | 120 × 110 m (x −60..60, z −55..55) — o maior mapa |
| Atmosfera | **noite** com lua cheia (luz azulada vinda da lua), névoa roxa de 55 a 210 m, neblina rasteira fraca; 10 luzes reais distribuídas às velas/lampiões mais próximos da câmera (ver [[Lighting]]) |
| Célula de lote | 60 m |
| `shadowExtent` | 84 m (max(W, D) + 24) |
| `killY` | −20 |

## Visão geral

Cidade de Halloween abandonada, à noite. Tem **oito regiões**: floresta (com a cabana da bruxa), Estrada Maldita (com o celeiro), cemitério, mansão (com jardim), vila, parque de diversões, Praça da Lua Cheia e um **esgoto** subterrâneo que liga a mansão à praça e ao parque. É o mapa com mais objetos interativos sincronizados. O documento de design citado no código (`README_Halloween.md`, "seção 23" dos segredos) **não está no repositório**. Peças visuais em [[Environment Pieces]], [[Props Catalog]].

## Layout

Norte = −Z.

```text
z=-55 ┌──────────────────── muro de pedra 4,5 m ─────────────────────┐
      │ FLORESTA  (cabana da bruxa NW, árvore retorcida)  ═ ESTRADA ═ A│
z=-36 │ floresta │      CEMITÉRIO (capela, mausoléu, covas)    │ celeiro│
z=-14 │──────────┘                                             │ estrada│
z=-8  │ MANSÃO   │  VILA: casas ao norte da rua                │   ║    │
z= 0  │ (2 and., │ ═══════════ rua da vila ═════════════════════╝    │
z=12  │  porão)  │  casas ao sul da rua                               │
z=13  │ jardim   │  quintais / horta    │ PARQUE (roda-gigante, tiro │
z=30  │──────────┴──────── cerca viva 2,6 m ─────────────────────────│
z=31  │ B  PRAÇA DA LUA CHEIA (árvore gigante, palco, coreto)  trailers│
z=55  └───────────────────────────────────────────────────────────────┘
      x=-60                       x=0                            x=60
      (subterrâneo: esgoto mansão → sul → leste sob a praça → parque)
```

| Região | Área aproximada (x; z) | Conteúdo |
| --- | --- | --- |
| Floresta | −60..18; −55..−37 e −60..−28; −37..−11 | árvores secas (com semente), trilhas, cogumelos brilhantes, **árvore retorcida** (4,5, −42,5); **cabana da bruxa** x −47..−33, z −51..−41 (bruxa, caldeirão, prateleiras de poções) |
| Estrada Maldita | asfalto x 18..60, z −50..−44, depois desce em x 36..42 até a rua da vila | entrada do nordeste (base A), carros, **celeiro** vermelho x 46..56, z −34..−24 (portas de 3 m), fardos de feno, placas ("BEM-VINDO. Se você chegou até aqui, já era."), máquina de refrigerante |
| Cemitério | −28..28; −36..−14 (cerca de ferro) | portão "CEMITÉRIO" a leste (x 28, z −26..−22) e "SAÍDA ?" ao norte; **capela** com torre do sino (x −26..−16, z −33..−26); **mausoléu** (x 14..24, z −35..−27): corredor entre 4 câmaras, portas em 3 lados, **telhado acessível** (~4,45 m) com parapeito; fileiras de lápides; cova do fantasma (5, −20,4) |
| Mansão | −56..−30; −8..12 | 2 andares de 3,6 m em volta de um grande hall com vazio até o teto e escadaria; térreo: sala de jantar, biblioteca, cozinha (armário com o biscoito), sala de estar com lareira; andar de cima: quarto das crianças, suíte, depósito, galeria de retratos; **porão**; cerca de ferro e jardim (fonte seca, jazigo da família) a sudoeste |
| Vila | −23..42; −13..12,5 | rua leste-oeste (z −2,5..2,5); **seis casas** entráveis: açougue, sobrado de tijolo do prefeito (cofre), casa abandonada com tábuas nas janelas, uma casa de madeira, loja de doces, uma casa pequena; quintais com galpão, poço e horta de abóboras ao sul |
| Parque | 20..58; 13,5..30,4 (cerca de ferro, portão "PARQUE") | bilheteria, **barraca de tiro ao alvo** (x 30,5..38,5), palco com cortina (1,1 m), **carrinhos de bate-bate** num aro baixo de 0,9 m, roda-gigante (52, 22), medidor de força com sino, tenda listrada |
| Praça da Lua Cheia | −45..45; 31,6..55 | **a grande arena aberta**, atrás de uma cerca viva de 2,6 m (z 31) com 4 passagens; árvore seca gigante sobre base redonda (0, 44); abóbora gigante (−26, 46); fogueira; palco baixo (1,2 m); coreto (1 m); estátua; quiosque de descida ao esgoto; pátio sudoeste (base B) e trailers de circo a sudeste |
| Esgoto | piso a −4 m, teto a −0,5 m | porão da mansão → túnel sul → túnel leste (sob a praça) → parque; sala de manutenção; **rua sem saída** ao sul até a câmara do **rato gigante** (7,5, −4, 47,5) |

Escadas para o esgoto (4 m de desnível, ~5,3 m de lance): no porão da mansão, no quiosque da praça (x −19,2..−17,4) e no parque (x 22,2..24,2, z ~24,7..30, com grades em volta).

## Rotas principais

- **Estrada Maldita**: da base A (nordeste) para oeste e depois para o sul até a rua da vila — o eixo de entrada.
- **Rua da vila**: leste-oeste, liga a estrada à mansão.
- **Trilhas**: floresta → cemitério (norte-sul, x 0), cemitério → mansão (z −24,5), trilha para a cabana.
- **Praça**: atravessa o sul de ponta a ponta, da base B (sudoeste) ao parque.

## Rotas alternativas

- **Esgoto**: liga mansão, praça e parque por baixo de tudo, fora da vista.
- **Interiores**: casas da vila com portas em vários lados; mansão com cada cômodo tendo duas ou mais entradas; mausoléu com portas em três lados.
- **Quintais** entre a vila e a praça.

## Áreas abertas

Praça da Lua Cheia (deliberadamente aberta), Estrada Maldita, cemitério (entre lápides), parque.

## Áreas fechadas

Mansão (2 andares + porão), casas da vila, capela, mausoléu, cabana da bruxa, celeiro, esgoto e sala de manutenção.

## Cobertura

- Na praça: carros, barracas de mercado, fardos de feno com caixotes, barris, bancos, palco, coreto, base da árvore gigante.
- No parque: aro dos carrinhos (altura da cintura), barraca, palco.
- Cemitério: lápides, bancos da capela (cobertura agachado), caixões no mausoléu.
- Mansão: estantes soltas da biblioteca, mesa de jantar.
- **Cercas de ferro** param o jogador mas **não a bala**; **cercas vivas** param os dois e bloqueiam a visão; paredes das casas de madeira (0,3 m) tendem a ser atravessadas pela bala. Ver [[Cover & Combat Spaces]].

## Spawn points

- **A** (5): Estrada Maldita, nordeste — (56, −47), (56, −44,8), (56, −49,2), (52, −38), (57, −36), olhando −X.
- **B** (5): pátio sudoeste da praça — (−56, 50), (−56, 46,5), (−53, 53), (−57, 38), (−50, 36,5), olhando +X.
- **FFA** (25): mansão (térreo, andar de cima a 3,8 m), porão e esgoto (−3,8 m), floresta, cabana, cemitério, estrada, celeiro, casas da vila, parque, praça, jardim e cantos. Ver [[Spawn Design]].

13 bonecos de treino: ao longo da estrada, celeiro, portão do cemitério, mausoléu (dentro e no telhado), cova do fantasma, capela, vila, hall da mansão, parque e praça.

## Modos

Mapa **versus**: mata-mata, corrida armada, contra bots e campo de tiro (`PVP_MAPS`). Foi o mapa do [[Zombie|modo zumbi]] até 2026-10-06; o modo ganhou um mapa só dele, o [[Map - Cemitério da Capela]] (este era grande demais para ler de onde vinha a horda), e os dados e a navmesh do modo para a Vila Assombrada (`mapas.halloween`, `shared/data/navmesh/halloween.json`) saíram ([[ADR - Mapa exclusivo e barricadas no modo zumbi]]).

## Objetivos

Nenhum objetivo de modo. Pontos de interesse com recompensa: **biscoito** (cozinha da mansão), **poção da bruxa** (cabana), **rato gigante** (esgoto), **último alvo da barraca de tiro** (parque). Ver [[Pickups]], [[Buffs & Debuffs]], [[Objectives]].

## Zonas especiais

- **Esgoto** (−4 m), escuro, iluminado por lâmpadas; a rua sem saída termina na câmara do rato.
- **Raio da poção**: 2,4 m em volta da bruxa ("Beber Poção" com a tecla de oprimir).
- **Telhado do mausoléu**: posição elevada com parapeito.

## Objetos interativos

Fantasma da cova, sino da capela, buzina do carro, abóboras, postes, caldeirão (patos de borracha), bruxa, espantalhos, alvos do parque, abóbora gigante, relógio de pêndulo, cogumelos brilhantes, sino do parque, armário da cozinha, biscoito e rato gigante. Ids e posições em [[Interactive Objects]]; regras em [[Map Gags]].

## Fluxo esperado dos jogadores

> [!info]
> Inferência a partir do layout e dos comentários do código.

- Em times (spawns A/B, não usados hoje), A entraria pela estrada no nordeste e B pela praça no sudoeste, em cantos opostos do mapa.
- No mata-mata livre, o combate se espalha por regiões com caráter próprio: arena aberta (praça), interiores (mansão, vila), corredor subterrâneo (esgoto).
- Os pontos de recompensa (biscoito, poção, rato, barraca) puxam jogadores para a mansão, a floresta, o esgoto e o parque.

## Problemas conhecidos

- Os **segredos** que usariam os contadores dos objetos (fantasma, sinos, caldeirão, alvos, abóbora gigante, relógio, cogumelos) **não estão implementados**; vários elementos estão marcados "para depois" (máquina de refrigerante, esqueleto do palco, olhos dos retratos).
- Mapa mais pesado: ~130–520 mil triângulos visíveis (pode passar da meta de 500 mil) e construção de ~400–500 ms (`docs/MAPAS.md`). Ver [[Performance Rendering]].
- Correções recentes de geometria (commit `0fac263`): parede da torre do sino, paredes coladas às escadas do porão e da sala de manutenção, móveis fora da linha de portas — indicam que a checagem de colisões/vãos é manual (ver [[Problem - Teste de estrutura de vãos ausente]]).

## Código relacionado

- `client/world/hauntedTown.ts` — `buildHauntedTownMap`, `house`, `stall`, regiões, esgoto, spawns, atmosfera.
- `client/world/halloween.ts` — peças e objetos vivos (ver [[Interactive Objects]]), `LightPool`, `ironFence`, `hedge`, `slabWithHoles`.
- `client/world/furniture.ts` — móveis (`crate`, `hayBale`, `barrel`, `pew`, `coffin`, `bookshelf`, `Place`...).
- `shared/maps.ts` — `PICKUPS.halloween`, `WITCHES.halloween`, `RATS.halloween`.
- `shared/constants.ts` — `POTION`, `RAT`, `BISCUIT`.
