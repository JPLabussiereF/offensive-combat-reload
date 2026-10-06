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
tags:
  - game
  - decisions
updated: 2026-10-06
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

## Rede e servidor

- **O pub/sub do Bun serializa o snapshot uma vez por sala**, não uma vez por jogador (README, `server/session.ts`; [[Network Performance]]).
- **Checar `Upgrade` e `Origin` antes de consumir o ticket** faz um GET comum não gastar o ticket do WebSocket (`server/app.ts`; [[ADR - Ticket de uso único para o WebSocket]], [[Scenario - Ticket do WebSocket]]).

## Renderização e mapas

- **Na rampa toon, quase-preto vira silhueta sem forma:** o pelo da cachorra usa `0x35323c` em vez de preto (`client/world/dog.ts`; [[ADR - Toon shading com rampa de 3 tons]]).
- **A acne de sombra nas faces de costas** vinha do half-Lambert do toon somado a `shadowSide = back` (`client/render/renderer.ts`; [[ADR - Sombras ignoradas em faces de costas para o sol]]).
- **Gerar a textura de ruído uma vez, como padrão,** economizou cerca de 10 ms por textura no carregamento (`client/world/textures.ts`; [[Loading Performance]]).
- **Acabamentos ficam 8 mm para dentro das aberturas** para evitar z-fighting (`mapBuilder.ts`, `wall`; [[Environment Pieces]]).
- **Para remover um objeto sorteado sem mudar os seguintes,** ainda é preciso consumir os números aleatórios dele (o truque `nowhere`, hoje em `client/world/conversao/halloween.ts`; [[ADR - Aleatoriedade com semente na construção dos mapas]]). Desde a PF-6 cada peça guarda a sua semente (`Peca.semente`), e a ordem das peças deixou de mover as seguintes.
- **O tamanho da célula de lote importa:** 40 m dobrava as draw calls do Jardim, e 45 m resolveu (`ambiente.celula` em `shared/data/mapas/jardim.json`; [[ADR - Lotes estáticos por material e célula]]).

## Documentação

- **Documentos humanos ficam desatualizados rápido.** README, `docs/MAPAS.md` e `docs/PERSONAGENS.md` têm números que já divergem do código (vida do Gordo, contagem de itens e de superfícies). Este cofre sempre confere com o código ([[Technical Debt]], [[Documentation Status]]).
