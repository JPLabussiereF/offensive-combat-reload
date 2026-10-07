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
  - client/editor/flyCamera.ts
  - client/editor/selection.ts
  - client/editor/palette.ts
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
- **Peças novas** copiam o primeiro exemplo do tipo nos mapas oficiais (cada tipo usado neles tem um exemplo montável; os outros vêm dos padrões do esquema). Peças `linear` e `fixa` caem no lugar certo pela pose (o editor monta o exemplo uma vez, fora do mapa, para achar o meio).
- **Orçamento como o servidor.** O editor mostra cada peça à parte, então o custo de desenho é medido montando o mapa de novo **no modo jogo**, fora da tela (cena e mundo físico próprios), com `measureMapBudget`, 600 ms depois da última edição. Salvar fica desligado acima de `MAP_BUDGET` ou com dados inválidos.
- **Rascunho automático (P40).** Cada edição grava o rascunho no IndexedDB (`oc-mapas` versão 2, store `rascunhos`; o store `versoes` continua), 150 ms depois da última, como `{ dados, em, base }` (a data e a versão de onde veio; um mapa guardado sem data pela fase 3 é lido como o mais velho possível). Ao abrir um mapa cujo rascunho é mais novo que a versão atual (`em` > `MapaResumo.atualizadoEm`; um mapa novo, `novo`, sempre), o editor pergunta se recupera; recuperado, salva sobre `base` (uma versão salva depois dá 409). Recusado ou velho, é apagado; salvar com sucesso ou sair pelo botão Sair também o apagam. As decisões puras estão em `client/editor/recovery.ts`.
- **Testar** grava o rascunho e recarrega a página no teste dele; o que precisa atravessar o recarregamento vai no `sessionStorage` (`oc.editor`). Um mapa exclusivo do zumbi abre a **partida de zumbi sozinho contra a horda** (`HomeChoice` `bots` com `game: 'zumbi'`, a mesma do "Encarar a horda sozinho"); os outros, o treino (P41). Sair do teste volta ao editor no mesmo rascunho.
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

## Motivo

Reaproveitar o carregador do jogo garante que o editor mostra o que o jogo monta (inclusive GLB, salas e piadas) e que a reconstrução de uma peça é a mesma montagem. A pose resolve a P32 sem reescrever os ~145 adaptadores nem os parâmetros de cada tipo, e deixa a peça sem pose idêntica (golden e navmesh). Medir no modo jogo dá o mesmo número que o servidor, que é quem decide.

## Consequências

- Uma peça com pose tem coleções próprias (uma malha a mais por coleção usada). As lanternas de papel delas (e as de toda peça no editor) entram nas luzes da noite do mapa pela pose (`Services.lanternSources`), e o recorte de um lago girado entra em `holes` como a caixa em volta dele (P42, fase 4); `LanternLights` acompanha a lista quando o editor remonta uma peça.
- O rascunho automático escreve o mapa inteiro no IndexedDB depois de cada edição (os oficiais grandes têm ~170 KB); o navegador sem IndexedDB (janela privada bloqueada) só perde a recuperação.
- Medir o orçamento monta o mapa inteiro de novo: nos mapas grandes (Vila Assombrada) leva algumas centenas de milissegundos na thread da página, depois de cada edição.
- O editor monta sem lotes entre peças, mas desenha o que não está selecionado em lotes `BatchedMesh` (P46): o custo de desenho fica perto do do jogo; a seleção grande (centenas de peças) volta a custar uma chamada por malha enquanto está selecionada.

Relacionado: [[ADR - Mapas como dados com catálogo de peças]] · [[ADR - Sessões sob demanda por versão do mapa]] · [[ADR - Papéis da equipe conferidos no servidor]] · [[World Structure]] · [[Unit Tests]]
