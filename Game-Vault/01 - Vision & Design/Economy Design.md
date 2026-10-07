---
title: Economy Design
type: concept
status: documented
area: design
source_paths:
  - shared/weapons.ts
  - shared/data/weapons/rifle_padrao.json
  - shared/data/progression.json
  - server/migrations/001_contas.sql
  - client/world/hauntedTown.ts
  - shared/data/weapons/pistola.json
  - shared/data/weapons/smg.json
  - shared/data/zumbi.json
  - shared/zombies.ts
  - shared/zombieMatch.ts
  - shared/barricades.ts
tags:
  - game
  - design
  - economy
updated: 2026-10-07
---

# Economy Design

> [!important] Não existe no código atual (fora do modo zumbi)
> Não há **moeda salva, loja, preço, premium nem recompensa em moeda** na conta. A única moeda do jogo é o **dinheiro da partida do modo zumbi** (abaixo), que nunca é salvo. Isso foi verificado com buscas por `moeda`, `coin`, `loja`, `shop`, `currency`, `compra`, `purchase`, `price` e `preço` em `client/`, `server/`, `shared/`, `docs/` e no `README.md`, e nas tabelas de `server/migrations/`.

## O que existe no lugar

- **Progressão por XP**: os pontos de abate viram XP da arma que matou, e o tempo vivo, os abates, as opressões e as carpas viram XP da conta. É o único recurso acumulável. Ver [[Progression]].
- **Desbloqueio por uso**: cada nível de arma se libera com XP e traz uma melhoria. As comuns ficam ativas sozinhas; as opcionais se ligam e desligam livremente no Arsenal. Não há custo. A única escolha excludente é dentro de um grupo (as miras do rifle, mina × Dose Dupla) e a arma de cada espaço (um dos sete rifles, uma das sete secundárias, uma das sete facas), que também libera com pontos de uso. Ver [[Weapons]].
- **Recursos de partida** (não persistem): munição (cheia a cada nascimento, um pente por arma), cargas de granada (2, ou 3 com a melhoria Cinto; recarga de 10 s) e bônus temporários do mapa ([[Buffs & Debuffs]], [[Pickups]]).

## Dinheiro da partida (modo zumbi)

O [[Zombie|modo zumbi]] tem uma economia **fechada na partida** ([[ADR - Modo zumbi cooperativo com caixão e raridades]]):

- **Fontes**: $500 ao começar (ou entrar), cada abate de zumbi ($60–120 conforme o tipo, $500 um chefe; +$40 tiro na cabeça, +$60 facada), ajuda (+$25), reanimar um colega (+$100), onda vencida (+$100), chefe derrotado (+$1.000 a $1.500 para o time), repregar tábuas de barricada (+$10 por tábua, até $150 por jogador por onda: o teto evita deixar a horda arrancar tábuas para ganhar dinheiro repregando).
- **Ralos**: o **Caixão Misterioso**, $950 por rodada, que sorteia uma arma de uma raridade — às vezes **danificada** (menos munição, menos dano ou os dois; 25% numa comum, 6% numa lendária), sem reembolso nem conserto ([[ADR - Caixão fixo com armas danificadas]]) — e as **barricadas**, $300 cada para erguer nas cinco brechas do muro; manter é de graça, só custa tempo ([[ADR - Mapa exclusivo e barricadas no modo zumbi]]). A escolha da partida é entre arma (caixão) e controle da horda (barricadas).
- **Autoridade**: online, o servidor credita, cobra e sorteia (`shared/zombieMatch.ts` rodando em `server/modes.ts`); o cliente só mostra.
- **Persistência**: nenhuma. Zera a cada partida, ao sair da sessão e ao entrar de novo. Valores em `shared/data/zumbi.json` (`dinheiroInicial`, `dinheiro`, `tipos.*.dinheiro`, `chefes.*`, `caixa.custo`, `caixa.danificada`, `barricadas`).

## Rastros de uma economia planejada (não usados)

O esquema de dados das armas (`WeaponData` em `shared/weapons.ts`) já tem campos econômicos, preenchidos com zero e **não lidos por nenhum código** (o mesmo vale para `pistola.json` e `smg.json`):

| Campo | Valor em `rifle_padrao.json` | Uso no código |
| --- | --- | --- |
| `preco.moedaJogo` | 0 | nenhum |
| `preco.premium` | 0 | nenhum |
| `desbloqueioNivel` | 1 | nenhum |
| `slotsAcessorio` | `mira`, `cano`, `pente`, `empunhadura` | nenhum |

> [!info] Inferência
> Esses campos e o comentário "section 7 of the design doc" em `shared/weapons.ts` sugerem que o documento de design previa uma moeda do jogo, uma moeda premium, desbloqueio por nível de conta e acessórios de arma. Nada disso está implementado. Em `client/world/hauntedTown.ts`, uma máquina de venda aparece como "a gag for later" (cenário, não loja).

## Se uma economia for criada

- Documentar aqui as fontes e os ralos de cada moeda, e registrar a decisão em `19 - Decisions & Knowledge/Design Decisions/`.
- Persistência: hoje não há tabela para saldo nem para itens ([[Database]], [[Player Data]]).
- Segurança: a regra atual é que **só o servidor credita progresso** ([[Anti Exploit]]), e uma moeda deveria seguir o mesmo princípio.

## Notas relacionadas

[[Progression]] · [[Game Concept]] · [[Items]] · [[Inventory]] · [[Live Game Structure]]
