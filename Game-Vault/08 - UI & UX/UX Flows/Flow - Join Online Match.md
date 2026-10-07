---
title: Flow - Join Online Match
type: system
status: documented
area: ui
source_paths:
  - client/net/maps.ts
  - client/ui/home.ts
  - client/net/connection.ts
  - client/net/api.ts
  - client/main.ts
  - shared/protocol.ts
tags:
  - game
  - ux
  - flow
  - multiplayer
updated: 2026-10-07
---

# Flow - Join Online Match

Da tela inicial até estar jogando numa sessão online. A UI do navegador de sessões está em [[Matchmaking UI]]; o lado do servidor em [[Matchmaking]], [[Sessions]] e [[Client Server Model]].

## Sequência

```mermaid
sequenceDiagram
    actor J as Jogador
    participant H as Tela inicial (home.ts)
    participant S as Servidor (WebSocket)
    participant G as Jogo (main.ts)
    J->>H: aba Jogar, modo Online
    H->>S: GET /api/sessoes (HTTP, sem conexão de jogo; a cada 10 s)
    H->>J: lista filtrada pelos mapas marcados (6 por vez, VER MAIS)
    J->>H: JOGAR ONLINE, ENTRAR ou CRIAR
    H->>H: tem conta? e não está em exclusão?
    H->>S: Connection.open() + {t:'hello'}
    S-->>H: welcome (nome, lista de sessões)
    opt JOGAR ONLINE
        H->>H: escolhe a sessão mais cheia não lotada dos mapas marcados
    end
    H->>S: {t:'play', map, mode}, {t:'join', session} ou {t:'create', name, map, mode}
    S-->>H: joined (sessão com mapa e versão, meu id, horário do servidor)
    H->>S: GET /api/mapas/:map/versoes/:v (se não estiver em cache)
    H->>H: conn.hold() — guarda mensagens
    H->>H: GET /api/perfil (aparência, progressão)
    H-->>G: HomeChoice {mode:'online', conn, joined, map}
    G->>G: conn.seed(horário), carrega o mapa da sessão
    G->>G: cria handlers, renderiza 1 quadro, menu inicial
    G->>S: conn.release() — processa mensagens guardadas
    J->>G: JOGAR → pointer lock, partida
```

## Passo a passo

1. Na aba **Jogar** (só logado), modo **Online** e os mapas desejados marcados. Conta marcada para exclusão: bloqueado com instrução para cancelar no Perfil.
2. **Lista:** já aparece ao abrir a aba, vinda de `GET /api/sessoes` (6 por vez; **VER MAIS** quando há mais).
3. **Conexão** (só ao escolher entrar): "Conectando ao servidor…" → abre o WebSocket, envia `hello`, espera `welcome`, mostra "Conectado como {nome}.".
4. **Escolha:** **JOGAR ONLINE** manda `play` para o mapa da sessão mais cheia não lotada dos mapas marcados (ou para um dos marcados, se ninguém joga neles: o servidor abre a sala). Na lista, cada sessão mostra nome, mapa e jogadores/máximo (máx. 10); sessão cheia tem **LOTADA** desabilitado; também dá para criar uma nova (nome até 24 caracteres + mapa).
5. **Entrada:** "Entrando…" → `play`/`join`/`create` → `joined` (uma recusa chega como `error` e aparece no status). A conexão passa a **segurar** as mensagens que chegam (`hold`) enquanto o mapa é construído, para que nada se perca antes de existirem os handlers.
5. **Carregamento do mapa da sessão** (não o do seletor da tela inicial): os dados da versão da sala vêm de `GET /api/mapas/:id/versoes/:v` (`client/net/maps.ts`, guardados em memória e no IndexedDB). O relógio local é sincronizado com o do servidor (`seed`).
6. **Cartão de início** (o trilho do menu de pausa com JOGAR, sem o aviso): chip do modo, mapa e "Sessão: {nome} · {N}/{máx} jogadores"; dá para abrir a aba do modo e as Configurações antes de jogar. A conexão libera as mensagens guardadas (`release`). O mundo online **já está rodando** mesmo antes de clicar JOGAR.
7. **JOGAR:** captura do mouse, partida. Chat habilitado ([[Chat]]), placar com Tab ([[Scoreboard]]), avisos de entrada/saída no feed ([[Notifications]]).

## Falhas e saídas

| Situação | O que o jogador vê |
| --- | --- |
| Servidor fora do ar | "Servidor fora do ar. Rode "bun run dev:online" (ou jogue o treino offline)." |
| Erro ao entrar/criar | Mensagem do erro no status da tela inicial; continua na lista. |
| Conexão perdida antes de entrar | Motivo do fechamento no status; a lista continua vindo por HTTP. |
| Nenhuma sessão livre nos mapas marcados | "Nenhuma sessão aberta nos mapas selecionados." |
| Conexão perdida em jogo | `#net-status`: "Sem conexão com o servidor". |
| Sessão revogada (4001) | "Sua sessão foi encerrada (saída da conta, troca de senha, exclusão ou suspensão)." |
| Mesma conta em outro lugar (4002) | "Sua conta entrou no jogo em outro lugar." |
| Trocar para Contra bots / Campo de tiro | Fecha a conexão. |
| Sair da sessão / partida / corrida (pausa) | Janela de confirmação com o que se perde no modo; SAIR fecha a conexão e recarrega a página, FICAR (ou Esc/◯) volta ao menu. |

> [!info]
> Não há reconexão automática nem retorno à mesma sessão após queda: inferido pela ausência de lógica de reconexão em `client/main.ts` (o `onClose` só mostra o status). Ver [[Error Handling]].

## Código relacionado

- `client/ui/home.ts` — `connect`, `join`, `renderLobby`, handlers de `#home-quick` e `#home-more`, `closeReason`.
- `client/net/connection.ts` — `Connection.open`, `next`, `hold`, `release`, `seed`.
- `client/net/api.ts` — `fetchMe`, `fetchProfile`.
- `client/main.ts` — `boot()` (ramo online), `conn.onClose`.
- `shared/protocol.ts` — mensagens e `NET`, `CLOSE`.
