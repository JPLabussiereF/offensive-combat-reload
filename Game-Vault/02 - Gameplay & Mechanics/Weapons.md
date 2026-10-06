---
title: Weapons
type: mechanic
status: documented
area: gameplay
source_paths:
  - shared/modes.ts
  - shared/gunGame.ts
  - shared/weapons.ts
  - shared/arsenal.ts
  - shared/progression.ts
  - shared/data/weapons/rifle_padrao.json
  - shared/data/weapons/pistola.json
  - shared/data/weapons/smg.json
  - shared/data/weapons/faca.json
  - shared/data/weapons/granada_frag.json
  - shared/data/progression.json
  - client/weapons/weapon.ts
  - client/weapons/hitscan.ts
  - client/main.ts
  - client/core/keybinds.ts
  - server/session.ts
tags:
  - game
  - gameplay
  - weapons
updated: 2026-10-06
---

# Weapons

> [!info] Evidência
> Configuração confirmada (`shared/data/weapons/*.json`, `shared/data/progression.json`) e código confirmado (`client/weapons/weapon.ts`, `client/weapons/hitscan.ts`, `shared/weapons.ts`, `shared/arsenal.ts`, troca de arma em `client/main.ts`, validação em `server/session.ts`).

## Objetivo

Todo jogador carrega **duas armas de fogo** (uma **primária** e uma **secundária** escolhida no Arsenal), a **faca** (corpo a corpo, mata com um golpe) e **granadas**. Tudo é guiado por dados: cada arma tem um JSON com os atributos base e uma árvore de **melhorias** liberadas por nível ([[Progression]]). Não há compra, drop nem munição no mapa — ver [[Inventory]] e [[Items]].

## Visão geral do arsenal

| Arma | Espaço | Tecla | Arquivo de dados | Nota detalhada |
|---|---|---|---|---|
| Rifle Padrão | primária | `1` · mouse esquerdo / direito (mirar) / R | `rifle_padrao.json` | esta nota + [[Damage System]] |
| Pistola do Porteiro | secundária | `2` | `pistola.json` | esta nota |
| Submetralhadora Liquidificador | secundária | `2` | `smg.json` | esta nota |
| Faca | corpo a corpo | F | `faca.json` | [[Melee]] |
| Granada (ou mina / dose dupla) | arremesso | G | `granada_frag.json` | [[Grenades]], [[Land Mines]] |

O campo `slot` do JSON de cada arma de fogo decide em que espaço ela entra (`PRIMARIES`/`SECONDARIES` em `shared/progression.ts`). Hoje só o rifle é primário; o jogador leva **uma** das secundárias (padrão: a pistola).

## Atributos base das armas de fogo

| Atributo | Rifle | Pistola | Submetralhadora |
|---|---|---|---|
| Modo | `auto` | `semi` (um clique, um tiro) | `auto` |
| Dano perto / longe (queda entre) | 30 / 20 (20–45 m) | 28 / 17 (12–30 m) | 22 / 12 (8–25 m) |
| Cabeça | ×2,5 | ×2,8 | ×2,0 |
| Cadência | 700/min | 400/min (limite do semi) | 950/min |
| Pente / reserva | 30 / 120 | 12 / 48 | 32 / 128 |
| Recarga tática / vazia | 2,2 / 2,7 s | 1,4 / 1,7 s | 1,9 / 2,3 s |
| Dispersão mirando / parado / andando / no ar | 0,1 / 0,8 / 1,8 / 4,0° | 0,15 / 0,7 / 1,4 / 3,2° | 0,25 / 1,0 / 1,6 / 3,5° |
| Por tiro / recuperação | +0,2° / 6°/s | +0,45° / 9°/s | +0,25° / 8°/s |
| Recuo vertical / horizontal / retorno | 0,9° / −0,3…0,4° / 8 | 1,6° / ±0,4° / 12 | 0,55° / ±0,45° / 10 |
| ADS (tempo / zoom) | 0,22 s / 0,85 | 0,14 s / 0,9 | 0,17 s / 0,9 |
| Mobilidade (`movimento`) | 1,0 | 1,06 | 1,08 |
| Tempo de saque (`troca`) | 0,45 s | 0,3 s | 0,35 s |
| Alcance máximo | 300 m | 200 m | 200 m |
| Penetração | 2 superfícies (madeira 60%, vidro 90%, papel 95%) | 1 superfície (madeira 50%, vidro 85%, papel 90%) | igual à pistola |
| Traçante | a cada 3 tiros | a cada 2 | a cada 2 |

**TTK ideal** (fórmula do design doc, `idealTtk`): `(ceil(100 / dano) − 1) × 60 / cadência`. No peito, a curta distância e sem melhorias: rifle 4 tiros ⇒ 0,257 s; SMG 5 tiros ⇒ 0,253 s (mas cai rápido com a distância); pistola 4 tiros ⇒ 0,45 s (se o dedo acompanhar).

O que cada melhoria muda (dano, cadência, pente, mira, silenciador…) está em [[Progression]]; os números com as melhorias saem de `gunStats` (abaixo).

