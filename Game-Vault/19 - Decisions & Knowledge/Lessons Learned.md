---
title: Lessons Learned
type: decision
status: documented
area: decisions
source_paths:
  - README.md
  - shared/movement.ts
  - shared/constants.ts
  - shared/protocol.ts
  - client/main.ts
  - client/core/input.ts
  - client/net/connection.ts
  - client/world/textures.ts
  - client/world/mapBuilder.ts
  - shared/data/mapas/halloween.json
  - client/render/renderer.ts
  - server/app.ts
  - server/session.ts
  - client/ui/home.ts
  - client/ui/menu.ts
tags:
  - game
  - decisions
updated: 2026-10-07
---

# Lições aprendidas

O que o projeto aprendeu fazendo, com a evidência no código ou no histórico. Serve para não repetir erros já resolvidos.

## Gameplay e design

- **A mecânica-assinatura precisa compensar o risco.** A opressão foi triplicada para 150 pontos e o respawn ficou em 5 s para a vítima assistir à dança (`shared/constants.ts`, `shared/protocol.ts`; [[ADR - Pontuação da Opressão triplicada]], [[ADR - Atraso de respawn de 5 s online]]).
- **Estado de closure precisa ser zerado na morte.** Uma variável `let` não zerada fazia a segunda granada da Dose Dupla sair depois de renascer; a correção cancela o arremesso pendente enquanto o jogador está morto (commit `d7bc9d1`, `client/main.ts`; [[Grenades]]).
- **Paredes encostadas em escadas não podem deixar fresta, e móveis não podem ficar na linha das portas** (correções do commit `0fac263`; [[Map Design Rules]]).

## Simulação e entrada

- **Movimento em duas passadas eliminou travas de 1 tick:** de 3.374 para 0 em 260 mil ticks (README e `shared/movement.ts`; [[ADR - Movimento em duas passadas com assentamento próprio]]).
- **Toques guardados até serem consumidos** evitam perder cliques curtos em monitores de 144 Hz ou mais (`client/core/input.ts`; [[Input & Controls]]).
- **Mensagens do servidor seguradas enquanto o mapa carrega** (`hold()`/`release()`) evitam perder eventos no início da partida (`client/net/connection.ts`; [[Events & Messaging]]).
- **Lógica pura sem DOM é testável no Bun:** a matemática espacial e as regras de keybind ficaram em funções puras e ganharam testes (`client/audio/spatial.ts`, `client/core/keybinds.ts`; [[Unit Tests]]).

## Interface

- **Um bloco emprestado leva junto os seus `role="tab"`.** A tela inicial ligava as abas com `home.querySelectorAll('[role="tab"]')` depois de receber `#menu-settings` do menu de pausa (PF-11); as subabas (Mira, Vídeo, Áudio, Teclas) entravam no seletor, e clicar numa delas chamava `showTab(undefined)`, que escondia todas as abas e obrigava a reabrir as Configurações. A correção limita o seletor ao cabeçalho (`.home-tabs [role="tab"]`, `homeTabs()` em `client/ui/home.ts`). Seletores de uma tela que recebe blocos de outra devem ter escopo no próprio container ([[Menus]], [[Settings]]).

## Rede e servidor

- **O pub/sub do Bun serializa o snapshot uma vez por sala**, não uma vez por jogador (README, `server/session.ts`; [[Network Performance]]).
- **Checar `Upgrade` e `Origin` antes de consumir o ticket** faz um GET comum não gastar o ticket do WebSocket (`server/app.ts`; [[ADR - Ticket de uso único para o WebSocket]], [[Scenario - Ticket do WebSocket]]).

## Renderização e mapas

- **Na rampa toon, quase-preto vira silhueta sem forma:** o pelo da cachorra usa `0x35323c` em vez de preto (`client/world/dog.ts`; [[ADR - Toon shading com rampa de 3 tons]]).
- **A acne de sombra nas faces de costas** vinha do half-Lambert do toon somado a `shadowSide = back` (`client/render/renderer.ts`; [[ADR - Sombras ignoradas em faces de costas para o sol]]).
- **Gerar a textura de ruído uma vez, como padrão,** economizou cerca de 10 ms por textura no carregamento (`client/world/textures.ts`; [[Loading Performance]]).
- **Acabamentos ficam 8 mm para dentro das aberturas** para evitar z-fighting (`mapBuilder.ts`, `wall`; [[Environment Pieces]]).
- **Para remover um objeto sorteado sem mudar os seguintes,** ainda é preciso consumir os números aleatórios dele (o truque `nowhere`, hoje em `client/world/conversao/halloween.ts`; [[ADR - Aleatoriedade com semente na construção dos mapas]]). Desde a PF-6 cada peça guarda a sua semente (`Peca.semente`), e a ordem das peças deixou de mover as seguintes.
- **Teste visual por software não vale pela GPU.** O Chrome headless desenha com SwiftShader, que entra na qualidade `baixa` (sem sombras) e tolera o que a GPU recusa: o editor de mapas sem mapa de sombra só falhava com aceleração de hardware (ANGLE: "Mismatch between texture format and sampler type"). Para conferir a renderização, use um Chrome com GPU (`--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist`) e todo laço de render deve agendar a sombra ([[Problem - Editor sem mapa de sombra com aceleração de hardware]]).
- **O tamanho da célula de lote importa:** 40 m dobrava as draw calls do Jardim, e 45 m resolveu (`ambiente.celula` em `shared/data/mapas/jardim.json`; [[ADR - Lotes estáticos por material e célula]]).
- **Prefixo de `location` com barra no fim e `proxy_pass` faz o nginx redirecionar a URL sem a barra.** `location ^~ /api/mapas/` respondia `GET /api/mapas?...` com 301 para `/api/mapas/` (com a porta e o https perdidos no `Location`), e a lista de mapas falhava só no Docker e em produção: os testes e o `bun run dev` não passam pelo nginx. Rota que existe sem barra pede prefixo sem barra; depois de mexer no nginx, confira as rotas novas com `curl` pelo `docker compose` ([[Hosting]]).
- **Dado que vive no repositório e no banco precisa de um caminho do repositório para o banco.** Desde a PF-6 os mapas oficiais estão nos dois, e a semeadura só criava o que faltava: o totem do cemitério (PR #51) entrou no JSON e nunca chegou a um banco que já tinha o mapa, enquanto os testes, num banco novo, passavam. Agora a subida publica o arquivo mudado como versão nova ([[ADR - Mapas oficiais do repositório publicados na subida]]). Ao mudar um dado semeado, confira num banco que já existia, não só num novo.

## Documentação

- **Documentos humanos ficam desatualizados rápido.** README, `docs/MAPAS.md` e `docs/PERSONAGENS.md` têm números que já divergem do código (vida do Gordo, contagem de itens e de superfícies). Este cofre sempre confere com o código ([[Technical Debt]], [[Documentation Status]]).
