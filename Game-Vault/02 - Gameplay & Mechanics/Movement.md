---
title: Movement
type: mechanic
status: documented
area: gameplay
source_paths:
  - shared/movement.ts
  - shared/constants.ts
  - client/entities/localPlayer.ts
  - client/main.ts
  - shared/appearance.ts
  - client/world/hydrant.ts
tags:
  - game
  - gameplay
  - movement
updated: 2026-10-05
---

# Movement

> [!info] Evidência
> Código confirmado em `shared/movement.ts` (passo de movimento puro), `client/entities/localPlayer.ts` (dano de queda, passos, morte por "void") e `client/main.ts` (montagem do `MoveInput`). Valores de [[Constants Reference]] (`MOVE`).

## Objetivo

Movimento de FPS arcade em primeira pessoa: andar, correr, agachar, pular, **deslizar** (slide) e subir degraus/rampas automaticamente, com sensação "seca" (para quase instantaneamente no chão) e controle aéreo reduzido.

## Como o jogador interage

| Ação | Tecla padrão | Controle | Observação |
|---|---|---|---|
| Andar | W A S D | analógico esquerdo | direção relativa ao yaw da câmera |
| Correr (sprint) | Shift esquerdo | L3 | só para frente (`forward > 0`) |
| Agachar | C | ◯/B | **não** fica em Ctrl (Ctrl+W fecha a aba) |
| Pular | Espaço | ✕/A | |
| Deslizar | C enquanto corre | ◯/B correndo | ver "Slide" |

Teclas configuráveis: ver [[Input & Controls]]. Toque: ver [[Touch Controls]].

## Regras

### Velocidades (m/s)

| Estado | Velocidade base |
|---|---|
| Andando | 5,5 |
| Correndo | 8,0 |
| Agachado | 2,8 |
| Mirando (ADS) | 3,5 |
| Slide (pico) | até 10,5 |

A velocidade final = base × `speedMul`, onde `speedMul = movimento da arma (1,0 no rifle) × speedMul do corpo (0,75 sem uma perna, modo PCD) × poção (1,3 "veloz", 0,7 "lerdo")`. Ver [[Buffs & Debuffs]] e [[Character Customization]].

Prioridade da velocidade base: agachado > mirando > correndo > andando.

### Aceleração

- No chão: aceleração de 60 m/s² em direção à velocidade-alvo (parada quase instantânea).
- No ar: 30% dessa aceleração (`airControl 0.3`).
- No ar (e no tick do pulo) as teclas **mudam a direção mas nunca freiam abaixo da velocidade que se tinha** — preserva o embalo de *sprint-jump* e *slide-jump*. Ao aterrissar, freia normalmente.

### Sprint

Corre se: tecla de sprint pressionada **e** movendo para frente **e** não agachado **e** sem mirar **e** sem slide **e** (no chão **ou** já correndo). Ou seja, pular durante o sprint mantém o sprint no ar.

O sprint é cancelado no mesmo tick em que o jogador puxa o gatilho, faz um golpe de faca ou mira (ver [[Combat]]).

### Agachar

- Colisor (cilindro) passa de 1,8 m para 1,2 m de altura, mantendo os pés no lugar.
- Altura do olho: 1,65 m em pé → 1,05 m agachado, suavizado (`crouchTransition 10`).
- Levantar exige espaço livre acima (5 raios para cima); embaixo de algo baixo o jogador continua agachado.
- Pular enquanto agachado: levanta (se houver espaço) em vez de pular.
- Andar agachado **não faz som de passos** (ver [[SFX]]).

### Pulo

- Altura de 1,1 m com gravidade de 22 m/s² (velocidade inicial √(2·22·1,1) ≈ 6,96 m/s).
- Só pula no chão e não agachado; borda de subida da tecla (segurar não repete).
- Teto: bater a cabeça zera a velocidade vertical.

### Slide

Pressionar agachar **enquanto corre no chão** (ou com velocidade horizontal > 6 m/s), sem cooldown e sem investida de faca ativa:

- Velocidade = min(10,5, max(velocidade atual, 8 × speedMul) + 2,2) na direção do movimento atual.
- Atrito de 7,5 m/s² vai reduzindo a velocidade; as teclas giram a direção no máximo 1,2 rad/s.
- Termina se: soltar agachar, pular (mantém o embalo = *slide-jump*), sair do chão, passar de 0,9 s, cair abaixo de 3,4 m/s, ou começar uma investida de faca.
- Cooldown de 0,5 s depois de terminar.
- **É possível mirar e atirar deslizando.**
- Efeitos: som de slide conforme o material do chão, poeira (ver [[Particles]]).

### Degraus, rampas e chão

- Sobe degraus de até 0,4 m automaticamente; rampas até 45°.
- O movimento segue o plano da rampa (mesma velocidade subindo e descendo).
- Movimento em **duas passadas** por tick (desloca pairando + assenta no chão medido), em vez do *snap-to-ground* do Rapier — decisão documentada em [[ADR - Movimento em duas passadas com assentamento próprio]].
- Sobreposição com outros personagens (ex.: boneco que renasceu em cima do jogador) é resolvida empurrando o jogador para fora até 8 cm por tick.

### Queda

- Dano de queda acima de **6 m**: `round((altura − 6) × 15 + 10)`. Ex.: 8 m → 40 de dano; 12 m → 100 (mata quem está com 100 de vida). Ver [[Damage System]].
- Cair abaixo do `killY` do mapa ("void") mata (online é relatado como 9999 de autodano).

### Passos

Comprimento de passada 2,0 m andando e 2,6 m correndo; intensidade 0,8 (andando) / 1,3 (correndo) / 0 (agachado). Material do chão via raio para baixo. Ver [[Spatial Audio]].

## Estados possíveis

`grounded`, `crouched`, `sprinting`, `sliding`, `jumped` (evento), `landed` (evento, com `fallHeight`), `slideStarted` (evento). Bloqueado: durante a [[Humiliation]] todas as entradas de movimento são zeradas; morto: nada é simulado.

## Entradas

`MoveInput`: `forward`, `right` (−1..1), `jump`, `crouch`, `sprint`, `ads`, `yaw`, `speedMul`, `lunge` (investida da [[Melee]], que sobrescreve a velocidade horizontal).

## Saídas

Nova posição do corpo cinemático, eventos de pulo/aterrissagem/slide, dano de queda, passos. Online, a posição dos pés é enviada ao servidor a 20 Hz junto com flags (agachado, correndo, slide...) — ver [[Replication]].

## Dependências

- Física Rapier (`KinematicCharacterController`) — ver [[Shared Systems]].
- [[Health System]] (dano de queda), [[Melee]] (investida), [[Buffs & Debuffs]] (velocidade), [[Character Customization]] (PCD perna).
- Hidrantes da [[Map - Rua dos Vizinhos]] lançam o jogador para cima (`LocalPlayer.launch`, velocidade vertical 15 m/s ≈ 5 m) — ver [[Map Gags]].

## Exceções

- **Movimento é confiado ao cliente online**: o servidor não simula movimento ainda (comentário de `server/session.ts`). Ver [[Anti Cheat]] e [[Trust Boundaries]].
- O módulo foi escrito para rodar também no servidor ("Pure function of (state, input, dt)"), mas hoje só o cliente e os bots o usam.
- Bots usam o mesmo `stepMovement` (ver [[NPC Behavior]]).

## Código relacionado

- `shared/movement.ts` — `stepMovement`, `createMoveState`, `configureController`, `eyeHeight`, `feetY`.
- `client/entities/localPlayer.ts` — `LocalPlayer.fixedStep` (queda, passos, regen, void), `launch`.
- `client/main.ts` — montagem do `MoveInput` no tick de simulação (60 Hz, `SIM.dt`).

## Configurações relacionadas

`MOVE.*` e `SIM.*` em `shared/constants.ts`; `EFFECTS.legLossSpeed` em `shared/appearance.ts`; `POTION.fastSpeed/slowSpeed`. Tabela completa em [[Constants Reference]].
