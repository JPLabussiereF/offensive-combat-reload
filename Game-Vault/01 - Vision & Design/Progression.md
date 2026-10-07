---
title: Progression
type: system
status: documented
area: design
source_paths:
  - server/modes.ts
  - shared/gunGame.ts
  - shared/modes.ts
  - shared/progression.ts
  - shared/arsenal.ts
  - shared/data/progression.json
  - shared/data/weapons/smg.json
  - shared/data/weapons/grampeador.json
  - shared/data/weapons/furadeira.json
  - shared/data/weapons/rifle_tia.json
  - shared/data/weapons/sabre.json
  - shared/weapons.ts
  - shared/accountLevel.ts
  - shared/data/nivel_conta.json
  - server/progress.ts
  - server/session.ts
  - server/accounts.ts
  - server/migrations/003_melhorias.sql
  - client/gameplay/progress.ts
  - client/ui/arsenal.ts
  - client/ui/arsenalTree.ts
  - client/main.ts
  - shared/zombies.ts
  - shared/zombieMatch.ts
  - shared/data/zumbi.json
tags:
  - game
  - design
  - progression
updated: 2026-10-07
---

# Progression

Existem **duas progressões independentes**, ambas guardadas **na conta** (no servidor) e alimentadas **só por eventos online validados pelo servidor**:

1. **Progressão de arma**: rifle, pistola, submetralhadora, faca e granada evoluem separadamente, cada uma com os pontos dos próprios abates; cada nível libera uma **melhoria** com atributos reais. Os sete rifles dividem a progressão do rifle e as sete facas a da faca; o grampeador, o revólver, a garrucha e o pistolão dividem a da pistola, e a furadeira a da submetralhadora.
2. **Nível da conta**: XP próprio, ganho com tempo vivo, abates, opressões e carpas.

Não há moeda, loja nem desbloqueio comprado ([[Economy Design]]).

## 1. Progressão de arma

### Regra central

> Cada abate rende seus pontos (abate + bônus) **só para a arma que matou**. Quem só usa o rifle só evolui o rifle. Um rifle antigo evolui o rifle; uma faca antiga, a faca (`progOf`).
> — `shared/data/progression.json` (`_doc`) e `shared/progression.ts`

| Tipo de morte (`KillKind`) | Arma que recebe os pontos |
| --- | --- |
| `gun`, `head`, `groin` | a progressão da arma de fogo que atirou (`kill.arma`: qualquer rifle → rifle; pistola, grampeador, revólver, garrucha, pistolão → pistola; submetralhadora, furadeira → submetralhadora) |
| `knife` | faca (qualquer faca) |
| `grenade` (inclui a mina) | granada |
| `fall`, `void`, `explosion`, `dog` | nenhuma |

- A **Opressão não dá XP de arma**: soma 150 à pontuação da sessão e +50 ao XP da conta (`onTauntEnd` em `server/session.ts`).
- Exemplo: um abate com tiro na cabeça de rifle soma 100 + 50 = **150 XP de rifle**; o mesmo abate de pistola vai para a pistola (verificado em `server/tests/game.test.ts`).
- Ver [[ADR - Progressão de XP por arma]] (regra do XP) e [[ADR - Progressão por melhorias de arma]] (níveis como melhorias).

### Níveis e melhorias

Cada arma começa no **nível 1** (só os atributos base do seu JSON, ver [[Weapons]]). Cada nível seguinte libera **uma melhoria** que muda atributos de verdade, do tipo que combina com a arma. Os números dos efeitos são **multiplicadores** sobre a base (×0,8 = −20%), exceto os marcados com "+" (somam).

- **Comuns**: ficam ativas assim que liberadas; o jogador pode **desligá-las** no [[Inventory UI|Arsenal]] (ex.: voltar à mira de ferro).
- **Opcionais** (têm troca, "Opcional: tem troca" no Arsenal): começam **desligadas**; o jogador liga e desliga no [[Inventory UI|Arsenal]].
- **Grupos**: num mesmo grupo só uma fica ligada: uma opcional ligada **substitui as comuns do grupo** (a luneta tira o ponto vermelho), e ligar a comum desliga a opcional. Ver [[ADR - Árvore do Arsenal e armas liberadas por nível]].

### Armas trancadas

Uma arma pode esperar pontos de uma progressão (`libera: { arma, pontos }` no JSON da arma, em `shared/data/weapons/`; `weaponUnlocked` em `shared/progression.ts`):

