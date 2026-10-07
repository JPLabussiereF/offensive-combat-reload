---
title: Inventory UI
type: system
status: documented
area: ui
source_paths:
  - shared/modes.ts
  - client/ui/ladder.ts
  - client/ui/arsenal.ts
  - client/ui/arsenalStats.ts
  - client/ui/pauseMenu.ts
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
updated: 2026-10-07
---

# Inventory UI

Não há mochila nem roda de armas: o jogador carrega sempre **uma primária, uma secundária, uma faca e granadas** ([[Inventory]]). A "tela de inventário" é o **Arsenal**, onde se vê o que cada arma tem e o que falta liberar, se equipa o rifle, a secundária e a faca e se liga ou desliga qualquer melhoria liberada. Ele tem duas apresentações com os mesmos dados (`arsenalTree`) e o mesmo salvamento (`Progress`): o **canvas** na aba Arsenal da tela inicial (a progressão inteira) e o **cartão por espaço** na aba Arsenal do menu de pausa (o que está em uso; editável só no campo de tiro). A árvore em linhas saiu do jogo na PF-11 ([[ADR - Menu de pausa com trilho e abas]]). Em partida, o [[HUD]] mostra as duas armas e a troca é por tecla ([[Weapons]]).

## Arsenal da tela inicial (canvas)

A aba **Arsenal** da tela inicial (`#home-arsenal`) é um canvas que se arrasta e tem zoom, montado pela classe `ArsenalCanvas` (`client/ui/arsenalCanvas.ts`) sobre a geometria pura de `client/ui/arsenalCanvasLayout.ts`, com as medidas e as cores do design "Arsenal Canvas". Decisão em [[ADR - Arsenal da tela inicial em canvas]].

```text
┌ PRINCIPAL  Equipada: Rifle da Tia do Zap ──────────────────────────────────────────────┐
│ [Rifle Padrão]──[Remendado com Fita]──[Tia do Zap ✓]──[Pisca-Pisca]──…──[Dourado 🔒]   │
│                                    │ (MIRAS)                                                │
│                                    ├─[🔴 2 Ponto vermelho · DESLIGADA]──[🔭 4 Luneta do Vovô]──…│
│                                    │ (MELHORIAS)                                            │
│                                    └─[🧹 3 Empunhadura · LIGADA]──[🩹 5 Pente]──[🍾 6 Silenciador] │
└──────────────────────────────────────────────────────────────────────────────────────┘
┌ SECUNDÁRIA … ┐  ┌ CORPO A CORPO … ┐  ┌ ARREMESSO  Sempre equipada ┐
[PRINCIPAL | SECUNDÁRIA | CORPO A CORPO | ARREMESSO]  (pular)      painel à direita ao clicar numa arma
[minimapa]  [− 72% + | VER TUDO]
```

