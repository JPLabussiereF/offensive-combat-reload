---
title: Items
type: reference
status: documented
area: gameplay
source_paths:
  - shared/weapons.ts
  - shared/data/weapons/rifle_padrao.json
  - shared/data/weapons/faca.json
  - shared/data/weapons/granada_frag.json
  - shared/data/progression.json
  - shared/progression.ts
  - shared/catalog.ts
  - shared/data/weapons/pistola.json
  - shared/data/weapons/smg.json
  - shared/arsenal.ts
  - client/ui/strings.ts
tags:
  - game
  - gameplay
  - items
updated: 2026-10-06
---

# Items

> [!info] Escopo
> Neste jogo, "item" de gameplay = **o que o jogador segura e usa**: as armas de fogo (primária e secundária), a faca, a granada e suas melhorias. Coisas coletadas no mapa estão em [[Pickups]]; efeitos temporários em [[Buffs & Debuffs]]; roupas e acessórios do personagem (`shared/catalog.ts`) são cosméticos e ficam em [[Character Customization]] — **nunca alteram hitbox ou status**.

Não há itens consumíveis carregáveis (kits médicos, munição, etc.). Ver [[Inventory]].

## Catálogo de itens de gameplay

Todo jogador leva **uma primária (um dos sete rifles), uma secundária, uma faca (uma das sete) e a granada**. Cada progressão tem níveis; cada nível depois do primeiro libera **uma melhoria** (comum, ativa na hora, ou opcional, ligada no Arsenal). Os números de cada arma e de cada melhoria ficam em [[Weapons]]; a regra dos níveis, em [[Progression]].

| Item | Espaço | Nome exibido | Níveis | Melhorias (opcionais em *itálico*) |
|---|---|---|---|---|
| `rifle` (`rifle_padrao.json`) | primária (padrão) | Rifle Padrão | 9 | ponto vermelho, empunhadura, *luneta 3x*, pente +10, *silenciador*, *holo com lupa 1,5x*, *luneta 2x*, *luneta 4x* |
| `rifleFita`, `rifleTia`, `rifleNatal`, `rifleChama`, `rifleVovo`, `rifleOuro` (`rifle_*.json`) | primária | os seis rifles antigos (Remendado com Fita … Dourado Ostentação) | os do rifle | as do rifle; cada um com a sua troca e a sua pintura — ver [[Weapons#Rifles]] |
| `pistola` (`pistola.json`) | secundária (padrão) | Pistola do Porteiro | 5 | gatilho, ponto vermelho, coldre, *silenciador de batata* |
| `smg` (`smg.json`) | secundária | Submetralhadora Liquidificador | 5 | motor, holográfica, *pente tambor*, coronha |
| `faca` (`faca.json`) | corpo a corpo (padrão) | Faca de Cozinha | 3 | afiador, tênis — ver [[Melee]] |
| `colher`, `frango`, `baguete`, `peixe`, `macarrao`, `sabre` | corpo a corpo | as seis facas antigas (Colher de Pau … Sabre de Luz Paraguaio) | os da faca | as da faca — ver [[Melee#As facas]] |
| `granada` (`granada_frag.json`) | arremesso | Granada de Fragmentação | 5 | *mina* ([[Land Mines]]), *Dose Dupla*, cinto +1, pólvora (raio ×1,2) — ver [[Grenades]] |

- Os rifles antigos usam os pontos, o nível e as melhorias do rifle; as facas antigas, os da faca. Cada um libera com pontos dessa progressão ([[Progression#Armas trancadas]]).
- Toda faca mata com um golpe; cada uma tem seu alcance, investida e intervalo, e as melhorias da faca valem para todas.
- A mina e a Dose Dupla (grupo `modo`) mudam o **comportamento** de G; só uma pode estar ligada. O dano da explosão vem de `granada_frag.json` nível 1, com o raio da Pólvora.

### Variante visual temporária

- **Granada de pato**: efeito da poção `pato` — a granada vira um pato de borracha (1,6× maior, faz "quá") até a morte. Mesmo dano. Ver [[Buffs & Debuffs]].

## Regras gerais

- Todos começam no nível 1, sem melhorias, com o Rifle Padrão, a pistola e a faca de cozinha (`DEFAULT_LOADOUT`); sem conta, as armas ficam assim.
- A escolha do Arsenal só pode levar armas e ligar melhorias já liberadas; online o servidor descarta o resto (`sanitizeChoice` em `equip`).
- Outros jogadores veem as armas (o rifle e a faca escolhidos) e as melhorias visíveis (mira, pente, silenciador) pelo `playerLoadout`.

## Código relacionado

- `shared/weapons.ts` — `WEAPONS` (`rifle_padrao`, os seis `rifle_*`, `pistola`, `smg`), `MELEE` (as sete facas), `GRENADES`.
- `shared/progression.ts` — `PROGRESSION`, `GunId`, `KnifeId`, `WeaponId`, `ProgWeapon`, `progOf`, `PRIMARIES`/`SECONDARIES`/`KNIVES`, `GrenadeKind`.
- `shared/arsenal.ts` — `gunStats`, `meleeStats`, `grenadeStats`, `DEFAULT_LOADOUT`.
- `client/ui/strings.ts` — nomes e descrições (`arma_*`, `upg_<arma>_<id>`).
- `client/render/weaponModels.ts` — modelos procedurais (ver [[Weapon Models]]).

## Configurações relacionadas

`shared/data/weapons/*.json`, `shared/data/progression.json`. Ver [[Constants Reference]] e [[Configuration Data]].
