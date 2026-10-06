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
  - server/session.ts
  - shared/arsenal.ts
  - client/audio/sfx.ts
tags:
  - game
  - gameplay
  - melee
  - knife
updated: 2026-10-06
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

São sete, cada uma com o seu JSON em `shared/data/weapons/` (`KnifeId` em `shared/progression.ts`). Todas são letais; o que muda é o alcance do golpe, o da investida e o intervalo. As seis antigas voltaram das primeiras versões do jogo (PF-8) e **liberam com os pontos da faca** (`libera`); todas usam **os pontos, o nível e as melhorias da faca** ([[ADR - Rifles e facas antigos como armas próprias]]).

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

### Melhorias

A árvore da faca tem dois níveis, que valem para **todas** as facas, aplicados por `meleeStats(faca, melhorias)` (`shared/arsenal.ts`): **Afiador** (nível 2, 600 pts: intervalo ×0,8) e **Tênis de Molinha** (nível 3, 2.800 pts: investida +0,6 m, velocidade da investida ×1,2). Ambas são comuns (ligam sozinhas, desligáveis no Arsenal). Custos em [[Progression]].

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
- Na corrida armada, **morrer por facada** (faca ou sabre) faz descer um degrau; a facada com a faca de cozinha não conta para quem esfaqueia (todo degrau de arma de fogo leva a faca de cozinha, qualquer que seja a do Arsenal). Ver [[Gun Game]].
- Se `letal` for `false`, o código usa 55 de dano fixo (hoje nunca acontece).

## Código relacionado

- `client/weapons/melee.ts` — `Melee` (tempo, cooldown, `lunging`), `findMeleeTarget`.
- `client/main.ts` — `startMelee`, `resolveMelee`, cálculo de `lunge` no tick.
- `client/entities/hitboxes.ts` — `isBehind`.
- `server/session.ts` — `onStab`.
- `shared/arsenal.ts` — `meleeStats(faca, melhorias)` (`forma` = o id da faca, alcances e intervalo com as melhorias), `knifeOf`, `loadoutKnife`.
- `shared/weapons.ts` — `MELEE` (os dados de cada faca), `WeaponLock`.

## Configurações relacionadas

`shared/data/weapons/faca.json`, `colher.json`, `frango.json`, `baguete.json`, `peixe.json`, `macarrao.json`, `sabre.json`; `faca.melhorias` em `shared/data/progression.json`; `SCORE.knife`, `SCORE.backstab`. Ver [[Constants Reference]].
