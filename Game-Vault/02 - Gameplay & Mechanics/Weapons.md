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
  - shared/data/weapons/rifle_fita.json
  - shared/data/weapons/rifle_tia.json
  - shared/data/weapons/rifle_natal.json
  - shared/data/weapons/rifle_chama.json
  - shared/data/weapons/rifle_vovo.json
  - shared/data/weapons/rifle_ouro.json
  - shared/data/weapons/pistola.json
  - shared/data/weapons/smg.json
  - shared/data/weapons/grampeador.json
  - shared/data/weapons/revolver.json
  - shared/data/weapons/furadeira.json
  - shared/data/weapons/garrucha.json
  - shared/data/weapons/pistolao.json
  - shared/data/weapons/faca.json
  - shared/data/weapons/granada_frag.json
  - shared/data/progression.json
  - client/weapons/weapon.ts
  - client/weapons/hitscan.ts
  - client/main.ts
  - client/core/keybinds.ts
  - client/ai/bot.ts
  - client/ai/botGuns.ts
  - server/session.ts
tags:
  - game
  - gameplay
  - weapons
updated: 2026-10-07
---

# Weapons

> [!info] Evidência
> Configuração confirmada (`shared/data/weapons/*.json`, `shared/data/progression.json`) e código confirmado (`client/weapons/weapon.ts`, `client/weapons/hitscan.ts`, `shared/weapons.ts`, `shared/arsenal.ts`, troca de arma em `client/main.ts`, validação em `server/session.ts`).

## Objetivo

Todo jogador carrega **duas armas de fogo** (um **rifle** como primária e uma **secundária**, escolhidos no Arsenal), uma **faca** (corpo a corpo, mata com um golpe; também escolhida) e **granadas**. Tudo é guiado por dados: cada arma tem um JSON com os atributos base e uma árvore de **melhorias** liberadas por nível ([[Progression]]). Não há compra, drop nem munição no mapa — ver [[Inventory]] e [[Items]].

## Visão geral do arsenal

| Arma | Espaço | Tecla | Arquivo de dados | Nota detalhada |
|---|---|---|---|---|
| Rifle Padrão ou um dos 6 rifles antigos | primária | `1` · mouse esquerdo / direito (mirar) / R | `rifle_padrao.json`, `rifle_*.json` | esta nota (§ Rifles) + [[Damage System]] |
| Pistola do Porteiro | secundária | `2` | `pistola.json` | esta nota |
| Submetralhadora Liquidificador | secundária | `2` | `smg.json` | esta nota |
| Grampeador do RH, Revólver do Delegado da Quadrilha, Furadeira do Vizinho de Domingo, Garrucha do Cangaceiro, Pistolão do Marombeiro | secundária | `2` | `grampeador.json`, `revolver.json`, `furadeira.json`, `garrucha.json`, `pistolao.json` | esta nota (§ Secundárias) |
| Faca de cozinha ou uma das 6 facas antigas | corpo a corpo | F | `faca.json`, `colher.json`… | [[Melee]] |
| Granada (ou mina / dose dupla) | arremesso | G | `granada_frag.json` | [[Grenades]], [[Land Mines]] |

