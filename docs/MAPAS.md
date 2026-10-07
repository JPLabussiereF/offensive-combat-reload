# Mapas, texturas e desempenho

Guia para quem vai construir mapas e props do Offensive Combat. Existem dois caminhos, e os dois usam a mesma biblioteca de superfícies, os mesmos lotes estáticos e a mesma física:

| Caminho | Quando usar | Onde |
| --- | --- | --- |
| **Dados** (peças do catálogo, montadas pelo `MapBuilder`) | Os mapas oficiais e, com o editor (PF-6), os mapas da comunidade: caixas, paredes com vãos, escadas, telhados, construções, móveis, veículos, piadas e modelos `.glb` | [shared/data/mapas/](../shared/data/mapas/) (formato na seção 0) |
| **Blender → glTF (.glb)** | Qualquer forma que não seja caixa: prédios, props, terreno, arte final | `public/maps/*.glb` (mapa inteiro) ou `public/models/*.glb` (props) |

Para ver um mapa .glb, abra o jogo com `?mapa=`: `http://localhost:5173/?mapa=/maps/arena_teste.glb`.

---

## 0. Mapas como dados

Desde a PF-6 um mapa é um arquivo de dados, não código. Os quatro oficiais estão em `shared/data/mapas/{rua,jardim,halloween,cemiterio}.json`, com uma peça por linha.

### Formato (`MapData`, [shared/mapData.ts](../shared/mapData.ts))

- `formato` (hoje `1`: um arquivo de formato mais novo é recusado), `nome`, `exclusivo` (`zumbi` para um mapa só desse modo) e `cartao` (emoji e cor nos seletores).
- `ambiente`: `ceu` (`atmosfera`: fundo, névoa, hemisfério, sol e as luzes da arma; `cupula`: `nuvens`, `lua` com a direção, ou `oriental`), `celula` (tamanho da célula de lote em metros), `sombra` (meia-largura da sombra do sol, quando o mapa é maior que o padrão), `killY` e `sons` (pássaro, corvo ou uivo: o primeiro depois de `primeiro` segundos, os outros a cada `intervalo`).
- `pecas`: a lista de peças, montadas **em ordem**. Cada uma tem `id` (único no mapa), `tipo`, `p`/`yaw`/`escala` quando o tipo é livre, `params`, `semente` (o estado do gerador de onde a peça começa, nos tipos que sorteiam: a peça monta igual em qualquer lugar da lista), `prop` (o id da piada no `PropBus`, explícito), `coletavel`, `pose` (abaixo), `pai` (o grupo de que a peça faz parte, abaixo) e `nome` (o nome que o editor mostra; sem ele, o `id`).
- `arquivos` (modelos `.glb` que as peças `glb` usam, por `id` e `url`), `spawns` (`a`, `b`, `ffa`), `bonecos` (com `patrulha`), `objetos` (coletáveis, bruxa, ratos e peixes: o que o servidor acompanha, com os ids da rede), `zumbi` (o muro, os surgimentos, o caixão, os chefes e as brechas, no Cemitério) e `servicos` (quantas luzes reais).

`validateMapData` confere tudo isso contra o catálogo e devolve a lista de erros; roda igual no cliente e no servidor.

### Catálogo de peças

[shared/mapCatalog.ts](../shared/mapCatalog.ts) descreve cada tipo de peça (cerca de 110): nome em português e inglês, categoria, parâmetros com tipo, faixa e padrão, como o editor o move (`livre`: posição, giro e escala; `linear`: corre num eixo entre duas pontas, como muros, cercas e escadas; `fixa`: o layout inteiro em coordenadas do mundo), quantos cabem num mapa (uma bruxa, por exemplo) e o prefixo da piada no `PropBus`. Inclui as primitivas do `MapBuilder` (`caixa`, `cilindro`, `parede` com vãos e moldura, `escada`, `telhado`, `sala` do som, `forma`, `brilho`, `luz`), as construções, os kits do Jardim e da Vila, móveis, veículos, piadas e o `glb`.

No cliente, cada tipo tem um adaptador em [client/world/catalog/](../client/world/catalog/) que chama os construtores de sempre (`MapBuilder`, `furniture.ts`, `vehicles.ts`, `halloween.ts`, `oriental.ts`, `jardim/kit.ts`). Um tipo novo precisa do esquema e do adaptador (`client/tests/mapData.test.ts` confere que os dois casam).

### Montagem

