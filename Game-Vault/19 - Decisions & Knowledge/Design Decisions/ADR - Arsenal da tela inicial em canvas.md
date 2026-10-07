---
title: ADR - Arsenal da tela inicial em canvas
type: decision
status: documented
area: ui
source_paths:
  - client/ui/arsenalCanvas.ts
  - client/ui/arsenalCanvasLayout.ts
  - client/ui/arsenalTree.ts
  - client/ui/arsenal.ts
  - client/ui/home.ts
  - client/ui/padNav.ts
  - client/ui/strings.ts
  - client/styles.css
  - index.html
tags:
  - game
  - decision
  - ui
  - inventory
updated: 2026-10-06
---

# ADR - Arsenal da tela inicial em canvas

> [!info] Substitui em parte
> Muda o item 1 de [[ADR - Árvore do Arsenal e armas liberadas por nível]] (a árvore em linhas) **só na aba Arsenal da tela inicial**. O menu de pausa e o campo de tiro continuam com a árvore. As regras de arma, trava, melhoria e salvamento daquela ADR e de [[ADR - Rifles e facas antigos como armas próprias]] continuam valendo.
>
> Origem: issue PF-9 do Jira ("Arsenal em canvas com arrastar, zoom e painel de detalhes"), com as decisões P1 a P7 respondidas pelo dev em 06/10/2026 (plano "PF-9 PLANO" no Confluence, espaço PF), a partir do design "Arsenal Canvas" (Claude Design, projeto "Interface de Arsenal Interativo").

## Contexto

A PF-7 desenhou o Arsenal como uma árvore em linhas, e a PF-8 pôs sete rifles e sete facas nela. As linhas de armas e as cadeias de melhorias ficaram longas: na aba Arsenal da tela inicial era preciso rolar de lado em cada linha e rolar a página entre elas.

## Problema

Mostrar as quatro linhas, as armas e as melhorias de forma navegável, sem rolagens dentro de rolagens, no PC, no celular e com controle.

## Opções consideradas

- **Dados**: os do jogo de hoje (escolhida) × os dados de exemplo do design (uma faca só, frango e sabre como melhorias, cinco rifles), que desfariam a PF-8.
- **Onde**: só na aba da tela inicial (escolhida) × também no menu de pausa, num cartão pequeno.
- **Layout**: a aba em altura total, sem rolar a página (escolhida, como no design) × canvas com altura fixa numa página que rola.
- **Controle**: o foco passa de nó em nó com a câmera acompanhando e o analógico direito move o canvas (escolhida) × só o foco.
- **Câmera ao voltar à aba**: mantida enquanto a página está aberta (escolhida) × enquadrar de novo toda vez.

## Decisão

1. A aba Arsenal da tela inicial é um canvas (`ArsenalCanvas`): um quadro por espaço (Principal, Secundária, Corpo a corpo, Arremesso), as armas ligadas lado a lado e, embaixo da arma mostrada, a cadeia de melhorias da progressão dela. As medidas, as cores, a legenda e os atalhos (Esc, +, −, 0) são os do design. Ver [[Inventory UI]].
2. Arrastar move; a roda, a pinça e os botões − e + dão zoom de 25% a 200%; a rolagem lateral do trackpad move; "Ver tudo", os botões de pular e o minimapa movem a câmera.
3. Cada melhoria liga e desliga no próprio nó; clicar numa arma abre um painel à direita (Equipar, progresso, atributos, descrição, melhorias e o detalhe da melhoria escolhida). Os dados vêm de `arsenalTree`/`upgradeNodes`, e salvar continua no `Progress` (um salvamento por vez; falha desfaz e avisa).
4. A aba ocupa a altura da tela; abaixo de 1.000 px de largura o personagem sai; com o canvas abaixo de 440 × 640 px o minimapa sai. No toque, o texto de ajuda fala em dois dedos.
5. Com controle, o direcional move o foco e a câmera voa até o nó; o analógico direito move o canvas: `PadNav` dispara `pad-pan` no elemento com `data-pad-pan` em vez de rolar.
6. Um canvas por página: a câmera, o zoom e o painel aberto ficam como estavam ao voltar à aba (a primeira abertura enquadra tudo ou o canto de cima a 72%).

## Motivo

- É o que o dev pediu (o design), com os dados que o jogo tem.
- Um canvas cabe qualquer número de armas e melhorias sem rolagem aninhada, e os botões de pular e o minimapa mostram onde se está.
- O menu de pausa é pequeno para um canvas e é só consulta na partida.

## Consequências

- Há duas apresentações do Arsenal com o mesmo modelo de dados e o mesmo salvamento: a árvore (`Arsenal`, menu de pausa e campo de tiro) e o canvas (`ArsenalCanvas`, tela inicial). Uma regra nova de Arsenal entra no modelo (`arsenalTree`) e aparece nas duas.
- A página da tela inicial não rola na aba Arsenal.
- `PadNav` ganhou o evento `pad-pan` para telas que se movem em vez de rolar.
- Os textos de quadro e de espaço do canvas (`cvRow_*`, `cvSlot_*`) são diferentes dos da árvore (`treeRow_*`): "Corpo a corpo" e "Arremesso" no lugar de "Faca" e "Granada".

## Código afetado

- `client/ui/arsenalCanvasLayout.ts` (novo: geometria e câmera), `client/ui/arsenalCanvas.ts` (novo: o canvas), `client/ui/arsenal.ts` (exporta `esc`, `num` e `gunStatBars`), `client/ui/home.ts`, `client/ui/padNav.ts`, `client/ui/strings.ts`, `client/styles.css`, `index.html`
- Testes: `client/tests/arsenalCanvasLayout.test.ts` (novo), `client/tests/arsenalText.test.ts`

Relacionado: [[Inventory UI]] · [[Menus]] · [[Input & Controls]] · [[ADR - Árvore do Arsenal e armas liberadas por nível]]
