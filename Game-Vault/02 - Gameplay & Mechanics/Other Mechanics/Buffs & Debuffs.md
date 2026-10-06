---
title: Buffs & Debuffs
type: mechanic
status: documented
area: gameplay
source_paths:
  - shared/constants.ts
  - shared/maps.ts
  - shared/appearance.ts
  - client/main.ts
  - client/weapons/weapon.ts
  - shared/data/mapas/halloween.json
  - server/session.ts
tags:
  - game
  - gameplay
  - buffs
updated: 2026-10-06
---

# Buffs & Debuffs

> [!info] Evidência
> Código confirmado: `CHERRY`, `RAT`, `KOI`, `POTION` (`shared/constants.ts`); lógica em `client/main.ts` (`refreshMaxHealth`, `refreshWeaponMods`, `potionSpeed`, `buffs()`), autoridade em `server/session.ts`.

## Objetivo

Efeitos temporários ligados a pontos do mapa, que criam disputas e momentos cômicos. Todos (menos os do corpo PCD) **acabam com a morte**. São mostrados no painel de buffs do [[HUD]] (ícone, nome, segundos restantes, barra que pisca nos últimos 10 s).

## Catálogo

| Efeito | Origem | Efeito no jogo | Duração | Quem aplica online |
|---|---|---|---|---|
| 🍒 **Cereja** | [[Pickups]] — [[Map - Jardim do Dragão]] | vida máx. +50 (e +50 de vida) | 30 s ou morte | servidor |
| 💜 **Humanidade** | derrubar o **rato gigante** — [[Map - Vila Assombrada]] | vida máx. +50 (e +50 de vida); uma por vez | até a morte | servidor (confia na contagem de tiros do cliente; checa distância ≤ 30 m) |
| 🐟 **Mira afiada (carpa dourada)** | matar uma carpa dourada — Jardim do Dragão | dispersão × 0,5, recuo × 0,6 | 60 s ou morte | servidor decide o prêmio; o efeito é aplicado no cliente |
| 🎯 **Mira afiada (tiro ao alvo)** | derrubar o último dos 7 alvos da barraca — Vila Assombrada | igual à carpa | 60 s ou morte | **só cliente** (quem dispara localmente) |
| 💨 **Poção veloz** | bruxa — Vila Assombrada | velocidade × 1,3 | 60 s ou morte | servidor sorteia; efeito no cliente |
| 🐌 **Poção lerda** (debuff) | bruxa | velocidade × 0,7 | 60 s ou morte | idem |
| 💀 **Poção do crítico** | bruxa | todo tiro calculado como cabeça (×2,5) | 60 s ou morte | **servidor aplica no dano** |
| 🍺 **Poção do bêbado** (debuff) | bruxa | dispersão × 2,5, recuo × 1,8, visão balançando | 60 s ou morte | idem (cliente) |
| 🦆 **Poção do pato** | bruxa | granadas viram patos de borracha (só visual/sonoro, todos veem) | até a morte | servidor sorteia; retransmitido em cada `grenade` |

### Poções da bruxa

- Perto da bruxa (≤ 2,4 m) a tecla de contexto vira **"Beber Poção"** (ver [[Interaction System]]).
- O efeito é **sorteado** uniformemente entre `pato`, `veloz`, `lerdo`, `critico`, `bebado` (servidor online; cliente offline).
- **Uma poção por minuto** (`cooldown` 60 s). Beber outra substitui o efeito temporizado atual. O cooldown zera ao morrer.
- O balanço da visão do bêbado é só de câmera: a mira segue o retículo, não o balanço.

### Carpas (koi)

- Matar uma carpa com tiro ou faca dá **1 XP de conta** (online); uma **carpa dourada** dá **100 XP** + mira afiada. Cada carpa volta em 25–45 s, com **5%** de chance de voltar dourada (brilhando). Servidor confere que o atirador está a ≤ 80 m + raio do circuito do peixe. Ver [[Progression]].

### Rato gigante

- Fica no fim do beco sem saída do esgoto da Vila Assombrada. Cai com **14 tiros** (uma facada conta como **4**). Volta em **120 s**. A contagem de acertos é do cliente; o servidor só confere que o rato está vivo e que o jogador está a ≤ 30 m.

### Modificadores permanentes (não temporários)

Vêm do corpo do personagem no modo PCD (ver [[Character Customization]]): sem braço/mão → recarga × 1,3; sem perna → velocidade × 0,75; membro ausente não tem hitbox. Altura e biotipo **não** mudam nada no jogo.

## Regras de combinação

- Multiplicadores de mira: `spreadMul = (mira afiada ? 0,5 : 1) × (bêbado ? 2,5 : 1)`; `recoilMul = (0,6) × (1,8)` análogo. Mira afiada + bêbado se combinam.
- Velocidade: `movimento da arma × corpo × poção`.
- Vida máxima: `100 + cereja + humanidade` (máx. 200) — ver [[Health System]].

## Estados / Entradas / Saídas

Cada efeito guarda o fim (relógio do jogo: simulação offline, servidor online). Entradas: mensagens `pickup`, `rat`, `fish`, `potion` (online) ou eventos locais. Saídas: multiplicadores em [[Weapons]] e [[Movement]], vida máxima, painel de buffs, faixas e sons.

## Dependências

[[Pickups]], [[Health System]], [[Weapons]], [[Movement]], [[Damage System]], [[Map Gags]], [[HUD]], [[Remote Calls]].

## Exceções

- Velocidade, dispersão e recuo são calculados no cliente; como o movimento é confiado ao cliente, o servidor não verifica se um jogador "veloz" realmente bebeu a poção. Ver [[Anti Cheat]].
- Bots não usam coletáveis nem poções.
- **Divergência pato × efeito temporizado**: ao sortear `pato`, o servidor faz `p.potion = null` (um crítico ativo deixa de valer no dano), mas o cliente só liga `duckAmmo` e mantém o efeito temporizado anterior no painel e nos multiplicadores locais até expirar. Confirmado pela leitura de `onPotion` (servidor) e `applyPotion` (cliente).

## Código relacionado

- `client/main.ts` — `startBoost`/`endBoost`, `gainHumanity`/`loseHumanity`, `applyPotion`/`drinkPotion`/`endPotion`, `startAim`/`endAim`, `hitCritter`, `buffs()`, `POTION_BUFFS`.
- `client/weapons/weapon.ts` — `spreadMul`, `recoilMul`.
- `server/session.ts` — `onPickup`, `onRat`, `onFish`, `onPotion`, `onHit` (crítico), `kill` (limpa efeitos).
- `shared/maps.ts` — `WITCHES`, `RATS`, `FISH`.
- `client/world/catalog/objects.ts` — galeria de tiro (`aimBonus`), rato, bruxa.

## Configurações relacionadas

`CHERRY`, `RAT`, `KOI`, `POTION` em `shared/constants.ts`; `EFFECTS` em `shared/appearance.ts`. Ver [[Constants Reference]].
