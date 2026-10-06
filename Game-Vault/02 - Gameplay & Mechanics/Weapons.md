---
title: Weapons
type: mechanic
status: documented
area: gameplay
source_paths:
  - shared/weapons.ts
  - shared/data/weapons/rifle_padrao.json
  - shared/data/weapons/faca.json
  - shared/data/weapons/granada_frag.json
  - shared/progression.ts
  - shared/data/progression.json
  - client/weapons/weapon.ts
  - client/weapons/hitscan.ts
  - client/main.ts
tags:
  - game
  - gameplay
  - weapons
updated: 2026-10-05
---

# Weapons

> [!info] Evidência
> Configuração confirmada (`shared/data/weapons/*.json`, `shared/data/progression.json`) e código confirmado (`client/weapons/weapon.ts`, `client/weapons/hitscan.ts`, `shared/weapons.ts`).

## Objetivo

Todo jogador carrega o **mesmo arsenal fixo** de três armas, guiadas por dados: o **rifle** (hitscan automático), a **faca** (corpo a corpo, mata com um golpe) e a **granada** (que, conforme a progressão, vira mina terrestre ou "dose dupla"). Não há troca de arma, compra, drop ou munição no mapa — ver [[Inventory]] e [[Items]].

## Visão geral do arsenal

| Arma | Tecla | Arquivo de dados | Nota detalhada |
|---|---|---|---|
| Rifle Padrão (7 níveis) | Mouse esquerdo / direito (mirar) / R | `rifle_padrao.json` + `progression.json` | esta nota + [[Damage System]] |
| Faca (7 níveis cosméticos + alcance) | F | `faca.json` + `progression.json` | [[Melee]] |
| Granada (3 tipos) | G | `granada_frag.json` + `progression.json` | [[Grenades]], [[Land Mines]] |

A evolução das armas por pontos é descrita em [[Progression]].

## Rifle: como o jogador interage

- **Atirar**: segurar o botão (modo `auto`, 700 tiros/min no nível 1 ⇒ 1 tiro a cada ~0,086 s). Um toque mais curto que um tick ainda dispara.
- **Mirar (ADS)**: segurar o botão direito. Entra em 0,22 s, sai 1,3× mais rápido. Reduz o FOV (`zoom` 0,85 no nível 1 até 0,30 no nível 7) e a sensibilidade (`adsSensitivity` das [[Settings]]). Correr derruba a mira.
- **Recarregar**: R. Tática (pente não vazio) 2,2 s; vazia 2,7 s. Atirar com pente vazio e reserva > 0 inicia a recarga automaticamente; sem reserva toca "clique seco".

## Regras do rifle

### Cadência e munição

- Pente 30, reserva 120 no nível 1 (a reserva de cada nível = pente × 4).
- Até 4 tiros por tick para não perder cadência em quedas de frame.
- **Munição só é reposta ao renascer** (`weapon.refill()`); não há caixas de munição.
- Ao subir de nível no meio da vida, a munição é mantida (limitada às novas capacidades): subir de nível não é recarga grátis.

### Dispersão (spread) — cone em graus

| Estado | Meio-ângulo (nível 1) |
|---|---|
| Mirando (ADS) | 0,1° |
| Parado | 0,8° |
| Andando (velocidade > 0,6 m/s) | 1,8° |
| No ar ou correndo | 4,0° |
| Por tiro (acúmulo, *bloom*) | +0,2° (limite: o valor "no ar") |
| Recuperação do acúmulo | 6°/s, só depois de 0,08 s sem atirar |

- Agachado no chão: base × 0,8.
- Mirando: `mirando + bloom × 0,25`; a transição quadril→mira é interpolada pelo progresso do ADS.
- O resultado é multiplicado por `spreadMul` (carpa dourada/tiro ao alvo 0,5; poção do bêbado 2,5) — ver [[Buffs & Debuffs]].
- A direção do tiro é sorteada uniformemente no disco do cone. O retículo dinâmico do [[HUD]] desenha esse cone.

### Recuo (recoil)

- Vertical: 0,9° por tiro × (0,9–1,1 aleatório).
- Horizontal: padrão semi-determinístico entre −0,3° e +0,4° (senóide pelo índice do tiro + ruído pequeno). O índice zera após 0,35 s sem atirar.
- Mirando, o recuo cai até 25%; multiplicado por `recoilMul` (carpa 0,6; bêbado 1,8).
- Recuperação exponencial de 8/s (a 1/4 dessa taxa enquanto ainda atira).
- O **primeiro tiro vai exatamente onde o retículo está**: o tiro usa a mira antes do coice.

### Alcance, traçante e penetração

