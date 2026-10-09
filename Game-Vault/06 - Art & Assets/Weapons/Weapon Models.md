---
title: Weapon Models
type: asset
status: documented
area: art
source_paths:
  - client/render/weaponModels.ts
  - client/render/viewmodel.ts
  - client/render/viewmodelArms.ts
  - client/entities/heldWeapons.ts
  - client/weapons/grenades.ts
  - client/weapons/mines.ts
  - client/character/registry.ts
  - shared/progression.ts
  - shared/data/progression.json
  - client/entities/avatar.ts
  - client/character/animator.ts
  - shared/arsenal.ts
  - shared/weapons.ts
  - client/main.ts
  - client/tests/viewmodelSwitch.test.ts
tags:
  - game
  - art
  - weapons
  - assets
updated: 2026-10-08
---

# Weapon Models

## Visão geral

Todas as armas são **modelos feitos de primitivas em código** ("placeholder art", comentário de `weaponModels.ts`), sem arquivos. Cada arma de fogo tem o seu modelo (rifle, pistola, submetralhadora e as cinco secundárias da PF-10); os sete rifles usam o mesmo modelo com a **pintura** de cada um, e as **melhorias** mudam a mira, o pente e o silenciador. Cada uma das sete facas tem o seu modelo, e a granada vira mina ou Dose Dupla. Os rifles pintados, as miras com aumento e as facas antigas voltaram das primeiras versões do jogo (PF-8; recuperados do histórico do git). Os mesmos modelos servem para a primeira pessoa (viewmodel) e para a terceira pessoa (o que os outros veem). Regras de jogo das melhorias: [[Weapons]] e [[Progression]].

## Armas de fogo

`gunParts(g)` monta o modelo de uma arma a partir de `GunLookKey` (`arma`, `mira`, `visual`, `silenciador`, `pente`, todos vindos de `gunStats`). `gunModelKey(g)` é a chave de cache com esses mesmos campos. Todas as armas têm o punho no mesmo lugar, então os braços, as poses e o suporte de terceira pessoa servem para todas. `holdOf(arma)` diz onde vai a mão de apoio, pelo `slot` do JSON: `longa` (guarda-mão: todo rifle), `curta` (empunhadura da submetralhadora) ou `pistola` (a mão esquerda envolve o punho: toda outra secundária). `GUN_MODELS` liga cada arma ao seu construtor; uma arma sem entrada cai no modelo do rifle (`client/tests/weapon.test.ts` confere que toda secundária tem o seu, na mão certa).

| Arma | Construção base | Pente | Silenciador |
| --- | --- | --- | --- |
| Rifle | receptor, cano, guarda-mão, coronha, empunhadura, faixa colorida; mira de ferro (massa e alça) | com mais de 30 balas (melhoria Pente), **dois pentes lado a lado com fita** | garrafa PET de 2 L verde com rótulo vermelho na boca do cano |
| Pistola | ferrolho com serrilhas, armação, punho de madeira, **chaveiro do porteiro** pendurado; massa de mira com ponto verde | pente curto no punho | **uma batata** na boca do cano |
| Submetralhadora | corpo branco de eletrodoméstico com faixa vermelha, botão de velocidade (1 a 5) na lateral, empunhadura frontal, coronha de arame | com mais de 40 balas (Pente Tambor), **tambor de pipoqueira** listrado de branco e vermelho | — |
| Grampeador do RH | **grampeador de escritório**: base cinza, braço preto com dobradiça atrás e lábio de aço na boca; etiqueta branca com **"RH"** em vermelho (letras de pixel) na lateral e um **post-it amarelo** colado em cima; punho preto da pistola | a barra de grampos prateada encaixada na base | a batata da pistola |
| Revólver do Delegado da Quadrilha | cano longo, armação de aço, cão, **tambor** com seis canaletas, **cabo de madeira** curvo; **estrela de delegado de lata** na lateral e um **lenço xadrez de festa junina** (vermelho e branco) amarrado sob o cano | o tambor (desce na recarga) | a batata da pistola |
| Furadeira do Vizinho de Domingo | **furadeira sem fio amarela e preta**: carcaça do motor, tampa traseira com respiros, anel de torque, mandril e **a broca como cano**; cabo preto com costas amarelas, gatilho vermelho e chave de sentido | **a bateria** (preta com faixa amarela) no pé do cabo | — (a progressão da submetralhadora não tem silenciador) |
| Garrucha do Cangaceiro | **dois canos lado a lado** com as bocas escuras, culatra de aço, dois cães, telha de madeira; **cabo curvo de couro** com **estrelas e meia-lua** douradas e tachas de latão, terminando num pomo de madeira; **lenço vermelho** amarrado no cabo | os dois cartuchos na culatra | a batata da pistola |
| Pistolão do Marombeiro | **pistola enorme cromada**: ferrolho grande com serrilhas e nervura; **munhequeira de academia** vermelha e branca no cabo; **adesivo "NO PAIN NO GAIN"** (amarelo, letras pretas de pixel) na lateral do ferrolho | pente grande no punho | a batata da pistola |

