---
title: Menus
type: system
status: documented
area: ui
source_paths:
  - client/zombies/ambience.ts
  - shared/modes.ts
  - client/ui/ladder.ts
  - index.html
  - client/ui/menu.ts
  - client/ui/pauseMenu.ts
  - client/ui/home.ts
  - client/ui/auth.ts
  - client/ui/profile.ts
  - client/ui/customize.ts
  - client/ui/arsenal.ts
  - client/ui/padNav.ts
  - client/ui/arsenalCanvas.ts
  - client/ui/strings.ts
  - client/main.ts
  - client/styles.css
tags:
  - game
  - ui
  - menus
updated: 2026-10-07
---

# Menus

Telas fora da partida e o menu de pausa. Todas vivem em `index.html`; a lógica está em `client/ui/menu.ts` (classe `Screens`: carregamento e menu início/pausa), `client/ui/pauseMenu.ts` (regras puras do menu de pausa) e `client/ui/home.ts` (tela inicial).

## 1. Tela de carregamento (`#loading`)

- Logo "OFFENSIVE COMBAT", barra de progresso e uma **dica engraçada** que troca a cada 2,5 s (`TIPS` em `strings.ts`, ex.: "Dica: os flamingos não têm culpa de nada.").
- Aparece duas vezes: no boot (física, renderizador, texturas: 10% → 45% → 100%) e de novo ao construir o mapa escolhido.
- Em erro fatal de inicialização, a dica é trocada por "Erro ao iniciar: …".

## 2. Tela inicial (`#home`)

Página rolável com duas caras, conforme a conta (`/api/me`). Enquanto a consulta não volta, nenhuma das duas aparece. Os textos vêm de atributos `data-t` preenchidos por `t()` (`client/ui/strings.ts`).

### 2.1 Logado (`#home-in`)

- **Cabeçalho:** logo, abas **JOGAR / ARSENAL / ÁLBUM / PERFIL / CONFIGURAÇÕES** (`role="tab"`, L1/R1 no controle) e um botão da conta com o retrato do personagem (`renderPortrait`, close no rosto), `Nome#1234`, selo de nível e barra de XP da conta (`xpNoNivel / xpProximo`). O botão abre a aba Perfil.
- **Cartão do personagem** (lateral, fixo ao rolar no computador; empilhado no celular): o **personagem real** da conta em 3D (o mesmo palco `Stage` do editor, `client/ui/customize.ts`: parado, girando devagar, arrastar gira; sem zoom pela roda para não travar a rolagem), os ícones do que vai para a partida — primária, secundária escolhida, faca e granada, com a forma ligada (ex.: "🔫 🛎️ 🐔 🧨 equipados"; `weaponIcon`), abates e partidas, botão **PERSONALIZAR** (abre o editor de [[Character Customization]] no lugar do painel, que ocupa a largura toda) e, no modo Online, **JOGAR ONLINE** com a dica "Entra direto na sessão mais cheia dos mapas filtrados".
- **Aba Jogar:**
  - *Modo:* três cartões, **Online**, **Contra bots** e **Campo de tiro**.
  - *Tipo de partida* (Online e Contra bots): **Mata-mata** ou **Corrida armada**, com uma linha sobre o modo ([[Free For All]], [[Gun Game]]). Na landing (sem conta) o mesmo seletor aparece para o jogo contra bots.
  - *Mapas:* no Online, os mapas são um **filtro** (vários marcados) e mostram quantas sessões cada um tem depois de conectar. Em Contra bots escolhe-se um mapa. No Campo de tiro, **clicar no mapa já começa** o treino ([[Training]]). Fora do modo zumbi só aparecem os mapas abertos (`PVP_MAPS`): o Cemitério da Capela é só do zumbi.
  - *Contra bots:* dificuldade (Fácil/Normal/Difícil), 3/5/7/9 bots e o botão **CONTRA N BOTS** ([[Versus Bots]]).
  - *Online:* lista de sessões **já carregada** ao abrir a aba (6 por vez, **VER MAIS** quando há mais), filtrada pelos mapas marcados, e a criação de sessão. A conexão de jogo só abre ao entrar. Ver [[Matchmaking UI]].
