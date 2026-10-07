---
title: ADR - Editor de mapas no jogo
type: decision
status: documented
area: architecture
source_paths:
  - client/render/shadows.ts
  - client/editor/editor.ts
  - client/editor/document.ts
  - client/editor/history.ts
  - client/editor/view.ts
  - client/editor/transform.ts
  - client/editor/gizmo.ts
  - client/editor/sceneCamera.ts
  - client/editor/cameraMath.ts
  - client/editor/viewGizmo.ts
  - client/editor/tools.ts
  - client/editor/shortcuts.ts
  - client/editor/boxSelect.ts
  - client/editor/clipboard.ts
  - client/editor/rectTool.ts
  - client/editor/rectOverlay.ts
  - client/editor/selection.ts
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
  - client/editor/inspector.ts
  - client/editor/create.ts
  - client/editor/linearHandles.ts
  - client/editor/markers.ts
  - client/editor/glbImport.ts
  - client/editor/save.ts
  - client/editor/budgetBar.ts
  - client/editor/launch.ts
  - client/editor/recovery.ts
  - client/editor/strings.ts
  - client/editor/dock.ts
  - client/editor/dockLayout.ts
  - client/editor/hierarchy.ts
  - client/editor/groups.ts
  - client/editor/transformFields.ts
  - client/editor/batches.ts
  - client/editor/style.ts
  - client/ui/maps.ts
  - client/ui/home.ts
  - client/world/catalog/services.ts
  - client/world/jardim/luzes.ts
  - client/world/pose.ts
  - client/world/catalog/posed.ts
  - client/world/mapLoader.ts
  - client/net/maps.ts
  - client/main.ts
  - client/tests/editorHistory.test.ts
  - client/tests/mapPose.test.ts
  - client/tests/editorRecovery.test.ts
  - client/tests/editorGroups.test.ts
  - client/tests/editorLayout.test.ts
  - client/tests/editorBatches.test.ts
  - client/tests/mapGroups.test.ts
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
  - vite.config.ts
tags:
  - decision
  - adr
  - architecture
  - maps
  - editor
updated: 2026-10-07
---

# ADR - Editor de mapas no jogo

## Contexto

A PF-6 (fase 3 de 4) pede o editor de mapas dentro do jogo: câmera livre, gizmo com grade de 0,5 m e 15° (Shift tira o encaixe), desfazer e refazer, paleta do catálogo, formulário gerado pelo esquema, pontas e vãos de paredes, marcadores (spawns, bonecos, objetos, dados de zumbi), GLB do disco, orçamento ao vivo, Testar no treino e Salvar como oficial (só a equipe) ou comunidade. A P32 pede que o gizmo mova e gire **todas** as peças em qualquer ângulo. As telas Mapas e Gerenciamento (que abrem o editor) são da fase 4.

## Decisão

