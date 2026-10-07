---
title: Problem - Esc e Pointer Lock no navegador
type: problem
status: documented
area: ui
source_paths:
  - client/core/input.ts
  - client/core/device.ts
  - client/main.ts
  - client/ui/chat.ts
tags:
  - game
  - input
  - browser
  - problem
updated: 2026-10-07
---

# Problem - Esc e Pointer Lock no navegador

## Sintoma

No computador, apertar Esc para pausar e de novo para voltar nem sempre devolve a mira na hora: o navegador pode exigir um clique ou outra tecla antes de recapturar o mouse. Abrir o chat com o mouse capturado faria o Esc abrir o menu em vez de fechar o chat.

## Causa

Regras da Pointer Lock API: com o mouse capturado, o navegador **sempre** consome o Esc para liberar o mouse, e só concede uma nova captura dentro de um clique ou tecla (não o próprio Esc), exceto quando foi a página que liberou o mouse. A exceção é a tela cheia com **Keyboard Lock** (Chrome/Edge), em que a página pode ficar com o Esc.

## Mitigações no código

- **Tela cheia + Keyboard Lock** (`keepEscape` em `client/core/device.ts`, opção "Tela cheia ao jogar"): o jogo trata o Esc, pausa liberando o mouse ele mesmo e o retoma sem clique.
- **Sem Keyboard Lock:** o segundo Esc fecha o menu e o jogo volta a rodar sem mouse capturado; a próxima tecla ou clique recaptura, com o aviso "A mira volta com a próxima tecla ou clique" (`client/main.ts`, `Input` em `client/core/input.ts`).
- O Esc que abriu o menu é ignorado se chegar depois (comparação de `timeStamp` com `pausedAt`).
- **Dentro do menu (PF-11)** o Esc volta um nível: fecha a janela de saída, depois a aba aberta, e só então volta ao jogo (`screens.back()` antes de retomar). Sem Keyboard Lock, continua valendo: o primeiro Esc é do navegador (libera o mouse e abre o menu) e o que volta ao jogo deixa a mira para a próxima tecla ou clique. A captura de tecla da aba Teclas escuta antes e fica com o seu Esc (cancela a captura). Ver [[Menus]] e [[ADR - Menu de pausa com trilho e abas]].
- **Chat:** ao abrir, o jogo libera o mouse sem pausar (`releaseMouse`/`keepPlaying`), para que o Esc chegue à caixa de texto.
- Captura com `unadjustedMovement` e fallback para captura simples; timeout de 1,5 s por pedido.
- Entrar em tela cheia pode custar a captura; ela é refeita se a pausa acabou de acontecer (< 1,5 s).

## Situação

Contornado, não resolvido: fora do Chrome/Edge em tela cheia o jogador ainda precisa de uma tecla/clique extra para mirar após a pausa. Limitação da plataforma (navegador), não do jogo.

## Código relacionado

- `client/core/input.ts` — `lock`, `requestLock`, `setPlaying`, `releaseMouse`, `unlock`.
- `client/core/device.ts` — `CAN_KEEP_ESCAPE`, `keepEscape`, `escapeIsKept`.
- `client/main.ts` — handler de Esc, `input.onLockChange`, `fullscreenchange`.
- `client/ui/chat.ts` — Esc no chat.

Ver [[Input & Controls]] e [[Menus]].