| Mira (`mira`) | Onde aparece | Detalhe visual |
| --- | --- | --- |
| `ferro` | sem melhoria de mira | massa e alça da própria arma |
| `pontoVermelho` | rifle (nível 2) e pistola (nível 3, versão mini, escala 0,65; o mesmo no grampeador, no revólver, na garrucha e no pistolão) | tubo com aros e ponto vermelho brilhante |
| `holo` | submetralhadora (nível 3; também na furadeira) | janela holográfica com **retículo de carinha feliz** amarelo |
| `luneta` | rifle (nível 4, opcional) | luneta do vovô em latão com lente azulada; mirando por completo, o modelo some e entra o overlay de luneta ([[Camera]]) |
| `holoLupa` | rifle (nível 7, opcional) | a holográfica de carinha feliz com uma **lupa** (tubo curto) atrás |
| `luneta2x` / `luneta4x` | rifle (níveis 8 e 9, opcionais) | lunetas de latão como a do vovô, mais curta (2x) e mais comprida e larga (4x); mirando por completo, o overlay de luneta. `isScope(mira)`: toda mira que começa com `luneta` |

A pintura vem do JSON de cada rifle (`visual`); as melhorias não a mudam.

| Pintura (`visual`) | Rifle | Detalhe |
| --- | --- | --- |
| `padrao` | Rifle Padrão; as miras de todas as secundárias | metal escuro, madeira, faixa laranja (as secundárias da PF-10 têm cores próprias no construtor, sem `visual`) |
| `fita` | Remendado com Fita | voltas de fita cinza no guarda-mão e na coronha |
| `tia` | da Tia do Zap | branco e rosa, faixa verde-água, adesivo de florzinha na coronha |
| `natal` | Pisca-Pisca de Natal | madeira vermelha, faixa verde, fio de luzinhas coloridas (brilhantes) no guarda-mão e no cano |
| `chamas` | Tunado com Adesivo de Chama | preto fosco, faixa laranja, adesivos de chama nas laterais |
| `vovo` | do Vovô | metal azulado, madeira avermelhada, latão |
| `ouro` | Dourado Ostentação | todo dourado, um rubi de cada lado |

O pente duplo com fita aparece em qualquer rifle com mais de 30 balas (o Pente, ou o Dourado, que já tem 40).

- **Altura da linha de mira (`sightY`)** define a pose de ADS. As secundárias têm também uma distância de ADS própria (`adsZ`): pistola e grampeador −0,46, submetralhadora −0,42, furadeira −0,44, garrucha −0,46, pistolão −0,48 e revólver −0,5, "a pistol is held out farther".
- **Coice na tela**: o viewmodel dá um tranco para trás, para cima e para o lado a cada tiro; `viewmodel.kick(coiceVisual)` multiplica esse tranco (e o limite dele) pelo `coiceVisual` do JSON: revólver ×1,6, garrucha ×2, pistolão ×2,5; as outras ×1. Só visual: o recuo da mira é o `recuo` da arma ([[Weapons]]).
- **Letras de pixel** (`pixelText`, fonte 3×5 de caixinhas): o "RH" do grampeador e o "NO PAIN NO GAIN" do pistolão, no lado esquerdo da arma (o que a câmera de primeira pessoa vê).
- Partes que brilham (ponto vermelho, retículo, ponto da massa da pistola, lente) são `MeshBasicMaterial` e ficam fora do merge, "para continuarem claras".

Paletas em `LOOKS` (`weaponModels.ts`); ver também [[Material Palette]].

## Facas (7)

`knifeModel(faca)` com `faca` = `KnifeId`, segurado pelo punho na origem, apontando para −Z. Em primeira pessoa, as que não são `faca` são 20% maiores e usam o golpe em arco (`SWING_KEYS`) em vez da estocada.

