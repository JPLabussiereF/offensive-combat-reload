---
title: Chat
type: system
status: documented
area: ui
source_paths:
  - client/ui/chat.ts
  - client/ui/strings.ts
  - client/core/input.ts
  - client/main.ts
  - shared/protocol.ts
  - server/session.ts
  - server/accounts.ts
tags:
  - game
  - ui
  - chat
  - multiplayer
updated: 2026-10-05
---

# Chat

Chat de texto da **sessão online** (`#chat`, classe `Chat` em `client/ui/chat.ts`). Offline e contra bots o chat fica escondido ("não há com quem falar").

## Como o jogador usa

| Dispositivo | Abrir | Enviar | Fechar |
| --- | --- | --- | --- |
| Computador | Ação "Chat" (Enter ou T por padrão; remapeável) durante o jogo | Enter / botão Enviar | Esc (fecha só o chat, não abre o menu) ou clicar no jogo |
| Celular | Botão de chat na fileira de cima dos [[Touch Controls]] | Toque numa **frase rápida** (sem abrir o teclado) ou digitar e enviar | Botão ✕ |

- **Frases rápidas** (só celular): pt-BR "GG", "Boa!", "Kkkkk", "Cuidado!", "Bora x1?", "Valeu!" (em inglês: "GG", "Nice!", "LOL", "Watch out!", "1v1 me?", "Thanks!").
- **Fechado:** as últimas linhas flutuam sobre o jogo e esmaecem após 10 s. **Aberto:** histórico rolável (até 40 linhas guardadas) sobre um fundo suave.
- Ao abrir no computador, o jogo **solta o mouse** sem pausar (`input.releaseMouse`) para que o Esc chegue à caixa de texto; ao fechar com Enter o mouse é retomado; se o navegador recusar, aparece "A mira volta com a próxima tecla ou clique".
- Enquanto digita, o jogo não recebe teclas nem mouse (`input.setTyping`): teclas seguradas são soltas para o jogador não continuar andando.

## Regras

- Máximo de **120 caracteres** (`NET.chatMax`); a mensagem é normalizada por `sanitizeChat` (quebras de linha viram espaço, caracteres de controle e de direção de texto são removidos, emojis com ZWJ preservados, corte por code point).
- O **servidor** sanitiza de novo, aplica limite de envio (rajada de 4 mensagens, depois 1 a cada 1,5 s: `NET.chatBurst`, `NET.chatEveryMs`) e verifica se a conta está **silenciada pela moderação**. Recusas voltam como `chatRefused` e aparecem como linha do sistema: "Seu chat está silenciado pela moderação." ou "Calma! Espere um pouco para mandar outra.".
- O remetente recebe a própria linha de volta do servidor (todos veem exatamente o mesmo texto); a própria linha recebe destaque (`mine`).
- Linhas são sempre escritas com `textContent`, nunca como HTML.

Detalhes de rede em [[Remote Calls]]; mute e moderação em [[Moderation]]; validação em [[Validation]].

## Código relacionado

- `client/ui/chat.ts` — `Chat` (`enable`, `open`, `close`, `toggle`, `add`, `system`, `onSend`).
- `client/main.ts` — `chat.enable(!!conn)`, `chat.onSend → conn.send({t:'chat'})`, `conn.on('chat' | 'chatRefused')`.
- `shared/protocol.ts` — `sanitizeChat`, `NET.chatMax/chatBurst/chatEveryMs`, mensagens `chat`/`chatRefused`.
- `server/session.ts` — retransmissão, limite e mute.
- `server/accounts.ts` — `chatMutedUntil`.
- `client/ui/strings.ts` — `QUICK_CHAT`, textos do chat.
