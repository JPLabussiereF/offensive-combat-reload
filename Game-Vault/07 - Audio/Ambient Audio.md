---
title: Ambient Audio
type: system
status: documented
area: audio
source_paths:
  - client/audio/sfx.ts
  - client/audio/spatial.ts
  - client/world/gameMap.ts
  - shared/data/mapas/rua.json
  - shared/data/mapas/jardim.json
  - shared/data/mapas/halloween.json
  - client/world/hydrant.ts
tags:
  - game
  - audio
  - ambient
updated: 2026-10-06
---

# Ambient Audio

O ambiente sonoro é **esparso e procedural**: não há trilhas de ambiente em loop (vento, cidade, chuva). Cada mapa agenda, no seu laço de animação, sons curtos que tocam "de vez em quando" num ponto do céu ao redor do ouvinte, com o tipo espacial `ambient` (suave, alcance de 400 m, sem eco, prioridade mais baixa: é o primeiro a ser descartado quando há muitas vozes; ver [[Spatial Audio]]).

## Sons de ambiente por mapa

| Mapa | Som | Intervalo | Primeiro após |
| --- | --- | --- | --- |
| [[Map - Rua dos Vizinhos]] | `ambientBird()` — 2 a 4 piados agudos em seno | 6–15 s aleatório | 4 s |
| [[Map - Jardim do Dragão]] | `ambientBird()` | 6–15 s aleatório | 4 s |
| [[Map - Vila Assombrada]] | `ambientCrow()` — 1 a 3 grasnados (dente de serra + ruído) | 7–17 s aleatório | 3 s |
| [[Map - Vila Assombrada]] | `ambientHowl()` — uivo de lobo distante (triângulo com glissando, ~3 s) | 40–80 s aleatório | 25 s |
| [[Map - Arena Teste (glTF)]] | nenhum: `buildGltfMap` não recebe o `Sfx` (`client/main.ts`) | — | — |

**Posição:** `skySpot(ouvinte)` sorteia um ponto 20–35 m ao redor do ouvinte, em direção aleatória, 10–22 m acima. Assim o pássaro "voa" em volta e não fica preso a um lugar do mapa.

> [!info]
> Os temporizadores de ambiente são locais a cada cliente (não sincronizados pela rede): jogadores diferentes ouvem pássaros em momentos diferentes. Inferido pela ausência de mensagem de rede para esses sons em `client/world/*.ts`.

## Sons contínuos

- **Hidrante estourado** ([[Map - Rua dos Vizinhos]]): `hiss(posição)` cria um `SpatialLoop` — ruído em loop filtrado em 2,2 kHz, tipo `normal`. O hidrante ajusta a intensidade a cada quadro (`setVolume`) e para quando o jato acaba; oclusão e eco são reavaliados a cada 0,2 s. É o único som em loop posicionado do jogo (único uso de `loopAt`).

## Sons de ambiente "por evento"

Vários props do mapa soam sozinhos ou quando alguém interage (sino da capela, relógio de pêndulo, gargalhada da abóbora gigante, bruxa, rato gigante). Eles não são ambiente puro: estão documentados em [[SFX]], [[Audio Events]] e [[Map Gags]].

## Código relacionado

- `shared/data/mapas/*.json` — `ambiente.sons`: pássaro na Rua e no Jardim (primeiro em 4 s, depois a cada 6–15 s), corvo e uivo na Vila e no Cemitério; a cúpula de nuvens da Rua (`ambiente.ceu.cupula`).
- `client/world/mapLoader.ts` — toca os sons ambientes (`skySpot`) e anima as nuvens (`skyClouds`).
- `client/world/hydrant.ts` — uso de `sfx.hiss`.
- `client/audio/spatial.ts` — `skySpot`, tipo `ambient`.
- `client/audio/sfx.ts` — `ambientBird`, `ambientCrow`, `ambientHowl`, `hiss`, `loopAt`.

## Ver também

[[Audio Overview]] · [[Music]] · [[World Structure]]
