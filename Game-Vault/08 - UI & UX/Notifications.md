---
title: Notifications
type: system
status: documented
area: ui
source_paths:
  - client/ui/hud.ts
  - client/ui/chat.ts
  - client/ui/home.ts
  - client/ui/strings.ts
  - client/main.ts
tags:
  - game
  - ui
  - notifications
updated: 2026-10-05
---

# Notifications

Mensagens que avisam o jogador de algo que aconteceu. Não há sistema central de notificações nem fila com prioridade: cada tipo tem seu próprio elemento no [[HUD]], chamado diretamente pelo código de gameplay em `client/main.ts`. Todos os textos vêm de `client/ui/strings.ts` (pt-BR/en).

## Tipos

| Canal | Elemento | Duração | Usado para |
| --- | --- | --- | --- |
| **Kill feed** | `#killfeed` (`hud.killfeed`) | some aos 5 s (removido aos 5,6 s); máx. 5 linhas | "Matador [Arma] ícone Vítima". |
| **Aviso no feed** | `#killfeed` (`hud.notice`) | some aos 4 s | Linhas simples: entrada/saída de jogadores, bônus, limites, depuração. |
| **Banner** | `#banner` (`hud.showBanner`) | 1,8 s | Momentos grandes, com variante visual `bird`, `taunt` ou `level`. |
| **Pop-ups de pontos** | `#popups` (`hud.popup`) | 1,6 s cada; total some 2 s após o último | "+N Motivo" e soma acumulada. |
| **Status de rede** | `#net-status` | até mudar | Conexão perdida ou encerrada. |
| **Linhas do sistema no chat** | `#chat-log` (`chat.system`) | 10 s visíveis | Recusas de chat, aviso de mira. Ver [[Chat]]. |
| **Status da tela inicial** | `#home-status` | até a próxima ação | Conexão, erros de conta. Ver [[Menus]]. |
| **Tela de morte** | `#death` | até renascer | Ver [[Flow - Death and Respawn]]. |

## Kill feed

- Ícones por tipo de morte (`KIND_ICON` em `main.ts`, `FEED_ICONS` em `hud.ts`): tiro na cabeça ✚, faca 🔪, virilha 🐦, humilhação 💃, granada/explosão 💣, cachorra 🐕; tiro comum, queda e vazio sem ícone.
- O nome da "arma" é o nome do nível equipado de quem matou (ex.: o nome do rifle no nível dele), "Dancinha da Vitória" para humilhações, "Mordida" para a cachorra Amora.
- O próprio jogador aparece como "Você".
- Mortes sem atacante (queda, vazio, explosão própria) aparecem como aviso "💀 {vítima}".

## Avisos (`hud.notice`)

Exemplos confirmados em `main.ts`/`strings.ts`: "{nome} entrou", "{nome} saiu", "🍒 Cereja do Dragão: +N de vida máxima por N s", fim da cereja/poção/mira afiada, "Máximo de {n} minas no mapa", "🐟 Peixe abatido: +N XP", "A mira volta com a próxima tecla ou clique", modos de depuração do F4.

## Banners (`hud.showBanner`)

| Variante | Exemplos |
| --- | --- |
| `bird` | "NO PÁSSARO!" (tiro na virilha) — ver [[Humiliation]] |
| `taunt` | "OPRIMIDO!" (fim de uma humilhação) |
| `level` | "{arma} nível {n}: {nome}!", "🏅 Conta nível {n}!", biscoito Scooby, humanidade, efeito da poção, mira afiada (carpa dourada / tiro ao alvo) — ver [[Progression]] e [[Buffs & Debuffs]] |

## Pop-ups de pontos

Cada prêmio do abate vira uma linha ("+N Abate", "Tiro na cabeça", "Longa distância", "No pássaro", "Facada", "Pelas costas", "Opressão") sob o retículo, e um total acumulado "+N" pulsa enquanto chegam novos prêmios. Online, os prêmios vêm do servidor junto da mensagem `kill`/`tauntEnd`. Valores em [[Scoring]].

## Feedback físico

Acertos e abates vibram o celular (`navigator.vibrate`, 12/40 ms; iOS ignora) e o controle (`gamepad.rumble`); dano recebido também vibra o controle. Ver [[Input & Controls]].

## Não existe

Não há notificações fora da partida (push, e-mail no jogo, convites de amigos, caixa de mensagens). Ver [[Live Game Structure]].

## Código relacionado

- `client/ui/hud.ts` — `killfeed`, `notice`, `showBanner`, `popup`, `setNetStatus`, `showDeath`.
- `client/main.ts` — `KIND_ICON`, `AWARD_TEXT`, chamadas de notificação.
- `client/ui/strings.ts` — textos.
