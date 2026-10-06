---
title: Aim Assist
type: mechanic
status: documented
area: gameplay
source_paths:
  - client/gameplay/aimAssist.ts
  - client/tests/aimAssist.test.ts
  - client/main.ts
  - client/core/settings.ts
tags:
  - game
  - gameplay
  - aim-assist
  - accessibility
updated: 2026-10-05
---

# Aim Assist

> [!info] Evidência
> Código confirmado: `client/gameplay/aimAssist.ts` (`AimAssist`, `ASSIST`), uso em `client/main.ts` (render), opção `aimAssist` em `client/core/settings.ts`. Coberto por `client/tests/aimAssist.test.ts`.

## Objetivo

Ajudar quem joga com **toque ou controle** a manter a mira sobre um inimigo, no estilo de console, **sem nunca puxar a mira até alguém**. Nunca vale para o mouse.

## Como o jogador interage

Configurações → **Assistência de mira** (desligada por padrão). Funciona enquanto o dispositivo ativo não é o mouse (`gamepad.device !== 'mouse'`). Ver [[Settings]].

## Regras

Dois efeitos, só quando o retículo já está sobre (ou bem ao lado de) um inimigo vivo:

1. **Desaceleração (slowdown)**: a sensibilidade da mira cai para **40%** sobre o corpo e volta a 100% linearmente até o dobro da "bolha".
2. **Rastreamento (tracking)**: enquanto o jogador está mirando ativamente (entrada de olhar ou de movimento nos últimos 0,3 s), a visão acompanha **60%** do movimento angular do alvo, limitado a **1,6 rad/s**, e só se for o mesmo alvo e o mesmo ponto do corpo do quadro anterior.

| Parâmetro (`ASSIST`) | Valor |
|---|---|
| `slow` | 0,4 |
| `radius` (meia-largura da bolha) | 0,35 m |
| `minAngle` | 0,015 rad |
| `follow` | 0,6 |
| `maxRate` | 1,6 rad/s |
| `heights` (pontos checados) | 1,6 / 1,25 / 0,95 m (cabeça, peito, quadril) |
| `range` | 90 m |

- Bolha angular = `atan2(0,35, distância) + 0,015`. O alvo escolhido é o de menor erro relativo à bolha.
- Alvos a menos de 0,5 m ou mais de 90 m são ignorados.
- Mudar de ponto (peito → cabeça) não conta como movimento.

## Estados possíveis

Sem alvo (efeito nulo) / sobre alvo (desacelera) / sobre alvo e mirando (desacelera + rastreia).

## Entradas / Saídas

Entradas: posição da câmera, yaw/pitch, alvos (`targets()`), `dt`, se está mirando. Saída: `{ slow, dYaw, dPitch }` aplicados ao giro da câmera no quadro de render.

## Dependências

[[Input & Controls]], [[Touch Controls]], [[Settings]], [[Camera]].

## Exceções

- Não verifica linha de visão: considera qualquer alvo vivo no alcance (inferência pela leitura do código; o efeito só existe com o retículo já sobre o alvo).
- Desativado durante a dança e morto (o bloco de mira só roda vivo e sem [[Humiliation]]).

## Código relacionado

- `client/gameplay/aimAssist.ts` — `AimAssist.update`, `ASSIST`.
- `client/main.ts` — chamada no `render` (com `settings.aimAssist` e `lastAimInput`).
- `client/tests/aimAssist.test.ts` — testes ([[Unit Tests]]).

## Configurações relacionadas

`settings.aimAssist` (padrão `false`). Ver [[Constants Reference]].