| Espaço | Arma | Libera com |
|---|---|---|
| Primária | Remendado com Fita · da Tia do Zap · Pisca-Pisca de Natal · Tunado com Adesivo de Chama · do Vovô · Dourado Ostentação | 1.000 · 2.500 · 4.500 · 7.000 · 10.000 · 16.000 pts de **rifle** (os pontos dos níveis 2 a 6 e 8) |
| Secundária | Grampeador do RH · Submetralhadora Liquidificador · Revólver do Delegado da Quadrilha · Furadeira do Vizinho de Domingo · Garrucha do Cangaceiro · Pistolão do Marombeiro | 700 · 1.800 · 3.200 · 5.200 · 7.000 · 9.000 pts de **pistola** (os níveis 2 a 5 da pistola, e dois além do último); a furadeira também libera com os de pistola, embora evolua com os da submetralhadora |
| Faca | Colher de Pau · Frango de Borracha · Baguete · Peixe Congelado · Macarrão de Piscina · Sabre de Luz | 600 · 1.500 · 2.800 · 4.500 · 6.500 · 9.000 pts de **faca** |

Quem **já fez algum ponto com a submetralhadora** fica com ela liberada (contas de antes da trava). Sem conta tudo fica no nível 1, então as armas com trava aparecem trancadas. Os bots não têm trava (sorteiam qualquer rifle, qualquer secundária e qualquer faca). O Arsenal mostra quantos pontos faltam ("faltam 600 pts de faca"), e quando uma arma libera aparece "… liberada: equipe no Arsenal" (ela não entra sozinha no espaço). Ver [[ADR - Rifles e facas antigos como armas próprias]] e [[ADR - Secundárias novas no Arsenal]].

#### Rifle (primária, os sete rifles) — 9 níveis

| Nv | XP | Melhoria | Efeito | Tipo |
|---|---|---|---|---|
| 2 | 1000 | Mira de Ponto Vermelho da Feira | mira de ponto vermelho, zoom 1,3x, dispersão mirando −30% | comum (grupo mira) |
| 3 | 2500 | Empunhadura de Cabo de Vassoura | recuo −20%, dispersão −15% | comum |
| 4 | 4500 | Luneta do Vovô (3x) | luneta (visão de luneta), zoom 2,6x, dispersão mirando −60%, alcance +30%; **troca**: tempo de mira +35%, mobilidade −5% | opcional (grupo mira) |
| 5 | 7000 | Pente Duplo com Silver Tape | pente +10 (40, reserva 160), recarga −10% | comum |
| 6 | 10000 | Silenciador de Garrafa PET | tiro abafado e sem traçante para os outros; **troca**: dano −10%, alcance −15% | opcional |
| 7 | 13000 | Holo com Lupa (1,5x) | holográfica com lupa, zoom 1,5x, dispersão mirando −45%; **troca**: tempo de mira +10% | opcional (grupo mira) |
| 8 | 16000 | Luneta 2x | luneta (visão de luneta), zoom 2x, dispersão mirando −55%, alcance +15%; **troca**: tempo de mira +20%, mobilidade −3% | opcional (grupo mira) |
| 9 | 20000 | Luneta 4x | luneta (visão de luneta), zoom 4x, dispersão mirando −65%, alcance +40%; **troca**: tempo de mira +50%, mobilidade −7% | opcional (grupo mira) |

As miras dos níveis 7 a 9 voltaram das primeiras versões do jogo (PF-8). Nenhuma melhoria muda a pintura do rifle: cada rifle tem a sua ([[Weapon Models]]).

#### Pistola do Porteiro (secundária; também o grampeador, o revólver, a garrucha e o pistolão) — 5 níveis

| Nv | XP | Melhoria | Efeito | Tipo |
|---|---|---|---|---|
| 2 | 700 | Gatilho de Fliperama | cadência +30% | comum |
| 3 | 1800 | Mini Ponto Vermelho | mira de ponto vermelho, zoom 1,2x, dispersão mirando −40% | comum |
| 4 | 3200 | Coldre de Velcro | tempo de saque −50%, recarga −20% | comum |
| 5 | 5200 | Silenciador de Batata | tiro abafado, sem traçante, recuo −15%; **troca**: dano −8% | opcional |

#### Submetralhadora Liquidificador (secundária; também a furadeira) — 5 níveis

