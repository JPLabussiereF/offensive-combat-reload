---
title: Pickups
type: mechanic
status: documented
area: gameplay
source_paths:
  - shared/constants.ts
  - shared/maps.ts
  - client/main.ts
  - client/world/jardim/cereja.ts
  - client/world/halloween.ts
  - server/session.ts
  - server/tests/game.test.ts
tags:
  - game
  - gameplay
  - pickups
updated: 2026-10-05
---

# Pickups

> [!info] Evidência
> Código confirmado: `PICKUPS` (`shared/maps.ts`), `CHERRY`/`BISCUIT` (`shared/constants.ts`), `updatePickups` (`client/main.ts`), `Session.onPickup` (`server/session.ts`). Testes em `server/tests/game.test.ts` ("cereja do jardim", "vila assombrada").

## Objetivo

Coletáveis fixos do mapa que dão vantagem de vida e criam **pontos de disputa**. Só existem **dois** tipos (`PickupKind = 'cereja' | 'biscoito'`), um por mapa. Não há munição, armas ou armaduras no chão.

## Catálogo

| Coletável | Mapa | Posição (pés) | Raio | Efeito | Volta em |
|---|---|---|---|---|---|
| **Cereja do Dragão** (`cereja`) | [[Map - Jardim do Dragão]] (pátio, sob a cerejeira) | (0; 0,36; 2,1) | 1,2 m | **+50 de vida máxima por 30 s** e +50 de vida na hora | 45 s (cai da árvore) |
| **Biscoito Scooby** (`biscoito`) | [[Map - Vila Assombrada]] (armário da cozinha da mansão) | (−44,4; 0; 9) | 1,1 m | **cura até a vida máxima** | 60 s |

A [[Map - Rua dos Vizinhos]] e a [[Map - Arena Teste (glTF)]] não têm coletáveis (mapas via `?mapa=` não consultam `PICKUPS`).

## Como o jogador interage

Basta **passar por cima** (pés dentro do raio horizontal e até 1,5 m de diferença de altura). Não há tecla.

- **Biscoito**: só pode ser pego com o **armário aberto** — atirar ou esfaquear o armário abre as portas (piada sincronizada `armario`, ver [[Map Gags]]); elas fecham de novo depois de um tempo.
- **Cereja**: flutua sob a árvore; ao voltar, cai da copa e quica.

## Regras

- Online: o cliente envia `pickup {id}` (no máximo a cada 800 ms); o servidor confere que o jogador está vivo, que o coletável está disponível e que os pés estão a ≤ raio + **1,5 m de folga** horizontal e ≤ 2 m vertical. Então aplica o efeito e avisa todos (`pickup {id, by, ready, until}`).
- Quem entra numa sessão recebe em `joined.pickups` os coletáveis ainda "crescendo de volta".
- Offline e contra bots, o próprio cliente aplica e agenda a volta no relógio de simulação.
- A cereja **não acumula**: pegar outra renova o fim do bônus (`boostUntil`).
- O bônus da cereja **acaba com a morte**.
- Interação com o máximo de vida: ver [[Health System]].

## Estados possíveis

Disponível → tomado (até `ready`) → disponível. Biscoito: também indisponível com o armário fechado (só no cliente).

## Entradas / Saídas

Entrada: posição dos pés. Saída: efeito de vida, som (cereja / "scooby snack"), aviso/faixa no HUD, bônus no painel de buffs ([[Buffs & Debuffs]]).

## Dependências

[[Health System]], [[Buffs & Debuffs]], [[Map Gags]] (armário), [[Remote Calls]], [[Interaction System]].

## Exceções

- O servidor **não sabe** se o armário está aberto: a regra "só com o armário aberto" é aplicada apenas no cliente (a abertura é uma piada cosmética retransmitida).
- Bots não pegam coletáveis (README: "Os bots ainda não pegam a cereja").

## Código relacionado

- `shared/maps.ts` — `PICKUPS`, `PickupKind`.
- `client/main.ts` — `updatePickups`, `startBoost`, `endBoost`, `eatBiscuit`, handler `pickup`.
- `client/world/jardim/cereja.ts` — modelo/animação da cereja.
- `client/world/halloween.ts` — `KitchenCabinet`, `ScoobyBiscuit` (`available` exige armário aberto).
- `server/session.ts` — `onPickup`, `PICKUP_SLACK`.

## Configurações relacionadas

`CHERRY`, `BISCUIT` em `shared/constants.ts`. Ver [[Constants Reference]].
