---
title: ADR - Rifles e facas antigos como armas próprias
type: decision
status: documented
area: design
source_paths:
  - shared/data/weapons/rifle_fita.json
  - shared/data/weapons/rifle_tia.json
  - shared/data/weapons/rifle_natal.json
  - shared/data/weapons/rifle_chama.json
  - shared/data/weapons/rifle_vovo.json
  - shared/data/weapons/rifle_ouro.json
  - shared/data/weapons/colher.json
  - shared/data/weapons/frango.json
  - shared/data/weapons/baguete.json
  - shared/data/weapons/peixe.json
  - shared/data/weapons/macarrao.json
  - shared/data/weapons/sabre.json
  - shared/data/weapons/smg.json
  - shared/data/progression.json
  - shared/weapons.ts
  - shared/progression.ts
  - shared/arsenal.ts
  - shared/protocol.ts
  - shared/gunGame.ts
  - shared/zombies.ts
  - server/session.ts
  - server/modes.ts
  - client/ui/arsenalTree.ts
  - client/ui/arsenal.ts
  - client/gameplay/progress.ts
  - client/render/weaponModels.ts
  - client/audio/sfx.ts
  - client/ai/bot.ts
  - client/main.ts
  - client/ui/strings.ts
tags:
  - game
  - decision
  - progression
  - weapons
updated: 2026-10-06
---

# ADR - Rifles e facas antigos como armas próprias

> [!info] Substitui em parte
> - De [[ADR - Árvore do Arsenal e armas liberadas por nível]]: o item 2 ("a primária continua só o Rifle Padrão") e o lugar da trava (`libera` sai de `progression.json` e vai para o JSON de cada arma, em pontos).
> - De [[ADR - Progressão por melhorias de arma]]: o Frango de Borracha e o Sabre de Luz deixam de ser **formas** (melhorias do grupo `forma`) e voltam a ser **facas próprias**; a pintura deixa de vir das melhorias (cada rifle tem a sua); e a consequência "os modelos cômicos que não viraram melhoria saíram do jogo" é desfeita.
>
> O resto das duas decisões continua valendo: uma melhoria por nível, comuns e opcionais desligáveis, uma por grupo, XP só da arma que matou, escolha travada no mata-mata ([[ADR - Equipamento travado no mata-mata]]).
>
> Origem: issue PF-8 do Jira ("Armas antigas de volta"), com as decisões P1 a P17 respondidas pelo dev em 06/10/2026 (plano "PF-8 PLANO" no Confluence, espaço PF).

## Contexto

Nas primeiras versões do jogo cada nível de arma era uma arma nomeada: seis rifles depois do Padrão (Remendado com Fita, da Tia do Zap, Pisca-Pisca de Natal, Tunado com Adesivo de Chama, do Vovô, Dourado Ostentação) e seis facas depois da de cozinha (Colher de Pau, Frango de Borracha, Baguete, Peixe Congelado, Macarrão de Piscina, Sabre de Luz). A troca para "uma melhoria por nível" ([[ADR - Progressão por melhorias de arma]]) tirou essas armas: só o frango e o sabre sobreviveram, como formas da faca, e a primária ficou só o Rifle Padrão. Na árvore do Arsenal da PF-7 a linha Principal tinha uma única arma.

## Problema

- "Onde estão todas as outras armas que existiam nas primeiras versões do jogo? Deste jeito tenho apenas um rifle."
- Trazer as armas de volta sem desfazer a progressão por melhorias, que já funciona e está guardada no banco por arma (`weapon_progress`, com `CHECK` nos 5 ids).

## Opções consideradas