- **Fora da partida.** `boot()` (`client/main.ts`) recebe `{ mode: 'editor', mapa: { id, versao } | null }` no `HomeChoice`, chama `runEditor` e retorna: sem `Input`, `LocalPlayer` nem HUD. O editor tem o seu loop e sai por `location.reload()`; o loop chama `QualityManager.beforeRender()` como o da partida (o mapa de sombra é sob demanda; sem isso, com aceleração de hardware, nada iluminado aparecia: [[Problem - Editor sem mapa de sombra com aceleração de hardware]]). Entra pela aba **Mapas** da tela inicial (fase 4): **Editar** (a versão atual) e **+ Novo mapa** resolvem `showHome` com esse `HomeChoice`. A entrada provisória `?editor` da fase 3 saiu; `window.__ocEditor` continua, só em desenvolvimento.
- **O carregador do jogo no modo editor** ([[ADR - Mapas como dados com catálogo de peças]]): cada peça no seu grupo; `MapBuild.remove(id)` tira o grupo, os colisores, as atualizações por quadro, as luzes, as salas e os vãos da peça, e `piece()` a monta de novo. Cada edição reconstrói **só as peças que tocou**.
- **Edições como patches.** `client/editor/document.ts` guarda o `MapData` e muda só por patches (peças antes e depois, com o lugar na lista; o resto do mapa antes e depois). Desfazer aplica o patch ao contrário (`client/editor/history.ts`, até 200 edições; Ctrl+Z, Ctrl+Y e Ctrl+Shift+Z). O documento é puro (testado sem tela).
- **Pose (P32).** O gizmo segura a peça num ponto (o lugar de uma peça `livre`, o meio do que as outras montam). Uma peça `livre` movida e girada em torno do eixo vertical continua só com `p`, `yaw` e `escala`; qualquer outro giro, e todo movimento de peça `linear` ou `fixa`, vira a **pose** da peça (`Peca.pose`, transformação rígida aplicada a tudo o que ela monta: ver o ADR dos mapas). Mover a bruxa, um rato ou uma peça com coletável leva junto o lugar dele em `objetos` (o servidor confere por lá).
- **Peças novas** nascem com os **padrões do catálogo** (P53, Revisions 01: antes copiavam o primeiro exemplo do tipo nos mapas oficiais). Peças `linear` e `fixa` caem no lugar certo pela pose (o editor monta a peça uma vez, fora do mapa, para achar o meio).
- **Orçamento como o servidor.** O editor mostra cada peça à parte, então o custo de desenho é medido montando o mapa de novo **no modo jogo**, fora da tela (cena e mundo físico próprios), com `measureMapBudget`, 600 ms depois da última edição. Salvar fica desligado acima de `MAP_BUDGET` ou com dados inválidos.
- **Rascunho automático (P40).** Cada edição grava o rascunho no IndexedDB (`oc-mapas` versão 2, store `rascunhos`; o store `versoes` continua), 150 ms depois da última, como `{ dados, em, base }` (a data e a versão de onde veio; um mapa guardado sem data pela fase 3 é lido como o mais velho possível). Ao abrir um mapa cujo rascunho é mais novo que a versão atual (`em` > `MapaResumo.atualizadoEm`; um mapa novo, `novo`, sempre), o editor pergunta se recupera; recuperado, salva sobre `base` (uma versão salva depois dá 409). Recusado ou velho, é apagado; salvar com sucesso ou sair pelo botão Sair também o apagam. As decisões puras estão em `client/editor/recovery.ts`.
- **Testar** (até a Revisions 01, etapa 4) gravava o rascunho e recarregava a página no teste dele, com o handoff no `sessionStorage` (`oc.editor`). Foi trocado pelo **Play dentro do editor** (ver a seção da etapa 4); o modo continua o da P41: um mapa exclusivo do zumbi abre a **partida de zumbi sozinho contra a horda** (`HomeChoice` `bots` com `game: 'zumbi'`, a mesma do "Encarar a horda sozinho"); os outros, o treino. A chave `oc.editor` ficou só para o "Abrir a versão atual" (P39); um handoff `testar` ou `voltar` gravado por uma página antiga abre o editor no rascunho que ele nomeia.
- **Salvar** usa a API da fase 2 (`POST /api/mapas`, `PUT /api/mapas/:id` com `baseVersao`); `validateMapData` roda antes de enviar. `orcamento_excedido` e `mapa_invalido` são mostrados como vêm. No **409** (P39) o diálogo oferece **Salvar como nova versão mesmo assim** (envia de novo com `baseVersao` = a versão atual que o 409 trouxe; a outra fica no histórico) e **Abrir a versão atual** (apaga o rascunho e recarrega o editor nela pelo handoff `abrir`, descartando as edições). Nada é sobrescrito sem a pessoa escolher.
- **Textos** do editor em `client/editor/strings.ts` (pt e en, a língua do jogo).

## Revisions 01: estilo Unity (etapa 2 de 4)

