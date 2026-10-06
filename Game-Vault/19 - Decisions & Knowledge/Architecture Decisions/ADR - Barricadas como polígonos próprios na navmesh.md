---
title: ADR - Barricadas como polígonos próprios na navmesh
type: decision
status: documented
area: architecture
source_paths:
  - shared/barricades.ts
  - shared/zombieMatch.ts
  - client/ai/navmesh.ts
  - tools/bake-navmesh.ts
  - server/navmesh.ts
  - shared/data/navmesh/cemiterio.json
  - shared/data/zumbi.json
  - client/main.ts
  - server/tests/zombieBarricades.test.ts
tags:
  - decision
  - adr
  - architecture
  - ai
  - navigation
  - zombies
updated: 2026-10-06
---

# ADR - Barricadas como polígonos próprios na navmesh

## Contexto

O [[Zombie|modo zumbi]] ganhou barricadas nas cinco brechas do muro do [[Map - Cemitério da Capela]]: uma brecha fechada desvia a horda para as abertas; Seguranças e chefes arrombam as tábuas; zumbis comuns só atacam tábuas quando não há caminho aberto. Os zumbis andam sobre uma **navmesh pré-gerada** com a `Crowd` do Detour, no servidor e no jogo solo ([[ADR - Zumbis simulados no servidor sobre navmesh pré-gerada]]). A navmesh é carregada uma vez por processo e **compartilhada** por todas as sessões do mapa.

## Problema

Como fechar e abrir uma passagem para o pathfinding em tempo de jogo, por sessão, sem refazer a malha, mantendo a malha determinística (o teste do hash) e igual no servidor e no navegador?

## Opções consideradas

- **Obstáculos dinâmicos (TileCache)**: refaz os tiles debaixo de um obstáculo. Exige trocar a malha solo por uma de tiles com cache, e o obstáculo mexeria na malha compartilhada (todas as sessões do processo veriam a barricada de uma).
- **Mudar as flags dos polígonos na própria `NavMesh`** (`setPolyFlags`): simples, mas a malha é compartilhada entre sessões: uma barricada numa sala fecharia a brecha em todas.
- **Off-mesh connections** nas brechas, ligadas/desligadas: as brechas teriam de ser buracos na malha costurados por ligações; o crowd lida mal com muitos agentes numa ligação estreita.
- **Polígonos próprios por brecha + filtro de consulta por sessão** (escolhida).

## Decisão

