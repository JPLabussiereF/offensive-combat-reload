---
title: Map Design Rules
type: concept
status: documented
area: world
source_paths:
  - docs/MAPAS.md
  - client/world/mapBuilder.ts
  - client/world/gameMap.ts
  - shared/data/mapas/rua.json
  - shared/data/mapas/jardim.json
  - client/world/jardim/kit.ts
  - client/world/jardim/casa.ts
  - shared/data/mapas/halloween.json
  - client/world/halloween.ts
  - client/world/oriental.ts
  - shared/constants.ts
  - server/session.ts
  - client/entities/localPlayer.ts
  - shared/data/weapons/rifle_padrao.json
  - shared/data/weapons/pistola.json
  - shared/data/weapons/smg.json
tags:
  - world
  - maps
  - level-design
updated: 2026-10-06
---

# Map Design Rules

Regras que os mapas atuais seguem e que valem para quem for mexer neles ou criar um novo. Cada regra indica de onde vem a evidência.

## 1. Medidas do jogador e das passagens

| Regra | Valor | Evidência |
| --- | --- | --- |
| Jogador | cilindro de 0,7 m de diâmetro × 1,8 m (1,2 m agachado); olho a 1,65 m | `MOVE` (`shared/constants.ts`) |
| Porta | ≥ **1,6 m** de largura e ≥ **2,3 m** de altura | `docs/MAPAS.md`; casas da Rua usam exatamente 1,6 × 2,3 (`buildHouse`) |
| Janela do térreo atravessável | peitoril ≤ **0,9 m** e topo ≥ **2,3 m** (passa pulando agachado) | `docs/MAPAS.md`; janelas da Rua: 0,9–2,3 m |
| Degrau sem escada | até 0,4 m (step automático) | `MOVE.stepHeight` |
| Rampa andável | até 45° | `MOVE.maxSlopeDeg` |
| Queda | dano em quedas acima de 6 m: (altura − 6) × 15 + 10 | `MOVE.fallDamageHeight`, `fallDamagePerMeter`, `client/entities/localPlayer.ts` (ver [[Damage System]]) |

> [!warning]
> `docs/MAPAS.md` afirma que "o jogo checa automaticamente" essas medidas com um "teste de estrutura" que passa raios pelos vãos de `map.openings`. **Esse teste não existe no repositório atual** (nenhum uso de `openings` fora de `client/world/`; `client/tests/` só tem `aimAssist`, `keybinds` e `spatial`). Ver [[Problem - Teste de estrutura de vãos ausente]].

## 2. Paredes, portas e janelas

- `MapBuilder.wall` recebe vãos `[início, fim, base, topo]` e aceita **vãos empilhados** (porta sob janela, janelas em dois andares). A parede é cortada em colunas nas bordas dos vãos.
- A moldura (`frame`) é só visual e **nunca estreita o vão**; ela invade alguns milímetros o vão para evitar faces coplanares que "brigam" (z-fighting).
- Portas abertas (folhas) são visuais, **sem colisão**, para nunca bloquear a passagem (`buildHouse`, `doorLeaves`).
- Todo vão fica registrado em `map.openings` (eixo, posição, espessura, intervalo, alturas, se é porta).

## 3. Escadas

- Degraus de **0,3 m** de altura e **0,38 m** de profundidade (`STEP_H`, `STEP_D`); `stairRun(altura)` dá o comprimento.
- **Degraus são só visuais; a colisão é uma cunha sólida** (rampa lisa do primeiro degrau até o último). Subir não engancha, e não há vão embaixo da escada onde alguém possa se esconder e atirar. Ver [[ADR - Escadas com colisão em rampa sólida]].
- Lances curtos (até ~1,2 m) ficam com rampa acima de 45° e os bots não sobem: usar `{ gentle: true }` (e `stairRun(altura, true)`), que acrescenta degraus. Usado no riacho do Vale do Bambu e no deck do Bonsai.
- Escadas não devem se encontrar em "V" sem saída (comentário do riacho: os lances norte e sul ficam lado a lado).
- Paredes ao lado de escadas ficam **coladas** à lateral da escada, sem fresta para enganchar (correções do porão e da sala de manutenção da Vila, commit `0fac263`).
- Guarda-corpo de escada alta fica **sobre o muro perimetral**, não sobre a escada, para não bater na cabeça de quem sobe (torre da Rua).

## 4. Linhas de visão e muros

Regras explícitas do [[Map - Jardim do Dragão]] (`docs/MAPAS.md` e comentários de `client/world/conversao/jardim.ts`/`jardim/kit.ts`), pensadas para que "ninguém leve tiro de longe enquanto oprime um corpo" (ver [[Humiliation]]):

