---
title: Maps Index
type: reference
status: documented
area: world
source_paths:
  - server/maps.ts
  - server/mapRoutes.ts
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

Desde a PF-6 um mapa é **dados** (`MapData`): os 4 oficiais estão em `shared/data/mapas/<id>.json` (no pacote do cliente, para treino e bots sem servidor) e, no servidor, cada mapa — oficial ou da comunidade — é uma linha da tabela `map` com as suas **versões salvas** (`map_version`; a versão 1 dos oficiais é semeada desses JSON). O id interno é o que viaja na sessão online, com a versão; o nome vem dos dados. `shared/maps.ts` só guarda `OFFICIAL_MAPS`, `DEFAULT_MAP` e o tipo `MapId` (agora `string`). Ver [[World Structure]], [[ADR - Mapas como dados com catálogo de peças]] e [[ADR - Sessões sob demanda por versão do mapa]].

| Nota | Id interno | Nome exibido | Tamanho (área jogável) | Clima / hora | Célula de lote | Modos online |
| --- | --- | --- | --- | --- | --- | --- |
| [[Map - Rua dos Vizinhos]] | `rua` (padrão, `DEFAULT_MAP`) | Rua dos Vizinhos | 80 × 60 m | dia ensolarado (atmosfera padrão) | 40 m | mata-mata, corrida armada |
| [[Map - Jardim do Dragão]] | `jardim` | Jardim do Dragão | 90 × 90 m | noite com lanternas | 45 m | mata-mata, corrida armada |
| [[Map - Vila Assombrada]] | `halloween` | Vila Assombrada | 120 × 110 m | noite com lua cheia | 60 m | mata-mata, corrida armada |
| [[Map - Cemitério da Capela]] | `cemiterio` (**exclusivo do modo zumbi**) | Cemitério da Capela | 68 × 64 m (pátio murado de 40 × 36 m) | noite de névoa verde | 34 m | só zumbi |

As salas online abrem sob demanda (`play {map, mode}`), em qualquer mapa visível: os oficiais e os da comunidade ([[Matchmaking]]).

Dados e custo de desenho de cada mapa oficial (peças no JSON; pior caso medido por `client/world/budget.ts`, com a passada de sombra do sol; teto do editor: 400 chamadas de desenho e 750 mil triângulos):

| Mapa | Arquivo | Peças | Chamadas de desenho | Triângulos |
| --- | --- | --- | --- | --- |
| Rua dos Vizinhos | `rua.json` | 120 | 164 | 115.670 |
| Jardim do Dragão | `jardim.json` | 741 | 310 | 704.428 |
| Vila Assombrada | `halloween.json` | 1.010 | 265 | 642.603 |
| Cemitério da Capela | `cemiterio.json` | 339 | 80 | 122.322 |

**Mapas exclusivos**: um mapa pode ser feito para um modo só (`exclusivo` nos dados). O Cemitério da Capela é do [[Zombie|modo zumbi]] e de nenhum outro, e o zumbi só é jogado em mapas feitos para ele (`MODE_RULES.zumbi.ownMaps`); a regra é `modeAllowsMap(modo, exclusivo)` em `shared/modes.ts` ([[ADR - Mapa exclusivo e barricadas no modo zumbi]]). Por isso `play` de um modo versus no cemitério (ou do zumbi num mapa aberto) é recusado, criar uma sala versus nele cai no primeiro mapa oficial aberto e criar uma sala zumbi noutro mapa cai no cemitério. O campo de tiro e os seletores da tela inicial só oferecem os mapas sem `exclusivo`.

Mapa de ferramenta (não aparece no seletor):

| Nota | Como abrir | Uso |
| --- | --- | --- |
| [[Map - Arena Teste (glTF)]] | `?mapa=/maps/arena_teste.glb` na URL | Exemplo/teste do pipeline Blender → glTF (36 × 36 m) |

