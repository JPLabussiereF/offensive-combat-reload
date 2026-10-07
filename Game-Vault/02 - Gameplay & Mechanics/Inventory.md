---
title: Inventory
type: mechanic
status: documented
area: gameplay
source_paths:
  - shared/weapons.ts
  - shared/progression.ts
  - client/main.ts
  - client/ui/arsenal.ts
  - shared/arsenal.ts
  - client/core/keybinds.ts
tags:
  - game
  - gameplay
  - inventory
  - stub
updated: 2026-10-07
---

# Inventory

> [!important] Não existe no código atual
> Não há inventário, mochila, armas no chão, drop de itens nem caixas de munição. Verificado por busca (`inventor`, `inventário`, `dropWeapon`, `ammoPickup`) em `client/`, `server/` e `shared/` sem resultados. Existe só a **troca entre as duas armas de fogo** que o jogador já leva (abaixo).

## O que existe no lugar: loadout

Todo jogador tem, sempre e ao mesmo tempo:

| Slot (conceitual) | Arma | Uso | Reposição |
|---|---|---|---|
| Primária | Um dos sete rifles (escolhido no Arsenal; Rifle Padrão por padrão) | mouse; tecla 1 | pente próprio; volta cheio ao renascer |
| Secundária | Uma das sete secundárias: Pistola do Porteiro, Grampeador do RH, Submetralhadora Liquidificador, Revólver do Delegado da Quadrilha, Furadeira do Vizinho de Domingo, Garrucha do Cangaceiro ou Pistolão do Marombeiro (escolhida no Arsenal; pistola por padrão; ver [[Weapons#Secundárias]]) | mouse; tecla 2 | pente próprio; volta cheio ao renascer |
| Corpo a corpo | Uma das sete facas (escolhida no Arsenal; faca de cozinha por padrão) | F | ilimitada (intervalo de 0,6 s na faca de cozinha sem melhorias) |
| Arremesso | Granada / Mina / Dose Dupla (conforme a melhoria opcional ligada) | G | 2 cargas (3 com o Cinto); +1 a cada 10 s; cheia ao renascer |

- **Troca de arma de fogo**: `1` pega a primária, `2` a secundária e a roda do mouse alterna (←/→ no controle, botão de troca no toque). A troca cancela a recarga e a arma nova leva o seu tempo de saque (`troca`). Cada espaço guarda o seu pente. Toda vida começa com a primária na mão. Detalhes em [[Weapons]].
- A faca e a granada são usadas **sem trocar de arma** (golpe/arremesso rápido com a arma de fogo nas mãos).
- O `Loadout` (`shared/arsenal.ts`) é `{ primaria, secundaria, faca, ativas }`: a arma de cada espaço, a faca e as melhorias em efeito em cada progressão. Ele sai da escolha do **Arsenal** (`ArsenalChoice`: rifle, secundária, faca, opcionais ligadas e comuns desligadas) aplicada aos níveis da conta (`resolveLoadout`). Ver [[Progression]], [[Shared Systems]] e [[Items]].
- O campo `slot` (`primaria`/`secundaria`) do JSON da arma define quais armas podem ir em cada espaço (`PRIMARIES`/`SECONDARIES` em `shared/progression.ts`). `slotsAcessorio` continua sem uso (ver [[Weapons]]).

## Notas relacionadas

- [[Items]] — o que pode ser segurado/usado.
- [[Pickups]] — coletáveis do mapa.
- [[Inventory UI]] — o equivalente é o Arsenal (secundária e melhorias opcionais) e as linhas de armas do [[HUD]].
- [[Character Customization]] — itens cosméticos do personagem (não são inventário de jogo).

## Código relacionado

- `shared/arsenal.ts` — `Loadout`, `DEFAULT_LOADOUT`, `resolveLoadout`, `gunIn`, `slotStats`, `sanitizeLoadout`.
- `shared/progression.ts` — `ArsenalChoice`, `PRIMARIES`, `SECONDARIES`.
- `client/main.ts` — `applyLoadout`, `guns` (um `Weapon` por espaço), `holdSlot`/`switchTo`, `Melee`, `GrenadeThrower`.
- `client/ui/arsenal.ts` — menu de escolha da secundária e das melhorias opcionais.
