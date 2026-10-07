---
title: Map Editor UI
type: system
status: documented
area: ui
source_paths:
  - client/editor/editor.ts
  - client/editor/dock.ts
  - client/editor/dockLayout.ts
  - client/editor/hierarchy.ts
  - client/editor/inspector.ts
  - client/editor/transformFields.ts
  - client/editor/selection.ts
  - client/editor/sceneCamera.ts
  - client/editor/cameraMath.ts
  - client/editor/viewGizmo.ts
  - client/editor/tools.ts
  - client/editor/gizmo.ts
  - client/editor/shortcuts.ts
  - client/editor/boxSelect.ts
  - client/editor/clipboard.ts
  - client/editor/rectTool.ts
  - client/editor/rectOverlay.ts
  - client/editor/groups.ts
  - client/editor/project.ts
  - client/editor/thumbs.ts
  - client/editor/thumbRenderer.ts
  - client/editor/thumbCache.ts
  - client/editor/thumbQueue.ts
  - client/editor/dropPiece.ts
  - client/editor/playMode.ts
  - client/editor/playHost.ts
  - client/editor/playEmbed.ts
  - client/editor/playBridge.ts
  - client/editor/style.ts
  - client/editor/strings.ts
  - client/tests/editorLayout.test.ts
  - client/tests/editorGroups.test.ts
  - client/tests/editorCamera.test.ts
  - client/tests/editorTools.test.ts
  - client/tests/editorBoxSelect.test.ts
  - client/tests/editorClipboard.test.ts
  - client/tests/editorShortcuts.test.ts
  - client/tests/editorRect.test.ts
  - client/tests/editorThumbs.test.ts
  - client/tests/editorDrop.test.ts
  - client/tests/editorPlay.test.ts
  - client/tests/editorDefaults.test.ts
  - shared/mapCatalog.ts
tags:
  - ui
  - ux
  - editor
  - maps
updated: 2026-10-07
---

# Map Editor UI

A janela do editor de mapas no jogo, no estilo do editor do Unity (PF-6 Revisions 01: a janela na etapa 2 de 4; a navegação e a edição da cena na etapa 3; o painel Projeto com miniaturas e o Play dentro do editor na etapa 4). O que o editor faz com os dados está em [[ADR - Editor de mapas no jogo]]; o formato do mapa (peças, pose, grupos) em [[World Structure]].

## Visão geral (nível 1)

O editor ocupa a página inteira (`#editor`, criado em código; sem HUD nem entrada do jogo) em três faixas:

```text
┌──────────────────────────── toolbar ────────────────────────────┐
│ título · desfazer refazer · mão mover girar escalar retângulo · Pivô Global · ▦ Grade ▾ ·  ▶ ❚❚ ■  · centralizar duplicar apagar · Layout ▾ · Salvar Sair │
├───────────────┬───────────────────────────────┬─────────────────┤
│  Hierarquia   │       Cena | Jogo (abas)      │                 │
│               │ (canvas do three.js / o jogo) │    Inspetor     │
├───────────────┴───────────────────────────────┤                 │
│                    Projeto                    │                 │
├────────────────────────── barra de status ──────────────────────┤
│ orçamento · mensagens · atalhos                                  │
└──────────────────────────────────────────────────────────────────┘
```