Decisões do dev (plano da PF-6, seção 4): o editor passa a seguir o editor do Unity. Esta etapa entregou a janela, a Hierarchy com grupos, o Inspector com Transform e os lotes por seleção; a câmera do Scene View, Q/W/E/R/T, Ctrl para encaixar, o botão de grade, Pivot/Center, Local/Global, seleção por caixa e copiar/colar são a etapa 3; o painel Project com miniaturas e arrastar para a cena, e o Play dentro do editor, a etapa 4. A janela está descrita em [[Map Editor UI]].

- **Painéis encaixáveis livres**: toolbar em cima (Play, Pause e Stop no centro; Play chama o Testar de antes até a etapa 4), Hierarchy, Scene, Inspector e Project como abas que se arrastam para o meio de uma pilha (empilham) ou para uma borda (dividem), bordas redimensionáveis, layout no `localStorage` e "Restaurar layout padrão" (o do Unity). O modelo do layout é puro (`client/editor/dockLayout.ts`: árvore de divisões e pilhas, `dock`, `resize`, `normalize`, leitura que volta ao padrão quando o guardado não serve); o DOM em `client/editor/dock.ts`. O canvas do three.js vai para dentro do painel Scene e acompanha o tamanho dele.
- **Grupos pai e filho**: o formato ganhou `Peca.pai` e `Peca.nome` e o tipo `grupo` (sem geometria: a pose dele é o referencial dos filhos; ver [[ADR - Mapas como dados com catálogo de peças]]). As operações da Hierarchy são puras (`client/editor/groups.ts`) e devolvem a lista nova de peças; `EditorDocument.setPieces` a transforma num patch só com as peças que mudaram ou saíram da ordem (a maior sequência que fica em ordem fica de fora), então reordenar não remonta nada e agrupar, pôr dentro e fora, mover o grupo, duplicar e apagar com os filhos são uma edição cada, desfeita de uma vez. Pôr uma peça num grupo (ou tirar) a deixa onde está no mundo, como no Unity: o lugar dela no referencial novo é calculado (`applyHandle` com o referencial do grupo). Mudar a pose de um grupo remonta os filhos.
- **Escala de grupo**: o grupo não guarda escala (a pose é rígida: colisores, salas e vãos não aceitam escala). Escalar um grupo, ou várias peças pelo gizmo, espalha as peças a partir do ponto segurado e multiplica a `escala` das que a têm; as outras só se movem. O campo Escala do grupo volta a mostrar 1. Ver a pergunta P47 no relatório da etapa.
- **Inspector**: nome, **Transform** (posição, rotação em graus e escala do lugar onde o gizmo segura a peça, no referencial do grupo; rótulos arrastáveis; o valor digitado é guardado enquanto der a mesma matriz) e o formulário do esquema; com seleção múltipla, os valores em comum e a edição para todas. A matemática está em `client/editor/transformFields.ts`.
- **Seleção múltipla** (Ctrl ou Shift na cena e na Hierarchy): o gizmo fica na última escolhida e move, gira e escala todas juntas (girar e escalar em volta dela); os lugares do servidor (bruxa, rato, coletável) acompanham cada peça (`linkedRest`).
- **P46, lotes por seleção**: o que não está selecionado é desenhado em `BatchedMesh` ([[ADR - Lotes do editor com BatchedMesh]]): no Jardim, 2.701 → 350 chamadas por quadro.

## Revisions 01: etapa 3 (navegação e edição no estilo do Unity)

Decisões do dev: a câmera, os atalhos, o encaixe, Pivot/Center, Local/Global, a seleção por caixa e copiar/colar seguem o Unity. O uso está em [[Map Editor UI]] (tabela de atalhos e da câmera).

