---
title: Gameplay Tests
type: system
status: documented
area: testing
source_paths:
  - server/tests/game.test.ts
  - server/tests/appearance.test.ts
  - server/tests/modes.test.ts
  - server/tests/zombies.test.ts
  - server/tests/progression-modes.test.ts
  - client/tests/offlineModes.test.ts
  - server/session.ts
  - shared/constants.ts
  - shared/arsenal.ts
tags:
  - testes
  - gameplay
updated: 2026-10-06
---

# Gameplay Tests

Testes de **regras de partida validadas pelo servidor**, escritos como integração (clientes WebSocket falsos enviando mensagens do protocolo para um servidor real). Testam a autoridade do servidor: o que o cliente afirma é aceito ou ignorado conforme posição, estado e tempo. Não há testes do lado do cliente (física, tiro, câmera, bots).

## Casos cobertos (`server/tests/game.test.ts`)

| Grupo | Caso | Regra verificada | Nota relacionada |
| --- | --- | --- | --- |
| Progresso | Abate validado dá pontos à arma, XP à conta e estatísticas, gravados ao sair | Tiros na cabeça a 10 m espaçados pela cadência → `kill` tipo `head`; XP da arma = soma dos prêmios; +25 XP de conta; `kill.arma = 'rifle'`; melhoria bloqueada (`rifle: ['silenciador']`) descartada da escolha (`progresso.escolha`) | [[Scenario - Abate validado e progresso gravado]], [[Progression]], [[Scoring]] |
| Progresso | Placar mostra o nível da conta | `nivel: 1`, nome `Placar#NNNN` | [[Scoreboard]] |
| Cereja do jardim | Só quem está perto pega; +vida máxima; some para todos; quem chega depois sabe quando volta | distância, `CHERRY.extraHealth`, `ready - until = respawn - duration`, estado inicial em `joined.pickups` | [[Pickups]], [[Map - Jardim do Dragão]] |
| Cereja do jardim | Peixe abatido dá XP da conta uma vez e volta | `KOI.xp`, janela de `KOI.respawn`, peixe inexistente ou atirador longe ignorados | [[Map Gags]] |
| Vila assombrada | Rato gigante dá "humanidade" a quem o derruba perto | `RAT.extraHealth`; longe → ignorado; estado em `joined.rats` | [[Buffs & Debuffs]], [[Map - Vila Assombrada]] |
| Vila assombrada | Granada de quem bebeu a poção chega como pato | flag `duck` repassada só quando enviada | [[Grenades]] |
| Vila assombrada | Poção da bruxa sorteia um efeito, uma de cada vez | distância da bruxa; `POTION.kinds`; `POTION.duration`; recarga recusa a segunda | [[Buffs & Debuffs]] |
| Vila assombrada | Biscoito enche a vida e volta depois | `BISCUIT.respawn`; segunda tentativa ignorada | [[Pickups]] |
| Armas vistas pelos outros | Mudar a escolha do Arsenal avisa os outros com loadout **validado** | secundária `smg` chega no `playerLoadout`; melhorias não liberadas (`sabre`, `mina`) e o rifle como secundária nunca chegam aos outros (volta o `DEFAULT_LOADOUT`) | [[Weapons]] |
| Armas vistas pelos outros | O dano e os pontos são da arma que atirou | acerto de `smg` fora do loadout ignorado; com `FLAG.secondary`, a pistola causa o dano dela; um acerto de rifle logo após a troca ainda vale (`SWITCH_GRACE_MS`); o abate de pistola dá `kill.arma = 'pistola'` e o XP vai só para a pistola | [[Weapons]], [[Anti Cheat]] |
| Armas vistas pelos outros | Quem entra recebe o loadout de quem já está | estado inicial | [[Replication]] |

E em `appearance.test.ts` ("no online"): o corpo (cadáver) mantém a aparência e o biotipo não muda a vida; e nas regras puras, o dano por zona (cabeça 2,5×, pescoço 1,5×, mãos 0,5×, virilha mata) — ver [[Damage System]].

## Padrão dos testes

1. Contas novas por `Browser.register()`; conexão por ticket; `hello` → `join` na sala do mapa.
2. Posição definida por `respawn` (e depois `state`) — o servidor confia na posição informada (movimento não é simulado no servidor).
3. Ação (`hit`, `pickup`, `fish`, `rat`, `potion`, `grenade`, `loadout`).
4. Espera a mensagem de difusão no **outro** jogador, ou confirma com timeout curto (300 ms) que **nada** foi difundido quando a ação deve ser ignorada.

## Modos e progressão de armas

As regras de cada modo com a progressão de armas em volta estão em `server/tests/modes.test.ts` (mata-mata e corrida armada), `server/tests/zombies.test.ts` (zumbi) e na matriz `server/tests/progression-modes.test.ts` (todo modo × armas × níveis): o dano, a cadência e a mina validados com as melhorias da conta no mata-mata, a escada e o zumbi ignorando a conta, XP de arma só onde `weaponXp`, chefes contra vários jogadores, entrar no meio de uma onda e sangrar até o intervalo. Detalhes em [[Integration Tests]].

## Lacunas

- Não testam opressão (dança sobre o corpo), dano de explosão, respawn/proteção, regeneração de vida, cereja expirando. Facada e mina só aparecem nos testes de modo (abate de faca dá pontos à faca; a mina só com a melhoria ligada).
- Lógica offline: só as peças puras (`Progress`, escada, `LocalZombies`) em `client/tests/offlineModes.test.ts`; o `BotManager` precisa do navegador.

## Código relacionado

- `server/tests/game.test.ts`, `server/tests/appearance.test.ts`
- `server/session.ts` (regras), `shared/constants.ts` (`CHERRY`, `KOI`, `RAT`, `POTION`, `BISCUIT`, `HEALTH`)

Ver também: [[Integration Tests]], [[Anti Cheat]].
