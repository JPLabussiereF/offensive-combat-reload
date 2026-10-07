---
title: Game Overview
type: concept
status: documented
area: index
source_paths:
  - README.md
  - shared/maps.ts
  - shared/constants.ts
  - shared/protocol.ts
  - client/ui/home.ts
  - server/session.ts
  - shared/progression.ts
  - shared/arsenal.ts
tags:
  - game
  - index
  - design
updated: 2026-10-07
---

# Visão geral do jogo

**Offensive Combat** é um FPS de navegador, competitivo e bem-humorado, com visual cartoon. Partidas curtas de mata-mata livre, tiro baseado em habilidade e muita zoeira como recompensa. Esta nota resume o jogo e aponta para as notas de detalhe; a intenção de design está em [[Game Concept]] e [[Core Pillars]].

## Proposta

- **Gênero:** FPS arena, todos contra todos, em dois modos: **mata-mata** e **corrida armada** (gun game). Não há times nem objetivos ([[Free For All]], [[Gun Game]], [[Team Deathmatch]], [[Objective Modes]]).
- **Plataformas:** navegador no PC (teclado e mouse ou controle) e no celular (controles de toque). Ver [[Input & Controls]] e [[Touch Controls]].
- **Tom:** humor. Há a dança de vitória sobre o corpo ([[Humiliation]]), piadas nos mapas ([[Map Gags]]), confete no lugar de sangue ([[Visual Effects]]) e sons sintetizados ([[SFX]]).

## Como se joga

| Elemento | Resumo | Detalhe |
|---|---|---|
| Loop | Nascer, procurar alvos, abater, oprimir o corpo (opcional), pontuar, morrer, renascer | [[Core Loop]] |
| Armas | Rifle (primária) + uma secundária escolhida no Arsenal entre sete (pistola, grampeador, submetralhadora, revólver, furadeira, garrucha ou pistolão; o grampeador atira em rajada e a garrucha em bagos), todas hitscan, trocadas com 1/2/roda; faca (mata com um golpe) e granada. Cada arma ganha melhorias ao subir de nível | [[Weapons]], [[Melee]], [[Grenades]], [[Land Mines]] |
| Dano e vida | 100 de vida para todos, regeneração após 4 s sem dano, cabeça ×2,5, tiro na virilha mata na hora | [[Damage System]], [[Health System]] |
| Pontos | Abate 100 mais bônus (cabeça, virilha, longa distância, faca, pelas costas); oprimir vale 150 | [[Scoring]] |
| Renascimento | 5 s online e contra bots, 3 s no treino, em ponto seguro | [[Respawn]], [[Spawn Design]] |
| Progressão | XP por arma (os pontos do abate vão para a arma que matou); cada nível libera uma melhoria (comum ou opcional, ligada no Arsenal). Nível de conta à parte. Só em partidas online validadas | [[Progression]] |
| Bônus de mapa | Cereja, biscoito, carpa dourada, humanidade (rato gigante), poções da bruxa, tiro ao alvo | [[Pickups]], [[Buffs & Debuffs]], [[Objectives]] |

## Modos

- **Online** — sessões de até 10 jogadores em mata-mata ou corrida armada, com servidor autoritativo. Exige conta. Ver [[Free For All]], [[Gun Game]], [[Sessions]].
- **Contra bots** — offline, 3/5/7/9 bots em 3 dificuldades. Ver [[Versus Bots]], [[AI Overview]].
- **Treino** — campo de tiro offline com bonecos. Ver [[Training]].

Não há fim de partida, rotação nem votação de mapa ([[Problem - Partidas sem fim]]).

## Mapas

| Mapa | Id | Tamanho | Nota |
|---|---|---|---|
| Rua dos Vizinhos | `rua` (padrão) | 80×60 m, de dia | [[Map - Rua dos Vizinhos]] |
| Jardim do Dragão | `jardim` | 90×90 m, à noite | [[Map - Jardim do Dragão]] |
| Vila Assombrada | `halloween` | 120×110 m, à noite | [[Map - Vila Assombrada]] |
| Arena de teste | `arena_teste.glb` (só por `?mapa=`) | 36×36 m | [[Map - Arena Teste (glTF)]] |

Online as salas abrem sob demanda: jogar um mapa entra numa sala dele com vaga ou abre uma, e ela fecha quando esvazia; os jogadores também podem criar salas com nome ([[Matchmaking UI]], [[Matchmaking]]).

## Tecnologia em uma frase

Cliente em Three.js r186 + Rapier (física WASM) empacotado pelo Vite; servidor Bun com API REST, WebSocket JSON a 20 Hz, PostgreSQL e Redis. Ver [[Architecture Overview]].

## Onde aprofundar

[[Systems Map]] · [[Mechanics Index]] · [[Maps Index]] · [[Game Modes Index]] · [[Glossary]]
