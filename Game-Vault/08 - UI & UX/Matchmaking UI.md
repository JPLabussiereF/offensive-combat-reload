---
title: Matchmaking UI
type: system
status: documented
area: ui
source_paths:
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
updated: 2026-10-06
---

# Matchmaking UI

Não existe matchmaking automático (fila, busca por habilidade ou região). A "seleção de partida" online é um **navegador de sessões** na tela inicial: o jogador vê a lista de sessões abertas e escolhe uma, ou cria a própria. A lógica do servidor está em [[Matchmaking]] e [[Sessions]]; o fluxo completo em [[Flow - Join Online Match]].

## Online na aba Jogar (`#home-lobby`)

Com o modo **Online** escolhido na aba Jogar da tela inicial ([[Menus]]):

| Elemento | Comportamento |
| --- | --- |
| Tipo de partida (`#home-game`) | **Mata-mata**, **Corrida armada** ou **Zumbi** (botões, salvo em `oc.bots.game`), com uma linha explicando o modo. Filtra a lista, as contagens dos mapas e a entrada rápida, e é o modo da sessão criada. Ver [[Free For All]], [[Gun Game]] e [[Zombie]]. |
| Filtro de mapas | Os três mapas oficiais abertos (sem `exclusivo`) como caixas de marcar, numa grade que ocupa a linha inteira como os cartões de modo (todos marcados por padrão, salvos em `oc.bots.filtro`). Cada um mostra quantas sessões tem: antes de conectar, por `GET /api/sessoes` (ao abrir, ao voltar ao modo Online e a cada 10 s); conectado, pela lista ao vivo. Sem servidor, mostra o clima do mapa. As sessões abrem sob demanda ([[Matchmaking]]): a **entrada rápida** manda `play` para o mapa da sessão mais cheia com vaga entre os marcados, ou para um dos marcados quando ninguém joga neles (o servidor abre a sala). Num modo de um mapa só (o **Zumbi**, só no Cemitério da Capela) o filtro some: aparece só esse mapa, marcado, com "Só no Cemitério da Capela", e a lista, a entrada rápida e o seletor de mapa de "Criar sessão" ficam nele. O cemitério é exclusivo do zumbi: nunca aparece no filtro, na lista nem no "Criar sessão" dos outros modos. |
| **JOGAR ONLINE** (cartão do personagem) | **Entrada rápida:** conecta se preciso e entra na sessão **mais cheia que não esteja lotada** do tipo de partida escolhido, entre os mapas marcados. Sem mapa marcado: "Marque pelo menos um mapa."; sem sessão livre: "Nenhuma sessão aberta nos mapas selecionados.". A escolha é feita no cliente a partir da lista; o servidor só recebe um `join` comum. |
| Título | "Sessões abertas (N)", contando só as dos mapas marcados. |
| **VER MAIS (N)** | A lista mostra **6 sessões por vez**; o botão só aparece quando sobram sessões e mostra mais 6 a cada clique. Volta a 6 ao mudar o filtro ou o modo. |
| Lista (`#session-list`) | **Já carregada ao abrir a aba** (`GET /api/sessoes`, atualizada a cada 10 s; ao vivo depois de conectar). Uma linha por sessão do tipo escolhido nos mapas marcados: **nome**, **mapa** em texto menor (omitido quando o nome da sessão começa com o nome do mapa, caso das abertas por `play`), uma **etiqueta do modo** (cor por modo), **jogadores/máximo** e **ENTRAR** (conecta se preciso e entra), ou **LOTADA** (desabilitado) quando cheia. Vazia: "Nenhuma sessão aberta. Crie a primeira!" ou, se o filtro escondeu todas, "Nenhuma sessão aberta nos mapas selecionados.". |
| Criar sessão | Campo de nome (máx. `NET.sessionNameMax` = 24 caracteres), seletor de mapa, seletor de **modo** (sincronizado com o tipo de partida) e **CRIAR** (Enter também cria); conecta se preciso. No celular o nome ocupa a linha de cima. |
| Status (`#home-status`) | Aviso no rodapé: "Conectando ao servidor…", "Conectado como {nome}.", "Entrando…", erros. |

