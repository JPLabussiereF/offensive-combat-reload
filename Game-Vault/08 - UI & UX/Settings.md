---
title: Settings
type: configuration
status: documented
area: ui
source_paths:
  - client/core/settings.ts
  - client/ui/menu.ts
  - client/styles.css
  - client/main.ts
  - index.html
  - client/ui/home.ts
  - client/ui/strings.ts
  - shared/langs.ts
tags:
  - game
  - ui
  - settings
updated: 2026-10-08
---

# Settings

Configurações do jogador, editadas na aba **Configurações** do menu de pausa e do cartão de início e na aba **Configurações** da tela inicial (o mesmo bloco `#menu-settings`, emprestado à aba; ver [[Menus]]) e aplicadas na hora ("Tudo vale na hora."). Ficam **só no navegador** (`localStorage`, chave `oc.settings.v1`); não são salvas na conta. Ver [[Save System]].

Desde a PF-11 ([[ADR - Menu de pausa com trilho e abas]]) o bloco é dividido em **subabas**: **Mira**, **Vídeo**, **Áudio**, **Teclas** (no computador) ou **Controle** (com um controle em uso: a tabela fixa de botões, com os símbolos PlayStation ou Xbox) e **Toque** (só no celular). Cada linha tem o nome, uma explicação curta e o controle: barra com o valor ao lado, botão **Ligado/Desligado** ou uma fileira de opções (a escolhida em laranja). Com controle, L1/R1 trocam as subabas no menu de pausa.

## Opções

| Opção | Campo (`Settings`) | Faixa | Padrão | Subaba e onde aparece | Efeito |
| --- | --- | --- | --- | --- | --- |
| Sensibilidade ("Mouse, sem mirar") | `sensitivity` | 0,3–8 | 2,5 | Mira; computador | Graus por contagem = valor × 0,022 (estilo Source). |
| Sensibilidade na mira | `adsSensitivity` | 0,3–1,5 | 0,85 | Mira; todos | Multiplicador ao mirar. |
| Sensibilidade do controle ("Analógico direito") | `padSensitivity` | 0,3–2,5 | 1 | Mira; só com controle | 220°/s no máximo a 1. |
| Assistência de mira | `aimAssist` | Ligado/Desligado | Desligado | Mira; toque e controle (`.assist-only`) | Mira desacelera sobre inimigo (nunca puxa). Ver [[Aim Assist]]. |
| Inverter eixo Y | `invertY` | Ligado/Desligado | Desligado | Mira; todos | — |
| Campo de visão | `fov` | 55–95° | 75° | Vídeo; todos | FOV vertical. Ver [[Camera]]. |
| Qualidade gráfica | `quality` | Automática / Baixa / Média / Alta | Automática | Vídeo; todos | Ver [[Performance Rendering]]. |
| Detalhe dos objetos | `detalhe` | Normal / Leve | Leve no celular e com renderização por software, Normal nos demais (`defaultDetail`; o campo fica vazio até o jogador escolher) | Vídeo; todos | Leve simplifica árvores, folhagem, enfeites e estantes e troca os níveis de detalhe dos personagens mais cedo (PF-35). Lido ao montar o mapa (`objectDetail` em `client/main.ts`): vale a partir da próxima partida, não na que está rolando. Colisão igual nos dois. Ver [[ADR - Detalhe geométrico Normal e Leve]]. |
| Idioma | `idioma` (opcional) | Português (Brasil) / English / Español / Deutsch (cada um no próprio idioma) | sem valor: o do navegador | Vídeo; todos (também o botão de idioma da landing) | Fora da partida recarrega a página no idioma escolhido; dentro dela fica salvo e a linha avisa "vale ao voltar ao início". Ver [[ADR - Seletor de idioma por aparelho]]. |
| Tela cheia ao jogar | `fullscreen` | Ligado/Desligado | Ligado | Vídeo no computador com Keyboard Lock; Toque no celular (`.fs-only`) | Celular: tela cheia + paisagem. Computador: tela cheia deixa o jogo com o Esc. |
| Esconder pets dos outros | `hidePets` | Ligado/Desligado | Desligado | Vídeo; todos | Só no PvP: os pets dos outros jogadores não são desenhados (o seu continua). No zumbi não vale. Ver [[Pets]]. |
| Volume | `volume` | 0–100% | 70% | Áudio; todos | Volume master. Ver [[Audio Overview]]. |
| Som espacial ("Som") | `spatialAudio` | Automático / Fone (3D) / Caixa de som (estéreo) | Automático | Áudio; todos | Ver [[Spatial Audio]]. |
| Teclas | `keybinds`, `keyLabels` | — | padrões | Teclas; computador sem controle em uso | Em grupos Movimento, Combate e Outros. Ver [[Input & Controls]]. |
| Sensibilidade do toque | `touchSensitivity` | 0,3–3 | 1 | Toque; celular | ~0,18° por pixel a 1. |
| Tamanho dos botões | `touchScale` | 70–140% | 100% | Toque; celular | — |
| Opacidade dos botões | `touchOpacity` | 20–100% | 55% | Toque; celular | — |
| Segurar para mirar | `adsHold` | Ligado/Desligado | Desligado (tocar alterna, padrão do CoD Mobile) | Toque; celular | — |
| Posições dos botões | `touchLayout` | — | {} | Toque: "Ajustar botões" (editor de layout) | Ver [[Touch Controls]]. |

