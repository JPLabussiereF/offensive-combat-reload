---
title: Constants Reference
type: reference
status: documented
area: reference
source_paths:
  - shared/constants.ts
  - shared/protocol.ts
  - shared/weapons.ts
  - shared/data/weapons/rifle_padrao.json
  - shared/data/weapons/faca.json
  - shared/data/weapons/granada_frag.json
  - shared/data/progression.json
  - shared/data/nivel_conta.json
  - shared/appearance.ts
  - client/weapons/mines.ts
  - client/gameplay/aimAssist.ts
  - client/entities/localPlayer.ts
  - client/main.ts
  - client/ai/bots.ts
  - client/world/hydrant.ts
  - server/session.ts
tags:
  - reference
  - constants
  - gameplay
updated: 2026-10-05
---

# Constants Reference

Tabela dos valores de gameplay como estão no código em 2026-10-05. **Fonte da verdade é o arquivo citado**; esta nota só facilita a busca e liga cada valor à nota que o explica. Unidades: metros, segundos, m/s, HP, graus (°) quando indicado.

> [!info] Onde cada coisa mora
> - `shared/constants.ts` — movimento, vida, coletáveis, poções, pontos, opressão, simulação, grupos de colisão (cliente **e** servidor).
> - `shared/protocol.ts` — `NET` (rede, sessão, chat, respawn).
> - `shared/data/weapons/*.json` e `shared/data/progression.json` — armas e seus níveis. Ver [[Configuration Data]].
> - Constantes **locais** de módulos do cliente/servidor (minas, assistência de mira, folgas de validação) — listadas no fim, porque não são compartilhadas.

## `MOVE` — movimento (`shared/constants.ts`) → [[Movement]]

| Constante | Valor | Uso |
|---|---|---|
| `walkSpeed` | 5,5 | andar |
| `sprintSpeed` | 8,0 | correr |
| `crouchSpeed` | 2,8 | agachado |
| `adsSpeed` | 3,5 | mirando |
| `jumpHeight` | 1,1 | altura do pulo |
| `gravity` | 22 | m/s² |
| `groundAccel` | 60 | aceleração no chão (m/s²) |
| `airControl` | 0,3 | fração da aceleração no ar |
| `eyeStand` / `eyeCrouch` | 1,65 / 1,05 | altura do olho |
| `stepHeight` | 0,4 | degrau automático |
| `maxSlopeDeg` | 45 | rampa máxima |
| `fallDamageHeight` | 6 | queda sem dano até aqui → [[Damage System]] |
| `fallDamagePerMeter` | 15 | dano = (h − 6) × 15 + 10 |
| `radius` | 0,35 | raio do cilindro do jogador |
| `heightStand` / `heightCrouch` | 1,8 / 1,2 | altura do colisor |
| `crouchTransition` | 10 | suavização do olho |
| `slideBoost` | 2,2 | impulso do slide |
| `slideMaxSpeed` | 10,5 | teto do slide |
| `slideFriction` | 7,5 | m/s² |
| `slideMaxTime` | 0,9 | duração máx. |
| `slideMinSpeed` | 3,4 | abaixo disso termina |
| `slideCooldown` | 0,5 | entre slides |
| `slideSteer` | 1,2 | rad/s de curva no slide |

## `HEALTH` → [[Health System]]

| Constante | Valor |
|---|---|
| `max` | 100 |
| `regenDelay` | 4 s |
| `regenPerSecond` | 25 |
| `lowThreshold` | 30 (som abafado) |

## Coletáveis e recompensas de mapa → [[Pickups]], [[Buffs & Debuffs]]

| Grupo | Constante | Valor |
|---|---|---|
| `CHERRY` | `extraHealth` / `duration` / `respawn` / `radius` | 50 / 30 s / 45 s / 1,2 m |
| `BISCUIT` | `respawn` / `radius` | 60 s / 1,1 m |
| `RAT` | `hits` / `stab` / `respawn` / `extraHealth` / `range` | 14 / 4 / 120 s / 50 / 30 m |
| `KOI` | `xp` / `goldenXp` / `goldenChance` | 1 / 100 / 0,05 |
| `KOI` | `respawn` / `goldenDuration` | [25, 45] s / 60 s |
| `KOI` | `spreadMul` / `recoilMul` / `range` | 0,5 / 0,6 / 80 m |
| `POTION` | `kinds` | `pato`, `veloz`, `lerdo`, `critico`, `bebado` |
| `POTION` | `duration` / `cooldown` / `radius` | 60 s / 60 s / 2,4 m |
| `POTION` | `fastSpeed` / `slowSpeed` | 1,3 / 0,7 |
| `POTION` | `drunkSpread` / `drunkRecoil` | 2,5 / 1,8 |