O campo `slot` do JSON de cada arma de fogo decide em que espaço ela entra (`PRIMARIES`/`SECONDARIES` em `shared/progression.ts`). Os sete rifles são primários (padrão: o Rifle Padrão); o jogador leva **uma** das sete secundárias (padrão: a pistola). As armas com `libera` no JSON começam **trancadas**: os rifles antigos com os pontos do rifle, as outras seis secundárias com os pontos de **pistola** (a submetralhadora com 1.800, ou já liberada para quem fez pontos com ela; as da PF-10 com 700 a 9.000, ver § Secundárias) — ver [[Progression#Armas trancadas]], [[ADR - Árvore do Arsenal e armas liberadas por nível]] e [[ADR - Rifles e facas antigos como armas próprias]].

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

## Rifles

Os seis rifles antigos voltaram das primeiras versões do jogo (PF-8) como **armas próprias**: cada um tem o seu JSON, a sua pintura (`visual`, ver [[Weapon Models]]) e **uma troca** em relação ao Padrão (ganha algo, perde algo; nenhum é "o melhor"). Todos usam **os pontos, o nível e as melhorias do rifle** (`progOf` → `rifle`): o mesmo nível vale para os sete, e os pontos de um abate com qualquer rifle vão para o rifle. Cada um libera com os pontos de rifle do seu `libera` (os mesmos dos níveis do rifle).

| Rifle (`GunId`) | Libera com | Ganha | Perde |
|---|---|---|---|
| Rifle Padrão (`rifle`) | — | — | — |
| Remendado com Fita (`rifleFita`) | 1.000 pts de rifle | recarga ×0,85 (1,87 / 2,3 s) | recuo ×1,1 |
| da Tia do Zap (`rifleTia`) | 2.500 | cadência 760/min, mira em ×0,9 do tempo (0,198 s) | dano 28 / 19 |
| Pisca-Pisca de Natal (`rifleNatal`) | 4.500 | recuo ×0,8 | cadência 650/min |
| Tunado com Adesivo de Chama (`rifleChama`) | 7.000 | cadência 820/min, mobilidade 1,03 | dispersão sem mirar ×1,25 |
| do Vovô (`rifleVovo`) | 10.000 | dano 36 / 25 | cadência 600/min, tempo de mira ×1,3 (0,286 s) |
| Dourado Ostentação (`rifleOuro`) | 16.000 | pente 40, reserva 160 | mobilidade 0,92, recarga ×1,15 (2,53 / 3,1 s) |

O resto (multiplicadores, queda de dano, penetração, alcance) é igual ao do Padrão. As melhorias do rifle se aplicam por cima dos atributos de cada um (`gunStats(rifle, melhorias)`).

## Secundárias

Cinco secundárias entraram na PF-10 ([[ADR - Secundárias novas no Arsenal]]), cada uma com um **nicho estreito** e nenhum efeito cômico de gameplay (a graça está no nome, no [[Weapon Models|modelo]] e no [[SFX|som]]). Grampeador, revólver, garrucha e pistolão usam **os pontos, o nível e as melhorias da pistola**; a furadeira, os da **submetralhadora** (`progOf`). Todas liberam com pontos **de pistola**, na ordem da linha: pistola (livre), grampeador 700, submetralhadora 1.800, revólver 3.200, furadeira 5.200, garrucha 7.000, pistolão 9.000 (os dois últimos acima do último nível da pistola: os pontos continuam contando).

Diferenças sobre a Pistola do Porteiro (o que não está na tabela é igual a ela, inclusive os multiplicadores fora a cabeça e a penetração, menos na garrucha):

| Arma (`GunId`) | Gatilho | Dano perto → longe (queda entre) | Cabeça | Pente / reserva | Recarga tática / vazia | Outras diferenças |
|---|---|---|---|---|---|---|
| 📎 Grampeador do RH (`grampeador`) | **rajada** de 3 a 1.100/min, pausa mínima 0,2 s | 24 → 15 (10–28 m) | ×2,5 | 18 / 72 | 1,5 / 1,8 s | recuo 0,9°, +0,3° de dispersão por tiro |
| ⭐ Revólver do Delegado da Quadrilha (`revolver`) | semi 150/min | 50 → 32 (10–30 m) | ×2 | 6 / 36 | 2,4 / 2,4 s | dispersão parado 0,5°, +0,9°/tiro; recuo 2,6°; ADS 0,18 s; mobilidade 1,04; saque 0,4 s; coice na tela ×1,6 |
| 🔩 Furadeira do Vizinho de Domingo (`furadeira`) | automática 1.200/min | 17 → 9 (5–16 m) | ×1,8 | 20 / 80 | 1,6 / 1,9 s | dispersão parado 1,3°, mirando 0,4°, +0,35°/tiro; recuo 0,45° vertical, ±0,9° horizontal; ADS 0,12 s, zoom 0,95; mobilidade 1,08; saque 0,25 s; alcance 120 m |
| 🌵 Garrucha do Cangaceiro (`garrucha`) | semi 300/min, **8 bagos** num cone fixo de 4,5° | 20 → 4 **por bago** (5–15 m) | ×1,5 por bago | 2 / 16 | 2,2 / 2,2 s | alcance 40 m; **sem penetração**; coice na tela ×2 |
| 💪 Pistolão do Marombeiro (`pistolao`) | semi 170/min | 60 → 40 (15–40 m) | ×2 | 7 / 28 | 2,0 / 2,5 s | dispersão parado 1,0°, andando 2,0°, +1,2°/tiro; recuo 4,0°; ADS 0,2 s; mobilidade 1,0; saque 0,5 s; coice na tela ×2,5 |

- **Rajada** (`modo: "rajada"`, `rajada: { tiros, pausa }`): um clique (ou um toque mais curto que um tick) dispara os 3 grampos na cadência; depois do último, pelo menos 0,2 s até a próxima. **Segurar não repete**: é preciso soltar e clicar de novo. A rajada termina sozinha ao soltar, mas para se a arma for guardada, a recarga começar, o sprint voltar, as mãos ficarem ocupadas (faca, dança, granada, saque) ou o pente acabar (com 2 grampos, saem 2). O Gatilho de Fliperama da pistola acelera a cadência dentro da rajada, não a pausa.
- **Ajuste da garrucha (2026-10-07)**: o dano por bago subiu de 13 → 4 (3–12 m) para **20 → 4 (5–15 m)**, porque com o cone de 4,5° só ~6 dos 8 bagos acertam o tronco a 3 m e ~4 a 5 m: antes ela só matava com um tiro a ~2 m (abaixo do bote da faca, 3,2 m) e precisava de 3 tiros (com recarga no meio) a 5 m. Estimativa (Monte Carlo sobre as hitboxes de `client/entities/hitboxes.ts`, mirando no peito, sem contar os braços): um tiro mata ~90% das vezes a 3 m e ~60% a 4 m; dois tiros matam até ~6 m. O cone, a cadência, o pente e o mínimo (4) não mudaram, então a regra contra o rifle de 15 m em diante continua valendo.
- **Bagos** (`bagos`, `cone`): cada disparo sorteia 8 direções uniformes num cone de meio-ângulo 4,5° em volta de onde o tiro vai (a direção do tiro tem a dispersão normal da arma; o cone dos bagos não abre com movimento). **Cada bago é um raio e cada bago que acerta é um acerto próprio** (dano, região, distância e penetração dele) — ver [[Damage System]]. Os outros veem um único tiro.
- **Regra de equilíbrio** (P10 do plano, `server/tests/secondaries.test.ts`): com qualquer combinação das melhorias da progressão dela, nenhuma mata (no peito) mais rápido que o Rifle Padrão de 15 m em diante (rifle: 0,257 s até 30 m, 0,343 s a 40 m). Cada uma ganha de perto, no seu nicho: a furadeira (0,223 s a 5 m com o Motor), a garrucha (um tiro com os 8 bagos no peito até 5 m; na prática, com os bagos que escapam do corpo, mata com um tiro até ~3–4 m e com os dois canos até ~6 m; a partir de 15 m volta a 4 por bago), o pistolão (2 tiros até ~28 m, 0,271 s com o Gatilho). **Tiro único na cabeça** só de perto: revólver até 10 m, pistolão até ~27 m (com o Silenciador de Batata, o revólver perde o tiro único e o pistolão só o tem até ~22 m).

**TTK ideal** (fórmula do design doc, `idealTtk`): `(ceil(100 / dano) − 1) × 60 / cadência`. No peito, a curta distância e sem melhorias: rifle 4 tiros ⇒ 0,257 s; SMG 5 tiros ⇒ 0,253 s (mas cai rápido com a distância); pistola 4 tiros ⇒ 0,45 s (se o dedo acompanhar).

O que cada melhoria muda (dano, cadência, pente, mira, silenciador…) está em [[Progression]]; os números com as melhorias saem de `gunStats` (abaixo).

## Como o jogador interage

- **Atirar**: segurar o botão nas automáticas (até 4 tiros por tick para não perder cadência); nas semiautomáticas (pistola, revólver, garrucha, pistolão), cada clique é um tiro (`modo: semi`); no grampeador, cada clique é uma rajada de 3 (`modo: rajada`). Um toque mais curto que um tick ainda dispara.
- **Mirar (ADS)**: segurar o botão direito. Entra em `ads.tempo`, sai 1,3× mais rápido. Reduz o FOV (`zoom`) e a sensibilidade (`adsSensitivity` das [[Settings]]). Correr derruba a mira. Com uma luneta (2x, a do Vovô 3x ou 4x), mirar por completo mostra a visão da luneta.
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
- **Silenciador** (melhoria opcional do rifle e da pistola; a batata da pistola vale também no grampeador, no revólver, na garrucha e no pistolão): os outros só ouvem o tiro de perto (som abafado, tipo `step` do áudio espacial) e não veem o traçante. Ver [[SFX]].
- Peixes e frutas não param a bala ([[Map Gags]]).

### Interações com outras ações

- Puxar o gatilho **cancela o sprint no mesmo tick** e devolve o pino de uma granada sendo cozinhada.
- Não dá para atirar durante recarga, saque, golpe de faca ou dança de [[Humiliation]].
- Faca, granada (tirar o pino), dança e troca de arma **cancelam a recarga**.

## Estados possíveis

Por arma: `ads` (0..1), `reloading` (tática/vazia), `cooldown`, `bloom`, `recoilPitch/Yaw`, `mag`/`reserve`. No jogador: espaço na mão (`primaria`/`secundaria`) e o tempo de saque restante.

## Entradas

`WeaponInput`: `fireHeld`, `firePressed`, `adsHeld`, `reloadPressed`, `sprinting`, `grounded`, `crouched`, `speed`, `holdFire?` (mãos ocupadas: corta uma rajada em andamento). Ações de troca: `weapon1`, `weapon2`, `swapWeapon`.

## Saídas

Callback `shoot(spread, shotIndex, bagos)` → `traceShot` (raio Rapier; um por bago na garrucha, `offsetDir`) → acerto em hitbox / superfície / nada. Efeitos: flash, coice na tela (× `coiceVisual`), traçante, decal, partículas, som da arma (`gunshot(volume, voz)`: a voz de cada arma ou silenciado) — ver [[Visual Effects]], [[SFX]]. Online: um `shot` (cosmético) por disparo e um `hit {target, region, dist, w, keep?}` por bala ou bago que acerta, com `w` = a arma que atirou — ver [[Remote Calls]]. O som e o marcador de acerto tocam uma vez por disparo (o melhor resultado entre os bagos).

## Validação online

O servidor aceita o `hit` só se `w` for a arma na mão (um rifle antigo vai com o próprio id, ex.: `rifleTia`) (pelo `FLAG.secondary`), a que acabou de ser guardada ou a que o modo acabou de trocar (menos de 1 s, `SWITCH_GRACE_MS`: tiros já disparados), e se ela estiver no loadout do jogador. Um loadout `soFaca` (o Sabre de Luz da corrida armada) não aceita tiro nenhum. Cadência, alcance, penetração mínima e dano são os **dessa arma com as melhorias do jogador** (`gunStats`); o limite de acertos por segundo é `(ceil(cadência/60) + 2) × bagos` (`hitsPerSecond`: 8× na garrucha). O abate informa a arma (`kill.arma`, a arma que atirou) e **os pontos vão para a progressão dela**: abates de pistola, grampeador, revólver, garrucha e pistolão evoluem a pistola; de furadeira, a submetralhadora; com qualquer rifle, o rifle. Ver [[ADR - Acertos informados pelo cliente com tolerância de lag]] e [[Anti Cheat]].

## Bots

No mata-mata, cada bot sorteia a arma a cada vida (`pickGun` em `client/ai/botGuns.ts`: 60% um dos sete rifles, 40% uma das sete secundárias, todos com a mesma chance dentro do grupo) e uma faca qualquer, sem melhorias e sem travas (bot não tem conta) (na corrida armada usa a do degrau), e a usa como um jogador (semi e rajada com o gatilho pulsado tick a tick; a garrucha com um raio por bago). O kill feed mostra a arma certa. Ver [[Versus Bots]].

## API para modos de jogo

Os modos montam armas só com dados, pelas funções de `shared/arsenal.ts` (detalhes em [[Shared Systems]]). A [[Gun Game|corrida armada]] já usa isso: cada degrau da escada é `ladderLoadout(degrau)` (`shared/gunGame.ts`), uma arma com melhorias fixas, e o último é `{ soFaca: true, faca: 'sabre' }`. No mata-mata o loadout é o da conta, travado na partida ([[ADR - Equipamento travado no mata-mata]]). O [[Zombie|zumbi]] também: todos começam com `zombieLoadout(startItems())` (o rifle sem melhorias, nada na secundária) e cada prêmio do **Caixão Misterioso** é uma arma com melhorias fixas e uma **raridade** que multiplica o dano **só contra zumbis** (×1,4 a ×3,5; `gunDamageToZombie` em `shared/zombies.ts`); o servidor troca o loadout com `playerLoadout`. A reserva de munição é ×3 nesse modo e volta cheia a cada intervalo. Um prêmio pode vir **danificado** (`Loadout.danificadas`): com menos munição (60% do pente e 50% da reserva, aplicado pelo cliente em `zombieGunData`), menos dano contra zumbis (×0,75, aplicado pelo servidor em `weaponMul`) ou os dois ([[ADR - Caixão fixo com armas danificadas]]).

| Função | Devolve |
|---|---|
| `gunStats(arma, melhorias)` | `GunStats`: `WeaponData` com as melhorias aplicadas + `arma`, `mira`, `visual` (a pintura do JSON da arma), `silenciador`. `gunStats('smg')` = SMG sem melhorias; `gunStats('rifleOuro', ['pente'])` = Dourado com o pente (50). As melhorias são as da progressão da arma (`progOf`). |
| `meleeStats(faca, melhorias)` | `MeleeStats` de uma faca com as melhorias da faca; `meleeStats('sabre', [])` = **Sabre de Luz Paraguaio**. |
| `grenadeStats(melhorias)` | `GrenadeStats` com `tipo` (`granada`/`mina`/`dupla`), `quantidade` e a explosão (`explosao`). |
| `resolveLoadout(escolha, níveis)` | `Loadout` (`primaria`, `secundaria` ou `null`, `faca`, `ativas` por progressão, `soFaca?`) a partir da escolha do Arsenal. `soFaca`: só a faca, sempre na mão, o tiro golpeia (só a corrida armada entrega). |
| `slotStats(loadout, espaço)` | atributos da arma de um espaço (`null` se vazio). |
| `knifeOf(loadout)` / `loadoutKnife(loadout)` | a faca do loadout (padrão `faca`) / os atributos dela com as melhorias da faca. |

## Exceções

> [!warning] Divergência
> O cabeçalho de `client/weapons/weapon.ts` e o `README.md` falam em "atraso de saída do sprint". No código atual não há atraso temporizado: puxar o gatilho encerra o sprint no mesmo tick e só um sprint **ainda ativo** bloqueia o tiro.

- Campos do JSON das armas **declarados mas não usados** pelo código: `categoria`, `desbloqueioNivel` (a trava usada é `libera`), `preco`, `slotsAcessorio`, `modelo` (os `.glb` citados não existem; os modelos são procedurais) e `sons`. O `modo` distingue `auto`, `semi` e `rajada` (esta com os dados de `rajada`; sem eles, vira semi). Ver [[Technical Debt]].

## Código relacionado

- `shared/weapons.ts` — `WeaponData` (com `troca`, `icone`, `visual`, `libera`, `rajada`, `bagos`, `cone`, `coiceVisual`), `WeaponLock`, `PenetrationData`, `damageAtDistance`, `computeDamage`, `idealTtk`, `minPenetrationKeep`, `pelletsOf`, `hitsPerSecond`, `WEAPONS`.
- `shared/arsenal.ts` — `gunStats`, `meleeStats`, `grenadeStats`, `resolveLoadout`, `knifeOf`, `loadoutKnife`, `Loadout`, `GunSlot`.
- `shared/progression.ts` — `GunId`, `GUN_IDS`, `GUN_DATA_ID`, `PRIMARIES`, `SECONDARIES`, `progOf`, `lockOf`, `weaponUnlocked`.
- `client/weapons/weapon.ts` — classe `Weapon` (cadência, rajada, recarga, dispersão, recuo, ADS, `holster`, `setData`), `pelletSpread`, `Pellet`.
- `client/weapons/hitscan.ts` — `traceShot` (penetração), `applySpread`, `offsetDir` (a direção de cada bago).
- `client/main.ts` — `guns`, `holdSlot`, `switchTo`, `applyLoadout`, hooks de tiro (`gunHooks`).
- `server/session.ts` — `firedGun`, `onHit`, `fireRate`.

## Configurações relacionadas

`shared/data/weapons/*.json`, `shared/data/progression.json`. Tabela em [[Constants Reference]].
