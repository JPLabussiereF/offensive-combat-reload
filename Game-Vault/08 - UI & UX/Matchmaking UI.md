---
title: Matchmaking UI
type: system
status: documented
area: ui
source_paths:
  - client/ui/playRules.ts
  - shared/modes.ts
  - client/ui/home.ts
  - client/net/connection.ts
  - shared/protocol.ts
  - shared/maps.ts
  - index.html
tags:
  - game
  - ui
  - matchmaking
updated: 2026-10-08
---

# Matchmaking UI

Não existe matchmaking automático (fila, busca por habilidade ou região). A "seleção de partida" online é um **navegador de sessões** na tela inicial: o jogador vê a lista de sessões abertas e escolhe uma, ou cria a própria. A lógica do servidor está em [[Matchmaking]] e [[Sessions]]; o fluxo completo em [[Flow - Join Online Match]].

## Online na aba Jogar (`#home-lobby`)

Com **Online** escolhido na aba Jogar da tela inicial ([[Menus]]; disposição da PF-32), o jogador escolhe o tipo de partida e **um mapa** (ou **Qualquer mapa**), e o botão laranja entra. A lista ao lado mostra as sessões **desse mapa e desse tipo**, então ela sempre bate com o que o botão vai fazer.

| Elemento | Comportamento |
| --- | --- |
| Tipo de partida (`#home-game`) | **Mata-mata**, **Corrida armada** ou **Zumbi** (salvo em `oc.bots.game`), com a descrição embaixo num espaço fixo. Filtra a lista, as contagens dos mapas e o botão laranja, e é o modo da sessão criada. Ver [[Free For All]], [[Gun Game]] e [[Zombie]]. |
| Mapas (`#home-maps`) | Cartões de **escolha única**: primeiro **Qualquer mapa** (o padrão; `oc.bots.onlineMap = null`), depois os oficiais de `/api/mapas?tipo=oficial` e os mapas das sessões abertas (um mapa da comunidade com gente jogando, com o cartão de `GET /api/mapas/:id`). A linha de cada cartão diz **"N jogando"** (soma dos jogadores das sessões do mapa e do tipo; no Qualquer mapa, do tipo inteiro) ou "ninguém agora"; antes de a lista chegar, o clima ou "por {autor}" ("Onde tiver mais gente" no Qualquer mapa). A escolha fica em `oc.bots.onlineMap`; se um mapa da comunidade escolhido sai da lista (ninguém mais joga nele), vale Qualquer mapa sem apagar a escolha, e ele volta escolhido se reaparecer. Num modo de um mapa só (o **Zumbi**, só no Cemitério da Capela) aparece só esse mapa, marcado, com "Só no Cemitério da Capela" e sem Qualquer mapa; o cemitério nunca aparece nos outros tipos. **Todos os mapas ›** abre a aba Mapas. |
| Botão laranja **JOGAR ONLINE** (`#home-play-cta`) | Conecta se preciso e manda `play {map, mode}`: com um mapa escolhido, esse mapa; com **Qualquer mapa**, o mapa da sessão **mais cheia que não esteja lotada** do tipo, ou um **mapa oficial** do tipo ao acaso quando ninguém joga (`quickTarget` em `client/ui/playRules.ts`). Quem escolhe a sala dentro do mapa é o servidor (a primeira com vaga, ou uma nova; [[Matchmaking]]), por isso os textos não prometem "a mais cheia". A linha do botão diz o resultado: "Mata-mata · Rua dos Vizinhos · 9 jogando", "· abre uma sessão nova" quando ninguém joga ali, "Mata-mata · qualquer mapa · 11 jogando"; sem a contagem até a lista chegar. A **ENTRADA RÁPIDA** (e Enter) da visão geral do galpão e o **JOGAR ONLINE** do cartão do personagem (home clássica, fora da aba Jogar) fazem o mesmo, sempre online, com o tipo e o mapa do Online ("Mata-mata · Online · Rua dos Vizinhos" ou "· Qualquer mapa"). |
| Título | "Sessões em {mapa} (N)" ("Sessões em qualquer mapa (N)"); "(…)" até a lista chegar. |
| **VER MAIS (N)** | A lista mostra **6 sessões por vez**; o botão só aparece quando sobram sessões e mostra mais 6 a cada clique. Volta a 6 ao trocar o lugar, o tipo ou o mapa. |
| Lista (`#session-list`) | **Já carregada ao abrir a aba** (`GET /api/sessoes`, atualizada a cada 10 s; ao vivo depois de conectar), na ordem do servidor. Uma linha por sessão: **nome**, o **mapa** em texto menor só com Qualquer mapa (e não quando o nome começa com ele, caso das abertas por `play`), **jogadores/máximo** e **ENTRAR** (conecta se preciso e entra), ou **LOTADA** (desabilitado). Saiu a etiqueta colorida do modo (a lista já é de um tipo). Vazia: "Ninguém em {mapa} agora. JOGAR ONLINE abre uma sessão nova." (com um mapa) ou "Nenhuma sessão aberta. JOGAR ONLINE abre a primeira." (Qualquer mapa); antes da lista, "Buscando sessões…"; se nenhuma lista chegou e o pedido falhou (servidor fora), "Sem servidor agora. Bots e treino funcionam offline." (`listFailed`). |
| **+ Criar sessão com nome** | Recolhido num link: abre só o campo do nome (máx. `NET.sessionNameMax` = 24 caracteres) e **CRIAR** (Enter também cria; o × fecha e limpa), com a linha "em {mapa} · {tipo}": a sessão é criada no mapa e no tipo escolhidos (`create {name, map, mode}`), conectando se preciso. Com Qualquer mapa o link fica desabilitado, com "Escolha um mapa para criar uma sessão com nome." numa linha embaixo. Saíram os seletores de mapa e de modo da criação. Sem nome, o servidor chama a sala de "Sala de {nome}". |
| Celular deitado (galpão) | O rodapé tem **SESSÕES (N)**, que mostra a lista por cima dos mapas (**‹ MAPAS** volta; **+ CRIAR** no topo troca a linha de cima pelo campo do nome, que fica no alto para o teclado virtual não cobri-lo; no Qualquer mapa ele fica desabilitado, com o aviso como dica). Trocar de lugar ou de mapa fecha a lista. |
| Status (`#home-status`) | Aviso no rodapé: "Conectando ao servidor…", "Conectado como {nome}.", "Entrando…", erros. |

