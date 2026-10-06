---
title: Maps Index
type: reference
status: documented
area: world
source_paths:
  - shared/maps.ts
  - client/main.ts
  - client/ui/home.ts
  - server/app.ts
  - shared/mapData.ts
  - shared/data/mapas/rua.json
  - shared/data/mapas/jardim.json
  - shared/data/mapas/halloween.json
  - shared/data/mapas/cemiterio.json
  - client/world/mapLoader.ts
  - client/world/budget.ts
  - client/world/gltfMap.ts
  - shared/modes.ts
  - public/maps/arena_teste.glb
  - docs/MAPAS.md
tags:
  - world
  - maps
  - index
updated: 2026-10-06
---

# Maps Index

Porta de entrada da área **World & Maps**: lista os mapas do jogo, as regras que valem para todos eles e as notas transversais (estrutura, spawns, cobertura, objetos interativos).

## Mapas jogáveis

Os mapas jogáveis são registrados em `MAPS` (`shared/maps.ts`). O id interno é o que viaja na sessão online; o nome é o que aparece para o jogador. O conteúdo de cada mapa (peças, ambiente, spawns, objetos) é um arquivo de dados, `shared/data/mapas/<id>.json`, montado pelo carregador do cliente (ver [[World Structure]] e [[ADR - Mapas como dados com catálogo de peças]]).

| Nota | Id interno | Nome exibido | Tamanho (área jogável) | Clima / hora | Célula de lote | Sessão fixa no servidor |
| --- | --- | --- | --- | --- | --- | --- |
| [[Map - Rua dos Vizinhos]] | `rua` (padrão, `DEFAULT_MAP`) | Rua dos Vizinhos | 80 × 60 m | dia ensolarado (atmosfera padrão) | 40 m | id `principal` |
| [[Map - Jardim do Dragão]] | `jardim` | Jardim do Dragão | 90 × 90 m | noite com lanternas | 45 m | id `jardim` |
| [[Map - Vila Assombrada]] | `halloween` | Vila Assombrada | 120 × 110 m | noite com lua cheia | 60 m | id `halloween` |
| [[Map - Cemitério da Capela]] | `cemiterio` (**exclusivo do modo zumbi**) | Cemitério da Capela | 68 × 64 m (pátio murado de 40 × 36 m) | noite de névoa verde | 34 m | id `zumbi-cemiterio` (só zumbi) |

Dados e custo de desenho de cada mapa oficial (peças no JSON; pior caso medido por `client/world/budget.ts`, com a passada de sombra do sol; teto do editor: 400 chamadas de desenho e 750 mil triângulos):

| Mapa | Arquivo | Peças | Chamadas de desenho | Triângulos |
| --- | --- | --- | --- | --- |
| Rua dos Vizinhos | `rua.json` | 120 | 164 | 115.670 |
| Jardim do Dragão | `jardim.json` | 741 | 310 | 704.428 |
| Vila Assombrada | `halloween.json` | 1.010 | 265 | 642.603 |
| Cemitério da Capela | `cemiterio.json` | 339 | 80 | 122.322 |

**Mapas exclusivos**: um mapa pode ser feito para um modo só (`MAPS[id].exclusivo`). O Cemitério da Capela é do [[Zombie|modo zumbi]] e de nenhum outro: só esse modo o lista (`MODE_RULES.zumbi.maps`), e os demais modos, o campo de tiro e os seletores usam `PVP_MAPS` (todo mapa sem `exclusivo`), que é o padrão de `modeMaps` ([[ADR - Mapa exclusivo e barricadas no modo zumbi]]). Por isso o servidor não abre sala versus no cemitério, criar uma sala versus nele cai num mapa aberto e criar uma sala zumbi noutro mapa cai no cemitério.

Mapa de ferramenta (não aparece no seletor):

| Nota | Como abrir | Uso |
| --- | --- | --- |
| [[Map - Arena Teste (glTF)]] | `?mapa=/maps/arena_teste.glb` na URL | Exemplo/teste do pipeline Blender → glTF (36 × 36 m) |

> [!info]
> O id interno `halloween` não coincide com o nome exibido "Vila Assombrada", e a sessão fixa da Rua usa o id `principal` (comentário em `server/app.ts`: o id ficou de quando só existia a rua). Veja [[Glossary]].

## Notas transversais da área

- [[World Structure]]: sistema de coordenadas, contrato `GameMap`, como um mapa é montado (MapBuilder, superfícies, colisores, glTF).
- [[Map Design Rules]]: medidas de portas e janelas, escadas, muros, linhas de visão, determinismo, metas de desempenho.
- [[Level Flow]]: como o mapa é escolhido, construído e entra na partida.
- [[Spawn Design]]: pontos de nascimento A/B/FFA e a escolha de spawn seguro.
- [[Cover & Combat Spaces]]: tipos de cobertura, materiais atravessáveis, posições elevadas e distâncias de combate por mapa.
- [[Interactive Objects]]: catálogo espacial de piadas, coletáveis, bichos e perigos de cada mapa.

## Visão comparativa

