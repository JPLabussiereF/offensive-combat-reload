---
title: AI Decisions
type: system
status: documented
area: ai
source_paths:
  - client/ai/bot.ts
  - client/ai/bots.ts
  - client/gameplay/spawnPicker.ts
  - shared/weapons.ts
  - shared/data/weapons/faca.json
  - shared/arsenal.ts
tags:
  - ai
  - bots
  - decisions
  - difficulty
updated: 2026-10-06
---

# AI Decisions

Como um bot decide **o que ver, para onde ir, para onde mirar e quando atirar**. Tudo em `client/ai/bot.ts`, salvo indicação. A estrutura é o ciclo descrito no topo do arquivo: **perceive → decide → mover/mirar → gatilho**.

## Ritmo

- `perceive()` + `decide()` rodam a cada **0,12 s** (`thinkT`, com fase inicial aleatória de até 0,15 s para os bots não pensarem juntos).
- Mira, movimento e gatilho rodam a **cada passo de 60 Hz**.

## Níveis de dificuldade (`BOT_SKILLS`)

| Parâmetro | `facil` | `normal` | `dificil` | Efeito |
| --- | --- | --- | --- | --- |
| `reaction` (s) | 0,55 | 0,35 | 0,20 | Atraso entre ver e o 1º tiro (×0,8–1,3; metade ao readquirir o mesmo alvo) |
| `turnSpeed` (rad/s) | 2,6 | 4,2 | 6,5 | Velocidade máxima de giro da mira |
| `aimError` | 6° | 3,5° | 1,8° | Erro inicial (×1,6 ao adquirir), decai com `exp(−1,2·dt)` |
| `recoilControl` | 0,3 | 0,6 | 0,85 | Fração do recuo vertical compensada |
| `burst` (s) | 0,2–0,35 | 0,3–0,5 | 0,45–0,7 | Gatilho apertado por rajada |
| `pause` (s) | 0,45–0,8 | 0,3–0,55 | 0,2–0,35 | Pausa entre rajadas |
| `headshotChance` | 5% | 15% | 30% | Mirar na cabeça (1,6 m) em vez do peito (1,15 m) |
| `fov` | 100° | 115° | 130° | Campo de visão |
| `tauntChance` | 35% | 50% | 65% | Ir dançar num corpo após um abate |

A dificuldade é escolhida na home (`facil`/`normal`/`dificil`, padrão `normal`) e vale para todos os bots da partida. Ver [[Versus Bots]].

## Percepção (`perceive`)

- Considera todos os `combatants()` vivos e **não protegidos**, a até **75 m** (distância horizontal).
- Fora do campo de visão, só percebe quem está a **menos de 4 m** ou quem **atirou nele nos últimos 2 s**.
- Linha de visão: raio do olho até o peito (1,15 m) ou a cabeça (1,6 m) do alvo, com grupos `BULLET → WORLD` (só o mapa bloqueia; personagens não). Considera visível se o impacto ocorre a menos de 0,3 m do alvo.
- Escolha do alvo: menor `distância × 0,6 (se já é o alvo atual) × 0,5 (se acabou de atirar nele)` — prefere manter o alvo e revidar.
- **Atingido por quem não vê** (nos últimos 0,3 s): registra a posição do atacante como última vista e o adota como alvo, virando para ele.
- Ao adquirir um alvo novo (ou readquirir): sorteia reação, erro de mira e se vai mirar na cabeça.

## Decisão de modo (`decide`)

Ver o diagrama em [[States]]. Regras:

1. **Dançando**: não decide nada.
2. **Alvo visível**: foge se `vida < 35`, alvo a > 5 m e 8 s desde a última fuga — destino: ponto aleatório da navmesh num raio de 5 m em torno de um ponto 14 m na direção oposta ao alvo (ou qualquer ponto), por 2–3,5 s. Senão, `engage`.
3. **Fuga em andamento**: continua.
4. **Visto há menos de 5 s**: `chase` até a última posição vista.
5. **Abate há menos de 6 s**: procura corpo disponível a < 22 m com > 2,5 s de janela; com probabilidade `tauntChance` vai dançar (`toTaunt`). A oportunidade é consumida mesmo se o sorteio falhar.
6. Caso contrário: `roam` para pontos aleatórios da navmesh (novo destino ao terminar o caminho).

