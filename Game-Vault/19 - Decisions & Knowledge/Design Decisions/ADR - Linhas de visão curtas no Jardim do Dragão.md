---
title: ADR - Linhas de visão curtas no Jardim do Dragão
type: decision
status: documented
area: world
source_paths:
  - client/world/dragonGarden.ts
  - client/world/jardim/kit.ts
  - client/world/jardim/casa.ts
  - client/world/jardim/guerreiros.ts
  - docs/MAPAS.md
tags:
  - decision
  - level-design
  - jardim
updated: 2026-10-05
---

# ADR - Linhas de visão curtas no Jardim do Dragão

## Contexto

O jogo tem a mecânica de oprimir (dançar sobre) o corpo de quem foi abatido ([[Humiliation]]). Enquanto oprime, o jogador fica exposto. O jardim chinês anterior (80 × 60 m) era aberto: 11,6% dos pares de pontos andáveis se enxergavam a mais de 25 m (`docs/MAPAS.md`). O mapa foi refeito (commit `c7ef981`, "remake map").

## Problema

Em mapa aberto, quem oprime um corpo leva tiro de longe, do outro lado do mapa, o que pune a mecânica que o jogo quer valorizar.

## Opções consideradas

Não registradas explicitamente. A alternativa implícita é o layout aberto anterior (ver [[Alternatives Considered]]).

## Decisão

Reconstruir o mapa (90 × 90 m) como uma propriedade murada em setores:

- Muros entre setores com **4 m**; nenhum piso perto de um muro pode pôr o olho (piso + 1,65 m) acima deles — por isso a Plataforma do Mestre tem piso a 2 m.
- **Portões nunca alinhados** com o portão do outro lado de um pátio; os portões da Casa Principal ficam deslocados dos portões dos setores.
- **Nenhum corredor reto atravessando o mapa**: ruas e becos dobram; salas com biombos/estantes/divisórias entre portas; cada trecho reto do anel tem algo que quebra a vista.

## Motivo

Comentário em `dragonGarden.ts`: "sightlines stay inside one sector (or one room), so nobody across the map can shoot whoever is busy oppressing a corpse". Medição de `docs/MAPAS.md`: 0,6% dos pares se enxergam a mais de 25 m, contra 11,6% antes.

## Consequências

- Combate curto/médio e em salas; posições elevadas limitadas (2–3,85 m).
- Mapa mais pesado de construir e desenhar (muitas peças; ~380–480 ms de construção).
- Qualquer mudança no Jardim deve respeitar essas regras ([[Map Design Rules]]). A ferramenta de medição não está no repositório, então a verificação é manual.

## Código afetado

- `client/world/dragonGarden.ts` — chamadas `gardenWall` com os portões.
- `client/world/jardim/kit.ts` — `WALL_H = 4`, `gardenWall`.
- `client/world/jardim/casa.ts`, `client/world/jardim/guerreiros.ts`.
- Mapa: [[Map - Jardim do Dragão]].