| Parte | O que faz |
| --- | --- |
| Quadros | Um por espaço, um embaixo do outro: **Principal**, **Secundária**, **Corpo a corpo** e **Arremesso**, com "Equipada: {arma}" (o arremesso: "Sempre equipada") |
| Nós de arma | As armas do espaço lado a lado, na ordem em que liberam, ligadas por uma linha (apagada até a trancada). Ícone num quadrado da cor do espaço, nome e "✓ Equipada · Nível N/total", "Nível N/total" ou "🔒 faltam N pts de {progressão}" (fundo cinza, borda tracejada) |
| Melhorias em linhas | Embaixo da arma mostrada (a clicada, senão a equipada), as melhorias da progressão dela em **linhas por tipo**, cada uma com um rótulo: **Miras** (as que mudam a mira: ponto vermelho, lunetas, holo com lupa, holográfica), **Modo** (mina e dose dupla da granada) e **Melhorias** (o resto). Cada linha segue a ordem dos níveis; um tipo que a arma não tem não ganha linha (a faca fica com uma só). Um tronco desce da arma e cada linha sai dele (PF-9, Revisions 01). Cada nó tem ícone, nível, nome e o botão **Ligada/Desligada** (liga e desliga ali mesmo); trancada mostra "🔒 faltam N pts", e a de uma arma trancada "🔒 Arma bloqueada". A linha até uma melhoria ligada fica **laranja**; até uma trancada, pontilhada. Opcional liberada leva a etiqueta "Opcional" |
| Painel | Abre à direita ao clicar numa arma (e a câmera enquadra a arma e a cadeia dela): espaço e nível, nome, **Equipar** ("Levar como secundária" na secundária) ou "✓ Equipada"/"Sua secundária"/"Sempre equipada" ou a trava em pontos; progresso; atributos (das armas de fogo e, desde 2026-10-07, das facas: alcance do golpe, investida, rapidez e discrição, um por linha, também numa faca trancada); numa faca, o **bloco verde da passiva** ("Passiva: {nome}", a descrição com os números e "Vale no mata-mata, no treino e contra bots.", [[ADR - Passivas das facas e Mão Leve]]); descrição; "Melhorias: N de M ligadas" e o detalhe da melhoria clicada (descrição, fichas de ganho e troca, "Substituída por …", botão "Ligada · toque para desligar" ou a trava). Fecha no ✕, no Esc, no ◯/B ou tocando no fundo |
| Câmera | Arrastar move; roda do mouse dá zoom em volta do ponteiro; rolagem lateral do trackpad move; pinça (dedos ou trackpad) dá zoom; **− / +** e as teclas − e + dão zoom pelo centro; **Ver tudo** (tecla 0) enquadra os quatro quadros; zoom de 25% a 200%. Um arrasto de mais de 4 px não conta como clique |
| Pular | Botões no canto de cima levam a cada quadro; o do quadro da arma aberta fica escuro |
| Minimapa | No canto de baixo: os quadros, as armas e as melhorias em miniatura e o retângulo laranja da área vista; clicar ou arrastar nele move a câmera. Some com o canvas abaixo de 440 px de altura ou 640 px de largura |
| Legenda | No cabeçalho da aba: Ligada, Desligada, Bloqueada |

- A aba ocupa a **altura da tela** (`#home-in.arsenal-open`): a página não rola. Abaixo de 1.000 px de largura o cartão do personagem some para o canvas ter espaço.
- Texto de ajuda do PC: "Arraste para navegar e use a roda do mouse para dar zoom…"; no celular (`.mobile`): "…use dois dedos para dar zoom. Toque numa arma…".
- **Controle**: os nós são botões, então o D-pad passa de arma em arma e de melhoria em melhoria (`PadNav`), e a câmera voa até o nó com foco; o **analógico direito move o canvas** (o viewport tem `data-pad-pan` e recebe o evento `pad-pan`); o zoom fica nos botões − e +. No painel, o analógico direito rola o painel.
- A primeira abertura enquadra tudo (se couber a 72% ou mais) ou o canto de cima a 72%. É **um canvas por página**: saindo da aba e voltando, a câmera, o zoom e o painel aberto ficam como estavam (a página recarrega ao sair de uma partida).
- Ligar, desligar e equipar seguem as regras de baixo (uma por grupo, um salvamento por vez, falha desfaz e avisa na linha de status).
- **Nitidez**: o mundo do canvas não tem `will-change` e a câmera anda em pixels inteiros, então o navegador redesenha o texto e os ícones a cada zoom em vez de esticar uma imagem (antes da PF-9 Revisions 01, o canvas ficava desfocado ao lado do resto da tela).

Textos: os do canvas são `arsenalCanvasHint`, `arsenalCanvasHintTouch`, `cvLegendLocked`, `cvRow_*`, `cvSlot_*`, `cvUpgRow_*` (rótulos das linhas de melhorias), `cvFrameEquipped`, `cvAlwaysEquipped`, `cvEquipSecondary`, `cvYourSecondary`, `cvProgress`, `cvUpgrades`, `cvOnCount`, `cvOptional`, `cvWeaponLocked`, `cvUnlockWeaponFirst`, `cvToggleOn`/`cvToggleOff`, `cvPickUpgrade`, `cvFitAll`/`cvFitTitle`, `cvZoomIn`/`cvZoomOut` e `cvClose`, além dos da árvore (nomes, descrições, fichas, travas). `client/tests/arsenalCanvasLayout.test.ts` confere a geometria e a câmera.

