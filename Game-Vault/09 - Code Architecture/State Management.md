---
title: State Management
type: architecture
status: documented
area: code-architecture
source_paths:
  - client/main.ts
  - client/core/settings.ts
  - client/ui/home.ts
  - client/gameplay/progress.ts
  - client/net/connection.ts
  - client/net/remote.ts
  - client/ai/bots.ts
  - server/app.ts
  - server/session.ts
  - server/progress.ts
  - server/accounts.ts
  - server/redis.ts
  - server/auth/sessions.ts
  - server/migrations/001_contas.sql
  - shared/arsenal.ts
tags:
  - architecture
  - state
updated: 2026-10-06
---

# State Management

Não há biblioteca de estado (Redux, signals, store). O estado vive **em variáveis locais de closures e em campos de classes**, e cada camada tem um dono claro. Esta nota mapeia **onde** cada estado está; o formato persistente está em [[Data Architecture]].

## Mapa de estados

| Categoria | Onde vive | Dono | Duração |
| --- | --- | --- | --- |
| Estado temporário do quadro | campos `prev`/`curr`, `tmp` em classes; variáveis de `render()` | cada sistema | um quadro |
| Estado da partida (cliente) | variáveis `let` do `boot()` em `client/main.ts` | `boot()` | até recarregar a página |
| Estado da partida contra bots | `BotManager` (`scores`, `corpses`, `protectedUntil`, `time`) e cada `Bot` | `client/ai/bots.ts` | até recarregar |
| Visão online dos outros | `RemoteWorld` (`players`, `info`, `corpses`, buffer de snapshots) | `client/net/remote.ts` | enquanto conectado |
| Estado autoritativo da sessão | `Session` (`players: SPlayer`, `corpses`, `pickups`, `fish`, `rats`) | `server/session.ts` | vida da sessão (memória) |
| Lobby | `sessions`, `conns`, `byAccount`, `nextId` na closure de `startServer` | `server/app.ts` | vida do processo |
| Progresso ao vivo | `LiveAccount` (`profile` com `weapons{xp}` e `arsenal`, `delta`, `aliveCarry`, `chatMutedUntil`) | `server/progress.ts` | vida da conexão, gravado a cada 60 s e ao sair |
| Loadout do jogador na sessão | `SPlayer.loadout` (recalculado por `loadoutOf` na escolha e ao subir de nível), `held`/`heldBefore`/`heldAt` (arma em mãos, pela `FLAG.secondary`) | `server/session.ts` | vida do jogador na sessão |
| Progresso no cliente | `Progress` (`xpOf`, `chosen`: a `ArsenalChoice`) alimentado por `progresso` (`armas`, `escolha`) | `client/gameplay/progress.ts` | sessão da página |
| Preferências do jogador | `localStorage['oc.settings.v1']` (`Settings`) | `client/core/settings.ts` | persistente no navegador |
| Preferências do modo bots | `localStorage['oc.bots']` (`skill`, `count`, `map`) | `client/ui/home.ts` | persistente no navegador |
| Sessão de login | cookie `oc_sessao` HttpOnly (o JS não lê) + tabela `session` (só o SHA-256) | `server/auth/sessions.ts` | 30 dias, renovado no uso |
| Dados efêmeros compartilhados | Redis: `ws:ticket:*` (30 s), `rl:*` (limites e bloqueios) | `server/api.ts`, `server/auth/password.ts` | segundos a minutos |
| Dados persistentes | PostgreSQL (`account`, `player_profile`, `player_stats`, `weapon_progress`, `session_participation`, `sanction`, `auth_event`, `map`, `map_version`...) | `server/accounts.ts` | permanente |

## Cliente: a closure do `boot()`

Exemplos reais de estado da partida guardado como `let` dentro do `boot()` (`client/main.ts`): `simTime`, `shots`, `hits`, `kills`, `points`, `lastTtk`, `killerId`, `myCorpseId`, `deathMessage`, `boostEnds` (cereja), `humanity` (rato), `potionKind`/`potionEnds`/`potionReady`, `duckAmmo`, `aimEnds`, `grenadeSeq`, `secondThrowIn` (Dose Dupla), `loadout`, `guns` (um `Weapon` por espaço, cada um com o seu pente), `slot`/`weapon` (arma em mãos), `drawT` (tempo de saque), `grenadeData`, `knifeForm`, `shake`, `pausedAt`, `stateTimer`. Funções internas (`refreshMaxHealth`, `startBoost`, `applyPotion`...) leem e escrevem essas variáveis diretamente. Ver [[ADR - Bootstrap do cliente numa única closure]].

**Reset**: não existe "reiniciar partida" em memória; "Sair para o início" fecha a conexão e chama `location.reload()`.

### Relógio do jogo

`clock()` em `client/main.ts` devolve `conn.serverNow() / 1000` online e `simTime` offline. Tempos de coletáveis, poções e peixes usam esse relógio, para que online todos vejam o mesmo (`MapFrame.time`). Offline, `simTime` para quando o menu está aberto (a simulação pausa).

### Quem manda em quê (online)

O cliente **sobrescreve** sua vida com a do servidor a cada `snap` (`if (!player.dead) player.health = mine.h`), e a morte/respawn segue as mensagens `kill`/`spawned`. O cliente é dono só da própria posição/orientação (enviada a 20 Hz). Ver [[Client Server Model]] e [[Synchronization]].

## Servidor

- `Session` guarda tudo da partida em memória; nada da partida (kills da sessão, corpos) vai para o banco, só o **delta do progresso da conta** (`ProgressDelta`) e a participação (`session_participation`).
- O `delta` é zerado ao gravar; em falha, `mergeDelta` o devolve para a próxima tentativa (`server/app.ts`).
- Reiniciar o processo perde as sessões (elas abrem de novo sob demanda); os mapas e as versões ficam no banco.

## Settings (`localStorage`)

`loadSettings()` mescla o salvo com `DEFAULTS` (e mescla `keybinds` ação por ação, para não perder padrões de ações novas); `saveSettings()` grava JSON. Ambos ignoram erros de armazenamento indisponível. A chave tem versão no nome (`.v1`). Campos: sensibilidades, FOV, inverter Y, volume, áudio espacial, qualidade, opções de toque, assistência de mira, tela cheia, segurar para mirar, sensibilidade do controle, `keybinds`, `keyLabels`. Ver [[Settings]] e [[Configuration]].

A home remove chaves antigas da era sem contas: `oc.name`, `oc.sex`, `oc.profile` (`client/ui/home.ts`).

## Riscos

- Estado espalhado em dezenas de variáveis da closure, sem fronteira explícita; fácil esquecer de zerar algo na morte/respawn (o commit `d7bc9d1` "block second throw after death" corrigiu exatamente um caso assim: `secondThrowIn = null` ao morrer).
- Estado de partida só em memória no servidor: sem recuperação após queda.

## Código relacionado

- `client/main.ts` (variáveis `let` do `boot`, `clock`, `respawn`)
- `client/core/settings.ts`, `client/ui/home.ts`, `client/gameplay/progress.ts`
- `server/session.ts` (`SPlayer`, `Corpse`), `server/progress.ts` (`LiveAccount`), `server/app.ts` (`flush`)

Ver também: [[Player Data]], [[Save System]], [[Cache]], [[Sessions]].
