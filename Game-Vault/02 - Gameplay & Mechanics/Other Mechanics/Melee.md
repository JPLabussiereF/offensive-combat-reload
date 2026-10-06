---
title: Melee
type: mechanic
status: documented
area: gameplay
source_paths:
  - shared/data/weapons/faca.json
  - shared/weapons.ts
  - shared/progression.ts
  - shared/data/progression.json
  - client/weapons/melee.ts
  - client/entities/hitboxes.ts
  - client/main.ts
  - server/session.ts
tags:
  - game
  - gameplay
  - melee
  - knife
updated: 2026-10-05
---

# Melee

> [!info] Evidência
> Configuração confirmada (`faca.json`, `progression.json`) e código confirmado (`client/weapons/melee.ts`, `startMelee`/`resolveMelee` em `client/main.ts`, `onStab` em `server/session.ts`).

## Objetivo

Golpe rápido de faca que **mata com um acerto** ("In the original, a knife hit is always a one-hit kill"), com uma **investida** curta que puxa o jogador até um alvo próximo. Bônus por facada e por facada pelas costas.

## Como o jogador interage

**F** (controle: R1/RB ou R3; toque: botão de faca). O golpe sai sem trocar de arma.

## Regras

| Regra (nível 1, Faca de Cozinha) | Valor |
|---|---|
| Letal (`letal`) | sim → 9999 de dano |
| Alcance do acerto (`alcance`) | 1,8 m (do olho à superfície do corpo) |
| Alcance da investida (`alcanceInvestida`) | 3,2 m |
| Ângulo máximo (`anguloGraus`) | 45° horizontais em relação à visão |
| Duração do golpe (`duracao`) | 0,45 s |
| Momento do acerto (`impacto`) | 0,14 s após o início |
| Intervalo entre golpes (`intervalo`) | 0,6 s |
| Velocidade da investida | 14 m/s |

Os níveis 2–7 aumentam `alcance` (até 2,7 m) e `alcanceInvestida` (até 5,0 m) — tabela em [[Items]].

### Sequência

1. **Início**: procura o alvo vivo mais próximo dentro de `alcanceInvestida`, num cone de ±45°, com diferença de altura ≤ 1,6 m e **linha de visão livre**. Cancela a recarga do rifle.
2. **Investida**: enquanto o golpe não resolve e há alvo, a velocidade horizontal do jogador é substituída por 14 m/s em direção a ele, até ficar a 60% do alcance. No fim, a velocidade é freada para 2 m/s (não atravessa o alvo).
3. **Impacto (0,14 s)**: acerta o alvo da investida se estiver a ≤ alcance + 0,4 m (em qualquer ângulo); senão, o alvo mais próximo dentro do alcance e do cone. Sem alvo, tenta "bichos" do mapa (peixe, fruta, rato, armário, abóboras...) com alcance + 0,4 m — ver [[Map Gags]].
4. **Pelas costas**: se o atacante está atrás do plano frontal do alvo (`isBehind`), soma o bônus "Pelas costas".

### Pontos

Abate com faca: abate (100) + "Facada" (50) + "Pelas costas" (50, se aplicável). Detalhes em [[Scoring]].

## Estados possíveis

`ocioso` → `golpeando (t)` (com `lunging` enquanto há alvo e não resolveu) → `ocioso`; `cooldown`.

## Entradas / Saídas

Entrada: F, posição do olho, yaw, alvos. Saída: `MoveInput.lunge` para o [[Movement]], dano, som (`meleeSwing` conforme o nível: faca, madeira, frango, crocante, tapa, boing, sabre). Online: `swing` (cosmético) e `stab {target, behind}`.

## Dependências

[[Damage System]], [[Movement]] (investida), [[Combat]] (prioridades), [[Scoring]], [[Progression]], [[Weapon Models]].

## Exceções

- **Não pode ser cancelado pelo tiro** (cancelar seria um exploit), mas não começa se há intenção de tiro no mesmo tick, durante a dança ou com granada na mão.
- Durante o golpe: sem sprint e sem mira.
- Investida não acontece se o alvo já está perto (≤ 60% do alcance) e encerra o slide.
- Servidor: aceita `stab` se ambos vivos, intervalo ≥ 75% de 0,6 s e distância horizontal ≤ `alcanceInvestida` + 1,5 m. **O `behind` é confiado ao cliente.**
- Modo PCD sem a mão direita: a faca vai para a mão esquerda (visual, README).
- Se `letal` for `false`, o código usa 55 de dano fixo (hoje nunca acontece).

## Código relacionado

- `client/weapons/melee.ts` — `Melee` (tempo, cooldown, `lunging`), `findMeleeTarget`.
- `client/main.ts` — `startMelee`, `resolveMelee`, cálculo de `lunge` no tick.
- `client/entities/hitboxes.ts` — `isBehind`.
- `server/session.ts` — `onStab`.
- `shared/progression.ts` — `knifeData`.

## Configurações relacionadas

`shared/data/weapons/faca.json`; `faca[]` em `shared/data/progression.json`; `SCORE.knife`, `SCORE.backstab`. Ver [[Constants Reference]].
