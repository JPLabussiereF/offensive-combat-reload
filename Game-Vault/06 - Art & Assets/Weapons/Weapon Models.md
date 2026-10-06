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
  - client/entities/avatar.ts
  - client/character/animator.ts
  - shared/arsenal.ts
tags:
  - game
  - art
  - weapons
  - assets
updated: 2026-10-06
---

# Weapon Models

## Visão geral

Todas as armas são **modelos feitos de primitivas em código** ("placeholder art", comentário de `weaponModels.ts`), sem arquivos. Cada arma de fogo tem o seu modelo (rifle, pistola, submetralhadora); os sete rifles usam o mesmo modelo com a **pintura** de cada um, e as **melhorias** mudam a mira, o pente e o silenciador. Cada uma das sete facas tem o seu modelo, e a granada vira mina ou Dose Dupla. Os rifles pintados, as miras com aumento e as facas antigas voltaram das primeiras versões do jogo (PF-8; recuperados do histórico do git). Os mesmos modelos servem para a primeira pessoa (viewmodel) e para a terceira pessoa (o que os outros veem). Regras de jogo das melhorias: [[Weapons]] e [[Progression]].

## Armas de fogo

`gunParts(g)` monta o modelo de uma arma a partir de `GunLookKey` (`arma`, `mira`, `visual`, `silenciador`, `pente`, todos vindos de `gunStats`). `gunModelKey(g)` é a chave de cache com esses mesmos campos. Todas as armas têm o punho no mesmo lugar, então os braços, as poses e o suporte de terceira pessoa servem para todas. `holdOf(arma)` diz onde vai a mão de apoio: `longa` (guarda-mão do rifle), `curta` (empunhadura da submetralhadora) ou `pistola` (a mão esquerda envolve o punho).

| Arma | Construção base | Pente | Silenciador |
| --- | --- | --- | --- |
| Rifle | receptor, cano, guarda-mão, coronha, empunhadura, faixa colorida; mira de ferro (massa e alça) | com mais de 30 balas (melhoria Pente), **dois pentes lado a lado com fita** | garrafa PET de 2 L verde com rótulo vermelho na boca do cano |
| Pistola | ferrolho com serrilhas, armação, punho de madeira, **chaveiro do porteiro** pendurado; massa de mira com ponto verde | pente curto no punho | **uma batata** na boca do cano |
| Submetralhadora | corpo branco de eletrodoméstico com faixa vermelha, botão de velocidade (1 a 5) na lateral, empunhadura frontal, coronha de arame | com mais de 40 balas (Pente Tambor), **tambor de pipoqueira** listrado de branco e vermelho | — |

| Mira (`mira`) | Onde aparece | Detalhe visual |
| --- | --- | --- |
| `ferro` | sem melhoria de mira | massa e alça da própria arma |
| `pontoVermelho` | rifle (nível 2) e pistola (nível 3, versão mini, escala 0,65) | tubo com aros e ponto vermelho brilhante |
| `holo` | submetralhadora (nível 3) | janela holográfica com **retículo de carinha feliz** amarelo |
| `luneta` | rifle (nível 4, opcional) | luneta do vovô em latão com lente azulada; mirando por completo, o modelo some e entra o overlay de luneta ([[Camera]]) |
| `holoLupa` | rifle (nível 7, opcional) | a holográfica de carinha feliz com uma **lupa** (tubo curto) atrás |
| `luneta2x` / `luneta4x` | rifle (níveis 8 e 9, opcionais) | lunetas de latão como a do vovô, mais curta (2x) e mais comprida e larga (4x); mirando por completo, o overlay de luneta. `isScope(mira)`: toda mira que começa com `luneta` |

A pintura vem do JSON de cada rifle (`visual`); as melhorias não a mudam.

| Pintura (`visual`) | Rifle | Detalhe |
| --- | --- | --- |
| `padrao` | Rifle Padrão; pistola e submetralhadora sempre | metal escuro, madeira, faixa laranja |
| `fita` | Remendado com Fita | voltas de fita cinza no guarda-mão e na coronha |
| `tia` | da Tia do Zap | branco e rosa, faixa verde-água, adesivo de florzinha na coronha |
| `natal` | Pisca-Pisca de Natal | madeira vermelha, faixa verde, fio de luzinhas coloridas (brilhantes) no guarda-mão e no cano |
| `chamas` | Tunado com Adesivo de Chama | preto fosco, faixa laranja, adesivos de chama nas laterais |
| `vovo` | do Vovô | metal azulado, madeira avermelhada, latão |
| `ouro` | Dourado Ostentação | todo dourado, um rubi de cada lado |

O pente duplo com fita aparece em qualquer rifle com mais de 30 balas (o Pente, ou o Dourado, que já tem 40).

- **Altura da linha de mira (`sightY`)** define a pose de ADS. A pistola e a submetralhadora têm também uma distância de ADS própria (`adsZ`: −0,46 e −0,42), "a pistol is held out farther".
- Partes que brilham (ponto vermelho, retículo, ponto da massa da pistola, lente) são `MeshBasicMaterial` e ficam fora do merge, "para continuarem claras".

Paletas em `LOOKS` (`weaponModels.ts`); ver também [[Material Palette]].

## Facas (7)

