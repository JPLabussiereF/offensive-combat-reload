---
title: Melee
type: mechanic
status: documented
area: gameplay
source_paths:
  - client/character/animator.ts
  - client/render/viewmodel.ts
  - shared/gunGame.ts
  - shared/data/weapons/faca.json
  - shared/data/weapons/colher.json
  - shared/data/weapons/frango.json
  - shared/data/weapons/baguete.json
  - shared/data/weapons/peixe.json
  - shared/data/weapons/macarrao.json
  - shared/data/weapons/sabre.json
  - shared/weapons.ts
  - shared/progression.ts
  - shared/data/progression.json
  - client/weapons/melee.ts
  - client/entities/hitboxes.ts
  - client/main.ts
  - client/entities/localPlayer.ts
  - client/ai/bots.ts
  - server/session.ts
  - shared/arsenal.ts
  - client/audio/sfx.ts
tags:
  - game
  - gameplay
  - melee
  - knife
updated: 2026-10-07
---

# Melee

> [!info] Evidência
> Configuração confirmada (`faca.json` e os JSONs das outras facas, `progression.json`) e código confirmado (`client/weapons/melee.ts`, `startMelee`/`resolveMelee` em `client/main.ts`, `onStab` em `server/session.ts`).

## Objetivo

Golpe rápido com a faca escolhida no Arsenal que **mata com um acerto** ("In the original, a knife hit is always a one-hit kill"), com uma **investida** curta que puxa o jogador até um alvo próximo. Bônus por facada e por facada pelas costas.

## Como o jogador interage

**F** (controle: R1/RB ou R3; toque: botão de faca). O golpe sai sem trocar de arma: a faca só aparece durante o golpe.

**Exceção — lâmina na mão (só na corrida armada):** no último degrau da [[Gun Game|corrida armada]] o loadout é `soFaca` com a faca Sabre de Luz (`faca: 'sabre'`). Então a lâmina fica **sempre na mão** (primeira pessoa: `Viewmodel.setBladeOnly`, pose `VM_FEEL.blade`; terceira pessoa: `AvatarPose.blade`, pose de guarda, sem armas nas costas), o **botão de tiro também golpeia**, não há mira nem recarga e a velocidade de movimento é a base (×1). Nenhum outro modo permite andar com a faca na mão.

## Regras

| Regra (sem melhorias, Faca de Cozinha) | Valor |
|---|---|
| Letal (`letal`) | sim → 9999 de dano |
| Alcance do acerto (`alcance`) | 1,8 m (do olho à superfície do corpo) |
| Alcance da investida (`alcanceInvestida`) | 3,2 m |
| Ângulo máximo (`anguloGraus`) | 45° horizontais em relação à visão |
| Duração do golpe (`duracao`) | 0,45 s |
| Momento do acerto (`impacto`) | 0,14 s após o início |
| Intervalo entre golpes (`intervalo`) | 0,6 s |
| Velocidade da investida | 14 m/s |

### As facas

São sete, cada uma com o seu JSON em `shared/data/weapons/` (`KnifeId` em `shared/progression.ts`). Todas são letais; o que muda é o alcance do golpe, o da investida, o intervalo e a **passiva** de cada uma (abaixo). As seis antigas voltaram das primeiras versões do jogo (PF-8) e **liberam com os pontos da faca** (`libera`); todas usam **os pontos, o nível e as melhorias da faca** ([[ADR - Rifles e facas antigos como armas próprias]]).

| Faca (`KnifeId`) | Libera com | Golpe | Investida | Intervalo | Velocidade da investida |
|---|---|---|---|---|---|
| Faca de Cozinha (`faca`) | — | 1,8 m | 3,2 m | 0,6 s | 14 m/s |
| Colher de Pau da Vó (`colher`) | 600 pts de faca | 1,95 m | 3,2 m | 0,66 s | 14 |
| Frango de Borracha (`frango`) | 1.500 | 1,8 m | 4,0 m | 0,6 s | 15,4 |
| Baguete Amanhecida (`baguete`) | 2.800 | 2,1 m | 3,2 m | 0,69 s | 14 |
| Peixe Congelado (`peixe`) | 4.500 | 1,8 m | 4,4 m | 0,72 s | 14 |
| Macarrão de Piscina (`macarrao`) | 6.500 | 2,4 m | 2,7 m | 0,78 s | 14 |
| Sabre de Luz Paraguaio (`sabre`) | 9.000 | 2,5 m | 3,5 m | 0,78 s | 14 |

