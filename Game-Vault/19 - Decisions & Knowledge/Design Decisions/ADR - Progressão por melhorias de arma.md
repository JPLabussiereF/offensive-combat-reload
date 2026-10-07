---
title: ADR - Progressão por melhorias de arma
type: decision
status: documented
area: design
source_paths:
  - shared/data/progression.json
  - shared/progression.ts
  - shared/arsenal.ts
  - shared/data/weapons/rifle_padrao.json
  - shared/data/weapons/pistola.json
  - shared/data/weapons/smg.json
  - server/progress.ts
  - server/accounts.ts
  - server/session.ts
  - server/migrations/003_melhorias.sql
  - client/gameplay/progress.ts
  - client/ui/arsenal.ts
  - client/main.ts
tags:
  - game
  - decision
  - progression
  - weapons
updated: 2026-10-06
---

# ADR - Progressão por melhorias de arma

> [!info] Substitui
> Esta decisão substitui a parte "cada nível é uma arma diferente" de [[ADR - Progressão de XP por arma]]. A regra de XP por arma (os pontos do abate vão só para a arma que matou, só de eventos validados pelo servidor) continua valendo.

> [!warning] Substituída em parte (06/10/2026)
> [[ADR - Árvore do Arsenal e armas liberadas por nível]] mudou dois pontos desta decisão: as melhorias **comuns** também ligam e desligam no Arsenal (o item 3 abaixo vale para o estado inicial e para a regra de grupo), e a **submetralhadora** só libera com a pistola no nível 3 (o item 1 dizia que as duas secundárias vêm livres). A escolha guardada (item 6) ganhou `desligadas`.

## Contexto

Até aqui, cada nível de arma era uma **arma diferente com nome próprio** (rifle: Remendado com Fita, da Tia do Zap, Pisca-Pisca de Natal… até o Dourado Ostentação; faca: Colher de Pau, Frango de Borracha, Baguete, Peixe, Macarrão, Sabre de Luz). O jogador **equipava um nível** no Arsenal; os atributos subiam um pouco a cada nível, quase sem diferença sentida, e os níveis vinham rápido (rifle completo com ~5.500 pontos). Só existia uma arma de fogo.

## Problema

- O jogador não sentia cada nível: sete passos pequenos e parecidos, e a "nova arma" era quase só visual.
- Não havia variedade de arma de fogo: todo mundo com o mesmo rifle.
- Os próximos modos (corrida armada, zumbi com caixa misteriosa, loadout travado antes da partida) precisam de armas montadas por dados, com uma forma simples de pedir "a arma X com as melhorias Y".

## Opções consideradas

- **Manter os níveis nomeados** e só subir os custos. Não resolve a sensação de progresso nem a falta de armas.
- **Acessórios livres por slot** (mira, cano, pente, empunhadura, como os `slotsAcessorio` previstos no JSON). Mais flexível, mas abre combinações demais para balancear e exige uma loja/inventário que o jogo não tem ([[Economy Design]]).
- **Uma melhoria por nível, com atributos reais** (escolhida): poucos níveis, mais caros, cada um libera uma melhoria que combina com o estilo da arma; melhorias com troca (o silenciador abafa o tiro mas tira dano) são opcionais e o jogador liga/desliga.

## Decisão

