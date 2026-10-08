---
title: Character Models
type: asset
status: documented
area: art
source_paths:
  - client/character/character.ts
  - client/character/body.ts
  - client/character/builder.ts
  - client/character/rig.ts
  - client/character/registry.ts
  - client/character/material.ts
  - client/character/palette.ts
  - client/character/pieces/index.ts
  - client/character/pieces/jackets.ts
  - client/character/pieces/hair.ts
  - client/character/pieces/shoes.ts
  - client/character/pieces/headwear.ts
  - client/character/pieces/tactical.ts
  - tools/orcamento.ts
  - client/tests/polyBudget.test.ts
  - client/character/items/tops.ts
  - client/entities/avatar.ts
  - client/entities/dummy.ts
  - client/dev/audit.ts
  - shared/catalog.ts
  - docs/PERSONAGENS.md
tags:
  - game
  - art
  - characters
  - assets
updated: 2026-10-08
---

# Character Models

## Visão geral

Todo personagem do jogo (jogadores online, bots, bonecos de treino, corpos e o editor) é o mesmo modelo modular: **um corpo base com esqueleto** + **peças que usam o mesmo esqueleto** (roupas, cabelo, barba) + **itens rígidos presos em sockets** (chapéus, óculos, armas). Hoje **tudo é gerado em código** (`client/character/body.ts` e `client/character/pieces/`), "no mesmo formato de um GLB exportado do Blender" (`docs/PERSONAGENS.md`): trocar uma peça por um modelo real é apontar a `url` no registro (ver [[Asset Pipeline]]).

Estilo: low poly facetado, flat shading, cores sólidas da paleta, rosto feito de faces pintadas. Ver [[Art Direction]].

## Corpo base

- Dois corpos: `corpo_m` e `corpo_f` (`registry.ts`).
- Construído pelo `FacetBuilder` (`builder.ts`): torso de seção quadrada, deltoides, mãos com dedos "em escadinha" e morph de punho, pés com sola, cabeça com maxilar, nariz em planos, orelha em 2 planos, olhos de 3 faces, sobrancelhas.
- **Morphs:** `gordo` e `magro` (biotipo), `punho_L` e `punho_R` (mão fechada para segurar a arma), `rosto_<formato>` gerados automaticamente para tudo que vai sobre a cabeça (`withFaceMorphs`).
- **Altura:** escala o corpo inteiro (sem morph).
- **Regiões** (`_region`, 0 a 22, mais 31 = nunca esconder): permitem esconder a pele sob a roupa ou um membro no modo PCD, via shader. Ver [[Shaders]].

## Esqueleto e sockets

`BONES` (`rig.ts`), em T-pose, frente para −Z: `root`, `hips` (0,95 m), `spine`, `chest`, `neck`, `head`, `shoulder/upperArm/forearm/hand` (L e R), `thigh/shin/foot` (L e R).

| Socket | Osso | Uso |
| --- | --- | --- |
| `head` | `head` | chapéus, óculos, máscaras |
| `back` | `chest` | rifle nas costas |
| `hand_R` / `hand_L` | mãos | rifle, faca, granada |
| `wrist_L` / `wrist_R` | antebraços | pulseiras, relógios |

## Catálogo de peças

`shared/catalog.ts` (compartilhado com o servidor, que só aceita itens prontos). Contagem conferida executando o módulo: **306 itens, todos com `ready: true`**.

| Categoria | Itens | Orçamento de triângulos (LOD0, `audit.ts`) | Gerador |
| --- | --- | --- | --- |
| `cabelo` | 30 | 100–800 | `pieces/hair.ts` |
| `barba` | 6 | 20–300 | `pieces/hair.ts` |
| `camiseta` | 30 | 200–900 | `pieces/tops.ts` |
| `blusa` | 30 | 300–900 | `pieces/sweaters.ts` |
| `jaqueta` | 30 | 300–1000 | `pieces/jackets.ts` |
| `calca` | 30 | 250–700 | `pieces/bottoms.ts` |
| `short` | 30 | 150–700 | `pieces/bottoms.ts` |
| `calcado` | 30 | 0–450 | `pieces/shoes.ts` |
| `cabeca` | 30 | 40–450 | `pieces/headwear.ts`, `pieces/rigid.ts` |
| `acessorio` | 31 | 20–400 | `pieces/accessories.ts` |
| `tatico` | 29 | 40–800 | `pieces/tactical.ts` |

> [!note] Divergência
> `docs/PERSONAGENS.md` diz "336 itens"; o código atual tem 306.

Cada item declara: slots que ocupa, canais de cor (P primária, S secundária, D detalhe), nome pt/en, comprimento de manga (para os braços em primeira pessoa). Os arquivos `client/character/items/*.ts` ligam cada id do catálogo a um gerador, às regiões que esconde (`hides`), ao que cobre em outras peças (`over`) e às cores padrão dos canais.

### Camadas

De dentro para fora: cabelo e barba (0) < roupas de baixo e de cima (1) < calçado (2) < jaqueta (3) < acessórios e tático (4). `over` só esconde regiões de camadas inferiores: a jaqueta sobre as mangas da camiseta, a bota sobre a barra da calça, a máscara sobre a barba, a balaclava sobre o cabelo. Com chapéu, o cabelo é refeito "achatado" e o topo some.

