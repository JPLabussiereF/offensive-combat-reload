---
title: Touch Controls
type: system
status: documented
area: ui
source_paths:
  - client/ui/touch.ts
  - client/core/input.ts
  - client/core/device.ts
  - client/core/settings.ts
  - client/ui/menu.ts
  - client/main.ts
  - client/styles.css
  - index.html
  - public/manifest.webmanifest
tags:
  - game
  - ui
  - mobile
  - touch
updated: 2026-10-06
---

# Touch Controls

Controles de toque para celulares e tablets (`TouchControls` em `client/ui/touch.ts`), no estilo **CoD Mobile**. Só são criados quando `IS_MOBILE` é verdadeiro ([[Input & Controls]]) e alimentam as mesmas ações nomeadas do teclado (`input.press`, `input.move`, `input.addLook`): o código de jogo não sabe se veio de toque.

## Layout padrão

Ícones de linha minimalistas (traço branco sobre círculos escuros translúcidos). Posições em unidades da altura da tela, respeitando as áreas seguras (notch, cantos arredondados) lidas de `env(safe-area-inset-*)`.

| Botão | Ação | Posição | Comportamento |
| --- | --- | --- | --- |
| Analógico | andar | metade esquerda | **flutuante**: aparece sob o dedo; zona morta pequena; empurrado até a borda (≥ 92% do raio), principalmente para frente, **corre** |
| Área de olhar | olhar | resto da tela | arrastar gira a câmera |
| Atirar (grande) | `fire` | direita, ao centro | arrastar sobre ele **também mira** (atirar e girar ao mesmo tempo) |
| Atirar 2 | `fire` | esquerda, acima do analógico | idem; continua atirando enquanto qualquer um estiver pressionado |
| Mirar | `ads` | acima/esquerda do atirar | tocar alterna (padrão) ou segurar (`adsHold`) |
| Pular | `jump` | canto direito | — |
| Agachar | `crouch` | canto direito, abaixo do pular | alterna |
| Recarregar | `reload` | direita | anel enche durante a recarga; **pulsa** com pente baixo |
| Faca | `melee` | direita, embaixo | — |
| Granada | `grenade` | direita, acima | segurar cozinha, soltar arremessa; mostra quantas restam (apagado sem nenhuma) e um anel enchendo com a próxima em recarga |
| Trocar de arma | `swapWeapon` | direita, acima do pular | ícone de duas setas; troca entre primária e secundária ([[Weapons]]) |
| Pausa | — | fileira de cima à esquerda | abre o menu |
| Placar | `scoreboard` | fileira de cima | **alterna** |
| Tela cheia | — | fileira de cima | só onde há Fullscreen API |
| Chat | — | fileira de cima | só online; abre o [[Chat]] |

A fileira de cima empacota só os botões presentes (sem tela cheia no iPhone, sem chat offline).

## Olhar

Curva de resposta: arrastos lentos a 75% (mira fina), rápidos até 170% (virar). Os pixels são convertidos em "contagens de mouse" na sensibilidade atual (`DEG_PER_PX` 0,18 × `touchSensitivity`), para que o jogo use uma única fórmula (inclusive ao mirar). Assistência de mira opcional: [[Aim Assist]].

## Personalização

- **Configurações** ([[Settings]]): sensibilidade do toque, tamanho dos botões (70–140%), opacidade (20–100%, padrão 55%), mira segurar/alternar, tela cheia ao jogar.
- **Editor de layout** ("Ajustar botões" no menu de pausa): o menu some, o HUD e os botões aparecem sobre o jogo pausado e podem ser **arrastados**; barra com "Posições padrão" e "Pronto". As posições são salvas como fração da tela (`touchLayout`) em `localStorage`.

## Integração com o celular

- **Paisagem obrigatória:** em retrato durante a partida aparece "Gire o celular para jogar" (`#rotate`).
- **Tela cheia + travamento em paisagem** ao tocar JOGAR (se `fullscreen` ligado). No iPhone não há Fullscreen API: o menu explica "Adicionar à Tela de Início", e o `manifest.webmanifest` abre o jogo em tela cheia na horizontal quando instalado.
- Zoom por pinça bloqueado (`gesturestart`/`gesturechange`), `viewport` sem escala e `interactive-widget=resizes-visual` (o teclado do chat cobre o jogo em vez de encolher a página).
- Com um controle em uso os botões de toque somem e voltam ao tocar na tela.
- Ao pausar, todos os botões e alternâncias são soltos (`reset`).
- No celular o HUD é compactado (vida e munição entre o analógico e os botões; bônus viram chips; chat recolhido em três linhas). Ver [[HUD]].

## Código relacionado

- `client/ui/touch.ts` — `TouchControls`, `BUTTONS`, `ICONS`, `layout`, `setEditing`, `setChat`, `setStatus`, `resetLayout`, `clearToggle`.
- `client/main.ts` — criação (`IS_MOBILE`), `onPause`, `onChat`, `setStatus` por quadro, editor de layout.
- `client/ui/menu.ts` — `onEditLayout`, ajustes de toque, aviso do iOS.
- `client/core/device.ts` — detecção, tela cheia, `isPortrait`.
- `client/styles.css` — seção "Phones and tablets" e "Touch controls".
