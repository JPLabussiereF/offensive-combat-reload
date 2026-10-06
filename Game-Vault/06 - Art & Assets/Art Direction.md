---
title: Art Direction
type: concept
status: partial
area: art
source_paths:
  - client/render/materials.ts
  - client/world/textures.ts
  - client/character/material.ts
  - client/character/palette.ts
  - shared/palette.ts
  - client/render/effects.ts
  - client/render/weaponModels.ts
  - client/world/dog.ts
  - client/styles.css
  - public/icon.svg
  - docs/PERSONAGENS.md
  - docs/MAPAS.md
  - README.md
  - shared/data/progression.json
tags:
  - game
  - art
  - art-direction
updated: 2026-10-06
---

# Art Direction

> [!warning] Fonte principal ausente
> O código cita um **documento de design** (seções 2, 3, 10...) e um **"Guia de Estilo de Personagens — Jogo FPS"**, mas nenhum dos dois está versionado no repositório. Esta nota reúne a direção de arte **que aparece no código, nos comentários e nos docs**. O que for interpretação está marcado como inferência.

## Resumo

Cartoon colorido e bem-humorado, com geometria simples (*placeholder art* de primitivas, segundo o comentário de `weaponModels.ts`), shading em 3 tons e texturas "pintadas à mão". Os personagens são low poly facetados com cores sólidas de uma paleta fechada. Nada de sangue: acertos soltam confete e estrelas.

## Regras visuais encontradas no projeto

| Regra | Evidência |
| --- | --- |
| Shading cartoon de 3 tons, barato | `materials.ts`: "3-tone ramp: cheap cartoon shading that matches the art direction (section 2)" |
| Texturas "pintadas à mão", claras, com o matiz vindo do tint | `textures.ts`: "texturas pintadas à mão" (seção 2); `docs/MAPAS.md`: "pouco ruído fotográfico: o inimigo precisa se destacar do fundo" |
| Personagens **low poly facetados semirrealistas** (7 cabeças, 1,80 m), cores sólidas, rosto feito de faces pintadas (sem textura desenhada) | `docs/PERSONAGENS.md`; `character/material.ts` (flat shading) |
| Paleta fechada para personagens; no máximo ~15% de cor saturada, sem acento na cor principal das peças grandes | `shared/palette.ts` ("Saturation rule") |
| Legibilidade à distância: olhos e sobrancelhas aumentados para ler a 15 m | `docs/PERSONAGENS.md` |
| Preto puro evitado: o toon achata quase-preto numa silhueta sem forma | `dog.ts` (`FUR = 0x35323c`) |
| Fogo de explosão em puffs opacos e facetados, não brilho aditivo ("lava no céu") | `effects.ts` |
| Sem sangue: confete em acertos, estrelas em cabeça/virilha, confete em abates | `main.ts`, `effects.ts` |
| Humor nas armas: pistola do porteiro com chaveiro, submetralhadora-liquidificador, holográfica de carinha feliz "da Tia do Zap", silenciador de garrafa PET e de batata, pente tambor de pipoqueira, frango de borracha, sabre de luz "paraguaio" | `weaponModels.ts`, `shared/data/progression.json`, `client/ui/strings.ts` |

> [!note] Divergência
> O `README.md` descreve o estilo como "anime low poly esguio (cabeça com cerca de 1/6 da altura, sombra pintada quente)" e cita 3 estilos de olho e 3 cabelos por sexo. O código e o `docs/PERSONAGENS.md` têm 6 estilos de olho e 30 cabelos para qualquer corpo. O README está desatualizado nesse ponto.

## Identidade por mapa

| Mapa | Clima visual | Paleta própria |
| --- | --- | --- |
| [[Map - Rua dos Vizinhos]] | subúrbio num dia ensolarado: céu azul, nuvens, casas em tons pastel, caminhão de sorvete rosa, flamingos de jardim | `PALETTE` |
| [[Map - Jardim do Dragão]] | jardim oriental à noite, iluminado por centenas de lanternas de papel (as de "Enrolados", segundo o comentário) | `ORIENTAL` |
| [[Map - Vila Assombrada]] | Halloween: lua cheia azulada, névoa roxa, abóboras acesas, cemitério, parque de diversões | `SPOOKY` |

Valores em [[Material Palette]].

## Identidade de marca e UI

- Roxo `#4b2a9a` (fundo do ícone, do manifest e do laboratório) e laranja `#ff8a1f` (mira do ícone).
- Cores de equipe: laranja `#ff7a1a` (A) e azul `#2f9bff` (B), as mesmas no 3D (`PALETTE.teamA/teamB`) e no CSS (`--team-a/--team-b`).
- Fontes: **Lilita One** (títulos) e **Nunito** (texto), do Google Fonts.

Ver [[UI Assets]].

> [!info] Inferência
> A combinação de cartoon, humor e ausência de sangue sugere público amplo e tom de "zoeira", o que é coerente com [[Core Pillars]]. Não há declaração explícita de público-alvo no repositório.

## Ver também

[[Asset Pipeline]] · [[Material Palette]] · [[Character Models]] · [[Weapon Models]] · [[Rendering Overview]] · [[Game Concept]]
