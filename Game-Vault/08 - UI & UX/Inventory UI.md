---
title: Inventory UI
type: system
status: documented
area: ui
source_paths:
  - shared/modes.ts
  - client/ui/ladder.ts
  - client/ui/arsenal.ts
  - client/ui/arsenalTree.ts
  - client/ui/arsenalCanvas.ts
  - client/ui/arsenalCanvasLayout.ts
  - client/ui/padNav.ts
  - client/ui/hud.ts
  - client/ui/home.ts
  - client/ui/strings.ts
  - client/gameplay/progress.ts
  - client/main.ts
  - client/styles.css
  - index.html
tags:
  - game
  - ui
  - inventory
updated: 2026-10-06
---

# Inventory UI

Não há mochila nem roda de armas: o jogador carrega sempre **uma primária, uma secundária, uma faca e granadas** ([[Inventory]]). A "tela de inventário" é o **Arsenal**, onde se vê o que cada arma tem e o que falta liberar, se equipa o rifle, a secundária e a faca e se liga ou desliga qualquer melhoria liberada. Ele tem duas apresentações com os mesmos dados (`arsenalTree`) e o mesmo salvamento (`Progress`): o **canvas** na aba Arsenal da tela inicial e a **árvore** no menu de pausa e no campo de tiro. Em partida, o [[HUD]] mostra as duas armas e a troca é por tecla ([[Weapons]]).

## Arsenal da tela inicial (canvas)

A aba **Arsenal** da tela inicial (`#home-arsenal`) é um canvas que se arrasta e tem zoom, montado pela classe `ArsenalCanvas` (`client/ui/arsenalCanvas.ts`) sobre a geometria pura de `client/ui/arsenalCanvasLayout.ts`, com as medidas e as cores do design "Arsenal Canvas". Decisão em [[ADR - Arsenal da tela inicial em canvas]].

```text
┌ PRINCIPAL  Equipada: Rifle da Tia do Zap ──────────────────────────────────────────────┐
│ [Rifle Padrão]──[Remendado com Fita]──[Tia do Zap ✓]──[Pisca-Pisca]──…──[Dourado 🔒]   │
│                                    └─[🔴 2 Ponto vermelho · DESLIGADA]──[🧹 3 Empunhadura · LIGADA]──…│
└──────────────────────────────────────────────────────────────────────────────────────┘
┌ SECUNDÁRIA … ┐  ┌ CORPO A CORPO … ┐  ┌ ARREMESSO  Sempre equipada ┐
[PRINCIPAL | SECUNDÁRIA | CORPO A CORPO | ARREMESSO]  (pular)      painel à direita ao clicar numa arma
[minimapa]  [− 72% + | VER TUDO]
```

| Parte | O que faz |
| --- | --- |
| Quadros | Um por espaço, um embaixo do outro: **Principal**, **Secundária**, **Corpo a corpo** e **Arremesso**, com "Equipada: {arma}" (o arremesso: "Sempre equipada") |
| Nós de arma | As armas do espaço lado a lado, na ordem em que liberam, ligadas por uma linha (apagada até a trancada). Ícone num quadrado da cor do espaço, nome e "✓ Equipada · Nível N/total", "Nível N/total" ou "🔒 faltam N pts de {progressão}" (fundo cinza, borda tracejada) |
| Cadeia de melhorias | Embaixo da arma mostrada (a clicada, senão a equipada), as melhorias da progressão dela ligadas em sequência. Cada nó tem ícone, nível, nome e o botão **Ligada/Desligada** (liga e desliga ali mesmo); trancada mostra "🔒 faltam N pts", e a de uma arma trancada "🔒 Arma bloqueada". A linha até uma melhoria ligada fica **laranja**; até uma trancada, pontilhada. Opcional liberada leva a etiqueta "Opcional" |
| Painel | Abre à direita ao clicar numa arma (e a câmera enquadra a arma e a cadeia dela): espaço e nível, nome, **Equipar** ("Levar como secundária" na secundária) ou "✓ Equipada"/"Sua secundária"/"Sempre equipada" ou a trava em pontos; progresso; atributos das armas de fogo; descrição; "Melhorias: N de M ligadas" e o detalhe da melhoria clicada (descrição, fichas de ganho e troca, "Substituída por …", botão "Ligada · toque para desligar" ou a trava). Fecha no ✕, no Esc, no ◯/B ou tocando no fundo |
| Câmera | Arrastar move; roda do mouse dá zoom em volta do ponteiro; rolagem lateral do trackpad move; pinça (dedos ou trackpad) dá zoom; **− / +** e as teclas − e + dão zoom pelo centro; **Ver tudo** (tecla 0) enquadra os quatro quadros; zoom de 25% a 200%. Um arrasto de mais de 4 px não conta como clique |
| Pular | Botões no canto de cima levam a cada quadro; o do quadro da arma aberta fica escuro |
| Minimapa | No canto de baixo: os quadros, as armas e as melhorias em miniatura e o retângulo laranja da área vista; clicar ou arrastar nele move a câmera. Some com o canvas abaixo de 440 px de altura ou 640 px de largura |
| Legenda | No cabeçalho da aba: Ligada, Desligada, Bloqueada |