## Arsenal do menu de pausa (cartão por espaço)

A aba **Arsenal** do menu de pausa e do cartão de início (mata-mata online e contra bots, campo de tiro), montada pela classe `ArsenalPanel` (`client/ui/arsenal.ts`) a partir do modelo puro (`weaponNode` de `client/ui/arsenalTree.ts`) e das regras de `client/ui/pauseMenu.ts`, com as medidas e as cores do design "Menu de Pausa" (PF-11, [[ADR - Menu de pausa com trilho e abas]]). Até a PF-11 o menu de pausa mostrava a árvore inteira (classe `Arsenal`, removida). A corrida armada mostra a **Escada** e o zumbi o **Caixão** no lugar desta aba ([[Menus]]).

```text
[🔫 PRINCIPAL  Rifle Padrão   Nível 4/9]   ┌ 🔫 PRINCIPAL · NÍVEL 4/9               ✓ EQUIPADA ┐
[🛎️ SECUNDÁRIA Pistola        Nível 3/5]   │ Rifle Padrão                                     │
[🔪 FACA       Faca de Cozinha Nível 2/3]   │ ▓▓▓▓▓▓░░░░ Faltam 1.400 pontos para o nível 5      │
[🧨 GRANADA    Mina Terrestre  Nível 2/5]   │ descrição · Dano ▓▓ Cadência ▓▓ … Pente 30 / 120  │
                                            │ MELHORIAS LIBERADAS                              │
                                            │ 🔴 2 Mira de Ponto Vermelho     [LIGADA]          │
                                            │ 🔭 4 Luneta do Vovô "Vale na próxima partida" [DESLIGADA] │
                                            │ 🔒 Mais 5 melhorias a liberar. Próxima: …         │
                                            │ ARMAS LIBERADAS (só no campo de tiro)  [Equipar]  │
                                            └──────────────────────────────────────────────────┘
```

| Parte | O que mostra |
| --- | --- |
| Espaços | Os quatro espaços **em uso** (Principal, Secundária, Faca, Granada): ícone, espaço, nome e "Nível N/total" (o da progressão). O escolhido fica amarelo. A mina e a dose dupla trocam o nome e o ícone da granada (`weaponLabel`, `weaponIcon`) |
| Cabeçalho do cartão | Ícone, "{espaço} · Nível N/total", nome e "✓ Equipada" |
| Pontos | Barra laranja e "Faltam X pontos para o nível N" (ou "Nível máximo!"), **ao vivo** (online os pontos chegam do servidor durante a partida) |
| Descrição | A descrição engraçada da arma (`armaDesc_*`) |
| Atributos | Nas armas de fogo: Dano, Cadência, Precisão, Alcance e Mobilidade em duas colunas e "Pente N / reserva M", com as melhorias **em uso** (`gunStatBars`). Na faca (desde 2026-10-07): Alcance do golpe, Investida, Rapidez e Discrição, sem linha de pente (`knifeStatBars`), e embaixo o bloco verde da passiva (nome, descrição com os números, "Vale no mata-mata, no treino e contra bots."). A granada não tem barras. Até 420 px de largura, as barras ficam uma por linha |
| Melhorias liberadas | As melhorias **já liberadas** da progressão, em ordem de nível: ícone, nível, nome, fichas (ganho em verde, troca em vermelho, "Opcional: tem troca", "Substituída por {opcional}") e **Ligada/Desligada**. Sem nenhuma: "Nenhuma melhoria liberada ainda" |
| O que falta | "🔒 Mais N melhorias a liberar. Próxima: X, faltam N pts de {progressão}" (uma só: "Mais 1 melhoria a liberar: X, …"; some quando todas estão liberadas), de `moreUpgradesText` |
| Armas liberadas | **Só no campo de tiro**, nos espaços Principal, Secundária e Faca: as armas liberadas do espaço (ícone, nome, nível) com **Equipar**, a da mão marcada "✓ Equipada". Elemento que o design não desenhou, no mesmo visual das linhas de melhoria |