| Faca | Construção |
| --- | --- |
| `faca` (padrão) | lâmina + ponta, guarda e cabo de madeira |
| `colher` | colher de pau: cabo fino e concha oval de madeira clara |
| `frango` | frango amarelo segurado pelos pés: corpo comprido, asas, pescoço, crista vermelha, bico aberto, olhos |
| `baguete` | cápsula de casca dourada com cinco cortes claros |
| `peixe` | peixe azul-acinzentado segurado pela cauda, com olho, barbatana e pontos de gelo |
| `macarrao` | cilindro de espuma verde de 60 cm, com o furo na ponta |
| `sabre` | cabo prateado e lâmina rosa-choque com brilho aditivo |

## Granadas e mina

| Item | Modelo | Fonte |
| --- | --- | --- |
| Granada de fragmentação (padrão) | corpo verde-oliva, cinta, espoleta, alavanca e argola | `grenadeModel` em `weapons/grenades.ts` |
| Mina terrestre (melhoria opcional, nível 2) | disco oliva, placa de pressão e LED vermelho que pisca | `mineModel` em `weaponModels.ts` |
| Dose Dupla (melhoria opcional, nível 3) | duas granadas lado a lado na mão | `Viewmodel.setGrenadeKind('dupla')` |
| Granada-pato (poção "pato") | pato amarelo de borracha | `duckModel` em `weapons/grenades.ts` |

Ver [[Grenades]], [[Land Mines]] e [[Buffs & Debuffs]].

## Primeira pessoa x terceira pessoa

**Modelo de longe (PF-35, T8 e P11):** a terceira pessoa usa o mesmo construtor com `farModel` ligado (`gunParts(g, true)`, `knifeModel(form, true)`): cilindros e cones com até 8 lados, esferas 6 × 4, aros 4 × 12, sem as letras de pixel ("RH", "NO PAIN NO GAIN") e sem as peças cuja maior medida fica abaixo de 1,5 cm ou aros de tubo fino (aros e ponto do ponto vermelho, bolinhas da batata, tachinhas, miras de ferro miúdas). Toda arma cabe em 800 triângulos (a mais pesada, o fuzil da tia, 580; o pistolão caiu de 2.786 para 252); o viewmodel continua com todo o detalhe (até 3.414). Medido por `bun tools/orcamento.ts` e travado em `client/tests/polyBudget.test.ts`.

| | Primeira pessoa (`Viewmodel`) | Terceira pessoa (`heldWeapons.ts`) |
| --- | --- | --- |
| Cena | `vmScene`, câmera própria ([[ADR - Viewmodel em cena e câmera próprias]]) | cena do mundo, presa a sockets do personagem |
| Armas de fogo | um *kit* por visual (`gunModelKey`), montado uma vez e guardado; partes rígidas fundidas num mesh toon (`bakeStaticParts`; os braços ficam à parte, ver abaixo); carregador, clarão e brilhos separados. `prepare(g)` monta o kit antes (as duas armas do equipamento, em `applyLoadout`). `setGun` põe a arma na mão e **só troca o que aparece**: nada é criado nem descartado, e a mão de apoio, já montada nas duas poses (guarda-mão e punho de pistola), só alterna qual aparece (PF-34). Trocar de arma não custa nada. `draw(s)` faz a arma subir de baixo durante o tempo de saque | `heldGun(g)`: um mesh por visual, cache `gun|<gunModelKey>`, montado com o **modelo de longe** (`gunParts(g, true)`, PF-35 T8). Na mão (`hand_R`) ficam as duas armas, só a que está na mão aparece; a primária fica nas costas (`back`), inclusive enquanto a secundária está na mão |
| Faca | aparece só durante o golpe, na mão direita (ou espelhada para a esquerda sem mão direita) | `heldKnife(form)`, na mão durante o golpe; a arma de fogo vai para as costas |
| Granada | mão esquerda, tremendo enquanto "cozinha" | mão esquerda, com o arremesso animado |
| Material | `MeshToonMaterial` com cor por vértice | **um** material toon compartilhado por todas as armas de todos |
| Brilhos | mantidos | das armas de fogo, descartados ("minúsculos de longe": pontos de mira, LEDs); das facas, **mantidos** como malhas próprias presas à faca (`glowParts`), porque a lâmina do Sabre de Luz é toda brilho (PF-17: antes só o cabo aparecia, na mão dos outros e no caixão do modo zumbi) |