- A aba ocupa a **altura da tela** (`#home-in.arsenal-open`): a página não rola. Abaixo de 1.000 px de largura o cartão do personagem some para o canvas ter espaço.
- Texto de ajuda do PC: "Arraste para navegar e use a roda do mouse para dar zoom…"; no celular (`.mobile`): "…use dois dedos para dar zoom. Toque numa arma…".
- **Controle**: os nós são botões, então o D-pad passa de arma em arma e de melhoria em melhoria (`PadNav`), e a câmera voa até o nó com foco; o **analógico direito move o canvas** (o viewport tem `data-pad-pan` e recebe o evento `pad-pan`); o zoom fica nos botões − e +. No painel, o analógico direito rola o painel.
- A primeira abertura enquadra tudo (se couber a 72% ou mais) ou o canto de cima a 72%. É **um canvas por página**: saindo da aba e voltando, a câmera, o zoom e o painel aberto ficam como estavam (a página recarrega ao sair de uma partida).
- Ligar, desligar e equipar seguem as regras de baixo (uma por grupo, um salvamento por vez, falha desfaz e avisa na linha de status).

Textos: os do canvas são `arsenalCanvasHint`, `arsenalCanvasHintTouch`, `cvLegendLocked`, `cvRow_*`, `cvSlot_*`, `cvFrameEquipped`, `cvAlwaysEquipped`, `cvEquipSecondary`, `cvYourSecondary`, `cvProgress`, `cvUpgrades`, `cvOnCount`, `cvOptional`, `cvWeaponLocked`, `cvUnlockWeaponFirst`, `cvToggleOn`/`cvToggleOff`, `cvPickUpgrade`, `cvFitAll`/`cvFitTitle`, `cvZoomIn`/`cvZoomOut` e `cvClose`, além dos da árvore (nomes, descrições, fichas, travas). `client/tests/arsenalCanvasLayout.test.ts` confere a geometria e a câmera.

## Arsenal (árvore)

Painel do menu de início/pausa (`#arsenal-grid`, também no campo de tiro), montado pela classe `Arsenal` (`client/ui/arsenal.ts`) a partir do modelo puro `arsenalTree` (`client/ui/arsenalTree.ts`). Até a PF-9 ele também era a aba Arsenal da tela inicial. Decisões em [[ADR - Árvore do Arsenal e armas liberadas por nível]] e [[ADR - Rifles e facas antigos como armas próprias]].