- **Na partida** (mata-mata online e contra bots) a aba mostra **o que está em uso** — o loadout travado ao entrar ([[ADR - Equipamento travado no mata-mata]]): Ligada é o que está na mão; uma melhoria liberada **durante** a partida (o nível passou do nível de entrada) aparece com a ficha "Vale na próxima partida". Nada se troca: selo "🔒 Só consulta", rodapé "Travado durante a partida. Troque armas e melhorias no Arsenal da tela inicial…".
- **No campo de tiro** o selo é "Editável no treino": Ligada/Desligada viram botões e Equipar troca a arma; a mudança vai para a mão na hora (`applyLoadout(progress.loadout, true)`).
- **Uma por grupo**: ligar uma opcional substitui as comuns do grupo e desliga a outra opcional (as miras opcionais do rifle × o ponto vermelho; mina × dose dupla); ligar a comum desliga a opcional do grupo. Ligar uma melhoria num rifle vale para todos os rifles (o botão é da progressão); o mesmo para as facas, para as secundárias da progressão da pistola (pistola, grampeador, revólver, garrucha, pistolão) e para a submetralhadora e a furadeira.
- As barras de atributo mantêm a escala de antes (dano ÷ 40, cadência ÷ 1.100): o revólver e o pistolão enchem a barra de Dano e a furadeira a de Cadência ([[ADR - Secundárias novas no Arsenal]]).
- Barras da faca (`client/ui/arsenalStats.ts`, mesma faixa de 0,06 a 1): alcance do golpe `(alcance − 1,4) / 1,5`; investida `(alcanceInvestida − 2,2) / 2,8`; rapidez `(1,35 − intervalo − duracao) / 0,6`; discrição `(88 − distância em que se ouve) / 60`, com 34 m para a faca de cozinha (passiva Discreta) e 70 m para as outras. O afiador mexe em alcance e rapidez, o tênis na investida e a mão leve na rapidez; nenhuma melhoria muda a discrição. As fichas da Mão Leve ("Duração do golpe −30%") ficam verdes (menor é melhor).
- Cada mudança chama `progress.toggle(progressão, id, ligada)` ou, no Equipar, `progress.setPrimary`, `setSecondary` ou `setKnife` (conforme o espaço), que grava na conta (`PATCH /api/perfil {arsenal}`) **um salvamento por vez** (cliques rápidos: só a última escolha que esperava é enviada). Se o salvamento falha (sem internet, servidor recusou), a tela **volta à última escolha que a conta tem** e avisa "Não foi possível salvar o Arsenal" (na tela inicial, na linha de status; no campo de tiro, num aviso do HUD, e as armas na mão voltam junto). Ao entrar numa sessão, a home manda a escolha ao servidor (`loadout` no saguão).
- **Sem conta**, tudo fica no nível 1 e as armas com trava ficam trancadas; o rodapé diz "Crie uma conta para suas armas evoluírem". A aba Arsenal da tela inicial (o canvas) é só de quem tem conta; o visitante troca no campo de tiro, sem salvar nada.
- Na tela inicial, o canvas usa um `Progress` próprio montado do perfil (um novo a cada carga da conta, `ArsenalCanvas.attach`); o cartão do personagem mostra os ícones do que vai para a partida (o rifle, a secundária e a faca escolhidos e a granada na forma escolhida — `weaponIcon`).
- O foco é preservado entre redesenhos (`data-key`): controle e teclado navegam pelos espaços, pelos botões Ligada/Desligada e pelo Equipar (ver [[Menus]]).
- No celular e em telas estreitas os espaços ficam numa grade acima do cartão.

