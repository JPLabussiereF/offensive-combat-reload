---
title: Controllers
type: architecture
status: documented
area: code-architecture
source_paths:
  - client/main.ts
  - client/core/input.ts
  - client/core/gamepad.ts
  - client/ui/touch.ts
  - client/ui/padNav.ts
  - client/entities/localPlayer.ts
  - shared/movement.ts
  - client/weapons/weapon.ts
  - client/weapons/melee.ts
  - client/weapons/grenades.ts
  - client/gameplay/taunt.ts
  - client/ai/bot.ts
  - client/ui/hud.ts
  - client/world/props.ts
  - server/api.ts
  - server/app.ts
  - server/session.ts
tags:
  - architecture
  - controllers
updated: 2026-10-05
---

# Controllers

## Existe "Controller" no projeto?

**Não como conceito formal.** Não há classes, pastas ou sufixos `Controller`, nem padrão MVC. A palavra aparece só em dois sentidos técnicos:

1. **`KinematicCharacterController` do Rapier** — o controlador de personagem da física, configurado por `configureController()` em `shared/movement.ts` e usado pelo jogador local (`client/entities/localPlayer.ts`) e pelos bots (`client/ai/bot.ts`). O README chama isso de "Controlador em primeira pessoa".
2. **Controle (gamepad)** — `client/core/gamepad.ts` (`GamepadInput`), no sentido de "controle de console".

Abaixo, **o que faz o papel de controller** (recebe entrada, decide e aciona outros sistemas), com evidência.

## Cliente

### Orquestrador da partida: `boot()` / `stepInner()`

`client/main.ts` é o controlador de fato: lê `Input`, decide prioridades (tiro tem prioridade sobre sprint e sobre granada na mão; recarga não é interrompida por tiro; faca e granada cancelam recarga; dança só termina com a morte — comentários em `stepInner`) e chama `weapon`, `melee`, `thrower`, `taunt`, `player`, `bots`, `conn`. Ver [[Client Architecture]].

### Entrada → ações

| Objeto | Arquivo | Papel |
| --- | --- | --- |
| `Input` | `client/core/input.ts` | Traduz teclado/mouse em **ações nomeadas** (`down`, `consume`, `press`), pointer lock, `onLockChange` |
| `GamepadInput` (`gamepad`) | `client/core/gamepad.ts` | Lê a Gamepad API e alimenta o mesmo `Input` |
| `TouchControls` | `client/ui/touch.ts` | Botões e analógico de toque que alimentam o mesmo `Input` |
| `PadNav` | `client/ui/padNav.ts` | Navegação de menus com controle |

Ver [[Input & Controls]] e [[Touch Controls]].

### Máquinas de estado de ação (lógica pura, sem renderização)

| Objeto | Arquivo | Estados / saída |
| --- | --- | --- |
| `LocalPlayer` | `client/entities/localPlayer.ts` | `fixedStep(dt, input, time)` move com `stepMovement` e devolve `PlayerEvents` (dano, morte, autodano a reportar); `damage`, `spawn`, `canRespawn` |
| `Weapon` | `client/weapons/weapon.ts` | `update(dt, WeaponInput)`: cadência, pente, recarga tática/vazia, dispersão, recuo, ADS; avisa por `WeaponHooks` (`shoot`, `dryFire`, `reloadStart`, `reloadEnd`) |
| `Melee` | `client/weapons/melee.ts` | `tryStart(target)`, `update(dt)` → `'impact'` no momento do golpe; investida |
| `GrenadeThrower` | `client/weapons/grenades.ts` | "A mão do jogador": `update(dt, held, pressed, canStart)` → `ThrowerEvent` (`pin`, `throw`, `inHand`, `mine`); `cookT`, `throwT`, recarga de cargas, `kind` (`granada`/`mina`/`dupla`) |
| `Taunt` | `client/gameplay/taunt.ts` | Dança da opressão: `start`, `update` → corpo concluído, `cancel` |
| `Mines` | `client/weapons/mines.ts` | Minas do jogador e dos outros, `triggered(enemyFeet)` |

O padrão é: **o objeto decide e devolve um evento; `main.ts` aplica o efeito** (som, HUD, rede, dano). Exemplo: `GrenadeThrower.update` devolve `{ type: 'throw', fuseLeft, double }` e `main.ts` chama `throwGrenade`, agenda o segundo arremesso da "Dose Dupla" e envia `grenade` ao servidor.

### Controlador de personagem por IA

`Bot` (`client/ai/bot.ts`) é um controlador completo de personagem: percebe, decide e produz um `MoveInput` e um `WeaponInput` iguais aos de um humano. Ver [[AI Overview]] e [[NPC Behavior]].

### Apresentação

`Hud` (`client/ui/hud.ts`) é uma "view" passiva: o `main.ts` chama `hud.setHealth`, `hud.killfeed`, `hud.popup`, `hud.showDeath` etc. O comentário do arquivo diz: "DOM updated by direct reference, numbers throttled by the caller". Ver [[HUD]].

### Gags sincronizados

`PropBus` (`client/world/props.ts`) liga o tiro num colisor (`onShot`) ao efeito local e à rede. Ver [[Events & Messaging]].

## Servidor

| Objeto | Arquivo | Papel de controller |
| --- | --- | --- |
| `routes` + `handleApi` | `server/api.ts` | Tabela `'MÉTODO /caminho' → handler`: o mais próximo de um controller HTTP. Valida Origin, exige sessão (`requireSession`), lê JSON e chama `accounts.ts`/`auth/*` |
| `websocket.message` | `server/app.ts` | `switch (msg.t)` para mensagens de lobby (`hello`, `list`, `create`, `join`, `leave`, `ping`) |
| `Session.handle` | `server/session.ts` | `switch (msg.t)` para mensagens de partida, delegando a `onHit`, `onStab`, `onBoom`, `onPickup`, `onFish`, `onRat`, `onPotion`, `onTaunt`, `onTauntEnd` |

Ver [[APIs]] e [[Remote Calls]].

## Riscos

- Sem uma camada de controller separada, a política de prioridades de ação está espalhada em `stepInner` (`client/main.ts`).

## Código relacionado

- `client/main.ts` (`stepInner`), `client/core/input.ts`, `client/weapons/*.ts`, `client/gameplay/taunt.ts`, `client/entities/localPlayer.ts`, `client/ai/bot.ts`
- `server/api.ts`, `server/app.ts`, `server/session.ts`

Ver também: [[Services]], [[Modules]], [[Grenades]], [[Weapons]], [[Melee]], [[Humiliation]].