## Como o jogador interage

- **Atirar**: segurar o botão nas automáticas (até 4 tiros por tick para não perder cadência); na pistola, cada clique é um tiro (`modo: semi`). Um toque mais curto que um tick ainda dispara.
- **Mirar (ADS)**: segurar o botão direito. Entra em `ads.tempo`, sai 1,3× mais rápido. Reduz o FOV (`zoom`) e a sensibilidade (`adsSensitivity` das [[Settings]]). Correr derruba a mira. Com a luneta, mirar por completo mostra a visão da luneta.
- **Recarregar**: R. Atirar com pente vazio e reserva > 0 recarrega sozinho; sem reserva toca "clique seco".
- **Trocar de arma**: `1` (primária), `2` (secundária), roda do mouse (qualquer direção vai para a outra) — ações `weapon1`, `weapon2`, `swapWeapon`, remapeáveis ([[ADR - Teclas remapeáveis com primária e alternativa]]); no controle, **D-pad ←/→**; no celular, o botão de troca acima do pulo ([[Touch Controls]]).

## Troca de arma

- Cada espaço é uma instância própria de `Weapon` (`guns` em `client/main.ts`): **cada arma guarda o próprio pente** enquanto a outra está na mão.
- Guardar a arma (`holster`) **cancela a recarga**, a mira e o recuo acumulado dela.
- A arma que entra leva o seu **tempo de saque** (`troca`): enquanto sobe (animação no viewmodel), não atira, não mira e não recarrega. A pistola é a mais rápida; o coldre de velcro corta pela metade; o tambor da SMG deixa mais lento.
- Não dá para trocar com as mãos ocupadas (golpe de faca, granada na mão, dança): esses toques são descartados.
- **Toda vida começa com a primária na mão** e os dois pentes cheios.
- Trocar a secundária no Arsenal no meio da vida traz a nova arma **tão cheia quanto a anterior estava** (proporcional ao pente); ligar uma melhoria mantém a munição (limitada à nova capacidade) — não é recarga grátis.
- Online, a arma na mão vai no bit `FLAG.secondary` do estado ([[Replication]]): os outros veem a arma certa na mão (a primária vai para as costas), ouvem o tiro dela e o servidor sabe qual arma pode ter acertado ([[Remote Calls]]).

## Regras comuns das armas de fogo

### Dispersão (spread) — cone em graus

- Estado: mirando, parado, andando (> 0,6 m/s), no ar ou correndo (valores na tabela).
- Acúmulo por tiro (*bloom*), limitado ao valor "no ar"; recupera só depois de 0,08 s sem atirar.
- Agachado no chão: base × 0,8. Mirando: `mirando + bloom × 0,25`, interpolado pelo progresso do ADS.
- Multiplicada por `spreadMul` (carpa dourada/tiro ao alvo 0,5; poção do bêbado 2,5) — ver [[Buffs & Debuffs]]. Vale para as duas armas.
- A direção do tiro é sorteada no disco do cone; o retículo dinâmico do [[HUD]] desenha esse cone.

### Recuo (recoil)

- Vertical por tiro × (0,9–1,1 aleatório); horizontal semi-determinístico (senóide pelo índice do tiro + ruído). O índice zera após 0,35 s sem atirar.
- Mirando, o recuo cai até 25%; multiplicado por `recoilMul` (carpa 0,6; bêbado 1,8).
- Recuperação exponencial (`retorno`), a 1/4 enquanto ainda atira. O **primeiro tiro vai exatamente onde o retículo está**.

### Alcance, traçante e penetração

- Dano cai linearmente entre `distMax` e `distMin` ([[Damage System]]).
- **Penetração**: atravessa superfícies finas dos materiais listados no JSON, mantendo parte do dano; mais grosso que `espessuraMax` no caminho para a bala. Tijolo, reboco, concreto e carros sempre param.
- **Silenciador** (melhoria opcional do rifle e da pistola): os outros só ouvem o tiro de perto (som abafado, tipo `step` do áudio espacial) e não veem o traçante. Ver [[SFX]].
- Peixes e frutas não param a bala ([[Map Gags]]).

### Interações com outras ações

- Puxar o gatilho **cancela o sprint no mesmo tick** e devolve o pino de uma granada sendo cozinhada.
- Não dá para atirar durante recarga, saque, golpe de faca ou dança de [[Humiliation]].
- Faca, granada (tirar o pino), dança e troca de arma **cancelam a recarga**.

## Estados possíveis

Por arma: `ads` (0..1), `reloading` (tática/vazia), `cooldown`, `bloom`, `recoilPitch/Yaw`, `mag`/`reserve`. No jogador: espaço na mão (`primaria`/`secundaria`) e o tempo de saque restante.

## Entradas

`WeaponInput`: `fireHeld`, `firePressed`, `adsHeld`, `reloadPressed`, `sprinting`, `grounded`, `crouched`, `speed`. Ações de troca: `weapon1`, `weapon2`, `swapWeapon`.

## Saídas