| Aspecto | Rua dos Vizinhos | Jardim do Dragão | Vila Assombrada |
| --- | --- | --- | --- |
| Estrutura | 3 faixas leste-oeste (casas, rua, quintais) | Casa central + anel + 6 setores murados | 8 regiões (floresta, estrada, cemitério, mansão, vila, parque, praça, esgoto) |
| Muro perimetral | tijolo, 4 m | reboco, 4,5 m | pedra, 4,5 m |
| Spawns A / B / FFA | 5 / 3 / 21 | 5 / 5 / 28 | 5 / 5 / 25 |
| Bonecos de treino | 12 | 13 | 13 |
| Nível mais baixo jogável | piscina, −2 m | leito do riacho, −1,2 m | esgoto, −4 m |
| Ponto mais alto ocupável | torre, 7 m | andar de cima do pavilhão da ilha (~3,65–3,85 m) e terraço do santuário (3 m) | telhado do mausoléu (~4,45 m) e andar de cima da mansão (3,6 m) |
| Coletável | — | cereja (`cereja`) | biscoito (`biscoito`) |
| Perigo do mapa | Amora (cachorro), mordida letal | — | — |
| Bichos/alvos especiais | — | carpas (koi) | rato gigante, bruxa |

`killY` (altura abaixo da qual o jogador morre por queda no vazio) é −20 nos três mapas versus (−10 no cemitério, que é plano). O cemitério fica fora desta comparação: é do modo zumbi, com muro baixo de grades, cinco brechas barricáveis, 16 pontos de nascimento no pátio e 24 de surgimento de zumbis fora do muro (ver a nota dele).

## Como adicionar um mapa

Confirmado em código e em `docs/MAPAS.md`:

1. Registrar o id em `MAPS` (`shared/maps.ts`), com `exclusivo` se for de um modo só, e as tabelas `PICKUPS`, `WITCHES`, `RATS`, `FISH` do mapa (vazias se não houver; o servidor ainda lê estas tabelas até a fase 2 da PF-6).
2. Escrever o mapa como dados em `shared/data/mapas/<id>.json` (formato `MapData`, peças do catálogo `shared/mapCatalog.ts`; ver [[World Structure]]), com os mesmos coletáveis, bruxa, ratos e peixes em `objetos`. `validateMapData` tem de passar e o custo de desenho tem de caber em 400 chamadas e 750 mil triângulos (`client/tests/mapData.test.ts` e `budget.test.ts` conferem os oficiais).
3. Ligar o arquivo em `OFFICIAL` (`client/world/mapLoader.ts`) e dar ao mapa um `MAP_LOOK` em `client/ui/home.ts`. Na fase 3 da PF-6 isso passa a ser feito pelo editor de mapas no jogo.
4. As salas fixas vêm sozinhas: uma por mapa em cada modo que o lista (`modeMaps`, `server/app.ts`).
5. Mapa do modo zumbi: os dados de zumbi no campo `zumbi` do JSON do mapa (lidos por `shared/zombies.ts` em `ZOMBIE.mapas`), o mapa em `MODE_RULES.zumbi.maps`, `bun run navmesh` (monta o mapa a partir do JSON) e a malha em `BAKED` (`server/navmesh.ts`).

## Relações com outras áreas

- Modos que usam os mapas: [[Free For All]], [[Gun Game]], [[Versus Bots]], [[Training]] (os mapas abertos) e [[Zombie]] (só o cemitério) (ver [[Game Modes Index]]).
- Escolha de mapa na interface: [[Menus]], [[Matchmaking UI]]; sessões: [[Sessions]].
- Aparência: [[Lighting]], [[Environment Pieces]], [[Procedural Textures]], [[Materials]], [[Props Catalog]].
- Navegação dos bots sobre os mapas: [[Navigation]].
- Desempenho por mapa: [[Performance Rendering]], [[Loading Performance]].

## Código relacionado

- `shared/maps.ts` — `MAPS` (com `exclusivo`), `MAP_IDS`, `PVP_MAPS`, `DEFAULT_MAP`, `PICKUPS`, `WITCHES`, `RATS`, `FISH`, `isMapId`.
- `shared/modes.ts` — `modeMaps` (a lista do modo, ou `PVP_MAPS`).
- `shared/data/mapas/*.json` — os mapas oficiais como dados; `shared/mapData.ts` e `shared/mapCatalog.ts` — formato e catálogo de peças.
- `client/world/mapLoader.ts` — `loadOfficialMap` (JSON no pacote do cliente) e `buildMapFromData`.
- `client/main.ts` — montagem do mapa escolhido (`loadOfficialMap(choice.map)` + `buildMapFromData`; `buildGltfMap` com `?mapa=`).
- `client/world/budget.ts` — `measureMapBudget` (chamadas de desenho e triângulos sem GPU).
- `client/ui/home.ts` — seletores de mapa (treino/bots, filtro e criação de sessão; só `PVP_MAPS` fora do modo zumbi).
- `server/app.ts` — `createSession` com uma sessão permanente por mapa e modo (`modeMaps`).
- `docs/MAPAS.md` — guia humano de criação de mapas.
