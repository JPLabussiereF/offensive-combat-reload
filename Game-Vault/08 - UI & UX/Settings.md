---
title: Settings
type: configuration
status: documented
area: ui
source_paths:
  - client/core/settings.ts
  - client/ui/menu.ts
  - client/main.ts
  - index.html
  - client/ui/home.ts
tags:
  - game
  - ui
  - settings
updated: 2026-10-05
---

# Settings

Configurações do jogador, editadas na coluna "Configurações" do menu inicial/pausa e na aba **Configurações** da tela inicial (o mesmo bloco `#menu-settings`, emprestado à aba; ver [[Menus]]) e aplicadas na hora. Ficam **só no navegador** (`localStorage`, chave `oc.settings.v1`); não são salvas na conta. Ver [[Save System]].

## Opções

| Opção | Campo (`Settings`) | Faixa | Padrão | Onde aparece | Efeito |
| --- | --- | --- | --- | --- | --- |
| Sensibilidade | `sensitivity` | 0,3–8 | 2,5 | computador | Graus por contagem = valor × 0,022 (estilo Source). |
| Sensibilidade na mira | `adsSensitivity` | 0,3–1,5 | 0,85 | todos | Multiplicador ao mirar. |
| Sensibilidade do controle | `padSensitivity` | 0,3–2,5 | 1 | só com controle | 220°/s no máximo a 1. |
| Assistência de mira | `aimAssist` | sim/não | não | toque/controle | Mira desacelera sobre inimigo (nunca puxa). Ver [[Aim Assist]]. |
| Sensibilidade do toque | `touchSensitivity` | 0,3–3 | 1 | celular | ~0,18° por pixel a 1. |
| Tamanho dos botões | `touchScale` | 70–140% | 100% | celular | — |
| Opacidade dos botões | `touchOpacity` | 20–100% | 55% | celular | — |
| Mira: segurar | `adsHold` | sim/não | não (tocar alterna, padrão do CoD Mobile) | celular | — |
| Tela cheia ao jogar | `fullscreen` | sim/não | sim | celular; computador com Keyboard Lock | Celular: tela cheia + paisagem. Computador: tela cheia deixa o jogo com o Esc. |
| Posições dos botões | `touchLayout` | — | {} | editor de layout | Ver [[Touch Controls]]. |
| Campo de visão | `fov` | 55–95° | 75° | todos | FOV vertical. Ver [[Camera]]. |
| Volume | `volume` | 0–100% | 70% | todos | Volume master. Ver [[Audio Overview]]. |
| Som espacial | `spatialAudio` | Automático / Fone (3D) / Caixa de som (estéreo) | Automático | todos | Ver [[Spatial Audio]]. |
| Qualidade gráfica | `quality` | Automática / Baixa / Média / Alta | Automática | todos | Ver [[Performance Rendering]]. |
| Inverter eixo Y | `invertY` | sim/não | não | todos | — |
| Teclas | `keybinds`, `keyLabels` | — | padrões | computador | Ver [[Input & Controls]]. |

Itens mostrados ou escondidos por classes CSS conforme o dispositivo: `.desktop-only`, `.mobile-only`, `.pad-only`, `.assist-only`, `.fs-only`.

## Persistência e carregamento

- `loadSettings()` lê o JSON salvo e o espalha sobre os padrões (`{...DEFAULTS, ...salvo}`), com tratamento especial para teclas (`mergeKeybinds`) e nomes de teclas (só caracteres únicos imprimíveis).
- `saveSettings()` grava a cada mudança (callback de `screens.bindSettings` em `main.ts`, ligado **antes** da tela inicial), que também reaplica teclas, volume, modo espacial, qualidade e, já na partida, o layout de toque.
- Sem `localStorage` disponível, tudo funciona com os padrões (erros são ignorados).

> [!info]
> A versão "v1" da chave sugere intenção de migrar o formato no futuro; não há código de migração hoje. Ver [[Data Migrations]].

## Outras preferências locais

- `oc.bots` — preferências da tela inicial (`client/ui/home.ts`): `skill` (dificuldade), `count` (bots), `map`, `mode` (`online` | `bots` | `treino`, a aba Jogar abre nele) e `filtro` (mapas marcados no Online). Valores inválidos voltam ao padrão.
- Chaves antigas `oc.name`, `oc.sex`, `oc.profile` são apagadas ao abrir a tela inicial (nome, corpo e progressão passaram a viver na conta).

## Código relacionado

- `client/core/settings.ts` — `Settings`, `DEFAULTS`, `loadSettings`, `saveSettings`, `spatialMode`.
- `client/ui/menu.ts` — `Screens.bindSettings`.
- `client/main.ts` — aplicação das mudanças.
- `index.html` — controles `#set-*`.

Valores completos também em [[Configuration Reference]].
