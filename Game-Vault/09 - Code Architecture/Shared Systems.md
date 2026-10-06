---
title: Shared Systems
type: architecture
status: documented
area: code-architecture
source_paths:
  - shared/protocol.ts
  - shared/constants.ts
  - shared/maps.ts
  - shared/weapons.ts
  - shared/movement.ts
  - shared/progression.ts
  - shared/accountLevel.ts
  - shared/account.ts
  - shared/appearance.ts
  - shared/catalog.ts
  - shared/palette.ts
  - shared/data/weapons/rifle_padrao.json
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
updated: 2026-10-05
---

# Shared Systems

## Responsabilidade

`shared/` guarda **tudo que cliente e servidor precisam concordar**: formato das mensagens, constantes de regra, dados de armas, progressão, mapas (só o que o servidor valida), aparência e catálogo. É importado pelo alias `@shared/*` (definido em `tsconfig.json`, `server/tsconfig.json` e `vite.config.ts`). Decisão registrada em [[ADR - Código compartilhado entre cliente e servidor]].

> [!info]
> `shared/` não tem dependência de DOM. Só `shared/movement.ts` importa `@dimforge/rapier3d-compat` (a física), e por isso é hoje usado só pelo cliente (jogador local e bots); o comentário do arquivo diz que é "shared between client prediction and (later) the authoritative server".

## Módulos

| Arquivo | Conteúdo | Cliente usa | Servidor usa |
| --- | --- | --- | --- |
| `protocol.ts` | `NET` (tick 20 Hz, 10 jogadores, atraso de interpolação 100 ms, chat, respawn 5 s, porta 8787, caminho `/ws`), `FLAG` (bits de animação), `ClientMsg`/`ServerMsg` (uniões discriminadas por `t`), `CLOSE` (4001/4002), `sanitizeName`, `sanitizeChat`, `ONLINE_GRENADE_LEVEL` | sim | sim |
| `constants.ts` | `MOVE`, `HEALTH`, `CHERRY`, `BISCUIT`, `POTION`, `RAT`, `KOI`, `SCORE`, `HUMILIATION`, `SIM` (dt 1/60), `GROUP` + `groups()` (grupos de colisão Rapier) | sim | sim (regras) |
| `maps.ts` | `MAPS` (ids `rua`, `jardim`, `halloween`), `DEFAULT_MAP`, `PICKUPS`, `WITCHES`, `RATS`, `FISH`, `isMapId` — só posições que o servidor confere | sim | sim |
| `weapons.ts` | Esquema `WeaponData`/`MeleeData`/`GrenadeData`, carrega os JSON, `HIT_REGIONS`, `computeDamage`, `explosionDamage`, `clampExplosionDamage`, `idealTtk`, `minPenetrationKeep` | sim | sim |
| `movement.ts` | `stepMovement` (passo de movimento em primeira pessoa sobre o Rapier), `createMoveState`, `configureController`, `eyeHeight` | sim (jogador e bots) | não (ainda) |
| `progression.ts` | Níveis de rifle/faca/granada a partir de `data/progression.json`; `rifleData(level)`, `knifeData(level)`, `levelForXp`, `sanitizeLoadout`, `weaponOfKill` | sim | sim |
| `accountLevel.ts` | XP e curva do nível da conta (`data/nivel_conta.json`) | sim | sim |
| `account.ts` | Regras e formatos da API de contas (nome, senha, e-mail, `formatTag`, `ApiErrorCode`, tipos de resposta) | sim (formulários) | sim (validação) |
| `appearance.ts` | `Appearance`, `sanitizeAppearance`, `randomAppearance`, `bodyStats` (o que a aparência muda no jogo) | sim | sim |
| `catalog.ts` | Catálogo de itens do personagem e slots | sim | indireto (via `appearance.ts`, na validação) |
| `palette.ts` | Famílias de cor e `snap()` para a paleta | sim | indireto (via `appearance.ts`) |
| `data/*.json` | Dados de armas, progressão e nível da conta | via `weapons.ts`/`progression.ts`/`accountLevel.ts` | idem |

## Exemplos de uso duplo (código confirmado)

- `computeDamage(rifle, dist, region, keep)` é chamado no cliente offline (`client/main.ts`, `client/ai/bots.ts`) e no servidor (`Session.onHit`).
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

Ver também: [[Constants Reference]], [[Configuration Data]], [[Remote Calls]], [[Weapons]], [[Movement]], [[Progression]], [[Character Customization]].
