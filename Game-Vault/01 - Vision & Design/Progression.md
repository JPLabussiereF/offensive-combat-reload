---
title: Progression
type: system
status: documented
area: design
source_paths:
  - shared/progression.ts
  - shared/data/progression.json
  - shared/accountLevel.ts
  - shared/data/nivel_conta.json
  - server/progress.ts
  - server/session.ts
  - server/accounts.ts
  - client/gameplay/progress.ts
  - client/ui/arsenal.ts
  - client/main.ts
tags:
  - game
  - design
  - progression
updated: 2026-10-05
---

# Progression

Existem **duas progressões independentes**, ambas guardadas **na conta** (no servidor) e alimentadas **só por eventos online validados pelo servidor**:

1. **Progressão de arma**: rifle, faca e granada evoluem separadamente, cada uma com os pontos dos próprios abates.
2. **Nível da conta**: XP próprio, ganho com tempo vivo, abates, opressões e carpas.

Não há moeda, loja nem desbloqueio comprado ([[Economy Design]]).

## 1. Progressão de arma

### Regra central

> Cada abate rende seus pontos (abate + bônus) **só para a arma que matou**. Quem só usa o rifle só evolui o rifle.
> — `shared/data/progression.json` (`_doc`) e `shared/progression.ts`

| Tipo de morte (`KillKind`) | Arma que recebe os pontos |
| --- | --- |
| `gun`, `head`, `groin` | rifle |
| `knife` | faca |
| `grenade` (inclui a mina) | granada |
| `fall`, `void`, `explosion`, `dog` | nenhuma |

- A **Opressão não dá XP de arma**: soma 150 à pontuação da sessão e +50 ao XP da conta (`onTauntEnd` em `server/session.ts`).
- Exemplo: um abate com tiro na cabeça soma 100 + 50 = **150 XP de rifle** (verificado em `server/tests/game.test.ts`).
- Ver [[ADR - Progressão de XP por arma]].

### Níveis do rifle

O XP é o acumulado com a própria arma. Dano = perto/longe. Os multiplicadores valem sobre o rifle base.

| Nv | XP | Nome | Mira | Dano | Pente | Cadência (rpm) | Recuo | Dispersão | Recarga | Zoom ADS |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 0 | Rifle Padrão | ferro | 30/20 | 30 | 700 | 1 | 1 | 1 | 0,85 |
| 2 | 400 | Rifle Remendado com Fita | ponto vermelho | 31/21 | 30 | 700 | 0,95 | 0,92 | 1 | 0,8 |
| 3 | 1000 | Rifle da Tia do Zap | holográfica (carinha feliz) | 32/22 | 32 | 710 | 0,9 | 0,86 | 0,94 | 0,78 |
| 4 | 1800 | Rifle Pisca-Pisca de Natal | holo + lupa 1,5x | 33/23 | 32 | 720 | 0,82 | 0,8 | 0,92 | 0,66 |
| 5 | 2800 | Rifle Tunado com Adesivo de Chama | luneta 2x | 34/24 | 35 | 750 | 0,76 | 0,74 | 0,9 | 0,5 |
| 6 | 4000 | Rifle com Luneta do Vovô | luneta 3x | 35/25 | 35 | 760 | 0,7 | 0,68 | 0,88 | 0,38 |
| 7 | 5500 | Rifle Dourado Ostentação | luneta 4x | 37/26 | 40 | 780 | 0,62 | 0,6 | 0,85 | 0,3 |

A reserva é sempre 4 × o pente (`rifleData`).

### Níveis da faca

Todas as facas são letais. Só o alcance (golpe / investida, em metros), o modelo e o som mudam.

| Nv | XP | Nome | Alcance | Investida |
|---|---|---|---|---|
| 1 | 0 | Faca de Cozinha | 1,8 | 3,2 |
| 2 | 300 | Colher de Pau da Vó | 1,95 | 3,5 |
| 3 | 750 | Frango de Borracha (grita a cada golpe) | 2,1 | 3,8 |
| 4 | 1350 | Baguete Amanhecida | 2,25 | 4,1 |
| 5 | 2100 | Peixe Congelado | 2,4 | 4,4 |
| 6 | 3000 | Macarrão de Piscina | 2,55 | 4,7 |
| 7 | 4100 | Sabre de Luz Paraguaio | 2,7 | 5,0 |

### Níveis da granada

| Nv | XP | Nome | Tipo | Efeito |
|---|---|---|---|---|
| 1 | 0 | Granada de Fragmentação | `granada` | explode no primeiro contato |
| 2 | 500 | Mina Terrestre | `mina` | G planta uma mina que arma em 1 s e explode quando um inimigo pisa perto. Até 3 no mapa; somem quando o dono renasce. Ver [[Land Mines]] |
| 3 | 1300 | Dose Dupla | `dupla` | um G lança duas granadas gastando uma carga. Morrer entre os dois lançamentos perde o segundo |

> [!note] Nível da granada × dano
> O **tipo** da granada segue o nível equipado, mas o **dano** usa sempre o nível 1 do `granada_frag.json` (`ONLINE_GRENADE_LEVEL = 1`). Ver [[Grenades]].

### Equipar

- O jogador pode equipar **qualquer nível já liberado**, inclusive um menor, pelo **Arsenal** (menu de início e de pausa). Ver [[Menus]].
- Ao subir de nível, o novo nível é **equipado automaticamente se o jogador estava usando o melhor** (`addWeaponXp`).
- O servidor **ignora níveis não liberados** (`equip` em `server/progress.ts`; a API responde `nivel_bloqueado`).
- Online, o servidor aplica o dano, a cadência e o alcance da faca do nível equipado, e os outros jogadores veem os modelos novos (`playerLoadout`).

## 2. Nível da conta

Fonte: `shared/data/nivel_conta.json` e `shared/accountLevel.ts`.

| Fonte de XP | XP |
| --- | --- |
| Cada minuto **vivo** numa sessão online | 10 |
| Abate | 25 |
| Opressão completa | 50 |
| Carpa (Jardim do Dragão) | 1 |
| Carpa dourada | 100 |

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

| Situação | Usa os níveis equipados? | Ganha pontos/XP? |
| --- | --- | --- |
| Online (com conta) | Sim | Sim (validado pelo servidor) |
| Contra bots (com conta) | Sim | **Não** |
| Treino offline (com conta) | Sim | **Não** |
| Sem conta (qualquer modo offline) | Não: tudo no nível 1 | Não |

## Persistência (resumo)

O progresso fica em memória no servidor (`LiveAccount`) e o delta é gravado no banco **a cada 60 s** e ao sair da sessão. Se a gravação falha, o delta volta para a fila. Ver [[Player Data]] e [[Save System]].

## Notas relacionadas

[[Weapons]] · [[Scoring]] · [[Core Loop]] · [[Economy Design]] · [[Player Data]] · [[Configuration Data]] · [[Inventory UI]]

## Código relacionado

- `shared/progression.ts`: `weaponOfKill`, `levelForXp`, `rifleData`, `knifeData`, `sanitizeLoadout`
- `shared/accountLevel.ts`: `ACCOUNT_XP`, `levelCost`, `accountLevel`
- `server/progress.ts`: `addWeaponXp`, `addAccountXp`, `addTime`, `equip`, `progressMsg`
- `client/gameplay/progress.ts`: estado local do progresso e `equip` (PATCH `/api/perfil`)
- `client/ui/arsenal.ts`: tela do Arsenal