| Nv | XP | Melhoria | Efeito | Tipo |
|---|---|---|---|---|
| 2 | 800 | Motor Turbo de Liquidificador | cadência +12% | comum |
| 3 | 2000 | Mira Holográfica da Tia do Zap | holográfica de carinha feliz, zoom 1,2x, dispersão mirando −40%, dispersão −10% | comum |
| 4 | 3800 | Pente Tambor de Pipoqueira | pente +18 (50); **troca**: recarga +25%, saque +20%, mobilidade −4% | opcional |
| 5 | 6000 | Coronha de Mangueira | recuo −25%, dispersão −15% | comum |

#### Faca (as sete facas) — 3 níveis

Todas as facas são letais com um golpe; o Frango de Borracha e o Sabre de Luz, que eram formas da faca, agora são facas próprias ([[Melee]]).

| Nv | XP | Melhoria | Efeito | Tipo |
|---|---|---|---|---|
| 2 | 600 | Afiador da Feira | intervalo entre golpes −20% | comum |
| 3 | 2800 | Tênis de Molinha | investida +0,6 m, velocidade da investida +20% | comum |

Os pontos continuam contando depois do nível 3: as facas antigas liberam até 9.000 pontos de faca.

#### Granada — 5 níveis

| Nv | XP | Melhoria | Efeito | Tipo |
|---|---|---|---|---|
| 2 | 700 | Mina Terrestre | G planta uma mina em vez de lançar ([[Land Mines]]) | opcional (grupo modo) |
| 3 | 1800 | Dose Dupla | um G lança duas granadas por uma carga ([[Grenades]]) | opcional (grupo modo) |
| 4 | 3200 | Cinto de Granadas da Tia | +1 granada por vida | comum |
| 5 | 5000 | Pólvora de São João | raio da explosão +20% (8,4 m; dano máximo até 3 m) | comum |

Nomes e descrições (com o humor) estão em `client/ui/strings.ts` (`upg_<arma>_<id>`, `upgDesc_…`), em pt-BR e inglês.

### Escolha do Arsenal

- O jogador equipa o **rifle**, a **secundária** e a **faca** (as já liberadas) e liga/desliga **qualquer melhoria já liberada** na árvore do **Arsenal** (aba da tela inicial; no menu de pausa, só leitura em partida e editável no campo de tiro). Isso é a `ArsenalChoice` (`{ primaria, secundaria, faca, ligadas, desligadas }`: opcionais ligadas e comuns desligadas, por progressão), guardada na conta. Todos começam no Rifle Padrão, na pistola e na faca de cozinha.
- O servidor limpa a escolha com o **XP de cada progressão** (`sanitizeChoice(raw, xp)`): **descarta melhorias não liberadas** e volta à arma padrão do espaço (Rifle Padrão, pistola, faca de cozinha) uma arma **trancada** ou que não é daquele espaço; pela API, a requisição inteira é recusada (`nivel_bloqueado`).
- Uma escolha guardada antes das facas antigas, com o frango ou o sabre ligado como forma, vira essa faca se os pontos de faca já a liberam (senão, a faca de cozinha).
- Ao subir de nível, uma melhoria **comum** entra em efeito (na partida com equipamento travado, a partir da próxima; no campo de tiro, na hora); uma **opcional** espera o jogador ligar (o banner avisa "Ligue no Arsenal").
- Online, o servidor aplica o dano, a cadência e o alcance de cada arma **com as melhorias do jogador**, e os outros veem os modelos certos (o rifle e a faca escolhidos, mira, pente, silenciador).

### Contas de antes das melhorias

A migração `003_melhorias.sql` sobe os pontos de cada arma até o limiar do nível novo equivalente ao antigo, para ninguém perder o que já tinha (rifle e faca: nível antigo 2→2, 3–4→3, 5–6→4, 7→5; granada 2→2, 3→3). Quem tinha equipado um nível com luneta, mina ou dose dupla continua com ela ligada (`legacyChoice`, aplicado enquanto a conta não salvou uma escolha nova). Os rifles e as facas antigos que essas contas equipavam não voltam sozinhos: todos começam no Rifle Padrão e na faca de cozinha. Ver [[Data Migrations]].

## 2. Nível da conta

Fonte: `shared/data/nivel_conta.json` e `shared/accountLevel.ts`.

