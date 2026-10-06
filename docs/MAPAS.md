# Mapas, texturas e desempenho

Guia para quem vai construir mapas e props do Offensive Combat. Existem dois caminhos, e os dois usam a mesma biblioteca de superfícies, os mesmos lotes estáticos e a mesma física:

| Caminho | Quando usar | Onde |
| --- | --- | --- |
| **Código** (`MapBuilder`) | Blockout rápido com caixas, paredes com vãos, escadas e telhados | [client/world/blockoutMap.ts](../client/world/blockoutMap.ts) |
| **Blender → glTF (.glb)** | Qualquer forma que não seja caixa: prédios, props, terreno, arte final | `public/maps/*.glb` (mapa inteiro) ou `public/models/*.glb` (props) |

Para ver um mapa .glb, abra o jogo com `?mapa=`: `http://localhost:5173/?mapa=/maps/arena_teste.glb`.

---

## 1. Texturas

### Como funcionam

Toda superfície estática do mapa usa uma das **superfícies da biblioteca** ([client/world/surfaces.ts](../client/world/surfaces.ts)). Cada superfície tem:

- **um único material** compartilhado pelo mapa todo. A cor de cada peça vem de um *tint* por vértice, então tijolo vermelho e tijolo amarelo são o mesmo material. Isso economiza draw calls.
- **uma textura que se repete a cada N metros.** As UVs são geradas em metros, então a densidade de pixels é igual em qualquer parede, sem mapeamento UV manual.
- **um material de física**, que decide o som de passos e de impacto.

| Superfície | Uso | Repete a cada | Física |
| --- | --- | --- | --- |
| `tijolo` | muros, prédios | 1,6 m | concreto |
| `reboco` | fachadas de casa (lambri horizontal) | 1,8 m | concreto |
| `madeira` | cercas, escadas, caixotes | 1,2 m | madeira |
| `piso` | assoalho | 1,8 m | madeira |
| `telhado` | telhas | 1,2 m | madeira |
| `concreto` | barreiras, bordas, lajes | 2 m | concreto |
| `calcada` | calçadas | 2 m | concreto |
| `asfalto` | rua | 3 m | concreto |
| `grama` | chão | 2,5 m | grama |
| `azulejo` | piscina, banheiros | 1 m | azulejo |
| `metal` | carros, placas, hidrantes | 2 m | metal |
| `vidro` | vidros | 2 m | vidro |
| `papel` | paredes de papel (shoji), com a treliça de madeira pintada | 1,8 m | papel |
| `pedra` | lajotas de jardim, caminhos, pedestais | 2,4 m | concreto |
| `folhagem` | copas de árvore, arbustos, folhas de bambu | 1,1 m | grama |
| `casca` | troncos e galhos | 0,9 m | madeira |
| `feno` | fardos de feno, palha | 0,8 m | grama |
| `tecido` | sofás, colchões, cobertores | 0,5 m | madeira |
| `pintura` | cor lisa, sem textura | — | concreto |

Hoje as texturas são **procedurais**, pintadas em canvas no carregamento ([client/world/textures.ts](../client/world/textures.ts)), como placeholder no estilo "pintado à mão". Elas são claras e quase sem cor de propósito: o tint dá o matiz.

### Trocar por uma textura de verdade (sem mexer em código)

1. Coloque o arquivo em `public/textures/` (por exemplo `tijolo.jpg`).
2. Registre em [public/textures/manifest.json](../public/textures/manifest.json):

```json
{
  "tijolo": { "arquivo": "tijolo.jpg", "metros": 1.6 },
  "telhado": { "arquivo": "telhado.ktx2", "metros": 1.2, "tingir": false }
}
```

3. Recarregue a página. Todas as paredes de tijolo do jogo usam o arquivo novo.