1. **Na geração** (`client/ai/navmesh.ts`, `soloNavMeshWithAreas`): o gerador solo do recast-navigation refeito passo a passo com um passo a mais — depois de erodir a área andável, cada caixa de brecha (`gateAreas` em `shared/barricades.ts`: a largura da brecha + 5 cm, 0,5 m para cada lado do muro) é marcada com um **id de área** próprio (`rcMarkBoxArea`, área `i + 1`). Regiões nunca cruzam uma fronteira de área, então **cada brecha vira polígonos só dela** (na malha atual, exatamente um por brecha). Esses polígonos recebem a flag `WALK_FLAG | gateFlag(i)` (`gateFlag(i) = 1 << (i + 1)`); o resto do chão fica com área 0 e `WALK_FLAG`. As mesmas caixas entram no bake (`tools/bake-navmesh.ts`) e no jogo solo (`client/main.ts`), então o arquivo assado e a malha do navegador são idênticos.
2. **Na partida** (`ZombieMatch.updateGates`): cada sessão tem a sua `Crowd` e a sua `NavMeshQuery`. Uma brecha com pelo menos uma tábua entra no `excludeFlags` do **filtro 0** do crowd (`FILTER_AROUND`, o de todos) e do `defaultFilter` das consultas da partida (pontos andáveis, linha de visão do cuspe, alcance da investida do Prefeito, surgimento). O **filtro 1** (`FILTER_THROUGH`) nunca exclui nada. A malha compartilhada não muda.
3. **Quem usa qual filtro** (`think`): o Segurança (`brutamontes`) e os chefes usam `FILTER_THROUGH` quando o alvo está do outro lado do muro (`smashesThrough`); os outros também, mas só quando **todas** as brechas estão fechadas (não há caminho aberto: dentro/fora do muro é a caixa `dentro` do mapa). Os demais usam `FILTER_AROUND` e contornam.
4. **Arrombar** (`blockingGap`, `atBoards`, `smashBoards`): um zumbi com `FILTER_THROUGH` que chega à frente de uma brecha fechada (`atGap`: até 1,8 m do muro) com o alvo do outro lado **para na hora** (teleporte no lugar, a 0,95 m do muro, do lado dele) e **troca para `FILTER_AROUND`**: como a brecha está excluída desse filtro, nem o empurrão dos outros agentes o leva para dentro dela. Dali golpeia as tábuas (`smash`, dano por tipo em `barricadas.dano`); o Tio do Churrasco estoura nelas. Quando a última tábua cai, a brecha sai do `excludeFlags` e ele segue pelo mesmo filtro.
5. **Novos caminhos com parcimônia** (`chase`): pedir um caminho reinicia uma busca na fila de caminhos do crowd (100 passos por tick para todos). Com caminhos longos em volta do muro, a horda re-pedindo a cada 0,9 s nunca recebia o caminho completo e só seguia o parcial rápido, que encosta no muro pela brecha fechada mais próxima do alvo (o teste de desvio pegou isso). Agora um zumbi só pede outro caminho quando o alvo andou o bastante para a distância (30%, mínimo 1 m) e não antes de 0,4 s (perto), 1,5 s (médio) ou 4 s (longe); com o alvo parado, guarda o caminho. Quando uma brecha abre ou fecha, todos pedem de novo uma vez (os caminhos pela brecha que fechou o próprio crowd refaz).
6. **Fechar com gente no vão**: a tábua que fecha a brecha espera o vão (`inGap`) ficar livre de zumbis e jogadores, para ninguém ficar preso num polígono excluído.

## Motivo

- Mantém a malha **solo, pré-gerada e compartilhada**: abrir/fechar é trocar um inteiro num filtro, O(1), por sessão.
- Os filtros por agente dão de graça a diferença de comportamento pedida (desviar × arrombar) usando o próprio planejador do Detour.
- O bake continua determinístico (o teste compara o hash) e o jogo solo usa exatamente a mesma malha.

## Consequências

- O mapa precisa que o muro seja fechado e que as brechas sejam a **única** ligação entre dentro e fora (é como o "não há caminho aberto" é decidido, pela caixa `dentro`); `zombieProblems` confere que as brechas estão sobre o muro.
- Até 15 brechas por mapa (flags de 16 bits). Cada brecha nova é uma linha em `mapas.<id>.barricadas`; o construtor do mapa corta o muro a partir dos mesmos dados.
- `findRandomPointAroundCircle` pode devolver um ponto longe do círculo (escolhe um polígono que toca o círculo e um ponto qualquer nele): `walkable` agora recusa pontos além de 1,5× o raio, e o surgimento nunca cai dentro do muro.
- As tábuas não são geometria da malha: o colisor delas (grupo de bloqueio: para jogadores e granadas, não balas) existe só no cliente.

## Código afetado

`shared/barricades.ts` (novo: `gateAreas`, `gateFlag`, `WALK_FLAG`, `gapFrame`, `inGap`, `atGap`, `inReach`, regras das tábuas), `shared/zombieMatch.ts` (`updateGates`, filtros, `blockingGap`, `atBoards`, `smashBoards`, `chase`, `walkable`), `client/ai/navmesh.ts` (`soloNavMeshWithAreas`, parâmetro `areas`), `tools/bake-navmesh.ts`, `server/navmesh.ts`, `client/main.ts`, `shared/data/navmesh/cemiterio.json`. Testes: `server/tests/zombieBarricades.test.ts`.

Relacionado: [[Navigation]] · [[NPC Behavior]] · [[Zombie]] · [[ADR - Mapa exclusivo e barricadas no modo zumbi]] · [[ADR - Zumbis simulados no servidor sobre navmesh pré-gerada]]
