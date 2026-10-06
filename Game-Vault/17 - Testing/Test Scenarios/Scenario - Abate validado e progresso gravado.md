---
title: Scenario - Abate validado e progresso gravado
type: reference
status: documented
area: testing
source_paths:
  - server/tests/game.test.ts
  - server/session.ts
  - server/progress.ts
  - server/accounts.ts
  - server/app.ts
  - shared/progression.ts
tags:
  - testes
  - cenario
  - progresso
updated: 2026-10-06
---

# Scenario - Abate validado e progresso gravado

**Objetivo:** confirmar que o progresso só vem de abates validados pelo servidor, que vai para a arma que matou e que é gravado no banco ao sair.

**Arquivo:** `server/tests/game.test.ts`, `it('o abate validado pelo servidor dá pontos à arma, XP à conta e estatísticas, gravados ao sair')`.

## Passos

1. Duas contas novas, "Atirador" (A) e "Alvo" (V), entram na sala `principal` (Rua dos Vizinhos).
2. A renasce em `[0,0,0]`, V em `[0,0,10]` (10 m de distância).
3. A manda a escolha do Arsenal `{secundaria: 'smg', ligadas: {rifle: ['silenciador']}}` — o silenciador não está liberado e é **descartado**: o `progresso` que volta tem `escolha = {secundaria: 'smg', ligadas: {}}`.
4. A envia `hit` na `cabeca` de V a 10 m com `w: 'rifle'`, a cada 100 ms (respeitando a cadência), até receber `kill`.
5. Verificações imediatas:
   - `kill.kind === 'head'` e `kill.arma === 'rifle'`;
   - mensagem `progresso` de A: `armas.rifle.xp` = soma dos `awards` do abate, `armas.rifle.nivel = 1`, `conta.xp = 25`.
6. Ambos enviam `leave`; espera 300 ms (gravação ao sair da sala).
7. `GET /api/perfil` de A: XP do rifle igual, `xp = 25`, `totais.abates = 1`, `totais.cabeca = 1`, participação mais recente na "Rua dos Vizinhos" com `abates: 1` e `saida` preenchida.
8. `GET /api/perfil` de V: `totais.mortes = 1`, XP do rifle 0.

## O que o cenário prova

- Autoridade do servidor sobre dano/abate e sobre a escolha do Arsenal ([[Client Server Model]]).
- O caso da arma secundária (dano e XP da pistola, acerto fora do loadout ignorado) está em [[Gameplay Tests]].
- Progresso por arma ([[Progression]]) e XP de conta (+25 por abate, conforme README).
- Gravação do delta no `leave` (`flush(..., close=true)`), ver [[Match Services]] e [[Save System]].

## Código relacionado

- `server/tests/game.test.ts`, `server/session.ts`, `server/progress.ts`, `server/accounts.ts` (`flushProgress`, `openParticipation`), `server/app.ts` (`leaveSession`)