- **Câmera do Scene View** (`client/editor/sceneCamera.ts`; as contas em `client/editor/cameraMath.ts`, puras): substitui a câmera livre da fase 3 (`flyCamera.ts` saiu). O estado é lugar, direção (yaw e pitch, ordem YXZ) e **distância ao pivô**; voar com o botão direito, orbitar com Alt + esquerdo (em volta do meio da seleção ou do pivô), arrastar com o meio, roda para o cursor, F e o duplo clique na Hierarchy enquadram com uma transição de 0,25 s. O **gizmo de orientação** (`client/editor/viewGizmo.ts`, SVG por cima do canvas) dá as vistas pelos eixos e alterna a projeção. A **ortográfica** é uma `OrthographicCamera` própria, do tamanho da perspectiva no pivô e com o plano de perto 500 m atrás; `RenderContext.render(camera?)` passou a aceitar outra câmera, e o gizmo (`TransformControls.camera`), o clique, a caixa e o colar usam a câmera desenhada. O ponteiro só é preso depois dos outros ouvintes do clique direito (o gizmo captura o ponteiro, e com um lock pendente o navegador recusa: dava um erro no console).
- **Ferramentas Q W E R T**: a Mão esconde o gizmo e o botão esquerdo arrasta a vista; W, E e R são o gizmo; o **Retângulo** (T, `client/editor/rectTool.ts` e `rectOverlay.ts`) é o Rect Tool levado ao 3D: um retângulo na face da caixa da seleção mais virada para a câmera. O dado só guarda escala uniforme (`Peca.escala`) e o tamanho de cada tipo nos parâmetros, então a alça faz o que cabe em cada caso: **estica** caixa (sem `rot`), sala e colisor pelo tamanho (`tamanho`, `meia`) nos eixos da peça; **escala por igual** pelos cantos o que tem `escala` e grupos (o mesmo `scaleTree` do Escalar, P47); **só move** o resto (desligado onde não faz sentido, como o dev permitiu).
- **Encaixe**: livre por padrão; Ctrl segurado ou o botão de grade ligam (`snapSteps`), mesmo no meio de um arrasto; os passos (0,5 m e 15° por padrão) mudam no menu do botão. O Shift deixou de tirar o encaixe. O `TransformControls` encaixa a posição absoluta na grade do mundo (Global) ou o deslocamento nos eixos da peça (Local).
- **Pivot/Center e Local/Global** (`client/editor/tools.ts`): o editor põe o gizmo na peça ativa ou no meio da caixa da seleção (`gizmoFrame`), e como o arrasto vira um delta rígido (`moveTree`) ou uma escala em volta do ponto segurado (`scaleTree`), o Centro é também o pivô do giro e da escala da seleção. Local/Global é o `space` do `TransformControls`. O padrão é **Pivô + Global**, o comportamento de antes. As escolhas, a grade e os passos ficam no `localStorage` (`oc.editor.ferramentas.v1`), lidos com cada campo validado.
- **Seleção por caixa** (`client/editor/boxSelect.ts`): ao soltar, as peças cujas malhas **encostam** no retângulo: a caixa de cada malha projetada decide o que está todo dentro ou todo fora, e o resto é testado triângulo a triângulo (recorte no plano de perto e eixos separadores), até 400 mil triângulos por caixa. Não olha oclusão: o chão por baixo e o que está atrás entram (pergunta P48). Começa de qualquer lugar que não seja o gizmo (num mapa quase todo coberto de chão, "só no vazio" não deixaria arrastar). As malhas das peças em lote (P46) contam onde estão.
- **Copiar e colar** (`client/editor/clipboard.ts`): Ctrl+C guarda um retrato das peças e dos filhos (e onde o grupo de cada uma a punha no mundo); Ctrl+V monta as cópias num mapa de trabalho que cresce com elas (`newPieceId`, `newPropId` e `newObjectId` olham a lista inteira, então duas cópias nunca repetem id), remapeia o `pai` dos filhos, devolve a peça ao grupo dela (ou ao topo, no mesmo lugar do mundo, quando o grupo sumiu) e move tudo pelo delta (onde o mouse aponta, ou 1 m em X e Z); uma edição só (`setPieces`). O retrato vive na memória da página.
- **Atalhos** (`client/editor/shortcuts.ts`, um mapa puro): Q W E R T, F, F2, Delete, Esc, Ctrl+Z/Y/Shift+Z/D/C/V/A/G; nenhum dispara em campo de texto (`isTextField`: checkbox e cor não contam) e as letras são da câmera com o botão direito segurado. As teclas 1/2/3 saíram; o duplo clique na Hierarchy passou a enquadrar (renomear ficou no F2).

