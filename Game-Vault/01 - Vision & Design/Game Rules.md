---
title: Game Rules
type: concept
status: documented
area: design
source_paths:
  - shared/constants.ts
  - shared/protocol.ts
  - shared/weapons.ts
  - shared/appearance.ts
  - shared/data/weapons/rifle_padrao.json
  - shared/data/weapons/faca.json
  - shared/data/weapons/granada_frag.json
  - server/session.ts
  - client/main.ts
  - client/entities/localPlayer.ts
  - client/weapons/mines.ts
tags:
  - game
  - design
  - rules
updated: 2026-10-05
---

# Game Rules

As **regras globais** valem em todos os modos. As regras específicas de cada modo (tempo de respawn, proteção, bots) ficam nas notas dos modos ([[Game Modes Index]]). Os números detalhados ficam nas notas centrais de cada mecânica; aqui fica o resumo normativo, com link para a fonte principal.

## Autoridade

- **Online, o servidor decide** vida, dano, abates, pontos, progresso, respawn e corpos oprimíveis. O cliente informa o que acertou, e o servidor confere cada relato: se os dois estão vivos, a cadência, a distância real com folga de latência, o alcance, o raio da granada e a janela da opressão. Ver [[Client Server Model]] e [[Validation]].
- **Offline** (treino e contra bots), o cliente aplica as **mesmas regras** de `shared/`. O `BotManager` se descreve como aplicando o dano "com as mesmas regras do servidor".
- **A posição é confiada ao cliente** (não há simulação de movimento no servidor). Ver [[Trust Boundaries]].

## Vida e corpo

| Regra | Valor | Fonte |
| --- | --- | --- |
| Vida máxima | **100** para todos os corpos | `bodyStats` em `shared/appearance.ts` |
| Regeneração | começa **4 s** após o último dano, a **25/s** | `HEALTH` |
| Vida baixa (alerta) | 30 | `HEALTH.lowThreshold` |
| Altura e biotipo | **só visuais** (mesma hitbox, olho e vida) | [[ADR - Altura e biotipo apenas visuais]] |
| Modo PCD sem braço/mão | recarga **×1,3**; a hitbox do membro some | `EFFECTS.armLossReload` |
| Modo PCD sem perna | velocidade **×0,75** | `EFFECTS.legLossSpeed` |
| Bônus temporários de vida | cereja +50 de máxima por 30 s; humanidade do rato +50 até morrer | [[Buffs & Debuffs]] |

Detalhes em [[Health System]] e [[Character Customization]].

## Formas de morrer

| Causa (`KillKind`) | Regra | Quem pontua |
| --- | --- | --- |
| `gun` / `head` / `groin` | dano do rifle por distância e região. A virilha ("No pássaro") mata na hora | o atirador |
| `knife` | a faca é letal (`letal: true`) | o atacante |
| `grenade` | dano em área com queda por distância, máximo de 85 no centro | quem lançou |
| `explosion` | a própria granada **sempre** pode matar quem a lançou | ninguém |
| `fall` | queda acima de 6 m: `(altura − 6) × 15 + 10` de dano | ninguém |
| `void` | cair abaixo do `killY` do mapa | ninguém |
| `dog` | pisar na frente da casinha da Amora mata na hora | ninguém (o kill feed mostra "Amora") |

Ver [[Damage System]], [[Grenades]], [[Melee]] e [[Map Gags]].

## Pontuação

- O abate vale **100**, mais os bônus. A [[Humiliation]] completa vale **150**. Tabela completa em [[Scoring]].
- **Não existe pontuação negativa**: suicídio, queda e mordida contam só uma morte para a vítima.
- Os bônus só valem quando o golpe **mata**.

## Opressão (Humilhação)

- O corpo fica oprimível por **6 s** (`HUMILIATION.window`). O jogador precisa estar a **2 m** dele (o servidor tolera mais 1,5 m).
- A dança dura **3,2 s**. Durante ela o jogador não pode atirar, e **só a morte** a interrompe (dano não interrompe).
- Cada corpo só pode ser oprimido **uma vez** e por uma pessoa por vez. Ninguém oprime o próprio corpo.
- Se a dança é interrompida, o corpo ganha +1,5 s de janela. Detalhes em [[Humiliation]].

## Nascimento

- Nunca nasce a menos de 2 m de alguém, evita inimigos a menos de 15 m ou com linha de visão, e sorteia entre os 3 melhores pontos. Ver [[Respawn]] e [[Spawn Design]].
- Ao morrer, o jogador perde todos os bônus temporários (cereja, humanidade, poção, pato, mira afiada). As minas somem quando o dono renasce.

## Armas e limites

- O arsenal tem rifle, faca e granada. Uma granada vira [[Land Mines|mina]] ou "Dose Dupla" conforme o nível equipado ([[Progression]]).
- Granadas: **2 cargas**, recarga de **10 s**, pavio de 3 s enquanto cozinha, explodem no primeiro contato depois de lançadas (`granada_frag.json`).
- Minas: até **3** no mapa por jogador (`MAX_MINES`). O servidor limita a 4 granadas comuns vivas por jogador.
- Não há troca de arma primária nem pickups de arma ou munição: a munição volta cheia a cada nascimento. Ver [[Inventory]] e [[Items]].

## Sessões

- Até **10** jogadores por sessão (`NET.maxPlayers`). Não há times: todos contra todos. Ver [[Free For All]].
- Não há fim de partida, limite de abates nem limite de tempo ([[Problem - Partidas sem fim]]).

## Notas relacionadas

[[Core Loop]] · [[Core Pillars]] · [[Scoring]] · [[Respawn]] · [[Objectives]] · [[Constants Reference]]

## Código relacionado

- `shared/constants.ts`: `HEALTH`, `SCORE`, `HUMILIATION`, `CHERRY`, `RAT`, `POTION`, `KOI`, `MOVE`
- `shared/protocol.ts`: `NET` (`maxPlayers`, `respawnDelay`, `corpseWindow`), `KillKind`
- `server/session.ts`: `damage`, `kill`, `onHit`, `onStab`, `onBoom`, `onTaunt`, `onTauntEnd`
- `client/entities/localPlayer.ts`: dano de queda e morte no vazio
