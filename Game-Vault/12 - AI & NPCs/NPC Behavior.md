---
title: NPC Behavior
type: system
status: documented
area: ai
source_paths:
  - client/ai/bot.ts
  - client/ai/bots.ts
  - client/entities/dummy.ts
  - client/world/gameMap.ts
  - shared/data/mapas/rua.json
  - client/world/dog.ts
  - client/world/jardim/panda.ts
  - client/world/jardim/peixes.ts
  - client/world/halloween.ts
  - shared/zombieMatch.ts
  - shared/barricades.ts
  - client/zombies/view.ts
  - shared/data/mapas/halloween.json
  - client/main.ts
  - shared/constants.ts
  - shared/maps.ts
  - server/session.ts
  - shared/arsenal.ts
tags:
  - ai
  - npc
  - bots
updated: 2026-10-07
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
| Ações | Vagar, enfrentar (mirar, metralhar em rajadas, strafe, agachar), perseguir, fugir com pouca vida, faca de perto (só com o alvo na frente, um golpe por aproximação — [[AI Decisions#Movimento em combate (`engage`)]]), dançar sobre corpos (opressão) |
| Vida | `bodyStats.maxHealth` (100); regenera com a mesma regra dos jogadores (4 s sem dano, 25/s — valores literais em `bots.ts`) |
| Morte | Vira `Corpse` oprimível; renasce em 5 s (`RESPAWN`) num ponto escolhido por `pickSafeSpawn`; ganha 2 s de proteção (`SPAWN_PROTECTION`), pisca e é ignorado pelos outros; atirar cancela a proteção |
| Perigos | Morre se cair abaixo de y = −20 (`kind: 'void'`); morre mordido pela Amora se entrar na zona (`dogTick` em `main.ts`) — mas a navmesh já desvia dessa zona |
| Placar | `BotManager.standings()` mantém kills, mortes, pontos e opressões de todos, incluindo o jogador local (id 0) |

O jogador local entra no `BotManager` como mais um `Combatant` (`playerTarget` em `main.ts`), com um `CharacterRig` próprio para os bots poderem acertá-lo.

**Não faz**: granadas, minas, coletáveis (cereja, biscoito), poção da bruxa, peixes, rato. Ver [[AI Overview]].

## 2. Bonecos de treino (`client/entities/dummy.ts`)

- Personagens padrão com aparência variada e a arma da vida na mão (com uma secundária na mão, o rifle aparece nas costas; a pose da mão de apoio segue `holdOf`), com as **mesmas hitboxes** dos jogadores (`CharacterRig`).
- Alguns **patrulham**: deslocamento senoidal ao longo de um eixo (`patrol: { axis, amplitude, speed }` nos bonecos de cada mapa, `bonecos[].patrulha` no JSON, ex.: `shared/data/mapas/rua.json`). Não atiram nem perseguem.
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

Nadam em laços (`objetos.peixes` nos dados do mapa: centro, raio, profundidade) cronometrados pelo **relógio do jogo** (online, o do servidor), para todos verem os peixes no mesmo lugar. Tiro ou faca mata: o peixe vira de barriga, boia e some; volta depois (25–45 s), às vezes dourado (5%). Quem decide a recompensa é o jogo (offline) ou o servidor (`Session.onFish`).

## 6. Fantasma da cova (`GraveGhost`, `client/world/halloween.ts`) — Vila Assombrada

- Acordado por tiro no monte/lápide (gag `'fantasma'` no `PropBus`, sincronizado).
- Sobe virado **para quem atirou** (`PropTrigger.from`), reclama com um balão de fala, fica ~3,6 s e afunda.
- Quanto mais vezes é acordado, mais mal-humoradas as falas (3 níveis de `GHOST_LINES`, um a cada 4 ativações). Tiro durante a reclamação gera uma fala extra ("EI!", "PAAARA!").

## 7. Bruxa (`Witch`, `client/world/halloween.ts`) — Vila Assombrada

- Mexe o caldeirão com a concha continuamente.
- Vira a cabeça para a **câmera local** se ela estiver a menos de 8 m (e até 3 m de desnível); senão olha para o caldeirão.
- Perto dela, a tecla de opressão vira "Beber Poção"; a cada poção ela gargalha com uma fala por efeito (`WITCH_LINES`).
- Levar tiro: dá bronca ("Quer virar sapo?") — gag `'bruxa'`.
- Posição em `objetos.bruxa` (dados da Vila Assombrada); o servidor confere a distância antes de sortear a poção (`Session.onPotion`).

## 8. Rato gigante (`GiantRat`, `client/world/halloween.ts`) — Vila Assombrada

- Fica no fim do beco sem saída do esgoto (`objetos.ratos` da Vila Assombrada). Respira, **vira para a câmera local** se ela estiver a menos de 18 m (e até 4 m de desnível), guincha a cada 4–9 s.
- Tem `RAT.hits = 14` de vida em balas (facada vale `RAT.stab = 4`); se encolhe ao ser atingido.
- O golpe final chama `onDown(id)`; o jogo decide (offline na hora, online pelo servidor, que confere distância ≤ `RAT.range`) e então `kill(ready)`: rola, afunda e solta uma "alma". Volta em `RAT.respawn = 120` s, crescendo de novo.

## 9. Outros elementos animados (cosméticos)

Espantalhos que caem com tiro e levantam (`'espantalho:N'`), patos de borracha que o caldeirão cospe a cada 5 tiros e que andam pela cabana grasnando (`Cauldron`), morcegos circulando (`Bats`). Ver [[Map Gags]].

## 10. Zumbis e chefes (`shared/zombieMatch.ts`) — modo zumbi, Cemitério da Capela

A horda do [[Zombie|modo zumbi]]. Online o **servidor** a simula (`ZombieMode` em `server/modes.ts`, tick de 20 Hz); no jogo solo, o mesmo motor roda no navegador (`client/zombies/local.ts`). O desenho e as hitboxes ficam em `client/zombies/view.ts` (avatares do sistema de personagens, `client/zombies/looks.ts`).

- **Surgir**: sempre no campo de covas **fora do muro**; o ponto é anunciado 0,9 s antes (`zfx 'rise'`: mãos saindo da terra, brilho e feixe verdes, gemido) e só então o agente entra no crowd.
- **Andar**: cada zumbi é um agente de uma `Crowd` do Detour sobre a navmesh do mapa ([[Navigation]]): segue o caminho até o jogador e se espaça dos outros sozinho. O alvo é o jogador **de pé** mais próximo (a altura conta dobrado: um andar acima é longe), revisto a cada 0,5 s; um caminho novo só é pedido quando o alvo andou ~30% da distância (mínimo 1 m), e não antes de 0,4 s perto, 1,5 s a meia distância ou 4 s longe (os caminhos longos em volta do muro precisam terminar na fila do crowd).
- **Barricadas** ([[ADR - Barricadas como polígonos próprios na navmesh]]): com o alvo do outro lado do muro, os zumbis comuns, Maratonistas, Tios e Tias **contornam** até a brecha aberta mais curta (as barricadas fechadas saem do filtro deles). O **Segurança** e os **chefes** vão reto pela brecha do caminho mesmo fechada; e todos fazem isso quando **não há brecha aberta**. Chegando às tábuas (até 1,8 m do muro), param na hora do lado deles, trocam para o filtro que respeita barricadas (fica preso ali) e golpeiam no ritmo do ataque (`smash`: dano em `barricadas.dano`); o Tio estoura nelas. Quando a última tábua cai, seguem em frente. Um jogador colado nas tábuas ainda pode levar o arranhão normal.
- **Estados**: anunciado (0,9 s) → saindo do chão (1,2 s; chefes 2,6 s) → perseguindo → preparando o golpe (para, vira para o alvo; o golpe acerta se o alvo ainda estiver ao alcance + 0,6 m quando ele cai) → de novo. Especiais: o **Tio do Churrasco** incha 1 s a 2,2 m e estoura; a **Tia da Fofoca** para quando enxerga o alvo de 5 a 11 m (raycast na navmesh) e cospe uma bola que cai onde o alvo estava; os **chefes** têm golpes telegrafados com recarga (pancada e chamar os mortos; grito e sumir; investida, tremor e fúria). Ver a tabela em [[Zombie]].
- **Destravar**: parado (andou menos de 0,6 m em 8 s), com o alvo a mais de 6 m, sem estar golpeando e sem estar batendo em tábuas, o zumbi volta a sair do chão num ponto de surgimento perto dos jogadores.
- **Percepção**: não há visão nem audição: o zumbi sempre sabe onde está o jogador de pé mais próximo (é uma horda). Jogadores caídos são ignorados.
- **Animação** (`CharacterAnimator.zombie`): a mesma locomoção de pés plantados dos jogadores, curvado, cabeça pendendo, braços para frente (balançando ao correr); braços acima da cabeça no golpe; braços abertos e tremendo no tio prestes a estourar; a tia jogando a cabeça para trás antes de cuspir; poses dos golpes dos chefes. As flags (`ZF`) do `zsnap` dizem qual pose tocar.

## Código relacionado

- `shared/zombieMatch.ts` (`ZombieMatch`), `shared/zombies.ts` (regras e números), `shared/barricades.ts` (brechas e tábuas), `client/zombies/view.ts` (`Zombie`, `ZombieView`), `client/zombies/looks.ts`
- `client/ai/bot.ts` (`Bot`, `BOT_SKILLS`), `client/ai/bots.ts` (`BotManager`)
- `client/entities/dummy.ts` (`Dummy`, `DummyManager`)
- `client/world/dog.ts` (`ChowChow`), `client/main.ts` (`dogTick`, `biteOnce`)
- `client/world/jardim/panda.ts`, `client/world/jardim/peixes.ts` (`KoiSchool`)
- `client/world/halloween.ts` (`GraveGhost`, `Witch`, `GiantRat`, `Cauldron`, `Scarecrows`, `Bats`), `client/world/catalog/objects.ts`, `shared/data/mapas/halloween.json`

Ver também: [[Map - Rua dos Vizinhos]], [[Map - Jardim do Dragão]], [[Map - Vila Assombrada]], [[Humiliation]], [[Respawn]].
