---
title: Menus
type: system
status: documented
area: ui
source_paths:
  - index.html
  - client/ui/menu.ts
  - client/ui/home.ts
  - client/ui/auth.ts
  - client/ui/profile.ts
  - client/ui/customize.ts
  - client/ui/arsenal.ts
  - client/ui/padNav.ts
  - client/ui/strings.ts
  - client/main.ts
tags:
  - game
  - ui
  - menus
updated: 2026-10-05
---

# Menus

Telas fora da partida e o menu de pausa. Todas vivem em `index.html`; a lógica está em `client/ui/menu.ts` (classe `Screens`: carregamento e menu início/pausa) e `client/ui/home.ts` (tela inicial).

## 1. Tela de carregamento (`#loading`)

- Logo "OFFENSIVE COMBAT", barra de progresso e uma **dica engraçada** que troca a cada 2,5 s (`TIPS` em `strings.ts`, ex.: "Dica: os flamingos não têm culpa de nada.").
- Aparece duas vezes: no boot (física, renderizador, texturas: 10% → 45% → 100%) e de novo ao construir o mapa escolhido.
- Em erro fatal de inicialização, a dica é trocada por "Erro ao iniciar: …".

## 2. Tela inicial (`#home`)

Cartão "sticker" com quatro visões alternadas (`start`, `auth`, `profile`, `lobby`):

- **Conta:** sem conta ("Sem conta: treino e bots estão liberados. Para jogar online, entre ou crie uma conta." + ENTRAR / CRIAR CONTA) ou logado (`Nome#1234`, selo de nível, botão Perfil). Sem conta, o jogador recebe um nome engraçado aleatório (ex.: "Sargento Pastel", "Zé Granada").
- **Modos:** **JOGAR ONLINE** (exige conta → [[Matchmaking UI]]), **CONTRA BOTS** (seletor de mapa, dificuldade Fácil/Normal/Difícil e 3/5/7/9 bots) e o link *Campo de tiro (bonecos parados)* — treino offline no mapa escolhido. Ver [[Training]] e [[Versus Bots]]. As preferências de bots e mapa ficam no `localStorage` (`oc.bots`).
- **Formulários de conta** (`client/ui/auth.ts`): entrar, cadastrar, esqueci a senha, nova senha (link do e-mail) e escolher nome (primeiro login pelo Discord). Botão "Entrar com Discord" só aparece se o servidor disser que o provedor existe. Ver [[Flow - First Access]] e [[Authentication]].
- **Perfil** (`client/ui/profile.ts`): tag e nível com barra de XP, aviso de exclusão pendente (com cancelar), seletor de corpo (masculino/feminino), botão **Personalizar**, estatísticas totais (abates, mortes, tiros na cabeça, "no pássaro", facadas, pelas costas, granadas, opressões, tempo jogado, partidas), últimas sessões online (tabela), troca de nome (com carência), vincular/desvincular Discord, sair e excluir conta (com `confirm`). Ver [[Player Data]].
- **Personalizar personagem** (`client/ui/customize.ts`): editor estilo "Create-a-Sim" com palco 3D, abas, busca e miniaturas. Documentado em [[Character Customization]].

## 3. Menu inicial / pausa (`#menu`)

Mesmo cartão para os dois modos (`showMenu('start' | 'pause')`):

| Seção | Conteúdo |
| --- | --- |
| Cabeçalho | Logo, subtítulo ("Sessão: {nome} · mata-mata livre", "Contra N bots · mata-mata livre" ou "Protótipo de tiro · Fase 1"), aviso de GPU por software (se detectado). |
| Botão principal | **JOGAR** (início) ou **VOLTAR AO JOGO** (pausa) + dica "Clique para voltar ao jogo" / "Toque…" / "Aperte ✕ ou Options…". |
| **Arsenal** | Painel de progressão de armas (`client/ui/arsenal.ts`): um cartão por arma (rifle, faca, granada) com nível equipado, barra de XP até o próximo nível, fichas de cada nível (🔒 se bloqueado; clique equipa os desbloqueados) e descrição do nível sob o mouse. Ver [[Inventory UI]] e [[Progression]]. |
| **Controles** | Tabela de teclas remapeáveis (computador), tabela de botões do controle (PlayStation ou Xbox) ou ajuda de toque (celular). Ver [[Input & Controls]]. |
| **Configurações** | Ver [[Settings]]. |
| Rodapé | Dica de depuração (F3/F4), botão **Sair para o início** (só na pausa; recarrega a página). |

O jogo renderiza um quadro do mapa **atrás** do menu inicial, para que o mapa apareça antes de clicar em JOGAR.

### Pausa

- **Computador:** Esc abre e fecha. Em tela cheia com Keyboard Lock (Chrome/Edge), o jogo fica com o Esc e a mira volta na hora; fora disso, o navegador consome o Esc que libera o mouse e o próximo Esc fecha o menu, com a mira voltando na próxima tecla ou clique ("A mira volta com a próxima tecla ou clique"). Ver [[Problem - Esc e Pointer Lock no navegador]].
- **Celular:** botão de pausa nos controles de toque.
- **Controle:** Options/Menu.
- **Offline o mundo para** com o menu; **online continua** (os outros não esperam).

## 4. Outros painéis

- **Editor de layout de toque** (`#touch-edit-bar`): ver [[Touch Controls]].
- **Aviso "Gire o celular"** (`#rotate`): durante a partida em retrato.
- **Painel de ajuste F6** (`client/ui/tuning.ts`): ferramenta de desenvolvimento com sliders para `VM_FEEL` (primeira pessoa) e `ANIM` (terceira pessoa) e botão para copiar o JSON; está disponível também fora do modo dev.

## Navegação por controle

`PadNav` (`client/ui/padNav.ts`) funciona em qualquer tela fora da partida: D-pad/analógico movem o foco ao controle visível mais próximo (com repetição ao segurar), ✕/A aciona (checkbox alterna, select cicla, slider move com esquerda/direita), ◯/B volta, L1/R1 trocam abas, analógico direito rola. Start/Options começa ou retoma.

## Código relacionado

- `client/ui/menu.ts` — `Screens` (`setProgress`, `showLoading`, `hideLoading`, `showMenu`, `hideMenu`, `bindSettings`, `showControls`, `onEditLayout`, `onExit`, `showGpuWarning`).
- `client/ui/home.ts` — `showHome()` → `HomeChoice` (`offline` | `bots` | `online`).
- `client/ui/auth.ts`, `client/ui/profile.ts`, `client/ui/customize.ts`, `client/ui/arsenal.ts`, `client/ui/padNav.ts`, `client/ui/tuning.ts`.
- `client/main.ts` — ordem das telas no `boot()`, pausa/retomada (`input.onLockChange`).