Consequências: Ctrl+A num mapa grande tira todas as peças dos lotes enquanto estão selecionadas (as chamadas por quadro sobem, como numa seleção grande da etapa 2); a caixa testa triângulos no soltar (no Jardim, uma caixa grande leva alguns milissegundos).

## Revisions 01: etapa 4 (Project com miniaturas e Play dentro do editor)

Decisões do dev: o painel Project vira o navegador de assets do Unity, com miniaturas **geradas pelo editor** e guardadas no navegador, arrastar para a Cena e para a Hierarchy e clique duplo; o Play roda o mapa em edição numa aba **Jogo** do editor, com Pause e Stop como no Unity, e substitui o Testar que recarregava a página. O uso está em [[Map Editor UI]].

- **Miniaturas** (`client/editor/thumbRenderer.ts`, `thumbs.ts`): cada tipo é montado sozinho pelo carregador do jogo (modo editor) como a peça nova que o Project cria (os padrões do catálogo, semente fixa), num **mundo físico próprio** (criado e liberado a cada miniatura: o `MapBuild` lista como colisores da peça todos os que encontra no mundo) e numa cena e câmera próprias, e desenhado num **render target sRGB do renderer do editor** (sem um segundo contexto WebGL), em 256 px reduzidos para 128, com fundo transparente; o render target não aplica a conversão de cor da tela, então o formato sRGB do alvo faz a codificação. O mapa de sombra do editor não é tocado (`shadowMap.needsUpdate` guardado e devolvido). A caixa do que é visível (gatilhos escondidos não contam) vai junto: é a prévia fantasma do arrastar.
- **Cache** (`client/editor/thumbCache.ts`, puro): IndexedDB `oc-editor`, store `miniaturas` (banco à parte do `oc-mapas`, para não subir a versão dele), chave `peca:<tipo>` ou `glb:<sha256>`, valor `{ sig, blob, box, em }`. A **assinatura** é o hash da entrada do catálogo e da peça nova (parâmetros, giro, escala, semente), da **versão do jogo** (`__OC_BUILD__`, definida no `vite.config.ts`: o commit, ou, sem git como no build do Docker, a versão do pacote e a hora do build) e do formato do desenho (`THUMB_FORMAT`); outra assinatura conta como ausente e a miniatura é desenhada de novo. Os tipos que saem do catálogo são esquecidos.
- **Geração aos poucos** (`client/editor/thumbQueue.ts`, pura): uma miniatura por vez, cada uma num momento livre da página (`requestIdleCallback`), a pasta na tela primeiro e depois as outras; uma falha não para a fila; a fila espera enquanto o mapa é jogado. Medido no Chrome com GPU (RTX 4070): as 145 miniaturas em ~3,4 s, com o intervalo entre quadros do editor em 7 ms na mediana e 56 ms no pior.
- **Arrastar** (`client/editor/dropPiece.ts`, puro): na Cena, o ponto onde o raio do mouse encontra o mapa (`Selection.dropPoint`, com a câmera desenhada), X e Z na grade do passo de mover; na Hierarchy, a origem do grupo de destino (o da linha, ou ela mesma se for um grupo; abaixo das linhas, o topo), giro zero no referencial dele, no fim dos filhos. Peças `linear` e `fixa` são medidas sozinhas (sem pai nem pose) e posadas com o meio da base no ponto, como antes. A peça e os lugares do servidor que ela traz (o rato, a bruxa, no ponto do mundo) são **uma edição** (`setPieces`). O drag usa o arrastar do HTML (tipo `application/x-oc-asset`); `dragover` e `drop` são ouvidos no painel Scene (o SVG do Retângulo fica por cima do canvas).
- **Play numa página própria**: ▶ abre o jogo num **iframe da mesma origem** (`?jogoEditor=<token>`) posto sobre o painel Jogo a cada quadro (fora da árvore do dock: mover um iframe no DOM o recarrega). A página roda o `boot()` de sempre (`client/editor/playEmbed.ts`): sem tela inicial, pega o mapa como JSON da ponte que o editor deixa na janela dele (`client/editor/playBridge.ts`), escolhe o modo da P41 e devolve os controles (pausar, continuar, terminar, memória). **❚❚** congela o laço do jogo (nem simula nem desenha) sob um véu e solta o mouse; **▶** continua dentro do clique (a ativação do usuário chega à página filha da mesma origem e o mouse pode voltar a ser preso). **■** pede ao jogo que solte o mouse, feche o `AudioContext` (`Sfx.dispose`) e perca o contexto WebGL (`renderer.dispose` + `forceContextLoss`), e remove a página: o navegador libera tudo o que ela criou (física, navmesh, cena). O Sair do menu do jogo vira "Voltar ao editor (Stop)".
- **Editor só leitura** (`client/editor/playMode.ts`, puro): estados `editando`, `jogando`, `pausado`; `EditorDocument.locked` recusa toda edição, desfazer e refazer, venha de onde vier; jogando, a câmera (`SceneCamera.enabled`), o clique e a caixa (`Selection.enabled`) e os atalhos ficam desligados; pausado, voltam a câmera, a seleção e os atalhos que só olham (F, Esc, Ctrl+C, Ctrl+A). Hierarchy, Project e Inspector (num `fieldset` desligado) ficam só leitura; o gizmo, o Retângulo e as alças das paredes somem. A sessão guarda no ▶ a seleção e a câmera e as devolve no ■ (o histórico e o mapa não mudam no meio); cada jogo iniciado é solto uma vez (no ■, no Sair dele, quando não sobe, ou assim que ficar pronto se o ■ veio durante o carregamento: o carregamento é abortado e a página removida).
- **Layout**: o painel `game` entrou em `PanelId`; o padrão o põe como aba atrás da Cena; um layout guardado sem ele (das etapas 2 e 3) ganha a aba ali, sem mudar a aba mostrada.