1. **Armas**: primária (Rifle Padrão) + **secundária** escolhida no Arsenal (Pistola do Porteiro ou Submetralhadora Liquidificador), faca e granada. Cada arma de fogo tem seu JSON em `shared/data/weapons/`; o campo `slot` decide se ela é primária ou secundária. Troca de arma em partida com tempo de saque (`troca`). Ver [[Weapons]].
2. **Progressão** (`shared/data/progression.json`): cada nível a partir do 2 libera **uma melhoria** (`melhorias[]`), com pontos bem maiores que antes (rifle até 10.000; secundárias, faca e granada até 4.500–6.000). Cada arma tem **quantas melhorias fazem sentido para ela** (rifle 5, as outras 4) e do tipo que combina com ela (a SMG ganha cadência; o rifle, mira, empunhadura, luneta e pente).
3. **Comuns × opcionais**: as comuns ficam ativas assim que liberadas; as `opcional` têm troca e ficam **desligadas** até o jogador ligar no Arsenal. Num mesmo `grupo` só uma opcional fica ligada, e ela substitui as comuns do grupo (a luneta substitui o ponto vermelho; frango × sabre; mina × dose dupla).
4. **Mecânicas preservadas como melhorias**: a mina terrestre e a Dose Dupla viraram melhorias opcionais da granada ([[Land Mines]], [[Grenades]]); o Frango de Borracha e o **Sabre de Luz Paraguaio** viraram formas opcionais da faca ([[Melee]]). O sabre continua existindo como variante da faca (`meleeStats(['sabre'])`), para o modo corrida armada.
5. **API única de atributos** (`shared/arsenal.ts`): `gunStats(arma, melhorias)`, `meleeStats(melhorias)`, `grenadeStats(melhorias)` e `resolveLoadout(escolha, níveis)`. Cliente e servidor usam as mesmas funções. Ver [[Shared Systems]].
6. **O que se guarda**: o XP por arma (como antes) e a **escolha do Arsenal** (`ArsenalChoice`: secundária + opcionais ligadas) em `player_profile.loadout` (JSON validado a cada leitura e escrita). O `equipped_level` antigo fica só para leitura, para montar a escolha de contas antigas.
7. **Migração sem perda** (`003_melhorias.sql`): os pontos de quem já jogava sobem até o limiar do nível novo equivalente ao antigo (rifle e faca 2→2, 3–4→3, 5–6→4, 7→5; granada 2→2, 3→3). Quem usava luneta, sabre, frango, mina ou dose dupla continua com ela ligada (`legacyChoice`).

## Motivo

- Pedido do usuário: "ao evoluir, as armas recebem novos atributos — mais munição, mais cadência, mais dano, mais precisão — conforme o estilo da arma; destravar um silenciador abaixa o som do tiro mas o dano também cai".
- Menos níveis, mais caros, cada um com um efeito que se sente no jogo; trocas reais dão escolha ao jogador.
- Dados em JSON + funções puras deixam os modos futuros montarem armas sem tocar em regras.

## Consequências

- Subir de nível agora é mais lento; o banner de nível mostra a melhoria liberada e, se for opcional, avisa para ligar no Arsenal ([[Notifications]]).
- As melhorias opcionais **não ligam sozinhas**: quem sobe de nível com uma troca precisa decidir.
- Os modelos cômicos que não viraram melhoria (colher, baguete, peixe, macarrão; rifles tia/natal/chamas/ouro; lunetas 2x/4x e holo com lupa) saíram do jogo.
- O protocolo mudou junto (`hit.w`, `kill.arma`, `loadout` com a escolha, `progresso.escolha`, `FLAG.secondary`): cliente e servidor precisam ser publicados juntos ([[Remote Calls]]).
- A migração aumenta o XP de algumas contas (não há rollback do XP no `.down.sql`).

## Código afetado

- `shared/data/progression.json`, `shared/progression.ts`, `shared/arsenal.ts` (novo), `shared/weapons.ts`, `shared/data/weapons/pistola.json` e `smg.json` (novos), `shared/protocol.ts`, `shared/account.ts`
- `server/session.ts`, `server/progress.ts`, `server/accounts.ts`, `server/api.ts`, `server/app.ts`, `server/migrations/003_melhorias.sql`
- `client/main.ts`, `client/gameplay/progress.ts`, `client/ui/arsenal.ts`, `client/ui/hud.ts`, `client/render/viewmodel.ts`, `client/render/weaponModels.ts`, `client/entities/avatar.ts`, `client/entities/heldWeapons.ts`, `client/net/remote.ts`, `client/ai/bot.ts`, `client/ai/bots.ts`

Relacionado: [[Progression]] · [[Weapons]] · [[Inventory UI]] · [[Player Data]] · [[Data Migrations]]
