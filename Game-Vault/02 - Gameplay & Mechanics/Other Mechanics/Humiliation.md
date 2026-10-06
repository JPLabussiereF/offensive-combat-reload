---
title: Humiliation
type: mechanic
status: documented
area: gameplay
source_paths:
  - shared/constants.ts
  - shared/protocol.ts
  - client/gameplay/taunt.ts
  - client/gameplay/corpse.ts
  - client/gameplay/targets.ts
  - client/main.ts
  - server/session.ts
  - shared/data/nivel_conta.json
tags:
  - game
  - gameplay
  - humiliation
updated: 2026-10-05
---

# Humiliation

Nome interno: `taunt` / `humiliation` / `dance`. Nome exibido: **"Oprimir"** / **"Opressão"** (pt-BR), "Humiliate" (en). A dança se chama "Dancinha da Vitória" no README.

> [!info] Evidência
> Código confirmado: `HUMILIATION` (`shared/constants.ts`), `Taunt` (`client/gameplay/taunt.ts`), `Corpse` (`client/gameplay/corpse.ts`), `Session.onTaunt`/`onTauntEnd` (`server/session.ts`).

## Objetivo

Mecânica-assinatura: depois de um abate, o corpo fica "oprimível" por alguns segundos. Quem dança em cima dele ganha muitos pontos, mas fica **exposto e indefeso**. É a recompensa de risco do [[Core Loop]].

## Como o jogador interage

1. Um personagem morre → aparece um **corpo com contagem regressiva de 6 s**.
2. Com os pés a ≤ 2 m do centro do corpo, o prompt `[E] Oprimir {nome}` aparece (ver [[Interaction System]]).
3. Apertar E inicia a dança: câmera em **terceira pessoa** orbitando o dançarino, música de dança.
4. Ao completar 3,2 s: faixa "OPRIMIDO!", buzina, aplausos, confete, kill feed com o ícone da dança e **+150 pontos**.

## Regras

| Regra | Valor |
|---|---|
| Janela para começar (`window`) | 6 s após a morte |
| Raio (`radius`) | 2 m dos pés (servidor aceita +1,5 m de folga) |
| Duração da dança (`duration`) | 3,2 s (servidor aceita a partir de 2,8 s) |
| Pontos (`SCORE.humiliation`) | 150 — "triplicado" (ver [[ADR - Pontuação da Opressão triplicada]]) |
| XP de conta (`porOpressao`) | 50 (só online) |

- **Cada corpo só pode ser oprimido uma vez**, e por um jogador de cada vez (`claimedBy`).
- Ninguém oprime o **próprio corpo**.
- Durante a dança: **não anda, não atira, não mira, não recarrega** (entradas zeradas); a recarga em andamento é cancelada.
- **Dano não interrompe a dança — só a morte.** Morrer dançando libera o corpo sem pontos.
- Uma dança interrompida estende a janela do corpo para pelo menos 1,5 s a partir de então (outro pode tentar).
- O corpo some ~2 s depois do fim da janela se ninguém estiver dançando nele (servidor) e afunda no chão (cliente).
- A vítima assiste pela câmera de morte, que mira em quem a matou; se alguém começar a oprimi-la, a tela de morte mostra "{nome} 💃 OPRIMIDO!".

## Estados possíveis

Corpo: `oprimível` → `reivindicado (claimedBy)` → `humilhado` | `expirado`. Jogador: normal → dançando (`Taunt.active`, `t` de 0 a 3,2 s) → normal.

## Entradas

Ação `taunt` (E / △ / toque no prompt), posição dos pés, lista de corpos (`Humiliable`).

## Saídas

Online: `taunt {corpse}` e `tauntEnd {corpse, done}` → servidor responde `taunt`/`tauntEnd {done, awards, players}` para todos. Flag `FLAG.dance` no estado replicado (animação remota). Pontos, contador `humiliations` no placar ([[Scoreboard]]), estatística "opressões" no perfil ([[Player Data]]).

## Dependências

[[Combat]] (gera o corpo), [[Respawn]] (atraso de 5 s online, "longo o suficiente para assistir à própria humilhação"), [[Scoring]], [[Progression]], [[Camera]], [[Animation]], [[Audio Events]].

## Exceções

- O comentário do cabeçalho de `client/gameplay/taunt.ts` diz "G near a fresh corpse"; o código atual usa a ação `taunt` (E). O comentário está desatualizado.
- Contra bots, os bots também dançam sobre corpos (ver [[NPC Behavior]]).
- No campo de tiro, bonecos também viram corpos oprimíveis (`Dummy` implementa `Humiliable`).
- Online o corpo é criado pelo servidor; os pontos só chegam com o `tauntEnd` confirmado.

## Código relacionado

- `client/gameplay/taunt.ts` — `Taunt` (duração, câmera orbital, blend 1ª↔3ª pessoa).
- `client/gameplay/corpse.ts` — `Corpse` (queda do corpo, timer, claim).
- `client/gameplay/targets.ts` — `Humiliable`, `nearestHumiliable`.
- `client/main.ts` — início da dança, `finishTaunt`, `humiliationFx`, handlers `taunt`/`tauntEnd`.
- `server/session.ts` — `onTaunt`, `onTauntEnd`, `kill` (cria o corpo), limpeza no `tick`.

## Configurações relacionadas

`HUMILIATION`, `SCORE.humiliation`, `NET.corpseWindow` (= `HUMILIATION.window`), `porOpressao` em `nivel_conta.json`. Ver [[Constants Reference]].
