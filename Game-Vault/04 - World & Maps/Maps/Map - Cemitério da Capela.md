---
title: Map - Cemitério da Capela
type: map
status: documented
area: world
source_paths:
  - shared/data/mapas/cemiterio.json
  - client/world/catalog/cemetery.ts
  - client/world/conversao/cemiterio.ts
  - client/world/halloween.ts
  - client/world/furniture.ts
  - shared/maps.ts
  - shared/modes.ts
  - shared/zombies.ts
  - shared/barricades.ts
  - shared/data/zumbi.json
  - shared/data/navmesh/cemiterio.json
  - tools/bake-navmesh.ts
  - client/zombies/barricades.ts
  - client/zombies/coffin.ts
  - client/zombies/view.ts
tags:
  - world
  - map
  - zombies
  - coop
updated: 2026-10-07
---

# Map - Cemitério da Capela

O mapa **exclusivo do [[Zombie|modo zumbi]]**: um cemitério murado e compacto em volta de uma capela, com o campo de covas antigas do lado de fora do muro, de onde a horda sobe. Feito para **ler a horda**: muro baixo com grades (vê-se e atira-se através delas), pátio aberto com covas baixas, cinco brechas no muro bem marcadas por lanternas. É o único mapa onde o modo zumbi é jogado, e nenhum outro modo o usa ([[ADR - Mapa exclusivo e barricadas no modo zumbi]]).

| Campo | Valor |
| --- | --- |
| Id interno | `cemiterio` (`exclusivo: 'zumbi'` nos dados) |
| Sessão | sob demanda, só do modo zumbi (a sala fixa `zumbi-cemiterio` saiu na PF-6) |
| Dados | `shared/data/mapas/cemiterio.json` (339 peças; montado por `client/world/mapLoader.ts`), com o muro e os pilares em `client/world/catalog/cemetery.ts` e peças de `halloween.ts` (lápides, árvores secas, sebe, arco do portão, lampiões, névoa rasteira, morcegos, céu) e `furniture.ts` (velas). Os dados do modo zumbi do mapa estão no campo `zumbi` do mesmo JSON. Até a PF-6 era construído em código por `buildCemeteryMap`; os comentários de design estão em `client/world/conversao/cemiterio.ts` |
| Tamanho | **68 × 64 m** de chão (x −34..34, z −32..32); área jogável dentro da sebe: 64 × 60 m. O pátio murado tem **40 × 36 m**. Cerca de um terço da área da [[Map - Vila Assombrada]] (120 × 110 m) |
| Atmosfera | noite de lua (luz esverdeada vinda de (38, 62, −30)), **névoa verde `#2c3a30` de 18 a 85 m** (afastada de propósito: as brechas e o campo além delas ficam legíveis de qualquer ponto do pátio), céu estrelado; 10 luzes reais distribuídas às lanternas/velas mais próximas da câmera ([[Lighting]]) |
| Célula de lote | 34 m |
| `shadowExtent` | 38 m |
| `killY` | −10 |

## Visão geral

```text
            z = −30  sebe ─────────────────────────────────────────
                     campo norte (anel de terra, covas antigas, surgimentos, Coveiro)
            z = −18  muro ══[NO]═════════[ capela ]═════════[NE]══
                       │  pátio NO        │terraço│    pátio NE   │
                       │  (monte de terra)  ▼▼▼     caixão ▣ (leste)
                      [O]═══ Travessa (z 4..6) ═══ Alameda ═══════[L]
                       │   covas baixas     ║      covas baixas    │
                       │                    ║ (zona de abate)      │
            z = +18  muro ════════════════[PORTÃO]════════════════
                     campo sul (anel de terra, Prefeito em (−11, 24,5))
            z = +30  sebe
               x = −32   x = −20                x = +20   x = +32
```

- **Muro** (linha central x = ±20, z = ±18; 0,5 m de espessura): **base de pedra de 0,6 m** (para tiros baixos e granadas) com **grades de ferro até 2,4 m** por cima (colisor de bloqueio: para jogadores e granadas, **não para balas**). Pilares a cada ~5 m e nos cantos. Ninguém pula; a horda só entra pelas brechas. A beirada da base (17 cm de cada lado das grades) deixava subir: as grades têm **espinhos** nos dois trilhos, e quem sobe sangra (ver "Zonas especiais").
- **As cinco brechas** (`zumbi.barricadas` em `cemiterio.json`, na ordem que a rede e a navmesh usam):

