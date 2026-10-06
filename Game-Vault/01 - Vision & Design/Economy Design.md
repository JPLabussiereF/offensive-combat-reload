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
tags:
  - game
  - design
  - economy
updated: 2026-10-06
---

# Economy Design

> [!important] Não existe no código atual
> Não há **moeda, loja, compra, preço, premium nem recompensa em moeda**. Isso foi verificado com buscas por `moeda`, `coin`, `loja`, `shop`, `currency`, `compra`, `purchase`, `price` e `preço` em `client/`, `server/`, `shared/`, `docs/` e no `README.md`, e nas tabelas de `server/migrations/`.

## O que existe no lugar

- **Progressão por XP**: os pontos de abate viram XP da arma que matou, e o tempo vivo, os abates, as opressões e as carpas viram XP da conta. É o único recurso acumulável. Ver [[Progression]].
- **Desbloqueio por uso**: cada nível de arma se libera com XP e traz uma melhoria. As comuns ficam ativas sozinhas; as opcionais se ligam e desligam livremente no Arsenal. Não há custo. A única escolha excludente é dentro de um grupo (luneta × ponto vermelho, frango × sabre, mina × Dose Dupla) e a secundária (pistola ou submetralhadora). Ver [[Weapons]].
- **Recursos de partida** (não persistem): munição (cheia a cada nascimento, um pente por arma), cargas de granada (2, ou 3 com a melhoria Cinto; recarga de 10 s) e bônus temporários do mapa ([[Buffs & Debuffs]], [[Pickups]]).

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
