---
title: Character Customization
type: asset
status: documented
area: art
source_paths:
  - shared/appearance.ts
  - shared/catalog.ts
  - shared/palette.ts
  - shared/color.ts
  - client/entities/avatar.ts
  - client/ui/customize.ts
  - client/ui/customize/rules.ts
  - client/ui/customize/itemThumbs.ts
  - client/ui/customize/lineup.ts
  - client/ui/colorPicker.ts
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
updated: 2026-10-08
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
- **Pele, cabelo e olhos na paleta:** a cor salva é "encaixada" na mais próxima da família (`snap` com distância RGB ponderada), no cliente e no servidor.
- **Cores das peças livres, com dois limites** (`clampItemColor` em `shared/color.ts`, PF-33): na cor **principal** das peças grandes (`tronco`, `sobreposicao`, `baixo`) a croma (máx − mín do RGB) fica até **0,55**, nada de neon (a mostarda, o tecido mais saturado da paleta, tem 0,54); em **todos** os canais de peça o brilho fica em V ≥ **0,12**, nada de preto puro (o preto da paleta tem 0,15). Uma cor fora do limite é ajustada mantendo o tom (a saturação desce até a borda; o escuro sobe até o piso), e ajustar de novo não muda nada. Toda a paleta antiga continua valendo sem mudança.
- A paleta continua como **sugestão** (`suggestedColors`): tecidos e couros na principal das peças grandes; mais metais e acentos no resto. É a paleta da casa do seletor e o que os bots vestem.
- Canais não escolhidos usam o padrão do item (por exemplo, secundária = primária escurecida ×0,72).

Famílias e valores em [[Material Palette]]. Decisão e medições: [[ADR - Editor de personagem leve com cores livres]].

## O que a escolha muda no jogo

Cosméticos nunca mudam o jogo (comentário de `shared/catalog.ts`). Altura e biotipo são **só visuais**: hitbox, altura do olho e vida são iguais para todos (ver [[ADR - Altura e biotipo apenas visuais]]). Só o **modo PCD** tem efeito: o membro ausente não tem hitbox, recarga ×1,3 sem mão/braço e velocidade ×0,75 sem perna (`EFFECTS` em `shared/appearance.ts`). O editor mostra esses efeitos. Detalhes de regra em [[Health System]] e [[Movement]].

## Reflexos visuais da customização

- **Terceira pessoa:** o personagem inteiro, bakeado; online, cada jogador e o corpo caído aparecem como se personalizaram (README). Com uma mão só (PCD), o rifle fica numa mão: sem a direita, reto do lado esquerdo do peito, seguro pela mão esquerda, com o braço ou coto direito pendurado; sem a esquerda, o coto apoia o guarda-mão. Recarga com o rifle apoiado no corpo; granada e faca com o braço que sobra e o rifle nas costas (ver [[Animation]]).
- **Primeira pessoa:** os braços do viewmodel são do próprio personagem: tom de pele, manga longa da peça de cima (cobre o antebraço com punho) ou braço nu, luvas (as cheias substituem a mão, as sem dedo deixam a pele), e PCD (sem mão fica o antebraço; sem braço, nada; a faca passa para a mão esquerda e a granada para a direita por espelhamento; sem a mão direita, a arma fica espelhada do lado esquerdo da tela, com o ponto da mira no centro). Ver [[Weapon Models]].
- **Bots:** recebem um visual aleatório (`randomAppearance`).

## Editor (aspecto visual)

