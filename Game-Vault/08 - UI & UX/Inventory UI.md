---
title: Inventory UI
type: system
status: documented
area: ui
source_paths:
  - shared/modes.ts
  - client/ui/ladder.ts
  - client/ui/arsenal.ts
  - client/ui/arsenalTree.ts
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

Não há mochila nem roda de armas: o jogador carrega sempre **uma primária, uma secundária, a faca e granadas** ([[Inventory]]). A "tela de inventário" é o **Arsenal**, uma árvore onde se vê o que cada arma tem e o que falta liberar, se equipa a secundária e se liga ou desliga qualquer melhoria liberada; em partida, o [[HUD]] mostra as duas armas e a troca é por tecla ([[Weapons]]).

## Arsenal (árvore)

Painel do menu de início/pausa (`#arsenal-grid`) e da aba **Arsenal** da tela inicial (`#home-arsenal`), os dois montados pela classe `Arsenal` (`client/ui/arsenal.ts`) a partir do modelo puro `arsenalTree` (`client/ui/arsenalTree.ts`). Decisão em [[ADR - Árvore do Arsenal e armas liberadas por nível]].

```text
PRINCIPAL   [Rifle ✓ Equipada]
             painel do rifle → melhorias em cadeia: [Ponto vermelho]─[Empunhadura]─[Luneta]─[Pente 🔒]─[Silenciador 🔒]
SECUNDÁRIA  [Pistola ✓ Equipada]──[Submetralhadora 🔒 faltam N pts com a Pistola]
             painel da arma clicada (começa na equipada)
FACA        [Faca ✓]        painel com as formas (frango, sabre…)
GRANADA     [Granada ✓]     painel com mina e dose dupla
```

| Parte | O que mostra |
| --- | --- |
| Linha | Uma por espaço: **Principal** (`PRIMARIES`, hoje só o rifle), **Secundária** (`SECONDARIES`, na ordem em que liberam: pistola, depois submetralhadora), **Faca** e **Granada**. No celular, as cadeias rolam para o lado |
| Nó de arma | Botão com ícone, nome e "✓ Equipada", "Nível N/total" ou, se trancada, "🔒 faltam N pts com {arma}" (borda tracejada). Clicar mostra o painel dela, **inclusive de uma trancada** (ver o que vem) |
| Painel | Ícone, "Nível N/total", nome e: selo **✓ Equipada**, botão **Equipar** (arma liberada e não equipada) ou "Trancada: libera com {arma} no nível N. Faltam X pontos com {arma}." |
| Pontos | Barra laranja e **"Faltam X pontos para o nível N"** (ou "Nível máximo!") |
| Atributos | Nas armas de fogo: barras de Dano, Cadência, Precisão, Alcance e Mobilidade e "Pente N / reserva M", **já com as melhorias em efeito** (`gunStats`) |
| Melhorias | Uma **cadeia em ordem de nível**: ícone, nível, nome e o estado — 🔒 com **os pontos que faltam** (trancada) ou um **interruptor Ligada/Desligada** (liberada, comum ou opcional). Uma comum desligada por causa de uma opcional do grupo mostra "Substituída por {opcional}". Abaixo, fichas com o que ela muda: verdes para o ganho, vermelhas para a troca, amarela "Opcional: tem troca" |
| Descrição | A descrição engraçada da melhoria sob o mouse ou com foco; sem nenhuma, a da arma |

