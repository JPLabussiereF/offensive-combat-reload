---
title: Configurable Content
type: configuration
status: documented
area: liveops
source_paths:
  - shared/data/progression.json
  - shared/data/nivel_conta.json
  - shared/data/weapons/rifle_padrao.json
  - shared/data/weapons/faca.json
  - shared/data/weapons/granada_frag.json
  - shared/maps.ts
  - shared/constants.ts
  - shared/catalog.ts
  - public/textures/manifest.json
  - public/maps/arena_teste.glb
  - docs/MAPAS.md
  - shared/data/weapons/pistola.json
  - shared/data/weapons/smg.json
  - client/ui/strings.ts
tags:
  - liveops
  - dados
updated: 2026-10-06
---

# Configurable Content

Conteúdo que pode ser ajustado **sem mexer na lógica**, editando arquivos de dados. Todos são empacotados no build (cliente e servidor leem os mesmos arquivos de `shared/`), então **qualquer mudança exige novo build e reinício** ([[Updates]]). Não há configuração remota nem painel de conteúdo.

| Conteúdo | Arquivo | O que controla | Nota principal |
| --- | --- | --- | --- |
| Armas | `shared/data/weapons/rifle_padrao.json` e os seis `rifle_*.json`, `pistola.json`, `smg.json`, `faca.json` e as seis facas antigas, `granada_frag.json` | Cadência, pente, dano, alcance, dispersão, recuo, penetração, tempo de saque (`troca`), espaço (`slot`: primária/secundária), pintura (`visual`), trava (`libera`, em pontos), pavio, impacto... | [[Weapons]] |
| Melhorias das armas | `shared/data/progression.json` | Por arma: a melhoria de cada nível, os pontos para liberá-la, se é opcional, o grupo e os efeitos (multiplicadores, somas, mira, forma, tipo) | [[Progression]] |
| Nomes e descrições de armas e melhorias | `client/ui/strings.ts` (`arma_*`, `armaDesc_*`, `upg_<arma>_<id>`, `upgDesc_*`, `fx_*`) | Textos em pt-BR e en; `client/tests/arsenalText.test.ts` acusa um texto faltando | [[Inventory UI]] |
| Nível da conta | `shared/data/nivel_conta.json` | Curva de XP da conta | [[Progression]] |
| Mapas e objetos sincronizados | Banco (`map`, `map_version`, pela API `/api/mapas`) e `shared/data/mapas/*.json` (oficiais) | Mapas oficiais e da comunidade com versões; coletáveis, peixes, ratos e bruxa nos dados de cada mapa. Mudar um mapa não exige build (as salas novas usam a versão nova) | [[Maps Index]] |
| Constantes de jogo | `shared/constants.ts` | Vida, regeneração, pontuação, opressão, cereja, poções, etc. | [[Constants Reference]] |
| Catálogo de personagem | `shared/catalog.ts` | Itens de roupa/acessórios, categorias, canais de cor | [[Character Customization]] |
| Texturas de superfície | `public/textures/manifest.json` | Troca as texturas procedurais por arquivos (`arquivo`, `metros`, `tingir`) — hoje só contém o leia-me | [[Texture System]] |
| Mapas do Blender | `public/maps/*.glb` + convenções `COL_`, `SPAWN_`, `MAT_`, `DUMMY_` | Mapas e props importados (`docs/MAPAS.md`) | [[Map - Arena Teste (glTF)]], [[Asset Pipeline]] |
| Rede/sessões | `NET` em `shared/protocol.ts` | Taxas, máximo de jogadores, chat, respawn | [[Network Performance]] |

> [!info] Configuração de operação
> Variáveis de ambiente (banco, Redis, Discord, SMTP, origens) estão em [[Configuration Reference]]; não alteram conteúdo de jogo.

## Código relacionado

- `shared/data/**`, `shared/maps.ts`, `shared/constants.ts`, `shared/catalog.ts`, `shared/protocol.ts`
- `public/textures/manifest.json`, `public/maps/`, `docs/MAPAS.md`

Ver também: [[Configuration Data]], [[Feature Flags]].
