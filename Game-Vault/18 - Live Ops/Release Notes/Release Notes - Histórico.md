---
title: Release Notes - Histórico
type: reference
status: documented
area: liveops
source_paths:
  - package.json
  - README.md
  - shared/arsenal.ts
  - server/migrations/003_melhorias.sql
tags:
  - liveops
  - release-notes
  - historico
updated: 2026-10-06
---

# Release Notes - Histórico

Reconstruído a partir de `git log --first-parent main` e do conteúdo de cada merge (`git diff --stat`). O projeto **não tem tags nem changelog**; cada PR mesclado na `main` é tratado aqui como uma "versão". Datas são as do commit de merge. Resumos são inferidos dos títulos, das mensagens e dos arquivos alterados.

## Em andamento (ainda não mesclado)

| Data | PR | Branch (origem) | Resumo | Escopo (arquivos) |
| --- | --- | --- | --- | --- |
| 2026-10-06 | — (alterações não commitadas) | `feat/home-e-modos` | **Armas secundárias e progressão por melhorias**: pistola (`pistola.json`) e submetralhadora (`smg.json`) como secundária escolhida no Arsenal, troca de arma (1/2/roda, D-pad, botão de toque) com tempo de saque e pente por arma; os níveis nomeados de rifle/faca/granada viram **melhorias** (comuns e opcionais) em `progression.json`, aplicadas por `shared/arsenal.ts` no cliente e no servidor; acertos com a arma (`hit.w`), XP para a arma que matou (`kill.arma`); escolha do Arsenal salva em `player_profile.loadout` (migration `003_melhorias.sql`, que sobe o XP antigo); `ONLINE_GRENADE_LEVEL` removido. Ver [[Weapons]], [[Progression]], [[ADR - Progressão por melhorias de arma]]. | ~47 arquivos (40 alterados + 7 novos) |

## Mesclado na `main`

| Data | PR | Branch (origem) | Resumo | Escopo (arquivos) |
| --- | --- | --- | --- | --- |
| 2026-09-30 | — | `first commit` | Protótipo inicial (Vite, Three.js, servidor, `shared/`). | 78 arquivos |
| 2026-09-30 | — | commit direto "QoL on granades" | Ajustes na granada (impacto, `granada_frag.json`, servidor). | 8 arquivos |
| 2026-09-30 | #2 | `AiramVieira/weapons` | **Progressão de armas**: `progression.json`, Arsenal na UI, níveis de rifle/faca/granada, mina terrestre, miras. | 19 arquivos |
| 2026-09-30 | #3 | `AiramVieira/autenticacao` | **Contas**: e-mail/senha e Discord, sessões, API `/api`, PostgreSQL/Redis, Dockerfile, compose, nginx, `docs/DEPLOY.md`. | 52 arquivos |
| 2026-09-30 | #4 | `AiramVieira/opressao` | Renomeia "Humilhar" para **"Opressão"** nos textos; nível da conta (`nivel_conta.json`). | 11 arquivos |
| 2026-09-30 | #5 | `AiramVieira/maps` | **Mapa chinês** (Jardim do Dragão), carregador glTF, superfícies/texturas, sala permanente por mapa. | 27 arquivos |
| 2026-10-01 | #7 | `JPLabussiereF/ci/github-actions` | **CI**: typecheck e testes em PRs para a `main`. | `.github/workflows/ci.yml` |
| 2026-10-01 | #10 | `AiramVieira/remodelagem-de-personagens` | **Personagens remodelados** (sistema modular facetado, catálogo, hitboxes, animação, LOD), editor estilo "Criar um Sim", modo PCD, **celular e controles de console**, e **migração para Bun** (Vitest removido, `bun test`). | 117 arquivos |
| 2026-10-01 | #11 | `AiramVieira/sync-hitbox` | Melhor sincronização de hitboxes (rig, avatar, remoto). | 7 arquivos |
| 2026-10-02 | #12 | `AiramVieira/sync-hitbox` | Hitbox + HUD; chat; **moderação** (`moderacao.ts`, `tools/admin.ts`), canal de silêncio no Redis. | 21 arquivos |
| 2026-10-02 | #13 | `AiramVieira/remodelagem-de-personagens` | **Som espacial**: sons 3D, oclusão por paredes, eco por ambiente; testes em `bun:test`. | 16 arquivos |
| 2026-10-02 | #14 | `AiramVieira/chore/animation` | Animação de andar/correr mais suave (viewmodel). | 1 arquivo |
| 2026-10-03 | #16 | `AiramVieira/chore/chinese-map` | **Refação do Jardim do Dragão** (setores, `client/world/jardim/*`), atmosfera, tamanho de célula do `MapBuilder`. | 36 arquivos |
| 2026-10-04 | #17 | `AiramVieira/chore/halloween-map` | **Mapa "Vila Assombrada"** (Halloween): bruxa/poções, rato gigante, biscoito, `LightPool`, sala fixa `halloween`. | 26 arquivos |
| 2026-10-04 | #15 | `JPLabussiereF/feat/keybinds` | **Teclas configuráveis** (principal + alternativa), testes de keybinds. | 10 arquivos |
| 2026-10-04 | #18 | `JPLabussiereF/fix/vila-assombrada` | Correções de detalhes da Vila Assombrada. | `client/world/hauntedTown.ts` |
| 2026-10-04 | #19 | `AiramVieira/fix/throw-grenade-on-death` | Bloqueia um segundo arremesso de granada após a morte. | `client/main.ts` |

PRs #1, #6, #8 e #9 não aparecem como merges na `main` (provavelmente fechados ou issues; o #8 é citado no título do #15 como issue de teclas configuráveis) — `unknown`.

## Marcos

- **Online com contas:** #3 (2026-09-30).
- **Três mapas:** Rua dos Vizinhos (primeiro commit), Jardim do Dragão (#5/#16), Vila Assombrada (#17). Ver [[Maps Index]].
- **Plataforma:** celular e controles (#10). Ver [[Touch Controls]].
- **Infra de qualidade:** CI (#7), Bun como único runtime (#10). Ver [[CI CD]] e [[ADR - Migração de Vitest e Node para Bun]].

## Como atualizar esta nota

`git log --first-parent --format='%h %ad %s' --date=short main` e `git diff --stat <merge>^1 <merge>` para cada merge novo.
