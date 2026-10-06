---
title: Alternatives Considered
type: decision
status: documented
area: decisions
source_paths:
  - README.md
  - docs/MAPAS.md
  - client/world/mapBuilder.ts
  - client/world/dragonGarden.ts
  - client/render/effects.ts
  - client/character/material.ts
  - client/audio/sfx.ts
  - client/core/keybinds.ts
  - client/ui/home.ts
  - shared/protocol.ts
  - shared/movement.ts
  - server/session.ts
tags:
  - game
  - decisions
updated: 2026-10-05
---

# Alternativas consideradas

Caminhos que o projeto avaliou, trocou ou deixou para depois, com a evidência de onde isso está registrado. Para as decisões que valeram, ver os ADRs em `Architecture Decisions/`, `Design Decisions/` e `Technical Decisions/`.

## Trocadas (o projeto já usou a outra opção)

| Antes | Depois | Por quê / evidência | Nota |
|---|---|---|---|
| Ferramentas Node (tsx, esbuild, vitest, ws, @node-rs/argon2) | Bun como runtime, bundler do servidor e test runner | Simplificou as ferramentas (commit `6c6f68d`, merge `f92d22a`) | [[ADR - Bun como runtime único]] · [[ADR - Migração de Vitest e Node para Bun]] |
| Progresso no `localStorage` (chaves `oc.profile` e outras, hoje apagadas em `client/ui/home.ts`) | Progresso na conta, só por abates online validados pelo servidor | Evitar progresso forjado | [[ADR - Progressão de XP por arma]] · [[Save System]] |
| Altura e biotipo com efeito de jogo (vida e hitbox) | Altura e biotipo só visuais | Não criar meta de aparência (commit `68a2b32`) | [[ADR - Altura e biotipo apenas visuais]] |
| Jardim aberto de 80×60 m | Jardim murado de 90×90 m com 6 setores | Linhas de visão curtas para proteger quem oprime (commit `c7ef981`, `docs/MAPAS.md`) | [[ADR - Linhas de visão curtas no Jardim do Dragão]] |
| Colisão por degrau / rampa fina | Cunha sólida sob a escada | A rampa fina deixava um vão onde se escondia e atirava (`mapBuilder.ts`) | [[ADR - Escadas com colisão em rampa sólida]] |
| Células de 40 m no Jardim | Células de 45 m | 40 m cortava a propriedade em 16 pedaços e dobrava as draw calls (`dragonGarden.ts`) | [[ADR - Lotes estáticos por material e célula]] |
| Explosão com brilho aditivo | "Puffs" opacos e chapados | O aditivo "lava" contra o céu (`effects.ts`) | [[Particles]] |
| Ctrl para agachar | Outra tecla padrão | Ctrl+W fecha a aba do navegador (`client/core/keybinds.ts`) | [[Input & Controls]] |
| Pontuação de opressão original | Opressão triplicada (150) | A mecânica-assinatura precisa compensar o risco (`shared/constants.ts`) | [[ADR - Pontuação da Opressão triplicada]] |

## Mantidas lado a lado

- **Porta única (`bun start`) e nginx na frente:** os dois modos de hospedagem continuam suportados ([[ADR - nginx na frente do servidor do jogo com Docker Compose]], [[Hosting]]).
- **Dois modelos de iluminação na mesma cena:** personagens com `MeshStandardMaterial` + flat shading e mundo com toon (`client/character/material.ts`; [[ADR - Toon shading com rampa de 3 tons]]).

## Adiadas (citadas no código ou no README como futuro)

- **Mensagens binárias em vez de JSON** no WebSocket (`shared/protocol.ts`; [[Network Performance]]).
- **Rewind de hitboxes e interest culling** no servidor (`server/session.ts`, cabeçalho "Not yet"; [[Anti Cheat]]).
- **Movimento autoritativo no servidor** reutilizando `shared/movement.ts`, com predição e reconciliação (README "Ainda não feito"; [[ADR - Movimento confiado ao cliente]]).
- **Banco de samples de áudio** no lugar da síntese, citado no topo de `client/audio/sfx.ts` ([[ADR - Áudio procedural em Web Audio]]).
- **Bots online**, que dependem de simulação no servidor (README Fase 2; [[Problem - Bots só existem offline]]).
- **Lightmaps**, planejados mas sem suporte ([[Lighting]]).
