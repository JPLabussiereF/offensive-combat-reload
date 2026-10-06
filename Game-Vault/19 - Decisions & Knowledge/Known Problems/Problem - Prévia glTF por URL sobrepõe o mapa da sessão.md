---
title: Problem - Prévia glTF por URL sobrepõe o mapa da sessão
type: problem
status: partial
area: world
source_paths:
  - client/main.ts
  - client/world/gltfMap.ts
tags:
  - problem
  - maps
  - gltf
updated: 2026-10-05
---

# Problem - Prévia glTF por URL sobrepõe o mapa da sessão

## Contexto

`?mapa=/maps/arquivo.glb` carrega um mapa feito no Blender "por cima do que foi escolhido" (comentário em `client/main.ts`: "map makers' preview"). Ver [[Map - Arena Teste (glTF)]].

## Problema

A verificação não olha o modo: também vale **online**. Nesse caso (inferência a partir do código):

- O cliente joga em geometria diferente da dos outros jogadores, que continuam no mapa da sessão; posições, colisões e spawns ficam incoerentes entre eles.
- Os coletáveis da sessão ficam sem efeito para esse cliente (`pickupKind` devolve `undefined` quando há `mapUrl`).
- O servidor aceita a posição de respawn enviada sem conferir se é um spawn do mapa ([[Trust Boundaries]]).

## Opções consideradas

- Restringir `?mapa=` ao modo offline/treino.
- Manter como ferramenta de desenvolvimento sem restrição (situação atual).

## Decisão

Nenhuma registrada.

## Motivo

Desconhecido; provavelmente a prévia foi pensada só para uso local.

## Consequências

Um usuário pode, pela URL, entrar online num mapa diferente do dos outros. Impacto em trapaça: ver [[Anti Cheat]].

## Código afetado

- `client/main.ts` — `mapUrl`, `buildMap`, `pickupKind`.
- `client/world/gltfMap.ts` — `buildGltfMap`.
- Ver [[Level Flow]].
