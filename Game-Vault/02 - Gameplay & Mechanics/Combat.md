---
title: Combat
type: system
status: documented
area: gameplay
source_paths:
  - client/main.ts
  - client/weapons/weapon.ts
  - client/weapons/hitscan.ts
  - client/weapons/melee.ts
  - client/weapons/grenades.ts
  - client/weapons/mines.ts
  - client/gameplay/targets.ts
  - server/session.ts
  - shared/weapons.ts
tags:
  - game
  - gameplay
  - combat
updated: 2026-10-05
---

# Combat

Visão geral do combate. Fórmulas ficam em [[Damage System]]; detalhes de cada arma em [[Weapons]], [[Melee]], [[Grenades]] e [[Land Mines]].

> [!info] Evidência
> Código confirmado: tick de simulação em `client/main.ts` (`stepInner`), armas em `client/weapons/*`, autoridade em `server/session.ts`.

## Objetivo

Combate rápido de arena "todos contra todos": rifle hitscan com TTK curto, faca que mata com um golpe, granada de impacto, mortes instantâneas especiais ("No pássaro!", faca) e a [[Humiliation]] sobre o corpo como recompensa arriscada.

## Estrutura

```text
Combat
├── Hit Detection   → hitscan (raio Rapier) + hitboxes por osso  → [[Damage System]]
├── Weapons         → rifle / faca / granada                     → [[Weapons]], [[Melee]], [[Grenades]], [[Land Mines]]
├── Damage          → queda por distância, regiões, penetração   → [[Damage System]]
├── Reload / Recoil / Spread                                     → [[Weapons]]
├── Critical Hits   → cabeça ×2,5, virilha e faca instantâneas, poção do crítico
├── Health          → regeneração, vida máxima dinâmica          → [[Health System]]
└── Death / Respawn → corpo oprimível, renascimento              → [[Respawn]], [[Humiliation]]
```

## Como o jogador interage

| Ação | Tecla | Bloqueada quando |
|---|---|---|
| Atirar | Mouse esquerdo | recarregando, golpe de faca, dançando |
| Mirar | Mouse direito | correndo, golpe de faca, granada na mão, dançando |
| Recarregar | R | golpe de faca, granada na mão, dançando |
| Faca | F | intenção de tiro no tick, dançando, granada na mão |
| Granada / mina | G (segurar = cozinhar) | intenção de tiro, dançando, golpe de faca |
| Oprimir | E perto do corpo | intenção de tiro, golpe de faca, granada na mão |

## Regras de prioridade (por tick)

Comentário explícito em `client/main.ts`:

1. **Tiro tem prioridade** sobre o sprint (cancelado no mesmo tick) e sobre uma granada na mão (o pino volta; a granada não é perdida).
2. O tiro **nunca interrompe**: uma recarga (não atira até acabar), um golpe de faca ("cancelar seria um exploit") ou a dança (só a morte encerra).
3. Faca, granada e dança **cancelam a recarga**.
4. O slide continua: dá para atirar deslizando.
5. Teclas apertadas enquanto morto são descartadas (não disparam ao renascer).

## Alvos

Tudo que pode ser atingido implementa `Target` (`client/gameplay/targets.ts`): bonecos de treino ([[Training]]), bots ([[Versus Bots]]) e jogadores remotos (online). Corpos implementam `Humiliable`. O registro `HitboxRegistry` mapeia cada colisor de hitbox para alvo + região.

Alvos não-jogador do mapa (peixes, frutas, rato gigante, armário, abóboras, sinos...) são tratados em [[Map Gags]] e [[Buffs & Debuffs]].

## Autoridade

| Modo | Quem decide dano/morte |
|---|---|
| Campo de tiro (offline) | cliente local |
| Contra bots (offline) | `BotManager` com as regras do servidor |
| Online | servidor (`server/session.ts`), a partir de relatos validados do cliente |

Ver [[Client Server Model]], [[Anti Cheat]].

## Feedback

Hitmarker (normal / cabeça / abate), números de pontos, confete/estrelas, kill feed, faixa "No pássaro!", vibração do controle, tremor de câmera em explosões, indicador de granada próxima. Ver [[HUD]], [[Notifications]], [[Visual Effects]], [[SFX]].

## Dependências

[[Movement]], [[Damage System]], [[Health System]], [[Scoring]], [[Respawn]], [[Humiliation]], [[Progression]], [[Remote Calls]].

## Código relacionado

- `client/main.ts` — `stepInner` (ordem das ações), hooks do rifle, `startMelee`/`resolveMelee`, `throwGrenade`/`explode`/`plantMine`.
- `client/weapons/weapon.ts`, `hitscan.ts`, `melee.ts`, `grenades.ts`, `mines.ts`.
- `client/gameplay/targets.ts` — `Target`, `Humiliable`, `HitboxRegistry`.
- `server/session.ts` — `onHit`, `onStab`, `onBoom`, `damage`, `kill`.

## Configurações relacionadas

`shared/data/weapons/*.json`, `shared/data/progression.json`, `SCORE`, `HUMILIATION`. Ver [[Constants Reference]].
