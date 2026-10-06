---
title: NPC Behavior
type: system
status: documented
area: ai
source_paths:
  - client/ai/bot.ts
  - client/ai/bots.ts
  - client/entities/dummy.ts
  - client/world/blockoutMap.ts
  - client/world/dog.ts
  - client/world/jardim/panda.ts
  - client/world/jardim/peixes.ts
  - client/world/halloween.ts
  - client/world/hauntedTown.ts
  - client/main.ts
  - shared/constants.ts
  - shared/maps.ts
  - server/session.ts
  - shared/arsenal.ts
tags:
  - ai
  - npc
  - bots
updated: 2026-10-06
---

# NPC Behavior

Comportamento observável de cada personagem não humano. As regras de decisão dos bots estão detalhadas em [[AI Decisions]]; as máquinas de estado em [[States]]. Os efeitos de jogo dos NPCs de mapa (o que a poção dá, o que o rato dá) pertencem a [[Buffs & Debuffs]] e [[Map Gags]] — aqui fica só **como o personagem se comporta**.

## 1. Bots (`client/ai/bot.ts`, `client/ai/bots.ts`)

**Objetivo**: oponentes de mata-mata livre offline. "Caçam qualquer um, incluindo os outros bots" (README).

| Aspecto | Comportamento (código confirmado) |
| --- | --- |
| Corpo | Corpo cinemático Rapier + cilindro (`MOVE.radius`, `HALF_STAND`), o mesmo `KinematicCharacterController` do jogador, `CharacterRig` com as 15 hitboxes, `Avatar` com aparência aleatória (`randomAppearance`) e os mesmos efeitos de corpo (`bodyStats`: recarga e velocidade do modo PCD) |
| Nome | Sorteado de 12 nomes engraçados (`BOT_NAMES`: "Bot Clebinho", "Sgt. Parafuso", "Vovó Turbo"...) com sexo; placa de nome em sprite |
| Armas | `Weapon` com a arma sorteada a cada vida (`pickGun`: rifle 60%, submetralhadora 25%, pistola 15%; `gunStats` sem melhorias: cadência, pente, recarga, dispersão, recuo) e facada letal com `MELEE.faca` |
| Movimento | `stepMovement` de `@shared/movement` com `MoveInput` igual ao de um humano (anda, corre, agacha, pula, mira) |
| Percepção | Campo de visão por dificuldade, linha de visão por raio, memória da última posição vista, vira para quem atirou |
| Ações | Vagar, enfrentar (mirar, metralhar em rajadas, strafe, agachar), perseguir, fugir com pouca vida, faca de perto, dançar sobre corpos (opressão) |
| Vida | `bodyStats.maxHealth` (100); regenera com a mesma regra dos jogadores (4 s sem dano, 25/s — valores literais em `bots.ts`) |
| Morte | Vira `Corpse` oprimível; renasce em 5 s (`RESPAWN`) num ponto escolhido por `pickSafeSpawn`; ganha 2 s de proteção (`SPAWN_PROTECTION`), pisca e é ignorado pelos outros; atirar cancela a proteção |
| Perigos | Morre se cair abaixo de y = −20 (`kind: 'void'`); morre mordido pela Amora se entrar na zona (`dogTick` em `main.ts`) — mas a navmesh já desvia dessa zona |
| Placar | `BotManager.standings()` mantém kills, mortes, pontos e opressões de todos, incluindo o jogador local (id 0) |

O jogador local entra no `BotManager` como mais um `Combatant` (`playerTarget` em `main.ts`), com um `CharacterRig` próprio para os bots poderem acertá-lo.

**Não faz**: granadas, minas, coletáveis (cereja, biscoito), poção da bruxa, peixes, rato. Ver [[AI Overview]].

## 2. Bonecos de treino (`client/entities/dummy.ts`)

- Personagens padrão com aparência variada e a arma da vida na mão (com uma secundária na mão, o rifle aparece nas costas; a pose da mão de apoio segue `holdOf`), com as **mesmas hitboxes** dos jogadores (`CharacterRig`).
- Alguns **patrulham**: deslocamento senoidal ao longo de um eixo (`patrol: { axis, amplitude, speed }` nos `DummySpot` de cada mapa, ex.: `client/world/blockoutMap.ts`). Não atiram nem perseguem.
- Mostram vida numa placa; regeneram 4 s depois do último dano (`HEALTH.regenDelay`, `regenPerSecond`).
- Ao morrer, caem (`back`/`forward`), mostram o temporizador de opressão (`CorpseTimer`), podem ser oprimidos uma vez, afundam e renascem — **só quando o lugar está livre** (`occupied`), para não nascer dentro do jogador.
- Nomes de 12 opções (`NAMES`: "Sr. Alvo", "Zé Palha", "Cara do Tutorial"...).

Ver [[Training]].