- **Aba Arsenal:** um **canvas** que se arrasta e tem zoom (`ArsenalCanvas`, `client/ui/arsenalCanvas.ts`) sobre a progressão da conta: um quadro por espaço, as armas ligadas às melhorias e um painel de detalhes ao clicar numa arma. A aba ocupa a altura da tela (a página não rola) e, abaixo de 1.000 px de largura, o cartão do personagem sai. Equipar o rifle, a secundária ou a faca, ou ligar/desligar uma melhoria, grava na conta na hora (`PATCH /api/perfil {arsenal}`); se não salvar, a tela desfaz e a linha de status avisa "Não foi possível salvar o Arsenal". Ver [[Inventory UI]].
- **Aba Álbum** (`client/ui/album.ts`): o álbum de figurinhas (conquistas) por página, com o acabamento de cada figurinha, a barra até a próxima meta e o detalhe ao clicar. Calculado do perfil. Ver [[Achievements]].
- **Aba Perfil** (`client/ui/profile.ts`): tag e nível com barra de XP, aviso de exclusão pendente (com cancelar), corpo (masculino/feminino), **Personalizar personagem**, estatísticas totais (e as do modo zumbi, numa grade própria, quando a conta já jogou), últimas sessões online, troca de nome (com carência), vincular/desvincular Discord, sair e excluir conta (com `confirm`). Ver [[Player Data]].
- **Aba Configurações:** os mesmos controles do menu de pausa, com as mesmas subabas (Mira, Vídeo, Áudio, Teclas ou Controle, Toque no celular; ver [[Settings]]). O bloco `#menu-settings` é **emprestado** para a aba enquanto a tela inicial está aberta e devolvido ao `#menu` ao sair, por isso a mudança vale na hora. O botão "Ajustar botões" do editor de toque fica escondido aqui (os controles de toque só existem na partida). Com controle, L1/R1 continuam trocando as abas da tela inicial; as subabas se escolhem com o direcional e ✕.
- Uma aba extra sem botão (`#tab-auth`) mostra o formulário "Escolher nome" (primeiro login pelo Discord) e o editor de personagem.

### 2.2 Deslogado: landing (`#home-out`)

1. **Cabeçalho fixo** com âncoras (O jogo, Mapas, Modos, Criar conta) que rolam a página sem deixar `#fragmento` no endereço (os fragmentos são reservados aos retornos do e-mail e do Discord) e o botão **ENTRAR**.
2. **Destaque:** logo, chamada, **COMEÇAR A JOGAR** e **CRIAR CONTA**, e o aviso "Sem conta: treino e bots estão liberados".
3. **Como é o jogo:** três pilares (mira por região do corpo, Opressão vale 150 contra 100 do abate, armas que evoluem). Ver [[Scoring]] e [[Progression]].
4. **Mapas:** vitrine de um mapa (nome e piada) e a lista dos três mapas abertos com clima e tamanho (o cemitério do modo zumbi não entra). Ver [[Maps Index]].
5. **Modos de jogo:** Online (com conta), Contra bots e Campo de tiro (sem conta), cada um com três fatos curtos.
6. **Criar conta:** os formulários de `client/ui/auth.ts` (cadastrar, entrar, esqueci a senha, nova senha), sem o botão Voltar. Ver [[Flow - First Access]] e [[Authentication]].
7. **Começar a jogar:** o nome engraçado aleatório (ex.: "Sargento Pastel"), mapa, dificuldade, número de bots, **CONTRA N BOTS** e o link *Campo de tiro (bonecos parados)*.

> [!info]
> O design traz espaços para imagens (captura de gameplay, mapas, modos). Como o projeto não tem nenhuma captura, cada espaço mostra uma cor do mapa ou modo com um emoji (`.ph` em `client/styles.css`). O personagem não é imagem: é renderizado ao vivo a partir da aparência salva (`aparencia` do perfil; sem perfil, a aparência padrão do corpo).

### 2.3 Preferências e mensagens

- Modo, mapa, filtro de mapas do Online, dificuldade e número de bots ficam no `localStorage` (`oc.bots`). Ver [[Settings]].
- As mensagens de estado ("Conectando ao servidor…", erros) aparecem num aviso fixo no rodapé da tela (`#home-status`).

## 3. Cartão de início e menu de pausa (`#menu`)

Desde a PF-11 ([[ADR - Menu de pausa com trilho e abas]], design "Menu de Pausa"): um **trilho** à esquerda e, só quando uma aba é escolhida, um **painel** à direita; o jogo fica visível atrás de um véu escuro (`rgba(27,21,48,.55)` com desfoque). O cartão de início (antes do primeiro clique) e a pausa usam o mesmo trilho (`showMenu('start' | 'pause')`).

