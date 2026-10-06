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

Todo jogador leva **uma primária, uma secundária, a faca e a granada**. Cada arma tem níveis; cada nível depois do primeiro libera **uma melhoria** (comum, ativa na hora, ou opcional, ligada no Arsenal). Os números de cada arma e de cada melhoria ficam em [[Weapons]]; a regra dos níveis, em [[Progression]].

| Item | Espaço | Nome exibido | Níveis | Melhorias (opcionais em *itálico*) |
|---|---|---|---|---|
| `rifle` (`rifle_padrao.json`) | primária | Rifle Padrão | 6 | ponto vermelho, empunhadura, *luneta 3x*, pente +10, *silenciador* |
| `pistola` (`pistola.json`) | secundária (padrão) | Pistola do Porteiro | 5 | gatilho, ponto vermelho, coldre, *silenciador de batata* |
| `smg` (`smg.json`) | secundária | Submetralhadora Liquidificador | 5 | motor, holográfica, *pente tambor*, coronha |
| `faca` (`faca.json`) | corpo a corpo | Faca de Cozinha | 5 | afiador, *frango de borracha*, tênis, *sabre de luz* — ver [[Melee]] |
| `granada` (`granada_frag.json`) | arremesso | Granada de Fragmentação | 5 | *mina* ([[Land Mines]]), *Dose Dupla*, cinto +1, pólvora (raio ×1,2) — ver [[Grenades]] |

- A faca sempre mata com um golpe; as melhorias mudam alcance, investida e intervalo. O frango e o sabre (grupo `forma`) trocam o modelo e o som, e só um pode estar ligado.
- A mina e a Dose Dupla (grupo `modo`) mudam o **comportamento** de G; só uma pode estar ligada. O dano da explosão vem de `granada_frag.json` nível 1, com o raio da Pólvora.

### Variante visual temporária

- **Granada de pato**: efeito da poção `pato` — a granada vira um pato de borracha (1,6× maior, faz "quá") até a morte. Mesmo dano. Ver [[Buffs & Debuffs]].

## Regras gerais

- Todos começam no nível 1, sem melhorias, com rifle e pistola (`DEFAULT_LOADOUT`); sem conta, as armas ficam assim.
- A escolha do Arsenal só pode ligar melhorias opcionais já liberadas; online o servidor descarta as não liberadas (`sanitizeChoice` em `equip`).
- Outros jogadores veem as armas e as melhorias visíveis (mira, pente, silenciador, forma da faca) pelo `playerLoadout`.

## Código relacionado

- `shared/weapons.ts` — `WEAPONS` (`rifle_padrao`, `pistola`, `smg`), `MELEE`, `GRENADES`.
- `shared/progression.ts` — `PROGRESSION`, `GunId`, `ProgWeapon`, `PRIMARIES`/`SECONDARIES`, `GrenadeKind`, `KnifeForm`.
- `shared/arsenal.ts` — `gunStats`, `meleeStats`, `grenadeStats`, `DEFAULT_LOADOUT`.
- `client/ui/strings.ts` — nomes e descrições (`arma_*`, `upg_<arma>_<id>`).
- `client/render/weaponModels.ts` — modelos procedurais (ver [[Weapon Models]]).

## Configurações relacionadas

`shared/data/weapons/*.json`, `shared/data/progression.json`. Ver [[Constants Reference]] e [[Configuration Data]].
