---
title: Map - Rua dos Vizinhos
type: map
status: documented
area: world
source_paths:
  - client/world/blockoutMap.ts
  - client/world/vehicles.ts
  - client/world/hydrant.ts
  - client/world/dog.ts
  - client/world/decor.ts
  - client/world/gltfMap.ts
  - public/models/casinha_cachorro.glb
  - shared/maps.ts
  - server/app.ts
  - README.md
  - docs/MAPAS.md
tags:
  - world
  - map
  - rua
updated: 2026-10-05
---

# Map - Rua dos Vizinhos

| Campo | Valor |
| --- | --- |
| Id interno | `rua` (mapa padrão, `DEFAULT_MAP`) |
| Sessão fixa | id `principal`, nome "Rua dos Vizinhos" |
| Construtor | `buildBlockoutMap` (`client/world/blockoutMap.ts`) |
| Tamanho | 80 × 60 m (x −40..40, z −30..30) |
| Atmosfera | dia ensolarado padrão (sem `atmosphere` próprio), nuvens e passarinhos |
| Célula de lote | 40 m (padrão) |
| `killY` | −20 |

## Visão geral

Bairro residencial em estilo cartunesco, o primeiro mapa do projeto e o mapa de **blockout** feito em código. Organizado em **três faixas leste-oeste**: casas de dois andares ao norte, a rua com carros no centro e quintais cercados ao sul. É também o único mapa com um **perigo letal** (a cachorra Amora) e o exemplo de prop carregado de glTF (a casinha dela). Visual: [[Environment Pieces]], [[Props Catalog]], [[Procedural Textures]].

## Layout

Norte é −Z (topo do esquema).

```text
z=-30  ████████████████████ muro de tijolo 4 m ████████████████████
       faixa dos fundos (z -30..-23.5)
z=-23  [ casa  x -24..-12 ] [ casa  x -6..6 ] [ casa  x 12..24 ]   ← 12 × 9 m, 2 andares
z=-14  arbustos, árvores de rua (z -12.2), placa "VENDE-SE"
z=-10  ── calçada (0,15 m) ── postes, caixas de correio, hidrantes
z=-7   VAN(A)   carros     CAMINHÃO DE SORVETE     carros   GARAGEM(B)
z= 0   ═════════════════════ rua (asfalto) ═════════════════════
z= 7   ── calçada ──
z=11   ▬▬ cerca de madeira 1,8 m com 4 portões ▬▬
       quintal oeste │  quintal central (piscina, casa na árvore) │ quintal leste (casinha da Amora, torre)
z=30   ████████████████████████████████████████████████████████████
       x=-40                          x=0                         x=40
```

Pontos de referência (coordenadas x, z):

| Elemento | Posição / medidas |
| --- | --- |
| Casas (3) | centros x = −18, 0, 18; z = −19; 12 × 9 m; andares de 3 m; telhado de duas águas com cumeeira paralela à rua; chaminé |
| Rua | asfalto z −7..7; calçadas z −10..−7 e 7..10 |
| Caminhão de sorvete | centro da rua (~x 1) |
| Carros estacionados | (−24, −5), (−8, 5), (8, −5,2), (26, 4,8), (−30, 5) |
| Caixotes altos (2 m) | x −33..−31 / z −3..−1 e x 31..33 / z 1..3 |
| Cerca sul | z = 11, portões em x −30..−27, −12..−9, 8..11, 26..29 |
| Cercas entre quintais | x = −22 e x = 13 (z 11..30), portão em z 18..21 |
| Piscina vazia | x −6..6, z 16..24, 2 m de profundidade; rampa a leste (~20°), degraus a oeste |
| Casa na árvore | centro (−15, 22), plataforma a 3 m, escada a oeste |
| Torre de vigia | x 30..33,5, z 25,5..30, piso a 7 m, escada longa ao longo do muro sul |
| Casinha da Amora | (36, 14,5), escala 1,6, porta virada para +Z (quintal) |
| Base A (laranja) | oeste: van de mudança em (−35,25, −6,9), faixa pintada x −39,8..−37,8 |
| Base B (azul) | leste: garagem de tijolo em x 34..40, z −8,3..−2, teto de metal a 3,2–3,5 m |

## Rotas principais

- **A rua** (eixo leste-oeste): o caminho mais direto entre as bases, com cobertura de carros e do caminhão de sorvete, que fica no meio "para quebrar a linha de visão longa da rua" (comentário do código).
- **Calçadas**: correm junto às casas e às cercas, com postes, hidrantes e caixas de correio.

## Rotas alternativas