| Campo | Significado |
| --- | --- |
| `arquivo` | Nome do arquivo em `public/textures/`: `.png`, `.jpg`, `.webp` ou `.ktx2` |
| `metros` | Quantos metros uma repetição cobre (opcional; o padrão é o da tabela acima) |
| `tingir` | `false` quando a textura já tem as cores finais: ignora o tint das peças. O padrão `true` multiplica a textura pelo tint, e nesse caso use texturas claras ou em tons de cinza |

**Regras para a textura:**
- Deve ser **repetível** (seamless): a borda direita continua na esquerda e a de cima na de baixo.
- Tamanho em **potência de 2**: 512×512 para detalhes pequenos, 1024×1024 no máximo.
- Estilo **pintado à mão**, com pouco ruído fotográfico (seção 2 do documento de design): o inimigo precisa se destacar do fundo.
- Para produção, prefira **KTX2**: ocupa de 4 a 6 vezes menos memória de vídeo que PNG/JPG. Para converter, use o `toktx` do [KTX-Software](https://github.com/KhronosGroup/KTX-Software):
  `toktx --t2 --encode etc1s --genmipmap tijolo.ktx2 tijolo.png`. O transcodificador já está em `public/basis/`.

### Textura exclusiva de um objeto

Para um objeto com arte própria (uma placa com letreiro, um carro modelado, um mural), não use a biblioteca. No Blender, dê ao objeto um material com **Image Texture** e faça o mapeamento UV normalmente. A textura vai dentro do .glb, o jogo mantém as UVs e só troca o shading para o toon do jogo.

---

### Paredes com portas e janelas (mapas feitos em código)

`b.wall(...)` recebe os vãos como `[início, fim, base, topo]` e **aceita vãos empilhados**, como uma porta sob uma janela ou janelas nos dois andares. A parede é cortada em colunas nas bordas de cada vão, e cada coluna fica maciça em tudo, menos nos vãos que a cobrem. Com a opção `frame`, cada vão ganha moldura (e peitoril nas janelas) sem estreitar o buraco. A textura usa coordenadas do mundo, então tábuas e tijolos continuam de um pedaço para o outro.

Regras de medida que o jogo checa automaticamente:
- **Porta:** pelo menos **1,6 m** de largura e **2,3 m** de altura. O jogador é um cilindro de 0,7 m por 1,8 m.
- **Janela do térreo** que deve dar para atravessar pulando agachado: peitoril a até **0,9 m** e topo a **2,3 m** ou mais.
- Todo vão fica registrado em `map.openings`. O teste de estrutura passa um raio por cada vão e tenta atravessar cada porta andando.

### Salas para o som (mapas feitos em código)

O som sabe se um lugar é fechado pelas **salas marcadas à mão**: `b.room(min, max, grau)` registra uma caixa alinhada aos eixos, do piso ao teto e por dentro das paredes. Dentro dela, os sons (tiros, passos, granadas, explosões) ficam levemente abafados e com eco de sala; fora, soam claros e com um eco aberto curto.

- **Grau de fechamento** de 0 a 1. Use **1** para sala fechada (portas e janelas não contam como abertura). Use **0,3 a 0,6** para lugares cobertos e abertos dos lados. Os mapas atuais usam: **0,6** com um lado aberto (garagem, barraca de tiro ao alvo), **0,5** com dois (portões cobertos do Jardim), **0,4** com três (varandas, alpendres, sacadas, barracas de feira) e **0,3** com os quatro (pavilhões, coreto, mirante).
- Onde caixas se sobrepõem vale o **maior grau**, então a caixa de uma varanda pode encostar na da casa sem problema.
- Pode marcar a casa inteira numa caixa só quando todos os cômodos são fechados.
- Fora de toda caixa, o jogo mede o lugar com raios (teto até 8 m e só com paredes em pelo menos 3 de 6 direções). Isso é uma **reserva**: marque todo lugar coberto onde se pode entrar.
- Helpers que constroem lugares cobertos já marcam a própria caixa: `pavilion` (cada andar, sacadas e alpendre), `ting`, `gateway`, `house` da Vila Assombrada e a casa da Rua.

Para a oclusão (sons atrás de obstáculos), cada colisor pesa pelo material, pela espessura atravessada (cheia a partir de 0,3 m) e pelo tipo. Carros e troncos de árvore abafam pouco: marque com `occluder: 'vehicle'` ou `'trunk'` (opção de `b.box`/`b.cylinder`, último argumento de `cuboidCollider`). Hoje são `vehicle`: carros, van, caminhão de sorvete, carrinhos de bate-bate e trailers de circo.

- A espessura vem dos dois raios da oclusão (ida e volta) quando os dois acertam o **mesmo** colisor. Quando acertam colisores diferentes, cada um conta com **espessura cheia** (vale para obstáculos feitos de várias caixas, como o caminhão de sorvete: separe em colisores só quando precisar).
- O abafamento leve e o eco de um som seguem o **lugar de onde o som sai** (a sala onde ele está); os sons do próprio jogador seguem o lugar onde ele está.

### Peças orientais

[client/world/oriental.ts](../client/world/oriental.ts) tem as peças do "Jardim do Dragão" ([client/world/dragonGarden.ts](../client/world/dragonGarden.ts), com um arquivo por setor em [client/world/jardim/](../client/world/jardim/)), prontas para outros mapas:

- `pavilion(b, spec)`: pavilhão de vários andares. Cada andar escolhe as paredes (`estuque`, `papel` ou `madeira`, inclusive por lado), portas e janelas, varanda com guarda-corpo (com colunas quando avança sobre o chão), beiral de telhas por baixo da laje (`skirt`, o visual de pagode) e escada interna com o vão na laje de cima. O último andar ganha o telhado curvo. Devolve as alturas dos pisos e os pontos para pendurar lanternas.
- `curvedRoof(b, opts)`: telhado chinês côncavo com as pontas levantadas, de um retângulo de beiral até uma cumeeira (telhado de quatro águas), um ponto (pirâmide, com o pináculo dourado) ou outro retângulo (beiral sem topo).
- `paperWall`, `moonGateWall` (portão lua cortado em fatias), `railing`, `column`, `wallCap`.
- Natureza: `rock` (pedra com colisão convexa), `pine` (pinheiro de nuvens; cerejeira com outras cores), `bonsai`, `bamboo`, `stoneLantern`.
- Folhagem: `leafClump` (tufo de folhas: esfera com ondulações suaves, textura `folhagem` e luz embutida, mais escura embaixo), `foliageCrown` (copa: um tufo grande achatado com tufos menores na borda e em cima; só o grande projeta sombra) e `limb` (tronco ou galho afinando, em `casca`). `foliageUnder` acha o ponto mais baixo das folhas sobre um lugar: é dali que as cerejas penduradas saem, sem flutuar. Um atributo `shade` na geometria multiplica o tint (`MapBuilder.addGeometry`).
- `dragonGeometry(caminho, raio, cores)`: dragão em volta de qualquer curva, com cabeça, chifres, bigodes, crista e patas; devolve a posição da boca.
- Animados: `Lanterns` (lanternas penduradas que balançam com tiros), `Gong`, `Bell` (sino de bronze que toca e balança com tiros, afinado numa nota quando se passa uma), `FireBreath`.

Pedras e árvores usam `seeded(semente)`, nunca `Math.random`: a colisão precisa ser igual em todos os clientes da sessão.

[client/world/jardim/kit.ts](../client/world/jardim/kit.ts) junta as peças de nível mais alto: `gardenWall` (muro de jardim com portões: `portal` com telhado e placa, `lua` e `porta`), `inscription` (texto em colunas verticais, como numa estela), `basin` (lago num buraco do chão), `archBridge`, `deck`, `ting` (pavilhão aberto), `bambooGrove` (bambuzal de caules sem copa, que colide como um bloco), `hedge` (arbusto podado: uma massa só de folhas com cantos arredondados e ondulações, mais clara em cima, com raminhos crescendo e flores nos baixos), e props (`crate`, `vase`, `foldingScreen`, `incenseBurner`, `stoneLion` (leão guardião, macho com a bola ou fêmea com o filhote), `lanternString`...), e `struck`, que faz um objeto (os tambores) tocar um som sincronizado quando leva tiro.

#### A noite no "Jardim do Dragão"

O mapa é jogado à noite ([client/world/jardim/luzes.ts](../client/world/jardim/luzes.ts)): `GameMap.atmosphere` troca o céu, a névoa e as luzes da cena e da arma (`applyAtmosphere` em [renderer.ts](../client/render/renderer.ts)). O céu é uma cúpula quase preta, com uma névoa quente no horizonte e poucas estrelas, tomada por **centenas de lanternas de papel subindo** (as de "Enrolados"), de dentro da propriedade e de fora dela, cada uma com a chama acesa embaixo e um halo. Toda lanterna pendurada e de pedra tem um halo, e as **6 mais próximas da câmera viram luzes de verdade** (luzes pontuais que acompanham a câmera, com a chama tremulando). A luz geral é suave e quente, vinda do alto (as lanternas no céu), com um ambiente frio por cima e quente por baixo.

#### Linhas de visão no "Jardim do Dragão"

O mapa é feito para que ninguém leve tiro de longe enquanto oprime um corpo. Regras que valem para mexer nele:
- **Muros entre setores com 4 m.** Nenhum lugar onde se fica de pé pode ter o olho (piso + 1,65 m) acima disso perto de um muro: a Plataforma do Mestre tem piso a 2 m por isso.
- **Portões nunca alinhados** com o portão do outro lado de um pátio (os da Casa Principal ficam deslocados dos portões dos setores do outro lado do anel).
- Nada de corredor reto atravessando o mapa: ruas e becos dobram, e as salas da Casa têm biombos, estantes ou divisórias entre a porta de fora e a do pátio.

Medido com 600 pontos andáveis ao acaso (olho a 1,6 m, peito a 1,2 m): 0,6% dos pares se enxergam a mais de 25 m, contra 11,6% no jardim anterior (80 × 60 m).

#### Coletáveis

Um mapa pode ter coletáveis (`GameMap.pickups`): a cereja do pátio ([client/world/jardim/cereja.ts](../client/world/jardim/cereja.ts)) é um. A posição de cada um fica em `PICKUPS` ([shared/maps.ts](../shared/maps.ts)), porque o servidor confere a coleta online; o efeito e os tempos ficam em `CHERRY` ([shared/constants.ts](../shared/constants.ts)). O mapa só mostra o objeto (`take` e `restore`); quem pega e o que acontece é decidido pelo jogo ([client/main.ts](../client/main.ts)) e, online, pelo servidor.

#### Bichos e frutas (tiro e faca sem colisor)

Coisas pequenas que tiro e faca acertam sem ter colisor próprio ficam em `GameMap.critters` (`shot` e `stab`); elas não param a bala. No Jardim do Dragão são:
- **As frutas** ([client/world/jardim/frutas.ts](../client/world/jardim/frutas.ts)): as cerejas da cerejeira ([cerejeira.ts](../client/world/jardim/cerejeira.ts), `HangingCherries`) e as frutas das bancas do mercado (`StallFruit`). Com tiro ou facada a fruta é **cortada ao meio**: as duas metades (casca por fora, polpa no corte) se separam com um espirro de suco, caem, ficam um tempo no chão (ou no balcão) e vão sumindo; a fruta nasce de novo depois de 40 s. Sincronizado online como `fruta:N` e `banca:N`.
- **As carpas** ([client/world/jardim/peixes.ts](../client/world/jardim/peixes.ts)): ficam em `FISH` ([shared/maps.ts](../shared/maps.ts)) e as regras em `KOI` ([shared/constants.ts](../shared/constants.ts)). Nadam no relógio do jogo (online, o do servidor: todos veem no mesmo lugar). Abatida, a carpa vira de barriga para cima e some; volta em 25–45 s, com 5% de chance de ser uma **carpa dourada**, que brilha. Online, o servidor confere (viva, atirador perto) e dá o XP da conta (1, ou 100 pela dourada); a dourada também deixa a mira mais precisa (dispersão ×0,5, recuo ×0,6) por 60 s ou até a morte. O jogo diz ao mapa quem morre e como volta (`GameMap.fish`).

### Peças de Halloween

[client/world/halloween.ts](../client/world/halloween.ts) tem as peças da "Vila Assombrada" ([client/world/hauntedTown.ts](../client/world/hauntedTown.ts)):

- `nightSky` (cúpula em degradê, estrelas e a lua cheia), `GroundMist` (neblina rasteira, fraca para não esconder ninguém), `Glow` (janelas, velas e rostos de abóbora acesos fundidos em uma malha só).
- `deadTree` (árvore seca com galhos em garra), `tombstone` + `epitaph` (lápides com epitáfio), `signBoard`, `hedge` (cerca viva), `gateArch` (portão com pilares e placa), `slabWithHoles` (laje com buracos, usada no chão com as escadas do esgoto).
- `ironFence` e `blocker`: o colisor só para jogadores e granadas. As balas passam entre as grades, e a malha dos bots continua desviando delas.
- Animados e sincronizados: `GraveGhost` ("fantasma"), `Bell` ("sinocapela", "sinoparque"), `Pumpkins` ("abobora:N"), `LampPosts` ("poste:N"), `Cauldron` ("caldeirao"), `Scarecrows` ("espantalho:N"), `TargetRow` ("alvo:N"), `GiantPumpkin` ("aboboragigante"), `GrandfatherClock` ("relogio"), `GlowShrooms` ("cogumelo:N"). Eles contam o que aconteceu (`activations`, `rings`, `stirs`, `clears`, `laughs`, `hour`, `lit(i)`), que é a base para os segredos do documento de design.
- Visuais: `FerrisWheel`, `Bonfire`, `Bats`, `SpeechBubble` (balão de fala sobre um objeto), `bumperCarGeometry` (carrinho de bate-bate), `circusTrailer` (trailer de circo com placa).
- `LightPool`: um número fixo de luzes pontuais (a Vila usa 10) vai para os pontos de luz (`LightSpot`: velas, lampiões, lareira) mais próximos da câmera, com fade. Os shaders nunca recompilam e o custo não cresce com o número de velas. Lampiões apagados a tiro saem da lista.
- `GiantRat`: o rato da rua sem saída do esgoto. Conta os nossos acertos (tiro = 1, facada = `RAT.stab`) e avisa quando o derrubamos (`GameMap.rewards.ratDown`). Offline o jogo decide na hora; online, o servidor confere (`RATS` em [shared/maps.ts](../shared/maps.ts): vivo e o atirador perto) e dá a humanidade (`RAT` em [shared/constants.ts](../shared/constants.ts): +50 de vida máxima até morrer). `GameMap.rats` recebe a morte e a volta.
- `Witch` ("bruxa"): a bruxa da cabana. Mexe o caldeirão, olha para quem chega, dá bronca se levar tiro e gargalha quando alguém bebe a poção. A poção é `GameMap.potion` (`MapPotion`): perto dela a tecla de oprimir mostra "Beber Poção". O efeito é sorteado (`POTION` em [shared/constants.ts](../shared/constants.ts); online pelo servidor, que também aplica o crítico no dano): pato (granadas de pato até morrer, `duck` na mensagem `grenade`), pressa, lerdeza, crítico ou bêbado, os quatro últimos por 60 s. A bruxa fica em `WITCHES` ([shared/maps.ts](../shared/maps.ts)).
- `KitchenCabinet` ("armario") e `ScoobyBiscuit`: o armário abre com tiro ou facada, e o biscoito é um coletável (`PICKUPS` com `kind: 'biscoito'`, regras em `BISCUIT`) que só pode ser pego com o armário aberto. Ele enche a vida.
- Faca sem colisor próprio: `GameMap.critters.stab` do mapa tenta o rato, o armário e as abóboras (`Pumpkins.stab`).
- O `PropBus` diz quem disparou cada piada (`PropTrigger`: `local` e a posição de quem atirou). O fantasma usa isso para sair virado para o atirador, e a barraca de tiro, para dar a mira afiada (`GameMap.rewards.aimBonus`) só a quem derrubou o último alvo.

Os ids das piadas precisam ser **minúsculos e sem acento** (`/^[a-z]{1,16}(:\d{1,3})?$/`). O servidor descarta os outros.

A Vila é noturna: devolve `atmosphere` (lua azulada, névoa roxa) e `shadowExtent`, porque tem 120 × 110 m e a sombra padrão não cobre o mapa todo. Ela usa células de 60 m no `MapBuilder`.

### Móveis e objetos

[client/world/furniture.ts](../client/world/furniture.ts) tem os objetos feitos de várias peças coloridas que vão para os lotes estáticos (sem chamada de desenho extra), cada um com um colisor simples: `crate` (caixote com quinas e travessas), `hayBale` (fardo de feno amarrado), `barrel` (barril com aros), `bench` (banco de praça), `sofa`, `table`, `chair`, `candle` (vela com cera, pavio e castiçal), `bed`, `coffin`, `pew` (banco de igreja), `suitOfArmor`, `toyChest`, `rockingHorse`, `bookshelf` (estante com livros de alturas, espessuras e cores variadas) e `potion` (frascos com o líquido aceso). `Place` monta qualquer objeto novo no referencial dele (x para a direita, z para a frente), já girado e posicionado.

### Mapas por sessão

Os mapas jogáveis estão em [shared/maps.ts](../shared/maps.ts). Cada sessão online leva o id do mapa, e o servidor mantém uma sessão fixa por mapa. Para adicionar um mapa: registre o id ali, crie o `build...Map` em `client/world/` e ligue o id na escolha do mapa em [client/main.ts](../client/main.ts).

### Piadas do cenário sincronizadas

Hidrantes, o caminhão de sorvete, os flamingos, as lanternas, o gongo e o dragão são registrados com `props.register('nome:indice', efeito)`, e isso devolve o `onShot` do colisor. Online, disparar uma piada avisa o servidor, que repassa aos outros, e todos veem o mesmo. Para criar uma nova, é o mesmo padrão; veja os hidrantes em [blockoutMap.ts](../client/world/blockoutMap.ts) e [hydrant.ts](../client/world/hydrant.ts).

## 2. Blender → .glb

### Escala e orientação

- **1 unidade do Blender = 1 metro.** Jogador: 1,8 m de altura, olhos a 1,65 m, cilindro de 0,35 m de raio.
- O exportador glTF converte Z-up do Blender para Y-up sozinho; deixe **+Y Up** marcado.
- A **frente** de spawns, bonecos e props é o eixo **+Y do Blender**. Com rotação 0, o objeto "olha" para longe de você na vista frontal (Numpad 1).

### Convenções de nome

| Nome do objeto | O que vira no jogo |
| --- | --- |
| `COL_nome` | Colisão invisível, feita de **malha de triângulos** |
| `COL_nome_BOX` | Colisão em **caixa** (a mais barata; use sempre que der) |
| `COL_nome_CONVEX` | Colisão **convexa** (envolve a forma, sem buracos) |
| `SPAWN_A_01`, `SPAWN_B_01`, `SPAWN_FFA_01` | Ponto de nascimento (use um *Empty*). O mata-mata livre (online e contra bots) usa os `SPAWN_FFA_*`; sem eles, usa A + B. Coloque 16 a 20 espalhados. |
| `DUMMY_01` | Boneco de treino |
| `KILLVOLUME` | Cair abaixo da altura deste objeto mata |
| `GAG_LATIDO` (ou outro `GAG_*`) | Gatilho de piada ambiental, ligado no código do mapa |
| `ROOM_nome` | Sala para o som (eco de sala e abafamento leve dentro). Uma caixa do piso ao teto, por dentro das paredes; invisível e sem colisão. Grau na propriedade `fechamento` |
| qualquer nome com `NOCOL` | Visível, sem colisão (folhagem, fios, detalhes pequenos) |

**Materiais:** nomeie `MAT_<superfície>` para usar a biblioteca, por exemplo `MAT_tijolo`, `MAT_telhado`, `MAT_madeira`. A **Base Color** do material vira o tint. O sufixo `.001` que o Blender adiciona em cópias é ignorado. Materiais com outros nomes mantêm a própria textura.

**Colisão automática:** se o arquivo **não** tem nenhum `COL_`, toda malha visível ganha colisão por malha de triângulos. Isso é ótimo para blockout. Quando o mapa amadurecer, crie `COL_` simplificados: a partir do primeiro, **só** eles colidem.

### Propriedades personalizadas (Object Properties → Custom Properties)

| Propriedade | Em | Valores |
| --- | --- | --- |
| `fisica` | malhas e `COL_` | `wood`, `metal`, `concrete`, `grass`, `glass`, `tile`, `paper`: som de passos e impacto. `wood`, `glass` e `paper` são **atravessados por tiros** quando finos (até 40 cm, 10 cm e 10 cm no caminho da bala, veja `penetracao` no JSON da arma; o papel tira só 5% do dano). Cercas, portas e paredes de madeira devem usar `wood`; caixotes grossos param o tiro sozinhos. |
| `nocol` | malhas | `true`: sem colisão |
| `uv_proprio` | malhas com `MAT_` | `true`: usa as UVs do Blender em vez da projeção automática em metros |
| `eixo`, `amplitude`, `velocidade` | `DUMMY_*` | patrulha: `eixo` = `x` ou `z`, `amplitude` em metros, `velocidade` em rad/s |
| `fechamento` | `ROOM_*` | 0 a 1 (padrão 1): 1 sala fechada; 0,3 a 0,6 varanda ou pavilhão aberto dos lados (veja "Salas para o som") |

### Exportação

**File → Export → glTF 2.0 (.glb)** com:
- Format: **glTF Binary (.glb)**
- Include: **Custom Properties** ✔ (sem isso, `fisica`, `eixo` etc. se perdem)
- Transform: **+Y Up** ✔
- Mesh: **Apply Modifiers** ✔, UVs ✔, Normals ✔
- Compression: deixe desligado no Blender e otimize depois (abaixo)

Coloque o arquivo em `public/maps/` (mapa inteiro) ou `public/models/` (prop).

### Usando o arquivo

- **Mapa inteiro:** abra `?mapa=/maps/seu_mapa.glb`. O arquivo precisa de pelo menos um `SPAWN_A_*` (ou `SPAWN_FFA_*`).
- **Prop dentro de um mapa feito em código:**

```ts
const gltf = await gltfLoader(renderer).loadAsync('/models/casinha_cachorro.glb');
addGltfToMap(gltf, b, { position: new THREE.Vector3(36, 0, 14.5), yaw: 0, scale: 1.6 });
```

Veja o exemplo em [blockoutMap.ts](../client/world/blockoutMap.ts), procurando `casinha_cachorro`.

### Exemplos prontos

`bun run exemplos:glb` regenera, a partir de [tools/gerar-props-exemplo.mjs](../tools/gerar-props-exemplo.mjs):
- `public/models/casinha_cachorro.glb`: prop com `MAT_madeira`, `MAT_telhado`, `COL_casinha_BOX` e `GAG_LATIDO` (o cachorro late quando alguém passa).
- `public/maps/arena_teste.glb`: mapa inteiro com chão, muros, plataforma com rampas, caixotes, spawns, bonecos (um patrulhando) e `KILLVOLUME`.

Eles fazem o papel de arquivos exportados do Blender; abra-os no Blender (File → Import → glTF) para ver a estrutura.

---

## 3. Desempenho

### O que o jogo já faz

- **Um material por superfície**, com cor por vértice. A cor não multiplica materiais.
- **Lotes estáticos:** a geometria parada é fundida por material em células de 40 m. Poucos draw calls, e as células fora da câmera não são desenhadas.
- **Colisão simples:** caixas e formas convexas quando possível; malha de triângulos só onde precisa.
- **Escadas:** degraus só visuais, colisão em rampa lisa. Subir e descer é suave e nunca engancha. Lances curtos (até ~1,2 m) ficam com rampa acima de 45° e os bots não sobem: use `{ gentle: true }` (e `stairRun(altura, true)` para o comprimento), que acrescenta degraus.
- **Sombras:** só a luz do sol projeta. O chão recebe mas não projeta. O mapa de sombras é redesenhado a cada quadro na qualidade Alta, a cada 2 na Média e fica desligado na Baixa.
- **Qualidade automática:** reduz a resolução (até 50%) e depois as sombras quando o FPS cai abaixo de 45.

### Metas por mapa (seção 3 do documento de design)

| Item | Meta | "Rua dos Vizinhos" hoje | "Jardim do Dragão" hoje | "Vila Assombrada" hoje |
| --- | --- | --- | --- | --- |
| Draw calls por quadro | < 300 | ~150 com sombras | ~100–250 com sombras | ~75–290 com sombras |
| Triângulos visíveis | < 500 mil | ~50 mil | ~290–410 mil (estáticos: ~290 mil, ~90 mil de folhagem) | ~130–520 mil |
| Tempo de construção do mapa | — | ~50–90 ms | ~380–480 ms | ~400–500 ms |
| Texturas | < 256 MB | 12 texturas procedurais de 512×512 (~16 MB com mipmaps) | as mesmas, mais `papel`, `pedra`, `folhagem` e `casca` | as mesmas |

Aperte **F3** no jogo para ver FPS, draw calls, triângulos, tempo de CPU e a GPU em uso.

### Regras para quem modela

1. **Reutilize superfícies da biblioteca** em vez de criar materiais novos. Cada material diferente custa pelo menos um draw call.
2. **Colisão mais simples que o visual:** uma parede cheia de detalhes colide como `COL_parede_BOX`.
3. **Detalhes pequenos sem colisão** (`NOCOL`): calhas, fios, maçanetas.
4. **Até ~50 mil triângulos por mapa pequeno** nesta fase. Props repetidos (caixotes, cercas) devem ter poucos polígonos.
5. **Otimize o .glb antes de colocar no jogo:**

```bash
bunx @gltf-transform/cli optimize entrada.glb public/maps/saida.glb --compress meshopt --texture-compress ktx2
```

   Isso funde vértices repetidos, comprime a malha (Meshopt, que o jogo já decodifica) e converte texturas embutidas para KTX2 (esta parte precisa do `toktx` instalado; sem ele, use `--texture-compress webp`).

6. **Sombras pré-calculadas (lightmaps)**, previstas na seção 10 do documento: calcule no Blender em um segundo canal de UV e exporte a imagem junto. O suporte do lado do jogo ainda não está pronto.

### Se o jogo estiver lento

Quase sempre é o navegador desenhando **sem placa de vídeo**. O menu mostra um aviso e o F3 mostra o renderizador (SwiftShader, llvmpipe ou "Basic Render" indicam software). No Chrome ou Edge, ative "Usar aceleração gráfica quando disponível" em `chrome://settings/system` e reinicie. Medido nesta máquina: **~1.700 FPS** com a RTX 3070 Ti contra **5–10 FPS** por software, com o mesmo mapa.
