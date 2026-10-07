---
title: ADR - Mapa exclusivo e barricadas no modo zumbi
type: decision
status: documented
area: design
source_paths:
  - shared/maps.ts
  - shared/modes.ts
  - client/world/cemetery.ts
  - shared/data/zumbi.json
  - shared/barricades.ts
  - shared/zombieMatch.ts
  - client/ui/home.ts
  - server/app.ts
tags:
  - decision
  - adr
  - design
  - zombies
  - maps
updated: 2026-10-06
---

# ADR - Mapa exclusivo e barricadas no modo zumbi

## Contexto

Pedido do usuário: "quero que o mapa do modo zumbi seja exclusivo desse modo. Hoje o mapa é grande demais e não dá para saber de onde os zumbis estão vindo. Queria um mapa, ainda de cemitério, mas com menos objetos tapando a visão. Também mecânicas novas de barricada, em que dá para construir barricadas para afunilar os zumbis numa região X." Até aqui o modo era jogado na [[Map - Vila Assombrada]] (120 × 110 m, oito regiões, esgoto, mansão), com 25 pontos de surgimento espalhados ([[ADR - Modo zumbi cooperativo com caixão e raridades]]).

## Problema

Dar ao modo um lugar legível (de onde vem a horda?), compacto, com espaço para uma mecânica de afunilamento, sem afetar os modos versus e sem mudar o modelo de jogo.

## Opções consideradas

- **Recortar a Vila Assombrada** (só o cemitério dela): o resto do mapa continuaria existindo e os zumbis viriam de dentro de casas, do esgoto e da floresta; o mapa versus mudaria junto.
- **Barricadas em qualquer lugar** (o jogador escolhe onde): exige colocação livre, pré-visualização e regras de colisão novas; a horda poderia ser trancada em qualquer canto.
- **Um mapa novo só do modo, com brechas fixas** (escolhida).

## Decisão

1. **Mapa exclusivo**: o [[Map - Cemitério da Capela]] (`MAPS.cemiterio`, `exclusivo: 'zumbi'`). `MODE_RULES.zumbi.maps = ['cemiterio']`; os outros modos usam `PVP_MAPS` (todo mapa sem `exclusivo`), e isso vale para salas fixas, `keepRoom`, criação de sala, os seletores da tela inicial (mapas, filtro, criar sala), o campo de tiro e a vitrine da landing. A Vila Assombrada volta a ser só versus.
2. **Legibilidade**: pátio murado de 40 × 36 m com covas baixas e poucos objetos altos; muro de base baixa (0,6 m) com grades (vê-se o campo de fora); zumbis **surgem só fora do muro** e entram só pelas **cinco brechas**, cada uma com lanternas; **telegrafia de surgimento** (mãos saindo da terra, brilho e feixe verde, gemido 3D) 0,9 s antes; setas no [[HUD]] para as brechas por onde a horda está chegando; névoa verde afastada (18–85 m).
3. **Barricadas fixas nas cinco brechas** (`barricadas` em `shared/data/zumbi.json`, regras em `shared/barricades.ts`, decididas no servidor):
   - **Erguer**: segurar `E` a até 2,4 m da brecha (de qualquer lado) por **2,5 s**; paga **$300** ao terminar e já vem com **5 tábuas** de **150** de vida cada.
   - **Repregar**: segurar `E` numa barricada com tábuas faltando ou a de cima danificada: uma tábua a cada **0,8 s**, **de graça**, pagando **$10** por tábua até **$150 por jogador por onda** (o teto zera quando a onda acaba; o intervalo conta com a onda seguinte). Uma barricada arrombada (0 tábuas) continua erguida: repregar é de graça.
   - **Fechada** enquanto houver ao menos uma tábua. A tábua que fecha a brecha espera o vão estar livre.
   - **Quem bate nas tábuas**: o Segurança (110 por golpe) e os chefes (260) arrombam a brecha fechada que estiver no caminho mesmo com outras abertas; os zumbis comuns (30; o Maratonista 20) contornam até uma brecha aberta e **só atacam tábuas quando todas estão fechadas**; o Tio do Churrasco estoura nelas (400 nas barricadas no raio da explosão).
   - **Tudo fechado é permitido**: a horda inteira passa a bater nas tábuas da brecha mais próxima do caminho; a barricada aguenta 750 (um zumbi comum sozinho leva ~32 s; um Segurança ~13 s; um chefe ~5 s), então o time precisa repregar sem parar. Não é uma tranca: só compra tempo.
   - **Duram entre ondas**; somem numa partida nova (`zbar` `reset`).
4. **A zona de abate**: o Portão Principal abre para a Alameda, 25 m em linha reta até o terraço elevado da capela. Fechar as outras quatro brechas manda a horda inteira por ali.

## Motivo

- Um mapa feito para o modo resolve a legibilidade na origem (geometria e surgimentos), em vez de remendar um mapa versus.
- Brechas fixas dão uma decisão clara (quais fechar, quanto gastar) e uma zona de abate projetada, sem um sistema de construção livre.
- Construir caro e repregar de graça faz o dinheiro ir para a decisão (abrir mão do caixão), e o tempo, não o dinheiro, para a manutenção; o teto da recompensa evita "fazendas" de tábuas.

## Consequências

- `shared/maps.ts` ganhou o conceito de mapa exclusivo (`exclusivo`, `PVP_MAPS`); `modeMaps` usa `PVP_MAPS` como padrão. Na PF-6 (fase 2) a mesma regra passou a ler o `exclusivo` dos dados de cada mapa: `modeAllowsMap(modo, exclusivo)` em `shared/modes.ts`, com `MODE_RULES.zumbi.ownMaps` no lugar de `maps: ['cemiterio']`.
- A Vila Assombrada perdeu os dados e a navmesh do modo (`mapas.halloween`, `navmesh/halloween.json`).
- O protocolo ganhou `barricade` (cliente), `zbar` e `zbarwork` (servidor) e `ZombieSync.bars` ([[Remote Calls]]).
- Equilíbrio (preços, vida das tábuas, dano por tipo) só no JSON, sem teste com jogadores reais.
- A implementação do desvio está em [[ADR - Barricadas como polígonos próprios na navmesh]].

## Código afetado

`shared/maps.ts`, `shared/modes.ts`, `client/world/cemetery.ts` (novo), `shared/barricades.ts` (novo), `shared/zombieMatch.ts`, `shared/data/zumbi.json`, `shared/protocol.ts`, `server/modes.ts`, `server/app.ts`, `client/zombies/barricades.ts` (novo), `client/zombies/client.ts`, `client/zombies/view.ts`, `client/ui/home.ts`, `client/ui/hud.ts`, `client/main.ts`.

Relacionado: [[Zombie]] · [[Map - Cemitério da Capela]] · [[Maps Index]] · [[Game Modes Index]]
