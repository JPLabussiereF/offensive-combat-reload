---
title: ADR - Progressão de XP por arma
type: decision
status: outdated
area: design
source_paths:
  - shared/progression.ts
  - shared/data/progression.json
  - server/progress.ts
  - server/session.ts
  - client/gameplay/progress.ts
  - client/ui/home.ts
  - README.md
tags:
  - game
  - decision
  - progression
updated: 2026-10-06
---

# ADR - Progressão de XP por arma

> [!warning] Substituída em parte
> Os **níveis nomeados que se equipam** (7/7/3 níveis, "equipar um nível") foram substituídos por **melhorias por nível** em [[ADR - Progressão por melhorias de arma]] (2026-10-06). Continua valendo daqui: os pontos de cada abate vão só para a arma que matou, só de eventos validados pelo servidor, e o XP da conta é separado. O texto abaixo é o registro histórico da decisão original.

## Contexto

O jogo tem três armas: rifle, faca e granada. Cada uma tem 7, 7 e 3 níveis com melhorias e visuais cômicos ([[Progression]]).

## Problema

Era preciso decidir como os pontos viram evolução e onde o progresso fica guardado, de forma que não desse para trapacear.

## Opções consideradas

- Um XP único, que evolui tudo junto.
- **XP por arma**, ganho só com abates daquela arma.
- Progresso no navegador. Antes das contas, o progresso ficava no `localStorage` (`oc.profile`). O comentário em `client/ui/home.ts` cita as chaves "da era pré-conta", que hoje são apagadas ("Resposta P5").
- **Progresso na conta, no servidor**, alimentado só por eventos validados.

## Decisão

1. Cada abate rende os pontos do abate (com bônus) **só para a arma que matou** (`weaponOfKill`).
2. O progresso fica **na conta**, no servidor. Os pontos só vêm de **abates online validados pelo servidor**. O treino e o modo contra bots usam os níveis equipados, mas não dão pontos.
3. Existe um XP de conta separado (tempo vivo, abates, opressões e carpas) que não se mistura com o das armas.

## Motivo

- `shared/data/progression.json` (`_doc`) e o README: "Quem só usa o rifle só evolui o rifle; para evoluir a faca e a granada é preciso matar com elas." Isso incentiva usar o arsenal inteiro e dá a cada arma a sua maestria.
- `client/gameplay/progress.ts` e `server/progress.ts`: "points only come from events the server validated". Assim o progresso não pode ser forjado pelo cliente ([[Anti Exploit]]).

## Consequências

- Os modos offline não progridem, o que pode frustrar quem joga sozinho ([[Versus Bots]]).
- A Opressão não evolui nenhuma arma (só a conta).
- O servidor ignora pedidos para equipar níveis não liberados ([[Validation]]).
- O progresso é gravado em lote a cada 60 s e ao sair da sessão ([[Save System]]).

## Código afetado

- `shared/progression.ts` (`weaponOfKill`, `levelForXp`, `sanitizeLoadout`)
- `server/progress.ts` (`addWeaponXp`, `addAccountXp`, `equip`)
- `server/session.ts` (`kill`, `onTauntEnd`, `onFish`, `tick`)
- `client/gameplay/progress.ts`

Relacionado: [[Progression]] · [[Scoring]] · [[Player Data]]