- Alcance máximo: 300 m.
- Traçante visível a cada 3 tiros (`tracanteACada`).
- **Penetração**: atravessa até 2 superfícies finas. Madeira mantém 60% do dano (espessura máx. 0,4 m no caminho da bala), vidro 90% (0,1 m), papel 95% (0,1 m). Mais grosso que isso (caixote, tábua atingida de raspão) para a bala. Tijolo, reboco, concreto e carros sempre param. O cálculo final do dano está em [[Damage System]].
- Peixes e frutas não param a bala (ver [[Map Gags]]).

### Interações com outras ações

- Puxar o gatilho **cancela o sprint no mesmo tick** e devolve o pino de uma granada sendo cozinhada (a granada não é perdida).
- Não dá para atirar durante recarga, golpe de faca ou dança de [[Humiliation]].
- Faca, granada (tirar o pino) e dança **cancelam a recarga** (o pente fica como estava).

## Níveis do rifle (`progression.json`)

| Nível | Nome | XP | Dano (perto/longe) | Pente | Cadência | Recuo × | Dispersão × | Recarga × | Zoom |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Rifle Padrão | 0 | 30/20 | 30 | 700 | 1 | 1 | 1 | 0,85 |
| 2 | Rifle Remendado com Fita | 400 | 31/21 | 30 | 700 | 0,95 | 0,92 | 1 | 0,80 |
| 3 | Rifle da Tia do Zap | 1000 | 32/22 | 32 | 710 | 0,90 | 0,86 | 0,94 | 0,78 |
| 4 | Rifle Pisca-Pisca de Natal | 1800 | 33/23 | 32 | 720 | 0,82 | 0,80 | 0,92 | 0,66 |
| 5 | Rifle Tunado com Adesivo de Chama | 2800 | 34/24 | 35 | 750 | 0,76 | 0,74 | 0,90 | 0,50 |
| 6 | Rifle com Luneta do Vovô | 4000 | 35/25 | 35 | 760 | 0,70 | 0,68 | 0,88 | 0,38 |
| 7 | Rifle Dourado Ostentação | 5500 | 37/26 | 40 | 780 | 0,62 | 0,60 | 0,85 | 0,30 |

`rifleData(nivel)` aplica essas mudanças sobre o JSON base. A mira (ferro, ponto vermelho, holo, luneta 2x/3x/4x) e o acabamento são visuais — ver [[Weapon Models]].

**TTK ideal** (fórmula do design doc, `idealTtk`): `(ceil(100 / dano) − 1) × 60 / cadência`. Nível 1 no peito a curta distância: 4 tiros ⇒ 0,257 s.

## Estados possíveis

`ads` (0..1), `reloading` (tática/vazia), `cooldown` entre tiros, `bloom`, `recoilPitch/Yaw`, `mag`/`reserve`.

## Entradas

`WeaponInput`: `fireHeld`, `firePressed`, `adsHeld`, `reloadPressed`, `sprinting`, `grounded`, `crouched`, `speed`.

## Saídas

Callback `shoot(spread, shotIndex)` → `traceShot` (raio Rapier) → acerto em hitbox / superfície / nada. Efeitos: flash, traçante, decal, partículas, som (ver [[Visual Effects]], [[SFX]]). Online: mensagens `shot` (cosmético) e `hit` (dano) — ver [[Remote Calls]].

## Dependências

[[Damage System]] (dano), [[Movement]] (estado de movimento para dispersão), [[Buffs & Debuffs]] (multiplicadores), [[Character Customization]] (PCD sem braço/mão: recarga × 1,3), [[Progression]] (níveis), [[Client Server Model]] (validação).

## Exceções

> [!warning] Divergência
> O cabeçalho de `client/weapons/weapon.ts` e o `README.md` falam em "atraso de saída do sprint". No código atual não há atraso temporizado: puxar o gatilho encerra o sprint no mesmo tick e só um sprint **ainda ativo** bloqueia o tiro.

- Campos do JSON do rifle **declarados mas não usados** pelo código: `categoria`, `slot`, `desbloqueioNivel`, `preco`, `slotsAcessorio`, `modelo` (`weapons/rifle_padrao.glb` não existe no repositório; o modelo é procedural) e `sons`. O `modo` só é lido para `auto` vs. semi/rajada (rajada não está implementada à parte). Ver [[Technical Debt]].
- Só existe uma arma de fogo (`WEAPONS = { rifle_padrao }`).

## Código relacionado

- `shared/weapons.ts` — `WeaponData`, `PenetrationData`, `damageAtDistance`, `computeDamage`, `idealTtk`, `minPenetrationKeep`.
- `client/weapons/weapon.ts` — classe `Weapon` (cadência, recarga, dispersão, recuo, ADS).
- `client/weapons/hitscan.ts` — `traceShot` (penetração), `applySpread`.
- `shared/progression.ts` — `rifleData`, `knifeData`, `levelInfo`.
- `client/main.ts` — hooks do rifle (`shoot`), `applyLoadout`.

## Configurações relacionadas

`shared/data/weapons/rifle_padrao.json`, `shared/data/progression.json`. Tabela em [[Constants Reference]].