`knifeModel(faca)` com `faca` = `KnifeId`, segurado pelo punho na origem, apontando para −Z. Em primeira pessoa, as que não são `faca` são 20% maiores e usam o golpe em arco (`SWING_KEYS`) em vez da estocada.

| Faca | Construção |
| --- | --- |
| `faca` (padrão) | lâmina + ponta, guarda e cabo de madeira |
| `colher` | colher de pau: cabo fino e concha oval de madeira clara |
| `frango` | frango amarelo segurado pelos pés: corpo comprido, asas, pescoço, crista vermelha, bico aberto, olhos |
| `baguete` | cápsula de casca dourada com cinco cortes claros |
| `peixe` | peixe azul-acinzentado segurado pela cauda, com olho, barbatana e pontos de gelo |
| `macarrao` | cilindro de espuma verde de 60 cm, com o furo na ponta |
| `sabre` | cabo prateado e lâmina rosa-choque com brilho aditivo |

## Granadas e mina

| Item | Modelo | Fonte |
| --- | --- | --- |
| Granada de fragmentação (padrão) | corpo verde-oliva, cinta, espoleta, alavanca e argola | `grenadeModel` em `weapons/grenades.ts` |
| Mina terrestre (melhoria opcional, nível 2) | disco oliva, placa de pressão e LED vermelho que pisca | `mineModel` em `weaponModels.ts` |
| Dose Dupla (melhoria opcional, nível 3) | duas granadas lado a lado na mão | `Viewmodel.setGrenadeKind('dupla')` |
| Granada-pato (poção "pato") | pato amarelo de borracha | `duckModel` em `weapons/grenades.ts` |

Ver [[Grenades]], [[Land Mines]] e [[Buffs & Debuffs]].

## Primeira pessoa x terceira pessoa

| | Primeira pessoa (`Viewmodel`) | Terceira pessoa (`heldWeapons.ts`) |
| --- | --- | --- |
| Cena | `vmScene`, câmera própria ([[ADR - Viewmodel em cena e câmera próprias]]) | cena do mundo, presa a sockets do personagem |
| Armas de fogo | um *kit* por visual (`gunModelKey`), montado uma vez e guardado: trocar de arma não custa nada; partes rígidas + braços fundidos num mesh toon (`bakeStaticParts`); carregador, clarão e brilhos separados. `setGun` põe a arma na mão (e refaz os braços quando a mão de apoio muda entre guarda-mão e punho de pistola); `draw(s)` faz a arma subir de baixo durante o tempo de saque | `heldGun(g)`: um mesh por visual, cache `gun|<gunModelKey>`. Na mão (`hand_R`) ficam as duas armas, só a que está na mão aparece; a primária fica nas costas (`back`), inclusive enquanto a secundária está na mão |
| Faca | aparece só durante o golpe, na mão direita (ou espelhada para a esquerda sem mão direita) | `heldKnife(form)`, na mão durante o golpe; a arma de fogo vai para as costas |
| Granada | mão esquerda, tremendo enquanto "cozinha" | mão esquerda, com o arremesso animado |
| Material | `MeshToonMaterial` com cor por vértice | **um** material toon compartilhado por todas as armas de todos |
| Brilhos | mantidos | descartados ("minúsculos de longe") |

Em primeira pessoa a arma tem origem no receptor; em terceira, no punho (`RIFLE_FROM_GRIP = (0, 0,035, −0,09)`). Como todas as armas têm o punho no mesmo lugar, o mesmo deslocamento serve para todas. Em terceira pessoa, a mão esquerda vai ao ponto de `ANIM.leftGrip[hold]` (`AvatarPose.hold`, em `client/character/animator.ts`) — ver [[Animation]].

### Braços em primeira pessoa

Antebraço e mão do próprio personagem, gerados com o mesmo corpo facetado (`viewmodelArms.ts`), com o punho fechado pelo morph (direita 0,92, esquerda 0,42), manga longa ou braço nu, luvas, e PCD. Geometria em cache por combinação. Ver [[Character Customization]].

## Código relacionado

- `client/render/weaponModels.ts` (`gunParts`, `gunModelKey`, `holdOf`, `sight`, `isScope`, `LOOKS`, `knifeModel`, `mineModel`, `glowMat`)
- `client/render/viewmodel.ts` (`setGun`, `draw`, `setKnife`, `setGrenadeKind`, `bakeStaticParts`, `flashTexture`)
- `client/render/viewmodelArms.ts` (`armMesh`, `placeArm`)
- `client/entities/heldWeapons.ts` (`heldGun`, `heldKnife`, `heldGrenade`)
- `client/entities/avatar.ts` (`setLoadout`: as duas armas na mão, a primária nas costas)
- `client/character/animator.ts` (`GunHold`, `ANIM.leftGrip`)
- `client/weapons/grenades.ts` (`grenadeModel`, `duckModel`)
- `client/character/registry.ts` (itens `rifle`, `rifle_costas`)
- `shared/data/progression.json` (miras), `shared/data/weapons/rifle_*.json` (`visual`), `shared/arsenal.ts` (`GunStats`: `mira`, `visual`, `silenciador`, `pente`)

## Ver também

[[Weapons]] · [[Progression]] · [[Animation]] · [[Visual Effects]] · [[Material Palette]]
