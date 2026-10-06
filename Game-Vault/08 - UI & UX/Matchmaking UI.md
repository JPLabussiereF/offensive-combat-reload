---
title: Matchmaking UI
type: system
status: documented
area: ui
source_paths:
  - client/ui/home.ts
  - client/net/connection.ts
  - shared/protocol.ts
  - shared/maps.ts
  - index.html
tags:
  - game
  - ui
  - matchmaking
updated: 2026-10-05
---

# Matchmaking UI

Não existe matchmaking automático (fila, busca por habilidade ou região). A "seleção de partida" online é um **navegador de sessões** na tela inicial: o jogador vê a lista de sessões abertas e escolhe uma, ou cria a própria. A lógica do servidor está em [[Matchmaking]] e [[Sessions]]; o fluxo completo em [[Flow - Join Online Match]].

## Tela "Sessões" (`#home-lobby`)

| Elemento | Comportamento |
| --- | --- |
| Título | "Sessões". |
| Lista (`#session-list`) | Uma linha por sessão: **nome** (em negrito), **mapa** em texto menor (omitido quando o nome da sessão já é o nome do mapa, caso das sessões fixas), **jogadores/máximo** e botão **ENTRAR** — ou **LOTADA** (desabilitado) quando cheia. Lista vazia: "Nenhuma sessão aberta. Crie a primeira!". |
| Criar sessão | Campo de nome (máx. `NET.sessionNameMax` = 24 caracteres, placeholder "Nome da nova sessão"), seletor de mapa e botão **CRIAR** (Enter no campo também cria). |
| Voltar | Fecha a conexão e volta à tela inicial. |
| Status (`#home-status`) | "Conectando ao servidor…", "Conectado como {nome}.", "Entrando…", erros. |

A lista é **atualizada ao vivo**: depois do `welcome`, o servidor envia mensagens `sessions` e a lista é redesenhada.

> [!info]
> Segundo o `README.md` do projeto, cada mapa tem uma sessão fixa sempre presente ("Rua dos Vizinhos", "Jardim do Dragão", "Vila Assombrada") e cada sessão é um mata-mata livre de até 10 jogadores (`NET.maxPlayers` = 10 em `shared/protocol.ts`). Ver [[Free For All]].

## Pré-condições e erros

- **Exige conta:** sem login, abre o formulário de entrar com a mensagem "Entre na sua conta para jogar online.".
- **Conta marcada para exclusão:** bloqueia ("Esta conta está marcada para exclusão. Cancele no Perfil para jogar online.").
- **Servidor fora do ar:** "Servidor fora do ar. Rode "bun run dev:online" (ou jogue o treino offline)." — a mensagem é voltada ao desenvolvedor local. Ver [[Local Development]].
- **Conexão fechada pelo servidor:** motivo pelo código de fechamento (`closeReason`): sessão encerrada (4001: saída, troca de senha, exclusão ou suspensão), conta conectada em outro lugar (4002) ou conexão perdida.
- Cliques repetidos são ignorados enquanto uma operação está em andamento (`busy`).

## Offline e bots

Para os modos sem servidor não há lista: o mapa é escolhido no seletor da tela inicial (`#home-map`), junto com dificuldade e número de bots. Ver [[Menus]], [[Training]] e [[Versus Bots]].

## Código relacionado

- `client/ui/home.ts` — `renderList`, `join`, handlers de `#home-online`, `#session-create`, `#home-back`, `closeReason`.
- `client/net/connection.ts` — `Connection.open`, `next`, `hold`/`release`.
- `shared/protocol.ts` — `SessionInfo`, mensagens `hello`/`welcome`/`sessions`/`join`/`create`/`joined`, `NET`, `CLOSE`.
- `shared/maps.ts` — `MAP_IDS`, `MAPS[id].nome`.
