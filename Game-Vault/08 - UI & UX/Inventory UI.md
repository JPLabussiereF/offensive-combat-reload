---
title: Inventory UI
type: system
status: partial
area: ui
source_paths:
  - client/ui/arsenal.ts
  - client/ui/hud.ts
  - client/ui/customize.ts
  - index.html
tags:
  - game
  - ui
  - inventory
updated: 2026-10-05
---

# Inventory UI

## Não existe no código atual

Não há tela de inventário, mochila, troca de armas em partida nem seleção de loadout por slots (verificado em `index.html`, `client/ui/` e nas ações de input em `client/core/keybinds.ts`: não existe ação de "trocar arma", "inventário" ou roda de armas). O jogador sempre carrega **um rifle, uma faca e granadas**, cada um no nível equipado. Ver [[Inventory]] e [[Items]].

## O que existe no lugar

| Necessidade | Onde está | Nota |
| --- | --- | --- |
| Escolher a "versão" de cada arma | Painel **Arsenal** no menu inicial/pausa e na aba Arsenal da tela inicial (`client/ui/arsenal.ts`) | Um cartão por arma (rifle, faca, granada): ícone e nome do nível equipado, "Nível N/total", barra de XP até o próximo nível ("faltam…" / nível máximo), fichas de todos os níveis (🔒 bloqueado com o XP necessário; clique equipa um desbloqueado) e a descrição do nível sob o mouse. Ver [[Progression]] e [[Weapons]]. |
| Ver munição e granadas | [[HUD]] | Pente/reserva, ícones de granadas com recarga progressiva, nome da arma. |
| Ver efeitos ativos | Painel de bônus do [[HUD]] | Cereja, mira afiada, poções, humanidade, granadas de pato. Ver [[Buffs & Debuffs]]. |
| Itens cosméticos | Editor de personagem (`client/ui/customize.ts`) | Roupas, chapéus, acessórios do catálogo. Ver [[Character Customization]]. |

Equipar um nível no Arsenal chama `progress.equip(arma, nível)` (que grava na conta) e, na partida, o jogo reaplica o loadout (`applyLoadout` em `client/main.ts`), inclusive durante a pausa. Na tela inicial, a aba usa um `Progress` próprio montado do perfil; o jogo lê o perfil de novo ao começar, já com a escolha.

## Código relacionado

- `client/ui/arsenal.ts` — classe `Arsenal`.
- `client/gameplay/progress.ts` — `Progress` (níveis desbloqueados/equipados, XP).
- `shared/progression.ts` — `PROGRESSION`, `PROG_WEAPONS`, `levelInfo`.