Em primeira pessoa a arma tem origem no receptor; em terceira, no punho (`RIFLE_FROM_GRIP = (0, 0,035, −0,09)`). Como todas as armas têm o punho no mesmo lugar, o mesmo deslocamento serve para todas. Em terceira pessoa, a mão esquerda vai ao ponto de `ANIM.leftGrip[hold]` (`AvatarPose.hold`, em `client/character/animator.ts`) — ver [[Animation]].

### Braços em primeira pessoa

Antebraço e mão do próprio personagem, gerados com o mesmo corpo facetado (`viewmodelArms.ts`), com o punho fechado pelo morph (direita 0,92, esquerda 0,42, esquerda no punho da pistola 0,75), manga longa ou braço nu, luvas, e PCD. Geometria em cache por combinação. Ver [[Character Customization]].

- **Um material só** para os quatro braços (mão da arma, mão de apoio, mão da faca, mão da granada): `armMaterial` (o `paintedMaterial` do personagem), criado na primeira montagem e nunca descartado durante o jogo. `setBody` repinta pele, manga e luvas no próprio material (`paintArms` → `setChannels`/`setTints`). Como é compartilhado, um braço que precise de outra cor ou máscara precisaria de um material próprio (comentário no código).
- **Mão de apoio nas duas poses:** sem PCD e com `maoEsq` (antebraço sem mão), o braço esquerdo é montado no guarda-mão (`VM_FEEL.arms.left`, também a empunhadura da submetralhadora) e no punho da pistola (`pistolLeft`); a arma na mão mostra uma e esconde a outra. Sem a mão direita (arma espelhada) ou sem o braço esquerdo não há mão de apoio, como antes.
- **Quando os braços são remontados:** só em `setBody` e `retune` (painel F6). A troca de arma não toca neles. Antes da PF-34, a troca entre um rifle (ou a submetralhadora) e uma secundária de pistola refazia os quatro braços e descartava o material, o que apagava e recompilava o shader a cada troca (o engasgo da rodinha; ver [[Known Bottlenecks]]).

### Aquecimento no começo da partida

Logo depois do equipamento inicial (`client/main.ts`), `viewmodel.warmup` põe na cena as armas preparadas e deixa visíveis por um instante as armas, a faca, a granada, o clarão e as duas poses da mão de apoio enquanto roda `renderer.compile(vmScene, vmCamera)`; depois tudo volta como estava (as armas fora da mão saem da cena de novo). Assim a primeira troca, a primeira facada e o primeiro arremesso não compilam shader. O viewmodel do espectador do modo zumbi faz o mesmo quando passa a assistir um colega (a primeira vez e a cada troca de quem assiste), com as duas armas do equipamento dele ([[Zombie]]). Testes em `client/tests/viewmodelSwitch.test.ts` ([[Unit Tests]]).

## Código relacionado

- `client/render/weaponModels.ts` (`gunParts`, `GUN_MODELS`, `gunModelKey`, `holdOf`, `sight`, `isScope`, `LOOKS`, `pixelText`, `potato`, `knifeModel`, `mineModel`, `glowMat`)
- `client/render/viewmodel.ts` (`setGun`, `prepare`, `warmup`, `draw`, `kick(mul)`, `setKnife`, `setGrenadeKind`, `bakeStaticParts`, `flashTexture`)
- `client/render/viewmodelArms.ts` (`armMaterial`, `paintArms`, `armMesh`, `placeArm`)
- `client/main.ts` (`applyLoadout` chama `prepare`; `warmup` no começo da partida e no viewmodel do espectador do modo zumbi)
- `client/entities/heldWeapons.ts` (`heldGun`, `heldKnife`, `heldGrenade`)
- `client/entities/avatar.ts` (`setLoadout`: as duas armas na mão, a primária nas costas)
- `client/character/animator.ts` (`GunHold`, `ANIM.leftGrip`)
- `client/weapons/grenades.ts` (`grenadeModel`, `duckModel`)
- `client/character/registry.ts` (itens `rifle`, `rifle_costas`)
- `shared/data/progression.json` (miras), `shared/data/weapons/rifle_*.json` (`visual`), `shared/data/weapons/*.json` (`slot`, `coiceVisual`), `shared/arsenal.ts` (`GunStats`: `mira`, `visual`, `silenciador`, `pente`)

## Ver também

[[Weapons]] · [[Progression]] · [[Animation]] · [[Visual Effects]] · [[Material Palette]] · [[ADR - Secundárias novas no Arsenal]]