```text
┌ trilho (300 px) ─────────┐  ┌ painel (só com uma aba aberta) ─────────────────────────┐
│ OFFENSIVE COMBAT         │  │ Título · dica           [🔒 Só consulta] [Fechar Esc/◯] │
│ [MATA-MATA] (cor do modo)│  │ ─────────────────────────────────────────────────────── │
│ Rua dos Vizinhos         │  │ conteúdo da aba (Arsenal / Escada / Caixão /             │
│ Sessão: X · 7/10 jog.    │  │ Configurações com subabas)                               │
│ (aviso de GPU)           │  │                                                          │
│ ● Online: o jogo continua│  │ ─────────────────────────────────────────────────────── │
│ [ VOLTAR AO JOGO ]       │  │ rodapé opcional                                          │
│ [🎒 Arsenal       ›]     │  └──────────────────────────────────────────────────────────┘
│ [⚙️ Configurações ›]     │
│ …                        │       janela "Sair da sessão?": FICAR (azul) · SAIR (vermelho)
│ [ SAIR DA SESSÃO ]       │       "Esc/◯ fica na partida"
│ Esc Voltar ao jogo       │
└──────────────────────────┘
```

### 3.1 Trilho

| Parte | Conteúdo |
| --- | --- |
| Logo | "OFFENSIVE COMBAT" |
| Chip do modo | Na cor do modo (variável CSS `--mode`): **Mata-mata** `#ff7a1a`, **Corrida armada** `#1fb5a8`, **Zumbi** `#3fae4a`, **Campo de tiro** `#2f9bff` |
| Mapa | `MAPS[mapa].nome`; com a prévia glTF (`?mapa=arquivo.glb`), "Prévia: arquivo.glb" |
| Linha da partida | Ver a tabela 3.2 |
| Aviso de GPU por software | Embaixo da linha, se detectado ([[Problem - Renderização por software sem GPU]]) |
| Aviso | **Vermelho** (bolinha) online: o mundo continua; **verde** ("II") offline: pausado. Não aparece no cartão de início |
| Botão principal | **VOLTAR AO JOGO** (pausa) ou **JOGAR** (início). Mantém o id `#play-btn` (o Start/Options do controle o aperta) |
| Abas | A **aba do modo** (Arsenal, Escada ou Caixão, com uma linha embaixo: "Seu equipamento · só consulta", "Degrau 3 de 7 · 1/3 abates", "O que você carrega e as chances") e **Configurações** ("Mira, vídeo, áudio e teclas"). A aba aberta fica amarela; clicar de novo fecha |
| Saída | Botão vermelho com o rótulo do modo; abre a confirmação |
| Dicas | Teclado: "Esc Voltar ao jogo" (só na pausa). Controle: "Options Voltar ao jogo" (só na pausa), "◯ Voltar", "✕ Escolher", com os símbolos da família em uso (Xbox: Menu, B, A). Toque: nenhuma |

### 3.2 Textos por lugar e modo

Tirados de `pauseContext` (`client/ui/pauseMenu.ts`), atualizados ao vivo com o menu aberto.

| Lugar × modo | Linha | Aviso | Aba | Saída e confirmação |
| --- | --- | --- | --- | --- |
| Mata-mata online | "Sessão: {nome} · {N}/{máx} jogadores" | vermelho "Online: o jogo continua e você pode levar tiro." | Arsenal (só consulta) | **Sair da sessão**: "Você sai da sessão {nome} e volta para a tela inicial. Os pontos que suas armas já ganharam ficam na conta." |
| Mata-mata contra bots | "Contra {N} bots · {dificuldade}" | verde "Jogo pausado: os bots esperam você." | Arsenal (só consulta) | **Sair da partida**: "A partida contra os bots acaba e você volta para a tela inicial." |
| Corrida armada online | linha da sessão | vermelho (o mesmo do online) | Escada | **Sair da corrida**: "Você sai da corrida e perde o degrau em que está. Volta para a tela inicial." |
| Corrida armada contra bots | linha dos bots | verde dos bots | Escada | **Sair da partida**: "A corrida contra os bots acaba e você volta para a tela inicial." |
| Zumbi online com equipe | "Onda {X}/12 · {N} jogadores" | vermelho "Online: a horda não espera. Sua equipe continua lutando." | Caixão | **Sair da partida**: "Sua equipe continua sem você. O dinheiro desta partida não é guardado." |
| Zumbi online sozinho | "Onda {X}/12 · 1 jogador" | vermelho genérico | Caixão | **Sair da partida**: "A partida recomeça para o próximo que entrar. O dinheiro desta partida não é guardado." |
| Zumbi solo | "Onda {X}/12 · sozinho" | verde "Jogo pausado." | Caixão | **Sair da partida**: "A partida acaba e o dinheiro não fica." |
| Campo de tiro | "Treino offline com os bonecos" | verde "Jogo pausado." | Arsenal (editável) | **Sair do treino**: "Você sai do campo de tiro e volta para a tela inicial." |