A subaba **Toque** também tem o botão "Tela cheia" (onde há a API), o aviso do iPhone ("Adicionar à Tela de Início") e a ajuda dos controles de toque. Itens mostrados ou escondidos por classes CSS conforme o dispositivo: `.desktop-only`, `.mobile-only`, `.pad-only`, `.assist-only`, `.fs-only`; a subaba Teclas some no celular sem controle.

## Persistência e carregamento

- `loadSettings()` lê o JSON salvo e o espalha sobre os padrões (`{...DEFAULTS, ...salvo}`), com tratamento especial para teclas (`mergeKeybinds`), nomes de teclas (só caracteres únicos imprimíveis), o detalhe dos objetos (valor que não seja `normal` ou `leve` é descartado e volta ao padrão do aparelho) e idioma (`idioma` só fica se for um de `LANGS`; outro valor é descartado e vale o do navegador).
- O idioma é o primeiro a ser lido no `boot()` de `main.ts`: `loadSettings()` roda **antes** de `new Screens()`, seguido de `setLang(resolveLang(settings.idioma, systemLang()))`, `<html lang>` e o título da página. Muitos textos (menus, placas do galpão) são montados uma única vez, por isso trocar o idioma fora da partida recarrega a página.
- `saveSettings()` grava a cada mudança (callback de `screens.bindSettings` em `main.ts`, ligado **antes** da tela inicial), que também reaplica teclas, volume, modo espacial, qualidade e, já na partida, o layout de toque.
- Sem `localStorage` disponível, tudo funciona com os padrões (erros são ignorados).

> [!info]
> A versão "v1" da chave sugere intenção de migrar o formato no futuro; não há código de migração hoje. Ver [[Data Migrations]].

## Outras preferências locais

- `oc.bots` — preferências da tela inicial (`client/ui/home.ts`): `skill` (dificuldade), `count` (bots), `map` (mapa de bots e do treino), `mode` (`online` | `bots` | `treino`, a aba Jogar abre nele), `game` (tipo de partida) e `onlineMap` (mapa do Online; `null` = Qualquer mapa). O antigo `fora`/`filtro` (filtro de vários mapas) é convertido ao abrir e não é mais gravado. Valores inválidos voltam ao padrão.
- Chaves antigas `oc.name`, `oc.sex`, `oc.profile` são apagadas ao abrir a tela inicial (nome, corpo e progressão passaram a viver na conta).

## Código relacionado

- `client/core/settings.ts` — `Settings`, `DEFAULTS`, `loadSettings`, `saveSettings`, `spatialMode`, `objectDetail`, `defaultDetail`, `setSoftwareRenderer`.
- `client/ui/menu.ts` — `Screens.bindSettings` (barras, botões Ligado/Desligado, fileiras de opções, a linha de idioma `#set-lang`), `Screens.chooseLanguage` (salva e recarrega, ou avisa durante a partida, `inMatch`) e as subabas (`showSub`, `showControls`).
- `shared/langs.ts` — `LANGS`, `LANG_NAMES`, `LANG_LOCALE`; `client/ui/strings.ts` — `detectLang`, `resolveLang`, `setLang`.
- `client/main.ts` — aplicação das mudanças.
- `index.html` — `#menu-settings` com as subabas (`#pm-sub-*`) e os controles `#set-*`.

Valores completos também em [[Configuration Reference]].
