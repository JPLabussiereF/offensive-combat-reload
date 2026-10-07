---
title: ADR - Editor de mapas no jogo
type: decision
status: documented
area: architecture
source_paths:
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
  - client/editor/strings.ts
  - client/world/pose.ts
  - client/world/catalog/posed.ts
  - client/world/mapLoader.ts
  - client/net/maps.ts
  - client/main.ts
  - client/tests/editorHistory.test.ts
  - client/tests/mapPose.test.ts
tags:
  - decision
  - adr
  - architecture
  - maps
  - editor
updated: 2026-10-06
---

# ADR - Editor de mapas no jogo

## Contexto

A PF-6 (fase 3 de 4) pede o editor de mapas dentro do jogo: câmera livre, gizmo com grade de 0,5 m e 15° (Shift tira o encaixe), desfazer e refazer, paleta do catálogo, formulário gerado pelo esquema, pontas e vãos de paredes, marcadores (spawns, bonecos, objetos, dados de zumbi), GLB do disco, orçamento ao vivo, Testar no treino e Salvar como oficial (só a equipe) ou comunidade. A P32 pede que o gizmo mova e gire **todas** as peças em qualquer ângulo. As telas Mapas e Gerenciamento (que abrem o editor) são da fase 4.

## Decisão

- **Fora da partida.** `boot()` (`client/main.ts`) recebe `{ mode: 'editor', mapa: { id, versao } | null }` no `HomeChoice`, chama `runEditor` e retorna: sem `Input`, `LocalPlayer` nem HUD. O editor tem o seu loop e sai por `location.reload()`. Até a fase 4, em desenvolvimento, `?editor` e `?editor=<id>` abrem o editor (entrada **provisória** em `client/editor/launch.ts`, marcada para a fase 4 trocar pelos botões da tela Mapas).
- **O carregador do jogo no modo editor** ([[ADR - Mapas como dados com catálogo de peças]]): cada peça no seu grupo; `MapBuild.remove(id)` tira o grupo, os colisores, as atualizações por quadro, as luzes, as salas e os vãos da peça, e `piece()` a monta de novo. Cada edição reconstrói **só as peças que tocou**.
- **Edições como patches.** `client/editor/document.ts` guarda o `MapData` e muda só por patches (peças antes e depois, com o lugar na lista; o resto do mapa antes e depois). Desfazer aplica o patch ao contrário (`client/editor/history.ts`, até 200 edições; Ctrl+Z, Ctrl+Y e Ctrl+Shift+Z). O documento é puro (testado sem tela).
- **Pose (P32).** O gizmo segura a peça num ponto (o lugar de uma peça `livre`, o meio do que as outras montam). Uma peça `livre` movida e girada em torno do eixo vertical continua só com `p`, `yaw` e `escala`; qualquer outro giro, e todo movimento de peça `linear` ou `fixa`, vira a **pose** da peça (`Peca.pose`, transformação rígida aplicada a tudo o que ela monta: ver o ADR dos mapas). Mover a bruxa, um rato ou uma peça com coletável leva junto o lugar dele em `objetos` (o servidor confere por lá).
- **Peças novas** copiam o primeiro exemplo do tipo nos mapas oficiais (cada tipo usado neles tem um exemplo montável; os outros vêm dos padrões do esquema). Peças `linear` e `fixa` caem no lugar certo pela pose (o editor monta o exemplo uma vez, fora do mapa, para achar o meio).
- **Orçamento como o servidor.** O editor mostra cada peça à parte, então o custo de desenho é medido montando o mapa de novo **no modo jogo**, fora da tela (cena e mundo físico próprios), com `measureMapBudget`, 600 ms depois da última edição. Salvar fica desligado acima de `MAP_BUDGET` ou com dados inválidos.
- **Testar** grava o rascunho no IndexedDB (`oc-mapas` versão 2, store `rascunhos`; o store `versoes` continua) e recarrega a página no treino sobre ele; o que precisa atravessar o recarregamento vai no `sessionStorage` (`oc.editor`). Sair do teste volta ao editor no mesmo rascunho.
- **Salvar** usa a API da fase 2 (`POST /api/mapas`, `PUT /api/mapas/:id` com `baseVersao`); `validateMapData` roda antes de enviar. 409, `orcamento_excedido` e `mapa_invalido` são mostrados como vêm; nada é sobrescrito sozinho.
- **Textos** do editor em `client/editor/strings.ts` (pt e en, a língua do jogo).

## Motivo

Reaproveitar o carregador do jogo garante que o editor mostra o que o jogo monta (inclusive GLB, salas e piadas) e que a reconstrução de uma peça é a mesma montagem. A pose resolve a P32 sem reescrever os ~145 adaptadores nem os parâmetros de cada tipo, e deixa a peça sem pose idêntica (golden e navmesh). Medir no modo jogo dá o mesmo número que o servidor, que é quem decide.

## Consequências

- Uma peça com pose tem coleções próprias (uma malha a mais por coleção usada); lanternas de papel e recortes de lago (`holes`) de peças com pose ficam fora das listas do mapa inteiro.
- Medir o orçamento monta o mapa inteiro de novo: nos mapas grandes (Vila Assombrada) leva algumas centenas de milissegundos na thread da página, depois de cada edição.
- O editor desenha sem lotes entre peças: os oficiais grandes custam mais para desenhar no editor do que no jogo.

Relacionado: [[ADR - Mapas como dados com catálogo de peças]] · [[ADR - Sessões sob demanda por versão do mapa]] · [[ADR - Papéis da equipe conferidos no servidor]] · [[World Structure]] · [[Unit Tests]]