| # | id | Nome no jogo | Muro | Centro | Largura livre |
|---|---|---|---|---|---|
| 0 | `portao` | Portão Principal | sul | (0, 18) | 3,0 m, sob o arco "CEMITÉRIO DA CAPELA" |
| 1 | `oeste` | Brecha Oeste | oeste | (−20, 5) | 2,4 m |
| 2 | `leste` | Brecha Leste | leste | (20, 5) | 2,4 m |
| 3 | `noroeste` | Brecha Noroeste | norte | (−12, −18) | 2,4 m |
| 4 | `nordeste` | Brecha Nordeste | norte | (12, −18) | 2,4 m |

  Cada brecha tem dois pilares com **lanternas acesas** (luz real) e um chão de terra batida atravessando o muro: é o que se procura na tela. As tábuas das barricadas (desenhadas por `client/zombies/barricades.ts`) ficam na face de fora do muro ([[Zombie]] → Barricadas).

## Layout

- **A capela** (âncora, centro-norte): sobre um **pedestal de 0,6 m** (x −5..5, z −17,5..−7,4), paredes de pedra de 4,4 m, telhado de duas águas com um **campanário** sobre a fachada, vitrais pintados (cores escuras, lidas como vidro aceso por dentro), rosácea sobre a porta. Portas: **sul** (2 m, para o terraço) e **oeste/leste** (1,6 m, com escadinhas até o chão). Dentro: altar com **duas velas e o totem** da Vigília Sem Trégua no meio (ver [[Zombie]]) e bancos curtos (cobertura agachada) com corredores largos no meio e junto às paredes.
- **O terraço** (frente da capela, z −10,2..−7,4): parapeito de 0,55 m (cobertura agachada), aberto só na escada central de 4 m que desce para a Alameda. É o ponto alto (0,6 m) que olha o portão.
- **A Alameda**: avenida de pedra de 3,6 m de largura do terraço até o Portão Principal (z −6,7 → 18,3), com **4 lampiões** (x ±2,6; z −2,5 e 9,2) e dois obeliscos perto do portão. Dos dois lados, covas baixas.
- **A Travessa**: caminho de pedra de 2 m (z 4..6) de uma brecha lateral à outra, cruzando a Alameda.
- **As covas do pátio**: 5 colunas de cada lado da Alameda (x ±4,6 a ±15,0, a cada 2,6 m) em 6 fileiras (z −3,6, −0,6, 2,2, 9,5, 12,5, 15,5), ~20% puladas. Quase todas **lajes e arcos** (0,6–1,1 m: não tampam a visão de quem está de pé); poucas cruzes; um obelisco em cada pátio norte e dois na Alameda como marcos.
- **Pátio noroeste**: o monte de terra fresca com a pá do Coveiro, uma árvore seca, um arco com epitáfio.
- **Pátio nordeste**: o **Caixão Misterioso**, sempre no mesmo lugar — encostado no muro leste em (17,6, −9), girado 90°, sobre uma laje escura, entre dois candelabros de velas. Fica a ~11 m da Brecha Nordeste e ~14 m da Leste: comprar arma expõe a esses dois flancos, a menos que estejam barricados.
- **Fora do muro (o campo de covas)**: um **anel de terra** a 5–7 m do muro (norte z −25,6..−23, sul z 23,2..25,8, oeste x −27,6..−24,6, leste x 24,6..27,6), fileiras de covas antigas (arcos, cruzes, lajes, obeliscos, tortas e cobertas de musgo) dos dois lados dele, algumas árvores secas nos cantos, névoa rasteira baixa. Fecha tudo uma **sebe de 2,6 m** em x = ±32 e z = ±30; além dela, um anel de árvores secas sem colisão (o horizonte).

## Rotas principais

