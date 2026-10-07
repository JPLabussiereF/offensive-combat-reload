---
title: Shared Systems
type: architecture
status: documented
area: code-architecture
source_paths:
  - shared/data/corrida_armada.json
  - shared/gunGame.ts
  - shared/modes.ts
  - shared/zombies.ts
  - shared/zombieMatch.ts
  - shared/barricades.ts
  - shared/protocol.ts
  - shared/constants.ts
  - shared/maps.ts
  - shared/weapons.ts
  - shared/movement.ts
  - shared/progression.ts
  - shared/arsenal.ts
  - shared/accountLevel.ts
  - shared/account.ts
  - shared/appearance.ts
  - shared/catalog.ts
  - shared/palette.ts
  - shared/data/weapons/rifle_padrao.json
  - shared/data/weapons/pistola.json
  - shared/data/weapons/smg.json
  - shared/data/weapons/faca.json
  - shared/data/weapons/granada_frag.json
  - shared/data/progression.json
  - shared/data/nivel_conta.json
  - tsconfig.json
  - server/tsconfig.json
  - vite.config.ts
tags:
  - architecture
  - shared
  - client
  - server
updated: 2026-10-06
---

# Shared Systems

## Responsabilidade

`shared/` guarda **tudo que cliente e servidor precisam concordar**: formato das mensagens, constantes de regra, dados de armas, progressão, mapas (só o que o servidor valida), aparência e catálogo. É importado pelo alias `@shared/*` (definido em `tsconfig.json`, `server/tsconfig.json` e `vite.config.ts`). Decisão registrada em [[ADR - Código compartilhado entre cliente e servidor]].

> [!info]
> `shared/` não tem dependência de DOM. Só `shared/movement.ts` importa `@dimforge/rapier3d-compat` (a física), e por isso é hoje usado só pelo cliente (jogador local e bots); o comentário do arquivo diz que é "shared between client prediction and (later) the authoritative server".

## Módulos