Cada uma tem modelo e som próprios ([[Weapon Models]], [[SFX]]). Só a faca de cozinha é discreta: o som das outras **todos ouvem de longe**.

### Passivas

Cada faca tem uma passiva própria (`passiva` no JSON, tipo `KnifePassive` em `shared/weapons.ts`), além dos números. Desde 2026-10-07 ([[ADR - Passivas das facas e Mão Leve]]).

| Faca | Passiva (`id`) | Efeito |
|---|---|---|
| Faca de Cozinha | Discreta (`discreta`) | O golpe só é ouvido de perto (som espacial `step`, até 34 m; as outras usam `normal`, até 70 m). |
| Colher de Pau da Vó | Colo de Vó (`coloDeVo`, `vida: 50`) | Cada abate com ela devolve 50 de vida (até o máximo). |
| Frango de Borracha | Fuga Escandalosa (`fugaEscandalosa`, `velocidade: 1,15`, `segundos: 3`) | Depois de um abate com ele, ×1,15 de velocidade por 3 s. |
| Baguete Amanhecida | Pausa pro Lanche (`lanche`) | Cada abate com ela enche o pente da arma na mão, sem gastar a reserva. |
| Peixe Congelado | Tapa Gelado (`tapaGelado`, `costas: 100`) | O prêmio "Pelas costas" vale +100 em vez de +50 (pontos e XP da faca). |
| Macarrão de Piscina | Boia (`boia`) | Com ele equipado, nenhum dano de queda. |
| Sabre de Luz Paraguaio | Vuuum (`vuuum`) | O golpe acerta **todos** no alcance e no cone, não só um. |

- **Onde vale:** `knifePassive(faca, modo)` (`shared/arsenal.ts`) devolve a passiva só com a faca da conta: em modo cujas armas vêm do Arsenal (mata-mata), no campo de tiro (`modo` null) e contra bots. Na [[Gun Game|corrida armada]] e no [[Zombie|zumbi]], a faca é do modo e não tem passiva. A exceção é a Discreta: é o som da faca de cozinha e vale em todo modo, como já valia.
- **Quem aplica:**
  - O **servidor** aplica a passiva da colher (cura no `onStab`, a vida chega no `snap`), a do peixe (valor do prêmio `backstab`), a do macarrão (ignora `selfDamage` de queda) e a do sabre (aceita os outros `stab` do mesmo golpe).
  - O **cliente** aplica a velocidade do frango (`speedMul`, o movimento é confiado ao cliente) e o pente cheio da baguete (a munição é só do cliente). Ele também mostra um aviso no feed quando a colher, o frango ou a baguete agem (`passiveFx_*`).
  - **Offline** (bots e campo de tiro), `BotManager` e `client/main.ts` aplicam todas, para o jogador e para os bots (`Bot.knifeKill`).

### Melhorias

A árvore da faca tem três níveis, que valem para **todas** as facas, aplicados por `meleeStats(faca, melhorias)` (`shared/arsenal.ts`). Todas são comuns (ligam sozinhas, desligáveis no Arsenal). Custos em [[Progression]].

- **Afiador** (nível 2, 600 pts): intervalo ×0,8 e **+0,2 m** de alcance do golpe (o alcance entrou em 2026-10-07; antes, só o intervalo, que quase não pesa num golpe que mata de uma vez).
- **Tênis de Molinha** (nível 3, 2.800 pts): investida +0,6 m, velocidade da investida ×1,2.
- **Mão Leve** (nível 4, 4.500 pts, desde 2026-10-07): duração do golpe ×0,7 (efeito `duracao`). O acerto continua aos 0,14 s, mas o golpe acaba antes e a arma volta a atirar mais cedo.

### Sequência

1. **Início**: procura o alvo vivo mais próximo dentro de `alcanceInvestida`, num cone de ±45°, com diferença de altura ≤ 1,6 m e **linha de visão livre**. Cancela a recarga da arma de fogo em mãos.
2. **Investida**: enquanto o golpe não resolve e há alvo, a velocidade horizontal do jogador é substituída por 14 m/s em direção a ele, até ficar a 60% do alcance. No fim, a velocidade é freada para 2 m/s (não atravessa o alvo).
3. **Impacto (0,14 s)**: acerta o alvo da investida se estiver a ≤ alcance + 0,4 m (em qualquer ângulo); senão, o alvo mais próximo dentro do alcance e do cone. Sem alvo, tenta "bichos" do mapa (peixe, fruta, rato, armário, abóboras...) com alcance + 0,4 m — ver [[Map Gags]].
4. **Pelas costas**: se o atacante está atrás do plano frontal do alvo (`isBehind`), soma o bônus "Pelas costas".