> [!info]
> O id interno `halloween` não coincide com o nome exibido "Vila Assombrada". As salas fixas (e o id `principal` da Rua) deixaram de existir na PF-6: toda sala abre sob demanda. Veja [[Glossary]].

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

**Pelo servidor (PF-6 fase 2):** `POST /api/mapas { tipo, dados }` com um `MapData` válido ([[APIs]]): o servidor valida os dados, monta o mapa numa thread própria (`server/mapWorker.ts`), recusa acima de 400 chamadas de desenho ou 750 mil triângulos e, se for zumbi (`exclusivo: 'zumbi'` com o campo `zumbi`), gera a navmesh. O mapa fica jogável online na hora. A fase 3 (editor no jogo) e a fase 4 (tela Mapas) usam essas rotas.

**Um mapa oficial novo no pacote do cliente** (para treino e bots offline):

1. Escrever o mapa como dados em `shared/data/mapas/<id>.json` (formato `MapData`, peças do catálogo `shared/mapCatalog.ts`; ver [[World Structure]]), com coletáveis, bruxa, ratos e peixes em `objetos`. `validateMapData` tem de passar e o custo de desenho tem de caber em 400 chamadas e 750 mil triângulos (`client/tests/mapData.test.ts` e `budget.test.ts` conferem os oficiais).
2. O id em `OFFICIAL_MAPS` (`shared/maps.ts`), o arquivo em `OFFICIAL` e o nome em `OFFICIAL_INFO` (`client/world/mapLoader.ts`), e um `MAP_LOOK` em `client/ui/home.ts`.
3. O servidor cria a versão 1 sozinho na próxima subida (`seedOfficialMaps`).
4. Mapa do modo zumbi: os dados de zumbi no campo `zumbi` e `exclusivo: 'zumbi'`; `bun run navmesh` grava a malha em `shared/data/navmesh/<id>.json`, que a semeadura guarda com a versão 1.

## Relações com outras áreas

- Modos que usam os mapas: [[Free For All]], [[Gun Game]], [[Versus Bots]], [[Training]] (os mapas abertos) e [[Zombie]] (só o cemitério) (ver [[Game Modes Index]]).
- Escolha de mapa na interface: [[Menus]], [[Matchmaking UI]]; sessões: [[Sessions]].
- Aparência: [[Lighting]], [[Environment Pieces]], [[Procedural Textures]], [[Materials]], [[Props Catalog]].
- Navegação dos bots sobre os mapas: [[Navigation]].
- Desempenho por mapa: [[Performance Rendering]], [[Loading Performance]].

## Código relacionado

- `shared/maps.ts` — `MapId` (string), `OFFICIAL_MAPS`, `DEFAULT_MAP`, `isMapId`, `isOfficialMap`, `PickupKind`.
- `shared/modes.ts` — `modeAllowsMap(modo, exclusivo)`.
- `server/maps.ts` — `MapRuntime`, `MapStore`, `seedOfficialMaps`, o construtor de mapas em thread; `server/mapRoutes.ts` — a API de mapas.
- `shared/data/mapas/*.json` — os mapas oficiais como dados; `shared/mapData.ts` e `shared/mapCatalog.ts` — formato e catálogo de peças.
- `client/world/mapLoader.ts` — `loadOfficialMap` (JSON no pacote do cliente) e `buildMapFromData`.
- `client/main.ts` — montagem do mapa: online, a versão da sala baixada por `fetchMapVersion` (`client/net/maps.ts`, cache em memória e IndexedDB); offline, `loadOfficialMap(choice.map)`; depois `buildMapFromData` (`buildGltfMap` com `?mapa=`).
- `client/world/budget.ts` — `measureMapBudget` (chamadas de desenho e triângulos sem GPU).
- `client/ui/home.ts` — seletores dos mapas oficiais (treino/bots, filtro, entrada rápida com `play` e criação de sessão; os exclusivos só no modo deles).
- `server/app.ts` — salas sob demanda (`sessionFor`, `enter`).
- `docs/MAPAS.md` — guia humano de criação de mapas.
