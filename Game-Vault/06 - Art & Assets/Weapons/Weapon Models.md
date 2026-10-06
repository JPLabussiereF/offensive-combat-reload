---
title: Weapon Models
type: asset
status: documented
area: art
source_paths:
  - client/render/weaponModels.ts
  - client/render/viewmodel.ts
  - client/render/viewmodelArms.ts
  - client/entities/heldWeapons.ts
  - client/weapons/grenades.ts
  - client/weapons/mines.ts
  - client/character/registry.ts
  - shared/progression.ts
  - shared/data/progression.json
tags:
  - game
  - art
  - weapons
  - assets
updated: 2026-10-05
---

# Weapon Models

## Visão geral

Todas as armas são **modelos feitos de primitivas em código** ("placeholder art", comentário de `weaponModels.ts`), sem arquivos. Cada **nível de progressão** tem visual próprio: o rifle muda de mira e de pintura, a "faca" vira outro objeto engraçado, a granada vira mina ou dose dupla. Os mesmos modelos servem para a primeira pessoa (viewmodel) e para a terceira pessoa (o que os outros veem). Regras de jogo dos níveis: [[Weapons]] e [[Progression]].

## Rifle (7 níveis)

`rifleParts(level)` monta: receptor, cano, guarda-mão, coronha, empunhadura, faixa colorida, carregador (separado, animado na recarga), mais a mira e a pintura do nível.

| Nível | Nome | Mira (`mira`) | Pintura (`visual`) | Detalhes visuais |
| --- | --- | --- | --- | --- |
| 1 | Rifle Padrão | `ferro` | `padrao` | massa de mira e alça em ferro; faixa laranja de equipe |
| 2 | Remendado com Fita | `pontoVermelho` | `fita` | tubo com aros e ponto vermelho brilhante; 3 voltas de fita cinza |
| 3 | da Tia do Zap | `holo` | `tia` | janela holográfica com **retículo de carinha feliz** amarelo; corpo lilás e rosa; adesivo de flor na coronha |
| 4 | Pisca-Pisca de Natal | `holoLupa` | `natal` | holo + lupa; fio com 9 lampadinhas acesas (vermelho, verde, amarelo, azul) |
| 5 | Tunado com Adesivo de Chama | `luneta2x` | `chamas` | corpo preto, chamas laranja/amarelas dos dois lados |
| 6 | com Luneta do Vovô | `luneta3x` | `vovo` | madeira escura e latão |
| 7 | Dourado Ostentação | `luneta4x` | `ouro` | todo dourado, com "rubis" (octaedros vermelhos) |

- **Altura da linha de mira (`sightY`)**, que define a pose de ADS: ferro 0,057; ponto vermelho 0,07; holo 0,076; lunetas 0,085.
- **Lunetas** ficam mais longas com o aumento (×1, ×1,2, ×1,35) e têm a lente azulada brilhante; mirando por completo, o modelo some e entra o overlay de luneta ([[Camera]]).
- Partes que brilham (ponto vermelho, retículo, luzes de Natal, lente) são `MeshBasicMaterial` e ficam fora do merge, "para continuarem claras".

Paletas de cada pintura em [[Material Palette]].

## "Facas" (7 níveis)

`knifeModel(model)`, segurado pelo punho na origem, apontando para −Z. Em primeira pessoa, as que não são `faca` são 20% maiores e usam o golpe em arco (`SWING_KEYS`) em vez da estocada.

| Nível | Nome | Modelo | Construção |
| --- | --- | --- | --- |
| 1 | Faca de Cozinha | `faca` | lâmina + ponta, guarda e cabo de madeira |
| 2 | Colher de Pau da Vó | `colher` | cabo e concha de madeira clara |
| 3 | Frango de Borracha | `frango` | frango amarelo segurado pelos pés: corpo comprido, asas, pescoço, crista vermelha, bico aberto, olhos |
| 4 | Baguete Amanhecida | `baguete` | cápsula de casca dourada com 5 cortes |
| 5 | Peixe Congelado | `peixe` | peixe azul-acinzentado segurado pela cauda, olho, barbatana e 7 pontinhos brancos ao longo do corpo |
| 6 | Macarrão de Piscina | `macarrao` | cilindro verde de 0,6 m com o furo na ponta |
| 7 | Sabre de Luz Paraguaio | `sabre` | cabo prateado e lâmina rosa-choque com brilho aditivo |

## Granadas e mina

| Item | Modelo | Fonte |
| --- | --- | --- |
| Granada de fragmentação (nível 1) | corpo verde-oliva, cinta, espoleta, alavanca e argola | `grenadeModel` em `weapons/grenades.ts` |
| Mina terrestre (nível 2) | disco oliva, placa de pressão e LED vermelho que pisca | `mineModel` em `weaponModels.ts` |
| Dose Dupla (nível 3) | duas granadas lado a lado na mão | `Viewmodel.setGrenadeKind('dupla')` |
| Granada-pato (poção "pato") | pato amarelo de borracha | `duckModel` em `weapons/grenades.ts` |

Ver [[Grenades]], [[Land Mines]] e [[Buffs & Debuffs]].

## Primeira pessoa x terceira pessoa

| | Primeira pessoa (`Viewmodel`) | Terceira pessoa (`heldWeapons.ts`) |
| --- | --- | --- |
| Cena | `vmScene`, câmera própria ([[ADR - Viewmodel em cena e câmera próprias]]) | cena do mundo, presa a sockets do personagem |
| Rifle | partes rígidas + braços fundidos num mesh toon (`bakeStaticParts`); carregador, clarão e brilhos separados | um mesh por nível, cache `rifle|visual|mira`, na mão (`hand_R`) e nas costas (`back`) |
| Faca | aparece só durante o golpe, na mão direita (ou espelhada para a esquerda sem mão direita) | na mão durante o golpe; o rifle vai para as costas |
| Granada | mão esquerda, tremendo enquanto "cozinha" | mão esquerda, com o arremesso animado |
| Material | `MeshToonMaterial` com cor por vértice | **um** material toon compartilhado por todas as armas de todos |
| Brilhos | mantidos | descartados ("minúsculos de longe") |

O rifle em primeira pessoa tem origem no receptor; em terceira, no punho (`RIFLE_FROM_GRIP = (0, 0,035, −0,09)`).

### Braços em primeira pessoa

Antebraço e mão do próprio personagem, gerados com o mesmo corpo facetado (`viewmodelArms.ts`), com o punho fechado pelo morph (direita 0,92, esquerda 0,42), manga longa ou braço nu, luvas, e PCD. Geometria em cache por combinação. Ver [[Character Customization]].

## Código relacionado

- `client/render/weaponModels.ts` (`rifleParts`, `LOOKS`, `knifeModel`, `mineModel`, `glowMat`)
- `client/render/viewmodel.ts` (`setRifle`, `setKnife`, `setGrenadeKind`, `bakeStaticParts`, `flashTexture`)
- `client/render/viewmodelArms.ts` (`armMesh`, `placeArm`)
- `client/entities/heldWeapons.ts` (`heldRifle`, `heldKnife`, `heldGrenade`)
- `client/weapons/grenades.ts` (`grenadeModel`, `duckModel`)
- `client/character/registry.ts` (itens `rifle`, `rifle_costas`)
- `shared/data/progression.json`

## Ver também

[[Weapons]] · [[Progression]] · [[Animation]] · [[Visual Effects]] · [[Material Palette]]
