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
tags:
  - game
  - gameplay
  - inventory
  - stub
updated: 2026-10-05
---

# Inventory

> [!important] Não existe no código atual
> Não há inventário, mochila, troca de arma, armas no chão, drop de itens nem caixas de munição. Verificado por busca (`inventor`, `inventário`, `switchWeapon`, `dropWeapon`, `ammoPickup`) em `client/`, `server/` e `shared/` sem resultados, e pela leitura de `client/main.ts` (o jogador é criado com as três armas fixas).

## O que existe no lugar: loadout fixo

Todo jogador tem, sempre e ao mesmo tempo:

| Slot (conceitual) | Arma | Uso | Reposição |
|---|---|---|---|
| Arma de fogo | Rifle (nível equipado) | mouse | munição volta cheia ao renascer |
| Corpo a corpo | Faca (nível equipado) | F | ilimitada (intervalo de 0,6 s) |
| Arremesso | Granada / Mina / Dose Dupla (tipo equipado) | G | 2 cargas; +1 a cada 10 s; cheia ao renascer |

- A faca e a granada são usadas **sem trocar de arma** (golpe/arremesso rápido com o rifle nas mãos).
- O "loadout" (`Loadout = { rifle, faca, granada }`) é apenas o **nível equipado** de cada arma, escolhido no menu **Arsenal** entre os níveis já liberados pela conta. Ver [[Progression]] e [[Items]].
- O campo `slot` (`primaria`/`secundaria`/`corpo`) e `slotsAcessorio` existem no esquema de dados da arma mas não são usados por nenhum sistema (ver [[Weapons]]).

## Notas relacionadas

- [[Items]] — o que pode ser segurado/usado.
- [[Pickups]] — coletáveis do mapa.
- [[Inventory UI]] — também inexistente; o equivalente é o Arsenal.
- [[Character Customization]] — itens cosméticos do personagem (não são inventário de jogo).

## Código relacionado

- `shared/progression.ts` — `Loadout`, `DEFAULT_LOADOUT`, `sanitizeLoadout`.
- `client/main.ts` — `applyLoadout`, criação de `Weapon`, `Melee`, `GrenadeThrower`.
- `client/ui/arsenal.ts` — menu de escolha de nível.