- **Palco 3D** com renderizador próprio e luz de três pontos (`client/ui/customize/lights.ts`, ver [[Lighting]]); arrastar gira, rolar aproxima; a câmera aproxima da parte editada. Desenha **só quando algo muda** (arraste, troca, câmera deslizando, animação diferente de Parado), com DPR até 1,5 e sem quadros fora da tela. Uma troca de cor muda só o uniform da cor (`Character.setColor`); o personagem só é remontado quando a peça, o corpo ou o rosto mudam.
- **Cartões só com a peça** (fora do Modo PCD), nas cores padrão do catálogo: a peça montada sozinha no esqueleto (`CharacterConfig.bodyless`), parada, enquadrada pela própria caixa, com o lado de dentro escuro. Tatuagens e luvas num **manequim de argila**; cabelo, barba, traços do rosto, brincos e piercings numa **cabeça de argila** (`Character.hideBody` esconde o corpo abaixo do pescoço); "Nenhum" (também barba e marcas) e "Descalço" são ícones. Desenhados num render target do renderer do palco (2× e reduzidos para 144 px, WebP), uma vez por versão do jogo, e guardados no IndexedDB "oc-personagem" (chave `item:<id>:<sexo>`); em segundo plano, nos momentos livres, com os visíveis primeiro. O cartão da **peça vestida** segue as cores escolhidas (o penteado e a barba vestidos, a cor do cabelo) e é redesenhado quando a cor é confirmada. O **Modo PCD** é a única aba com o personagem do jogador nos cartões. Ver [[UI Assets]].
- **Altura e biotipo** numa parede de reconhecimento em SVG: régua de 1,40 a 2,00 m, três silhuetas (1,73 / 1,80 / 1,87 m = `EFFECTS.heightScale` × 1,80 m; no biotipo, larguras diferentes na altura do jogador), a escolhida em laranja com a placa, e a nota "Só visual: hitbox e mira iguais para todos".
- **Cores das peças:** uma ficha por canal (Principal, Secundária, Detalhe); tocar abre o **seletor de cor do jogo** logo abaixo (um por vez): quadrado saturação × brilho com a região proibida hachurada (o cursor para na borda e um aviso diz por quê), faixa de matiz, antes/agora (tocar em "antes" desfaz), paleta da casa em grupos (Neutros, Terrosos, Frios, Couros, Metais, Acentos) com o nome de cada cor, "Combina", Recentes (10, guardados no navegador) e o código hex, nos quatro idiomas do jogo. Durante o arraste só o palco muda; ao soltar, a cor vai para o visual e para os Recentes. Mouse, toque, teclado e controle: ver [[Menus]]. Pele, cabelo e olhos continuam nas amostras da paleta.
- "Exportar GLB" (`GLTFExporter`) baixa o personagem inteiro; "Copiar JSON" mostra o `CharacterConfig`.

## Código relacionado

- `shared/appearance.ts` (`Appearance`, `sanitizeAppearance`, `choice`, `suggestedColors`, `DEFAULT_COLORS`, `wear`, `armSleeve`, `armGlove`, `randomAppearance`, `bodyStats`, `EFFECTS`)
- `shared/color.ts` (`clampItemColor`, `normalizeHex`, hex ↔ HSV, `MAX_CHROMA`, `MIN_VALUE`)
- `shared/catalog.ts` (`SLOTS`, `REQUIRED_SLOTS`, `BIG_SLOTS`)
- `shared/palette.ts` (`FAMILIES`, `snap`)
- `client/entities/avatar.ts` (`appearanceToConfig`, `colorKey`, `itemColorKeys`)
- `client/ui/customize.ts` (editor, `showCustomizer` → `{ dispose }`, `closeCustomizer`, `onCustomizerChange`). O palco (`Stage`) e o retrato (`renderPortrait`) também mostram o personagem na tela inicial ([[Menus]]).
- `client/ui/customize/rules.ts` (o que cada cartão mostra, chaves e assinatura, alturas), `itemThumbs.ts` (desenho e fila), `cardStore.ts` (IndexedDB), `lineup.ts` (parede), `lights.ts` (luz)
- `client/ui/colorPicker.ts` e `client/ui/colorPickerRules.ts` (seletor de cor)
- `client/character/character.ts` (`bodyless`, `hideBody`, `setColor`)
- `client/render/viewmodel.ts` (`setBody`), `client/render/viewmodelArms.ts`

## Ver também

[[Character Models]] · [[Material Palette]] · [[Player Data]] · [[Menus]] · [[Progression]] · [[ADR - Editor de personagem leve com cores livres]]
