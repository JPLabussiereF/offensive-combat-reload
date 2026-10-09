---
title: Navigation
type: system
status: documented
area: ai
source_paths:
  - server/mapWorker.ts
  - client/ai/navmesh.ts
  - client/ai/bot.ts
  - client/main.ts
  - client/world/physics.ts
  - shared/constants.ts
  - package.json
  - tools/bake-navmesh.ts
  - server/navmesh.ts
  - shared/data/navmesh/cemiterio.json
  - shared/barricades.ts
  - shared/zombieMatch.ts
tags:
  - ai
  - navigation
  - navmesh
  - recast
updated: 2026-10-09
---

# Navigation

## Responsabilidade

`NavMap` (`client/ai/navmesh.ts`) gera e consulta a **malha de navegação** dos bots com a biblioteca `recast-navigation` (dependência `^0.43.1` no `package.json`). No navegador só existe offline (**Contra bots**, incluindo o zumbi solo): `client/main.ts` faz `await NavMap.build(...)` apenas se `botMode`.

A **mesma malha** é usada pelo servidor para os zumbis online (ver "Malha pré-gerada para o servidor" abaixo).

## Entrada

- O `World` do Rapier já com o mapa construído (`physics`).
- Uma lista opcional de caixas a evitar (`avoid: THREE.Box3[]`). Hoje só a zona de mordida da Amora, expandida em 0,3 m: `map.dog.zone.clone().expandByScalar(0.3)`.

## Como a malha é gerada (código confirmado)

1. `await init()` do Recast (WASM).
2. Percorre `physics.world.forEachCollider` e usa **só colisores do corpo estático do mapa e habilitados** (`c.parent()?.handle === physics.staticBody.handle && c.isEnabled()`). Personagens, bonecos e projéteis são obstáculos dinâmicos e ficam de fora.
3. Converte cada forma em triângulos no espaço do mundo: `Cuboid` → `BoxGeometry`; `Cylinder` → `CylinderGeometry` de 8 lados; `TriMesh`/`ConvexPolyhedron` → índices do Rapier ou, quando o casco convexo não tem faces (escadas em cunha, telhados), `ConvexGeometry` a partir dos pontos.
4. Acrescenta as caixas de `avoid` como sólidos (o Recast trata como obstáculo e a malha contorna).
5. `generateSoloNavMesh(positions, indices, config)`.

Como a fonte são os **colisores**, e não a malha visual, folhagem, acabamentos e folhas de porta não bloqueiam; paredes e carros bloqueiam. Funciona igual para mapas feitos em código e mapas glTF (comentário do arquivo).

### Parâmetros do Recast

| Parâmetro | Valor | Origem |
| --- | --- | --- |
| `cs` (voxel horizontal) | 0,175 m | `CS` |
| `ch` (voxel vertical) | 0,1 m | `CH` |
| `walkableSlopeAngle` | `MOVE.maxSlopeDeg + 1` = 46° | `shared/constants.ts` |
| `walkableHeight` | `ceil(MOVE.heightStand / ch)` = 18 voxels (1,8 m) | idem |
| `walkableClimb` | `floor(MOVE.stepHeight / ch)` = 4 voxels (0,4 m) | idem |
| `walkableRadius` | `ceil(MOVE.radius / cs)` = 2 voxels (0,35 m de raio) | idem |
| `maxEdgeLen` | `round(12 / cs)` | — |
| `maxSimplificationError` | 1,3 | — |
| `minRegionArea` / `mergeRegionArea` | 8 / 20 | — |
| `maxVertsPerPoly` | 6 | — |
| `detailSampleDist` / `detailSampleMaxError` | 6 / 1 | — |

As dimensões do agente vêm das mesmas constantes de `MOVE` que o movimento usa, então o que a malha considera caminhável bate com o que o controlador consegue andar.

## Saída / consultas

