---
title: Props Catalog
type: asset
status: documented
area: art
source_paths:
  - client/world/furniture.ts
  - client/world/vehicles.ts
  - client/world/decor.ts
  - client/world/hydrant.ts
  - client/world/dog.ts
  - client/world/halloween.ts
  - client/world/oriental.ts
  - client/world/jardim/kit.ts
  - client/world/jardim/panda.ts
  - client/world/jardim/frutas.ts
  - client/world/jardim/peixes.ts
  - client/world/jardim/cereja.ts
  - client/world/gameMap.ts
  - shared/data/mapas/rua.json
  - client/entities/dummy.ts
  - public/models/casinha_cachorro.glb
  - docs/MAPAS.md
tags:
  - game
  - art
  - props
  - assets
updated: 2026-10-06
---

# Props Catalog

## Visão geral

Catálogo do **conteúdo visual** dos objetos de cenário. Todos são feitos de primitivas em código, exceto a casinha de cachorro (glTF). Há dois tipos:

- **Estáticos:** vão para os lotes do `MapBuilder` (sem draw call extra) com um colisor simples. Ver [[Environment Pieces]].
- **Animados/interativos:** meshes separados, com comportamento próprio. O que fazem em jogo está em [[Map Gags]] e [[Interactive Objects]]; aqui só a aparência e onde aparecem.

## Móveis e objetos genéricos (`furniture.ts`)

Feitos para a Vila Assombrada, "usáveis em qualquer mapa". Todos estáticos, com um colisor cada.

| Função | Objeto |
| --- | --- |
| `crate` | caixote com quinas e travessas |
| `hayBale` | fardo de feno amarrado |
| `barrel` | barril com aros |
| `bench` | banco de praça |
| `sofa`, `table`, `chair`, `bed` | sofá, mesa, cadeira, cama |
| `candle` | vela com cera, pavio e castiçal (chama no `Glow`) |
| `coffin`, `pew`, `suitOfArmor` | caixão, banco de igreja, armadura |
| `toyChest`, `rockingHorse` | baú de brinquedos, cavalinho de balanço |
| `bookshelf` | estante com livros de alturas, espessuras e cores variadas |
| `potion` | frascos com líquido aceso (3 formatos) |

## Rua dos Vizinhos

| Prop | Fonte | Tipo |
| --- | --- | --- |
| Carros, van, caminhão de sorvete | `vehicles.ts` (`buildCar`, `buildVan`, `buildIceCreamTruck`): silhueta extrudada com caixas de roda, cabine com colunas e vidros, rodas com aro, para-choques, grade, faróis, **placas Mercosul**, retrovisores e frisos de porta | estático (colisão: algumas caixas) |
| Sorvete gigante no teto do caminhão | `decor.ts` `iceCreamTopper` | mesh separado |
| Flamingos de jardim | `decor.ts` `flamingoGeometry` | gag |
| Hidrantes | `hydrant.ts` (jato d'água ao levar tiro) | gag |
| Amora, a Chow Chow preta | `dog.ts`: corpo bem peludo, juba, orelhas pequenas, focinho curto, língua azul-escura, rabo enrolado | animado (perigo do mapa) |
| Casinha de cachorro | `public/models/casinha_cachorro.glb` | estático (glTF) + `GAG_LATIDO` |
| Nuvens | `decor.ts` `skyClouds` | ambiente |

## Vila Assombrada (`halloween.ts`)

| Grupo | Props |
| --- | --- |
| Estáticos | árvores secas (`deadTree`), lápides de 4 tipos (`arco`, `cruz`, `laje`, `obelisco`) com epitáfio, placas, abóboras com rosto aceso (`staticPumpkin`), trailer de circo com placa, carrinho de bate-bate |
| Animados/gags | fantasma da cova, sinos, abóboras que estouram, postes que apagam, caldeirão da bruxa e patinhos de borracha, espantalhos que caem e levantam, barraca de tiro ao alvo, roda-gigante, fogueira, abóbora gigante, relógio de pêndulo, cogumelos que brilham, morcegos, rato gigante do esgoto, bruxa, armário de cozinha, biscoito "Scooby" |

Paleta: `SPOOKY` ([[Material Palette]]).

## Jardim do Dragão (`oriental.ts`, `jardim/*`)

| Grupo | Props |
| --- | --- |
| Estáticos (kit) | caixote, vaso, biombo dobrável, incensário, leões guardiões (macho com a bola, fêmea com o filhote), mesa baixa com chá, banco, lanternas de pedra, bonsai, placas e inscrições em colunas, pinturas |
| Animados/gags | lanternas penduradas (balançam com tiro), gongo, sino de bronze, tambores (`struck`), dragão da fonte com baforada de fogo, panda mastigando bambu (`panda.ts`), carpas (normais e dourada, `peixes.ts`), cerejas penduradas e frutas das bancas (cortadas ao meio por tiro ou faca), a cereja coletável do pátio (`cereja.ts`) |
| Céu | 650 lanternas de papel subindo |

Paleta: `ORIENTAL` ([[Material Palette]]).

## Comuns a todos os modos

| Prop | Fonte |
| --- | --- |
| Bonecos de treino: personagens com visual variado e rifle na mão | `entities/dummy.ts` (ver [[Training]]) |
| Granadas, mina, pato-granada | ver [[Weapon Models]] |
| Corpos (humilháveis) | o próprio personagem bakeado ([[Character Models]]) |

## Código relacionado

- `client/world/furniture.ts`, `client/world/vehicles.ts`, `client/world/decor.ts`, `client/world/hydrant.ts`, `client/world/dog.ts`
- `client/world/halloween.ts`
- `client/world/oriental.ts`, `client/world/jardim/kit.ts` e demais arquivos de `client/world/jardim/`
- `client/world/props.ts` (`PropBus`: sincronização das piadas)

## Ver também

[[Environment Pieces]] · [[Interactive Objects]] · [[Map Gags]] · [[Maps Index]] · [[Asset Pipeline]]