- **Portão → Alameda → terraço**: a rota mais longa e mais aberta (~25 m em linha reta, covas baixas dos lados). Com as outras quatro brechas barricadas, **toda a horda entra por aqui**: é a **zona de abate** pensada para o mapa (o time no terraço ou na Alameda atira de frente, sem ser flanqueado).
- **Brechas Oeste/Leste → Travessa**: chegam no meio do pátio, de lado.
- **Brechas Noroeste/Nordeste**: chegam pelos flancos da capela (e, a nordeste, perto do caixão).

## Rotas alternativas

- **Por dentro da capela**: porta sul ↔ portas laterais.
- **O anel de fora**: os zumbis desviados de uma brecha barricada contornam o muro pelo anel de terra até a próxima aberta. Jogadores também podem sair pelas brechas abertas (arriscado).

## Áreas abertas

O pátio inteiro (exceto a capela), a Alameda e o anel de fora. Não há telhados ocupáveis além do topo da capela (não pensado para jogo).

## Áreas fechadas

Só o interior da capela (9 × 7 m, três portas).

## Cobertura

Parapeito do terraço (agachado), bancos da capela, lápides em arco (meia altura), o próprio pedestal da capela. A base de pedra do muro (0,6 m) para tiros baixos. Grades e tábuas **não** param balas. Ver [[Cover & Combat Spaces]].

## Spawn points

- **Jogadores** (`spawnsFFA`, 16; `spawnsA`/`spawnsB` iguais, só para cumprir o contrato `GameMap`): na Alameda (z −3, 2, 10, 14), na Travessa (x ±8, ±14), no terraço, dentro da capela e nos dois pátios norte. O modo zumbi escolhe o que fica a 12 m dos zumbis e perto de um colega de pé ([[Spawn Design]], `pickSpawn` em `client/main.ts`).
- **Zumbis** (`zumbi.surgir`, 24, **todos fora do muro** — `zombieProblems` recusa um dentro): 6 no campo norte (z −24,3), 6 no campo sul (z 23,6–25,5), 4 a oeste e 4 a leste (x ±26), 4 nos cantos (±27, ±21). Os pontos diante das brechas laterais foram evitados. O sorteio usa os 6 mais próximos que estão a pelo menos 14 m de todo jogador de pé.
- **Chefes** (`zumbi.chefe`), todos fora do muro e em chão limpo (≥ 3,4 m livres em toda direção, conferido na navmesh): o **Coveiro** no campo norte, atrás da capela (0, −24,3); a **Noiva** no campo oeste (−26, −8); o **Prefeito** no anel sul (−11, 24,5), com o anel livre para leste para a **investida** (≥ 18 m). As covas do campo deixam 4 m em volta desses pontos e 2,2 m em volta dos de zumbi.

## Objetivos

Os do [[Zombie|modo zumbi]]: sobreviver às ondas. Pontos de interesse: o caixão (pátio nordeste) e as cinco brechas (barricadas).

## Zonas especiais

- **Faixas das brechas** (dentro da espessura do muro): na navmesh, cada uma é um polígono à parte com a sua flag ([[ADR - Barricadas como polígonos próprios na navmesh]]); uma barricada fechada tira esse polígono do mapa dos zumbis.
- **Raio de trabalho** de uma brecha: 2,4 m do centro, dos dois lados (`barricadas.alcance`).
- **Espinhos** (`thornsAt` em `shared/barricades.ts`, números em `espinhos`): a grade do muro (fora das brechas) e a **sebe** (`zumbi.sebe` em `cemiterio.json`; na main era `mapas.cemiterio.sebe` em `shared/data/zumbi.json`). Conta quem está com os pés a 0,3 m do chão ou mais e a até 0,5 m da linha do muro ou 0,8 m da linha da sebe: em pé no chão, o corpo do jogador (raio 0,35 m) nunca chega tão perto, então só quem sobe leva. Os espinhos desenhados (pontas claras nos trilhos e na face da sebe) são só visuais, sem colisão; a navmesh não muda. Regra em [[Zombie]].

