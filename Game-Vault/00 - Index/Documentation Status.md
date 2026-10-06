---
title: Documentation Status
type: reference
status: documented
area: index
source_paths:
  - README.md
  - docs/MAPAS.md
  - docs/PERSONAGENS.md
  - docs/DEPLOY.md
tags:
  - game
  - index
  - status
updated: 2026-10-06
---

# Estado da documentação

## Base

- **Código documentado:** branch `main`, commit `4af5b0a` (merge do PR #19, 2026-10-04). Trabalho não commitado ou de outras branches **não** está no cofre.
- **Primeira geração:** 2026-10-05, a partir da leitura do código (client, server, shared, tools, deploy), dos documentos `README.md`, `docs/MAPAS.md`, `docs/PERSONAGENS.md`, `docs/DEPLOY.md` e do histórico do git. Quando documento e código divergiam, valeu o código, e a divergência foi registrada em [[Technical Debt]].
- **Regras de manutenção:** [README do cofre](../README.md) §23. Mudou o código, atualize só as notas afetadas, corrija `source_paths` e `updated` e registre aqui.

## Cobertura por área

| Área | Estado | Observação |
|---|---|---|
| 00 Index | documented | Índices, mapas de sistemas e dependências |
| 01 Vision & Design | documented / parcial | Pilares, público e experiência são **inferências** (o documento de design não está no repositório) |
| 02 Gameplay & Mechanics | documented | 17 notas; [[Inventory]] é stub (não existe) |
| 03 Game Modes | documented | 3 modos de jogo (mata-mata, corrida armada, zumbi) em 3 lugares (online, bots, treino); [[Team Deathmatch]] e [[Objective Modes]] são stubs (não existem) |
| 04 World & Maps | documented | 4 mapas, regras de design, spawns, objetos interativos |
| 05 Rendering & Visuals | documented | [[Post Processing]] é stub (não existe) |
| 06 Art & Assets | documented | Toda a arte é procedural; [[Reference Images]] é stub |
| 07 Audio | documented | [[Music]] e [[Voice]] praticamente sem conteúdo no jogo (só jingles e música da dança; sem voz) |
| 08 UI & UX | documented | [[Inventory UI]] é stub; 3 fluxos de UX |
| 09 Code Architecture | documented | Sem camadas formais de Controller, Service ou Manager; cada nota explica o que faz esse papel |
| 10 Networking | documented | [[Matchmaking]] é um lobby com lista de salas, sem fila |
| 11 Data & Persistence | documented | |
| 12 AI & NPCs | documented | Bots só offline; zumbis do modo zumbi simulados no servidor (navmesh pré-gerada) |
| 13 Backend & Services | documented | |
| 14 Infrastructure | documented | Há CI (GitHub Actions); não há CD nem monitoramento |
| 15 Performance | documented | Métricas vêm de comentários e docs, sem nova medição |
| 16 Security | documented | |
| 17 Testing | documented | Sem testes automatizados de render, E2E ou performance |
| 18 Live Ops | documented | Sem temporadas, eventos ou feature flags; histórico de releases montado a partir dos merges |
| 19 Decisions & Knowledge | documented | 53 ADRs e problemas conhecidos, mais [[Technical Debt]], [[Alternatives Considered]] e [[Lessons Learned]] |
| 20 Reference | documented | |

## Critério de conclusão (README §24)

| Pergunta | Resposta em |
|---|---|
| O que é o jogo? | [[Game Overview]] · [[Game Concept]] |
| Qual é seu loop principal? | [[Core Loop]] |
| Quais são suas mecânicas? | [[Mechanics Index]] |
| Quais são os modos de jogo? | [[Game Modes Index]] |
| Como uma partida funciona? | [[Free For All]] · [[Sessions]] · [[Flow - Join Online Match]] |
| Como o mapa é estruturado? | [[World Structure]] · [[Maps Index]] |
| Como o jogo é renderizado? | [[Rendering Overview]] |
| Como texturas e materiais funcionam? | [[Texture System]] · [[Materials]] · [[Procedural Textures]] |
| Como os assets são organizados? | [[Asset Pipeline]] · [[Art Direction]] |
| Como o áudio funciona? | [[Audio Overview]] |
| Como a UI funciona? | [[UI Overview]] |
| Como cliente e servidor se comunicam? | [[Networking Overview]] · [[Client Server Model]] · [[Remote Calls]] |
| Onde os dados são persistidos? | [[Data Architecture]] · [[Database]] |
| Como os sistemas dependem uns dos outros? | [[Dependencies Map]] · [[Systems Map]] |
| Como o projeto é executado? | [[Local Development]] |
| Como é feito o deploy? | [[Build Pipeline]] · [[Hosting]] |
| Quais são os principais gargalos? | [[Known Bottlenecks]] |
| Quais problemas conhecidos existem? | Pasta `Known Problems/` · [[Technical Debt]] |
| Quais decisões arquiteturais são importantes? | Pastas `Architecture Decisions/`, `Technical Decisions/`, `Design Decisions/` |

Todas as perguntas têm resposta. Os pontos abaixo continuam em aberto.

## Não confirmado / desconhecido

- **Documentos citados no código e ausentes do repositório:** o "documento de design (seção N)", o "Guia de Estilo de Personagens", o `README_Halloween.md` e o "plano de autenticação (P27)". Por isso pilares, público e intenção dos segredos da Vila são inferências.
- **Planos futuros:** se times, modos de objetivo, ranqueada e economia são planos ativos não está confirmado. Só existem indícios em dados e esquema (spawns A/B, `mmr`, `preco`).
- **Números de performance** (draw calls, triângulos, memória, linha de visão 0,6% × 11,6%, varredura de 260 mil ticks) vêm de `docs/MAPAS.md` e do README. Não foram medidos de novo, e a ferramenta da varredura não está no repositório.
- **Runtime:** expiração ociosa e pings do WebSocket ficam no padrão do Bun. O comportamento com várias instâncias do servidor é inferência, porque o deploy atual tem uma só.
- **Detalhes não verificados:** se os telhados das casas são alcançáveis; se tiros de bots acertam `critters`; se personagens recebem sombra (`receiveShadow` não é definido); o efeito de balanço da poção do bêbado (confirmado só pelo comentário); se as músicas e sons da dança são só locais (inferido pela falta de mensagem de rede).
- **Repositório remoto:** os PRs #1, #6, #8 e #9 não aparecem na main, e a proteção de branch do GitHub não é verificável pelo repositório.

## Divergências entre documentos humanos e código

Registradas em [[Technical Debt]], na seção "Comentários e documentação desatualizados". As principais: vida do Gordo e efeito da altura (README), contagem de itens de personagem (`docs/PERSONAGENS.md`), contagem de superfícies e checagem de vãos (`docs/MAPAS.md`), e a granada "não letal" (comentários).

## Histórico do cofre

| Data | Mudança |
|---|---|
| 2026-10-05 | Criação do cofre a partir da `main` em `4af5b0a` |
| 2026-10-05 | Nova tela inicial (design `Home.dc.html`): abas logadas (Jogar, Arsenal, Perfil, Configurações), landing deslogada e entrada rápida online. Atualizadas: [[Menus]], [[Matchmaking UI]], [[Settings]], [[Inventory UI]], [[UI Overview]], [[Flow - First Access]], [[Flow - Join Online Match]]. Nova: [[ADR - Conexão online aberta sob demanda na tela inicial]]. |
| 2026-10-05 | Tela inicial: o cartão e o botão da conta mostram o personagem real (palco 3D do editor e retrato), não mais um emoji. Atualizada: [[Menus]]. |
| 2026-10-05 | Servidor: todo mapa sempre tem uma sala com vaga (sala extra `<Mapa> 2` quando lotam) e `GET /api/sessoes` público. Tela inicial: contagem de sessões nos mapas antes de conectar; filtro de mapas em grade de largura total. Atualizadas: [[Matchmaking]], [[Sessions]], [[APIs]], [[Matchmaking UI]], [[ADR - Conexão online aberta sob demanda na tela inicial]]. |
| 2026-10-06 | Aba Jogar: sessões já carregadas ao abrir (sem VER SESSÕES), 6 por vez com VER MAIS; a conexão de jogo abre ao entrar/criar. Atualizadas: [[Matchmaking UI]], [[Menus]], [[Flow - Join Online Match]], [[ADR - Conexão online aberta sob demanda na tela inicial]] (revisão). |
| 2026-10-06 | Armas secundárias (Pistola do Porteiro, Submetralhadora Liquidificador) com troca de arma, e progressão por **melhorias** no lugar dos níveis nomeados (migração `003_melhorias.sql`, API `shared/arsenal.ts`). Reescritas: [[Weapons]], [[Progression]], [[Inventory UI]], [[Shared Systems]]. Nova: [[ADR - Progressão por melhorias de arma]]; [[ADR - Progressão de XP por arma]] marcada como substituída em parte. Menções antigas (níveis equipados, `rifleData`, `ONLINE_GRENADE_LEVEL`…) corrigidas nas notas de visão, gameplay, modos, rede, dados, UI, áudio, arte, arquitetura, segurança, testes, live ops e referência; [[Problem - Comentários dizem que a granada nível 1 não é letal]] resolvido. |
| 2026-10-06 | Dois modos de jogo padrão: **mata-mata** (Arsenal escolhido antes da partida e travado nela; subir de nível vale na próxima) e **corrida armada** (escada de 7 armas fixas, 3 abates sobem, facada desce, abate com o Sabre de Luz na mão vence a rodada; online e contra bots). Sessões com modo (`SessionInfo.mode`), salas fixas por mapa e por modo, `roundEnd`/`roundStart`, `PlayerInfo.ladder`, `Loadout.soFaca`. Nova: [[Gun Game]], [[ADR - Corrida armada]], [[ADR - Equipamento travado no mata-mata]], [[ADR - Modos de jogo com regras declaradas e ganchos no servidor]]. Atualizadas: [[Game Modes Index]], [[Mode Template]], [[Free For All]], [[Versus Bots]], [[Sessions]], [[Matchmaking]], [[Remote Calls]], [[Matchmaking UI]], [[Menus]], [[HUD]], [[Scoreboard]], [[Inventory UI]], [[Weapons]], [[Melee]], [[Progression]], [[Shared Systems]], [[Server Architecture]], [[Glossary]]; [[Problem - Partidas sem fim]] resolvido em parte. |
| 2026-10-06 | Modo de jogo **zumbi** (`'zumbi'`): co-op de 12 ondas e 3 chefes (Coveiro, Noiva, Prefeito) só na Vila Assombrada; dinheiro da partida e o Caixão Misterioso (sorteio no servidor, raridades que multiplicam o dano contra zumbis, pato que muda o caixão de lugar); todos começam com o rifle sem melhorias; caído/reanimar/sangrar; XP de conta por zumbi (sem XP de arma); jogo solo offline com o mesmo motor. Zumbis **simulados no servidor** (Detour Crowd sobre navmesh pré-gerada por `bun run navmesh`, com teste de atualização). Novas: [[Zombie]], [[ADR - Zumbis simulados no servidor sobre navmesh pré-gerada]], [[ADR - Modo zumbi cooperativo com caixão e raridades]]. Atualizadas: [[Game Modes Index]], [[Mode Template]], [[ADR - Modos de jogo com regras declaradas e ganchos no servidor]] (ganchos `handle`/`blast`/`onLethal`/`joinState`/`snapshot`/`dispose`, `coop`, `maps`, `SPlayer.downed`), [[Economy Design]], [[Progression]], [[Weapons]], [[AI Overview]], [[NPC Behavior]], [[Navigation]], [[Problem - Bots só existem offline]], [[Remote Calls]], [[Sessions]], [[Anti Cheat]], [[HUD]], [[Scoreboard]], [[Matchmaking UI]] (e a correção do id duplicado `land-game` da landing), [[SFX]], [[Map - Vila Assombrada]], [[Server Architecture]], [[Shared Systems]], [[Integration Tests]] (helper de testes: uma mensagem por `next`, espera que estoura sai da fila, entrega fora do evento do WebSocket), [[Configuration Reference]], [[Glossary]], [[Home]], [[Matchmaking]], [[Menus]], [[Client Architecture]], [[Network Performance]], [[Local Development]] (`bun run navmesh`), [[Problem - Bundle JavaScript único de ~5 MB]] (agora ~6,2 MB). Equilíbrio do modo (vida por onda, preços, chances) ainda não testado com jogadores. |
| 2026-10-06 | Testes da **progressão de armas em todos os modos** (sem mudança de regra): mata-mata com conta veterana (dano do silenciador, cadência do gatilho, mina, pontos da secundária) e cliente ganancioso; corrida armada ignorando a conta (atributos do degrau, tiros da arma anterior por 1 s, sem XP de arma nem no banco); zumbi com conta no máximo (rifle simples, arma do caixão com as melhorias dela, dano conferido na barra do chefe), chefes contra vários jogadores (grito com lentidão, investida com empurrão), entrar no meio da onda (`joined.zumbi`) e sangrar até o intervalo (volta com o rifle inicial e o dinheiro; XP de conta exato por abate); treino, bots e zumbi solo pelas peças puras (`Progress`, escada, `LocalZombies`); e a matriz `GAME_MODE_IDS` × armas × níveis/melhorias numa `Session` real sobre sockets falsos (`server/tests/progression-modes.test.ts`). Helper `setWeaponXp`. A interface `ZombieLink` foi para `client/zombies/link.ts` (só tipo, para o jogo solo rodar sem DOM nos testes). Achado, não corrigido (decisão de mapa): o Prefeito surge em cima do banco da praça e, parado ali, a borda da malha corta a investida. Atualizadas: [[Integration Tests]], [[Unit Tests]], [[Testing Overview]], [[Gameplay Tests]], [[Zombie]], [[Client Architecture]]. `bun test`: 166 casos (eram 145), ~86–90 s. |