Posições: `PICKUPS`, `WITCHES`, `RATS`, `FISH` em `shared/maps.ts` (ver [[Maps Index]]).

## `SCORE` e `HUMILIATION` → [[Scoring]], [[Humiliation]]

| Constante | Valor |
|---|---|
| `SCORE.kill` | 100 |
| `SCORE.headshot` | 50 |
| `SCORE.longShot` / `longShotDistance` | 50 / > 50 m |
| `SCORE.knife` | 50 |
| `SCORE.backstab` | 50 |
| `SCORE.groin` | 100 |
| `SCORE.humiliation` | 150 |
| `HUMILIATION.window` | 6 s |
| `HUMILIATION.radius` | 2 m |
| `HUMILIATION.duration` | 3,2 s |

## `ACCOUNT_XP` (`shared/data/nivel_conta.json`) → [[Progression]]

| Campo | Valor |
|---|---|
| `porMinutoVivo` | 10 |
| `porAbate` | 25 |
| `porOpressao` | 50 |
| custo do nível n → n+1 | `round(1000 × n^1,5)` |

## `SIM` e `GROUP` → [[Shared Systems]]

| Constante | Valor |
|---|---|
| `SIM.dt` | 1/60 s (passo fixo) |
| `SIM.maxStepsPerFrame` | 5 |
| `GROUP.WORLD / PLAYER / HITBOX / BULLET / BLOCKER / PROJECTILE` | 0x01 / 0x02 / 0x04 / 0x08 / 0x10 / 0x20 (grupos de colisão Rapier) |

## `NET` (`shared/protocol.ts`) → [[Networking Overview]], [[Respawn]], [[Chat]]

| Constante | Valor |
|---|---|
| `tickRate` | 20 Hz (servidor) |
| `stateRate` | 20 Hz (envio do cliente) |
| `interpDelayMs` | 100 ms |
| `maxPlayers` | 10 por sessão |
| `nameMax` / `sessionNameMax` | 16 / 24 |
| `chatMax` / `chatBurst` / `chatEveryMs` | 120 caracteres / 4 / 1500 ms |
| `respawnDelay` | 5 s (cliente usa 5,3 s online) |
| `corpseWindow` | = `HUMILIATION.window` (6 s) |
| `port` / `path` | 8787 / `/ws` |
| `ONLINE_GRENADE_LEVEL` | 1 (nível de dano da granada online) |

## Rifle (`rifle_padrao.json`, nível 1) → [[Weapons]], [[Damage System]]

| Campo | Valor |
|---|---|
| `dano` max/min, distMax/distMin | 30 / 20, 20 m / 45 m |
| `multiplicadores` | cabeça 2,5 · pescoço 1,5 · peito 1,0 · abdômen 1,0 · quadril 0,9 · braços 0,75 · mãos 0,5 · coxas 0,75 · canelas 0,6 · virilha = morte |
| `cadencia` / `modo` | 700 rpm / `auto` |
| `pente` / `reserva` | 30 / 120 |
| `recarga` tática/vazia | 2,2 / 2,7 s |
| `dispersao` mirando/parado/andando/noAr | 0,1° / 0,8° / 1,8° / 4,0° |
| `dispersao` porTiro/decaimento | 0,2° / 6°/s |
| `recuo` vertical/horizontal/retorno | 0,9° / [−0,3°, 0,4°] / 8 |
| `ads` tempo/zoom | 0,22 s / 0,85 |
| `movimento` | 1,0 |
| `alcanceMaximo` | 300 m |
| `penetracao` | 2 superfícies; madeira 0,6 (≤ 0,4 m), vidro 0,9 (≤ 0,1 m), papel 0,95 (≤ 0,1 m) |
| `tracanteACada` | 3 |
| `desbloqueioNivel`, `preco`, `slotsAcessorio`, `modelo`, `sons`, `categoria`, `slot` | presentes no JSON, **não usados** pelo código |

Níveis 2–7 (dano, pente, cadência, multiplicadores): tabela em [[Weapons]]. XP para liberar: 400 / 1000 / 1800 / 2800 / 4000 / 5500.