- **Muros entre setores com 4 m** (`WALL_H`). Nenhum lugar onde se fica de pé pode ter o olho (piso + 1,65 m) acima disso perto de um muro — por isso a Plataforma do Mestre tem piso a 2 m.
- **Portões nunca alinhados** com o portão do outro lado de um pátio.
- **Nada de corredor reto atravessando o mapa**: ruas e becos dobram, as salas da Casa têm biombos, estantes ou divisórias entre a porta de fora e a do pátio; cada trecho reto do anel tem algo que quebra a vista.
- Medição registrada em `docs/MAPAS.md`: com 600 pontos andáveis aleatórios, 0,6% dos pares se enxergam a mais de 25 m, contra 11,6% no jardim anterior (80 × 60 m). A ferramenta de medição **não está no repositório**.

Aplicações equivalentes nos outros mapas:

- Rua: o **caminhão de sorvete** fica no meio da rua para quebrar a linha de visão longa (comentário em `client/world/conversao/rua.ts`); caixotes altos (2 m) nas pontas.
- Vila: cercas vivas (`hedge`, 2,6 m) "bloqueiam movimento e visão"; a Praça da Lua Cheia é a única arena deliberadamente aberta.
- Mausoléu da Vila: não há caixão na sala noroeste porque a porta externa dela se alinha com o corredor (comentário em `client/world/conversao/halloween.ts`).

Detalhe em [[ADR - Linhas de visão curtas no Jardim do Dragão]].

## 5. Colisão e materiais

- **Colisão mais simples que o visual**: caixas e convexos sempre que possível; malha de triângulos só onde precisa (`docs/MAPAS.md`, `MapBuilder`).
- **Folhagem é só visual**: copas de árvore, tufos e galhos de árvore seca não colidem (balas passam); troncos colidem. Bambuzais colidem como um bloco.
- **Chão não projeta sombra** (`castShadow: false`), só recebe.
- Materiais físicos atravessáveis por bala quando finos: madeira (até 0,4 m), vidro (0,1 m), papel (0,1 m, perde só 5% do dano) — dados do rifle em `shared/data/weapons/rifle_padrao.json` (a pistola e a submetralhadora atravessam só 1 superfície e madeira até 0,3 m; ver [[Cover & Combat Spaces]]). Ver [[Cover & Combat Spaces]].
- **Cercas de ferro** (Vila) usam o grupo `BLOCKER`: param jogadores e granadas, balas passam entre as grades.

## 6. Determinismo

- Pedras, árvores, bambus, lápides e qualquer coisa com colisão posicionada "ao acaso" usam `seeded(semente)`, **nunca `Math.random`**: a colisão precisa ser igual em todos os clientes da sessão (Jardim: semente 8128; Vila: 1031; carpas: 4242).
- Ao remover um objeto sorteado, a sequência aleatória deve ser preservada: a Vila "planta" a árvore que esconderia a placa da bruxa num construtor vazio (`nowhere`), para que todas as árvores e lápides seguintes continuem no mesmo lugar.
- Ver [[ADR - Aleatoriedade com semente na construção dos mapas]].

## 7. Ids de objetos sincronizados

- Ids de piadas/props: **minúsculos e sem acento**, no formato `/^[a-z]{1,16}(:\d{1,3})?$/` (ex.: `hidrante:0`, `sinocapela`, `abobora:12`). O servidor descarta os demais e limita um evento a cada 150 ms por jogador (`server/session.ts`).
- Ids de coletáveis seguem o mesmo formato (`shared/maps.ts`).

## 8. Spawns

- 16 a 20 spawns neutros espalhados para o mata-mata livre (meta de `docs/MAPAS.md` e do comentário de `GameMap.spawnsFFA`); os mapas atuais têm 21, 28 e 25. Ver [[Spawn Design]].

## 9. Desempenho

Metas de `docs/MAPAS.md` (seção 3 do documento de design original, não incluído no repositório):

| Item | Meta |
| --- | --- |
| Draw calls por quadro | < 300 |
| Triângulos visíveis | < 500 mil |
| Texturas | < 256 MB |
| Mapa pequeno (fase atual) | até ~50 mil triângulos |

Regras para modeladores: reutilizar superfícies da biblioteca; detalhes pequenos sem colisão (`NOCOL`); otimizar o `.glb` (meshopt, KTX2). Números medidos por mapa e técnicas em [[Performance Rendering]] e [[GPU]].

## Código relacionado

- `client/world/mapBuilder.ts` — `wall`, `stairs`, `STEP_H`, `STEP_D`, `stairSteps`, `stairRun`.
- `client/world/jardim/kit.ts` — `WALL_H`, `gardenWall`, layout dos setores.
- `client/world/halloween.ts` — `blocker`, `ironFence`, `hedge`.
- `client/world/oriental.ts` — `seeded`.
- `shared/constants.ts` — `MOVE`, `GROUP`.
- `server/session.ts` — validação do id de `prop`.