Opções consideradas para o Play: (a) transformar o `boot()` numa partida descartável dentro da mesma página, com o renderer, a cena e a física do editor; (b) a página do jogo inteira num iframe. A (a) exigiria um `dispose` em cada sistema da partida (ouvintes de janela do `Input`, HUD, bots, navmesh, zumbis, efeitos, viewmodel, sons), que nunca precisaram de um porque o jogo monta um mapa por página ([[ADR - Bootstrap do cliente numa única closure]]): qualquer esquecimento viraria vazamento ou estado misturado com o editor. A (b) reusa o jogo sem mudá-lo e o Stop libera tudo por construção.

Consequências: enquanto o jogo roda há dois contextos WebGL (o do editor desenha a Cena a cada quatro quadros, e nada quando a aba Cena está escondida); o jogo carrega o próprio código e monta a física e o mapa de novo a cada ▶ (cerca de 1 s com o cache do navegador, na Rua). A Cena e a Hierarchy mostram o mapa do editor, não o estado vivo do jogo (jogador, bots, zumbis não aparecem nelas): **P51, decidido assim** (manter; na pausa a Cena mostra só o mapa editado). Repetir ▶/■ não muda o `renderer.info.memory` do editor nem o heap da página depois da coleta (conferido em cinco ciclos). As miniaturas sobem as texturas dos materiais de todos os tipos para a GPU do editor na primeira geração.

