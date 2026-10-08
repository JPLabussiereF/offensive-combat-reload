---
title: ADR - Modo zumbi cooperativo com caixão e raridades
type: decision
status: documented
area: design
source_paths:
  - shared/data/zumbi.json
  - shared/zombies.ts
  - shared/zombieMatch.ts
  - shared/modes.ts
  - server/modes.ts
  - server/session.ts
  - client/main.ts
tags:
  - decision
  - adr
  - design
  - modes
  - zombies
  - economy
updated: 2026-10-06
---

# ADR - Modo zumbi cooperativo com caixão e raridades

> [!note] Atualizações (2026-10-06)
> - **O mapa** (item 1) mudou: o modo agora é jogado só no [[Map - Cemitério da Capela]], mapa exclusivo dele, com barricadas nas brechas do muro ([[ADR - Mapa exclusivo e barricadas no modo zumbi]]). A Vila Assombrada voltou a ser só versus.
> - **O pato de borracha** (item 3) foi **substituído** por armas danificadas, e o caixão não muda mais de lugar ([[ADR - Caixão fixo com armas danificadas]]).
> O texto abaixo é o da decisão original, mantido como histórico.

## Contexto

Pedido do usuário: um modo de ondas de zumbis em que cada zumbi morto dá XP a quem matou e um valor em dinheiro; o dinheiro compra, dentro da partida, uma arma aleatória (primária ou secundária) numa caixa; todos começam com a primária inicial e precisam comprar armas para progredir. O jogo tem só três armas de fogo (rifle, pistola, submetralhadora) e as melhorias de arma mexem em cadência, mira, pente e manejo, quase nunca em dano ([[ADR - Progressão por melhorias de arma]]).

## Problema

Como fazer a caixa ser de fato a progressão do modo com tão poucas armas, sem quebrar o modelo do jogo (XP só do servidor, Arsenal da conta, modos com regras declaradas), e com regras claras de morte num modo em equipe?

## Opções consideradas

- **Usar o Arsenal da conta** (como o mata-mata). Quem tem a conta avançada começa forte e a caixa vira enfeite; o pedido diz que todos começam com a primária inicial.
- **Caixa que só dá melhorias** (combos). Com 3 armas, a diferença de poder seria pequena: a horda cresce e a arma não acompanha.
- **Raridade que multiplica o dano contra zumbis** (escolhida), como os modos de zumbi recentes: cada prêmio é uma arma com melhorias fixas e uma raridade.
- Morte: **renascer no tempo** (como o mata-mata) tira a tensão; **caído + reanimar** dá motivo para jogar junto.

## Decisão

1. **Cooperativo**, só na [[Map - Vila Assombrada]] (`MODE_RULES.zumbi`: `coop: true`, `maps: ['halloween']`): sem fogo amigo, sem opressão de colegas, sem mexer nas estatísticas de abates/mortes da conta.
2. **Começo igual para todos**: Rifle Padrão sem melhorias, faca comum, 2 granadas básicas (devolvidas no intervalo). **Revisão (2026-10-07):** o começo passou a ser só a **Pistola do Porteiro** sem melhorias (na mão da primária), e o Rifle Padrão entrou no caixão como arma comum: o começo fica mais apertado e o primeiro giro no caixão vale mais (ver [[Zombie]]). O Arsenal e as melhorias da conta **não valem** no modo (`weapons: 'mode'`, `lockedLoadout`).
3. **O Caixão Misterioso** ($950, sorteio no servidor): 15 prêmios em 4 raridades (50/32/14/4%) que multiplicam o dano contra zumbis (×1,4 / ×1,9 / ×2,6 / ×3,5); a arma vai para o lugar dela e substitui a que estava lá; nunca repete a que já está na mão; o pato de borracha devolve o dinheiro e muda o caixão de lugar (contra quem gira sem parar no mesmo canto).
4. **Dinheiro só da partida** (nunca salvo): abate, tiro na cabeça, facada, ajuda, reanimar, onda vencida, chefe.
5. **XP só de conta** (`weaponXp: false`), como na [[Gun Game]]: as armas são do modo, e o PvE não pode virar atalho para as melhorias do PvP. Valores calibrados para uma partida vencida de ~30 min render ~1,3× o XP de um mata-mata do mesmo tempo.
6. **12 ondas, 3 chefes** (ondas 4, 8 e 12) com golpes telegrafados que se esquivam (sair do anel, sair da faixa da investida, pular a onda de choque) e 4 variantes de zumbi com papéis distintos (rápido, explosivo, tanque, à distância).
7. **Caído → reanimar → sangrar**: vida a zero numa onda derruba (30 s); um colega reanima segurando E (3 s, ganha $100); sangrou, volta no intervalo sem as armas do caixão. Ninguém de pé = derrota; sobreviver à onda 12 = vitória (+250 XP).
8. **Jogo solo offline** com o mesmo motor ([[ADR - Zumbis simulados no servidor sobre navmesh pré-gerada]]), sem XP; sozinho, cair é perder.

## Motivo

- A raridade dá à caixa um peso claro (o rifle inicial fica fraco por volta da onda 6–7; raras seguram até a 9; épicas e lendárias são para o fim e os chefes) sem tocar nos atributos das armas dos outros modos.
- Começo igual deixa o modo justo para contas novas e antigas e mantém a caixa como progressão.
- Caído/reanimar transforma o modo em jogo de equipe e dá peso à morte sem tirar o jogador por muito tempo.

## Consequências

- O primeiro sistema de **moeda** do jogo é da partida e não persiste; a [[Economy Design]] continua sem moeda salva.
- `Session` ganhou o estado `downed` e a regra `coop`; `ModeRules` ganhou `coop` e `maps` (o lobby só cria salas do modo nos mapas dele).
- O equilíbrio (vida por onda, preços, chances) está todo em `shared/data/zumbi.json` e ainda não foi testado com jogadores reais.
- Só um mapa por enquanto.

## Código afetado

`shared/data/zumbi.json`, `shared/zombies.ts`, `shared/zombieMatch.ts`, `shared/modes.ts`, `server/modes.ts`, `server/session.ts`, `server/app.ts`, `client/main.ts`, `client/zombies/*`, `client/ui/*`.

Relacionado: [[Zombie]] · [[Game Modes Index]] · [[Progression]] · [[Weapons]] · [[ADR - Modos de jogo com regras declaradas e ganchos no servidor]]
