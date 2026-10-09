---
title: UI Overview
type: system
status: documented
area: ui
source_paths:
  - client/ui/galpao/galpao.ts
  - index.html
  - client/styles.css
  - client/main.ts
  - client/ui/menu.ts
  - client/ui/home.ts
  - client/ui/maps.ts
  - client/ui/management.ts
  - client/ui/hud.ts
  - client/ui/strings.ts
  - client/ui/strings.es.ts
  - client/ui/strings.de.ts
  - shared/langs.ts
  - client/ui/padNav.ts
  - client/core/device.ts
  - client/editor/editor.ts
tags:
  - game
  - ui
  - ux
updated: 2026-10-08
---

# UI Overview

## Visão geral (nível 1)

A interface do Offensive Combat é **HTML/CSS puro sobre o canvas do Three.js**, sem framework (nada de React/Vue). As telas existem como elementos fixos em `index.html` e são mostradas/escondidas trocando a classe `hidden`; cada módulo em `client/ui/` guarda referências diretas aos elementos e atualiza seu texto/estilo. Algumas telas são montadas dinamicamente com `innerHTML` (formulários de conta, perfil, editor de personagem, lista de sessões, painel de arsenal).

Visual: estilo "sticker" (painéis com contorno grosso e sombra dura deslocada), fontes Google **Lilita One** (títulos, números) e **Nunito** (texto), paleta definida em variáveis CSS (`--ink` #1b1530, `--paper` #fff8ec, `--good` verde, `--warn` amarelo, `--bad` vermelho, cores de time laranja/azul). No HUD em partida, texto branco direto sobre o jogo com sombra suave, sem painéis. Ver [[UI Assets]] e [[Art Direction]].

## Camadas e telas

| Elemento (`index.html`) | Módulo | Nota |
| --- | --- | --- |
| `#game` | canvas do renderizador | [[Rendering Overview]] |
| `#loading` | `Screens` (`client/ui/menu.ts`) | [[Menus]] — carregamento com dicas |
| `#home` (`#home-in`: o galpão 3D `#galpao` com as estações e, sem ele, as abas `#tab-play`, `#tab-maps`, `#tab-arsenal`, `#tab-album`, `#tab-profile`, `#tab-settings` e, para a equipe, `#tab-management`; `#home-out`: landing com `#home-auth`) | `showHome` (`client/ui/home.ts`), `GalpaoHome` (`client/ui/galpao/`), `maps.ts`, `management.ts`, `arsenalCanvas.ts`, `album.ts`, `auth.ts`, `profile.ts`, `customize.ts` | [[Menus]], [[Matchmaking UI]], [[Flow - First Access]], [[Moderation]], [[Achievements]], [[ADR - Tela inicial em galpão 3D]] |
| `#menu` (trilho `.pm-rail`, painel `#pm-panel`, janela de saída `#pm-confirm`, configurações `#menu-settings`) | `Screens` (`client/ui/menu.ts`), regras em `client/ui/pauseMenu.ts` | [[Menus]] (cartão de início e pausa), [[Settings]], [[Input & Controls]] |
| `#hud` | `Hud` (`client/ui/hud.ts`) | [[HUD]] |
| `#scoreboard` (dentro do HUD) | `Scoreboard` | [[Scoreboard]] |
| `#chat` (dentro do HUD) | `Chat` | [[Chat]] |
| `#killfeed`, `#banner`, `#popups`, `#net-status` | `Hud` | [[Notifications]] |
| `#scope` | `client/main.ts` | [[HUD]] (luneta) |
| `#touch` (criado em código) | `TouchControls` | [[Touch Controls]] |
| `#touch-edit-bar`, `#rotate` | `Screens` | [[Touch Controls]] |
| Sprite 3D sobre corpos | `CorpseTimer` | [[HUD]], [[Humiliation]] |
| Painel F6 (criado em código) | `TuningPanel` (`client/ui/tuning.ts`) | ferramenta de dev, ver [[Input & Controls]] |
| `#editor` (criado em código, no lugar da partida) | `runEditor` (`client/editor/editor.ts`): toolbar, painéis encaixáveis (Hierarquia, Cena, Inspetor, Projeto) e barra de status, CSS próprio (`client/editor/style.ts`) e textos próprios (`client/editor/strings.ts`) | [[Map Editor UI]] |

## Fluxo geral de telas

```mermaid
flowchart LR
    Load[Carregamento] --> Home[Início: landing ou abas]
    Home -->|Online| Lobby[Entrada rápida ou lista de sessões]
    Home -->|Bots / Treino| Load2[Carregando mapa]
    Lobby -->|Entrar/Criar| Load2
    Home --> Auth[Entrar / Cadastrar]
    Home --> Profile[Perfil] --> Custom[Personalizar personagem]
    Load2 --> Start[Menu inicial: JOGAR]
    Start -->|JOGAR| Play[Partida + HUD]
    Play -->|Esc / pausa| Pause[Menu de pausa]
    Pause -->|Voltar ao jogo| Play
    Pause -->|Esc / ◯ com aba aberta| Pause
    Pause -->|Sair...| Confirm[Confirmação: FICAR ou SAIR]
    Confirm -->|FICAR / Esc / ◯| Pause
    Confirm -->|SAIR| Reload[(recarrega a página)]
```

A saída do menu ("Sair da sessão", "Sair da partida", "Sair da corrida", "Sair do treino", conforme o modo) pede **confirmação** e só então fecha a conexão e **recarrega a página inteira** (`location.reload()` em `client/main.ts`): não existe retorno ao início sem recarregar. No menu, Esc e ◯ voltam um nível (janela → aba → jogo; ver [[Menus]]).

## Princípios observados no código

- **Um único conjunto de ações para todos os dispositivos:** teclado/mouse, toque e controle alimentam as mesmas ações nomeadas (`Input`), e a UI mostra os glifos do dispositivo em uso (tecla, "Toque", ✕/A...). Ver [[Input & Controls]].
- **Atualização barata:** o HUD guarda o último valor mostrado e só toca no DOM quando muda; números (vida, munição, placar) são atualizados a 15 Hz (`hudTimer = 1/15` em `main.ts`).
- **Textos sempre por `t(chave)`:** todo texto visível vem de `client/ui/strings.ts` em **quatro idiomas** (PF-30): **pt-BR** e **en** no próprio arquivo, **es** (espanhol latino-americano neutro, es-419, "tú") e **de** (alemão, "du") em `strings.es.ts` e `strings.de.ts`, tipados pelas chaves do pt-BR (o typecheck acusa chave faltando). O jogador escolhe o idioma na linha **Idioma** da subaba Vídeo das [[Settings]] ou no botão de idioma da landing, ao lado de ENTRAR; sem escolha salva vale o do navegador (`detectLang(navigator.languages)`: pt → pt-BR, es, de, en; qualquer outro → en). Fora da partida a página recarrega no idioma novo; dentro dela vale ao voltar ao início. Números e datas seguem o locale do idioma (`locale()`, es-419 para espanhol). O editor de mapas (`client/editor/strings*.ts`) e o editor de personagem (`client/ui/customizeLabels.ts`) têm textos próprios nos quatro idiomas. Ficam em pt-BR: nomes e placas de mapa, falas de NPC, nomes de bots, bonecos e convidados e o texto dentro das imagens das figurinhas. Ver [[ADR - Seletor de idioma por aparelho]].
- **Segurança de texto:** nomes de jogadores e mensagens de chat são escritos com `textContent` ou escapados (`esc`) antes de `innerHTML`.
- **Navegação por controle:** fora da partida, `PadNav` (`client/ui/padNav.ts`) move o foco para o controle visível mais próximo na direção do D-pad/analógico; ✕/A aciona, ◯/B volta (botões marcados com `data-pad-back` ou cujo texto começa com uma palavra de `BACK_WORDS` em `strings.ts`: voltar/back/volver/zurück, cancelar/cancel/abbrechen, fechar/close/cerrar/schließen e o "sair" do português), L1/R1 trocam abas, analógico direito rola (no canvas do Arsenal da tela inicial clássica, move o canvas). No galpão, o foco anda pelo menu e pelas superfícies e ◯/B aperta o ‹ GALPÃO.
- **Celular:** classe `mobile` no `<html>` (`client/core/device.ts`) troca layouts via CSS (`.desktop-only`, `.mobile-only`); a partida pede o celular deitado (aviso "Gire o celular para jogar").

## Notas desta área

[[HUD]] · [[Menus]] · [[Map Editor UI]] · [[Matchmaking UI]] · [[Inventory UI]] · [[Scoreboard]] · [[Notifications]] · [[Input & Controls]] · [[Chat]] · [[Settings]] · [[Touch Controls]]

Fluxos: [[Flow - First Access]] · [[Flow - Join Online Match]] · [[Flow - Death and Respawn]]

## Código relacionado

- `index.html` — estrutura de todas as telas.
- `client/styles.css` — estilos (~2500 linhas; seções HUD, Screens, Home, Scoreboard, Account, Character editor, Phones, Controllers).
- `client/ui/*.ts` — módulos de UI.
- `client/main.ts` — orquestra telas, HUD e input durante a partida.
- `client/ui/strings.ts` — i18n (`t`, `setLang`, `detectLang`, `resolveLang`, `locale`, `textOf`, `BACK_WORDS`); `strings.es.ts` e `strings.de.ts` — espanhol e alemão; `shared/langs.ts` — `LANGS` e o tipo `Text` dos dados.