## Movimento em combate (`engage`)

| Distância ao alvo | Movimento |
| --- | --- |
| > 24 m | Aproxima pela navmesh (recalcula a cada 1 s) |
| 7–24 m | Strafe lateral |
| 3,5–7 m | Recua na diagonal (para trás + lado) |
| < 3,5 m | Avança para a faca (frente + meio lado) |

- Troca o lado do strafe a cada 0,5–1,4 s; nessa troca, 18% de chance de agachar por 0,6–1,4 s.
- Mira (ADS) se o alvo está a mais de 12 m.
- **Faca**: a menos de 2,2 m, se o cooldown permite (`MELEE.faca.intervalo + 0,3` s). O `BotManager.stab` confere o alcance da faca (`alcance + 0,4` m), aplica dano letal e o bônus "pelas costas" se for o caso.
- Fora de combate, corre (`sprint`) em `roam`/`flee` quando faltam mais de 8 m de caminho; em `chase`, olha para a última posição vista.

## Mira

- Ângulo desejado = direção ao ponto de mira + ruído (`aimNoise`) − recuo × `recoilControl`.
- Giro limitado a `turnSpeed × dt` em yaw e pitch; o erro restante (`aimError`) decide o gatilho.

## Gatilho

Só atira em `engage`, com alvo visível, depois do tempo de reação e fora da animação da faca. Atira quando o erro de mira está dentro de um cone de `2,5° + 0,6 / max(3, dist)` rad; segura por uma rajada (×1,8 se o alvo está a menos de 10 m) e pausa. Recarrega com pente vazio, ou fora de combate com menos de 40% do pente da arma. Com uma arma semiautomática (a pistola), o gatilho é solto a cada tick para cada aperto valer um tiro. O disparo passa pelo mesmo `Weapon` do jogador (cadência, dispersão, recuo da arma sorteada para a vida, `gunStats` sem melhorias) e é resolvido pelo `BotManager.fire` com `traceShot` (inclui penetração), `computeDamage` e prêmios iguais aos do servidor (abate, cabeça, virilha, longa distância).

## Spawn

`BotManager.pickSpawn` usa `pickSafeSpawn` (`client/gameplay/spawnPicker.ts`) contra todos os outros combatentes vivos. Pontuação por ponto: ruído aleatório 0–4 + distância ao mais próximo (até 60), −1000 a menos de 2 m de alguém (na prática, nunca), −25 com alguém a menos de 15 m, −20 se alguém tem visão direta da cabeça do ponto; sorteia entre os três melhores. Ver [[Spawn Design]].

## O que a IA não decide

Usar granadas, minas, coletáveis, poções ou cobertura explícita (não há busca de cobertura; o "recuar" é geométrico). Não há comunicação entre bots nem times.

## Riscos / ajustes

- Constantes de comportamento (75 m, 4 m, 35 de vida, 24/7/3,5 m, 0,12 s...) são literais no código, sem configuração externa. Ver [[Constants Reference]].
- Regra de regeneração dos bots com valores literais (4 s, 25/s) em `bots.ts`, em vez de `HEALTH` (`shared/constants.ts`). Ver [[Technical Debt]].

## Código relacionado

- `client/ai/bot.ts` (`BOT_SKILLS`, `perceive`, `visibleFrom`, `decide`, `setGoal`, `fixedUpdate`)
- `client/ai/bots.ts` (`fire`, `stab`, `hit`, `kill`, `pickSpawn`, `protect`)
- `client/gameplay/spawnPicker.ts` (`pickSafeSpawn`)

Ver também: [[AI Overview]], [[NPC Behavior]], [[Navigation]], [[Combat]], [[Damage System]].