A lista é **atualizada ao vivo**: depois do `welcome`, o servidor envia mensagens `sessions` e a aba é redesenhada.

Antes do `join`/`create`, o cliente manda a escolha do Arsenal (`loadout`) para o servidor: é a última chance de mudá-la, porque o equipamento fica travado dentro da sessão ([[ADR - Equipamento travado no mata-mata]]).

**A conexão de jogo só abre quando o jogador escolhe entrar** (ENTRAR, CRIAR ou JOGAR ONLINE); a lista vem antes, por HTTP. A conexão fecha ao trocar para Contra bots ou Campo de tiro, ao sair da conta ou ao começar um modo offline. Ver [[ADR - Conexão online aberta sob demanda na tela inicial]].

> [!info]
> Desde a PF-6 (fase 2) não há sessão fixa: elas abrem sob demanda e fecham vazias; cada sessão tem até 10 jogadores (`NET.maxPlayers` = 10 em `shared/protocol.ts`). Os cartões de mapa do Online vêm de `/api/mapas?tipo=oficial` somados aos mapas das sessões abertas (um mapa da comunidade com gente jogando aparece com o seu cartão), e criar sessão usa o mapa escolhido, qualquer um deles. A aba **Mapas** ([[Menus]]) joga qualquer mapa oficial ou da comunidade online (**Jogar**: `play` no modo escolhido). Ver [[Free For All]].

## Pré-condições e erros

- **Exige conta:** a aba Jogar só existe logado; se a sessão expirar, abre o formulário de entrar com a mensagem "Entre na sua conta para jogar online.".
- **Conta marcada para exclusão:** bloqueia ("Esta conta está marcada para exclusão. Cancele no Perfil para jogar online.").
- **Servidor fora do ar:** "Servidor fora do ar. Rode "bun run dev:online" (ou jogue o treino offline)." — a mensagem é voltada ao desenvolvedor local. Ver [[Local Development]].
- **Conexão fechada pelo servidor:** motivo pelo código de fechamento (`closeReason`): sessão encerrada (4001: saída, troca de senha, exclusão ou suspensão), conta conectada em outro lugar (4002) ou conexão perdida.
- Cliques repetidos são ignorados enquanto uma operação está em andamento (`busy`).

## Offline e bots

Para os modos sem servidor não há lista: o mapa é o cartão escolhido na aba Jogar (ou o botão da landing, sem conta), junto com o tipo de partida (os modos com `bots: true`), dificuldade e número de bots no painel lateral (no celular deitado, dois seletores nativos no rodapé). No Campo de tiro, desde a PF-32, o clique no mapa **só escolhe** e o botão laranja começa, como nas outras abas. Com **Zumbi** escolhido em "Contra bots", dificuldade e número de bots somem, só o Cemitério da Capela aparece (marcado) e o botão vira **ENCARAR A HORDA SOZINHO** (o jogo solo, [[Zombie]]). O cemitério não aparece nos cartões dos outros modos, no Campo de tiro nem na vitrine de mapas da landing, e nunca fica salvo como o mapa escolhido (`oc.bots.map`): fora do zumbi só os mapas sem `exclusivo`. Ver [[Menus]], [[Training]] e [[Versus Bots]].

> [!info] Correção na landing (2026-10-06)
> O seletor de tipo de partida da landing (sem conta) tinha o mesmo id da seção "Sobre" (`land-game`), e o preenchimento caía na seção errada. Agora é `#land-games`.

## Código relacionado

- `client/ui/home.ts` — `renderPlay`, `renderLobby`, `connect`, `join`, `quickJoin`, `refreshList` (`listFailed`), handlers de `#home-play-cta`, `#home-quick`, `#home-maps`, `#home-more`, `#home-create-toggle`, `#session-create-btn`, `#home-sessions-toggle`, `closeReason`.
- `client/ui/playRules.ts` — `effectiveOnlineMap`, `sessionsFor`, `playersOn`, `quickTarget`, `migrateOnlineMap`, `ctaText` (testes em `client/tests/playRules.test.ts`).
- `client/net/connection.ts` — `Connection.open`, `next`, `hold`/`release`.
- `shared/protocol.ts` — `SessionInfo`, mensagens `hello`/`welcome`/`sessions`/`join`/`create`/`joined`, `NET`, `CLOSE`.
- `shared/maps.ts` — `OFFICIAL_MAPS`; `client/world/mapLoader.ts` — `OFFICIAL_INFO` (nome e `exclusivo` dos oficiais).