- **Pontos**: compartilhados com a arma base (escolhida: todos os rifles usam os pontos e as melhorias do rifle; todas as facas, os da faca) × uma progressão por arma (exigiria migration e tabela nova, e o jogador recomeçaria do zero a cada rifle).
- **Diferença entre as armas**: uma troca (sidegrade) por arma, cada uma ganha algo e perde algo (escolhida) × melhor a cada liberação (o Dourado seria simplesmente o mais forte) × só visual.
- **Miras antigas** (holo com lupa, lunetas 2x e 4x): melhorias do rifle, valendo para todos os rifles (escolhida) × exclusivas de um rifle × fora.
- **Facas**: todas as 7 viram armas próprias (escolhida) × só as que já existiam como forma.
- **Ritmo de liberação dos rifles**: nos mesmos pontos dos níveis do rifle (escolhida: 1.000, 2.500, 4.500, 7.000, 10.000 e 16.000, este no nível 8) × espaçados por conta própria.
- **Facas**: mais espaçadas que os níveis (600, 1.500, 2.800, 4.500, 6.500 e 9.000).
- **Árvore da faca**: só Afiador e Tênis de Molinha ficam como melhorias (escolhida) × manter quatro.

## Decisão

1. **Armas novas**, cada uma com seu JSON em `shared/data/weapons/` (`rifle_fita`, `rifle_tia`, `rifle_natal`, `rifle_chama`, `rifle_vovo`, `rifle_ouro`; `colher`, `frango`, `baguete`, `peixe`, `macarrao`, `sabre`). Ids no código: `GunId` ganha `rifleFita`, `rifleTia`, `rifleNatal`, `rifleChama`, `rifleVovo`, `rifleOuro`; `KnifeId` = `faca`, `colher`, `frango`, `baguete`, `peixe`, `macarrao`, `sabre`. Atributos e trocas em [[Weapons]] e [[Melee]].
2. **Progressão compartilhada**: as chaves de progressão continuam `rifle`, `pistola`, `smg`, `faca`, `granada` (`ProgWeapon`). `progOf(arma)` diz para onde vão os pontos e de onde vêm as melhorias: todo rifle → `rifle`, toda faca → `faca`. Sem migration: o banco continua com os mesmos 5 ids.
3. **Trava em pontos, no JSON da arma**: `libera: { arma, pontos }` (ex.: `rifle_tia.json` → `{ "arma": "rifle", "pontos": 2500 }`). A submetralhadora também passou para esse formato (`{ "arma": "pistola", "pontos": 1800 }`, o mesmo nível 3 de antes). `weaponUnlocked(arma, xp)`: sem trava, com pontos próprios (a smg de quem já a usava) ou com os pontos da progressão.
4. **Escolha**: a `ArsenalChoice` ganha `primaria?` e `faca?` (padrão `rifle` e `faca`); o `Loadout` ganha `faca?`. O servidor limpa com o XP (`sanitizeChoice(raw, xp)`): arma trancada volta à padrão; pela API a requisição inteira é recusada (`400 nivel_bloqueado`). Quem tinha o frango ou o sabre ligado como forma fica com a faca correspondente, se os pontos de faca já a liberam (senão, a faca de cozinha).
5. **Miras**: a árvore do rifle ganha os níveis 7 a 9, todas opcionais do grupo `mira` (holo com lupa 1,5x com 13.000 pontos, luneta 2x com 16.000, luneta 4x com 20.000), ao lado do ponto vermelho e da Luneta do Vovô 3x ([[Progression]]).
6. **Pintura** é de cada rifle (`visual` no JSON: `padrao`, `fita`, `tia`, `natal`, `chamas`, `vovo`, `ouro`); as melhorias não a mudam mais (a luneta e o pente perderam o `visual`).
7. **Faca**: a árvore fica com **Afiador** (nível 2, 600) e **Tênis de Molinha** (nível 3, 2.800), valendo para todas as facas. O frango e o sabre saem da árvore.
8. **Nada muda sozinho**: todos começam no Rifle Padrão e na faca de cozinha; liberar uma arma avisa "… liberada: equipe no Arsenal" ([[Notifications]]), mas não a equipa.
9. **Rede**: `hit.w` aceita os novos rifles; `kill.arma` passa a ser `WeaponId` (o rifle que atirou; uma facada continua `faca`, e cada cliente põe o nome da faca de quem matou pelo `playerLoadout`); `playerLoadout`/`joined` levam `primaria` e `faca` ([[Remote Calls]]). O golpe é recusado acima do alcance da investida da faca de quem golpeia + 1,5 m de folga.
10. **Bots** sorteiam qualquer rifle com a mesma chance que antes iam de Rifle Padrão, e uma faca qualquer (não têm conta, nada é trancado para eles) — [[Versus Bots]].
11. **Modos**: a corrida armada e o zumbi apontam o sabre como faca (`{ "arma": "faca", "faca": "sabre" }`); os degraus e itens de rifle continuam o Rifle Padrão ([[Gun Game]], [[Zombie]]).

