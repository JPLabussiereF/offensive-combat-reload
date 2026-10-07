---
title: ADR - Menu de pausa com trilho e abas
type: decision
status: documented
area: ui
source_paths:
  - index.html
  - client/ui/pauseMenu.ts
  - client/ui/menu.ts
  - client/ui/arsenal.ts
  - client/ui/ladder.ts
  - client/zombies/ambience.ts
  - client/ui/padNav.ts
  - client/ui/home.ts
  - client/ui/scoreboard.ts
  - client/ui/strings.ts
  - client/main.ts
  - client/styles.css
  - client/tests/pauseMenu.test.ts
tags:
  - game
  - decision
  - ui
  - menus
updated: 2026-10-07
---

# ADR - Menu de pausa com trilho e abas

> [!info] Origem
> Issue PF-11 do Jira ("Menu de pausa"), com as decisões P1 a P14 respondidas pelo dev no chat em 07/10/2026 (plano "PF-11 PLANO"), a partir do design "Menu de Pausa.dc.html" do projeto "Redesign do menu de pausa" (Claude Design). As medidas e as cores são as do design; os dados são os do jogo, nunca os de exemplo do design.

> [!info] Muda outras decisões
> - [[ADR - Árvore do Arsenal e armas liberadas por nível]]: a apresentação em **árvore** (classe `Arsenal`) saiu do jogo. O modelo de dados (`arsenalTree`, `upgradeNodes`) e as regras de trava, melhoria e salvamento continuam.
> - [[ADR - Arsenal da tela inicial em canvas]]: o menu de pausa não tem mais a árvore; o canvas segue só na tela inicial.
> - [[ADR - Equipamento travado no mata-mata]]: na partida o Arsenal da pausa mostra o equipamento **em uso**; no campo de tiro a troca de arma é no cartão do espaço (Equipar).

## Contexto

O menu de pausa era um cartão único e longo: logo, subtítulo, VOLTAR AO JOGO, a árvore inteira do Arsenal (ou a escada, ou o caixão), a tabela de teclas e uma coluna de configurações, e "Sair para o início", que recarregava a página na hora. Na partida o jogador rolava por uma árvore em que não podia mexer, e um clique em "Sair" largava a sessão sem aviso.

## Problema

Pausar deve mostrar o essencial (voltar, a aba do modo, as configurações, sair) com o jogo visível, deixar claro se o mundo continua (online) ou espera (offline), mostrar só o que vale nesta partida, separar as configurações por categoria, confirmar a saída dizendo o que se perde em cada modo, e funcionar no PC, no celular e no controle.

## Opções consideradas

- **Layout**: trilho à esquerda e painel que abre só ao escolher uma aba, o jogo visível (escolhida, como no design) × manter o cartão único com seções.
- **Arsenal na partida (P1, P3)**: só o equipamento em uso, em um cartão por espaço, sem árvore (escolhida) × a árvore só leitura de antes.
- **Campo de tiro (P2)**: o mesmo cartão com as armas liberadas do espaço (Equipar) e as melhorias ligando e desligando na hora (escolhida) × levar o jogador à tela inicial para trocar.
- **Cartão de início (P4)**: o mesmo trilho, com JOGAR e sem o aviso (escolhida) × um cartão próprio.
- **Telas estreitas (P5)**: abaixo de 900 × 560 px e sempre no celular, o trilho ocupa a largura e cada aba abre por cima com Voltar (escolhida) × encolher o painel ao lado.
- **Configurações (P6, P7)**: subabas Mira, Vídeo, Áudio, Teclas (ou Controle) e Toque (celular), o mesmo bloco emprestado à aba da tela inicial, sem perder nenhuma opção de hoje (escolhida) × uma coluna única.
- **Árvore (P14)**: remover a apresentação e manter o modelo de dados (escolhida) × mantê-la sem uso.

## Decisão

