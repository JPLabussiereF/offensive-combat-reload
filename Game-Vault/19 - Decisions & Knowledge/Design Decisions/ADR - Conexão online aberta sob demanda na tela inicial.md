---
title: ADR - Conexão online aberta sob demanda na tela inicial
type: decision
status: documented
area: ui
source_paths:
  - client/ui/playRules.ts
  - client/ui/home.ts
  - server/app.ts
  - shared/protocol.ts
tags:
  - game
  - decision
  - ui
  - networking
updated: 2026-10-08
---

# ADR - Conexão online aberta sob demanda na tela inicial

## Contexto

O design novo da tela inicial (`Home.dc.html`) mostra, logado e no modo Online, a lista de sessões já aberta na aba Jogar e um botão **JOGAR ONLINE** que "entra direto na sessão mais cheia dos mapas filtrados" ([[Menus]], [[Matchmaking UI]]).

## Problema

Ver a lista exige o WebSocket do jogo (`hello` → `welcome`/`sessions`). O servidor aceita **uma conexão por conta**: ao abrir a segunda, fecha a anterior com `CLOSE.replaced` ("conta conectada em outro lugar", `server/app.ts`). Conectar ao simplesmente abrir a tela inicial derrubaria uma partida em andamento só por abrir o jogo em outra aba.

## Opções consideradas

- Conectar ao abrir a tela inicial (lista sempre visível, como no design).
- Conectar só quando o jogador pede: **VER SESSÕES** ou **JOGAR ONLINE**.
- Um endpoint HTTP só de leitura para a lista de sessões, sem WebSocket (exige mudança no servidor).

## Decisão

A conexão abre **sob demanda** (VER SESSÕES ou JOGAR ONLINE). Ela fecha ao trocar para Contra bots ou Campo de tiro, ao sair da conta e ao começar um modo offline. A entrada rápida escolhe no cliente, a partir da lista recebida, a sessão mais cheia não lotada dos mapas marcados, e envia um `join` comum. O servidor não mudou.

## Motivo

Mantém o modelo "uma conexão por conta" sem criar efeito colateral ao só navegar. Também evita mudar o protocolo para um recurso de interface.

## Consequências

- ~~Antes de conectar, a aba mostra o botão VER SESSÕES no lugar da lista.~~ Substituído pela revisão abaixo.
- A entrada rápida pode perder a corrida: se a sessão lotar entre a lista e o `join`, o servidor recusa e a mensagem de erro aparece no aviso da tela.
- Depois foi criado o endpoint de leitura `GET /api/sessoes`: os botões de mapa já mostram quantas sessões cada mapa tem antes de conectar. Na revisão abaixo, a lista inteira passou a vir por ele.

## Revisão (2026-10-06)

A opção do endpoint de leitura foi adotada: `GET /api/sessoes` ([[APIs]]) traz a lista sem WebSocket. A aba Jogar já abre com as sessões carregadas (6 por vez, **VER MAIS** quando há mais), e o botão VER SESSÕES deixou de existir. A decisão central continua: a **conexão de jogo** só abre quando o jogador escolhe entrar (**ENTRAR**, **CRIAR** ou **JOGAR ONLINE**), então abrir o jogo em outra aba não derruba uma partida.

## Revisão (2026-10-08, PF-32)

O filtro de vários mapas saiu da aba Jogar: a entrada rápida passou a ser **do mapa escolhido, ou de qualquer mapa**. Com um mapa escolhido, o botão laranja (e a ENTRADA RÁPIDA do galpão) manda `play` para ele; com **Qualquer mapa**, para o mapa da sessão mais cheia não lotada do tipo, ou para um mapa oficial do tipo quando ninguém joga (`quickTarget` em `client/ui/playRules.ts`). A escolha continua no cliente, a partir da lista; dentro do mapa, o servidor põe na primeira sala com vaga (ou abre uma), por isso os textos novos não prometem "a sessão mais cheia". A decisão central não muda: a **conexão de jogo** só abre quando o jogador escolhe entrar (JOGAR ONLINE, ENTRAR, CRIAR ou a ENTRADA RÁPIDA), e a lista continua vindo por `GET /api/sessoes`.

## Código afetado

- `client/ui/home.ts` (`connect`, `closeConn`, `join`, `refreshList`, `quickJoin`, handlers de `#home-play-cta` e `#home-quick`)
- `client/ui/playRules.ts` (`quickTarget`, desde a PF-32)
- `server/app.ts` (`GET /api/sessoes`)
