---
title: Gameplay Tests
type: system
status: documented
area: testing
source_paths:
  - server/tests/game.test.ts
  - server/tests/appearance.test.ts
  - server/session.ts
  - shared/constants.ts
tags:
  - testes
  - gameplay
updated: 2026-10-05
---

# Gameplay Tests

Testes de **regras de partida validadas pelo servidor**, escritos como integração (clientes WebSocket falsos enviando mensagens do protocolo para um servidor real). Testam a autoridade do servidor: o que o cliente afirma é aceito ou ignorado conforme posição, estado e tempo. Não há testes do lado do cliente (física, tiro, câmera, bots).

## Casos cobertos (`server/tests/game.test.ts`)

| Grupo | Caso | Regra verificada | Nota relacionada |
| --- | --- | --- | --- |
| Progresso | Abate validado dá pontos à arma, XP à conta e estatísticas, gravados ao sair | Tiros na cabeça a 10 m espaçados pela cadência → `kill` tipo `head`; XP da arma = soma dos prêmios; +25 XP de conta; nível bloqueado (`rifle: 7`) ignorado | [[Scenario - Abate validado e progresso gravado]], [[Progression]], [[Scoring]] |
| Progresso | Placar mostra o nível da conta | `nivel: 1`, nome `Placar#NNNN` | [[Scoreboard]] |
| Cereja do jardim | Só quem está perto pega; +vida máxima; some para todos; quem chega depois sabe quando volta | distância, `CHERRY.extraHealth`, `ready - until = respawn - duration`, estado inicial em `joined.pickups` | [[Pickups]], [[Map - Jardim do Dragão]] |
| Cereja do jardim | Peixe abatido dá XP da conta uma vez e volta | `KOI.xp`, janela de `KOI.respawn`, peixe inexistente ou atirador longe ignorados | [[Map Gags]] |
| Vila assombrada | Rato gigante dá "humanidade" a quem o derruba perto | `RAT.extraHealth`; longe → ignorado; estado em `joined.rats` | [[Buffs & Debuffs]], [[Map - Vila Assombrada]] |
| Vila assombrada | Granada de quem bebeu a poção chega como pato | flag `duck` repassada só quando enviada | [[Grenades]] |
| Vila assombrada | Poção da bruxa sorteia um efeito, uma de cada vez | distância da bruxa; `POTION.kinds`; `POTION.duration`; recarga recusa a segunda | [[Buffs & Debuffs]] |
| Vila assombrada | Biscoito enche a vida e volta depois | `BISCUIT.respawn`; segunda tentativa ignorada | [[Pickups]] |
| Armas vistas pelos outros | Trocar equipamento avisa os outros com loadout **validado** | níveis não liberados nunca chegam aos outros (`rifle: 9` → 1) | [[Weapons]] |
| Armas vistas pelos outros | Quem entra recebe o loadout de quem já está | estado inicial | [[Replication]] |

E em `appearance.test.ts` ("no online"): o corpo (cadáver) mantém a aparência e o biotipo não muda a vida; e nas regras puras, o dano por zona (cabeça 2,5×, pescoço 1,5×, mãos 0,5×, virilha mata) — ver [[Damage System]].

## Padrão dos testes

1. Contas novas por `Browser.register()`; conexão por ticket; `hello` → `join` na sala do mapa.
2. Posição definida por `respawn` (e depois `state`) — o servidor confia na posição informada (movimento não é simulado no servidor).
3. Ação (`hit`, `pickup`, `fish`, `rat`, `potion`, `grenade`, `loadout`).
4. Espera a mensagem de difusão no **outro** jogador, ou confirma com timeout curto (300 ms) que **nada** foi difundido quando a ação deve ser ignorada.

## Lacunas

- Não testam opressão (dança sobre o corpo), facada, mina terrestre, dano de explosão, respawn/proteção, regeneração de vida, cereja expirando.
- Lógica offline (bots, treino) não é testada.

## Código relacionado

- `server/tests/game.test.ts`, `server/tests/appearance.test.ts`
- `server/session.ts` (regras), `shared/constants.ts` (`CHERRY`, `KOI`, `RAT`, `POTION`, `BISCUIT`, `HEALTH`)

Ver também: [[Integration Tests]], [[Anti Cheat]].