```text
PRINCIPAL   [Rifle Padrão ✓ Equipada]──[Remendado com Fita]──[da Tia do Zap 🔒 faltam N pts de rifle]──…──[Dourado Ostentação 🔒]
             painel do rifle clicado → melhorias do rifle em cadeia: [Ponto vermelho]─[Empunhadura]─[Luneta]─[Pente 🔒]─…─[Luneta 4x 🔒]
SECUNDÁRIA  [Pistola ✓ Equipada]──[Submetralhadora 🔒 faltam N pts de pistola]
             painel da arma clicada (começa na equipada)
FACA        [Faca de Cozinha ✓]──[Colher de Pau]──[Frango de Borracha 🔒]──…──[Sabre de Luz 🔒]
             painel da faca clicada → [Afiador]─[Tênis 🔒]
GRANADA     [Granada ✓]     painel com mina e dose dupla
```

| Parte | O que mostra |
| --- | --- |
| Linha | Uma por espaço, as armas na ordem em que liberam: **Principal** (`PRIMARIES`: os sete rifles), **Secundária** (`SECONDARIES`: pistola, depois submetralhadora), **Faca** (`KNIVES`: as sete facas) e **Granada** (`TREE_ROWS`). No celular, as cadeias rolam para o lado |
| Nó de arma | Botão com ícone, nome e "✓ Equipada", "Nível N/total" ou, se trancada, "🔒 faltam N pts de {progressão}" (ex.: "faltam 600 pts de faca"; borda tracejada). Clicar mostra o painel dela, **inclusive de uma trancada** (ver o que vem) |
| Painel | Ícone, "Nível N/total" (o da progressão: todo rifle mostra o nível do rifle), nome e: selo **✓ Equipada**, botão **Equipar** (arma liberada e não equipada, nas linhas Principal, Secundária e Faca) ou "Trancada: libera com {total} pontos de {progressão}. Faltam X." |
| Pontos | Barra laranja e **"Faltam X pontos para o nível N"** (ou "Nível máximo!") |
| Atributos | Nas armas de fogo: barras de Dano, Cadência, Precisão, Alcance e Mobilidade e "Pente N / reserva M", **já com as melhorias em efeito** (`gunStats`) |
| Melhorias | Uma **cadeia em ordem de nível** com as melhorias da progressão da arma (as mesmas para os sete rifles, e para as sete facas): ícone, nível, nome e o estado — 🔒 com **os pontos que faltam** (trancada) ou um **interruptor Ligada/Desligada** (liberada, comum ou opcional). Uma comum desligada por causa de uma opcional do grupo mostra "Substituída por {opcional}". Abaixo, fichas com o que ela muda: verdes para o ganho, vermelhas para a troca, amarela "Opcional: tem troca" |
| Descrição | A descrição engraçada da melhoria sob o mouse ou com foco; sem nenhuma, a da arma |

- **Uma por grupo**: ligar uma opcional substitui as comuns do grupo e desliga a outra opcional (as quatro miras opcionais do rifle × o ponto vermelho; mina × dose dupla); ligar a comum desliga a opcional do grupo.
- Ligar uma melhoria num rifle vale para todos os rifles (o interruptor é da progressão, `data-w` = `rifle`); o mesmo para as facas.
- Cada mudança chama `progress.toggle(progressão, id, ligada)` ou, no botão Equipar, `progress.setPrimary`, `setSecondary` ou `setKnife` (conforme a linha), que grava na conta (`PATCH /api/perfil {arsenal}`) **um salvamento por vez** (cliques rápidos: só a última escolha que esperava é enviada). Se o salvamento falha (sem internet, servidor recusou), a tela **volta à última escolha que a conta tem** e avisa "Não foi possível salvar o Arsenal" (na tela inicial, na linha de status; no campo de tiro, num aviso do HUD, e as armas na mão voltam junto). Ao entrar numa sessão, a home manda a escolha ao servidor (`loadout` no saguão).
- **Na partida o Arsenal é só leitura** em todo modo de jogo (mata-mata online e contra bots): dá para clicar nas armas e ver as árvores, mas os interruptores ficam desabilitados, não há botão Equipar e aparece o aviso "Equipamento travado durante a partida: aqui você só consulta a árvore…" (`new Arsenal(..., readOnly = true)`). Só no **campo de tiro** ele segue editável, com `applyLoadout(progress.loadout, true)` pondo as armas novas na mão. Ver [[ADR - Equipamento travado no mata-mata]].
- Na **corrida armada** o menu de pausa mostra a **escada** no lugar do Arsenal (`renderLadder`, `client/ui/ladder.ts`) e no **zumbi** o caixão. Ver [[Gun Game]].
- Sem conta, tudo fica no nível 1 e as **armas com trava aparecem trancadas** (como numa conta nova); a aba Arsenal da tela inicial (o canvas) é só de quem tem conta, e o visitante vê a árvore no menu do campo de tiro, sem salvar nada.
- Na tela inicial, o canvas usa um `Progress` próprio montado do perfil (um novo a cada carga da conta, `ArsenalCanvas.attach`); o cartão do personagem mostra os ícones do que vai para a partida (o rifle, a secundária e a faca escolhidos e a granada na forma escolhida — `weaponIcon`).
- O foco é preservado entre redesenhos (`data-key`): controle e teclado navegam pelos botões (nós de arma, Equipar e interruptores; ver [[Menus]]).

