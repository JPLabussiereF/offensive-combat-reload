---
title: Core Pillars
type: concept
status: partial
area: design
source_paths:
  - README.md
  - shared/constants.ts
  - shared/appearance.ts
  - shared/data/progression.json
  - shared/data/weapons/rifle_padrao.json
  - server/session.ts
  - client/gameplay/spawnPicker.ts
  - docs/MAPAS.md
  - shared/data/weapons/pistola.json
  - shared/data/weapons/smg.json
  - shared/arsenal.ts
  - client/ui/strings.ts
tags:
  - game
  - design
  - pillars
updated: 2026-10-06
---

# Core Pillars

> [!warning] Inferência
> Não existe no repositório uma lista oficial de pilares (o "documento de design" citado no código não está versionado). Os pilares abaixo foram **derivados** de regras, comentários e decisões explícitas do código e do README. Cada um traz a evidência que o sustenta. Status `partial` até haver confirmação do autor.

## 1. Zoeira como recompensa

O jogo recompensa provocar o adversário, não só eliminá-lo.

- A [[Humiliation]] (Opressão) vale **150 pontos**, mais que o abate (100). O comentário em `shared/constants.ts` diz que o valor foi **triplicado** porque dançar deixa o jogador exposto. Ver [[ADR - Pontuação da Opressão triplicada]].
- O respawn online demora **5 s**, "o bastante para ver a própria humilhação" (`shared/protocol.ts`). Ver [[ADR - Atraso de respawn de 5 s online]].
- O bônus "No pássaro!" (tiro na virilha) mata na hora e mostra uma faixa na tela.
- As armas e as melhorias são piadas: Rifle da Tia do Zap, Rifle Dourado Ostentação, Frango de Borracha que grita, Macarrão de Piscina, Sabre de Luz Paraguaio, Silenciador de Garrafa PET, Mira Holográfica da Tia do Zap (nomes em `client/ui/strings.ts`).

## 2. Tiro de habilidade, guiado por dados

A mecânica de tiro é séria e configurável em JSON.

- Armas de fogo hitscan com dano por distância, multiplicadores por região do corpo (cabeça ×2,5 no rifle), dispersão em 4 estados, recuo e penetração em madeira/vidro, cada uma num JSON (`shared/data/weapons/`). Ver [[Weapons]] e [[Damage System]].
- O F3 mostra o TTK real × ideal, e os bonecos de treino servem para medi-lo ([[Training]]).

## 3. Justiça competitiva

O resultado deve depender da habilidade, não de vantagens ocultas.

- **Servidor autoritativo** sobre vida, dano, abates, pontos e progresso. Cada relato do cliente é conferido ([[Client Server Model]], [[Anti Cheat]]).
- **Altura e biotipo são só visuais.** A hitbox, a altura dos olhos e a vida são iguais para todos, "ou o corpo mais baixo seria o meta" (`shared/appearance.ts`). Ver [[ADR - Altura e biotipo apenas visuais]].
- A [[Aim Assist]] vem desligada e nunca vale para o mouse.
- O nascimento evita inimigos próximos e linhas de visão ([[Respawn]]).

## 4. Jogar em qualquer lugar, sem instalar

- O jogo roda no navegador: no PC, no celular (toque) e com controle de PS/Xbox ([[Input & Controls]], [[Touch Controls]]).
- A qualidade gráfica é automática, com resolução dinâmica ([[Performance Rendering]]).
- O treino e o modo contra bots funcionam **sem servidor e sem conta** ([[Training]], [[Versus Bots]]).

## 5. Mapas vivos, cheios de segredos

- Cada mapa tem gags reativas sincronizadas online (sinos, gongo, abóboras, fantasma) e recompensas escondidas (cereja, biscoito, carpas, rato gigante, poções). Ver [[Map Gags]], [[Objectives]] e [[Buffs & Debuffs]].
- `docs/MAPAS.md` registra que os objetos contam o que aconteceu com eles ("activations", "rings"…), "base para os segredos do documento de design".

## 6. Maestria por arma

- Cada abate dá pontos **só para a arma que matou**. Quem só usa o rifle só evolui o rifle; um abate de pistola evolui a pistola ([[Progression]], [[ADR - Progressão de XP por arma]], [[ADR - Progressão por melhorias de arma]]).
- Cada nível libera uma melhoria que muda números reais (recuo, cadência, pente, alcance da faca, raio da granada) e às vezes o visual. As opcionais trocam uma vantagem por um custo (o silenciador abafa o tiro e tira dano).

## Tensões entre pilares

> [!info] Inferência
> - *Zoeira* × *Justiça*: a Opressão dá muitos pontos, mas deixa quem dança vulnerável. O mapa Jardim do Dragão tem muros de 4 m e portões desalinhados para que "quem oprime um corpo não leve tiro do outro lado do mapa" (README).
> - *Maestria* × *Justiça*: as melhorias dão vantagem real de progressão (menos recuo e dispersão, pente maior, luneta). As opcionais cobram um preço, o que limita a vantagem. Ver [[Progression]].

## Notas relacionadas

[[Game Concept]] · [[Core Loop]] · [[Game Rules]] · [[Player Experience]]
