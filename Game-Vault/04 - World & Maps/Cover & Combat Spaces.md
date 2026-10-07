---
title: Cover & Combat Spaces
type: concept
status: documented
area: world
source_paths:
  - client/world/surfaces.ts
  - client/weapons/hitscan.ts
  - shared/data/weapons/rifle_padrao.json
  - client/world/gameMap.ts
  - shared/data/mapas/rua.json
  - shared/data/mapas/jardim.json
  - client/world/jardim/kit.ts
  - client/world/jardim/casa.ts
  - client/world/jardim/bonsai.ts
  - client/world/jardim/lago.ts
  - client/world/jardim/lanternas.ts
  - client/world/jardim/guerreiros.ts
  - client/world/conversao/jardimSetores.ts
  - client/world/jardim/santuario.ts
  - shared/data/mapas/halloween.json
  - client/world/halloween.ts
  - shared/data/weapons/pistola.json
  - shared/data/weapons/smg.json
tags:
  - world
  - maps
  - combat
  - level-design
updated: 2026-10-06
---

# Cover & Combat Spaces

Como os mapas oferecem cobertura, que superfícies param ou deixam passar a bala, onde estão as posições elevadas e que distâncias de combate cada região favorece. Regras de dano em [[Damage System]] e [[Weapons]].

## Cobertura que para a bala x cobertura que só esconde

A bala é um raio (*hitscan*) contra os colisores do mapa. Se a superfície atingida tem um material listado em `penetracao` da arma e é fina o bastante **ao longo do caminho da bala**, o tiro atravessa e perde parte do dano. Dados do Rifle Padrão (`shared/data/weapons/rifle_padrao.json`, até 2 superfícies). A pistola e a submetralhadora (`pistola.json`, `smg.json`) atravessam só **1** superfície e perdem mais: madeira até 0,3 m (50% do dano continua), vidro até 0,1 m (85%), papel até 0,1 m (90%). Ver [[Weapons]].

| Material físico | Atravessa se a espessura no caminho for até | Dano que continua | Exemplos nos mapas |
| --- | --- | --- | --- |
| `wood` (madeira, piso, telhado, casca, tecido) | 0,4 m | 60% | cercas da Rua (0,15 m), paredes internas de madeira da Casa do Jardim (0,15 m), paredes de casas de madeira da Vila (0,3 m) |
| `glass` | 0,1 m | 90% | nenhum colisor de vidro confirmado nos mapas atuais (os vidros dos carros são visuais; o carro colide como caixas de `metal`) |
| `paper` (papel/shoji) | 0,1 m | 95% | paredes de papel da Casa Principal, sala de música, galeria do anel (Jardim) |
| `concrete`, `metal`, `tile`, `grass` | não atravessa | — | muros, alvenaria, carros, pedras, chão |

No máximo **2 superfícies** atravessadas por tiro. Tiros oblíquos percorrem mais material e podem parar onde um tiro reto passaria.

> [!info]
> As paredes das casas de madeira da Vila Assombrada têm 0,3 m e, pela regra acima, são atravessáveis por tiros quase perpendiculares. Conclusão derivada da combinação de `house()` (`client/world/catalog/haunted.ts`) com `traceShot` (`hitscan.ts`), não de um comentário explícito.

Coisas que **escondem mas não param** a bala:

- Folhagem de árvores, arbustos da Rua, juncos e lírios (sem colisor ou só visuais).
- Cercas de ferro e grades da Vila (`ironFence`): param o jogador e granadas, balas passam entre as barras.
- Tábuas pregadas nas janelas da casa abandonada da Vila (visuais; balas e granadas passam).
- Suportes de armas do Pátio dos Guerreiros ("thin: bullets go through").

Coisas que **param a bala e o movimento**: muros de jardim (4 m), muros perimetrais, troncos, pedras (colisão convexa), bambuzais (colidem como bloco), caixotes, fardos de feno, barris, lápides, túmulos da cripta, armaduras ("stops bullets"), carros, o palco e o coreto.

## Tipos de espaço