| Arquivo | Conteúdo | Cliente usa | Servidor usa |
| --- | --- | --- | --- |
| `protocol.ts` | `NET` (tick 20 Hz, 10 jogadores, atraso de interpolação 100 ms, chat, respawn 5 s, porta 8787, caminho `/ws`), `FLAG` (bits de animação, inclusive `secondary`: a arma na mão), `ClientMsg`/`ServerMsg` (uniões discriminadas por `t`), `CLOSE` (4001/4002), `sanitizeName`, `sanitizeChat` | sim | sim |
| `constants.ts` | `MOVE`, `HEALTH`, `CHERRY`, `BISCUIT`, `POTION`, `RAT`, `KOI`, `SCORE`, `HUMILIATION`, `SIM` (dt 1/60), `GROUP` + `groups()` (grupos de colisão Rapier) | sim | sim (regras) |
| `maps.ts` | `MAPS` (ids `rua`, `jardim`, `halloween`, `cemiterio`; `exclusivo` marca um mapa feito para um modo só), `MAP_IDS`, `PVP_MAPS` (os mapas sem `exclusivo`), `DEFAULT_MAP`, `PICKUPS`, `WITCHES`, `RATS`, `FISH`, `isMapId` — só posições que o servidor confere | sim | sim |
| `weapons.ts` | Esquema `WeaponData`/`MeleeData`/`GrenadeData` (atributos **base**), carrega os JSON (`WEAPONS`: rifle, pistola, smg), `HIT_REGIONS`, `computeDamage`, `explosionDamage`, `clampExplosionDamage`, `idealTtk`, `minPenetrationKeep` | sim | sim |
| `movement.ts` | `stepMovement` (passo de movimento em primeira pessoa sobre o Rapier), `createMoveState`, `configureController`, `eyeHeight` | sim (jogador e bots) | não (ainda) |
| `progression.ts` | Ids das armas (`GunId`, `KnifeId`, `WeaponId`, `ProgWeapon`, `PRIMARIES`, `SECONDARIES`, `KNIVES`; `progOf`: a progressão de cada arma; travas `lockOf`/`weaponUnlocked`), árvores de melhorias de `data/progression.json` (`PROGRESSION`), níveis (`levelForXp`, `xpForLevel`, `levelCount`), melhorias em efeito (`activeUpgrades`), escolha do Arsenal (`ArsenalChoice`, `sanitizeChoice`, `legacyChoice`), `weaponOfKill` | sim | sim |
| `arsenal.ts` | O que o jogador leva e os atributos **efetivos** (base + melhorias): `Loadout` (com `soFaca?`: só a faca na mão; `danificadas?`: armas danificadas do caixão do zumbi, por arma), `WeaponFlaw`, `resolveLoadout`, `gunStats`, `meleeStats`, `grenadeStats`, `slotStats`, `gunIn`, `knifeOf`, `loadoutKnife`, `sanitizeLoadout`, `DEFAULT_LOADOUT` | sim | sim |
| `modes.ts` | Modos de jogo: `GameModeId` (`mata-mata`, `corrida-armada`, `zumbi`), `MODE_RULES` (armas do Arsenal ou do modo, `lockedLoadout`, granadas, XP de arma, rodadas, bots, `coop`, `maps`), `isGameModeId`, `modeMaps` (a lista do modo ou `PVP_MAPS`) | sim (home, regras do cliente) | sim (`server/modes.ts`, lobby) |
| `zombies.ts` | Modo zumbi: os números de `data/zumbi.json` (`ZOMBIE`) e as regras puras — ondas (`waveSpec`, `pickType`), vida e golpe por tipo, dano das armas nos zumbis com a raridade e o defeito (`gunDamageToZombie`, `knifeDamageToZombie`, `grenadeDamageToZombie`, `weaponMul`), dinheiro e XP por abate, o sorteio do caixão (`rollBox`, `rollFlaw`, `flawChance`), as penalidades de arma danificada (`flawDamageMul`, `flawAmmo`, `zombieGunData`), o que se carrega (`startItems`, `withItem`, `zombieLoadout`), flags `ZF` e o formato de rede `ZNet` | sim (`client/zombies/*`) | sim (`ZombieMode`) |
| `barricades.ts` | Modo zumbi: as brechas do muro e as barricadas — geometria (`gapFrame`, `inGap`, `atGap`, `inReach`, `insideWall`), as caixas e flags que a navmesh marca por brecha (`gateAreas`, `gateFlag`, `WALK_FLAG`) e as regras das tábuas (`buildBarricade`, `nailBoard`, `hitBarricade`, `boardDamage`, `smashesThrough`, `barricadeHealth`) | sim (geração da navmesh, `client/zombies/*`) | sim (motor, bake) |
| `zombieMatch.ts` | Modo zumbi: o motor da partida (`ZombieMatch`): ondas com telegrafia de surgimento, a horda numa `Crowd` do Detour sobre a navmesh com dois filtros (contornar / atravessar barricadas), ataques, arrombamento e chefes, o caixão, as barricadas, caído/reanimar, resumo. Fala com quem o hospeda por `ZombieHost` (aplicar dano, dar XP, trocar armas…) | sim (jogo solo, `client/zombies/local.ts`) | sim (sessões zumbi) |
| `gunGame.ts` | Corrida armada: `LADDER` (de `data/corrida_armada.json`), `GUN_GAME`, `ladderLoadout`, `killCounts`, `afterKill`, `afterDeath`, `ladderProblems` — funções puras | sim (`BotManager`, HUD) | sim (`GunGameMode`) |
| `accountLevel.ts` | XP e curva do nível da conta (`data/nivel_conta.json`) | sim | sim |
| `account.ts` | Regras e formatos da API de contas (nome, senha, e-mail, `formatTag`, `ApiErrorCode`, tipos de resposta) | sim (formulários) | sim (validação) |
| `appearance.ts` | `Appearance`, `sanitizeAppearance`, `randomAppearance`, `bodyStats` (o que a aparência muda no jogo) | sim | sim |
| `catalog.ts` | Catálogo de itens do personagem e slots | sim | indireto (via `appearance.ts`, na validação) |
| `palette.ts` | Famílias de cor e `snap()` para a paleta | sim | indireto (via `appearance.ts`) |
| `data/*.json` | Dados de armas, progressão, nível da conta e da corrida armada (`corrida_armada.json`) | via `weapons.ts`/`progression.ts`/`accountLevel.ts` | idem |

## API de armas (`shared/arsenal.ts`)