### Pontos

Abate com faca: abate (100) + "Facada" (50) + "Pelas costas" (50, se aplicável). Detalhes em [[Scoring]].

## Estados possíveis

`ocioso` → `golpeando (t)` (com `lunging` enquanto há alvo e não resolveu) → `ocioso`; `cooldown`.

## Entradas / Saídas

Entrada: F, posição do olho, yaw, alvos. Saída: `MoveInput.lunge` para o [[Movement]], dano, som (`meleeSwing(faca)`, um por faca; os outros ouvem o golpe da faca de cozinha só de perto e o das outras mais longe — ver [[SFX]]). Online: `swing` (cosmético) e `stab {target, behind}`.

## Dependências

[[Damage System]], [[Movement]] (investida), [[Combat]] (prioridades), [[Scoring]], [[Progression]], [[Weapon Models]].

## Exceções

- **Não pode ser cancelado pelo tiro** (cancelar seria um exploit), mas não começa se há intenção de tiro no mesmo tick, durante a dança ou com granada na mão.
- Durante o golpe: sem sprint e sem mira.
- Investida não acontece se o alvo já está perto (≤ 60% do alcance) e encerra o slide.
- Servidor: aceita `stab` se ambos vivos, intervalo ≥ 75% do `intervalo` e distância horizontal ≤ `alcanceInvestida` + 1,5 m, com os valores da **faca do jogador** com as melhorias dele (`loadoutKnife`). Ex.: com o Tênis, a baguete alcança 3,8 + 1,5 m e o macarrão 3,3 + 1,5 m. **O `behind` é confiado ao cliente.**
- Modo PCD sem a mão direita: a faca vai para a mão esquerda (visual, README).
- Na corrida armada, **morrer por facada** (faca ou sabre) tira um abate do degrau (sem abates nele, volta à arma anterior); a facada com a faca de cozinha **conta como um abate** para quem esfaqueia, igual a um abate com a arma do degrau (desde 2026-10-07; todo degrau de arma de fogo leva a faca de cozinha, qualquer que seja a do Arsenal). Ver [[Gun Game]].
- **Bots** (offline) golpeiam pelas mesmas regras de alcance, cone e visão, sem investida, e só **uma vez por aproximação** a cada alvo; ver [[AI Decisions]] e [[ADR - Facada dos bots com uma chance por aproximação]]. Fora da corrida armada, as passivas da faca sorteada valem para eles também.
- **Sabre (Vuuum) no servidor:** os `stab` do mesmo golpe chegam juntos; o servidor aceita os que vêm até 150 ms (`SWEEP_MS`) depois do primeiro, cada alvo uma vez (`SPlayer.stabbed`), sem a checagem de intervalo. Um golpe novo continua esperando 75% do `intervalo`.
- Se `letal` for `false`, o código usa 55 de dano fixo (hoje nunca acontece).

## Código relacionado

- `client/weapons/melee.ts` — `Melee` (tempo, cooldown, `lunging`), `meleeTargets` (todos no alcance e no cone, para o Vuuum) e `findMeleeTarget` (o mais perto; também usado pelos bots).
- `client/main.ts` — `stabOne` (um alvo do golpe), `knifeKillPassive` (passiva depois de um abate com a faca); `client/entities/localPlayer.ts` — `noFallDamage`.
- `client/main.ts` — `startMelee`, `resolveMelee`, cálculo de `lunge` no tick.
- `client/entities/hitboxes.ts` — `isBehind`.
- `server/session.ts` — `onStab`.
- `shared/arsenal.ts` — `meleeStats(faca, melhorias)` (`forma` = o id da faca, alcances, intervalo e duração com as melhorias), `knifePassive(faca, modo)`, `knifeOf`, `loadoutKnife`.
- `shared/weapons.ts` — `MELEE` (os dados de cada faca), `WeaponLock`.

## Configurações relacionadas

`shared/data/weapons/faca.json`, `colher.json`, `frango.json`, `baguete.json`, `peixe.json`, `macarrao.json`, `sabre.json`; `faca.melhorias` em `shared/data/progression.json`; `SCORE.knife`, `SCORE.backstab`. Ver [[Constants Reference]].