## Do modelo ao jogo (bake + LOD)

| Estado | Malhas | Material | Uso |
| --- | --- | --- | --- |
| Vivo | uma `SkinnedMesh` por peça | `paintedMaterial` por peça (tints e máscara em uniforms) | editor, laboratório |
| Bakeado (`Character.bake()`) | **uma** `SkinnedMesh` por nível de LOD, cores finais nos vértices, triângulos escondidos removidos | `bakedMaterial()` compartilhado | jogo |

- O bake guarda vivos só os morphs `punho_L`/`punho_R`; qualquer mudança desfaz o bake sozinha.
- **LOD:** `THREE.LOD` com níveis a 0, 20 e 45 m (10 e 25 m com o detalhe Leve, `setCharacterDetail`, PF-35 L7; histerese de 10%). Os níveis distantes regeneram as peças com menos detalhe (`withLod`). Ver [[Performance Rendering]].
- Resultado (doc): 1 draw call por personagem + armas, 3,5–4,5 mil triângulos vestido.

### Níveis de longe de verdade (PF-35, T9 e P10)

Até a PF-35, várias peças feitas fora de `tube()` ignoravam o LOD (a lâmina do tronco das jaquetas, os painéis dos casacos, o manto e as mechas dos cabelos, os calçados, os chapéus) e o LOD1 de um visual tinha ~77% dos triângulos do LOD0. Agora, só nos níveis 1 e 2 (o LOD0 não mudou: 684 de 684 peças com o mesmo hash):

- `builder.ts`: esferas, cilindros e toros anexados com ¾ (LOD1) e ½ (LOD2) dos segmentos; bordas (punhos, barras, golas, cós) sem o lábio no LOD1 e sem a borda no LOD2; `lodThin` tira uma linha sim, outra não.
- `headShell` (cascas sobre a cabeça: cabelos, barbas, chapéus): as fechadas usam as 12 colunas da própria cabeça (alinhadas, para a cabeça não atravessar), as outras ¾.
- Jaquetas e casacos: tronco com ¾ das colunas e metade das linhas (½ das colunas no LOD2 só em frentes fechadas), uma linha onde o decote em V começa, painéis com ¾ e ½, forro só no LOD1; botões grandes e costuras finas somem.
- Cabelos (mechas triangulares e manto mais simples no LOD2), calçados (5 e 4 estações, seção de 4 pontos), chapéus e capacetes, calças (passadores, botão e costuras somem) e táticos (placas e faixas mais simples, sem espessura no LOD2).

| 200 visuais (semente 35) | LOD0 | LOD1 | LOD2 | LOD1/LOD0 (p90) | LOD2/LOD0 (p90) |
| --- | --- | --- | --- | --- | --- |
| Antes (p90) | 5.072 | 3.612 | 2.409 | 0,769 | 0,523 |
| Depois (p90) | 5.072 | 2.976 | 1.664 | 0,622 | 0,353 |
| Orçamento | 5.000 | 3.200 | 2.000 | 0,65 | 0,40 |

Visual padrão: 3.482 / 2.300 / 1.450 → 3.482 / 1.908 / 1.101. O LOD0 no p90 fica 1,4% acima de 5.000 (travado no medido +5%, P10). Medido por `bun tools/orcamento.ts` e travado em `client/tests/polyBudget.test.ts`. A maior folga que sobra está na cabeça do corpo no LOD1 (432 triângulos, as mesmas linhas e feições do LOD0).

> [!warning] Riscos conhecidos dos níveis de longe
> Jaqueta aberta a 4–7 mm da blusa por baixo; no LOD2 cada painel de saia de casaco tem 3 colunas e a calça pode encostar num joelho muito levantado; placas táticas sem espessura afastadas 1–6 cm do corpo no LOD2 (vistas de lado). Imagens de antes e depois na aprovação da PF-35.

## Onde aparece

| Uso | Código |
| --- | --- |
| Jogadores remotos, bots, corpos | `client/entities/avatar.ts` (`Avatar`) |
| Bonecos de treino (visual variado, rifle na mão) | `client/entities/dummy.ts` |
| Jogador local na humilhação (terceira pessoa) | `client/main.ts` |
| Braços em primeira pessoa | `client/render/viewmodelArms.ts` (mesmo corpo e mesmas luvas) |
| Editor de personagem | `client/ui/customize.ts` |

A hitbox **nunca** é a malha: são 15 formas simples num esqueleto de proporções padrão. Ver [[Damage System]].

## Código relacionado

- `client/character/character.ts` (`Character`, `bake`, `LOD_DISTANCES`)
- `client/character/body.ts` (`buildBody`, `BodyParts`, `buildHand`, `withFaceMorphs`)
- `client/character/builder.ts` (`FacetBuilder`, `withLod`)
- `client/character/rig.ts` (`BONES`, `SOCKETS`)
- `client/character/registry.ts` (`AssetRegistry`)
- `client/character/pieces/*.ts`, `client/character/items/*.ts`
- `shared/catalog.ts` (`CATALOG`, `SLOTS`, `READY_LISTS`)

## Ver também

[[Character Customization]] · [[Animation]] · [[Material Palette]] · [[Asset Pipeline]] · [[Player Data]]