[client/world/mapLoader.ts](../client/world/mapLoader.ts): `loadOfficialMap(id)` carrega o JSON oficial (vai no pacote do cliente, para treino e bots funcionarem sem servidor) e `buildMapFromData(data, { ..., modo })` monta as peças em ordem, fecha os sistemas que várias peças compartilham (o brilho, os postes, as abóboras, as lanternas, as luzes reais), desenha o céu e liga os sons. No modo `jogo` a geometria parada é fundida entre peças; no modo `editor` cada peça fica no seu grupo, com os seus colisores, para o editor reconstruí-la sozinha.

### No servidor (PF-6, fase 2)

Online, todo mapa — oficial ou da comunidade — vive no servidor, com as **versões salvas** (tabelas `map` e `map_version`; uma versão nunca muda). A primeira vez que o servidor sobe num banco, ele cria a versão 1 dos quatro oficiais a partir destes JSON (`seedOfficialMaps` em [server/maps.ts](../server/maps.ts); a navmesh do Cemitério vem de `shared/data/navmesh/cemiterio.json`).

- **Salvar** (`POST /api/mapas` cria, `PUT /api/mapas/:id` com `baseVersao` grava uma versão nova): o servidor confere os dados (`validateMapData`), os modelos que o mapa usa (só os do jogo, `/models/...`, ou os enviados, `/api/mapas/arquivos/<sha256>.glb`) e **monta o mapa numa thread própria** ([server/mapWorker.ts](../server/mapWorker.ts), o mesmo carregador do cliente, sem tela): mede o orçamento de desenho (seção 3) e recusa acima de **400 chamadas de desenho ou 750 mil triângulos** (`orcamento_excedido`, com os números), conta os colisores e, num mapa do modo zumbi (`exclusivo: "zumbi"`), gera a navmesh, guardada com a versão.
- **Jogar**: cada sala online joga uma versão; salvar não muda as partidas em andamento, só as novas. O cliente baixa os dados da versão (`GET /api/mapas/:id/versoes/:v`) e os guarda em memória e no IndexedDB. Treino e bots continuam usando os JSON do pacote.
- **Modelos .glb** (`POST /api/mapas/arquivos`, corpo `model/gltf-binary`): até **10 MB**, glTF 2.0 legível, tudo dentro do arquivo (nenhuma URI para fora), só as extensões que o jogo carrega (sem Draco, sem meshopt, sem AVIF), texturas até **2048 px**, até 2000 nós. O arquivo fica guardado pelo SHA-256 (em `MAPAS_DIR`, padrão `./dados/mapas`; no Docker, o volume `oc-mapas`).

O editor no jogo (fase 3, abaixo) e a aba Mapas da tela inicial (fase 4, abaixo) usam essas rotas; a lista completa está em `Game-Vault/13 - Backend & Services/APIs.md`.

### Aba Mapas (PF-6, fase 4)