## 3. Amora, a Chow Chow (`client/world/dog.ts`) — Rua dos Vizinhos

- **Olhar**: a cabeça acompanha o personagem mais próximo dentro de 6 m (`LOOK_RANGE`), limitado a ±1,1 rad; a lista inclui jogador local, bots e jogadores remotos (`client/main.ts`, render).
- **Alerta**: com alguém por perto, ofega (respiração mais rápida, boca aberta, rabo abanando mais).
- **Mordida**: quem pisa na faixa em frente à porta (`zone`, um `Box3`) é mordido e morre (`LETHAL_DAMAGE`); animação de bote de 0,5 s com avanço de 0,55 m. Uma mordida por alvo a cada 2 s (`biteOnce`). Online, o próprio cliente reporta `selfDamage` com causa `dog`; jogadores remotos só disparam a animação.
- **Levar tiro**: não morre; só late (cooldown de 1,2 s).

## 4. Panda (`client/world/jardim/panda.ts`) — Jardim do Dragão

Puramente decorativo, sem reação a jogadores. Ciclo de 4,5 s: levanta o bambu à boca e morde (≈1,2 s), depois mastiga com a cabeça balançando. Colide como uma caixa.

## 5. Carpas (`client/world/jardim/peixes.ts`) — Jardim do Dragão

Nadam em laços (`FISH` em `shared/maps.ts`: centro, raio, profundidade) cronometrados pelo **relógio do jogo** (online, o do servidor), para todos verem os peixes no mesmo lugar. Tiro ou faca mata: o peixe vira de barriga, boia e some; volta depois (25–45 s), às vezes dourado (5%). Quem decide a recompensa é o jogo (offline) ou o servidor (`Session.onFish`).

## 6. Fantasma da cova (`GraveGhost`, `client/world/halloween.ts`) — Vila Assombrada

- Acordado por tiro no monte/lápide (gag `'fantasma'` no `PropBus`, sincronizado).
- Sobe virado **para quem atirou** (`PropTrigger.from`), reclama com um balão de fala, fica ~3,6 s e afunda.
- Quanto mais vezes é acordado, mais mal-humoradas as falas (3 níveis de `GHOST_LINES`, um a cada 4 ativações). Tiro durante a reclamação gera uma fala extra ("EI!", "PAAARA!").

## 7. Bruxa (`Witch`, `client/world/halloween.ts`) — Vila Assombrada

- Mexe o caldeirão com a concha continuamente.
- Vira a cabeça para a **câmera local** se ela estiver a menos de 8 m (e até 3 m de desnível); senão olha para o caldeirão.
- Perto dela, a tecla de opressão vira "Beber Poção"; a cada poção ela gargalha com uma fala por efeito (`WITCH_LINES`).
- Levar tiro: dá bronca ("Quer virar sapo?") — gag `'bruxa'`.
- Posição em `WITCHES.halloween`; o servidor confere a distância antes de sortear a poção (`Session.onPotion`).

## 8. Rato gigante (`GiantRat`, `client/world/halloween.ts`) — Vila Assombrada

- Fica no fim do beco sem saída do esgoto (`RATS.halloween`). Respira, **vira para a câmera local** se ela estiver a menos de 18 m (e até 4 m de desnível), guincha a cada 4–9 s.
- Tem `RAT.hits = 14` de vida em balas (facada vale `RAT.stab = 4`); se encolhe ao ser atingido.
- O golpe final chama `onDown(id)`; o jogo decide (offline na hora, online pelo servidor, que confere distância ≤ `RAT.range`) e então `kill(ready)`: rola, afunda e solta uma "alma". Volta em `RAT.respawn = 120` s, crescendo de novo.

## 9. Outros elementos animados (cosméticos)

Espantalhos que caem com tiro e levantam (`'espantalho:N'`), patos de borracha que o caldeirão cospe a cada 5 tiros e que andam pela cabana grasnando (`Cauldron`), morcegos circulando (`Bats`). Ver [[Map Gags]].

## Código relacionado

- `client/ai/bot.ts` (`Bot`, `BOT_SKILLS`), `client/ai/bots.ts` (`BotManager`)
- `client/entities/dummy.ts` (`Dummy`, `DummyManager`)
- `client/world/dog.ts` (`ChowChow`), `client/main.ts` (`dogTick`, `biteOnce`)
- `client/world/jardim/panda.ts`, `client/world/jardim/peixes.ts` (`KoiSchool`)
- `client/world/halloween.ts` (`GraveGhost`, `Witch`, `GiantRat`, `Cauldron`, `Scarecrows`, `Bats`), `client/world/hauntedTown.ts`

Ver também: [[Map - Rua dos Vizinhos]], [[Map - Jardim do Dragão]], [[Map - Vila Assombrada]], [[Humiliation]], [[Respawn]].
