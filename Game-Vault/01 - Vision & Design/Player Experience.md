---
title: Player Experience
type: concept
status: partial
area: design
source_paths:
  - README.md
  - client/main.ts
  - client/ui/strings.ts
  - client/ui/home.ts
  - client/ui/hud.ts
  - client/ui/scoreboard.ts
  - client/core/keybinds.ts
  - shared/appearance.ts
  - client/ui/arsenal.ts
tags:
  - game
  - design
  - ux
updated: 2026-10-07
---

# Player Experience

Esta nota descreve a **experiência pretendida** e como o jogo a entrega. Os detalhes de interface ficam em [[UI Overview]], e os fluxos passo a passo em [[Flow - First Access]], [[Flow - Join Online Match]] e [[Flow - Death and Respawn]].

> [!warning] Inferência
> Os objetivos de experiência ("o que o jogador deve sentir") são inferidos das regras e dos textos do jogo. Os mecanismos listados em cada um são código confirmado.

## 1. Entrar rápido, sem barreira

- A home oferece três caminhos: **Jogar online** (exige conta), **Contra bots** e **Treino** (estes dois funcionam sem conta e sem servidor). Sem conta, o jogador recebe um nome engraçado aleatório ("Recruta Pimpolho", "Cabo Chinelo"…).
- O mapa só é montado depois da escolha. A tela de carregamento mostra dicas cômicas ("Dica: os flamingos não têm culpa de nada.").
- No celular, ao tocar em Jogar, o jogo entra em tela cheia e trava na horizontal. Em pé, aparece "Gire o celular".

## 2. Tiro que "responde"

O jogo dá um retorno claro a cada ação:
- **Hitmarker** (diferente na cabeça e na virilha), som de acerto e vibração do controle e do celular (Android).
- **Pop-ups de pontos** para cada prêmio ("Abate +100", "Tiro na cabeça +50"…). Ver [[Scoring]] e [[HUD]].
- No abate: "ding", "boing" e **confete**. O tiro na virilha mostra a faixa **"NO PÁSSARO!"** com som de pássaro.
- O retículo é dinâmico (mostra a dispersão), e o HUD tem um indicador de granada próxima.

## 3. Humilhar e ser humilhado

- Depois do abate, o corpo mostra um **timer de 6 s**. Perto dele, aparece o aviso "Oprimir {nome}" (tecla `E`, △/Y no controle, toque no próprio aviso no celular).
- A dança é em **terceira pessoa**, com música. Ao completar, toca uma buzina e aplausos, cai confete e aparece a faixa **"OPRIMIDO!"**.
- A vítima vê na tela de morte quem a matou e com qual arma ("{nome} te eliminou com {arma}"). Se alguém dança no corpo dela, vê "{nome} 💃 OPRIMIDO!". O respawn de 5 s online existe para que ela assista ([[ADR - Atraso de respawn de 5 s online]]).
- Ver [[Humiliation]].

## 4. Humor constante

- Mensagens de morte por causa: queda ("A calçada mandou lembranças."), vazio, a própria granada ("Você cozinhou demais. A granada, e você.") e a cachorra ("A Amora não gostou da visita.").
- Nomes de bots ("Capitão Lag", "Vovó Turbo"), armas e melhorias absurdas (Pistola do Porteiro, Silenciador de Batata) e gags nos mapas ([[Map Gags]]).
- Chat rápido no celular: "GG", "Boa!", "Kkkkk", "Bora x1?"… ([[Chat]]).

## 5. Sentir-se dono do personagem

- O editor de personagem funciona no estilo "Criar um Sim" ([[Character Customization]]). Online, cada um aparece como se personalizou, inclusive o corpo caído.
- **Modo PCD**: o jogador pode ter um membro ausente, com efeito real no jogo (recarga ×1,3 sem braço ou mão, velocidade ×0,75 sem perna, sem hitbox no membro ausente). A altura e o biotipo são só visuais para não criar vantagem ([[ADR - Altura e biotipo apenas visuais]]).

## 6. Evoluir jogando do seu jeito

- Cada arma evolui com os próprios abates, e cada nível libera uma melhoria. A faixa mostra o ícone e o nome dela ("🔴 Rifle Padrão nível 2: Mira de Ponto Vermelho da Feira!"); se a melhoria é opcional, aparece também o aviso "Ligue no Arsenal". Ver [[Progression]] e [[Notifications]].
- O Arsenal deixa escolher a secundária (uma das sete) e ligar ou desligar as melhorias opcionais já liberadas ([[Inventory UI]]).

## 7. Conforto e acessibilidade

- Teclas remapeáveis, sensibilidade (geral e na mira), FOV, inverter Y, volume e modo de som (3D/estéreo) ([[Settings]], [[Input & Controls]]).
- [[Aim Assist]] opcional para toque e controle (nunca para o mouse).
- Agachar fica só no `C`: o `Ctrl` ficou de fora porque `Ctrl+W` fecha a aba (decisão no README).
- Offline, o mundo **pausa** com o menu. Online ele continua ("os outros jogadores não esperam").

## Pontos fracos conhecidos da experiência

- **Sem fim de partida**: não há vitória, pódio nem "próxima partida". O placar da sessão só cresce ([[Problem - Partidas sem fim]]).
- **Bots só offline**: as sessões online vazias ficam sem oponentes ([[Versus Bots]]).
- **Sem proteção de nascimento online** (existe só contra bots) ([[Respawn]]).

## Notas relacionadas

[[Game Concept]] · [[Core Pillars]] · [[Core Loop]] · [[UI Overview]] · [[Audio Overview]] · [[Visual Effects]]
