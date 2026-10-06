---
title: ADR - Simulação em passo fixo com render interpolado
type: decision
status: documented
area: decisions
source_paths:
  - client/core/loop.ts
  - shared/constants.ts
  - client/world/physics.ts
  - client/main.ts
  - README.md
tags:
  - decision
  - adr
  - simulation
  - loop
updated: 2026-10-05
---

# ADR - Simulação em passo fixo com render interpolado

## Contexto

Movimento, física (Rapier), arma, bots e granadas precisam se comportar igual em qualquer taxa de quadros (30 FPS no celular, 120+ FPS com GPU dedicada — README).

## Problema

Um passo variável (`dt` do quadro) torna física e regras dependentes do FPS e dificulta reproduzir/medir comportamento.

## Opções consideradas

- Passo variável por quadro.
- Passo fixo com acumulador e interpolação na renderização (adotada).

## Decisão

`startLoop(step, render)` em `client/core/loop.ts`:

- `step(SIM.dt)` com `SIM.dt = 1/60` (`shared/constants.ts`), repetido enquanto houver tempo acumulado;
- no máximo `SIM.maxStepsPerFrame = 5` passos por quadro; se atingir, zera o acumulador ("spiral-of-death guard");
- `frameDt` limitado a 0,25 s;
- `render(alpha, frameDt)` com `alpha = acc / SIM.dt` para interpolar entre os dois últimos estados.

O mundo Rapier usa `timestep = 1/60` (`client/world/physics.ts`). README: "Controlador em primeira pessoa (Rapier, passo fixo de 60 Hz, render interpolado)".

## Motivo

Determinismo de jogabilidade entre aparelhos; o mesmo `stepMovement` serve ao jogador e aos bots; medições como a varredura de 260 mil ticks citada no README dependem de um passo constante.

## Consequências

- Positivas: física estável; regras em segundos de simulação (`simTime`), que pausam com o menu offline.
- Negativas: em aparelhos muito lentos (> 5 passos atrasados) o jogo desacelera em vez de pular; tudo que é visual precisa guardar `prev`/`curr` para interpolar (padrão visível em `Bot`, `Dummy`, `LocalPlayer`).
- O servidor tem um relógio separado (20 Hz por `setInterval`, `NET.tickRate`), não sincronizado com o passo do cliente.

## Código afetado

`client/core/loop.ts`, `shared/constants.ts` (`SIM`), `client/world/physics.ts`, `client/main.ts` (`step`, `render`), entidades com `prev/curr`.

Ver também: [[Client Architecture]], [[Movement]], [[CPU]].
