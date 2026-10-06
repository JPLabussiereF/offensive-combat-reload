---
title: ADR - Árvore do Arsenal e armas liberadas por nível
type: decision
status: documented
area: design
source_paths:
  - shared/data/progression.json
  - shared/progression.ts
  - shared/arsenal.ts
  - server/accounts.ts
  - server/progress.ts
  - client/gameplay/progress.ts
  - client/ui/arsenal.ts
  - client/ui/arsenalTree.ts
  - client/ui/home.ts
  - client/main.ts
  - client/ui/strings.ts
  - client/styles.css
tags:
  - game
  - decision
  - progression
  - weapons
  - ui
updated: 2026-10-06
---

# ADR - Árvore do Arsenal e armas liberadas por nível

> [!info] Substitui em parte
> Esta decisão muda dois pontos de [[ADR - Progressão por melhorias de arma]]: **as melhorias comuns deixam de ser sempre ativas** (o jogador desliga qualquer melhoria liberada) e **nem toda arma vem liberada** (a submetralhadora espera a pistola). O resto daquela ADR continua valendo, assim como [[ADR - Equipamento travado no mata-mata]].
>
> Origem: issue PF-7 do Jira ("Troca de armas do Arsenal"), com as decisões P1 a P15 respondidas pelo dev em 06/10/2026 (plano "PF-7 PLANO" no Confluence, espaço PF).

> [!warning] Substituída em parte (06/10/2026, PF-8)
> [[ADR - Rifles e facas antigos como armas próprias]] mudou dois pontos: a **primária** deixou de ser só o Rifle Padrão (item 2: voltaram seis rifles, e a linha Faca ganhou seis facas, todos com o botão Equipar) e a **trava** saiu de `progression.json` para o JSON de cada arma, em pontos (item 3: a submetralhadora agora é `"libera": { "arma": "pistola", "pontos": 1800 }` em `smg.json`, o mesmo nível 3). O resto continua valendo.

## Contexto

O Arsenal mostrava um cartão por arma, lado a lado. A única troca de arma era um botão pequeno "Levar como secundária" no cartão da secundária fora de uso; o rifle não tinha controle nenhum. Só as melhorias opcionais tinham interruptor, e nada mostrava que ainda havia armas por vir.

## Problema

- O jogador não achava como trocar de arma ("não existe uma opção para trocar as armas, ou se existe está escondido") e não sabia "quais armas hão de vir".
- A issue pede ver a árvore de cada arma, quanto falta para liberar cada uma e ativar/desativar cada customização.

## Opções consideradas

- **Arma principal**: só o rifle (escolhida) × qualquer arma em qualquer espaço × criar uma arma principal nova na mesma tarefa.
- **Liberar armas**: pela arma anterior do mesmo espaço (escolhida, como no desenho da issue) × pelo nível da conta (o campo `desbloqueioNivel` do JSON) × nenhuma trava.
- **Ligar/desligar**: todas as melhorias liberadas (escolhida) × só as opcionais, como antes × todas, com limite por arma.
- **Tela**: árvore como no desenho, com uma linha a mais para a granada (escolhida) × sem a granada × manter os cartões com um botão Equipar.
- **Trocar na partida**: não, só fora dela (escolhida) × sim, valendo ao renascer.

## Decisão

1. **Árvore**: uma linha por espaço (Principal, Secundária, Faca, Granada), as armas da linha em sequência e, abaixo da arma clicada, as melhorias em cadeia na ordem dos níveis. Clicar numa arma só mostra; o botão **Equipar** a põe no espaço. Arma e melhoria trancadas mostram **quantos pontos faltam**. Ver [[Inventory UI]].
2. **Primária**: continua só o Rifle Padrão. Arma nova é outra tarefa; a árvore mostra só armas que existem.
3. **Trava de arma** (`libera` em `shared/data/progression.json`): a **submetralhadora** libera com a **pistola no nível 3 (1.800 pontos)**. Quem **já fez qualquer ponto com a submetralhadora** fica com ela (`weaponUnlocked`). Sem conta, tudo no nível 1: a submetralhadora aparece trancada. Os bots continuam sorteando qualquer arma.
4. **Comuns desligáveis**: toda melhoria liberada liga e desliga. As comuns ligam sozinhas ao liberar; as opcionais começam desligadas. **Uma por grupo**: uma opcional ligada substitui as comuns do grupo, e ligar a comum desliga a opcional.
5. **O que se guarda**: a `ArsenalChoice` ganha `desligadas` (comuns desligadas por arma), no mesmo `player_profile.loadout` (jsonb). Sem migration. O servidor limpa a escolha com o **XP de cada arma** (`sanitizeChoice(raw, xp)`): secundária trancada vira a pistola, melhoria não liberada sai; pela API, a requisição inteira é recusada (`400 nivel_bloqueado`).
6. **Salvar**: um salvamento por vez; se falha, a tela volta à última escolha da conta e avisa.
7. **Na partida** continua só leitura (dá para olhar as árvores); a troca é na tela inicial ou no campo de tiro.
8. **Aviso de liberação**: quando a pistola chega ao nível 3, além do banner de nível aparece "Submetralhadora Liquidificador liberada: equipe no Arsenal"; ela não entra sozinha no espaço.

## Motivo

- É o que a issue pede, com o desenho anexado a ela (arma → arma 02; melhorias em cadeia abaixo de cada arma).
- A trava pela arma anterior dá um caminho visível de armas sem criar economia nem loja ([[Economy Design]]); quem já usava a submetralhadora não perde nada.
- Desligar comuns devolve a escolha ao jogador (ex.: mira de ferro em vez do ponto vermelho) sem mexer no balanceamento: os valores das melhorias não mudaram.

## Consequências

- Contas que tinham a submetralhadora salva, mas nunca fizeram ponto com ela e têm a pistola abaixo do nível 3, voltam para a pistola.
- O protocolo só ganhou um campo opcional (`desligadas` dentro da `ArsenalChoice` de `loadout` e `progresso`); um cliente antigo que não manda o campo é tratado como "nenhuma comum desligada" ([[Remote Calls]]).
- Testes que escolhiam a submetralhadora com conta zerada passaram a dar 1 ponto de submetralhadora à conta de teste.
- O `desbloqueioNivel` dos JSONs das armas continua sem uso ([[Technical Debt]]).

## Código afetado

- `shared/data/progression.json` (`libera` da smg), `shared/progression.ts` (`WeaponXp`, `NO_XP`, `levelsOfXp`, `weaponUnlocked`, `pointsToUnlock`, `ArsenalChoice.desligadas`, `sanitizeChoice(raw, xp)`, `activeUpgrades(…, off)`), `shared/arsenal.ts` (`resolveLoadout` com `desligadas`)
- `server/accounts.ts` (`weapons`, `setArsenal` com o XP), `server/progress.ts` (`xpOf`, `equip`)
- `client/gameplay/progress.ts`, `client/ui/arsenalTree.ts` (novo), `client/ui/arsenal.ts`, `client/ui/home.ts`, `client/main.ts`, `client/ui/strings.ts`, `client/styles.css`
- Testes: `server/tests/arsenal.test.ts`, `auth.test.ts`, `game.test.ts`, `modes.test.ts`, `progression-modes.test.ts`; `client/tests/offlineModes.test.ts`, `arsenalText.test.ts`, `arsenalTree.test.ts` (novo)

Relacionado: [[Progression]] · [[Weapons]] · [[Inventory UI]] · [[Player Data]] · [[Validation]]