1. **Trilho** (300 px): logo; chip do modo na cor do modo (mata-mata `#ff7a1a`, corrida armada `#1fb5a8`, zumbi `#3fae4a`, campo de tiro `#2f9bff`, na variável CSS `--mode`); nome do mapa ("Prévia: arquivo.glb" com `?mapa=`); a linha da partida; o aviso de GPU por software; o aviso **vermelho** online ("o jogo continua") ou **verde** offline ("Jogo pausado"); VOLTAR AO JOGO; a aba do modo e Configurações; a saída em vermelho com o rótulo do modo; as dicas de tecla. Os textos por lugar × modo estão em [[Menus]] e em `pauseContext` (`client/ui/pauseMenu.ts`).
2. **Painel**: abre só quando uma aba é escolhida (fechado por padrão); título, dica, selo "🔒 Só consulta" / "Editável no treino", "Fechar [Esc/◯]" e rodapé opcional.
3. **Aba do modo**: **Arsenal** no mata-mata (online e contra bots) e no campo de tiro, **Escada** na corrida armada, **Caixão** no zumbi. O Arsenal mostra os quatro espaços **em uso** e o cartão do espaço (nível e pontos ao vivo, atributos, melhorias liberadas Ligada/Desligada, "🔒 Mais N melhorias a liberar…"); uma melhoria liberada durante a partida diz "Vale na próxima partida". No campo de tiro o cartão lista as armas liberadas do espaço com **Equipar** e as melhorias são botões, salvos pelo `Progress` como na tela inicial. Sem conta: "Nenhuma melhoria liberada ainda" e "Crie uma conta para suas armas evoluírem".
4. **Escada**: todos os degraus da escada (quantos houver), "Você · N/3", os cartões Agora e Próxima (no último degrau, "Abate final"), as três regras com os valores de `GUN_GAME`, quem está **na frente** (a ordem do placar; "Você está na frente"; some sem outro jogador) e, entre rodadas, o vencedor com a contagem.
5. **Caixão**: "Você carrega" (cor da raridade, defeito da arma danificada) ao lado das "Chances · $preço" por raridade (peso em %, multiplicador de dano, chance de vir danificada, armas).
6. **Saída com confirmação**: "{rótulo}?" com o texto do modo, FICAR (azul) e SAIR (vermelho), "Esc/◯ fica na partida". SAIR fecha a conexão e recarrega a página, como antes.
7. **Níveis**: Esc e ◯/B voltam um nível — janela → aba → jogo. No cartão de início o Esc só fecha a janela e a aba (nunca começa a partida). A captura de tecla tem prioridade sobre o Esc.
8. **Controle**: Options volta ao jogo (ou JOGAR), ◯ volta um nível pelo botão marcado `data-pad-back` em cada nível (nunca pela palavra "Sair"), ✕ escolhe, L1/R1 trocam as subabas (onde não houver outra barra de abas), o foco fica preso na janela de saída.
9. Sem animação de abrir/fechar. Online o mundo continua com o menu aberto (e o menu acompanha: jogadores, onda, escada, caixão); offline ele para, como antes.
10. Ficam de fora os elementos só da demonstração do design (chip "Esc Pausar" no HUD, seletores de modo e de entrada, "VOLTAR À DEMO", as tabelas de matriz e benchmark).

## Motivo

- É o que o dev pediu (o design), respondido ponto a ponto (P1 a P14), com os dados do jogo.
- O jogo continua visível e o aviso vermelho/verde diz se dá para levar tiro; a saída explica o que se perde.
- Mostrar só o que vale na partida evita o "mudou, mas não mudou" do Arsenal travado.

## Consequências

- A árvore do Arsenal saiu do jogo; o modelo `arsenalTree` segue servindo o canvas da tela inicial e o cartão da pausa.
- "Sair para o início" deixou de ser imediato: há sempre a confirmação.
- A ordem do placar (`standingsOrder`) passou a viver em `client/ui/pauseMenu.ts` (puro, testável sem DOM) e o placar a importa de lá.
- O bloco `#menu-settings` emprestado à tela inicial ganhou as subabas; o editor de botões de toque continua escondido ali.
- `PadNav` ganhou três regras gerais: janela `aria-modal` prende o foco, `data-pad-explicit` desliga o "voltar" por texto e `data-pad-subtabs` só troca quando não há outra barra.

## Código afetado

- `client/ui/pauseMenu.ts` (novo: `pauseContext`, `MODE_COLOR`, `backStep`, `standingsOrder`, `ladderLeader`, `moreUpgradesText`, `KEY_GROUPS`, `previewMapName`), `client/ui/menu.ts` (`Screens`: trilho, abas, painel, subabas, níveis, janela, teclas por grupo), `client/ui/arsenal.ts` (`ArsenalPanel` no lugar de `Arsenal`), `client/ui/ladder.ts` (`renderLadderTab`, `ladderTabSub`), `client/zombies/ambience.ts` (`renderCoffinTab`), `client/main.ts`, `client/ui/padNav.ts`, `client/ui/home.ts`, `client/ui/scoreboard.ts`, `client/ui/strings.ts`, `client/styles.css`, `index.html`
- Testes: `client/tests/pauseMenu.test.ts` (novo), `client/tests/arsenalText.test.ts`

Relacionado: [[Menus]] · [[Inventory UI]] · [[Settings]] · [[Input & Controls]] · [[Touch Controls]] · [[Gun Game]] · [[Zombie]] · [[Problem - Esc e Pointer Lock no navegador]]
