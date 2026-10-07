---
title: Map - Jardim do Dragão
type: map
status: documented
area: world
source_paths:
  - shared/data/mapas/jardim.json
  - client/world/catalog/garden.ts
  - client/world/catalog/gardenPieces.ts
  - client/world/conversao/jardim.ts
  - client/world/conversao/jardimSetores.ts
  - client/world/jardim/kit.ts
  - client/world/jardim/casa.ts
  - client/world/jardim/bonsai.ts
  - client/world/jardim/lago.ts
  - client/world/jardim/lanternas.ts
  - client/world/jardim/guerreiros.ts
  - client/world/jardim/santuario.ts
  - client/world/jardim/cereja.ts
  - client/world/jardim/cerejeira.ts
  - client/world/jardim/frutas.ts
  - client/world/jardim/peixes.ts
  - client/world/jardim/panda.ts
  - client/world/jardim/luzes.ts
  - client/world/oriental.ts
  - shared/maps.ts
  - shared/constants.ts
  - docs/MAPAS.md
  - README.md
tags:
  - world
  - map
  - jardim
updated: 2026-10-06
---

# Map - Jardim do Dragão

| Campo | Valor |
| --- | --- |
| Id interno | `jardim` |
| Sessão fixa | id `jardim` |
| Dados | `shared/data/mapas/jardim.json` (741 peças; montado por `client/world/mapLoader.ts`). Os setores (casa, anel, bonsai, lago, lanternas, guerreiros, bambu, santuário) foram convertidos **chamada por chamada** em peças individuais (decisão P31 em [[ADR - Mapas como dados com catálogo de peças]]): cada pavilhão, telhado, árvore, lanterna, barraca, sino e tambor é uma peça, com a sua semente e o seu id do `PropBus`. Até a PF-6 era construído em código por `buildDragonGardenMap`; os comentários de design estão em `client/world/conversao/jardim.ts` e `jardimSetores.ts` |
| Tamanho | 90 × 90 m (x −45..45, z −45..45) |
| Atmosfera | **noite** (`NIGHT` em `jardim/luzes.ts`): céu escuro com centenas de lanternas de papel subindo; as 6 lanternas mais próximas da câmera viram luzes reais (ver [[Lighting]]) |
| Célula de lote | 45 m (os quatro quadrantes; 40 m cortaria em 16 pedaços e dobraria os draw calls) |
| `shadowExtent` | 57 m (W + 12) |
| `killY` | −20 |

## Visão geral

Uma grande propriedade chinesa murada. No centro, a **Casa Principal** (casa de pátio com a **Cerejeira do Dragão**), cercada por um **anel**; em volta, **seis setores murados**, cada um vizinho do próximo e do anel. O mapa foi desenhado para **linhas de visão curtas**: muros de 4 m entre setores e portões nunca alinhados, para que ninguém do outro lado do mapa atire em quem está oprimindo um corpo (ver [[ADR - Linhas de visão curtas no Jardim do Dragão]] e [[Humiliation]]). Peças visuais em [[Environment Pieces]] e [[Props Catalog]].

## Layout

Esquema do código (`jardim/kit.ts`), norte = −Z:

```text
            x=-45        -18          18          45
   z=-45    +-----------+------------+-----------+
            | SANTUÁRIO |   BONSAI   |   LAGO    |
   z=-20    |           +------------+           |
            |           |    anel    |           |
   z=0      +-----------+  +------+  +-----------+
            |   BAMBU   |  | CASA |  | LANTERNAS |
   z=20     |           +------------+           |
            |           | GUERREIROS |           |
   z=45     +-----------+------------+-----------+
```

