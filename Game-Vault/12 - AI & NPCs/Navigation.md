---
title: Navigation
type: system
status: documented
area: ai
source_paths:
  - client/ai/navmesh.ts
  - client/ai/bot.ts
  - client/main.ts
  - client/world/physics.ts
  - shared/constants.ts
  - package.json
tags:
  - ai
  - navigation
  - navmesh
  - recast
updated: 2026-10-05
---

# Navigation

## Responsabilidade

`NavMap` (`client/ai/navmesh.ts`) gera e consulta a **malha de navegação** dos bots com a biblioteca `recast-navigation` (dependência `^0.43.1` no `package.json`). Só existe no modo **Contra bots**: `client/main.ts` faz `await NavMap.build(...)` apenas se `botMode`.

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

## Falhas

Se a geração falhar, `console.warn('[bots] falha ao gerar a malha de navegação')` e `NavMap.build` devolve `null`; o `BotManager` só é criado com navmesh (`if (botMode && nav)`). Ver [[Error Handling]].

## Limitações

- Malha estática, gerada uma vez: colisores que mudam durante a partida (por exemplo, os do rato gigante, desabilitados quando ele morre) não atualizam a malha (inferência: não há reconstrução nem obstáculos dinâmicos do Recast no código).
- Sem links fora da malha (off-mesh links) para pulos; pular é só o recurso anti-travamento.
- O custo de gerar a malha entra no carregamento do modo bots (medido em `buildMs`; não há número registrado no repositório). Ver [[Loading Performance]].

## Código relacionado

- `client/ai/navmesh.ts` (`NavMap.build`, `path`, `randomPoint`, `randomAround`, `debugMesh`)
- `client/ai/bot.ts` (`setGoal`, `followPath`, anti-travamento em `fixedUpdate`)
- `client/main.ts` (construção em modo bots, depuração F4)
- `shared/constants.ts` (`MOVE`)

Ver também: [[AI Overview]], [[Movement]], [[World Structure]].