| Método | Uso |
| --- | --- |
| `closest(p)` | Ponto caminhável mais próximo (meia-extensão de busca 1,5 × 4 × 1,5 m) |
| `path(from, to)` | Lista de **cantos** do caminho (`computePath`), primeiro ponto = início; `null` se falhar |
| `randomPoint()` | Ponto aleatório da malha (destino do modo vagar) |
| `randomAround(p, radius)` | Ponto aleatório num círculo (destino de fuga) |
| `debugMesh()` | Malha translúcida ciano da área caminhável (F4) |

Também guarda `buildMs` (tempo de geração) e `triangles` (triângulos de entrada) para medição.

## Como o bot segue o caminho

Em `client/ai/bot.ts`:

- `setGoal(w, goal)` calcula `nav.path(curr, goal)` e começa do índice 1; marca `repathAt = time + 1`.
- `followPath()` devolve a direção horizontal até o próximo canto, avançando quando está a menos de 0,45 m.
- Enfrentando um alvo a mais de 24 m, recalcula o caminho até ele no máximo a cada 1 s.
- **Anti-travamento** a cada 0,8 s: se quis andar e se moveu menos de 0,35 m, pula; na 2ª vez recalcula o caminho para o mesmo destino; na 4ª escolhe um destino aleatório novo.

Detalhes das decisões em [[AI Decisions]].

## Depuração

`F4` alterna: hitboxes → hitboxes + colisores do mapa e **a navmesh dos bots** → desligado (`client/main.ts`). Em dev, `window.__ocNavDebug` guarda a malha.

## Malha pré-gerada para o servidor (modo zumbi)

O servidor não monta mapas; para mover os zumbis online ele carrega uma navmesh **gerada em tempo de desenvolvimento** ([[ADR - Zumbis simulados no servidor sobre navmesh pré-gerada]]):

- `tools/bake-navmesh.ts` (`bun run navmesh`) monta o mapa **headless em Bun** com o próprio código do cliente (`client/world/*`, com um canvas que não desenha) e chama `NavMap.build`: as mesmas configurações e os mesmos colisores dos bots. Exporta com `exportNavMesh` para `shared/data/navmesh/<mapa>.json` (base64, com tamanho e hash). Hoje: só `cemiterio` (~117 KB, 789 polígonos), o mapa oficial do modo zumbi (`exclusivo: 'zumbi'`). Esse arquivo semeia a versão 1 do mapa no banco (`seedOfficialMaps`); daí em diante o servidor guarda a navmesh **com cada versão salva** (`map_version.navmesh`) e a gera ao salvar um mapa zumbi, na thread de montagem (`server/mapWorker.ts`, o mesmo `NavMap.build` com as brechas). `server/navmesh.ts` carrega a de cada versão uma vez por processo (chave `mapa@versão`).
- `server/navmesh.ts` carrega a malha uma vez por processo (`importNavMesh`, depois de iniciar o WebAssembly do Recast), compartilhada por todas as sessões do mapa.
- `ZombieMatch` (`shared/zombieMatch.ts`) usa uma `Crowd` do Detour por sessão (até 64 agentes) para seguir caminho e espaçar a horda, `findClosestPoint`/`findRandomPointAroundCircle` para pontos de surgimento (pontos além de 1,5× o raio são recusados: o Detour pode devolver um ponto qualquer de um polígono grande que só toca o círculo) e `raycast` na malha como linha de visão (cuspe da Tia da Fofoca, investida do Prefeito).
- A geração é determinística (o mapa usa aleatoriedade com semente): `server/tests/zombies.test.ts` refaz a malha e compara o hash. **Mudou o mapa do cemitério (`shared/data/mapas/cemiterio.json`, inclusive as brechas no campo `zumbi`), rode `bun run navmesh`** (a malha é feita a partir do JSON), senão o teste falha.
- **Escadas no mapa de um modo zumbi:** a malha só sobe rampas de até 46° (`walkableSlopeAngle`) e degraus de até 0,4 m (`walkableClimb`, o degrau do jogador). Um lance curto sem `suave` (o `gentle` de [[ADR - Escadas com colisão em rampa sólida]]) vira uma rampa mais íngreme que isso e o andar de cima fica **fora da malha**: os zumbis param no ponto andável mais perto do alvo, mesmo do outro lado de uma parede. Foi o que deixava a capela do [[Map - Cemitério da Capela]] fora do alcance da horda até a PF-67 (09/10/2026).
- Offline, o zumbi solo gera a malha na hora no navegador com as mesmas caixas de brecha (é a mesma malha).