| Tipo | Onde | Características |
| --- | --- | --- |
| **Arena aberta** | Praça da Lua Cheia (Vila), arena do Pátio dos Guerreiros (Jardim), rua central (Rua) | Linhas longas, cobertura espalhada (carros, barracas, fardos, muro baixo de 1,1 m na entrada da arena) |
| **Interiores com várias saídas** | casas da Rua (porta frontal, traseira e duas laterais), alas da Casa Principal (anel interno), mansão (cada cômodo com 2+ entradas), mausoléu (portas em 3 lados) | Combate de curta distância; janelas do térreo atravessáveis pulando agachado |
| **Corredores dobrados / becos** | Pátio das Lanternas, vale do bambu, esgoto da Vila | Curta distância, emboscadas; comentário do Pátio das Lanternas cita "shotguns and ambushes" (não há escopeta no jogo atual — intenção de design) |
| **Caminho baixo escondido** | leito do riacho (−1,2 m) sob a ponte do Vale do Bambu; cripta dentro do terraço do Santuário; esgoto da Vila (−4 m); piscina da Rua (−2 m) | Rotas de flanco sem visão de cima |
| **Posição elevada** | ver tabela abaixo | Visão sobre uma área, mas sem enxergar por cima dos muros (Jardim) |

## Posições elevadas

| Mapa | Posição | Altura do piso | Acesso |
| --- | --- | --- | --- |
| Rua | torre de vigia (sudeste) | 7 m | escada longa ao longo do muro sul |
| Rua | casa na árvore (sobre a piscina) | 3 m | escada de madeira |
| Rua | andar de cima das casas | 3 m | escada interna ao longo da parede dos fundos |
| Jardim | andar de cima do pavilhão da ilha (varanda em volta) | ~3,65 m (comentário: "the high-value spot") | pontes de pedra (oeste) e de madeira (sul) |
| Jardim | terraço do Santuário (pátio do incenso, templo) | 3 m | escadaria principal, escada lateral, escada da cripta |
| Jardim | Plataforma do Mestre | 2 m (limite para não ver por cima dos muros de 4 m) | escada |
| Jardim | pavilhão do bonsai | 0,9 m ("a defensive spot") | degraus oeste e sul |
| Jardim | andar de cima da casa dos servidores (sacada sobre a rua) | ~3,5 m | escada interna |
| Vila | telhado do mausoléu (com parapeito) | ~4,45 m | escada externa |
| Vila | andar de cima da mansão | 3,6 m | escadaria do hall |
| Vila | andar de cima da casa do prefeito (sobrado de tijolo) | 3,2 m | escada interna |
| Vila | palco da praça / coreto | 1,2 m / 1,0 m | escadas laterais |

## Distâncias de combate por mapa (resumo)

- **Rua dos Vizinhos**: média/longa na rua (bonecos de treino a ~20 m e ~45 m do spawn oeste para "sentir a queda de dano do rifle"), curta dentro das casas e quintais. Ver [[Map - Rua dos Vizinhos]].
- **Jardim do Dragão**: projetado para combate curto/médio. Só 0,6% dos pares de pontos se enxergam a mais de 25 m (medição de `docs/MAPAS.md`). Ver [[Map - Jardim do Dragão]].
- **Vila Assombrada**: mistura arena longa (praça, estrada) com interiores e esgoto; névoa começa a 55 m. Ver [[Map - Vila Assombrada]].

## Relação com a mecânica de opressão

O comentário do Jardim explica a intenção: setores fechados para que "ninguém do outro lado do mapa atire em quem está ocupado oprimindo um corpo". Ver [[Humiliation]] e [[ADR - Linhas de visão curtas no Jardim do Dragão]].

## Código relacionado

- `client/weapons/hitscan.ts` — `traceShot` (penetração).
- `shared/data/weapons/rifle_padrao.json` — bloco `penetracao`.
- `client/world/surfaces.ts` — material físico de cada superfície.
- `client/world/halloween.ts` — `ironFence`, `blocker`, `hedge`.
- `client/world/jardim/kit.ts` — `gardenWall`, `bambooGrove`, `reeds`.
- Relacionados: [[Combat]], [[Map Design Rules]], [[Grenades]].
