---
title: Save System
type: system
status: documented
area: data
source_paths:
  - server/app.ts
  - server/progress.ts
  - server/accounts.ts
  - server/index.ts
  - client/core/settings.ts
  - client/ui/home.ts
  - client/gameplay/progress.ts
  - server/migrations/003_melhorias.sql
tags:
  - game
  - data
  - save
updated: 2026-10-06
---

# Save System

Não existe "save game" no sentido tradicional (slots, checkpoints): as partidas são FFA sem fim e o mundo não é persistido. O que se salva é **o progresso da conta (no servidor)** e **as preferências (no navegador)**.

## 1. Progresso da conta (servidor → PostgreSQL)

### O que é salvo
O `ProgressDelta` de cada `LiveAccount` (XP de conta e de armas, abates, mortes, tipos de abate, humilhações, segundos jogados, pontos e, à parte, as estatísticas do modo zumbi em `delta.zumbi`) e a **escolha do Arsenal** atual (`profile.arsenal`). Detalhes em [[Player Data]].

### Quando
| Gatilho | Fecha a participação? | Código |
|---|---|---|
| A cada **60 s** (`FLUSH_EVERY_MS`), para quem está numa sala, **se o delta não estiver vazio** | não | `flushTimer` em `server/app.ts` |
| Ao sair da sala (`leave`, trocar de sala, `create`/`join`) | sim (`left_at = now()`) | `leaveSession()` |
| Ao fechar a conexão | sim | `close` do WebSocket |
| Ao desligar o servidor (SIGTERM/SIGINT) | sim | `GameServer.close()`, limite de 3 s em `server/index.ts` |

### Como
`flushProgress()` (`server/accounts.ts`) roda **numa transação**:
1. `UPDATE player_stats SET xp = xp + ..., kills = kills + ..., ...` e recalcula `level`.
2. Para cada arma com XP no delta, um *upsert* em `weapon_progress` (`INSERT ... ON CONFLICT (profile_id, weapon) DO UPDATE SET xp = xp + ...`): uma arma criada depois da conta pode ainda não ter a linha.
3. Se `delta.zumbi` tem algo, um *upsert* em `zombie_stats` que soma cada coluna e guarda `best_wave = GREATEST(...)`. No `mergeDelta` de uma gravação que falhou, `bestWave` também fica com o maior valor em vez de somar.
4. Os contadores próprios do álbum (`delta.album.add` somados, `delta.album.max` com `GREATEST`): um *upsert* por grupo em `achievement_progress` (`unnest` das chaves e valores). Depois de uma gravação que deu certo, `settle` junta o delta aos totais em memória (`profile.totals`, `profile.album`) de onde o álbum ao vivo parte ([[Achievements]]).
5. `UPDATE player_profile SET loadout = <escolha do Arsenal>` (o servidor sempre a passa no flush).
6. `UPDATE session_participation SET kills = kills + ..., ..., left_at = CASE WHEN <fechar> ...`.

O delta é trocado por um vazio **antes** da escrita; se ela falhar, `mergeDelta` devolve os valores ao delta atual e o próximo ciclo tenta de novo (log `[progresso] gravação falhou, tento de novo no próximo ciclo`). Ver [[ADR - Progresso gravado em lotes por delta]].

### Abertura da participação
No `join`/`create`, `openParticipation` insere a linha em `session_participation` e incrementa `player_stats.matches_played`, **de forma assíncrona** (a promessa fica em `account.participation`). Se falhar, o progresso continua sendo gravado, só sem a linha de participação.

### Janela de perda
Uma queda abrupta do processo (sem SIGTERM) perde o que foi ganho desde a última gravação: até ~60 s por jogador.

> [!warning]
> Inferência a partir do intervalo de flush; não há teste de queda abrupta.

## 2. Alterações via API (gravação imediata)

Nome, sexo, aparência e a escolha do Arsenal (`PATCH /api/perfil {arsenal}`, `setArsenal`) são gravados na hora. Uma mudança no Arsenal durante o jogo faz as duas coisas: `PATCH /api/perfil {arsenal}` (cliente, `Progress.toggle`/`setSecondary`) e mensagem `loadout` (servidor atualiza a memória e grava no próximo flush).

## 3. Preferências locais (navegador)

| Chave `localStorage` | Conteúdo | Código |
|---|---|---|
| `oc.settings.v1` | `Settings`: sensibilidade (e de mira), FOV, inverter Y, volume, áudio espacial, qualidade, opções de toque (sensibilidade, escala, opacidade, layout dos botões, mira assistida, segurar para mirar), tela cheia, sensibilidade do controle, **teclas** (`keybinds`) e rótulos de teclas aprendidos (`keyLabels`) | `client/core/settings.ts` |
| `oc.bots` | dificuldade, quantidade e mapa escolhidos para o modo contra bots | `client/ui/home.ts` |
| `oc.name`, `oc.sex`, `oc.profile` | **legado**: apagadas ao abrir a home (nome, corpo e progressão agora vivem na conta) | `client/ui/home.ts` |

- Leitura: `loadSettings()` mescla com os padrões; as teclas são mescladas **ação por ação** (`mergeKeybinds`) para que ações novas recebam o padrão; `keyLabels` só aceita um caractere imprimível por tecla.
- Escrita: `saveSettings()` grava o objeto inteiro.
- Falha de storage (modo privado, bloqueio) é ignorada: o jogo usa os padrões.
- **Não sincroniza** entre dispositivos (não vai para a conta). Ver [[Settings]].
- A sessão de login **não** fica em `localStorage`: é um cookie HttpOnly (`client/net/api.ts`).

## Código relacionado

- `server/app.ts` — `flush()`, `flushTimer`, `leaveSession()`, `close()`.
- `server/accounts.ts` — `openParticipation()`, `flushProgress()`.
- `server/progress.ts` — `mergeDelta()`, `deltaIsEmpty()`.
- `client/core/settings.ts`, `client/ui/home.ts`, `client/gameplay/progress.ts`.
- Ver também [[Database]], [[Data Architecture]].