> [!info] Espinhos depois do merge da main (07/10/2026)
> Na main o cemitério ainda era construído em código; na sandbox ele é dado. O porte: a peça `muroCemiterio` desenha sempre os espinhos nos dois trilhos (`client/world/catalog/cemetery.ts`, `thorns`), e a peça `sebe` ganhou o parâmetro opcional `espinhos` (`hedgeThorns`), ligado nas quatro sebes de `shared/data/mapas/cemiterio.json`. A linha da sebe que o servidor confere fica em `zumbi.sebe` do mesmo JSON (`[-32, -30, 32, 30]`). Os espinhos não colidem: colisores e navmesh não mudaram; o golden do Cemitério foi regravado só pelos lotes estáticos (+11,6 mil triângulos). Um banco que já tinha a versão 1 do Cemitério antes disso guarda a versão antiga (sem `sebe` e sem espinhos na sebe) até a equipe salvar uma versão nova.

## Objetos interativos

- **Caixão Misterioso** (fixo, `E`).
- **Totem** no altar da capela (`E`, $500): acende a Vigília Sem Trégua, sem intervalo até o fim da partida ([[Zombie]]). Era o lugar de duas das quatro velas do altar.
- **Barricadas** nas cinco brechas (`E` segurado).
- **Lampiões** da Alameda (`poste:0..3`): apagam com tiro, como na Vila Assombrada ([[Map Gags]]).

## Fluxo esperado dos jogadores

> [!info]
> Intenção do layout (design), não medida com jogadores reais.

1. Na contagem: achar o caixão (pátio nordeste) e decidir o que barricar com os $500 iniciais (uma barricada custa $300).
2. Primeiras ondas: as cinco brechas abertas; o time se espalha.
3. Com dinheiro: barricar as brechas laterais e as do norte e segurar a horda no **Portão/Alameda**, atirando do terraço. Repregar tábuas nos intervalos.
4. Seguranças e chefes arrombam o que estiver no caminho: alguém precisa vigiar a brecha que eles escolheram e repregar depois.

## Telegrafia e leitura da horda

- Cada zumbi **avisa antes de sair do chão** (`zfx 'rise'`, 0,9 s antes): um disco verde no chão, **duas mãos saindo da terra**, um **feixe de luz verde** de 3,2 m (visível por cima do muro e das covas) e um **gemido 3D** alto no ponto ([[SFX]], [[Visual Effects]]).
- Base do muro baixa (0,6 m): de dentro do pátio vê-se o campo de fora através das grades.
- [[HUD]]: setas em volta da mira apontam as brechas por onde zumbis estão chegando (até 10 m fora delas), com a contagem ou o símbolo de tábuas quando a brecha está barricada.

## Navmesh do servidor

`shared/data/navmesh/cemiterio.json` (~116 KB, 781 polígonos), gerada a partir de `shared/data/mapas/cemiterio.json` (montado sem tela pelo mesmo carregador do cliente) por `bun run navmesh` com as caixas das brechas marcadas (`gateAreas`). **Mudou o mapa, refaça a malha** (o teste do hash avisa). O jogo solo constrói a mesma malha no navegador. Ver [[Navigation]].

## Problemas conhecidos

- O caixão e as tábuas têm colisão para os jogadores, mas não estão na navmesh: um zumbi pode encostar no caixão; nas brechas, as tábuas são regra do motor (o filtro), não geometria.
- Um zumbi encostado no muro alcança um jogador colado nas grades do outro lado (alcance do arranhão 1,3 m sem checar linha de visão): "braço pela grade". Intencional, não testado com jogadores.
- O topo do telhado da capela não foi pensado para jogo (alcançável só por depuração).

## Código relacionado

- `shared/data/mapas/cemiterio.json` — o mapa (peças, spawns, atmosfera, sons de corvo e uivo, 10 luzes reais) e, em `zumbi`, o muro (`dentro`), os surgimentos, o caixão, os chefes e as brechas (lidos por `shared/zombies.ts` como `ZOMBIE.mapas.cemiterio`, conferidos por `checkZombieMap`).
- `client/world/catalog/cemetery.ts` — `muroCemiterio` (base de pedra, grades de bloqueio, pilares, cortado nas brechas), `pilarCemiterio`, `CemeterySfx`.
- `client/world/conversao/cemiterio.ts` — o construtor antigo (`buildCemeteryMap`) gravado como peças, com os comentários de design.

Relacionado: [[Maps Index]] · [[Zombie]] · [[World Structure]] · [[Map Design Rules]] · [[Navigation]] · [[Lighting]]