Callback `shoot(spread, shotIndex)` → `traceShot` (raio Rapier) → acerto em hitbox / superfície / nada. Efeitos: flash, traçante, decal, partículas, som da arma (`gunshot(volume, voz)`: rifle, pistola, smg ou silenciado) — ver [[Visual Effects]], [[SFX]]. Online: `shot` (cosmético) e `hit {target, region, dist, w, keep?}` com `w` = a arma que atirou — ver [[Remote Calls]].

## Validação online

O servidor aceita o `hit` só se `w` for a arma na mão (pelo `FLAG.secondary`), a que acabou de ser guardada ou a que o modo acabou de trocar (menos de 1 s, `SWITCH_GRACE_MS`: tiros já disparados), e se ela estiver no loadout do jogador. Um loadout `soFaca` (o Sabre de Luz da corrida armada) não aceita tiro nenhum. Cadência, alcance, penetração mínima e dano são os **dessa arma com as melhorias do jogador** (`gunStats`). O abate informa a arma (`kill.arma`) e **os pontos vão para ela**: abates de pistola evoluem a pistola. Ver [[ADR - Acertos informados pelo cliente com tolerância de lag]] e [[Anti Cheat]].

## Bots

No mata-mata, cada bot sorteia a arma a cada vida (60% rifle, 25% SMG, 15% pistola), sem melhorias (na corrida armada usa a do degrau), e a usa como um jogador (a pistola com o gatilho pulsado tick a tick). O kill feed mostra a arma certa. Ver [[Versus Bots]].

## API para modos de jogo

Os modos montam armas só com dados, pelas funções de `shared/arsenal.ts` (detalhes em [[Shared Systems]]). A [[Gun Game|corrida armada]] já usa isso: cada degrau da escada é `ladderLoadout(degrau)` (`shared/gunGame.ts`), uma arma com melhorias fixas, e o último é `{ soFaca: true, ativas.faca: ['sabre'] }`. No mata-mata o loadout é o da conta, travado na partida ([[ADR - Equipamento travado no mata-mata]]). O [[Zombie|zumbi]] também: todos começam com `zombieLoadout(startItems())` (o rifle sem melhorias, nada na secundária) e cada prêmio do **Caixão Misterioso** é uma arma com melhorias fixas e uma **raridade** que multiplica o dano **só contra zumbis** (×1,4 a ×3,5; `gunDamageToZombie` em `shared/zombies.ts`); o servidor troca o loadout com `playerLoadout`. A reserva de munição é ×3 nesse modo e volta cheia a cada intervalo.

| Função | Devolve |
|---|---|
| `gunStats(arma, melhorias)` | `GunStats`: `WeaponData` com as melhorias aplicadas + `arma`, `mira`, `visual`, `silenciador`. `gunStats('smg')` = SMG sem melhorias. |
| `meleeStats(melhorias)` | `MeleeStats` da faca; `meleeStats(['sabre'])` = **Sabre de Luz Paraguaio**. |
| `grenadeStats(melhorias)` | `GrenadeStats` com `tipo` (`granada`/`mina`/`dupla`), `quantidade` e a explosão (`explosao`). |
| `resolveLoadout(escolha, níveis)` | `Loadout` (`primaria`, `secundaria` ou `null`, `ativas` por arma, `soFaca?`) a partir da escolha do Arsenal. `soFaca`: só a faca, sempre na mão, o tiro golpeia (só a corrida armada entrega). |
| `slotStats(loadout, espaço)` | atributos da arma de um espaço (`null` se vazio). |

## Exceções

> [!warning] Divergência
> O cabeçalho de `client/weapons/weapon.ts` e o `README.md` falam em "atraso de saída do sprint". No código atual não há atraso temporizado: puxar o gatilho encerra o sprint no mesmo tick e só um sprint **ainda ativo** bloqueia o tiro.

- Campos do JSON das armas **declarados mas não usados** pelo código: `categoria`, `desbloqueioNivel`, `preco`, `slotsAcessorio`, `modelo` (os `.glb` citados não existem; os modelos são procedurais) e `sons`. O `modo` só distingue `auto` de semi/rajada (rajada não está implementada à parte). Ver [[Technical Debt]].

## Código relacionado

- `shared/weapons.ts` — `WeaponData` (com `troca`), `PenetrationData`, `damageAtDistance`, `computeDamage`, `idealTtk`, `minPenetrationKeep`, `WEAPONS`.
- `shared/arsenal.ts` — `gunStats`, `meleeStats`, `grenadeStats`, `resolveLoadout`, `Loadout`, `GunSlot`.
- `client/weapons/weapon.ts` — classe `Weapon` (cadência, recarga, dispersão, recuo, ADS, `holster`, `setData`).
- `client/weapons/hitscan.ts` — `traceShot` (penetração), `applySpread`.
- `client/main.ts` — `guns`, `holdSlot`, `switchTo`, `applyLoadout`, hooks de tiro (`gunHooks`).
- `server/session.ts` — `firedGun`, `onHit`.

## Configurações relacionadas

`shared/data/weapons/*.json`, `shared/data/progression.json`. Tabela em [[Constants Reference]].