Na tela inicial, logado: abas **Oficiais** e **Comunidade**, busca por nome ou por autor, ordem por mais jogados ou mais recentes e, para admin e moderador, **Mostrar ocultos**. Cada cartão (nome, emoji e cor da versão atual) tem **Jogar** (online, no modo escolhido; um mapa exclusivo do zumbi só no zumbi), **Contra bots** e **Campo de tiro** (só mapas abertos: o jogo baixa a versão atual e monta offline, P43), **Editar** (o dono no seu mapa da comunidade; a equipe nos oficiais), **Duplicar** (qualquer conta: a cópia "Nome (cópia)" é da comunidade e de quem duplicou), **Versões** (com **Restaurar**: as partidas novas passam a usar a versão escolhida), **Ocultar**/**Desocultar** (equipe) e **Excluir** (o dono no seu; a equipe em qualquer um). Os 4 oficiais originais (`rua`, `jardim`, `halloween`, `cemiterio`) **não são apagados nem ocultados** por ninguém (P44, P45: o servidor responde `403 mapa_protegido` e a tela não mostra os botões), porque o mapa padrão e a entrada rápida dependem deles; continuam editáveis e restauráveis. **+ Novo mapa** abre o editor num mapa em branco. Na aba Jogar, o filtro online mostra os oficiais do servidor e os mapas das salas abertas. Código: [client/ui/maps.ts](../client/ui/maps.ts) e [client/ui/mapsRules.ts](../client/ui/mapsRules.ts).

### Pose de uma peça (`Peca.pose`, P32)

O gizmo do editor move e gira **qualquer** peça em **qualquer** ângulo, inclusive as `linear` e `fixa` (muros, telhados, setores), cujo lugar está nos parâmetros. Para isso a peça ganha uma **pose**: `{ p: [x, y, z], r: [x, y, z] }`, um giro (Euler XYZ, radianos) seguido de um deslocamento. A peça é montada onde os parâmetros dizem (o "referencial dela") e tudo o que ela faz é levado pela pose ([client/world/pose.ts](../client/world/pose.ts)):

- a geometria parada entra nos lotes já transformada (`MapBuilder.pose`);
- os colisores, criados por qualquer caminho, são movidos depois (`poseColliders`);
- uma **sala** do som girada guarda a caixa no referencial dela e a matriz mundo→sala (`RoomVolume.local`): o som testa o ponto dentro da caixa girada, não na caixa alinhada em volta dela; uma caixa `ROOM_` girada num `.glb` (ou o `.glb` posto com giro) também;
- um **vão** guarda os números no referencial da parede e a matriz da parede (`WallOpening.pose`; `openingCenter` dá o centro no mundo);
- os objetos da peça ficam num grupo que a pose carrega, e o que ela entrega aos sistemas do mapa atravessa o referencial ([client/world/catalog/posed.ts](../client/world/catalog/posed.ts)): luzes, partículas, sons, os pés e ouvidos que as piadas olham, quem atirou, coletáveis, a poção, o cachorro e o que um tiro ou a faca acertam. Posições que vêm dos dados (o biscoito, a cereja, as voltas dos peixes) entram pelo `ctx.local`.

- as **lanternas de papel** entram na lista de luzes da noite do mapa inteiro levadas pela pose (`Services.lanternSpots`: as luzes e os halos acompanham o balanço de cada lanterna onde a pose a pôs), e o **buraco de um lago** (`tanque`) entra em `holes` como a caixa em volta do retângulo girado (P42).

Uma peça **sem** pose monta exatamente como antes (o golden dos 4 oficiais e o hash da navmesh não mudam). Uma peça `livre` só ganha pose quando é inclinada: movida e girada em torno do eixo vertical, continua só com `p`, `yaw` e `escala`. Os recortes de `holes` só valem para o chão montado depois (a laje do Jardim guarda os dela nos parâmetros, `furos`): mover um lago não abre um buraco novo no chão já salvo.

### Grupos (`Peca.pai`, PF-6 Revisions 01)

A Hierarchy do editor organiza as peças em **grupos**, como o Unity. Um grupo é uma peça do tipo `grupo` (categoria `organizacao`, sem parâmetros), que **não monta nada**: a pose dele é o referencial das peças que o nomeiam no campo **`pai`** (opcional). Grupos podem ficar dentro de grupos.

```json
{ "id": "garagem", "tipo": "grupo", "nome": "Garagem", "params": {}, "pose": { "p": [3, 0, -2], "r": [0, 0.6, 0] } },
{ "id": "carro-1", "tipo": "carro", "pai": "garagem", "p": [0, 0, 1], "yaw": 0.5, "params": { "cor": 14169130 } }
```

- **Onde a peça monta:** as poses dos grupos, de fora para dentro, e depois a da peça (`worldPoseMatrix` em [client/world/pose.ts](../client/world/pose.ts)). Dentro do grupo a peça continua como sempre: uma `livre` no seu `p`/`yaw`/`escala`, as outras onde os parâmetros dizem, com a pose dela por cima; o grupo leva tudo (geometria, colisores, salas, vãos, objetos) pelo mesmo caminho da pose. O carregador do jogo, o do editor e o do servidor (que monta o mapa ao salvar) são o mesmo, então os três montam igual.
- **Regras** (`validateMapData`, no cliente e no servidor): `pai` é o `id` de uma peça `grupo` do mapa, nunca a própria peça, sem ciclos e com no máximo **16 níveis** (`MAX_GROUP_DEPTH`). `nome` tem de 1 a 60 caracteres.
- **A ordem de `pecas` continua sendo a ordem de montagem.** A Hierarchy mostra os filhos de um grupo na ordem em que aparecem na lista; reordenar na Hierarchy muda essa ordem.
- **Um mapa sem grupos monta exatamente como antes** (golden e navmesh iguais), e um grupo que não move nada (sem pose) deixa os filhos onde estavam.
- **Os lugares do servidor** (`objetos.bruxa`, os ratos e os coletáveis) continuam em coordenadas do mundo: o editor os move junto quando um grupo leva a bruxa, um rato ou uma peça com coletável.

### Editor no jogo (PF-6, fase 3)

[client/editor/](../client/editor/) roda no lugar de uma partida (sem jogador, HUD nem entrada do jogo); sair recarrega a página. Abre pela aba Mapas da tela inicial: **Editar** (a versão atual do mapa) ou **+ Novo mapa**.

- **Câmera** (a do Scene View do Unity): botão direito segurado + WASD voa e Q/E descem e sobem (Shift acelera, a roda com o botão direito muda a velocidade); Alt + botão esquerdo orbita em volta do meio da seleção (ou do ponto à frente); o botão do meio arrasta a vista; a roda aproxima na direção do cursor; F (e o duplo clique na Hierarquia) enquadra a seleção. O gizmo de orientação no canto da Cena dá as vistas de cima, de frente e de lado e alterna perspectiva e ortográfica.
- **Janela no estilo do Unity** (Revisions 01): toolbar em cima (desfazer e refazer; mover, girar e escalar; **▶ Play**, que por enquanto abre o teste do mapa, e Pause e Stop, desligados; Centralizar, Duplicar, Apagar; **Layout ▾ → Restaurar layout padrão**; Salvar e Sair), os painéis no meio e a barra de status embaixo (orçamento, mensagens, atalhos). Os painéis **Hierarquia**, **Cena**, **Inspetor** e **Projeto** são abas encaixáveis: arraste uma aba para o meio de outro painel (empilha como abas) ou para uma borda (divide ao lado, em cima ou embaixo); arraste as bordas entre painéis para redimensionar; o layout fica guardado no navegador.
- **Selecionar e mexer**: clique numa peça ou marcador (Ctrl ou Shift soma ou tira peças da seleção), ou arraste uma caixa na cena (pega as peças que encostam nela; Shift soma, Ctrl alterna); Ctrl+A seleciona tudo. Ferramentas como no Unity: Q mão (arrasta a vista), W move, E gira, R escala (só as peças com `escala`, e grupos), T retângulo (estica caixas, salas e colisores; escala o resto pelos cantos; move o que não escala). O encaixe é livre: segure Ctrl para andar em passos de 0,5 m e 15°, ou ligue o botão **Grade** (os passos mudam no menu ao lado). **Pivô/Centro** põe o gizmo na peça ativa ou no meio da seleção (o ponto de giro e escala); **Global/Local**, nos eixos do mundo ou da peça. Ctrl+Z desfaz, Ctrl+Y e Ctrl+Shift+Z refazem, Ctrl+D duplica, Ctrl+C e Ctrl+V copiam e colam (onde o mouse aponta na cena, ou no mesmo lugar com 1 m de deslocamento), Delete apaga, Esc tira a seleção. Atalhos não disparam com um campo de texto em foco. Cada edição reconstrói só as peças mexidas (um grupo reconstrói os filhos). Mover a bruxa, um rato gigante ou uma peça com coletável leva junto o lugar dele em `objetos`.
- **Hierarquia**: as peças em árvore (os grupos com os filhos, na ordem do mapa) e, no fim, os marcadores. "+" cria um **grupo vazio** ou **agrupa a seleção** (Ctrl+G: o grupo nasce no meio dela). Arraste linhas para o meio de um grupo (entra), para a borda de cima ou de baixo de uma linha (antes ou depois dela) ou para o espaço vazio (sai de todos os grupos); as peças não saem do lugar no mundo. F2 renomeia (o duplo clique enquadra a peça na cena); a seta abre e fecha o grupo; a busca mostra as peças que batem. Mover, girar ou escalar um grupo leva os filhos; escalar espalha os filhos a partir do grupo e aumenta o que tem `escala` (o resto só se move). Duplicar e apagar um grupo levam os filhos.
- **Pontas e vãos**: muros, paredes, cercas, sebes, corrimãos, a ponte e o varal de lanternas mostram bolinhas nas pontas e nos lados de cada vão; arrastar uma desliza no eixo da peça. "+ vão" abre uma porta no meio da parede (ou uma brecha de 2 m na cerca).
- **Projeto** (a paleta, em lista até ganhar miniaturas): os tipos do catálogo por categoria, com busca; uma peça nova cai no meio da tela, copiando o primeiro exemplo do tipo nos mapas oficiais (ou os padrões do esquema). Também os marcadores (spawns A, B e livres, bonecos, cereja, biscoito, rato, peixe; no modo zumbi, surgimentos e brechas) e a **importação de .glb** do computador (até 10 MB, enviado ao servidor e guardado pelo SHA-256; a peça `glb` mostra o modelo como o jogo).
- **Inspetor**: o **nome** da peça, o componente **Transform** (posição, rotação em graus e escala, no referencial do grupo; arrastar a letra X, Y ou Z muda o valor, Shift mais rápido; "Tirar a pose" volta a peça ao lugar dos parâmetros) e o formulário do tipo gerado pelo esquema (semente, piada, coletável e cada parâmetro). Com várias peças, os campos em comum: o Transform mostra o valor quando é igual em todas (traço quando difere) e a edição vale para cada uma; os parâmetros aparecem quando todas são do mesmo tipo. Também o formulário do marcador ou, sem seleção, os do mapa (killY, célula, sombra, céu, atmosfera e sons em JSON, luzes reais, "criar os dados do modo zumbi").
- **Desenho em lotes** (P46): as peças que não estão selecionadas são desenhadas juntas, como no jogo (no Jardim, cerca de 350 chamadas de desenho por quadro em vez de 2.700); a peça selecionada (e o que está dentro de um grupo selecionado) sai do lote enquanto está selecionada.
- **Orçamento** (embaixo): um pouco depois de cada edição o mapa é montado de novo **como o jogo o monta** (lotes entre peças), fora da tela, e medido pela mesma função do servidor; acima de 400 chamadas ou 750 mil triângulos (ou com dados inválidos) Salvar fica desligado e a barra diz o que passou.
- **Rascunho automático** (P40): cada edição grava o rascunho no IndexedDB (banco `oc-mapas`, store `rascunhos`, com a data e a versão de onde veio). Ao abrir um mapa com rascunho mais novo que a versão atual, o editor pergunta se quer recuperar; recuperado, ele salva sobre a versão de onde veio (se outra foi salva depois, cai no 409). Salvar com sucesso ou sair pelo botão Sair apaga o rascunho.
- **Testar** grava o rascunho e recarrega a página no **treino** sobre ele ou, num mapa exclusivo do zumbi, na **partida de zumbi sozinho contra a horda** (P41); "Sair para o início" volta ao editor no mesmo rascunho.
- **Salvar**: nome, emoji, cor, aberto ou exclusivo do zumbi e, num mapa novo, oficial (só admin e moderador) ou comunidade. Os dados são conferidos aqui (`validateMapData`) e no servidor; um mapa existente vai com a versão em que foi aberto (`baseVersao`). Se alguém salvou antes (409), nada é salvo e o diálogo oferece **Salvar como nova versão mesmo assim** (envia de novo sobre a versão atual; a outra fica no histórico) ou **Abrir a versão atual** (descarta as edições e reabre o editor nela) (P39). Orçamento estourado e dados inválidos mostram os números e a lista de erros do servidor.

### Golden e conversão

Os mapas feitos em código foram convertidos uma vez, sem perder nada: `bun tools/snapshot-mapas.ts` gravou, do código original, o retrato de cada mapa (`shared/data/mapas/<id>.golden.json`: colisores, piadas, vãos, salas, spawns, bonecos, céu, lotes e objetos da cena); `bun tools/converter-mapas.ts` roda os construtores antigos com cada chamada gravada como peça ([client/world/conversao/](../client/world/conversao/)), escreve o JSON e confere com o golden. `client/tests/mapConversion.test.ts` monta os quatro JSON e compara com o golden (tolerância de 1e-6). **O JSON é a fonte da verdade**; só regrave o golden quando um mapa mudar de propósito.

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

### Paredes com portas e janelas

`b.wall(...)` recebe os vãos como `[início, fim, base, topo]` e **aceita vãos empilhados**, como uma porta sob uma janela ou janelas nos dois andares. A parede é cortada em colunas nas bordas de cada vão, e cada coluna fica maciça em tudo, menos nos vãos que a cobrem. Com a opção `frame`, cada vão ganha moldura (e peitoril nas janelas) sem estreitar o buraco. A textura usa coordenadas do mundo, então tábuas e tijolos continuam de um pedaço para o outro.

Regras de medida que o jogo checa automaticamente:
- **Porta:** pelo menos **1,6 m** de largura e **2,3 m** de altura. O jogador é um cilindro de 0,7 m por 1,8 m.
- **Janela do térreo** que deve dar para atravessar pulando agachado: peitoril a até **0,9 m** e topo a **2,3 m** ou mais.
- Todo vão fica registrado em `map.openings`. O teste de estrutura passa um raio por cada vão e tenta atravessar cada porta andando.

### Salas para o som

O som sabe se um lugar é fechado pelas **salas marcadas à mão**: a peça `sala` (`b.room(min, max, grau)` no `MapBuilder`) registra uma caixa alinhada aos eixos, do piso ao teto e por dentro das paredes. Dentro dela, os sons (tiros, passos, granadas, explosões) ficam levemente abafados e com eco de sala; fora, soam claros e com um eco aberto curto.

- **Grau de fechamento** de 0 a 1. Use **1** para sala fechada (portas e janelas não contam como abertura). Use **0,3 a 0,6** para lugares cobertos e abertos dos lados. Os mapas atuais usam: **0,6** com um lado aberto (garagem, barraca de tiro ao alvo), **0,5** com dois (portões cobertos do Jardim), **0,4** com três (varandas, alpendres, sacadas, barracas de feira) e **0,3** com os quatro (pavilhões, coreto, mirante).
- Onde caixas se sobrepõem vale o **maior grau**, então a caixa de uma varanda pode encostar na da casa sem problema.
- Pode marcar a casa inteira numa caixa só quando todos os cômodos são fechados.
- Fora de toda caixa, o jogo mede o lugar com raios (teto até 8 m e só com paredes em pelo menos 3 de 6 direções). Isso é uma **reserva**: marque todo lugar coberto onde se pode entrar.
- Helpers que constroem lugares cobertos já marcam a própria caixa: `pavilion` (cada andar, sacadas e alpendre), `ting`, `gateway`, `house` da Vila Assombrada e a casa da Rua.

Para a oclusão (sons atrás de obstáculos), cada colisor pesa pelo material, pela espessura atravessada (cheia a partir de 0,3 m) e pelo tipo. Carros e troncos de árvore abafam pouco: marque com `occluder: 'vehicle'` ou `'trunk'` (opção de `b.box`/`b.cylinder`, último argumento de `cuboidCollider`). Hoje são `vehicle`: carros, van, caminhão de sorvete, carrinhos de bate-bate e trailers de circo.

- A espessura vem dos dois raios da oclusão (ida e volta) quando os dois acertam o **mesmo** colisor. Quando acertam colisores diferentes, cada um conta com **espessura cheia** (vale para obstáculos feitos de várias caixas, como o caminhão de sorvete: separe em colisores só quando precisar).
- O abafamento leve e o eco de um som seguem o **lugar de onde o som sai** (a sala onde ele está); os sons do próprio jogador seguem o lugar onde ele está.

### Peças orientais

[client/world/oriental.ts](../client/world/oriental.ts) tem as peças do "Jardim do Dragão" ([shared/data/mapas/jardim.json](../shared/data/mapas/jardim.json), com as peças próprias de cada setor em [client/world/jardim/](../client/world/jardim/) e [client/world/catalog/gardenPieces.ts](../client/world/catalog/gardenPieces.ts)), prontas para outros mapas:

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

Um mapa pode ter coletáveis (`GameMap.pickups`): a cereja do pátio ([client/world/jardim/cereja.ts](../client/world/jardim/cereja.ts)) é um. A posição de cada um fica em `objetos.coletaveis` nos dados do mapa, porque o servidor confere a coleta online (lendo a versão da sala); o efeito e os tempos ficam em `CHERRY` ([shared/constants.ts](../shared/constants.ts)). O mapa só mostra o objeto (`take` e `restore`); quem pega e o que acontece é decidido pelo jogo ([client/main.ts](../client/main.ts)) e, online, pelo servidor.

#### Bichos e frutas (tiro e faca sem colisor)

Coisas pequenas que tiro e faca acertam sem ter colisor próprio ficam em `GameMap.critters` (`shot` e `stab`); elas não param a bala. No Jardim do Dragão são:
- **As frutas** ([client/world/jardim/frutas.ts](../client/world/jardim/frutas.ts)): as cerejas da cerejeira ([cerejeira.ts](../client/world/jardim/cerejeira.ts), `HangingCherries`) e as frutas das bancas do mercado (`StallFruit`). Com tiro ou facada a fruta é **cortada ao meio**: as duas metades (casca por fora, polpa no corte) se separam com um espirro de suco, caem, ficam um tempo no chão (ou no balcão) e vão sumindo; a fruta nasce de novo depois de 40 s. Sincronizado online como `fruta:N` e `banca:N`.
- **As carpas** ([client/world/jardim/peixes.ts](../client/world/jardim/peixes.ts)): ficam em `objetos.peixes` nos dados do mapa e as regras em `KOI` ([shared/constants.ts](../shared/constants.ts)). Nadam no relógio do jogo (online, o do servidor: todos veem no mesmo lugar). Abatida, a carpa vira de barriga para cima e some; volta em 25–45 s, com 5% de chance de ser uma **carpa dourada**, que brilha. Online, o servidor confere (viva, atirador perto) e dá o XP da conta (1, ou 100 pela dourada); a dourada também deixa a mira mais precisa (dispersão ×0,5, recuo ×0,6) por 60 s ou até a morte. O jogo diz ao mapa quem morre e como volta (`GameMap.fish`).

### Peças de Halloween

[client/world/halloween.ts](../client/world/halloween.ts) tem as peças da "Vila Assombrada" ([client/world/hauntedTown.ts](../client/world/hauntedTown.ts)):

- `nightSky` (cúpula em degradê, estrelas e a lua cheia), `GroundMist` (neblina rasteira, fraca para não esconder ninguém), `Glow` (janelas, velas e rostos de abóbora acesos fundidos em uma malha só).
- `deadTree` (árvore seca com galhos em garra), `tombstone` + `epitaph` (lápides com epitáfio), `signBoard`, `hedge` (cerca viva), `gateArch` (portão com pilares e placa), `slabWithHoles` (laje com buracos, usada no chão com as escadas do esgoto).
- `ironFence` e `blocker`: o colisor só para jogadores e granadas. As balas passam entre as grades, e a malha dos bots continua desviando delas.
- Animados e sincronizados: `GraveGhost` ("fantasma"), `Bell` ("sinocapela", "sinoparque"), `Pumpkins` ("abobora:N"), `LampPosts` ("poste:N"), `Cauldron` ("caldeirao"), `Scarecrows` ("espantalho:N"), `TargetRow` ("alvo:N"), `GiantPumpkin` ("aboboragigante"), `GrandfatherClock` ("relogio"), `GlowShrooms` ("cogumelo:N"). Eles contam o que aconteceu (`activations`, `rings`, `stirs`, `clears`, `laughs`, `hour`, `lit(i)`), que é a base para os segredos do documento de design.
- Visuais: `FerrisWheel`, `Bonfire`, `Bats`, `SpeechBubble` (balão de fala sobre um objeto), `bumperCarGeometry` (carrinho de bate-bate), `circusTrailer` (trailer de circo com placa).
- `LightPool`: um número fixo de luzes pontuais (a Vila usa 10) vai para os pontos de luz (`LightSpot`: velas, lampiões, lareira) mais próximos da câmera, com fade. Os shaders nunca recompilam e o custo não cresce com o número de velas. Lampiões apagados a tiro saem da lista.
- `GiantRat`: o rato da rua sem saída do esgoto. Conta os nossos acertos (tiro = 1, facada = `RAT.stab`) e avisa quando o derrubamos (`GameMap.rewards.ratDown`). Offline o jogo decide na hora; online, o servidor confere (`objetos.ratos` nos dados do mapa: vivo e o atirador perto) e dá a humanidade (`RAT` em [shared/constants.ts](../shared/constants.ts): +50 de vida máxima até morrer). `GameMap.rats` recebe a morte e a volta.
- `Witch` ("bruxa"): a bruxa da cabana. Mexe o caldeirão, olha para quem chega, dá bronca se levar tiro e gargalha quando alguém bebe a poção. A poção é `GameMap.potion` (`MapPotion`): perto dela a tecla de oprimir mostra "Beber Poção". O efeito é sorteado (`POTION` em [shared/constants.ts](../shared/constants.ts); online pelo servidor, que também aplica o crítico no dano): pato (granadas de pato até morrer, `duck` na mensagem `grenade`), pressa, lerdeza, crítico ou bêbado, os quatro últimos por 60 s. A bruxa fica em `objetos.bruxa` nos dados do mapa (e a peça `bruxa`, uma por mapa).
- `KitchenCabinet` ("armario") e `ScoobyBiscuit`: o armário abre com tiro ou facada, e o biscoito é um coletável (`PICKUPS` com `kind: 'biscoito'`, regras em `BISCUIT`) que só pode ser pego com o armário aberto. Ele enche a vida.
- Faca sem colisor próprio: `GameMap.critters.stab` do mapa tenta o rato, o armário e as abóboras (`Pumpkins.stab`).
- O `PropBus` diz quem disparou cada piada (`PropTrigger`: `local` e a posição de quem atirou). O fantasma usa isso para sair virado para o atirador, e a barraca de tiro, para dar a mira afiada (`GameMap.rewards.aimBonus`) só a quem derrubou o último alvo.

Os ids das piadas precisam ser **minúsculos e sem acento** (`/^[a-z]{1,16}(:\d{1,3})?$/`). O servidor descarta os outros.

A Vila é noturna: devolve `atmosphere` (lua azulada, névoa roxa) e `shadowExtent`, porque tem 120 × 110 m e a sombra padrão não cobre o mapa todo. Ela usa células de 60 m no `MapBuilder`.

### Móveis e objetos

[client/world/furniture.ts](../client/world/furniture.ts) tem os objetos feitos de várias peças coloridas que vão para os lotes estáticos (sem chamada de desenho extra), cada um com um colisor simples: `crate` (caixote com quinas e travessas), `hayBale` (fardo de feno amarrado), `barrel` (barril com aros), `bench` (banco de praça), `sofa`, `table`, `chair`, `candle` (vela com cera, pavio e castiçal), `bed`, `coffin`, `pew` (banco de igreja), `suitOfArmor`, `toyChest`, `rockingHorse`, `bookshelf` (estante com livros de alturas, espessuras e cores variadas) e `potion` (frascos com o líquido aceso). `Place` monta qualquer objeto novo no referencial dele (x para a direita, z para a frente), já girado e posicionado.

### Mapas por sessão

Cada sessão online leva o id e a versão do mapa; as sessões abrem sob demanda (`play`: uma sala da versão atual com vaga, ou uma nova) e fecham vazias. Um mapa novo entra pelo servidor (`POST /api/mapas`, acima) e fica jogável online na hora. Um mapa oficial novo **no pacote do cliente** (para treino e bots offline): o id em `OFFICIAL_MAPS` ([shared/maps.ts](../shared/maps.ts)), o arquivo `shared/data/mapas/<id>.json` (seção 0), `OFFICIAL` e `OFFICIAL_INFO` em [client/world/mapLoader.ts](../client/world/mapLoader.ts); o servidor cria a versão 1 sozinho. Com o editor da PF-6 (fase 3, seção 0), os mapas são criados no jogo.

### Piadas do cenário sincronizadas

Hidrantes, o caminhão de sorvete, os flamingos, as lanternas, o gongo e o dragão são registrados com `props.register('nome:indice', efeito)`, e isso devolve o `onShot` do colisor. Online, disparar uma piada avisa o servidor, que repassa aos outros, e todos veem o mesmo. Para criar uma nova, é o mesmo padrão; veja o adaptador `hidrante` em [client/world/catalog/objects.ts](../client/world/catalog/objects.ts) e [hydrant.ts](../client/world/hydrant.ts). No mapa, cada piada guarda o seu id na peça (`prop`).

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
- **Prop dentro de um mapa:** liste o arquivo em `arquivos` e use a peça `glb`:

```json
"arquivos": [{ "id": "casinha_cachorro", "url": "/models/casinha_cachorro.glb" }],
{ "id": "glb-1", "tipo": "glb", "p": [36, 0, 14.5], "yaw": 3.14159, "escala": 1.6, "params": { "arquivo": "casinha_cachorro" } }
```

Veja o exemplo em [shared/data/mapas/rua.json](../shared/data/mapas/rua.json), procurando `casinha_cachorro` (o adaptador é [client/world/catalog/glb.ts](../client/world/catalog/glb.ts), que chama `addGltfToMap`).

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

### Orçamento por mapa (PF-6)

Um mapa pode custar no máximo **400 chamadas de desenho e 750 mil triângulos** por quadro (`MAP_BUDGET`); no editor, um mapa acima disso não salva e a tela diz o que passou. [client/world/budget.ts](../client/world/budget.ts) mede sem placa de vídeo, como o F3 contaria: a pior câmera de amostra (em cada spawn e numa grade sobre o mapa, olhando em 8 direções) mais a passada de sombra do sol. Os oficiais hoje:

| Mapa | Chamadas de desenho | Triângulos |
| --- | --- | --- |
| Rua dos Vizinhos | 164 | 115.670 |
| Jardim do Dragão | 310 | 704.428 |
| Vila Assombrada | 265 | 642.603 |
| Cemitério da Capela | 80 | 122.322 |

### Metas antigas (seção 3 do documento de design)

Antes do orçamento da PF-6, as metas eram estas (medidas à mão, com o F3):

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
4. **Respeite o orçamento** (400 chamadas de desenho e 750 mil triângulos no pior ponto, contando a sombra). Props repetidos (caixotes, cercas) devem ter poucos polígonos.
5. **Otimize o .glb antes de colocar no jogo:**

```bash
bunx @gltf-transform/cli optimize entrada.glb public/maps/saida.glb --compress meshopt --texture-compress ktx2
```

   Isso funde vértices repetidos, comprime a malha (Meshopt, que o jogo já decodifica) e converte texturas embutidas para KTX2 (esta parte precisa do `toktx` instalado; sem ele, use `--texture-compress webp`).

6. **Sombras pré-calculadas (lightmaps)**, previstas na seção 10 do documento: calcule no Blender em um segundo canal de UV e exporte a imagem junto. O suporte do lado do jogo ainda não está pronto.

### Se o jogo estiver lento

Quase sempre é o navegador desenhando **sem placa de vídeo**. O menu mostra um aviso e o F3 mostra o renderizador (SwiftShader, llvmpipe ou "Basic Render" indicam software). No Chrome ou Edge, ative "Usar aceleração gráfica quando disponível" em `chrome://settings/system` e reinicie. Medido nesta máquina: **~1.700 FPS** com a RTX 3070 Ti contra **5–10 FPS** por software, com o mesmo mapa.