Textos: nomes, descrições e fichas vêm de `client/ui/strings.ts` (`arma_*`, `armaDesc_*`, `prog_*` (nome curto da progressão), `upg_<progressão>_<id>`, `fx_*`, `treeRow_*` (os nomes dos espaços), `treeEquip`, `treeEquipped`, `upgradeOn`/`upgradeOff`, `upgradeReplacedBy`, `upgradeOptional`, `pmUpgradesUnlocked`, `pmNoUpgrades`, `pmMoreUpgrade(s)`, `pmNextMatch`, `pmWeaponsUnlocked`, `pmArsenal*`, `arsenalSaveFailed`), em pt-BR e inglês; `client/tests/arsenalText.test.ts` confere que nenhuma arma, melhoria, espaço ou texto do menu fica sem texto, `client/tests/arsenalTree.test.ts` confere o modelo e `client/tests/pauseMenu.test.ts` a linha "Mais N melhorias".

## Em partida

| Necessidade | Onde está | Nota |
| --- | --- | --- |
| Trocar de arma | `1`/`2`, roda do mouse, D-pad ←/→, botão de troca no celular | [[Weapons]], [[Input & Controls]], [[Touch Controls]] |
| Ver munição das duas armas | [[HUD]]: o pente grande da arma na mão e, abaixo, as duas armas com tecla, nome e munição (a da mão acesa; pisca enquanto saca) | `hud.setWeaponSlots` |
| Ver granadas | [[HUD]] | ícones com recarga progressiva |
| Ver efeitos ativos | Painel de bônus do [[HUD]] | [[Buffs & Debuffs]] |
| Itens cosméticos | Editor de personagem (`client/ui/customize.ts`) | [[Character Customization]] |

## Código relacionado

- `client/ui/arsenal.ts` — classe `ArsenalPanel` (a aba Arsenal do menu de pausa: espaços em uso e o cartão do espaço; `editable`, `inUse`, `startLevels`, `onChange`); `weaponName`, `progName`, `upgradeName`, `weaponLabel`, `weaponIcon`, `passiveBlock`, `esc` (usados também no canvas, no kill feed, na tela inicial e nas outras abas do menu); reexporta os de `arsenalStats.ts`.
- `client/ui/arsenalStats.ts` — sem DOM, testável: `gunStatBars`, `knifeStatBars`, `weaponStatBars`, `knifeHeardAt`, `passiveText`, `effectChips`, `num`.
- `client/ui/pauseMenu.ts` — `moreUpgradesText` (a linha "Mais N melhorias a liberar") e as outras regras do menu de pausa ([[Menus]]).
- `client/ui/arsenalCanvas.ts` — classe `ArsenalCanvas` (o canvas da tela inicial: desenho, câmera, arrastar, pinça, roda, teclas, painel, minimapa, `pad-pan`).
- `client/ui/arsenalCanvasLayout.ts` — `canvasLayout` (quadros, nós, linhas e limites, sem DOM) e a câmera: `zoomAt`, `homeView`, `fitView`, `rowView`, `weaponView`, `revealView`, `clampZoom`.
- `client/ui/arsenalTree.ts` — `TREE_ROWS`, `arsenalTree`, `weaponNode`, `upgradeNodes`: o modelo puro da progressão (linhas, armas, estados e pontos que faltam), usado pelo canvas e pelo cartão da pausa.
- `client/gameplay/progress.ts` — `Progress` (XP, níveis, `unlocked`, `toUnlock`, `choice`, `loadout`, `toggle`, `setPrimary`, `setSecondary`, `setKnife`, fila de salvamento, `onSaveError`, `settled`, `applyServer`).
- `client/main.ts` — `applyLoadout`, `switchTo`, `holdSlot`; cria o `ArsenalPanel` (no mata-mata e no campo de tiro) com o loadout em uso e os níveis de entrada.
- `shared/progression.ts`, `shared/arsenal.ts` — dados e atributos ([[Progression]], [[Shared Systems]]).