A lista é **atualizada ao vivo**: depois do `welcome`, o servidor envia mensagens `sessions` e a aba é redesenhada.

Antes do `join`/`create`, o cliente manda a escolha do Arsenal (`loadout`) para o servidor: é a última chance de mudá-la, porque o equipamento fica travado dentro da sessão ([[ADR - Equipamento travado no mata-mata]]).

**A conexão de jogo só abre quando o jogador escolhe entrar** (ENTRAR, CRIAR ou JOGAR ONLINE); a lista vem antes, por HTTP. A conexão fecha ao trocar para Contra bots ou Campo de tiro, ao sair da conta ou ao começar um modo offline. Ver [[ADR - Conexão online aberta sob demanda na tela inicial]].

> [!info]
> Desde a PF-6 (fase 2) não há sessão fixa: elas abrem sob demanda e fecham vazias; cada sessão tem até 10 jogadores (`NET.maxPlayers` = 10 em `shared/protocol.ts`). Os mapas do filtro online vêm de `/api/mapas?tipo=oficial` somados aos mapas das sessões abertas (um mapa da comunidade com gente jogando aparece com o seu cartão), e criar sessão aceita qualquer um deles. A aba **Mapas** ([[Menus]]) joga qualquer mapa oficial ou da comunidade online (**Jogar**: `play` no modo escolhido). Ver [[Free For All]].

## Pré-condições e erros

- **Exige conta:** a aba Jogar só existe logado; se a sessão expirar, abre o formulário de entrar com a mensagem "Entre na sua conta para jogar online.".
- **Conta marcada para exclusão:** bloqueia ("Esta conta está marcada para exclusão. Cancele no Perfil para jogar online.").
- **Servidor fora do ar:** "Servidor fora do ar. Rode "bun run dev:online" (ou jogue o treino offline)." — a mensagem é voltada ao desenvolvedor local. Ver [[Local Development]].
- **Conexão fechada pelo servidor:** motivo pelo código de fechamento (`closeReason`): sessão encerrada (4001: saída, troca de senha, exclusão ou suspensão), conta conectada em outro lugar (4002) ou conexão perdida.
- Cliques repetidos são ignorados enquanto uma operação está em andamento (`busy`).

## Offline e bots

Para os modos sem servidor não há lista: o mapa é escolhido nos botões de mapa da aba Jogar (ou da landing, sem conta), junto com o tipo de partida (os modos com `bots: true`), dificuldade e número de bots; no Campo de tiro, clicar no mapa já começa. Com **Zumbi** escolhido em "Contra bots", dificuldade e número de bots somem, só o Cemitério da Capela aparece e o botão vira **ENCARAR A HORDA SOZINHO** (o jogo solo, [[Zombie]]). O cemitério não aparece nos botões dos outros modos, no Campo de tiro nem na vitrine de mapas da landing, e nunca fica salvo como o mapa escolhido (`oc.bots.map`): os seletores fora do zumbi só oferecem os mapas sem `exclusivo`. Ver [[Menus]], [[Training]] e [[Versus Bots]].

> [!info] Correção na landing (2026-10-06)
> O seletor de tipo de partida da landing (sem conta) tinha o mesmo id da seção "Sobre" (`land-game`), e o preenchimento caía na seção errada. Agora é `#land-games`.

## Código relacionado

- `client/ui/home.ts` — `renderPlay`, `renderLobby`, `connect`, `join`, handlers de `#home-quick`, `#home-more`, `#session-create-btn`, `closeReason`.
- `client/net/connection.ts` — `Connection.open`, `next`, `hold`/`release`.
- `shared/protocol.ts` — `SessionInfo`, mensagens `hello`/`welcome`/`sessions`/`join`/`create`/`joined`, `NET`, `CLOSE`.
- `shared/maps.ts` — `OFFICIAL_MAPS`; `client/world/mapLoader.ts` — `OFFICIAL_INFO` (nome e `exclusivo` dos oficiais).