Os jogadores são os da sessão (`net.info`, o próprio incluído) e o máximo é o da sessão (`SessionInfo.max`); a onda é a do zumbi (0 antes da primeira). Sair fecha a conexão e **recarrega a página** (como antes da PF-11).

### 3.3 Painel e abas

- **Cabeçalho**: título, dica, selo **"🔒 Só consulta"** (Arsenal na partida) ou **"Editável no treino"** (campo de tiro) e **"Fechar [Esc/◯]"** (o símbolo do controle em uso; sem tecla no toque). Rodapé conforme a aba.
- **Arsenal** (mata-mata e campo de tiro; `ArsenalPanel` em `client/ui/arsenal.ts`): os quatro espaços **em uso** à esquerda (ícone, espaço, nome, nível; a mina e a dose dupla trocam o nome e o ícone da granada) e o cartão do espaço escolhido: ícone, "Principal · Nível 4/9", nome, "✓ Equipada", barra e "Faltam X pontos para o nível N", descrição, barras de atributos e "Pente N / reserva M" (armas de fogo), **Melhorias liberadas** (Ligada/Desligada; fichas de ganho e troca, "Opcional: tem troca", "Substituída por …") e "🔒 Mais N melhorias a liberar. Próxima: X, faltam N pts de {progressão}" (some quando todas estão liberadas). Dica: "O que você levou para esta partida." / "O campo de tiro deixa trocar tudo, valendo na hora." Rodapé: "Travado durante a partida…" / "No campo de tiro o Arsenal é editável…" e, **sem conta**, "Crie uma conta para suas armas evoluírem" (a lista vazia diz "Nenhuma melhoria liberada ainda"). Detalhes em [[Inventory UI]].
- **Escada** (corrida armada; `renderLadderTab` em `client/ui/ladder.ts`): título "Escada da corrida armada", dica "Todos usam as mesmas armas, com os mesmos atributos."; os degraus da escada numa linha (o do jogador maior e amarelo com "Você · N/3", os passados verdes com ✓, o último rosa), cada um com nome e "pente · cadência rpm" ou "abate final"; os cartões **Agora · degrau N** (bolinhas dos abates, "faltam N abates para subir"; no último degrau, "para vencer") e **Próxima · degrau N+1** ("30 balas · 700 rpm · tiro abafado"; no último degrau vira **Abate final**: "Um abate com o Sabre de Luz vence a rodada"); as três regras com os números de `GUN_GAME`; e **Na frente**: o primeiro na ordem do placar ("{nome} · degrau N ({arma})" ou "Você está na frente"; some sem outro jogador). Entre rodadas aparece no topo o vencedor e "Nova rodada em N…", como no HUD. Ver [[Gun Game]].
- **Caixão** (zumbi; `renderCoffinTab` em `client/zombies/ambience.ts`): título "Caixão Misterioso", dica "$950 por arma, sorteada no servidor. A raridade multiplica o dano contra zumbis." (no solo, sem "sorteada no servidor"); à esquerda **Você carrega** (espaço, nome, raridade na cor dela; a danificada mostra "Danificada: −40% de pente e −50% de reserva"), à direita **Chances · $950** por raridade (nome, barra, %, "×1,4 de dano", "25% vem danificada", as armas). Rodapé: "A arma nova substitui a do mesmo tipo… Danificada não tem conserto: só outra rodada." Preço, pesos e multiplicadores vêm de `shared/data/zumbi.json`. Ver [[Zombie]].
- **Configurações**: as subabas de [[Settings]] (Mira, Vídeo, Áudio, **Teclas** ou **Controle** com controle em uso, **Toque** só no celular). Dica "Tudo vale na hora."

### 3.4 Níveis, Esc e controle

- **Esc volta um nível**: janela de saída → aba aberta → jogo. A tecla sendo capturada na aba Teclas tem prioridade (o Esc cancela a captura). No cartão de início o Esc só fecha a janela e a aba; nunca começa a partida.
- **Computador:** em tela cheia com Keyboard Lock (Chrome/Edge), o jogo fica com o Esc e a mira volta na hora; fora disso, o navegador consome o primeiro Esc para liberar o mouse (é ele que abre o menu) e o Esc que fecha o menu deixa a mira voltar na próxima tecla ou clique ("A mira volta com a próxima tecla ou clique"). Ver [[Problem - Esc e Pointer Lock no navegador]].
- **Celular:** botão de pausa nos controles de toque; VOLTAR AO JOGO retoma.
- **Controle:** Options/Menu abre e volta ao jogo (ou JOGAR); ◯/B volta um nível (aperta o botão marcado `data-pad-back` no nível: FICAR, Fechar ou VOLTAR AO JOGO; nunca a saída); ✕/A escolhe; L1/R1 trocam as subabas das Configurações; com a janela aberta o foco fica nela (FICAR primeiro).
- **Offline o mundo para** com o menu; **online continua** (os outros não esperam) e o menu acompanha: jogadores, onda, degrau, líder, caixão.
- Sem animação de abrir e fechar (só o hover e o clique do design).

