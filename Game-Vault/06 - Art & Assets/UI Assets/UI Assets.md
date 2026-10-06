---
title: UI Assets
type: asset
status: documented
area: art
source_paths:
  - public/icon.svg
  - public/manifest.webmanifest
  - index.html
  - client/styles.css
  - client/ui/touch.ts
  - client/ui/hud.ts
  - client/main.ts
  - shared/data/progression.json
  - client/ui/arsenal.ts
tags:
  - game
  - art
  - ui
  - assets
updated: 2026-10-06
---

# UI Assets

## Visão geral

A interface não usa imagens rasterizadas. Os "assets" de UI são: **um ícone SVG**, **o manifest PWA**, **duas fontes do Google Fonts**, **ícones de linha em SVG inline** (controles de toque), **emojis** (killfeed, buffs, armas e melhorias) e **CSS** (cores, vinheta, luneta). Comportamento das telas em [[UI Overview]] e [[HUD]].

## Inventário

| Asset | Onde | Descrição |
| --- | --- | --- |
| Ícone do app | `public/icon.svg` | quadrado arredondado roxo `#4b2a9a` com uma mira laranja `#ff8a1f` (círculo, ponto central) e quatro traços claros `#f3efe6` |
| Manifest PWA | `public/manifest.webmanifest` | nome "Offensive Combat", curto "Offensive", `display: fullscreen`, `orientation: landscape`, fundo e tema `#4b2a9a`, ícone SVG |
| Favicon | `index.html` | SVG inline com o emoji 🎯 |
| Fontes | `index.html` (Google Fonts) | **Lilita One** (`--display`, títulos) e **Nunito** 600/800/900 (`--body`, texto) |
| Ícones de toque | `client/ui/touch.ts` | SVG 24 × 24, traço branco de 2 px: `fire` (projétil), `ads`, `jump`, `crouch`, `reload`, `melee`, `grenade`, `swap` (duas setas, troca de arma), `pause`, `board`, `fs` (tela cheia), `chat` |
| Ícones do killfeed | `client/ui/hud.ts` | ✚ cabeça, 🔪 faca, 🐦 virilha ("No pássaro!"), 💃 humilhação, 💣 granada, 🐕 cachorro |
| Ícones de buff | `client/main.ts` | 💨 veloz, 🐌 lerdo, 💀 crítico, 🍺 bêbado (com cores próprias) |
| Ícones de arma e de melhoria | `shared/data/progression.json` (`icone` de cada arma e de cada melhoria) | emojis (ex.: armas 🔫 🛎️ 🌀 🔪 💣; melhorias 🔴 🔭 🍾 🐔 🧨) |
| Aviso de granada | `index.html` | 💣 com seta ▲ |
| Overlay de luneta | `client/styles.css` (`#scope`) | máscara radial preta com cruz e ponto |
| Vinheta | `client/styles.css` (`#vignette`) | degradê radial vermelho, vida baixa e flash de dano |
| Tela "gire o celular" | `index.html` | 📱↻ |

## Cores de UI

`--ink #1b1530`, `--paper #fff8ec`, `--team-a #ff7a1a`, `--team-b #2f9bff`, `--good #7dff5a`, `--warn #ffd23f`, `--bad #ff4a3d`, e variáveis de vidro do HUD (`--hud-glass`, `--hud-line`). Ver [[Material Palette]].

## Miniaturas geradas

As miniaturas do editor de personagem não são arquivos: são renderizadas em tempo real do próprio personagem (`toDataURL`). Ver [[Character Customization]].

> [!note]
> As fontes dependem da rede (Google Fonts); sem conexão, caem nos fallbacks (`'Arial Black'`, `system-ui`).

## Código relacionado

- `public/icon.svg`, `public/manifest.webmanifest`
- `index.html` (fontes, favicon, elementos do HUD)
- `client/styles.css` (variáveis, `#scope`, `#vignette`)
- `client/ui/touch.ts` (`ICONS`), `client/ui/hud.ts` (`FEED_ICONS`)

## Ver também

[[UI Overview]] · [[HUD]] · [[Touch Controls]] · [[Art Direction]]