É a forma de qualquer sistema (modos de jogo, caixa misteriosa, bots) obter armas **sem regra própria**: os atributos de uma arma são função só das melhorias que ela tem. O cliente joga e o servidor valida com as mesmas chamadas.

| Chamada | Uso |
| --- | --- |
| `gunStats(arma: GunId, melhorias?: string[]): GunStats` | Arma de fogo com as melhorias (ids da árvore dela; desconhecidos são ignorados). `GunStats` = `WeaponData` + `arma`, `melhorias`, `mira`, `visual`, `silenciador`. Cacheado e compartilhado: **não mutar**. |
| `meleeStats(faca?, melhorias?): MeleeStats` | Uma das sete facas (`KnifeId`, padrão `faca`) com as melhorias da faca; `forma` = o id da faca. `meleeStats('sabre', [])` é o **Sabre de Luz Paraguaio**. `loadoutKnife(lo)` = a faca de um loadout. |
| `grenadeStats(melhorias?): GrenadeStats` | Granada: `tipo` (`granada`/`mina`/`dupla`), `quantidade`, `recargaSegundos`, `velocidadeLancamento`, `explosao` (raios e dano). |
| `resolveLoadout(escolha, níveis): Loadout` | A escolha do Arsenal (`ArsenalChoice`) nos níveis da conta → `{ primaria, secundaria, ativas }`, com as comuns liberadas e as opcionais ligadas (`activeUpgrades`). |
| `slotStats(loadout, 'primaria' \| 'secundaria')` | Atributos da arma de um espaço; `null` se o espaço está vazio (`Loadout.secundaria` pode ser `null`). |
| `MAX_LEVELS`, `START_LEVELS` (`progression.ts`) | Níveis de todas as armas no máximo / no 1, para montar loadouts de modo. |

Exemplos (inferência de uso para os próximos modos, não implementados ainda):
- Loadout travado sem melhorias: `{ ...DEFAULT_LOADOUT }`; com tudo liberado: `resolveLoadout(escolha, MAX_LEVELS)`.
- Começar só com a primária: `{ ...DEFAULT_LOADOUT, secundaria: null }`.
- Arma sorteada: `gunStats('smg')`; a arma final de uma corrida armada: `meleeStats('sabre', [])`; um rifle antigo com as melhorias do rifle: `gunStats('rifleVovo', ['empunhadura'])`.

No cliente, `Weapon.setData(gunStats(...))` troca a arma de um espaço; no servidor, `Session` resolve o loadout pela conta (`loadoutOf`) e usa `gunStats`/`meleeStats`/`grenadeStats` em `onHit`, `onStab` e nas granadas.

## Exemplos de uso duplo (código confirmado)

- `computeDamage(gunStats(arma, melhorias), dist, region, keep)` é chamado no cliente offline (`client/main.ts`, `client/ai/bots.ts`) e no servidor (`Session.onHit`).
- `bodyStats(appearance)` define vida máxima, multiplicador de recarga e velocidade, no editor, no jogador local, nos bots e no `SPlayer` do servidor.
- `sanitizeChat` é aplicado pelo servidor antes de difundir a linha (`Session.handle` → `'chat'`).
- `NET.tickRate` controla o `setInterval` da `Session`; `NET.stateRate` controla o envio do estado no cliente.

## Regras de dependência

- `shared/` não importa nada de `client/` nem de `server/` (confirmado pelos imports dos arquivos).
- O cliente compila `shared` junto (`tsconfig.json` inclui `client` e `shared`); o servidor também (`server/tsconfig.json` inclui `../shared/**/*.ts`). O JSON é importado com `resolveJsonModule`.

## Riscos

- Mudar um formato em `protocol.ts` afeta os dois lados ao mesmo tempo (bom para consistência; exige publicar cliente e servidor juntos).
- `movement.ts` depende do Rapier; levar a simulação para o servidor exigiria o WASM do Rapier no Bun (inferência: o código não faz isso hoje).

## Código relacionado

- `shared/*.ts`, `shared/data/**/*.json`

Ver também: [[Constants Reference]], [[Configuration Data]], [[Remote Calls]], [[Weapons]], [[Movement]], [[Progression]], [[Character Customization]], [[ADR - Progressão por melhorias de arma]].
