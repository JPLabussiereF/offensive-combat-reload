---
title: Home
type: reference
status: documented
area: index
source_paths:
  - README.md
  - package.json
tags:
  - game
  - index
updated: 2026-10-07
---

# Offensive Combat — Cofre de documentação

Porta de entrada do cofre. Ele explica **o que existe no jogo, por que existe, como funciona e onde está implementado**, a partir do código da branch `main` (último merge documentado: PR #19, commit `4af5b0a`).

> [!info] Como este cofre é mantido
> As regras de organização estão no [README do cofre](../README.md): separação por responsabilidade, frontmatter, classificação por evidência e nada inventado. Toda nota cita os arquivos reais em `source_paths`. Quando o código mudar, atualize só as notas afetadas e registre em [[Documentation Status]].

## Comece por aqui

| Pergunta | Nota |
|---|---|
| O que é o jogo? | [[Game Overview]] · [[Game Concept]] |
| Como o software é montado? | [[Architecture Overview]] · [[Code Architecture Overview]] |
| Quais sistemas existem e como se ligam? | [[Systems Map]] · [[Dependencies Map]] |
| O que está documentado e o que falta? | [[Documentation Status]] |
| O que significa um termo do projeto? | [[Glossary]] |

## Índices por área

| Área | Índice / nota de entrada |
|---|---|
| 01 · Visão e design | [[Game Concept]], [[Core Pillars]], [[Core Loop]], [[Game Rules]], [[Progression]], [[Achievements]] |
| 02 · Gameplay e mecânicas | [[Mechanics Index]] |
| 03 · Modos de jogo | [[Game Modes Index]] |
| 04 · Mundo e mapas | [[Maps Index]] |
| 05 · Renderização | [[Rendering Overview]] |
| 06 · Arte e assets | [[Art Direction]], [[Asset Pipeline]] |
| 07 · Áudio | [[Audio Overview]] |
| 08 · UI e UX | [[UI Overview]] |
| 09 · Arquitetura de código | [[Code Architecture Overview]] |
| 10 · Rede e multiplayer | [[Networking Overview]] |
| 11 · Dados e persistência | [[Data Architecture]] |
| 12 · IA e NPCs | [[AI Overview]] |
| 13 · Backend e serviços | [[Backend Overview]] |
| 14 · Infraestrutura e deploy | [[Infrastructure Overview]] |
| 15 · Performance | [[Performance Overview]] |
| 16 · Segurança | [[Security Overview]] |
| 17 · Testes | [[Testing Overview]] |
| 18 · Live ops | [[Live Game Structure]] |
| 19 · Decisões e conhecimento | [[Technical Debt]], [[Alternatives Considered]], [[Lessons Learned]] e as pastas de ADRs e problemas |
| 20 · Referência | [[Glossary]], [[Constants Reference]], [[Configuration Reference]], [[File Structure Reference]], [[Naming Conventions]], [[External References]] |

## O jogo em cinco linhas

- FPS de navegador com visual cartoon (toon shading), feito em TypeScript: Three.js + Rapier no cliente e Bun + PostgreSQL + Redis no servidor. Ver [[Architecture Overview]].
- Três lugares para jogar: **online** (até 10 jogadores, exige conta), **contra bots** (offline) e **treino** (offline, com bonecos); e três modos de jogo: **mata-mata**, **corrida armada** e **zumbi** (em equipe contra 12 ondas de zumbis e 3 chefes no mapa só dele, o [[Map - Cemitério da Capela]], com armas compradas no Caixão Misterioso e barricadas nas brechas do muro, pagas com o dinheiro da partida; ver [[Zombie]]). Ver [[Game Modes Index]].
- Três mapas jogáveis: [[Map - Rua dos Vizinhos]], [[Map - Jardim do Dragão]] e [[Map - Vila Assombrada]], mais o mapa de teste [[Map - Arena Teste (glTF)]].
- Mecânica-assinatura: **Oprimir**, uma dança sobre o corpo de quem você matou, que vale 150 pontos. Ver [[Humiliation]]. Arsenal com rifle, uma secundária à escolha entre sete (pistola, grampeador, submetralhadora, revólver, furadeira, garrucha ou pistolão), faca e granada; cada arma sobe de nível com o próprio XP e cada nível libera uma melhoria. Ver [[Weapons]] e [[Progression]].
- Mapas cheios de piadas interativas e bônus: cereja, carpa dourada, rato gigante, poções da bruxa e outros. Ver [[Map Gags]] e [[Buffs & Debuffs]].
