---
title: Health System
type: mechanic
status: documented
area: gameplay
source_paths:
  - shared/constants.ts
  - shared/appearance.ts
  - client/entities/localPlayer.ts
  - client/entities/dummy.ts
  - client/main.ts
  - server/session.ts
tags:
  - game
  - gameplay
  - health
updated: 2026-10-05
---

# Health System

> [!info] Evidência
> Código confirmado: `HEALTH` em `shared/constants.ts`, `LocalPlayer` (offline), `Session.tick`/`maxHealth` (online), `bodyStats` (`shared/appearance.ts`).

## Objetivo

Vida simples de arena: 100 HP para todos, **regeneração automática** depois de alguns segundos sem levar dano, e bônus temporários de vida máxima vindos do mapa.

## Como o jogador interage

Passivamente: evita dano para regenerar; coleta [[Pickups]] (cereja, biscoito) ou derruba o rato gigante para ganhar vida/vida máxima. A vida aparece no [[HUD]]; com pouca vida o som fica abafado.

## Regras

| Regra | Valor |
|---|---|
| Vida máxima base | **100** (igual para todos os corpos; `bodyStats().maxHealth = 100`) |
| Regeneração | **25 HP/s** |
| Atraso para regenerar | **4 s** sem levar dano |
| Limiar de "vida baixa" | 30 HP (abafa o som proporcionalmente: `(30 − vida) / 30`) |

- Regeneração do zero até 100 leva 4 s de atraso + 4 s de recuperação.
- Qualquer dano reinicia o contador (`lastDamageAt`).

### Vida máxima dinâmica

```
vidaMáx = 100 (corpo) + 50 (cereja, por 30 s) + 50 (humanidade do rato, até morrer)
```

Máximo possível: 200. Ver [[Pickups]] e [[Buffs & Debuffs]].

- **Cereja do Dragão**: +50 de vida máxima e +50 de vida na hora; ao acabar, a vida é cortada para o novo máximo.
- **Biscoito Scooby**: cura até a vida máxima atual.
- **Humanidade (rato gigante)**: +50 de vida máxima e +50 de vida, até a morte; só uma por vez.

### Autoridade

- **Offline / campo de tiro / contra bots**: o `LocalPlayer` regenera e aplica dano localmente.
- **Online**: o servidor é dono da vida (`netControlled`): regenera no tick de 20 Hz, aplica dano e envia `damage` e a vida em cada `snap` (arredondada para cima). O cliente só relata autodano (queda, void, cachorro) via `selfDamage`.

## Estados possíveis

Vivo (vida > 0), regenerando, com vida baixa, morto. Na morte: a vida vai a 0, cereja/humanidade/poções são removidas (ver [[Respawn]]).

## Entradas

Dano de qualquer fonte ([[Damage System]]), coletáveis, tempo.

## Saídas

`health`/`maxHealth` no HUD, flash de dano, som de dor, som abafado com pouca vida, evento de morte.

## Dependências

[[Damage System]], [[Pickups]], [[Buffs & Debuffs]], [[Respawn]], [[Synchronization]].

## Exceções

> [!warning] Divergências encontradas
> - O `README.md` (tabela de biotipos) diz que o biotipo "Gordo" tem **150 de vida**, e um comentário em `localPlayer.ts` diz "heavier bodies have more health". O código atual (`bodyStats`) dá **100 para todos** e o comentário de `EFFECTS` diz que altura e biotipo são só visuais. Ver [[ADR - Altura e biotipo apenas visuais]] (o código vale mais que o README).
> - No servidor, quando a cereja expira, a vida é cortada para a vida do **corpo** (100), ignorando a humanidade (que deveria manter o teto em 150). O cliente corta corretamente para corpo + humanidade. A regeneração devolve a diferença depois de 4 s sem dano. Ver [[Problem - Fim da cereja ignora a humanidade no servidor]].

- Bonecos de treino ([[Training]]) usam a mesma regra de regeneração (100 HP, 25/s após 4 s) e zeram o cronômetro de TTK quando voltam a 100.
- Bots usam a mesma regra de regeneração (`client/ai/bots.ts`).

## Código relacionado

- `client/entities/localPlayer.ts` — `damage`, regeneração em `fixedStep`, `kill`.
- `server/session.ts` — `maxHealth`, `tick` (regeneração e fim da cereja), `damage`, `kill`.
- `client/main.ts` — `refreshMaxHealth`, `startBoost`, `eatBiscuit`, `gainHumanity`, handler `damage`/`snap`.
- `client/entities/dummy.ts` — regeneração dos bonecos.

## Configurações relacionadas

`HEALTH`, `CHERRY`, `BISCUIT`, `RAT` em `shared/constants.ts`. Ver [[Constants Reference]].
