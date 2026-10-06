---
title: Voice
type: concept
status: documented
area: audio
source_paths:
  - client/audio/sfx.ts
  - client/world/hauntedTown.ts
  - client/world/halloween.ts
  - client/ui/chat.ts
tags:
  - game
  - audio
  - voice
updated: 2026-10-05
---

# Voice

## Não existe no código atual

- **Não há voice chat** entre jogadores: nenhuma chamada a `getUserMedia`, WebRTC (`RTCPeerConnection`) ou captura de microfone em `client/`, `server/` ou `shared/` (verificado por grep).
- **Não há falas gravadas nem síntese de voz** (`speechSynthesis`): nenhum arquivo de áudio existe no projeto.
- **Não há locução** de anúncios ("headshot", "double kill" etc.): esses momentos usam texto na tela ([[Notifications]], [[HUD]]) e efeitos ([[SFX]]).

A comunicação entre jogadores é feita pelo [[Chat]] de texto da sessão online.

## O que existe no lugar: "vozes" cartunescas

Personagens do mapa [[Map - Vila Assombrada]] "falam" com balões de fala na tela acompanhados de sons procedurais que imitam fala, sem palavras:

| Som | Quem | Descrição |
| --- | --- | --- |
| `grumble()` | Bruxa (bronca), fantasma (fala), sino da capela ("EU JÁ OUVI."), resposta à buzina ("CHEGA.") | "Resmungo" de desenho animado: alguns bipes com formantes. |
| `ghostMoan()` | Fantasma da cova | "wooOOoo" ondulado sobre um sopro de vento. |
| `evilLaugh()` | Bruxa e abóbora gigante | "ha-ha-ha-HAAA" descendo de tom. |

Todos tocam posicionados no mundo (`sfx.at`, ver [[Spatial Audio]]). O texto dos balões é documentado em [[Map Gags]].

## Código relacionado

- `client/audio/sfx.ts` — `grumble`, `ghostMoan`, `evilLaugh`.
- `client/world/hauntedTown.ts` — ligações das falas da bruxa, fantasma, capela e buzina.
- `client/world/halloween.ts` — classes dos personagens (bruxa, fantasma) que chamam `talk`/`moan`/`scold`/`cackle`.
- `client/ui/chat.ts` — o canal de comunicação real entre jogadores (texto).

## Ver também

[[Audio Overview]] · [[Chat]] · [[Moderation]]