- **Fileira de casas**: cada casa tem porta da frente, porta dos fundos e **duas portas laterais** (z −17,5), de modo que a fileira pode ser **atravessada de ponta a ponta por dentro** (comentário de `buildHouse`). Janelas do térreo (peitoril 0,9 m, topo 2,3 m) dão para atravessar pulando agachado.
- **Faixa dos fundos** (z −30..−23,5): corredor atrás das casas.
- **Quintais**: atravessados pelos portões das cercas; a piscina é um corredor rebaixado (−2 m) com rampa e escada.

## Áreas abertas

- A rua e as calçadas (16 m de largura somando calçadas).
- Os quintais, com flamingos e árvores como cobertura leve.

## Áreas fechadas

- Interior das 3 casas (térreo e andar de cima, escada interna ao longo da parede dos fundos, com guarda-corpo).
- Garagem da base B (parede de 3,2 m e teto).

## Cobertura

- Carros (colidem como caixas de metal), caminhão de sorvete, van, caixotes de 2 m.
- Cercas de madeira de 1,8 m (0,15 m: **a bala atravessa**, ver [[Cover & Combat Spaces]]).
- Paredes das casas (reboco 0,3 m: **param a bala**).
- Árvores e arbustos: só visuais (a bala passa pela folhagem; o tronco colide).

## Spawn points

- **A** (5): x = −38 em z 0, ±3 (olhando +X) e no quintal oeste (−36, 13,5), (−36, 20).
- **B** (3): (38, 0), (38, 3), (36, 20) (olhando −X).
- **FFA** (21): térreo e andar de cima das casas (3,2 m), vãos entre casas, faixa dos fundos, pontas da rua, calçadas, quintais, casa na árvore (3,2 m) e torre (7,2 m).
- No treino offline usa-se A; online e contra bots, FFA. Ver [[Spawn Design]].

## Bonecos de treino (12)

Na rua a ~20 m e ~45 m do spawn oeste ("para sentir a queda de dano do rifle"), patrulhando na rua, em frente à garagem, no térreo e nas janelas do andar de cima, na piscina (patrulhando), na casa na árvore, na torre e num quintal. Ver [[Training]].

## Objetivos

Nenhum objetivo de mapa (não há bandeira, zona ou bomba). O modo é mata-mata livre. Ver [[Objectives]] e [[Free For All]].

## Zonas especiais

- **Zona de mordida da Amora**: faixa em frente à porta da casinha (~2,7 m de largura × 2,3 m de profundidade). Entrar nela = morte instantânea (causa `dog` no killfeed). A malha dos bots exclui essa zona (ampliada em 0,3 m).
- **Piscina**: fosso de 2 m dentro do mapa (não há vazio letal; `killY` −20).
- **Torre de 7 m**: um guarda-corpo alto fica sobre o muro perimetral para ninguém cair para fora do mapa.

## Objetos interativos

Caminhão de sorvete (jingle), 3 hidrantes (jato e arremesso), 4 flamingos (giram), Amora (mordida) e latido da casinha (`GAG_LATIDO`). Ids e detalhes em [[Interactive Objects]]; mecânica em [[Map Gags]]. Placas de humor: "VENDE-SE / Vizinho barulhento incluso no preço", "CUIDADO / Cão bravo (e muito fofo)", "RUA DOS VIZINHOS / Proibido estacionar tanque".

## Fluxo esperado dos jogadores

> [!info]
> Inferência a partir do layout e dos comentários; não há telemetria.

- Em times (design original), A sai da van a oeste e B da garagem a leste; o encontro natural é no meio da rua, em volta do caminhão.
- No mata-mata livre, os spawns FFA espalham os jogadores pelas casas e quintais; o combate tende a alternar entre a rua (média/longa distância) e interiores/quintais (curta).
- Posições elevadas (torre a 7 m, janelas do andar de cima, casa na árvore) dominam a rua e os quintais; a torre tem uma única escada longa e exposta.

## Problemas conhecidos

- Os spawns **B** não são usados por nenhum modo atual (só A no treino e FFA nos outros). Ver [[Spawn Design]].
- Os comentários citam "section 10" de um documento de design que não está no repositório.
- A casinha da Amora vem de um `.glb`; se o arquivo falhar ao carregar, o mapa segue **sem a casinha e sem a Amora** (`try/catch` com aviso no console).

## Código relacionado

- `client/world/blockoutMap.ts` — `buildBlockoutMap`, `buildHouse`.
- `client/world/vehicles.ts` — `buildCar`, `buildVan`, `buildIceCreamTruck`.
- `client/world/hydrant.ts` — `Hydrant`, `WaterDrops`.
- `client/world/dog.ts` — `ChowChow`, `namePlate`.
- `client/world/decor.ts` — flamingos, nuvens, enfeite do caminhão.
- `public/models/casinha_cachorro.glb` — gerado por `tools/gerar-props-exemplo.mjs`.