## Motivo

- É o que o jogador pediu: as armas das primeiras versões, com a variedade de rifles de volta.
- Pontos compartilhados mantêm o banco e o que cada conta já fez; liberar rifles nos mesmos pontos dos níveis dá um prêmio a mais a cada passo sem nova economia ([[Economy Design]]).
- Trocas por arma evitam um "melhor rifle": escolher é questão de estilo, não de progresso.

## Consequências

- O mesmo nível de rifle vale para os 7 rifles: as melhorias ligadas e desligadas são as do rifle, para qualquer um deles.
- A árvore do Arsenal tem 7 armas na linha Principal e 7 na Faca, com os pontos que faltam em cada trancada ([[Inventory UI]]).
- Os testes de rifle e faca no servidor precisam escolher a arma com pontos na conta de teste (`setWeaponXp`).
- O teste da migração `003_melhorias.sql` ficou preso aos limiares da época (ele confere os pontos daquela migração, não os de hoje).
- Cliente e servidor precisam ser publicados juntos (protocolo com novos ids).

## Código afetado

- `shared/data/weapons/*.json` (12 novos; `smg.json` com `libera`; ícones), `shared/data/progression.json` (níveis 7–9 do rifle, árvore da faca, sem `libera`), `shared/weapons.ts` (`WeaponLock`, `MELEE` por faca), `shared/progression.ts` (`GunId`, `KnifeId`, `WeaponId`, `progOf`, `lockOf`, `weaponUnlocked`, `ArsenalChoice`, `sanitizeChoice`, `legacyChoice`), `shared/arsenal.ts` (`knifeOf`, `loadoutKnife`, `meleeStats(faca, melhorias)`, `gunStats`, `resolveLoadout`), `shared/protocol.ts`, `shared/gunGame.ts`, `shared/zombies.ts`, `shared/data/corrida_armada.json`, `shared/data/zumbi.json`
- `server/session.ts`, `server/modes.ts`
- `client/ui/arsenalTree.ts`, `client/ui/arsenal.ts`, `client/gameplay/progress.ts`, `client/render/weaponModels.ts`, `client/render/viewmodel.ts`, `client/entities/heldWeapons.ts`, `client/entities/avatar.ts`, `client/net/remote.ts`, `client/audio/sfx.ts`, `client/ai/bot.ts`, `client/ai/bots.ts`, `client/main.ts`, `client/ui/home.ts`, `client/ui/ladder.ts`, `client/zombies/local.ts`, `client/zombies/coffin.ts`, `client/ui/strings.ts`
- Testes: `server/tests/arsenal.test.ts`, `auth.test.ts`, `game.test.ts`, `modes.test.ts`, `progression-modes.test.ts`, `zombies.test.ts`; `client/tests/arsenalTree.test.ts`, `offlineModes.test.ts`

Relacionado: [[Weapons]] · [[Melee]] · [[Progression]] · [[Inventory UI]] · [[Weapon Models]] · [[Remote Calls]] · [[Player Data]] · [[Validation]]