| Região | Retângulo (x; z) | Conteúdo |
| --- | --- | --- |
| Casa Principal | −13..13; −13..13 | pátio de 17 × 17 m com a cerejeira; ala norte: **Grande Salão** (4,8 m de pé-direito, telhado-marco com pérola dourada e dragões) entre duas salas; ala sul: sala de cerimônias (trono, altares, dragão em relevo); ala oeste: biblioteca e sala de chá; ala leste: duas salas transformadas em **corredores em L** por divisórias. Paredes do pátio em papel. Cada sala abre para a próxima: as alas formam um **anel interno** |
| Anel | entre a casa e os muros (x/z −18..18 × −20..20) | galeria coberta ao norte (papel), árvores e pedras nos cantos, sebes, bancos, lanternas de pedra; "cada trecho reto tem algo que quebra a vista" |
| Jardim de Bonsai (N) | −18..18; −45..−20 | caminho sinuoso entre sebes até o **Bonsai do Dragão** (vaso de 4,6 m); laguinho com carpas cortado por ponte em arco; pavilhão do bonsai a 0,9 m (NE, "posição defensiva"); deck elevado; sebes baixas (cobertura) e altas de 2 m (cortam a vista) |
| Lago de Lótus (NE) | 18..45; −45..0 | lago x 22,5..42, z −40,5..−8 (0,8 m); **ilha** com pavilhão de dois andares e varanda em volta ("the high-value spot"); ponte de pedra em arco (margem oeste) e ponte velha de madeira (margem sul); casa de chá meio sobre a água ao norte; decks; juncos e lótus; **fonte do dragão** na ilhota (39, −14) |
| Pátio das Lanternas (SE) | 18..45; 0..45 | bairro de serviço, combate curto: **rua das lanternas** (x 29..33) com pailou e carroça; oeste: casa de chá, cozinha, depósito; leste: casa dos servidores (2 andares, sacada sobre a rua), sala de música (papel), oficina; becos; mercado ao sul com o carrilhão |
| Pátio dos Guerreiros (S) | −18..18; 20..45 | grande portão vermelho; arena de pedra aberta com círculo pintado (muro baixo de 1,1 m na entrada); dojo a oeste; **Plataforma do Mestre** (piso a 2 m) no nordeste; jardim zen a sudoeste; arsenal a sudeste |
| Vale do Bambu (SW) | −45..−18; 0..45 | a parte selvagem, para emboscadas: bambuzais sólidos formam 3 caminhos (superior rápido e aberto, central sinuoso, trecho denso no noroeste com vielas estreitas); **riacho** z 25..28,5 com leito a −1,2 m sob uma ponte de madeira; casa do jardineiro com o panda |
| Santuário Ancestral (NW) | −45..−18; −45..0 | pátio baixo (pavilhões do sino e do tambor, estela, leões); **escadaria** de 3 m até o **terraço** (pátio do incenso, templo com 3 níveis de telhado, gongo); **cripta** dentro do terraço (túmulos, pilares); caminho leste ao nível do chão, vigiado da borda do terraço |

Muro externo: 4,5 m, em reboco, descendo até a base do chão (o riacho entra nele).

## Portões entre setores (rotas principais)

Todos os muros internos têm **4 m** de altura e 0,6 m de espessura. Portão "portal" (com telhado e placa) = 3,2 × 3,2 m; "lua" (redondo) = 3,2 m de largura; "porta" simples = 1,8 × 2,5 m.

| Muro | Portão (posição) | Liga | Placa |
| --- | --- | --- | --- |
| x = −18 | z = −38, portal | Santuário ↔ Bonsai | 松風 |
| x = −18 | z = −10, portal | Santuário ↔ anel | 祖廟 |
| x = −18 | z = 10, portal | Bambu ↔ anel | 竹谷 |
| x = −18 | z = 41, lua | Bambu ↔ Guerreiros | — |
| x = 18 | z = −29, lua | Bonsai ↔ Lago | — |
| x = 18 | z = −10, portal | Lago ↔ anel | 蓮池 |
| x = 18 | z = 13, portal | Lanternas ↔ anel | 燈街 |
| x = 18 | z = 37, portal | Lanternas ↔ Guerreiros | 演武 |
| z = −20 | x = −6, portal; x = 13, porta | Bonsai ↔ anel | 盆景 |
| z = 20 | x = 6, portal com folhas laqueadas; x = −12, porta | Guerreiros ↔ anel | 武院 |
| z = 0 (oeste) | x = −36, portal | Santuário ↔ Bambu | 竹林 |
| z = 0 (leste) | x = 31, portal | Lago ↔ Lanternas | 燈籠 |

