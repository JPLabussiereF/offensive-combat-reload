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
| 2026-10-06 | Modo zumbi: **mapa exclusivo, barricadas e armas danificadas**. Novo mapa `cemiterio` (Cemitério da Capela, `client/world/cemetery.ts`): pátio murado de 40 × 36 m em volta de uma capela, muro de pedra baixa com grades, cinco brechas com lanternas, campo de covas fora do muro de onde a horda sobe (24 pontos, todos fora), chefes em chão limpo (o Prefeito no anel sul, com a investida livre); `MAPS[id].exclusivo` e `PVP_MAPS` deixam o cemitério só no zumbi (salas, `keepRoom`, `create`, seletores, campo de tiro, vitrine) e a Vila Assombrada só nos versus (saíram `mapas.halloween` e `navmesh/halloween.json`). Telegrafia de surgimento (`zfx 'rise'` 0,9 s antes: mãos, brilho e feixe verdes, gemido 3D) e setas no HUD para as brechas com zumbis chegando. **Barricadas** (`shared/barricades.ts`, `client/zombies/barricades.ts`): erguer $300 (2,5 s, 5 tábuas × 150), repregar de graça (0,8 s, +$10 até $150 por onda), fechada com qualquer tábua, duram entre ondas; zumbis comuns contornam e só batem com tudo fechado, Segurança e chefes arrombam; protocolo `barricade`/`zbar`/`zbarwork` e `ZombieSync.bars`. Navmesh com cada brecha em polígonos próprios (área e flag por brecha, `soloNavMeshWithAreas`) e filtros do crowd por sessão; pedidos de caminho com parcimônia (a fila do crowd não dava conta dos caminhos longos). **Caixão fixo** sem pato: armas danificadas (25/18/12/6% por raridade; menos munição 60% pente/50% reserva, menos dano ×0,75, ou os dois; sem conserto), com placa, acorde, faixa, etiqueta no HUD e `Loadout.danificadas`. Testes: 178 casos em 13 arquivos (novo `server/tests/zombieBarricades.test.ts`; matriz com todas as combinações do caixão, danificadas incluídas). Novas: [[Map - Cemitério da Capela]], [[ADR - Barricadas como polígonos próprios na navmesh]], [[ADR - Mapa exclusivo e barricadas no modo zumbi]], [[ADR - Caixão fixo com armas danificadas]]. Atualizadas: [[Zombie]], [[Map - Vila Assombrada]], [[Maps Index]], [[Game Modes Index]], [[ADR - Modo zumbi cooperativo com caixão e raridades]] (pato substituído, histórico mantido), [[ADR - Zumbis simulados no servidor sobre navmesh pré-gerada]], [[Remote Calls]], [[HUD]], [[Navigation]], [[NPC Behavior]], [[AI Overview]], [[SFX]], [[Visual Effects]], [[Economy Design]], [[Weapons]], [[Interaction System]], [[Matchmaking]], [[Sessions]], [[Matchmaking UI]], [[Menus]], [[Anti Cheat]], [[Shared Systems]], [[Client Architecture]], [[Server Architecture]], [[Network Performance]], [[Local Development]], [[Configuration Reference]], [[Glossary]], [[Home]], [[Testing Overview]], [[Integration Tests]], [[Unit Tests]]. |
| 2026-10-06 | **Estatísticas do modo zumbi** salvas na conta: tabela `zombie_stats` (migration `004_estatisticas_zumbi.sql`) com partidas, vitórias, melhor onda, ondas sobrevividas, abates por golpe, chefes por nome, quedas, reanimações, mortes e giros no caixão; gancho `ZombieHost.stat` no motor, `delta.zumbi` gravado no mesmo flush, `totais.zumbi` no `GET /api/perfil` e grade "Modo zumbi" na aba Perfil. Atualizadas: [[Zombie]], [[Player Data]], [[Database]], [[Save System]], [[Data Migrations]], [[Menus]]. |
| 2026-10-06 | **Álbum de figurinhas** (conquistas), fase 1: 19 figurinhas em 5 páginas, todas derivadas das estatísticas que a conta já guarda (sem gravação nova, retroativo), com 4 acabamentos (Comum, Brilhante, Holográfica, Dourada) e repetidas; `shared/achievements.ts`, `shared/data/conquistas.json`, aba **Álbum** na tela inicial (`client/ui/album.ts`). Nova: [[Achievements]]. Atualizadas: [[Menus]], [[Progression]]. |
| 2026-10-06 | **Álbum de figurinhas, fase 2**: 24 figurinhas com contador próprio (Opressão completa, Sequências, Cardápio, Corrida Armada, vexames por causa) em `achievement_progress` (migration `005_figurinhas.sql`), contadas no servidor no momento do evento; aviso `figurinha` quando um acabamento sobe (conferido 1×/s com os números ao vivo da conta). Atualizadas: [[Achievements]], [[Database]], [[Data Migrations]], [[Save System]], [[Player Data]], [[Remote Calls]], [[Notifications]]. |
| 2026-10-06 | Álbum: metas ajustadas (a última é sempre a Dourada; de 1 a 4 metas, meta única já sai Dourada e sem repetidas), textos com singular/plural (`{vez|vezes}`), Davi contra Golias passa a ser 10 abates à frente na partida, e o detalhe mostra a barra e o andamento de cada item das coleções. Atualizada: [[Achievements]]. |
| 2026-10-06 | **Álbum de figurinhas, fase 3**: figurinha em destaque e título (cada página dá um título com todas as figurinhas Holográficas ou mais), escolhidos na aba Álbum e conferidos pelo servidor (`PATCH /api/perfil {destaque, titulo}`, `400 figurinha_bloqueada`, migration `006_destaque.sql`); mostrados no placar, na tela de morte (de quem te matou) e no Perfil (`PlayerInfo.fig`, `tit`). A barra das figurinhas passa a contar desde zero. Atualizadas: [[Achievements]], [[APIs]], [[Remote Calls]], [[Scoreboard]], [[HUD]], [[Database]], [[Data Migrations]], [[Player Data]]. |
| 2026-10-06 | **Álbum de figurinhas, fase 2b**: página Proezas (Abraço de Urso, Kamikaze, Strike!, Empurrãozinho, Com um Pé na Cova; título Lenda Urbana), Zumbi (Voto Nulo, Divórcio, Churrasco Coletivo, Vitória do Além, Marceneiro; eventos `chain` e `board` no motor) e Vexames (R.I.P. LAG); figurinhas **secretas** ("???" com dica até serem coladas). Atualizada: [[Achievements]]. |
| 2026-10-06 | **Arsenal em árvore** (PF-7): uma linha por espaço (Principal, Secundária, Faca, Granada), armas em sequência, painel da arma clicada com botão **Equipar** e melhorias em cadeia; arma e melhoria trancadas mostram os pontos que faltam. **Submetralhadora trancada** até a pistola chegar ao nível 3 (`libera` em `progression.json`; quem já fez pontos com ela fica com ela; sem conta, trancada; bots sem trava). **Toda melhoria liberada liga e desliga** (`ArsenalChoice.desligadas`, sem migration; uma por grupo). `sanitizeChoice(raw, xp)` com o XP de cada arma. Salvamento do Arsenal em fila e desfeito com aviso se falha. Aviso "{arma} liberada: equipe no Arsenal". Nova: [[ADR - Árvore do Arsenal e armas liberadas por nível]] ([[ADR - Progressão por melhorias de arma]] marcada como substituída em parte). Atualizadas: [[Inventory UI]], [[Progression]], [[Weapons]], [[Notifications]], [[Menus]], [[Player Data]], [[Remote Calls]], [[APIs]], [[Validation]], [[Testing Overview]], [[Unit Tests]]. `bun test`: 195 casos em 14 arquivos (eram 178 em 13; novo `client/tests/arsenalTree.test.ts`). |
| 2026-10-06 | **Rifles e facas antigos de volta** (PF-8): seis rifles (Remendado com Fita, da Tia do Zap, Pisca-Pisca de Natal, Tunado com Adesivo de Chama, do Vovô, Dourado Ostentação) e seis facas (Colher de Pau, Frango de Borracha, Baguete, Peixe Congelado, Macarrão de Piscina, Sabre de Luz) como **armas próprias**, cada uma com uma troca, a pintura (rifles) e o modelo e o som próprios; usam os pontos, o nível e as melhorias do rifle e da faca (`progOf`; sem migration) e liberam com pontos dessas progressões (`libera` no JSON de cada arma, inclusive a submetralhadora). Rifle com os níveis 7 a 9 (holo com lupa, luneta 2x, luneta 4x); faca só com Afiador e Tênis (frango e sabre deixam de ser formas); a pintura deixa de vir das melhorias. `ArsenalChoice` com `primaria` e `faca`; `kill.arma` passa a `WeaponId`; Equipar nas linhas Principal, Secundária e Faca; bots sorteiam entre os sete rifles e as sete facas; corrida armada e zumbi apontam o sabre como faca. Nova ADR; ADRs da árvore do Arsenal e das melhorias marcadas como substituídas em parte. Notas: [[ADR - Rifles e facas antigos como armas próprias]], [[ADR - Árvore do Arsenal e armas liberadas por nível]], [[ADR - Progressão por melhorias de arma]], [[Weapons]], [[Melee]], [[Items]], [[Inventory]], [[Progression]], [[Inventory UI]], [[Weapon Models]], [[Material Palette]], [[Camera]], [[HUD]], [[SFX]], [[Audio Events]], [[Gun Game]], [[Zombie]], [[Versus Bots]], [[Remote Calls]], [[APIs]], [[Player Data]], [[Validation]], [[Shared Systems]], [[Notifications]], [[Scoring]], [[Movement]], [[Data Migrations]], [[Configuration Data]], [[Configuration]], [[Configurable Content]], [[Constants Reference]], [[File Structure Reference]], [[Glossary]], [[Mechanics Index]], [[Economy Design]], [[Core Pillars]], [[Game Concept]], [[Testing Overview]], [[Unit Tests]], [[Integration Tests]] |
| 2026-10-06 | **Corrida armada: a facada tira um abate** (antes descia o degrau inteiro): sem abates no degrau, volta à arma anterior com um a menos que o necessário. `afterDeath` (servidor e bots), banner "Esfaqueado! Perdeu um abate", textos do modo e a figurinha Esfaqueador (conta cada abate tirado). Atualizadas: [[ADR - Corrida armada]] (revisão), [[Gun Game]], [[Game Modes Index]], [[Glossary]], [[Integration Tests]], [[Achievements]]. |
| 2026-10-06 | Merge da main na PF-8: [[Melee]] passou a dizer a regra nova da corrida armada (a facada tira um abate; sem abates no degrau, volta uma arma). |
| 2026-10-06 | **Poção do crítico × virilha** (bug): a virilha deixou de virar cabeça sob a poção e continua morte instantânea. Regra única `critRegion` em `shared/weapons.ts` (servidor, zumbi e offline). Atualizadas: [[Damage System]], [[Buffs & Debuffs]]. |
| 2026-10-06 | README: removidos os marcadores de conflito que entraram com o commit `74050eb` (seções "No celular", "Controle" e "Banco e Redis" mantidas inteiras). Nenhuma nota do cofre muda. |
| 2026-10-06 | Testes: o tempo máximo de 20 s por teste passa a valer de verdade (`setDefaultTimeout` no `server/tests/preload.ts`; o `timeout` do `bunfig.toml` é ignorado pelo Bun 1.4.2 e valia 5 s, o que fazia testes online longos falharem às vezes). O erro de espera do `Player.next` diz o que chegou. Atualizadas: [[Testing Overview]], [[Integration Tests]]. |
| 2026-10-06 | **Álbum: página Mapas** (9 figurinhas: Sorveteiro Fantasma, Proibido Acordar, Maestro, Banda Marcial, EU JÁ OUVI., CHEGA., Mudou pro Mausoléu, Patinhos em Fila, Mosca no Alvo; título Guia Turístico). Os objetos que contam passam a ser **conferidos pelo servidor** (`PROPS` e `PROP_RANGE` em `shared/maps.ts`: mapa certo, vivo, até 80 m). Atualizadas: [[Achievements]], [[Map Gags]], [[Interactive Objects]]. |
| 2026-10-06 | **Arsenal da tela inicial em canvas** (PF-9, design "Arsenal Canvas"): a aba Arsenal virou um canvas que se arrasta e tem zoom (roda, pinça, − e +, 25% a 200%), com um quadro por espaço (Principal, Secundária, Corpo a corpo, Arremesso), as armas ligadas lado a lado e, embaixo da arma mostrada, a cadeia de melhorias, cada uma com o botão Ligada/Desligada no próprio nó; painel de detalhes à direita ao clicar numa arma; botões de pular, minimapa e "Ver tudo". A aba ocupa a altura da tela (o personagem sai abaixo de 1.000 px), tem texto de ajuda próprio no toque, e com controle o foco passa de nó em nó com a câmera acompanhando e o analógico direito move o canvas (`pad-pan` no `PadNav`). O menu de pausa continua com a árvore. Nova [[ADR - Arsenal da tela inicial em canvas]]; [[ADR - Árvore do Arsenal e armas liberadas por nível]] marcada como substituída em parte. Atualizadas: [[Inventory UI]], [[Menus]], [[UI Overview]], [[Input & Controls]], [[File Structure Reference]], [[Glossary]] (também o `ArsenalChoice` e o Arsenal, que estavam como antes da PF-7), [[Testing Overview]] (com os testes do álbum que faltavam) e [[Unit Tests]]. |
