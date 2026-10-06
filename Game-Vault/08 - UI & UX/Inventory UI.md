---
title: Inventory UI
type: system
status: documented
area: ui
source_paths:
  - client/ui/arsenal.ts
  - client/ui/hud.ts
  - client/ui/home.ts
  - client/ui/strings.ts
  - client/gameplay/progress.ts
  - client/main.ts
  - client/styles.css
  - index.html
tags:
  - game
  - ui
  - inventory
updated: 2026-10-06
---

# Inventory UI

Não há mochila nem roda de armas: o jogador carrega sempre **uma primária, uma secundária, a faca e granadas** ([[Inventory]]). A "tela de inventário" é o **Arsenal**, onde se escolhe a secundária e se ligam as melhorias opcionais; em partida, o [[HUD]] mostra as duas armas e a troca é por tecla ([[Weapons]]).

## Arsenal

Painel do menu de início/pausa (`#arsenal-grid`) e da aba **Arsenal** da tela inicial (`#home-arsenal`), os dois montados pela classe `Arsenal` (`client/ui/arsenal.ts`). Um cartão por arma, na ordem rifle, pistola, submetralhadora, faca, granada:

| Parte do cartão | O que mostra |
| --- | --- |
| Cabeçalho | Ícone, espaço ("Primária", "Secundária", "Corpo a corpo", "Arremesso"), "Nível N/total" e o nome da arma |
| Secundária | Nas secundárias: o selo "✓ Sua secundária" ou o botão **"Levar como secundária"**; a secundária não escolhida fica esmaecida |
| Pontos | Barra laranja e "X / Y pontos para o nível N" (ou "Nível máximo!") |
| Atributos | Nas armas de fogo: barras de Dano, Cadência, Precisão, Alcance e Mobilidade e "Pente N / reserva M", **já com as melhorias em efeito** (`gunStats`) |
| Melhorias | Uma linha por melhoria: ícone, nível, nome e o estado — 🔒 com os pontos que faltam (bloqueada), "✓ Ativa" (comum liberada), "Substituída" (comum trocada por uma opcional do mesmo grupo) ou um **interruptor Ligada/Desligada** (opcional liberada). Abaixo, fichas com o que ela muda: verdes para o ganho, vermelhas para a troca, amarela "Opcional: tem troca" |
| Descrição | A descrição engraçada da melhoria sob o mouse ou com foco; sem nenhuma, a da arma |

- **Ligar uma opcional** desliga a outra do mesmo grupo (luneta × ponto vermelho do rifle; frango × sabre; mina × dose dupla).
- Cada mudança chama `progress.toggle(arma, id, ligada)` ou `progress.setSecondary(arma)`, que grava na conta (`PATCH /api/perfil {arsenal}`) e, na partida, `applyLoadout(true)` põe as armas novas na mão e avisa o servidor (`loadout`), inclusive durante a pausa. O servidor responde com `progresso` (a escolha como ele guardou).
- Sem conta, só a secundária pode ser trocada, e vale só para a partida.
- Na tela inicial, a aba usa um `Progress` próprio montado do perfil; o cartão do personagem mostra os ícones do que vai para a partida (primária, secundária, faca e granada na forma escolhida — `weaponIcon`).
- O foco é preservado entre redesenhos (controle e teclado podem navegar pelos botões; ver [[Menus]]).

Textos: nomes, descrições e fichas vêm de `client/ui/strings.ts` (`arma_*`, `upg_<arma>_<id>`, `upgDesc_*`, `fx_*`), em pt-BR e inglês; `client/tests/arsenalText.test.ts` confere que nenhuma melhoria fica sem texto.

## Em partida

| Necessidade | Onde está | Nota |
| --- | --- | --- |
| Trocar de arma | `1`/`2`, roda do mouse, D-pad ←/→, botão de troca no celular | [[Weapons]], [[Input & Controls]], [[Touch Controls]] |
| Ver munição das duas armas | [[HUD]]: o pente grande da arma na mão e, abaixo, as duas armas com tecla, nome e munição (a da mão acesa; pisca enquanto saca) | `hud.setWeaponSlots` |
| Ver granadas | [[HUD]] | ícones com recarga progressiva |
| Ver efeitos ativos | Painel de bônus do [[HUD]] | [[Buffs & Debuffs]] |
| Itens cosméticos | Editor de personagem (`client/ui/customize.ts`) | [[Character Customization]] |

## Código relacionado

- `client/ui/arsenal.ts` — classe `Arsenal`; `weaponName`, `upgradeName`, `weaponLabel`, `weaponIcon`, `effectChips` (usados também no kill feed e na tela inicial).
- `client/gameplay/progress.ts` — `Progress` (XP, níveis, `choice`, `loadout`, `toggle`, `setSecondary`, `applyServer`).
- `client/main.ts` — `applyLoadout`, `switchTo`, `holdSlot`.
- `shared/progression.ts`, `shared/arsenal.ts` — dados e atributos ([[Progression]], [[Shared Systems]]).