Textos: nomes, descrições e fichas vêm de `client/ui/strings.ts` (`arma_*`, `armaDesc_*`, `prog_*` (nome curto da progressão), `upg_<progressão>_<id>`, `upgDesc_*`, `fx_*`, `treeRow_*`, `treeEquip`, `treeWeaponLocked*`, `upgradeReplacedBy`, `arsenalSaveFailed`), em pt-BR e inglês; `client/tests/arsenalText.test.ts` confere que nenhuma arma, melhoria ou linha da árvore fica sem texto, e `client/tests/arsenalTree.test.ts` confere o modelo da árvore.

## Em partida

| Necessidade | Onde está | Nota |
| --- | --- | --- |
| Trocar de arma | `1`/`2`, roda do mouse, D-pad ←/→, botão de troca no celular | [[Weapons]], [[Input & Controls]], [[Touch Controls]] |
| Ver munição das duas armas | [[HUD]]: o pente grande da arma na mão e, abaixo, as duas armas com tecla, nome e munição (a da mão acesa; pisca enquanto saca) | `hud.setWeaponSlots` |
| Ver granadas | [[HUD]] | ícones com recarga progressiva |
| Ver efeitos ativos | Painel de bônus do [[HUD]] | [[Buffs & Debuffs]] |
| Itens cosméticos | Editor de personagem (`client/ui/customize.ts`) | [[Character Customization]] |

## Código relacionado

- `client/ui/arsenal.ts` — classe `Arsenal` (desenha a árvore do menu de pausa); `weaponName`, `progName`, `upgradeName`, `weaponLabel`, `weaponIcon`, `effectChips`, `gunStatBars`, `esc`, `num` (usados também no canvas, no kill feed e na tela inicial).
- `client/ui/arsenalCanvas.ts` — classe `ArsenalCanvas` (o canvas da tela inicial: desenho, câmera, arrastar, pinça, roda, teclas, painel, minimapa, `pad-pan`).
- `client/ui/arsenalCanvasLayout.ts` — `canvasLayout` (quadros, nós, linhas e limites, sem DOM) e a câmera: `zoomAt`, `homeView`, `fitView`, `rowView`, `weaponView`, `revealView`, `clampZoom`.
- `client/ui/arsenalTree.ts` — `TREE_ROWS`, `arsenalTree`, `weaponNode`, `upgradeNodes`: o modelo puro da árvore (linhas, armas, estados e pontos que faltam).
- `client/gameplay/progress.ts` — `Progress` (XP, níveis, `unlocked`, `toUnlock`, `choice`, `loadout`, `toggle`, `setPrimary`, `setSecondary`, `setKnife`, fila de salvamento, `onSaveError`, `settled`, `applyServer`).
- `client/main.ts` — `applyLoadout`, `switchTo`, `holdSlot`.
- `shared/progression.ts`, `shared/arsenal.ts` — dados e atributos ([[Progression]], [[Shared Systems]]).
