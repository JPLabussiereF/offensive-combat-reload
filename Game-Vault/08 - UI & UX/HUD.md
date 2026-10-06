---
title: HUD
type: system
status: documented
area: ui
source_paths:
  - client/ui/hud.ts
  - client/ui/corpseTimer.ts
  - client/main.ts
  - index.html
  - client/styles.css
tags:
  - game
  - ui
  - hud
updated: 2026-10-05
---

# HUD

Interface sobreposta durante a partida (`#hud` em `index.html`, classe `Hud` em `client/ui/hud.ts`). Estilo minimalista: sem painéis, texto branco com sombra suave direto sobre o jogo; números na fonte de display (Lilita One). Escondido fora da partida e no menu de pausa.

## Elementos

| Elemento | Posição | O que mostra | Mecânica ligada |
| --- | --- | --- | --- |
| **Retículo dinâmico** (`#crosshair`) | centro | 4 traços + ponto; o espaço entre eles é o **cone de dispersão projetado** da arma (`gap = tan(dispersão)/tan(FOV/2) · altura/2 + 3 px`). Some ao mirar (ADS ≥ 0,6), correr, morrer ou dançar. | [[Weapons]], [[Combat]] |
| **Hitmarker** (`#hitmarker`) | centro | X animado; variantes `hit`, `head` e `kill` (0,18 s; 0,35 s no abate). Vibra o celular (12/40 ms) e o controle. | [[Damage System]] |
| **Luneta** (`#scope`) | tela cheia | Overlay de mira telescópica nos níveis de rifle com ótica de aumento, quando totalmente mirado. | [[Weapons]] |
| **Vinheta** (`#vignette`) | bordas | Avermelha com vida < 30 (`--low`) e pisca ao levar dano (`damageFlash`, intensidade pelo dano; também vibra o controle). | [[Health System]] |
| **Vida** (`#health`) | inferior esquerdo | Número + barra; barra cheia na vida máxima do corpo; classe `low` abaixo de 25; fica rosa com a Cereja do Dragão (`boost`). | [[Health System]], [[Pickups]] |
| **Munição** (`#ammo`) | inferior direito | Pente/reserva; linha de status: "RECARREGANDO…" com barra de progresso, "RECARREGUE" com a tecla (R, glifo do controle, ou nada no celular) quando o pente ≤ 30%, "SEM MUNIÇÃO". Nome da arma embaixo. | [[Weapons]] |
| **Granadas** (`#grenades`) | à esquerda da munição | Um ícone por granada (acesa = disponível); a próxima em recarga **enche de baixo para cima** como barra de progresso (`--p`). | [[Grenades]] |
| **Pavio** (`#cook`) | sob o retículo | Barra do pavio ao "cozinhar" a granada; fica vermelha no último terço. | [[Grenades]] |
| **Aviso de granada** (`#grenade-warn`) | em volta do retículo (raio 96 px) | 💣 + seta apontando para a granada viva mais próxima dentro do raio de dano; mais opaca quanto mais perto. | [[Grenades]] |
| **Placar pessoal** (`#score`) | topo | Pontos, Abates, Precisão (%). Online/bots: números do servidor/gerenciador; offline: contagem local. | [[Scoring]] |
| **Bônus/penalidades** (`#buffs`) | superior esquerdo | Um cartão por efeito: ícone, nome, segundos restantes e barra que esvazia; pisca nos últimos 10 s; efeitos sem tempo dizem "até morrer". No celular viram chips compactos. | [[Buffs & Debuffs]] |
| **Prompt de contexto** (`#prompt`) | centro-baixo | Tecla + texto + barra: "Oprimir {nome}" (barra = tempo restante da janela), "Oprimindo {nome}…" (progresso da dança), "Beber Poção". | [[Humiliation]], [[Interaction System]] |
| **Banner** (`#banner`) | centro | Texto grande animado por 1,8 s: variantes `bird` ("NO PÁSSARO!"), `taunt` ("OPRIMIDO!"), `level` (subida de nível, bônus). | [[Notifications]] |
| **Pop-ups de pontos** (`#popups`) | sob o retículo | "+N Motivo" empilhados (1,6 s) e um total acumulado que some 2 s após o último. | [[Scoring]] |
| **Kill feed** (`#killfeed`) | superior direito | Ver [[Notifications]]. | — |
| **Tela de morte** (`#death`) | centro | Mensagem + "Renascendo em N…". Ver [[Flow - Death and Respawn]]. | [[Respawn]] |
| **Placar** (`#scoreboard`) | centro | Segurando Tab. Ver [[Scoreboard]]. | — |
| **Chat** (`#chat`) | esquerda | Ver [[Chat]]. | — |
| **Status de rede** (`#net-status`) | — | "Sem conexão com o servidor" ou motivo do fechamento (sessão encerrada, conta conectada em outro lugar). | [[Sessions]] |
| **Depuração** (`#debug`) | — | F3: FPS, draw calls, triângulos, GPU, tempos de CPU, qualidade, ping, posição, estado do movimento, dispersão, recuo, TTK. | [[Performance Overview]] |

### Contador sobre corpos (3D)

`CorpseTimer` (`client/ui/corpseTimer.ts`) é um **sprite no mundo 3D** (canvas 160×200 como textura) sobre cada corpo humilhável: anel colorido (verde > 50%, amarelo > 25%, vermelho) com os segundos restantes da janela de humilhação (6 s) e um selo **[E]**; ao terminar, mostra "OPRIMIDO!". Redesenha só quando o segundo ou o segmento do anel mudam. Usado por `client/gameplay/corpse.ts` e `client/entities/dummy.ts`. Ver [[Humiliation]].

> [!warning]
> O selo "E" e o texto "OPRIMIDO!" do `CorpseTimer` estão fixos no código: não seguem a tecla remapeada nem o idioma inglês (o prompt do HUD segue ambos).

## Atualização

- A cada quadro: retículo, prompt, pavio, aviso de granada, barra de recarga, placar (se visível), estado dos botões de toque.
- A 15 Hz: vida, bônus, munição, granadas, placar pessoal, depuração.
- Cada setter compara com o último valor e só altera o DOM quando muda.

## O que não existe

Não há minimapa, radar, bússola, cronômetro de partida nem indicador de objetivo no HUD (verificado em `index.html` e `client/ui/hud.ts`). Ver [[Objectives]].

## Código relacionado

- `client/ui/hud.ts` — classe `Hud` (`setHealth`, `setBoost`, `setBuffs`, `setAmmo`, `setReload`, `setCrosshair`, `setScore`, `hit`, `popup`, `killfeed`, `setGrenades`, `setCook`, `setGrenadeWarning`, `showBanner`, `setPrompt`, `notice`, `setNetStatus`, `damageFlash`, `showDeath`, `setDeathTimer`, `setDebug`, `update`).
- `client/ui/corpseTimer.ts` — `CorpseTimer`.
- `client/main.ts` — `buffs()`, cálculo do retículo e do aviso de granada, laço de atualização do HUD.
- `client/styles.css` — seções "HUD", "Banner, prompt", "Grenades", "Phones and tablets".