**Respostas do dev depois da etapa 4:**

- **P52 — o jogo começa direto.** Montado o mapa, a página do jogo liga o som e prende o mouse se o clique do ▶ ainda vale nela (`autoStarts` em `client/editor/playMode.ts`, pela API `navigator.userActivation`): o Chrome dá a ativação de um clique, por alguns segundos, às páginas da mesma origem da aba, inclusive a do jogo, criada no próprio clique (conferido no Chrome 155 com GPU: ativa, `AudioContext` em `running` cerca de 1,4 s depois do ▶). O cartão "Jogar" fica como reserva (o mapa demorou mais que a ativação, ou o navegador recusa). Considerei abrir a página do jogo antes do ▶ e deixá-la esperando o mapa, para garantir que o clique a alcançasse; não foi preciso (a página criada no clique já recebe a ativação) e custaria um segundo contexto WebGL parado enquanto se edita. O Chrome headless recusa qualquer captura de mouse (`WrongDocumentError`, até na página do editor), então a captura em si foi conferida só pelo código e pelo teste da decisão.
- **P53 — padrões do catálogo.** A peça nova do Project (arrastar, clique duplo) e a miniatura usam os padrões do esquema de `shared/mapCatalog.ts`, não mais o primeiro exemplo dos mapas oficiais (`templatesFrom` saiu). O esquema ganhou padrão para listas e JSON (`lista` e `json` com `padrao`, copiado a cada peça nova) e padrões revistos onde a peça nova não montava (pavilhão, carrinhos de bate-bate e dragão decorativo davam erro) ou não desenhava nada (tiro ao alvo, cogumelos, caminho de pedras; o varal tinha as duas pontas no mesmo lugar), mais as cores cinzas de veículos e da casa assombrada. Os padrões só são lidos pelo editor: os mapas guardam todos os parâmetros que usam, então os oficiais e os goldens não mudam (`mapConversion.test.ts` continua igual). `client/tests/editorDefaults.test.ts` monta cada tipo só com os padrões (sem erro, válido, desenhando algo de alguns metros; sala, colisor, luz e brasas não desenham nada por natureza).

## Motivo

Reaproveitar o carregador do jogo garante que o editor mostra o que o jogo monta (inclusive GLB, salas e piadas) e que a reconstrução de uma peça é a mesma montagem. A pose resolve a P32 sem reescrever os ~145 adaptadores nem os parâmetros de cada tipo, e deixa a peça sem pose idêntica (golden e navmesh). Medir no modo jogo dá o mesmo número que o servidor, que é quem decide.

## Consequências

- Uma peça com pose tem coleções próprias (uma malha a mais por coleção usada). As lanternas de papel delas (e as de toda peça no editor) entram nas luzes da noite do mapa pela pose (`Services.lanternSources`), e o recorte de um lago girado entra em `holes` como a caixa em volta dele (P42, fase 4); `LanternLights` acompanha a lista quando o editor remonta uma peça.
- O rascunho automático escreve o mapa inteiro no IndexedDB depois de cada edição (os oficiais grandes têm ~170 KB); o navegador sem IndexedDB (janela privada bloqueada) só perde a recuperação.
- Medir o orçamento monta o mapa inteiro de novo: nos mapas grandes (Vila Assombrada) leva algumas centenas de milissegundos na thread da página, depois de cada edição.
- O editor monta sem lotes entre peças, mas desenha o que não está selecionado em lotes `BatchedMesh` (P46): o custo de desenho fica perto do do jogo; a seleção grande (centenas de peças) volta a custar uma chamada por malha enquanto está selecionada.

Relacionado: [[ADR - Mapas como dados com catálogo de peças]] · [[ADR - Sessões sob demanda por versão do mapa]] · [[ADR - Papéis da equipe conferidos no servidor]] · [[World Structure]] · [[Unit Tests]]