### 3.5 Telas estreitas e celular

Abaixo de **900 px de largura ou 560 px de altura**, e **sempre no celular** (classe `menu-narrow` no `<html>`): o trilho ocupa a largura (em duas colunas a partir de 640 px: onde se está à esquerda, os botões à direita, para caber deitado sem rolar) e cada aba abre **por cima** como uma página, com **"‹ Voltar"** no lugar de Fechar (um nível por vez, como o Esc). No celular os alvos de toque crescem (48 px nos botões do trilho, nas abas e nos espaços do Arsenal).

O jogo renderiza um quadro do mapa **atrás** do cartão de início, para que o mapa apareça antes de clicar em JOGAR.

## 4. Outros painéis

- **Editor de layout de toque** (`#touch-edit-bar`): ver [[Touch Controls]].
- **Aviso "Gire o celular"** (`#rotate`): durante a partida em retrato.
- **Painel de ajuste F6** (`client/ui/tuning.ts`): ferramenta de desenvolvimento com sliders para `VM_FEEL` (primeira pessoa) e `ANIM` (terceira pessoa) e botão para copiar o JSON; está disponível também fora do modo dev.

## Navegação por controle

`PadNav` (`client/ui/padNav.ts`) funciona em qualquer tela fora da partida: D-pad/analógico movem o foco ao controle visível mais próximo (com repetição ao segurar), ✕/A aciona (checkbox alterna, select cicla, slider move com esquerda/direita), ◯/B volta, L1/R1 trocam abas, analógico direito rola (ou, no canvas do Arsenal, move o canvas: elemento com `data-pad-pan`, evento `pad-pan`). Start/Options começa ou retoma.

Regras gerais (PF-11):

- **Janela aberta** (`aria-modal="true"`, visível): o foco só anda entre os controles dela.
- **◯/B**: aperta o controle marcado `data-pad-back`; sem ele, um botão cujo texto começa com Voltar, Cancelar, Fechar, Sair… — **exceto** dentro de uma tela marcada `data-pad-explicit` (o `#menu`), que marca o botão de cada nível, para "Sair da sessão" nunca contar como voltar.
- **L1/R1**: trocam a barra de abas na tela; as subabas marcadas `data-pad-subtabs` (as das Configurações) só quando não há outra barra (no menu de pausa sim; na tela inicial L1/R1 seguem nas abas de cima).

## Código relacionado

- `client/ui/menu.ts` — `Screens` (`setProgress`, `showLoading`, `hideLoading`, `showMenu`, `hideMenu`, `bindSettings`, `showControls`, `onEditLayout`, `onExit`, `showGpuWarning`; do menu de pausa: `setContext`, `setModeTab`, `modeBody`, `openTab`, `openedTab`, `onTab`, `back`, `visible`).
- `client/ui/pauseMenu.ts` — regras puras: `pauseContext` (os 8 casos de lugar × modo), `MODE_COLOR`, `backStep`, `standingsOrder` (a ordem do placar), `ladderLeader`, `moreUpgradesText`, `KEY_GROUPS`, `previewMapName`. Testes em `client/tests/pauseMenu.test.ts`.
- `client/ui/arsenal.ts` (`ArsenalPanel`), `client/ui/ladder.ts` (`renderLadderTab`, `ladderTabSub`), `client/zombies/ambience.ts` (`renderCoffinTab`) — as abas do modo.
- `client/ui/home.ts` — `showHome()` → `HomeChoice` (`offline` | `bots` | `online`): abas, landing, entrada rápida, empréstimo de `#menu-settings`.
- `client/ui/auth.ts`, `client/ui/profile.ts`, `client/ui/customize.ts`, `client/ui/arsenalCanvas.ts`, `client/ui/padNav.ts`, `client/ui/tuning.ts`.
- `client/main.ts` — ordem das telas no `boot()`, pausa/retomada (`input.onLockChange`), Esc por nível, o contexto do trilho e a aba do modo (`pauseNow`, `modeTabMeta`, `drawModeTab`, `refreshMenu` a cada atualização do HUD), a saída com confirmação.
