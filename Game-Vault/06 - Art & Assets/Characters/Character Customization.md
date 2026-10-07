---
title: Character Customization
type: asset
status: documented
area: art
source_paths:
  - shared/appearance.ts
  - shared/catalog.ts
  - shared/palette.ts
  - client/entities/avatar.ts
  - client/ui/customize.ts
  - client/render/viewmodel.ts
  - client/render/viewmodelArms.ts
  - client/character/character.ts
  - docs/PERSONAGENS.md
  - README.md
tags:
  - game
  - art
  - characters
  - customization
updated: 2026-10-05
---

# Character Customization

## Visão geral

O jogador monta o visual no **editor de personagem** (Perfil → Personalizar), "no espírito do Criar um Sim". O resultado é uma `Appearance` (versão 2), salva no banco e validada no servidor; no cliente, `appearanceToConfig` a converte num `CharacterConfig` que o modelo modular entende ([[Character Models]]). Esta nota cobre **o que pode ser escolhido visualmente**. Onde é salvo: [[Player Data]]. Tela e navegação: [[Menus]].

## Opções

| Grupo | Campo (`Appearance`) | Opções |
| --- | --- | --- |
| Sexo do corpo | (perfil, `Sex`) | `m`, `f` |
| Altura | `altura` | `pequeno` (escala 0,96), `medio` (1), `alto` (1,04) |
| Biotipo | `biotipo` | `magro`, `medio`, `gordo` (morphs) |
| Pele | `pele` | 8 tons (`skin1`–`skin8`) |
| Olhos | `olhos`, `olhosEstilo` | 8 cores de íris; 6 estilos: redondo, amendoado, marcante, caído, puxado, grande |
| Rosto | `rosto` | formato (oval, quadrado, redondo, longo, coração), sobrancelhas (reta, arqueada, grossa, fina), nariz (reto, largo, aquilino, arrebitado), boca (média, fina, carnuda), orelhas (normal, pequena, abano), marcas (nenhuma, sardas, cicatriz, pinta) |
| Cabelo | `cabelo` | 30 estilos (qualquer corpo) × 16 cores |
| Barba | `barba` | nenhuma ou 6 estilos (cor do cabelo) |
| Itens | `itens` (por slot) | 25 slots do catálogo, até 3 cores por item (P, S, D) |
| PCD | `pcd` | braço: nenhum, sem braço esq./dir., sem mão esq./dir.; perna: nenhuma, sem perna esq./dir. |

Slots: `tronco`, `sobreposicao`, `baixo`, `calcado`, `cabeca`, `rosto`, `orelhas`, `pescoco`, `pulsoE`, `pulsoD`, `maos`, `antebraco`, `cotovelos`, `ombro`, `ombros`, `colete`, `acessorioColete`, `peito`, `costas`, `cintura`, `coxaE`, `coxaD`, `joelhos`, `pes`, `pele` (tatuagens).

## Regras de combinação e cor

- `tronco`, `baixo` e `calcado` são **obrigatórios**.
- Dois itens no mesmo slot não convivem; um item que ocupa vários slots (ex.: capacete fechado = cabeça + rosto) libera os outros.
- **Paleta fechada:** toda cor salva é "encaixada" na cor mais próxima da família permitida (`snap` com distância RGB ponderada), no cliente e no servidor.
- **Regra de saturação:** a cor **primária** das peças grandes (`tronco`, `sobreposicao`, `baixo`) só aceita tecidos e couros (`CLOTH_COLORS`), nunca acentos. Secundária, detalhe e itens pequenos aceitam também metais e acentos.
- Canais não escolhidos usam o padrão do item (por exemplo, secundária = primária escurecida).

Famílias e valores em [[Material Palette]].

## O que a escolha muda no jogo

Cosméticos nunca mudam o jogo (comentário de `shared/catalog.ts`). Altura e biotipo são **só visuais**: hitbox, altura do olho e vida são iguais para todos (ver [[ADR - Altura e biotipo apenas visuais]]). Só o **modo PCD** tem efeito: o membro ausente não tem hitbox, recarga ×1,3 sem mão/braço e velocidade ×0,75 sem perna (`EFFECTS` em `shared/appearance.ts`). O editor mostra esses efeitos. Detalhes de regra em [[Health System]] e [[Movement]].

## Reflexos visuais da customização

- **Terceira pessoa:** o personagem inteiro, bakeado; online, cada jogador e o corpo caído aparecem como se personalizaram (README). Com uma mão só (PCD), o rifle fica numa mão: sem a direita, reto do lado esquerdo do peito, seguro pela mão esquerda, com o braço ou coto direito pendurado; sem a esquerda, o coto apoia o guarda-mão. Recarga com o rifle apoiado no corpo; granada e faca com o braço que sobra e o rifle nas costas (ver [[Animation]]).
- **Primeira pessoa:** os braços do viewmodel são do próprio personagem: tom de pele, manga longa da peça de cima (cobre o antebraço com punho) ou braço nu, luvas (as cheias substituem a mão, as sem dedo deixam a pele), e PCD (sem mão fica o antebraço; sem braço, nada; a faca passa para a mão esquerda e a granada para a direita por espelhamento; sem a mão direita, a arma fica espelhada do lado esquerdo da tela, com o ponto da mira no centro). Ver [[Weapon Models]].
- **Bots:** recebem um visual aleatório (`randomAppearance`).

## Editor (aspecto visual)

- Palco 3D com renderizador próprio e luz de três pontos (ver [[Lighting]]); arrastar gira, rolar aproxima; a câmera aproxima da parte editada.
- Cada opção é uma **miniatura renderizada do próprio personagem** com aquela troca, nas cores atuais: um renderizador fora da tela gera algumas por quadro (`toDataURL`), em cache por visual e enquadramento.
- "Exportar GLB" (`GLTFExporter`) baixa o personagem inteiro; "Copiar JSON" mostra o `CharacterConfig`.

## Código relacionado

- `shared/appearance.ts` (`Appearance`, `sanitizeAppearance`, `allowedColors`, `wear`, `armSleeve`, `armGlove`, `randomAppearance`, `bodyStats`, `EFFECTS`)
- `shared/catalog.ts` (`SLOTS`, `REQUIRED_SLOTS`, `BIG_SLOTS`)
- `shared/palette.ts` (`FAMILIES`, `snap`)
- `client/entities/avatar.ts` (`appearanceToConfig`)
- `client/ui/customize.ts` (editor e miniaturas). O palco (`Stage`) e o retrato (`renderPortrait`) também mostram o personagem na tela inicial ([[Menus]]).
- `client/render/viewmodel.ts` (`setBody`), `client/render/viewmodelArms.ts`

## Ver também

[[Character Models]] · [[Material Palette]] · [[Player Data]] · [[Menus]] · [[Progression]]
