---
title: ADR - Áudio procedural em Web Audio
type: decision
status: documented
area: audio
source_paths:
  - client/audio/sfx.ts
  - client/main.ts
tags:
  - game
  - audio
  - decision
updated: 2026-10-05
---

# ADR - Áudio procedural em Web Audio

## Contexto

O jogo é um FPS de navegador em fase de protótipo ("Protótipo de tiro · Fase 1" no menu). Precisa de dezenas de sons (tiros, passos por material, granadas, piadas de mapa, interface) sem um pipeline de produção de áudio.

## Problema

Como ter feedback sonoro completo sem depender de arquivos de áudio, sem aumentar o download inicial e permitindo iterar rapidamente nos sons de cada nova piada de mapa?

## Opções consideradas

- **Arquivos de áudio (samples)** carregados por `fetch`/`decodeAudioData` ou `<audio>`. *Inferência*: não há nenhum vestígio dessa opção no código, mas o próprio comentário do `sfx.ts` cita um "futuro banco de samples".
- **Síntese procedural na Web Audio API** (escolhida).

## Decisão

Todos os sons são **gerados em código** na classe `Sfx` (`client/audio/sfx.ts`) a partir de osciladores, um buffer de ruído branco compartilhado, filtros biquad, envelopes de ganho e respostas de impulso sintéticas para eco. O comentário de topo do arquivo descreve-os como "procedural placeholder sounds", em que "cada função mapeia para uma futura entrada de banco de samples (`rifle_fire`, `dry_fire`, `rifle_reload`, ...)".

## Motivo

- "No asset files needed for the prototype" (comentário em `sfx.ts`): zero bytes de áudio para baixar.
- Variação gratuita: altura e filtros sorteados a cada disparo, evitando repetição.
- Parametrização: o mesmo método aceita material (`footstep(material)`), força (`grenadeBounce(força)`), tamanho e nota (`bell(tamanho, nota)`), urgência (`fuseBeep`).
- Interface estável: quem chama usa `sfx.gunshot()`; trocar a implementação por samples não muda os chamadores.

## Consequências

- O áudio só funciona após um gesto do usuário (`unlock()` no clique de JOGAR) — regra dos navegadores.
- Timbre "cartunesco"/sintético, coerente com o tom humorístico do jogo, mas distante de um som realista.
- Custo de CPU por som (criação de nós a cada disparo), mitigado pelo limite de 36 vozes espaciais.
- Não há música de fundo ([[Music]]) nem voz ([[Voice]]); trechos musicais também são sintetizados.
- `sfx.ts` cresceu para ~1100 linhas com um método por som: candidato a divisão por família se crescer mais.

## Código afetado

- `client/audio/sfx.ts`
- `client/main.ts` (`sfx.unlock()` em `screens.onPlay`)
- Mapas em `client/world/` que recebem o `Sfx`

Ver [[Audio Overview]] e [[SFX]].
