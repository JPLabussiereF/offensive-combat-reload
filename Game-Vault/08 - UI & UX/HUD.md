---
title: HUD
type: system
status: documented
area: ui
source_paths:
  - client/ui/ladder.ts
  - client/ui/hud.ts
  - client/ui/corpseTimer.ts
  - client/ui/damageNumbers.ts
  - client/main.ts
  - index.html
  - client/styles.css
  - client/zombies/client.ts
  - client/styles.css
  - index.html
  - client/pets/manager.ts
  - client/pets/portrait.ts
tags:
  - game
  - ui
  - hud
updated: 2026-10-08
---

# HUD

Interface sobreposta durante a partida (`#hud` em `index.html`, classe `Hud` em `client/ui/hud.ts`). Estilo minimalista: sem painéis, texto branco com sombra suave direto sobre o jogo; números na fonte de display (Lilita One). Escondido fora da partida e antes do primeiro JOGAR; no menu de pausa ele **continua na tela**, atrás do véu escuro do menu (o jogo fica visível ao lado do trilho, [[Menus]]). Exceção: no celular, depois de usar o editor de botões ("Ajustar botões") ele fica escondido até voltar ao jogo.

## Elementos

| Elemento | Posição | O que mostra | Mecânica ligada |
| --- | --- | --- | --- |
| **Retículo dinâmico** (`#crosshair`) | centro | 4 traços + ponto; o espaço entre eles é o **cone de dispersão projetado** da arma (`gap = tan(dispersão)/tan(FOV/2) · altura/2 + 3 px`). Some ao mirar (ADS ≥ 0,6), correr, morrer ou dançar. | [[Weapons]], [[Combat]] |
| **Hitmarker** (`#hitmarker`) | centro | X animado; variantes `hit`, `head` e `kill` (0,18 s; 0,35 s no abate). Vibra o celular (12/40 ms) e o controle. | [[Damage System]] |
| **Números de dano** (`#dmg-numbers`) | no ponto do acerto | Número flutuante com o dano de cada tiro que acerta um inimigo (jogador online, bot, boneco, zumbi), **só na tela de quem atirou**. Fonte arredondada (Nunito 900) com contorno escuro grosso; **amarelo** no acerto comum, **laranja** no crítico (dano de cabeça: tiro na cabeça ou qualquer tiro com a poção do crítico) e **vermelho** no pássaro (virilha), cada cor um pouco maior. Um número por alvo em cada disparo (os bagos da garrucha somam), na cor do acerto mais forte, no lugar do primeiro bago. Nasce maior, sobe ~44 px e some em 0,7 s; atravessa paredes; até 24 de uma vez. Não há barra de vida no inimigo. Ver [[#Números de dano]]. | [[Damage System]] |
| **Luneta** (`#scope`) | tela cheia | Overlay de mira telescópica quando o rifle tem uma luneta ligada (2x, a do Vovô 3x ou 4x) e está totalmente mirado. | [[Weapons]] |
| **Vinheta** (`#vignette`) | bordas | Avermelha com vida < 30 (`--low`) e pisca ao levar dano (`damageFlash`, intensidade pelo dano; também vibra o controle). | [[Health System]] |
| **Vida** (`#health`) | inferior esquerdo | Número + barra; barra cheia na vida máxima do corpo; classe `low` abaixo de 25; fica rosa com a Cereja do Dragão (`boost`). | [[Health System]], [[Pickups]] |
| **Munição** (`#ammo`) | inferior direito | Com só o sabre na mão (corrida armada) a contagem, o status e as armas somem e fica o nome da arma (`hud.setMeleeOnly`). Pente/reserva; linha de status: "RECARREGANDO…" com barra de progresso, "RECARREGUE" com a tecla (R, glifo do controle, ou nada no celular) quando o pente ≤ 30%, "SEM MUNIÇÃO". Nome da arma em mãos embaixo (`setWeaponName`, texto de `arma_*` em `strings.ts`). | [[Weapons]] |
| **Armas carregadas** (`#weapon-slots`) | sob a munição | Uma linha por arma de fogo (primária e secundária): a tecla que a seleciona (`1`/`2` ou a remapeada), o nome e `pente/reserva` (no zumbi, o nome da arma do caixão na cor da raridade: verde, azul, roxo, dourado; o nome em mãos também; uma arma **danificada** ganha a etiqueta laranja com o **ícone de rachadura** — com a palavra "Danificada" no nome em mãos, só o ícone na linha). A da mão fica acesa; pisca enquanto é sacada após a troca. No celular, só aparece a arma guardada, sem tecla. `hud.setWeaponSlots`. | [[Weapons]], [[Inventory]] |
| **Granadas** (`#grenades`) | à esquerda da munição | Um ícone por granada (acesa = disponível); a próxima em recarga **enche de baixo para cima** como barra de progresso (`--p`). | [[Grenades]] |
| **Pavio** (`#cook`) | sob o retículo | Barra do pavio ao "cozinhar" a granada; fica vermelha no último terço. | [[Grenades]] |
| **Brechas da horda** (`#zentrances`) | em volta do retículo (raio 132 px) | Só no zumbi, durante a onda: uma bolinha com seta para cada brecha do muro com zumbis chegando (até 10 m fora dela), girada para a brecha em relação à mira; verde (1–2), laranja (3–5) ou vermelha (6+), com o número, ou o símbolo de tábuas (▦) quando a brecha está barricada. `hud.setEntrances` (calculado em `ZombieClient.entrances`, 15 vezes por segundo). | [[Zombie]], [[Map - Cemitério da Capela]] |
| **Aviso de granada** (`#grenade-warn`) | em volta do retículo (raio 96 px) | 💣 + seta apontando para a granada viva mais próxima dentro do raio de dano; mais opaca quanto mais perto. | [[Grenades]] |
| **Escada** (`#ladder`) | topo, sob o placar | Só na corrida armada: "ARMA N/7", o nome do degrau e uma bolinha por abate necessário (verdes as feitas); rosa no Sabre de Luz. `hud.setLadder`. | [[Gun Game]] |
| **Fim de rodada** (`#round-end`) | centro-alto | Cartão do vencedor ("{nome} venceu a corrida armada!" / "VOCÊ VENCEU…", laranja) e "Nova rodada em N…". `hud.showRoundEnd`. | [[Gun Game]] |
| **Onda** (`#zwave`) | topo, sob o placar | Só no zumbi: "ONDA 3/12 · 14 zumbis" (vermelho numa onda de chefe), "A HORDA VEM AÍ em Ns · ache o caixão!", "INTERVALO · próxima onda em Ns" ou "FIM DA PARTIDA"; com chefe vivo, o nome dele e uma **barra de vida** (pulsa com a fúria do Prefeito). `hud.setZombie`. | [[Zombie]] |
| **Dinheiro** (`#zmoney`) | sobre a vida | Só no zumbi: "$ 1.250", salta quando sobe. `hud.setMoney`; os ganhos aparecem nos pop-ups como "+$100 Tiro na cabeça" (`hud.cash`). | [[Zombie]], [[Economy Design]] |
| **Pet** (`#zpet`) | ao lado do dinheiro; no celular, o primeiro chip da fileira de efeitos (`.buff.forever`) | Só no zumbi e só para o dono: um círculo com o **rosto do pet** (retrato 2D, `client/pets/portrait.ts`) num **anel de recarga** na cor da coleira; pulsa enquanto o pet age, brilha quando está pronto, mostra as cargas da gata e **pisca com um texto curto** quando ele age ("Segurou!", "Pato!", "Pedrada!", "Tábua!", "Rabo!", "Levantando…", "De pé!"). **Não é botão** (o pet age sozinho). `hud.setPet`. | [[Pets]] |
| **Resumo da partida zumbi** (`#zsummary`) | centro | "SOBREVIVERAM À HORDA!" / "A HORDA VENCEU", onda e tempo, uma linha por jogador (abates, na cabeça, dinheiro, caiu, reanimou, XP) e "Nova partida em Ns…". `hud.showZombieSummary`. | [[Zombie]] |
| **Placar pessoal** (`#score`) | topo | Pontos, Abates, Precisão (%). Online/bots: números do servidor/gerenciador; offline: contagem local. | [[Scoring]] |
| **Bônus/penalidades** (`#buffs`) | superior esquerdo | Um cartão por efeito: ícone, nome, segundos restantes e barra que esvazia; pisca nos últimos 10 s; efeitos sem tempo dizem "até morrer". No celular viram chips compactos. | [[Buffs & Debuffs]] |
| **Prompt de contexto** (`#prompt`) | centro-baixo | Tecla + texto + barra: "Oprimir {nome}" (barra = tempo restante da janela), "Oprimindo {nome}…" (progresso da dança), "Beber Poção". No zumbi: "Caixão Misterioso: arma aleatória por $950" (ou "…você tem $N"), "Girando…", "Pegar {arma} ({raridade})" ou "Pegar {arma} ({raridade}) · DANIFICADA: menos munição" (barra = tempo da oferta), "Segure para reanimar {nome}" / "Reanimando {nome}…"; nas brechas: "Segure para erguer a barricada: Brecha Oeste ($300)" (ou "Barricada: $300 (você tem $N)"), "Erguendo a barricada…", "Segure para pregar tábuas (2/5)" / "Pregando tábuas (2/5)…" (barra = progresso da tábua), "Passagem ocupada: ninguém pode estar no vão". | [[Humiliation]], [[Interaction System]], [[Zombie]] |
| **Banner** (`#banner`) | centro | Texto grande animado por 1,8 s: variantes `bird` ("NO PÁSSARO!", "Esfaqueado! Voltou para…"), `taunt` ("OPRIMIDO!"), `level` (subida de nível, bônus, "Próxima arma: …", "SABRE DE LUZ!", "Nova rodada…"), `flaw` (laranja, menor e com quebra de linha: "Saiu DANIFICADA: menos dano", "Você pegou: {arma} ({raridade}) · DANIFICADA"). | [[Notifications]] |
| **Pop-ups de pontos** (`#popups`) | sob o retículo | "+N Motivo" empilhados (1,6 s) e um total acumulado que some 2 s após o último. | [[Scoring]] |
| **Kill feed** (`#killfeed`) | superior direito | Ver [[Notifications]]. | — |
| **Tela de morte** (`#death`) | centro | Mensagem + a **figurinha em destaque e o título de quem te matou** (`#death-showcase`, `hud.setDeathShowcase`; [[Achievements]]) + "Renascendo em N…". Ver [[Flow - Death and Respawn]]. No zumbi também serve para **caído** ("CAÍDO!" + "Um amigo pode te reanimar · sangra em Ns", "{nome} está te reanimando!" ou, com a gata, "A gata está te levantando · Ns", com batimento cardíaco e a câmera rente ao chão) e para quem morreu numa onda ("Você volta no intervalo"). `hud.setDeathText`. | [[Respawn]], [[Zombie]] |
| **Penas dos corvos** (`#crows`) | bordas da tela | Zumbi: penas pretas balançando enquanto os corvos te bicam (você ficou 3 s numa árvore). `hud.setCrows`. Ver [[Zombie]]. | — |
| **Assistindo** (`#spectate`) | embaixo, no centro | Zumbi online, fora da onda: "ASSISTINDO", o nome do colega, a vida dele (ou "Caído: precisa de ajuda!") e "[D] anterior · [F] próximo" (LB/RB no controle; no celular, as setas ◀ ▶ são tocáveis). Enquanto aparece, a tela de morte perde o vermelho e sobe para o topo (`#death.spectating`), e a barra de vida mostra a do colega. `hud.setSpectate`. Ver [[Zombie]]. | — |
| **Placar** (`#scoreboard`) | centro | Segurando Tab. Ver [[Scoreboard]]. | — |
| **Chat** (`#chat`) | esquerda | Ver [[Chat]]. | — |
| **Status de rede** (`#net-status`) | — | "Sem conexão com o servidor" ou motivo do fechamento (sessão encerrada, conta conectada em outro lugar). | [[Sessions]] |
| **Depuração** (`#debug`) | — | F3: FPS, draw calls, triângulos, GPU, tempos de CPU, qualidade, ping, posição, estado do movimento, dispersão, recuo, TTK. | [[Performance Overview]] |

### Números de dano

`DamageNumbers` (`client/ui/damageNumbers.ts`) é uma camada **DOM** dentro do `#hud`: cada número guarda o ponto do acerto no mundo e é projetado na câmera a cada quadro (`update`, chamado ao lado de `hud.update` em `client/main.ts`); atrás da câmera fica invisível. Elementos reaproveitados (pool), no máximo 24 vivos.

O número sai **do próprio cliente**, no gancho `shoot`, sem mensagem de rede nova; ninguém além do atirador recebe nada. De onde vem cada valor:

| Alvo | Valor mostrado |
|---|---|
| Boneco do campo de tiro, bot | o dano realmente aplicado (`Dummy.applyHit` → `damage`, `BotManager.hit` → `dealt`) |
| Jogador online | **previsão** com a mesma fórmula do servidor (`computeDamage` + `critRegion`), limitada à vida que o último snapshot deu ao alvo (`RemotePlayer.health`) |
| Zumbi | **previsão** com a fórmula do modo (`ZombieClient.shot` → `gunDamageToZombie`, com o multiplicador da raridade/defeito da arma), limitada a `ZombieClient.healthOf`: a vida do chefe (vem no `zsnap`) ou, num zumbi comum (cuja vida não chega ao cliente), a vida cheia do tipo na onda |

Por isso o pássaro mostra a vida que o alvo tinha (ex.: 100), não o `LETHAL_DAMAGE` de 9999. Como o hitmarker, a previsão aparece na hora: se o servidor recusar o acerto ([[Validation]]), o número já foi mostrado. Num zumbi comum já ferido, o pássaro mostra a vida cheia do tipo, não o que restava.

Regras puras e testadas ([[Unit Tests]]): `damageTier` (cor), `ShotDamage` (um número por alvo por disparo, soma com teto), `numberPose` (subida, escala, opacidade).

### Contador sobre corpos (3D)

`CorpseTimer` (`client/ui/corpseTimer.ts`) é um **sprite no mundo 3D** (canvas 160×200 como textura) sobre cada corpo humilhável: anel colorido (verde > 50%, amarelo > 25%, vermelho) com os segundos restantes da janela de humilhação (6 s) e um selo **[E]**; ao terminar, mostra "OPRIMIDO!". Redesenha só quando o segundo ou o segmento do anel mudam. Usado por `client/gameplay/corpse.ts` e `client/entities/dummy.ts`. Ver [[Humiliation]].

> [!warning]
> O selo "E" e o texto "OPRIMIDO!" do `CorpseTimer` estão fixos no código: não seguem a tecla remapeada nem o idioma inglês (o prompt do HUD segue ambos).

## Atualização

- A cada quadro: retículo, prompt, pavio, aviso de granada, barra de recarga, placar (se visível), estado dos botões de toque.
- A 15 Hz: vida, bônus, munição, granadas, placar pessoal, depuração.
- Cada setter compara com o último valor e só altera o DOM quando muda.

## O que não existe

Não há minimapa, radar, bússola, cronômetro de partida nem indicador de objetivo no HUD (as contagens entre rodadas da corrida armada e as do zumbi são as únicas de partida) (verificado em `index.html` e `client/ui/hud.ts`). No zumbi, uma **cruz vermelha 3D** sobre cada colega caído é vista através das paredes (com uma **pata na cor da coleira** em cima enquanto a gata dele o levanta, e a pata do pet sobre o zumbi em que ele agiu, por até 1,5 s: [[Pets]]), o caixão tem um feixe de luz visível de longe, cada zumbi que vai sair do chão acende um **feixe verde** no ponto (0,9 s antes) e as setas das brechas apontam por onde a horda está chegando. Ver [[Objectives]].

## Código relacionado

- `client/ui/hud.ts` — classe `Hud` (`setHealth`, `setBoost`, `setBuffs`, `setAmmo`, `setWeaponName`, `setWeaponSlots`, `setReload`, `setCrosshair`, `setScore`, `hit`, `popup`, `killfeed`, `setGrenades`, `setCook`, `setGrenadeWarning`, `showBanner`, `setPrompt`, `notice`, `setNetStatus`, `damageFlash`, `showDeath`, `setDeathTimer`, `setDebug`, `update`; zumbi: `setZombie`, `setMoney`, `cash`, `showZombieSummary`, `setZombieSummaryNext`, `setDeathText`, `setEntrances`; `setWeaponName(nome, raridade, danificada)` e `setWeaponSlots` com `damaged`).
- `client/zombies/client.ts` — o que o HUD do zumbi mostra (`renderHud`, `prompt`, `coffinPrompt`, `barricadePrompt`, `entrances`, marcadores de colegas caídos).
- `client/ui/corpseTimer.ts` — `CorpseTimer`.
- `client/ui/damageNumbers.ts` — `DamageNumbers`, `damageTier`, `ShotDamage`, `numberPose`.
- `client/main.ts` — `buffs()`, cálculo do retículo e do aviso de granada, laço de atualização do HUD.
- `client/styles.css` — `#dmg-numbers`/`.dmg-num` (números de dano), seções "HUD", "Banner, prompt", "Grenades", "Phones and tablets".
