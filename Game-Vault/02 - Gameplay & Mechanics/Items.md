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
tags:
  - game
  - gameplay
  - items
updated: 2026-10-05
---

# Items

> [!info] Escopo
> Neste jogo, "item" de gameplay = **o que o jogador segura e usa**: as três armas e suas variantes por nível. Coisas coletadas no mapa estão em [[Pickups]]; efeitos temporários em [[Buffs & Debuffs]]; roupas e acessórios do personagem (`shared/catalog.ts`) são cosméticos e ficam em [[Character Customization]] — **nunca alteram hitbox ou status**.

Não há itens consumíveis carregáveis (kits médicos, munição, etc.). Ver [[Inventory]].

## Catálogo de itens de gameplay

### Rifle (arma de fogo) — 7 níveis

Mesma mecânica em todos; os níveis mudam dano, pente, cadência, recuo, dispersão, recarga e zoom, além da mira e do visual. Tabela completa em [[Weapons]].

| Nível | Nome | Mira | Visual |
|---|---|---|---|
| 1 | Rifle Padrão | ferro | padrão |
| 2 | Rifle Remendado com Fita | ponto vermelho | fita |
| 3 | Rifle da Tia do Zap | holográfica (carinha feliz) | tia (rosa) |
| 4 | Rifle Pisca-Pisca de Natal | holo com lupa 1,5x | natal |
| 5 | Rifle Tunado com Adesivo de Chama | luneta 2x | chamas |
| 6 | Rifle com Luneta do Vovô | luneta 3x | vovô |
| 7 | Rifle Dourado Ostentação | luneta 4x | ouro |

### Faca (corpo a corpo) — 7 níveis

Sempre mata com um golpe; cada nível aumenta o alcance e troca o modelo/som. Ver [[Melee]].

| Nível | Nome | Modelo / som | Alcance | Alcance da investida | XP |
|---|---|---|---|---|---|
| 1 | Faca de Cozinha | faca / faca | 1,80 m | 3,2 m | 0 |
| 2 | Colher de Pau da Vó | colher / madeira | 1,95 m | 3,5 m | 300 |
| 3 | Frango de Borracha | frango / frango | 2,10 m | 3,8 m | 750 |
| 4 | Baguete Amanhecida | baguete / crocante | 2,25 m | 4,1 m | 1350 |
| 5 | Peixe Congelado | peixe / tapa | 2,40 m | 4,4 m | 2100 |
| 6 | Macarrão de Piscina | macarrao / boing | 2,55 m | 4,7 m | 3000 |
| 7 | Sabre de Luz Paraguaio | sabre / sabre | 2,70 m | 5,0 m | 4100 |

### Granada (arremesso) — 3 tipos

Os níveis da granada **mudam o comportamento**, não o dano (o dano vem sempre de `granada_frag.json` nível 1).

| Nível | Nome | Tipo (`GrenadeKind`) | Comportamento | XP |
|---|---|---|---|---|
| 1 | Granada de Fragmentação | `granada` | cozinha segurando G; explode no impacto — [[Grenades]] | 0 |
| 2 | Mina Terrestre | `mina` | G planta uma mina — [[Land Mines]] | 500 |
| 3 | Dose Dupla | `dupla` | um G lança duas granadas gastando uma carga — [[Grenades]] | 1300 |

### Variante visual temporária

- **Granada de pato**: efeito da poção `pato` — a granada vira um pato de borracha (1,6× maior, faz "quá") até a morte. Mesmo dano. Ver [[Buffs & Debuffs]].

## Regras gerais

- Todos começam com nível 1 de tudo (`DEFAULT_LOADOUT`); sem conta, as armas ficam no nível 1.
- O nível equipado pode ser qualquer um já liberado; online o servidor ignora níveis não liberados (`sanitizeLoadout` + `equip`).
- Outros jogadores veem o modelo do nível equipado (`playerLoadout`).

## Código relacionado

- `shared/weapons.ts` — `WEAPONS`, `MELEE`, `GRENADES`.
- `shared/progression.ts` — `PROGRESSION`, `rifleData`, `knifeData`, `levelInfo`, `GrenadeKind`.
- `client/render/weaponModels.ts` — modelos procedurais (ver [[Weapon Models]]).

## Configurações relacionadas

`shared/data/weapons/*.json`, `shared/data/progression.json`. Ver [[Constants Reference]] e [[Configuration Data]].
