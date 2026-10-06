---
title: Interaction System
type: mechanic
status: documented
area: gameplay
source_paths:
  - client/main.ts
  - client/zombies/client.ts
  - client/core/keybinds.ts
  - client/gameplay/targets.ts
  - client/world/props.ts
  - client/ui/strings.ts
  - shared/maps.ts
tags:
  - game
  - gameplay
  - interaction
updated: 2026-10-06
---

# Interaction System

> [!info] Evidência
> Código confirmado: `client/main.ts` (prompt de contexto e ação `taunt`), `client/core/keybinds.ts`, `client/world/props.ts`.

## Objetivo

O jogo **não tem um sistema genérico de "usar objeto"**. A interação com o mundo acontece por três caminhos:

1. **Tecla de contexto** (ação `taunt`, padrão **E**): oprimir um corpo **ou** beber poção da bruxa.
2. **Encostar** (pés dentro de um raio): [[Pickups]] (cereja, biscoito), hidrante (lançamento), porta da Amora (mordida).
3. **Atirar / esfaquear** objetos do mapa: as piadas ambientais ([[Map Gags]]), o armário da cozinha, frutas, peixes, rato gigante, alvos.

## Como o jogador interage

### Tecla de contexto (E)

O mesmo botão faz coisas diferentes conforme o que está perto, nesta prioridade:

| Prioridade | Condição | Ação | Texto do prompt (pt-BR) |
|---|---|---|---|
| 1 | Corpo oprimível a ≤ 2 m dos pés (e diferença de altura ≤ 1,5 m) | Começa a dança — ver [[Humiliation]] | `[E] Oprimir {nome}` (barra = tempo restante da janela de 6 s) |
| 2 | Perto da bruxa (≤ 2,4 m, `POTION.radius`; diferença de altura < 1,5 m) e poção liberada | Bebe a poção — ver [[Buffs & Debuffs]] | `[E] Beber Poção` |
| — | Dançando | (mostra progresso) | `Oprimindo {nome}…` |

No [[Zombie|modo zumbi]] (sem opressão), o `E` vale antes de tudo isso, nesta ordem (`ZombieClient.press`/`hold`, `client/zombies/client.ts`): **segurar** sobre um colega caído (reanimar, 3 s); **apertar** no Caixão Misterioso (girar por $950 ou pegar a arma oferecida; o prompt diz se ela veio danificada); **segurar** numa brecha do muro do cemitério (erguer a barricada por $300 em 2,5 s, ou repregar tábuas de graça, 0,8 s cada). Enquanto segura E reanimando ou pregando, não atira. Tudo decidido pelo servidor online ([[Remote Calls]]: `revive`, `box`, `barricade`).

- A tecla é remapeável; o prompt mostra a tecla atual (`screens.keyName('taunt')`).
- Controle: △/Y. Toque: a própria caixa do prompt é o botão (ver [[Touch Controls]]).
- Bloqueada se no mesmo tick há intenção de tiro, golpe de faca, granada na mão ou já dançando.
- O nome interno da ação é `taunt` (no código), "Oprimir" na interface pt-BR e "Humiliate" em inglês.

### Encostar

| Objeto | Raio | Efeito |
|---|---|---|
| Cereja do Dragão | 1,2 m (+1,5 m de folga no servidor) | vida máx. +50 por 30 s |
| Biscoito Scooby | 1,1 m (+1,5 m) — só com o armário aberto | cura total |
| Hidrante jorrando | 0,65 m | lança ~5 m para cima |
| Porta da Amora | caixa da zona | morte instantânea |

### Atirar/esfaquear objetos

Objetos registrados no `PropBus` têm um callback `onShot` no colisor: a bala ou a faca dispara a piada e, online, ela é retransmitida para todos (`prop`). Ver [[Map Gags]] e [[Interactive Objects]].

## Regras

- Não há tecla de "usar" para portas, armas no chão ou caixas: nada disso existe.
- Online, toda interação com efeito de jogo (pickup, poção, rato, peixe, opressão) é **pedida ao servidor**, que confere distância e disponibilidade; o cliente reenvia no máximo a cada 800 ms enquanto espera.

## Estados possíveis

Sem prompt, prompt de opressão, prompt de poção, dançando.

## Entradas / Saídas

Entrada: ação `taunt`, posição dos pés. Saída: `hud.setPrompt(...)`, mensagens `taunt`/`tauntEnd`/`potion`/`pickup` online — ver [[Remote Calls]].

## Dependências

[[Humiliation]], [[Buffs & Debuffs]], [[Pickups]], [[Map Gags]], [[HUD]], [[Input & Controls]].

## Exceções

- O prompt só aparece com o ponteiro travado (jogo ativo) e com o jogador vivo.
- O corpo do próprio jogador nunca é oprimível por ele.

## Código relacionado

- `client/main.ts` — bloco "Context prompt" (render) e "Humiliation start" (tick), `nearPotion`, `drinkPotion`, `updatePickups`.
- `client/gameplay/targets.ts` — `nearestHumiliable`.
- `client/world/props.ts` — `PropBus`.
- `client/core/keybinds.ts` — `DEFAULT_KEYBINDS.taunt = KeyE`.
- `client/ui/strings.ts` — `promptTaunt`, `promptPotion`, `keyTaunt`.

## Configurações relacionadas

`HUMILIATION.radius`, `POTION.radius`, `CHERRY.radius`, `BISCUIT.radius`; `WITCHES`/`PICKUPS` em `shared/maps.ts`. Ver [[Constants Reference]].