Portões da Casa Principal (2,4 × 3,0 m), um por setor vizinho, deslocados dos portões dos setores: 龍門 (muro norte, x = 3), 虎門 (muro sul, x = −10,75), 山門 e 春門 (muro oeste, z = −3,5 e 3,5), 月門 e 日門 (muro leste, z = −3,5 e 3,5).

## Rotas alternativas

- **Anel interno da Casa**: atravessar as alas de sala em sala sem cruzar o pátio aberto.
- **Ponte em arco do laguinho** (Bonsai): vem reto do portão do Santuário; "o caminho rápido e exposto".
- **Leito do riacho** (Bambu): andar no leito (−1,2 m) e passar **sob a ponte sem ser visto** ("lower path"), até a casa do jardineiro e o portão lua dos Guerreiros. Escadas suaves (`gentle`) nas duas pontas.
- **Cripta** (Santuário): rota por baixo da luta no terraço, com portas para o pátio baixo e para o caminho leste e escada para o pátio do incenso.
- **Duas pontes para a ilha** do lago (pedra a oeste, madeira a sul).

## Áreas abertas

Pátio da Casa (17 × 17 m, só a cerejeira e lanternas de pedra nos cantos), arena dos Guerreiros, pátio do incenso no terraço, margens do lago.

## Áreas fechadas

Salas da Casa Principal, interior dos pavilhões (ilha, casa de chá, casa dos servidores, sala de música, dojo, templo), cripta, vielas do bambuzal denso, becos do Pátio das Lanternas.

## Cobertura

- **Paredes de papel** (Casa, sala de música, galeria do anel): escondem, mas a bala atravessa perdendo só 5% do dano. Paredes internas de madeira (0,15 m) também são atravessadas.
- Sebes (baixas = cobertura; altas de 2 m = cortam a visão), bonsais em pedestais (cobertura baixa), pedras, bambuzais (sólidos), túmulos da cripta, estela do pátio baixo ("bloqueia a vista escada acima"), sino grande do pavilhão (obstáculo), balcões das bancas, carroça da rua, armaduras (param a bala), suportes de armas (bala atravessa).
- Juncos: escondem quem está atrás, a bala passa.

Ver [[Cover & Combat Spaces]].

## Spawn points

- **A** (5, oeste, olhando +X): pátio baixo do Santuário e Vale do Bambu — (−40, −3,5), (−27,5, −2,4), (−22,4, −16), (−29,6, 2,6), (−24, 7,4).
- **B** (5, leste, olhando −X): margem sul do lago e rua das lanternas — (23,8, −2,6), (36,6, −6,6), (31, 5,2), (26,4, 12,6), (37,4, 13,6).
- **FFA** (28) espalhados por todos os setores, inclusive andar de cima da ilha (3,85 m), Plataforma do Mestre (2,2 m), templo (3,7 m) e terraço (3,2 m). Ver [[Spawn Design]].

13 bonecos de treino (anel, pátio, Grande Salão, ponte do bonsai, varanda e ponte velha do lago, atrás do papel da sala de música, rua das lanternas, arena, Plataforma do Mestre, sob a ponte do bambu, pátio do incenso, cripta).

## Objetivos

Nenhum objetivo de modo. O ponto de interesse central é a **Cereja do Dragão** (coletável sob a cerejeira, em (0, 0,36, 2,1)), que atrai jogadores ao pátio aberto. Ver [[Pickups]] e [[Objectives]].

## Zonas especiais

- **Lagos** rasos (0,6 m no bonsai, 0,8 m no lótus): dá para andar dentro; carpas nadam neles.
- **Riacho** (leito a −1,2 m).
- **Terraço do Santuário** (3 m) e **Plataforma do Mestre** (2 m, limitada para ninguém ver por cima dos muros).

## Objetos interativos

