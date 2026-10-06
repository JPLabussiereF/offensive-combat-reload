---
title: Land Mines
type: mechanic
status: documented
area: gameplay
source_paths:
  - client/weapons/mines.ts
  - client/weapons/grenades.ts
  - client/main.ts
  - server/session.ts
  - shared/data/progression.json
  - shared/arsenal.ts
tags:
  - game
  - gameplay
  - grenades
  - mines
updated: 2026-10-06
---

# Land Mines

> [!info] Evidência
> Código confirmado: `client/weapons/mines.ts` (`Mines`, `ARM_TIME`, `TRIGGER_RADIUS`, `MAX_MINES`), `plantMine` em `client/main.ts`, `server/session.ts` (case `grenade` com `mine`, `onBoom`, `respawn`).

## Objetivo

Variante defensiva da granada: armadilha para controlar rotas e proteger o ponto onde se está. É uma **melhoria opcional** liberada no **nível 2 da granada** ("Mina Terrestre", 700 pontos com a granada), do grupo `modo` junto com a Dose Dupla: só uma das duas fica ligada. Ver [[Weapons]] e [[Progression]].

## Como o jogador interage

Com a melhoria Mina Terrestre ligada no Arsenal (tipo `mina` em `grenadeStats`), **apertar G** planta uma mina no chão, **0,6 m à frente dos pés** (raio para baixo de até 3 m acha o piso). Não há cozimento.

## Regras

| Regra | Valor |
|---|---|
| Custo | 1 carga de granada (mesmo contador e recarga de 10 s — ver [[Grenades]]) |
| Tempo para armar (`ARM_TIME`) | 1 s (LED pisca a 2 Hz armando, 5 Hz armada) |
| Gatilho | pés de um inimigo a < 1,1 m na horizontal e < 1,2 m na vertical |
| Máximo de minas próprias (`MAX_MINES`) | 3 (cliente e servidor) |
| Intervalo entre plantios | 0,8 s (`intervalo` da granada) |
| Dano | mesma explosão da granada (85 → 12, raio 7 m, ×1,2 com a Pólvora; paredes bloqueiam) — [[Damage System]] |

- Ao atingir o limite, nada é plantado, a carga volta e aparece "Máximo de 3 minas no mapa".
- **Duração: só a vida do dono.** As minas somem quando o dono renasce (`clearOwner`) ou sai da sessão. Elas continuam visíveis enquanto o dono está morto.
- O dono não dispara a própria mina pisando (a lista de "inimigos" exclui o jogador), mas sofre dano se estiver perto quando ela explode.

## Estados possíveis

`armando (< 1 s)` → `armada` → `detonada` | `removida (dono renasceu/saiu)`.

## Entradas / Saídas

Entrada: G (evento `mine` do `GrenadeThrower`), posições dos pés dos inimigos. Saída online: `grenade {id, p, v:[0,0,0], fuse:0, mine:true}` ao plantar (todos veem a mina) e `boom` ao detonar.

## Dependências

[[Grenades]], [[Damage System]], [[Respawn]], [[Remote Calls]], [[Weapon Models]] (`mineModel`).

## Exceções

> [!note] Comportamento confirmado pelo código (não descrito explicitamente)
> - Quem detecta o gatilho é **o cliente do dono**: a checagem `mines.triggered(...)` só roda no ramo "vivo" do tick. Logo, **enquanto o dono está morto, suas minas não explodem** (ficam só visuais até ele renascer).
> - O servidor apaga todas as granadas/minas registradas do jogador quando ele morre (`victim.grenades.clear()` em `kill`), então um `boom` de mina de uma vida anterior seria recusado de qualquer forma.

- O servidor aceita a explosão de mina só a ≤ 1,5 m de onde foi plantada ("mines don't move").
- O servidor só aceita `mine: true` se a granada do jogador, com as melhorias do loadout, for do tipo `mina` (`grenadeStats(loadout.ativas.granada).tipo`).
- Contra bots e no campo de tiro, os alvos que disparam a mina são os bots/bonecos vivos.

## Código relacionado

- `client/weapons/mines.ts` — `Mines.place`, `remove`, `clearOwner`, `triggered`, `update`, `groundAt`.
- `client/weapons/grenades.ts` — `GrenadeThrower.update` (ramo `kind === 'mina'`).
- `client/main.ts` — `plantMine`, checagem de gatilho no tick, handlers `grenade`/`boom`/`spawned`/`playerLeft`.
- `server/session.ts` — case `grenade` (limite de 3 minas), `onBoom`, case `respawn` (descarta minas).

## Configurações relacionadas

Constantes locais de `mines.ts` (`ARM_TIME`, `TRIGGER_RADIUS`, `TRIGGER_HEIGHT`, `MAX_MINES`) — **não** ficam em `shared/constants.ts`; o servidor repete o número 3 literalmente. Ver [[Constants Reference]].