- **Uma por grupo**: ligar uma opcional substitui as comuns do grupo e desliga a outra opcional (luneta × ponto vermelho do rifle; frango × sabre; mina × dose dupla); ligar a comum desliga a opcional do grupo.
- Cada mudança chama `progress.toggle(arma, id, ligada)` ou `progress.setSecondary(arma)` (botão Equipar), que grava na conta (`PATCH /api/perfil {arsenal}`) **um salvamento por vez** (cliques rápidos: só a última escolha que esperava é enviada). Se o salvamento falha (sem internet, servidor recusou), a tela **volta à última escolha que a conta tem** e avisa "Não foi possível salvar o Arsenal" (na tela inicial, na linha de status; no campo de tiro, num aviso do HUD, e as armas na mão voltam junto). Ao entrar numa sessão, a home manda a escolha ao servidor (`loadout` no saguão).
- **Na partida o Arsenal é só leitura** em todo modo de jogo (mata-mata online e contra bots): dá para clicar nas armas e ver as árvores, mas os interruptores ficam desabilitados, não há botão Equipar e aparece o aviso "Equipamento travado durante a partida: aqui você só consulta a árvore…" (`new Arsenal(..., readOnly = true)`). Só no **campo de tiro** ele segue editável, com `applyLoadout(progress.loadout, true)` pondo as armas novas na mão. Ver [[ADR - Equipamento travado no mata-mata]].
- Na **corrida armada** o menu de pausa mostra a **escada** no lugar do Arsenal (`renderLadder`, `client/ui/ladder.ts`) e no **zumbi** o caixão. Ver [[Gun Game]].
- Sem conta, tudo fica no nível 1 e a **submetralhadora aparece trancada** (como numa conta nova); a aba Arsenal da tela inicial é só de quem tem conta, e o visitante vê o Arsenal no menu do campo de tiro, sem salvar nada.
- Na tela inicial, a aba usa um `Progress` próprio montado do perfil; o cartão do personagem mostra os ícones do que vai para a partida (primária, secundária, faca e granada na forma escolhida — `weaponIcon`).
- O foco é preservado entre redesenhos (`data-key`): controle e teclado navegam pelos botões (nós de arma, Equipar e interruptores; ver [[Menus]]).

Textos: nomes, descrições e fichas vêm de `client/ui/strings.ts` (`arma_*`, `upg_<arma>_<id>`, `upgDesc_*`, `fx_*`, `treeRow_*`, `treeEquip`, `treeWeaponLocked*`, `upgradeReplacedBy`, `arsenalSaveFailed`), em pt-BR e inglês; `client/tests/arsenalText.test.ts` confere que nenhuma arma, melhoria ou linha da árvore fica sem texto, e `client/tests/arsenalTree.test.ts` confere o modelo da árvore.

## Em partida

| Necessidade | Onde está | Nota |
| --- | --- | --- |
| Trocar de arma | `1`/`2`, roda do mouse, D-pad ←/→, botão de troca no celular | [[Weapons]], [[Input & Controls]], [[Touch Controls]] |
| Ver munição das duas armas | [[HUD]]: o pente grande da arma na mão e, abaixo, as duas armas com tecla, nome e munição (a da mão acesa; pisca enquanto saca) | `hud.setWeaponSlots` |
| Ver granadas | [[HUD]] | ícones com recarga progressiva |
| Ver efeitos ativos | Painel de bônus do [[HUD]] | [[Buffs & Debuffs]] |
| Itens cosméticos | Editor de personagem (`client/ui/customize.ts`) | [[Character Customization]] |

## Código relacionado

- `client/ui/arsenal.ts` — classe `Arsenal` (desenha a árvore); `weaponName`, `upgradeName`, `weaponLabel`, `weaponIcon`, `effectChips` (usados também no kill feed e na tela inicial).
- `client/ui/arsenalTree.ts` — `TREE_ROWS`, `arsenalTree`, `weaponNode`, `upgradeNodes`: o modelo puro da árvore (linhas, armas, estados e pontos que faltam).
- `client/gameplay/progress.ts` — `Progress` (XP, níveis, `unlocked`, `toUnlock`, `choice`, `loadout`, `toggle`, `setSecondary`, fila de salvamento, `onSaveError`, `settled`, `applyServer`).
- `client/main.ts` — `applyLoadout`, `switchTo`, `holdSlot`.
- `shared/progression.ts`, `shared/arsenal.ts` — dados e atributos ([[Progression]], [[Shared Systems]]).