## Faca (`faca.json`) → [[Melee]]

| Campo | Valor |
|---|---|
| `letal` | true (9999) |
| `alcance` / `alcanceInvestida` | 1,8 / 3,2 m (níveis até 2,7 / 5,0 m) |
| `anguloGraus` | 45° |
| `duracao` / `impacto` / `intervalo` | 0,45 / 0,14 / 0,6 s |
| `velocidadeInvestida` | 14 m/s |

XP para liberar níveis 2–7: 300 / 750 / 1350 / 2100 / 3000 / 4100. Tabela em [[Items]].

## Granada (`granada_frag.json`) → [[Grenades]], [[Land Mines]]

| Campo | Valor |
|---|---|
| `quantidade` / `recargaSegundos` | 2 / 10 s |
| `pavio` / `tempoMinimoPuxar` | 3,0 / 0,2 s |
| `velocidadeLancamento` / `bonusPulo` | 17 m/s / ×1,35 |
| `impacto` / `tempoMaximoVoo` | true / 8 s |
| `anguloExtraGraus` / `intervalo` | 7° / 0,8 s |
| `raio` / `quique` / `atrito` | 0,07 m / 0,35 / 0,7 |
| `niveis[1]` | raioDano 7 m, raioDanoMaximo 2,5 m, danoMax 85, danoMin 12, podeMatar true |

Tipos por progressão: nível 1 `granada` (0 XP), 2 `mina` (500), 3 `dupla` (1300).

## Corpo / aparência (`EFFECTS`, `shared/appearance.ts`) → [[Character Customization]]

| Constante | Valor |
|---|---|
| `heightScale` | pequeno 0,96 · médio 1 · alto 1,04 (**só visual**) |
| `armLossReload` | ×1,3 recarga (PCD sem braço/mão) |
| `legLossSpeed` | ×0,75 velocidade (PCD sem perna) |
| `bodyStats().maxHealth` | 100 para todos |

## Constantes locais (não compartilhadas)

| Arquivo | Constante | Valor | Nota |
|---|---|---|---|
| `client/weapons/mines.ts` | `ARM_TIME` / `TRIGGER_RADIUS` / `TRIGGER_HEIGHT` / `MAX_MINES` | 1 s / 1,1 m / 1,2 m / 3 | [[Land Mines]] |
| `client/main.ts` | `DOUBLE_THROW_GAP` | 0,3 s | [[Grenades]] |
| `client/main.ts` | `MOUSE_DEG_PER_COUNT` | 0,022 °/contagem × sensibilidade | [[Input & Controls]] |
| `client/entities/localPlayer.ts` | `RESPAWN_DELAY` | 3 s (campo de tiro) | [[Respawn]] |
| `client/ai/bots.ts` | `RESPAWN` / `SPAWN_PROTECTION` | 5 s / 2 s | [[Versus Bots]] |
| `client/gameplay/aimAssist.ts` | `ASSIST` | slow 0,4 · radius 0,35 m · follow 0,6 · maxRate 1,6 rad/s · range 90 m | [[Aim Assist]] |
| `client/core/settings.ts` | `sensitivity` / `adsSensitivity` / `aimAssist` (padrões) | 2,5 / 0,85 / false | [[Settings]] |
| `client/entities/hitboxes.ts` | `HEAD_GROW` | 1,12 | [[Damage System]] |
| `client/world/hydrant.ts` | `GUSH_TIME` / `LAUNCH_RADIUS` / `LAUNCH_SPEED` | 3 s / 0,65 m / 15 m/s | [[Map Gags]] |
| `server/session.ts` | `EYE` / `CHEST` | 1,6 / 1,1 m (alturas usadas na validação) | [[Validation]] |
| `server/session.ts` | `LAG_SLACK` | 4 m (+10% da distância) | [[Anti Cheat]] |
| `server/session.ts` | `PICKUP_SLACK` | 1,5 m | [[Pickups]] |
| `server/session.ts` | limites de granadas vivas | 4 granadas / 3 minas | [[Grenades]] |

> [!warning] Duplicação
> O limite de 3 minas está duplicado (`MAX_MINES` no cliente e literal `3` no servidor), assim como `EYE`/`CHEST` do servidor × `MOVE.eyeStand` (1,65). Ver [[Technical Debt]].
