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
  - client/editor/groups.ts
  - client/editor/palette.ts
  - client/editor/style.ts
  - client/editor/strings.ts
  - client/tests/editorLayout.test.ts
  - client/tests/editorGroups.test.ts
tags:
  - ui
  - ux
  - editor
  - maps
updated: 2026-10-07
---

# Map Editor UI

A janela do editor de mapas no jogo, no estilo do editor do Unity (PF-6 Revisions 01, etapa 2 de 4). O que o editor faz com os dados está em [[ADR - Editor de mapas no jogo]]; o formato do mapa (peças, pose, grupos) em [[World Structure]].

## Visão geral (nível 1)

O editor ocupa a página inteira (`#editor`, criado em código; sem HUD nem entrada do jogo) em três faixas:

```text
┌──────────────────────────── toolbar ────────────────────────────┐
│ título · desfazer refazer · mover girar escalar · [ ] [ ] ·  ▶ ❚❚ ■  · centralizar duplicar apagar · Layout ▾ · Salvar Sair │
├───────────────┬───────────────────────────────┬─────────────────┤
│  Hierarquia   │            Cena               │                 │
│               │      (canvas do three.js)     │    Inspetor     │
├───────────────┴───────────────────────────────┤                 │
│                    Projeto                    │                 │
├────────────────────────── barra de status ──────────────────────┤
│ orçamento · mensagens · atalhos                                  │
└──────────────────────────────────────────────────────────────────┘
```

- **Toolbar**: os botões de sempre; **▶ Play** abre o teste do mapa (o mesmo "Testar" de antes, que recarrega a página); **Pause** e **Stop** ficam desligados até o Play rodar dentro do editor (etapa 4). Dois lugares vazios (`data-slot="pivo"` e `data-slot="grade"`) esperam Pivot/Center, Local/Global e o botão de grade (etapa 3). **Layout ▾** tem "Restaurar layout padrão".
- **Painéis encaixáveis** (Hierarquia, Cena, Inspetor, Projeto): cada um é uma aba numa pilha. Arrastar a aba (mais de 6 px) mostra onde ela cai na pilha sob o ponteiro: no **meio**, entra na pilha como mais uma aba; numa **borda** (um quarto de cada lado), divide a pilha e fica à esquerda, à direita, em cima ou embaixo. Esc desiste. Clicar numa aba a traz para a frente. As **bordas** entre painéis se arrastam para redimensionar (cada lado fica com pelo menos 6%). O layout fica no `localStorage` (`oc.editor.layout.v1`); um layout guardado quebrado (sem um painel, com painel repetido, tamanhos inválidos) volta ao padrão. O canvas da cena acompanha o tamanho do painel Cena a cada quadro.
- **Barra de status**: a barra de orçamento, as mensagens do editor e os atalhos.

## Hierarquia

- As peças do mapa em árvore: grupos (▣, com o número de filhos) abrem e fecham pela seta; os filhos aparecem na ordem da lista do mapa. No fim, a seção **Marcadores** (spawns, bonecos, objetos, dados do zumbi), que não entra em grupos.
- **Selecionar**: clique (substitui), Ctrl+clique (soma ou tira), Shift+clique (o trecho desde a última clicada). A seleção é a mesma da cena: selecionar na cena marca a linha, abre os grupos acima dela e rola até ela.
- **Criar**: "+" → **Grupo vazio** (no meio da Cena) ou **Agrupar a seleção** (Ctrl+G; o grupo nasce no meio da seleção, no lugar da primeira peça, dentro do grupo que elas compartilham). O grupo novo já abre renomeando.
- **Arrastar** linhas (a seleção inteira, se a linha estiver nela): no meio de um grupo, entra no fim dele; na borda de cima ou de baixo de uma linha, vai antes ou depois dela, no grupo dela; no espaço vazio abaixo das linhas, sai de todos os grupos e vai para o fim. As peças **não saem do lugar no mundo** (o lugar delas no referencial do grupo é recalculado, como no Unity). Um grupo não entra nele mesmo nem num grupo de dentro dele (a barra de status avisa).
- **Renomear**: F2 ou duplo clique; Enter guarda, Esc desiste, vazio volta ao `id` (o nome vai em `Peca.nome`).
- **Busca**: mostra, sem árvore, as peças cujo nome, id ou tipo batem.

## Inspetor

- **Nome** (o `Peca.nome`, com o `id` como dica) e o tipo.
- **Transform**: **Posição** (m), **Rotação** (graus, Euler X, Y, Z) e **Escala**, do lugar onde o gizmo segura a peça, no referencial do grupo dela (o mundo, fora de grupos). Digitar um valor e sair do campo aplica; **arrastar a letra** X, Y ou Z muda o valor ao vivo (0,02 m, 0,5° ou 0,005 por pixel; Shift dez vezes mais) e aplica ao soltar, numa edição só. O que foi digitado continua igual enquanto dá a mesma matriz (200° fica 200°). A escala só vale para tipos com `escala` e para grupos (o grupo escala os filhos e volta a mostrar 1); nos outros o campo fica desligado. "Tirar a pose" volta a peça ao lugar dos parâmetros.
- O **componente do tipo**: semente, id da piada, coletável e os parâmetros do esquema (o formulário de antes).
- **Seleção múltipla**: o título diz quantas; o Transform mostra o valor quando é igual em todas e um traço quando difere, e a edição vale para cada uma (digitar põe o mesmo valor; arrastar soma o mesmo tanto). Os parâmetros aparecem quando todas são do mesmo tipo, com os valores da última e um "≠" nos que diferem; a edição vai para todas. Peças dentro de um grupo também selecionado não são editadas duas vezes.
- Marcador selecionado e nada selecionado (as configurações do mapa) continuam como antes.

## Cena

- A câmera, o clique, o gizmo, as pontas e vãos continuam como na fase 3 ([[ADR - Editor de mapas no jogo]]); a câmera do Scene View, os atalhos Q/W/E/R/T, o Ctrl para encaixar e a seleção por caixa vêm na etapa 3.
- Com várias peças, o gizmo fica na última escolhida e mexe todas juntas (girar e escalar em volta dela). Cada peça selecionada mostra a sua caixa (a ativa em amarelo forte); a de um grupo cobre tudo o que está nele.

## Projeto

A paleta de sempre (tipos por categoria com busca, modelos GLB, marcadores), em lista, até ganhar miniaturas e arrastar para a cena (etapa 4).

## Atalhos

Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, Ctrl+D (duplica a seleção; um grupo com os filhos), Ctrl+G (agrupa), F2 (renomeia), Delete (apaga; um grupo com os filhos), F (centraliza a seleção), Esc (tira a seleção), 1/2/3 (mover, girar, escalar), WASD e Q/E com o botão direito (câmera).

## Código relacionado

- `client/editor/editor.ts` — monta a janela, liga painéis, seleção, gizmo, Transform e Hierarquia.
- `client/editor/dock.ts` (DOM) e `client/editor/dockLayout.ts` (árvore do layout, sem tela).
- `client/editor/hierarchy.ts`, `client/editor/inspector.ts`, `client/editor/transformFields.ts`, `client/editor/selection.ts`, `client/editor/groups.ts`.
- `client/editor/style.ts` (CSS do editor) e `client/editor/strings.ts` (textos pt e en).

Relacionado: [[UI Overview]] · [[Menus]] · [[ADR - Editor de mapas no jogo]] · [[ADR - Lotes do editor com BatchedMesh]] · [[Unit Tests]]