| Fonte de XP | XP |
| --- | --- |
| Cada minuto **vivo** numa sessão online | 10 |
| Abate | 25 |
| Opressão completa | 50 |
| Carpa (Jardim do Dragão) | 1 |
| Carpa dourada | 100 |
| Modo zumbi: abate de zumbi | 3 (comum) a 8 (Segurança da Balada), conforme o tipo |
| Modo zumbi: chefe | 50 a quem mata; 100 (150 o Prefeito) para cada um do time que não está morto |
| Modo zumbi: onda vencida / reanimar / vitória | 10 / 10 / 250 |

No modo zumbi o abate de um zumbi **não** dá os 25 XP do abate de jogador nem conta nas estatísticas da conta; os valores acima vêm de `shared/data/zumbi.json` e são dados pelo servidor ([[Zombie]]).
**Curva:** custo do nível *n* para *n+1* = `round(1000 × n^1,5)`.

| De → para | Custo | XP total acumulado |
|---|---|---|
| 1 → 2 | 1000 | 1000 |
| 2 → 3 | 2828 | 3828 |
| 3 → 4 | 5196 | 9024 |
| 4 → 5 | 8000 | 17024 |
| 5 → 6 | 11180 | 28204 |

- O nível da conta é **só exibido** (home, perfil, coluna "Nível" do placar). Não libera nada no código atual.
- Ao subir de nível, o cliente mostra uma faixa e toca um som (`progresso` com `subiu`).

## Onde vale e onde não vale

| Situação | Usa as melhorias e a escolha da conta? | Ganha pontos/XP? |
| --- | --- | --- |
| Online, mata-mata | Sim, **as do momento em que entrou** na sessão: níveis subidos e mudanças no Arsenal valem na próxima ([[ADR - Equipamento travado no mata-mata]]) | Sim (validado pelo servidor) |
| Online, corrida armada | **Não**: as armas são as da escada, iguais para todos | Só **XP de conta** (+150 ao vencer a rodada); **sem pontos de arma** ([[ADR - Corrida armada]]) |
| Online, zumbi | **Não**: todos começam com o rifle sem melhorias; as armas vêm do Caixão Misterioso | Só **XP de conta** por zumbi, chefe, onda, reanimação e vitória; **sem pontos de arma** ([[ADR - Modo zumbi cooperativo com caixão e raridades]]) |
| Contra bots (com conta) | Mata-mata: sim, travadas na partida · corrida armada: a escada · zumbi (solo): o caixão | **Não** |
| Treino offline (com conta) | Sim | **Não** |
| Sem conta (qualquer modo offline) | Não: sem melhorias e com a submetralhadora trancada (o Arsenal da pausa do campo de tiro vale só para a partida) | Não |

## Persistência (resumo)

O progresso fica em memória no servidor (`LiveAccount`) e o delta é gravado no banco **a cada 60 s** e ao sair da sessão (XP por arma em `weapon_progress`, a escolha do Arsenal em `player_profile.loadout`). Se a gravação falha, o delta volta para a fila. Ver [[Player Data]] e [[Save System]].

## Notas relacionadas

[[Weapons]] · [[Scoring]] · [[Core Loop]] · [[Economy Design]] · [[Player Data]] · [[Configuration Data]] · [[Inventory UI]] · [[Achievements]] (álbum de figurinhas, calculado das estatísticas da conta)

## Código relacionado

- `shared/progression.ts`: `PROGRESSION`, `levelForXp`, `xpForLevel`, `levelsOfXp`, `weaponUnlocked`, `pointsToUnlock`, `activeUpgrades`, `ArsenalChoice`, `sanitizeChoice`, `legacyChoice`, `weaponOfKill`
- `shared/arsenal.ts`: `resolveLoadout`, `gunStats`, `meleeStats`, `grenadeStats` (atributos com as melhorias; ver [[Shared Systems]])
- `shared/accountLevel.ts`: `ACCOUNT_XP`, `levelCost`, `accountLevel`
- `server/progress.ts`: `addWeaponXp`, `addAccountXp`, `addTime`, `equip`, `xpOf`, `levelsOf`, `loadoutOf`, `progressMsg`
- `client/gameplay/progress.ts`: estado local do progresso; `toggle`, `setSecondary`, `unlocked`, `toUnlock` (PATCH `/api/perfil {arsenal}`, um por vez, desfeito se falha)
- `client/ui/arsenal.ts` e `client/ui/arsenalTree.ts`: a árvore do Arsenal