Lanternas que balançam, gongo, sinos, tambores, carrilhão de 5 notas, fonte do dragão que cospe fogo, frutas cortáveis (cerejeira e bancas), 9 carpas (XP e carpa dourada), a cereja coletável e o panda (decorativo). Ids e posições em [[Interactive Objects]]; regras em [[Map Gags]], [[Pickups]], [[Buffs & Debuffs]].

## Fluxo esperado dos jogadores

> [!info]
> Inferência a partir do layout e dos comentários do código.

- Cada setor funciona como uma "sala" com 3–4 saídas; o combate acontece dentro de um setor ou no anel, raramente entre setores.
- O anel é o conector: todo setor tem portão para ele, e a Casa tem um portão para cada lado.
- Pontos de alto valor (ilha do lago, terraço do Santuário, Plataforma do Mestre) atraem disputa, mas têm rotas de flanco (pontes, cripta, escadas).
- A cereja no pátio puxa jogadores para o centro aberto, onde só as alas com paredes de papel oferecem cobertura (atravessável).

## Problemas conhecidos

- A medição de linhas de visão (0,6% contra 11,6% no jardim anterior) vem de `docs/MAPAS.md`; a ferramenta não está no repositório.
- Os comentários do Pátio das Lanternas citam escopetas ("shotguns and ambushes"), mas o jogo não tem escopetas: só o Rifle Padrão, a pistola, a submetralhadora, a faca e a granada (ver [[Weapons]]).
- Tempo de construção alto (~380–480 ms) e ~290–410 mil triângulos visíveis, muito acima da meta antiga de "~50 mil por mapa pequeno" (números de `docs/MAPAS.md`). Pela medição de `client/world/budget.ts` (pior câmera + sombra do sol) é o mapa oficial mais caro: **310 chamadas de desenho e 704.428 triângulos**, perto do teto do editor (400 e 750 mil). Ver [[Performance Rendering]].
- Os bots não pegam a cereja (README do projeto).

## Código relacionado

- `shared/data/mapas/jardim.json` — o mapa: as peças dos setores, muros entre setores, spawns, bonecos, carpas e a cereja (`objetos`), céu oriental (`cupula: oriental`).
- `client/world/catalog/garden.ts` — `muroJardim`, `tampaMuro` e as peças orientais (pavilhões, telhados curvos, pontes, tanques, bambuzais, lanternas...); `client/world/catalog/gardenPieces.ts` — as peças próprias dos setores (cerejeira do dragão com a cereja, fonte do dragão, sinos bianzhong, barracas do mercado com as frutas, sinos e tambores, túmulos, estela, panda, portais e folhas de porta); `client/world/mapLoader.ts` — céu, lanternas do céu e luzes das lanternas; os críticos (carpas/frutas) são juntados em `critters`.
- `client/world/conversao/jardim.ts` e `jardimSetores.ts` — o construtor antigo (`buildDragonGardenMap`) e os construtores dos setores (`buildCasa`, `buildRing`, `buildBonsai`, `buildLago`, `buildLanternas`, `buildGuerreiros`, `buildBambu`, `buildSantuario`) gravados como peças, com os comentários de design.
- `client/world/jardim/kit.ts` — `W`, `MID_X`, `MID_Z`, `HOUSE`, `WALL_H`, `SECTOR`, `gardenWall`, `basin`, `bambooGrove`, `struck`.
- `client/world/jardim/*.ts` — as peças de cada setor que o catálogo usa (`casa`: estantes e a paisagem a nanquim; `bonsai`; `lago`: postes de lanterna e a fonte do dragão; `lanternas`: sinos bianzhong, barracas, cestos, carrinho; `guerreiros`: suportes de armas, bonecos de treino, armaduras; `santuario`: túmulos, sinos, tambor grande, estela, retratos) e um arquivo por elemento (`cereja`, `cerejeira`, `frutas`, `peixes`, `panda`, `luzes`).
- `client/world/oriental.ts` — `pavilion`, `curvedRoof`, `paperWall`, `moonGateWall`, `Lanterns`, `Gong`, `Bell`, `FireBreath`, `seeded`.
- `shared/data/mapas/jardim.json` — `objetos.coletaveis` (a cereja) e `objetos.peixes`.