### Brechas e barricadas

O mapa do modo zumbi tem um muro com cinco brechas que os jogadores podem barricar ([[ADR - Barricadas como polígonos próprios na navmesh]]):

- **Na geração**: com `areas` (as caixas de `gateAreas`, `shared/barricades.ts`), `NavMap.build` troca o `generateSoloNavMesh` por `soloNavMeshWithAreas`, o mesmo gerador passo a passo com `rcMarkBoxArea` depois da erosão: cada brecha vira **polígonos só dela** (área `i + 1`) com a flag `WALK_FLAG | gateFlag(i)`; o resto do chão, área 0 e `WALK_FLAG`. Sem `areas` (os mapas dos bots), nada muda.
- **Na partida**: barricada fechada = a flag da brecha no `excludeFlags` do filtro 0 do crowd (`FILTER_AROUND`) e do filtro padrão das consultas da partida; o filtro 1 (`FILTER_THROUGH`) não exclui nada. A malha compartilhada nunca é alterada. Quem contorna usa o 0; o Segurança e os chefes (e todos, quando não há brecha aberta) usam o 1 até chegar às tábuas, e então trocam para o 0, que os segura ali até a última tábua cair.
- **Caminhos sob demanda**: cada pedido de caminho reinicia uma busca na fila de caminhos do crowd (100 passos por tick, compartilhados). O motor só pede outro caminho quando o alvo andou o bastante para a distância e não antes de 0,4/1,5/4 s (perto/médio/longe); com o alvo parado, guarda o caminho. Sem isso, a horda com caminhos longos em volta do muro só seguia o caminho parcial rápido e encostava no muro pela brecha fechada mais próxima.

## Falhas

Se a geração falhar, `console.warn('[bots] falha ao gerar a malha de navegação')` e `NavMap.build` devolve `null`; o `BotManager` só é criado com navmesh (`if (botMode && nav)`). Ver [[Error Handling]].

## Limitações

- Malha estática, gerada uma vez: colisores que mudam durante a partida (por exemplo, os do rato gigante, desabilitados quando ele morre) não atualizam a malha (inferência: não há reconstrução nem obstáculos dinâmicos do Recast no código).
- Sem links fora da malha (off-mesh links) para pulos; pular é só o recurso anti-travamento.
- O custo de gerar a malha entra no carregamento do modo bots (medido em `buildMs`). Gerada headless em Bun, a da Vila Assombrada levava ~0,5 s (mapa ~0,6 s antes); a do cemitério, ~0,45 s com o mapa. Ver [[Loading Performance]].
- O caixão e as tábuas das barricadas do modo zumbi (e outros objetos que não estão nos colisores estáticos do mapa) não entram na malha: zumbis podem encostar no caixão; nas brechas, as tábuas são regra do motor (os filtros), não geometria. Um jogador num lugar fora da malha (em cima de um carro) fica fora do alcance dos arranhões.

## Código relacionado

- `client/ai/navmesh.ts` (`NavMap.build` com `areas`, `soloNavMeshWithAreas`, `path`, `randomPoint`, `randomAround`, `debugMesh`)
- `client/ai/bot.ts` (`setGoal`, `followPath`, anti-travamento em `fixedUpdate`)
- `client/main.ts` (construção em modo bots, depuração F4)
- `shared/constants.ts` (`MOVE`)
- `tools/bake-navmesh.ts`, `server/navmesh.ts`, `shared/data/navmesh/cemiterio.json`, `shared/barricades.ts`, `shared/zombieMatch.ts` (servidor, modo zumbi)

Ver também: [[AI Overview]], [[Movement]], [[World Structure]].