- **Toolbar**: as ferramentas do Unity (**Mão** Q, **Mover** W, **Girar** E, **Escalar** R, **Retângulo** T); **Pivô/Centro** e **Global/Local** (cada botão alterna e mostra o estado); **▦ Grade** (encaixe sempre ligado) e **▾** com os passos do encaixe; **▶ ❚❚ ■** (Play, Pause, Stop) jogam o mapa dentro do editor, na aba Jogo (ver [[#Play dentro do editor]]); enquanto o jogo roda a toolbar fica azulada e, pausado, âmbar, como no Unity. **Layout ▾** tem "Restaurar layout padrão". Pivô/Centro, Global/Local, a grade e os passos ficam no `localStorage` (`oc.editor.ferramentas.v1`); um valor quebrado volta ao padrão (Pivô, Global, grade desligada, 0,5 m, 15°).
- **Painéis encaixáveis** (Hierarquia, Cena, Jogo, Inspetor, Projeto; o Jogo é uma aba atrás da Cena no layout padrão, e um layout guardado antes dele ganha a aba ali): cada um é uma aba numa pilha. Arrastar a aba (mais de 6 px) mostra onde ela cai na pilha sob o ponteiro: no **meio**, entra na pilha como mais uma aba; numa **borda** (um quarto de cada lado), divide a pilha e fica à esquerda, à direita, em cima ou embaixo. Esc desiste. Clicar numa aba a traz para a frente. As **bordas** entre painéis se arrastam para redimensionar (cada lado fica com pelo menos 6%). O layout fica no `localStorage` (`oc.editor.layout.v1`); um layout guardado quebrado (sem um painel, com painel repetido, tamanhos inválidos) volta ao padrão. O canvas da cena acompanha o tamanho do painel Cena a cada quadro.
- **Barra de status**: a barra de orçamento, as mensagens do editor e os atalhos.

## Hierarquia

- As peças do mapa em árvore: grupos (▣, com o número de filhos) abrem e fecham pela seta; os filhos aparecem na ordem da lista do mapa. No fim, a seção **Marcadores** (spawns, bonecos, objetos, dados do zumbi), que não entra em grupos.
- **Selecionar**: clique (substitui), Ctrl+clique (soma ou tira), Shift+clique (o trecho desde a última clicada). A seleção é a mesma da cena: selecionar na cena marca a linha, abre os grupos acima dela e rola até ela.
- **Criar**: "+" → **Grupo vazio** (no meio da Cena) ou **Agrupar a seleção** (Ctrl+G; o grupo nasce no meio da seleção, no lugar da primeira peça, dentro do grupo que elas compartilham). O grupo novo já abre renomeando.
- **Arrastar** linhas (a seleção inteira, se a linha estiver nela): no meio de um grupo, entra no fim dele; na borda de cima ou de baixo de uma linha, vai antes ou depois dela, no grupo dela; no espaço vazio abaixo das linhas, sai de todos os grupos e vai para o fim. As peças **não saem do lugar no mundo** (o lugar delas no referencial do grupo é recalculado, como no Unity). Um grupo não entra nele mesmo nem num grupo de dentro dele (a barra de status avisa).
- **Duplo clique** numa linha enquadra a peça (ou o marcador) na Cena, como o Unity (etapa 3; antes renomeava).
- **Renomear**: F2; Enter guarda, Esc desiste, vazio volta ao `id` (o nome vai em `Peca.nome`).
- **Busca**: mostra, sem árvore, as peças cujo nome, id ou tipo batem.
- **Soltar uma miniatura do Projeto** numa linha cria a peça **dentro do grupo daquela linha** (a própria, se for um grupo), na **origem do grupo** (posição e giro zero no referencial dele), no fim dos filhos; abaixo das linhas, no topo, na origem do mundo. Um marcador solto aqui vai para o ponto do mundo da origem do grupo (marcadores não entram em grupos).
- Durante o Play, só seleciona e enquadra (nada se arrasta, renomeia nem agrupa).

## Inspetor

- **Nome** (o `Peca.nome`, com o `id` como dica) e o tipo.
- **Transform**: **Posição** (m), **Rotação** (graus, Euler X, Y, Z) e **Escala**, do lugar onde o gizmo segura a peça, no referencial do grupo dela (o mundo, fora de grupos). Digitar um valor e sair do campo aplica; **arrastar a letra** X, Y ou Z muda o valor ao vivo (0,02 m, 0,5° ou 0,005 por pixel; Shift dez vezes mais) e aplica ao soltar, numa edição só. O que foi digitado continua igual enquanto dá a mesma matriz (200° fica 200°). A escala só vale para tipos com `escala` e para grupos (o grupo escala os filhos e volta a mostrar 1); nos outros o campo fica desligado. "Tirar a pose" volta a peça ao lugar dos parâmetros.
- O **componente do tipo**: semente, id da piada, coletável e os parâmetros do esquema (o formulário de antes).
- **Seleção múltipla**: o título diz quantas; o Transform mostra o valor quando é igual em todas e um traço quando difere, e a edição vale para cada uma (digitar põe o mesmo valor; arrastar soma o mesmo tanto). Os parâmetros aparecem quando todas são do mesmo tipo, com os valores da última e um "≠" nos que diferem; a edição vai para todas. Peças dentro de um grupo também selecionado não são editadas duas vezes.
- Marcador selecionado e nada selecionado (as configurações do mapa) continuam como antes.
- Durante o Play (jogando ou pausado) fica só leitura: os campos aparecem desligados.

## Cena

A Cena funciona como o Scene View do Unity (etapa 3). As contas da câmera, do encaixe, da caixa e do retângulo são puras e testadas ([[Unit Tests]]); o que cada edição faz com os dados está em [[ADR - Editor de mapas no jogo]].

### Câmera

| Controle | O que faz |
|---|---|
| Botão direito segurado + **W A S D** | Voa para a frente, para a esquerda, para trás, para a direita (na direção da vista) |
| Botão direito segurado + **Q / E** | Desce / sobe |
| Botão direito segurado + mover o mouse | Olha em volta (o ponteiro fica preso só enquanto o botão está segurado) |
| Botão direito segurado + **Shift** | Voa 3,5 vezes mais rápido |
| Botão direito segurado + **roda** | Muda a velocidade do voo |
| **Alt** + botão esquerdo arrastado | Orbita em volta do pivô: o meio da seleção (a caixa de tudo o que está selecionado) ou, sem seleção, o ponto à frente da câmera |
| Botão do **meio** arrastado (ou o botão esquerdo com a **Mão**, Q) | Arrasta a vista: o ponto à distância do pivô acompanha o cursor |
| **Roda** | Aproxima ou afasta (dolly) na direção do cursor; na ortográfica muda o tamanho da vista e o ponto sob o cursor fica parado |
| **F** | Enquadra a seleção (sem seleção, o mapa inteiro), mantendo a direção; a câmera desliza em 0,25 s |
| Duplo clique na Hierarquia | Enquadra aquela peça ou marcador |
| Gizmo de orientação (canto de cima, à direita) | Clicar num eixo olha daquele lado em volta do mesmo pivô (**Y**: de cima; **Z**: de frente; **X**: de lado; os cinza, do lado oposto); o quadrado do meio, ou o rótulo **Persp/Orto** embaixo, alterna perspectiva e ortográfica |

- A câmera guarda lugar, direção e a **distância ao pivô** (o ponto que ela olha). Voar leva o pivô junto; a roda muda a distância; F põe o pivô no meio da caixa.
- **Ortográfica**: do mesmo tamanho que a perspectiva no pivô; o plano de perto fica 500 m atrás da câmera (nada some ao aproximar). A vista pelos eixos não muda a projeção.
- Pressionar Alt sozinho não leva o teclado para o menu do navegador.

### Ferramentas (Q W E R T)

- **Mão (Q)**: o botão esquerdo arrasta a vista; o gizmo some e o clique não seleciona.
- **Mover (W), Girar (E), Escalar (R)**: o gizmo de sempre. Escalar só aparece para tipos com `escala` e grupos (o grupo espalha os filhos e escala quem tem escala: P47).
- **Retângulo (T)**: o Rect Tool do Unity levado ao 3D. Um retângulo sobre a face da caixa da seleção que mais olha para a câmera (de cima, o plano XZ), desenhado por cima da cena. Arrastar por dentro move a seleção nesse plano; as alças esticam, com o lado oposto parado. O que a alça faz depende do que está selecionado:
  - **uma caixa** (sem `rot` próprio), **sala** (som) ou **colisor invisível**: o retângulo fica na caixa da própria peça, nos eixos dela, com 8 alças; cada borda muda o tamanho (`tamanho`, ou `meia` no colisor) e o lugar;
  - **qualquer outra seleção com algo que escala** (`escala` ou grupo): o retângulo fica na caixa da seleção no mundo, só com os 4 cantos, que escalam tudo por igual a partir do canto oposto (como o Escalar);
  - **nada que escale** (paredes, telhados, carros e outros tipos medidos pelos parâmetros): só move (retângulo tracejado, sem alças).

  Um clique por dentro sem arrastar seleciona o que está embaixo, como um clique normal. Esc desiste do arrasto. Com o encaixe ligado, as medidas e o movimento vão em passos e a escala em décimos. Marcador e ponta de parede ficam com o gizmo.

### Encaixe, Pivô/Centro e Local/Global

- **Encaixe**: livre por padrão. Segurar **Ctrl** encaixa enquanto segura (mesmo no meio de um arrasto): o gizmo move em passos de **0,5 m**, gira em **15°** e escala em décimos. O botão **▦ Grade** deixa o encaixe sempre ligado; o **▾** ao lado abre os passos (mover em metros, de 0,01 a 100; girar em graus, de 0,1 a 180; vírgula ou ponto). Mover encaixa a posição do gizmo na grade do mundo. Peças novas e grupos novos caem na grade do passo de mover; colar com a grade ligada anda em passos inteiros.
- **Pivô / Centro**: no Pivô, o gizmo fica na peça ativa (a última escolhida) e a seleção gira e escala em volta dela; no Centro, fica no meio da caixa de toda a seleção, que passa a ser o ponto de giro e de escala.
- **Global / Local**: no Global os eixos do gizmo são os do mundo; no Local giram com a peça ativa. A ponta de uma parede sempre corre no eixo dela.

### Selecionar

- **Clique**: seleciona o que está sob o cursor (o mais perto: pontas, marcadores, peças); Ctrl ou Shift + clique soma ou tira peças.
- **Caixa**: arrastar com o botão esquerdo (de qualquer lugar que não seja o gizmo) desenha um retângulo; ao soltar, ficam selecionadas as peças cujo desenho **encosta** nele (inclusive o que está atrás de outra peça e o chão por baixo: ver a pergunta P48). **Shift** soma à seleção; **Ctrl** alterna cada peça da caixa. Marcadores não entram na caixa (só peças vão várias de uma vez). Esc desiste.
- **Ctrl+A** seleciona todas as peças; **Esc** tira a seleção.
- Com várias peças, cada uma mostra a sua caixa (a ativa em amarelo forte; a de um grupo cobre tudo o que está nele) e o gizmo mexe todas juntas.

### Copiar e colar

- **Ctrl+C** guarda as peças selecionadas com tudo o que está dentro dos grupos entre elas (um retrato: editar ou apagar as originais depois não muda o que foi copiado). Fica na memória enquanto o editor está aberto (não passa de um mapa para outro).
- **Ctrl+V** cola como uma edição só (um Ctrl+Z tira tudo): com o mouse sobre a Cena, o fundo do meio da cópia vai para onde o mouse aponta; com o mouse em outro lugar, no mesmo lugar com 1 m de deslocamento em X e Z. As cópias ganham ids novos (e ids de piada, semente e, num rato gigante, o seu lugar em `objetos`, como no Ctrl+D); os filhos de um grupo copiado vão para o grupo novo; uma peça de dentro de um grupo volta para o mesmo grupo, ou, se ele não existe mais, para o topo, no mesmo lugar do mundo. O que está no limite do tipo (a bruxa, por exemplo) não é colado e a barra de status avisa.

## Projeto

O navegador de assets do Unity (etapa 4; substitui a paleta em lista):

- **Pastas** à esquerda, com a quantidade: as categorias do catálogo (Primitivas, Estrutura, Construções, Natureza, Móveis, Veículos, Objetos, Luzes, Ambiente), **Modelos GLB** (os modelos que o mapa já usa e o botão **＋ Importar .glb do computador**) e **Marcadores** (spawns, boneco, cereja, biscoito, rato, peixe e, num mapa com dados do zumbi, surgimento e brecha). A pasta aberta e o tamanho ficam no `localStorage` (`oc.editor.projeto.v1`).
- **Grade de miniaturas** à direita, com o nome embaixo; a **busca** procura em todas as pastas (nome em pt e en, id); a **barra de tamanho** vai de 56 a 160 px. Um tipo no limite do mapa (a bruxa, o caminhão de sorvete) fica apagado e não arrasta.
- **As miniaturas são desenhadas pelo editor**: cada tipo é montado sozinho como uma peça nova dele (os padrões do catálogo, com a semente fixa), numa cena e numa câmera próprias, fora da tela, e guardado no navegador. Na primeira vez são feitas aos poucos (a pasta na tela primeiro, depois as outras), com um marcador girando onde ainda falta; da segunda vez em diante vêm do cache. O que não desenha nada (sala, colisor, luz) mostra o ícone da pasta. Os marcadores mostram um ícone.
- **Arrastar** uma miniatura para a **Cena** mostra uma caixa fantasma do tamanho da peça onde o mouse aponta e cria a peça ali ao soltar, com X e Z na grade do passo de mover; para a **Hierarquia**, cria dentro do grupo de destino (ver acima). **Clique duplo** (ou Enter) cria na frente da câmera. Cada criação é uma edição só (um Ctrl+Z desfaz) e a peça nova fica selecionada.
- **A peça nova nasce com os padrões do catálogo** (P53): os valores padrão do esquema de `shared/mapCatalog.ts`, os mesmos das miniaturas, num tamanho neutro de alguns metros (o cilindro tem 1 m, a parede 4 m × 3 m, o pavilhão um andar, os carrinhos de bate-bate dois carros). Antes ela copiava o primeiro exemplo do tipo nos mapas oficiais (o cilindro era uma vela de 30 cm). O Ctrl+D e o Ctrl+V continuam copiando a peça de origem.
- Durante o Play, nada se arrasta nem se cria.

## Play dentro do editor

| Botão | Editando | Jogando | Pausado |
|---|---|---|---|
| **▶ Play** | joga o mapa | (aceso) | continua |
| **❚❚ Pause** | desligado | congela o jogo e solta o mouse | continua |
| **■ Stop** | desligado | termina e volta a editar | termina e volta a editar |

- **▶** joga o **mapa como está no editor** (sem salvar) na aba **Jogo**, que vem para a frente; os outros painéis continuam à vista. O modo é o do antigo Testar (P41): o **treino**; num mapa exclusivo do zumbi, a **partida de zumbi sozinho contra a horda**. Montado o mapa, o jogo **já prende o mouse e liga o som**, aproveitando o clique do ▶ (P52: a ativação do clique vale por alguns segundos na página do jogo); o cartão "Jogar" só fica como reserva, quando o mapa demorou demais ou o navegador não deixa; o botão de sair do menu de pausa dele vira **Voltar ao editor (Stop)**. Um mapa com dados inválidos não joga (a barra de status avisa).
- **Jogando**: o editor só olha. Os atalhos e a câmera da Cena ficam desligados, o documento não aceita edição (nem desfazer), a Hierarquia, o Inspetor e o Projeto ficam só leitura e a toolbar fica tingida. A Cena (se estiver à vista ao lado do Jogo) é redesenhada a cada quatro quadros, e as miniaturas que faltam esperam. Um controle (gamepad) só joga: a navegação dos botões do editor pelo controle volta na pausa e no Stop.
- **❚❚** congela o jogo (nada simula nem desenha) sob um véu "Pausado" e solta o mouse. Aí a câmera da Cena e a seleção voltam (clique, caixa, Hierarquia, F), para olhar o mapa e ler o Inspetor, mas nada muda o mapa. **A Cena e a Hierarquia mostram só o mapa editado**, não o estado do jogo (jogador, bots, zumbis, portas abertas não aparecem nelas: P51, decidido assim). Dos atalhos funcionam só F, Esc, Ctrl+C e Ctrl+A. **▶** (ou ❚❚ de novo) continua com a aba Jogo na frente e tenta prender o mouse de volta; se o navegador não deixar, o menu de pausa do jogo pede um clique.
- **■** termina o jogo, libera tudo o que ele criou e **volta a editar no mesmo ponto**: a seleção e a câmera de antes do ▶ (mesmo que tenham mudado na pausa), o histórico intacto e a aba Cena na frente, sem recarregar a página. O **Sair** do editor durante o Play para o jogo antes.
- O rascunho automático (P40) continua valendo; o Play não grava nada.

## Atalhos

Nenhum dispara enquanto um campo de texto tem o foco (nome, busca, números do Inspetor). Com o botão direito segurado, as letras são da câmera. Durante o Play nenhum dispara; pausado, só F, Esc, Ctrl+C e Ctrl+A (as teclas do jogo vão para a aba Jogo, que é uma página à parte).

| Tecla | Ação |
|---|---|
| Q / W / E / R / T | Mão / Mover / Girar / Escalar / Retângulo |
| F | Enquadra a seleção (sem seleção, o mapa) |
| F2 | Renomeia a peça ativa na Hierarquia |
| Delete (ou Backspace) | Apaga a seleção (um grupo com os filhos) |
| Esc | Desiste da caixa ou do retângulo em andamento; senão, tira a seleção |
| Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z | Desfaz / refaz / refaz |
| Ctrl+D | Duplica a seleção (um grupo com os filhos) |
| Ctrl+C / Ctrl+V | Copia / cola |
| Ctrl+A | Seleciona todas as peças |
| Ctrl+G | Agrupa a seleção |
| Ctrl segurado | Encaixa o gizmo e o retângulo enquanto segura |

As teclas 1/2/3 da fase 3 saíram (agora W/E/R) e o Shift não tira mais o encaixe (o encaixe é livre por padrão).

## Código relacionado

- `client/editor/editor.ts` — monta a janela, liga painéis, seleção, gizmo, Transform, Hierarquia, ferramentas, atalhos, copiar e colar.
- `client/editor/sceneCamera.ts` (mouse e teclas da câmera), `client/editor/cameraMath.ts` (as contas, sem tela) e `client/editor/viewGizmo.ts` (o gizmo de orientação).
- `client/editor/tools.ts` (encaixe, Pivô/Centro, Local/Global e as escolhas guardadas) e `client/editor/gizmo.ts` (o TransformControls do three).
- `client/editor/shortcuts.ts` (o mapa de atalhos), `client/editor/boxSelect.ts` (a caixa), `client/editor/clipboard.ts` (copiar e colar), `client/editor/rectTool.ts` (as contas do retângulo) e `client/editor/rectOverlay.ts` (o desenho e o arrasto dele).
- `client/editor/dock.ts` (DOM) e `client/editor/dockLayout.ts` (árvore do layout, sem tela).
- `client/editor/hierarchy.ts`, `client/editor/inspector.ts`, `client/editor/transformFields.ts`, `client/editor/selection.ts`, `client/editor/groups.ts`.
- `client/editor/project.ts` (o painel Projeto), `client/editor/thumbs.ts` (as miniaturas: cache no IndexedDB e fila), `client/editor/thumbRenderer.ts` (o desenho), `client/editor/thumbCache.ts` e `client/editor/thumbQueue.ts` (chave, assinatura e fila, sem tela), `client/editor/dropPiece.ts` (onde a peça arrastada cai, sem tela).
- `client/editor/playMode.ts` (estados do Play e a sessão, sem tela), `client/editor/playHost.ts` (a aba Jogo), `client/editor/playEmbed.ts` e `client/editor/playBridge.ts` (o lado do jogo).
- `client/editor/style.ts` (CSS do editor) e `client/editor/strings.ts` (textos pt e en).

Relacionado: [[UI Overview]] · [[Menus]] · [[Input & Controls]] · [[ADR - Editor de mapas no jogo]] · [[ADR - Lotes do editor com BatchedMesh]] · [[Unit Tests]]
