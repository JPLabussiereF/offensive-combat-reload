---
title: Interactive Objects
type: reference
status: documented
area: world
source_paths:
  - client/world/props.ts
  - client/world/gameMap.ts
  - shared/data/mapas/rua.json
  - client/world/hydrant.ts
  - client/world/dog.ts
  - shared/data/mapas/jardim.json
  - client/world/oriental.ts
  - client/world/jardim/kit.ts
  - client/world/jardim/lago.ts
  - client/world/jardim/lanternas.ts
  - client/world/jardim/guerreiros.ts
  - client/world/jardim/santuario.ts
  - client/world/jardim/frutas.ts
  - client/world/jardim/peixes.ts
  - client/world/jardim/cereja.ts
  - shared/data/mapas/halloween.json
  - client/world/halloween.ts
  - shared/maps.ts
  - shared/constants.ts
  - server/session.ts
tags:
  - world
  - maps
  - interaction
  - gags
updated: 2026-10-06
---

# Interactive Objects

Catálogo **espacial** dos objetos de cada mapa que reagem ao jogador: onde estão, o que os dispara e se são sincronizados online. As regras e números dos efeitos (vida extra, duração, XP) têm nota própria:

- Piadas de cenário em geral: [[Map Gags]].
- Coletáveis (cereja, biscoito): [[Pickups]].
- Efeitos temporários (poções, mira afiada, humanidade): [[Buffs & Debuffs]].
- Como o jogador interage (tiro, faca, proximidade, tecla de oprimir): [[Interaction System]].
- Como a sincronização trafega: [[Replication]], [[Remote Calls]].

## Formas de disparo

| Disparo | Mecanismo | Exemplos |
| --- | --- | --- |
| **Tiro** | colisor com `onShot` (ou hit em `critters.shot`) | hidrantes, sinos, abóboras, carpas |
| **Faca** | `critters.stab` do mapa | carpas e frutas (Jardim); rato, armário e abóboras (Vila) |
| **Proximidade** | `update` compara os pés do jogador com uma zona | latido e mordida da Amora, jato do hidrante, coletáveis |
| **Tecla de oprimir** perto | `GameMap.potion` (raio 2,4 m) | beber poção da bruxa ("Beber Poção") |

## Sincronização (`PropBus`)

- Cada objeto sincronizado registra um **id** (`props.register('nome:indice', efeito)`) e recebe o handler para usar como `onShot`.
- Disparo local: executa o efeito e, online, avisa o servidor (`prop`), que repassa aos outros com o autor (`by`); os outros veem o mesmo efeito (`PropBus.remote`), às vezes virado para quem atirou (fantasma).
- O servidor só aceita ids no formato `/^[a-z]{1,16}(:\d{1,3})?$/` e no máximo um a cada 150 ms por jogador; **não verifica** se o jogador estava perto ou mirando o objeto.
- Coletáveis, carpas e o rato **não** passam pelo `PropBus` como simples piada: o servidor confere estado e distância (tabelas de `shared/maps.ts`) antes de dar o efeito. Ver [[Validation]].

## Rua dos Vizinhos

| Objeto | Id | Onde (x, z) | Disparo | Efeito |
| --- | --- | --- | --- | --- |
| Caminhão de sorvete | `caminhao` | centro da rua (~1, 0) | tiro | toca o jingle (no máximo a cada 4 s) |
| Hidrantes (3) | `hidrante:0..2` | (−12, −8), (12, 8), (28, −8) | tiro → jato; ficar em cima → arremesso | jato de 6,5 m por 3 s; quem está a até 0,65 m é lançado (~5 m para cima) |
| Flamingos (4) | `flamingo:0..3` | (−30, 14), (−26, 26), (20, 15), (9, 27) | tiro | giram e guincham |
| Amora (Chow Chow) | — (não usa `PropBus`) | casinha em (36, 14,5), porta virada para +Z | entrar na faixa de ~2,7 × 2,3 m em frente à porta | **mordida letal** (perigo do mapa; vale offline, bots e online; os bots desviam) |
| Latido da casinha | marcador glTF `GAG_LATIDO` | porta da casinha | passar a menos de 3,5 m | late (recarga de 4 s) |

## Jardim do Dragão

| Objeto | Id | Onde | Disparo | Efeito |
| --- | --- | --- | --- | --- |
| Lanternas penduradas | `lanterna:N` | Casa, anel, pavilhões, rua das lanternas | tiro | balançam |
| Gongo | `gongo` | salão ancestral do templo (Santuário) | tiro | soa e balança |
| Sinos | `sino:0`, `sino:1` (terraço), `sino:2` (pavilhão do sino, pátio baixo) | Santuário | tiro | tocam e balançam |
| Tambores | `tambor:0` (Santuário), `tambor:1` (arena dos Guerreiros), `tambor:2..3` (sala de música) | — | tiro | som sincronizado |
| Carrilhão (bianzhong) | `carrilhao:0..4` | mercado do Pátio das Lanternas | tiro | 5 sinos: dó, ré, mi, fá, sol |
| Fonte do dragão | `dragao` | ilhota do Lago de Lótus (39, −14) | tiro | o dragão de jade cospe fogo |
| Cerejas da árvore | `fruta:N` | Cerejeira do Dragão, pátio da Casa | tiro/faca | cortadas ao meio; voltam em 40 s |
| Frutas das bancas | `banca:N` | mercado | tiro/faca | idem |
| Carpas (9) | `koi:0..3` (lago do bonsai), `koi:4..8` (lago de lótus) | lagos | tiro/faca | XP da conta; chance de carpa dourada (ver [[Buffs & Debuffs]]) |
| Cereja do Dragão (coletável) | `cereja` | (0, 0,36, 2,1), sob a cerejeira | passar perto (raio 1,2 m) | vida máxima extra temporária (ver [[Pickups]]) |
| Panda | — | casa do jardineiro (Vale do Bambu) | — | só animação (come bambu); colide como uma caixa |

## Vila Assombrada

| Objeto | Id | Onde (x, z) | Disparo | Efeito |
| --- | --- | --- | --- | --- |
| Fantasma da cova | `fantasma` | (5, −20,4), cemitério | tiro | sai reclamando, virado para quem atirou; mais vezes = falas mais rabugentas |
| Sino da capela | `sinocapela` | torre (−14,5, altura 10,1, −29,5) | tiro | toca; com 5+ toques em 8 s, um balão diz "EU JÁ OUVI." (no máximo a cada 8 s) |
| Buzina do carro | `buzina` | carro em (30, −47), Estrada Maldita | tiro | buzina; na 6ª buzinada em 6 s o vizinho do celeiro grita "CHEGA." |
| Abóboras | `abobora:N` | varandas, caminhos, praça, horta | tiro/faca | explodem e voltam depois |
| Postes | `poste:N` | ruas | tiro | apagam por um tempo (saem da lista de luzes reais) |
| Caldeirão | `caldeirao` | cabana da bruxa (−40, −46) | tiro | borbulha e muda de cor; a cada 5 tiros cospe um pato de borracha |
| Bruxa | `bruxa` | (−41,2, 0, −46) | tiro → bronca; tecla de oprimir perto → poção | poção com efeito sorteado (ver [[Buffs & Debuffs]]) |
| Espantalhos | `espantalho:N` | praça: (−14, 52,5), (6, 36,5), (40, 51) | tiro | caem e levantam |
| Barraca de tiro ao alvo | `alvo:0..6` | parque, x 31,4–37,4, z ~15 | tiro | alvos caem; quem derruba o último ganha a mira afiada |
| Abóbora gigante | `aboboragigante` | praça (−26, 46) | tiro | gargalha e o rosto brilha |
| Relógio de pêndulo | `relogio` | hall da mansão (−46, −1,6) | tiro | badala e adianta 1 hora |
| Cogumelos brilhantes | `cogumelo:N` (3) | floresta: (−21, −40), (−49, −51), (13, −51,5) | tiro | acendem por um tempo |
| Sino do parque | `sinoparque` | medidor de força (44,5, altura 5,5, 26,5) | tiro | toca |
| Armário da cozinha | `armario` | cozinha da mansão (~−43,4, 9) | tiro/faca | abre as portas e mostra o biscoito |
| Biscoito Scooby (coletável) | `biscoito` | (−44,4, 0, 9), dentro do armário | passar perto com o armário aberto | vida cheia (ver [[Pickups]]) |
| Rato gigante | `rato` (tabela `RATS`) | fim da rua sem saída do esgoto (7,5, −4, 47,5) | tiro (conta 1) / faca (conta 4); cai com 14 | "humanidade" para quem derruba (ver [[Buffs & Debuffs]]) |
| Máquina de refrigerante | — | (58,9, −2) | — | só visual ("a gag for later") |

> [!info]
> Vários objetos da Vila guardam contadores (`activations`, `rings`, `stirs`, `clears`, `laughs`, `hour`, `lit(i)`) comentados como base para "os segredos (seção 23 do documento de design)". **Nenhum código lê esses contadores hoje**; os segredos não existem. Também são promessas sem implementação: o esqueleto atrás da cortina do palco ("one day"), os retratos cujos olhos seguem o jogador ("some day") e a máquina de refrigerante.

## Arena Teste (glTF)

Nenhum objeto interativo. O marcador `GAG_*` existe no carregador, mas a ligação do efeito é feita pelo código do mapa; `buildGltfMap` devolve um `PropBus` vazio.

## Código relacionado

- `client/world/props.ts` — `PropBus`, `PropTrigger`.
- `client/world/catalog/objects.ts`, `catalog/vehicles.ts`, `catalog/glb.ts` — hidrantes, flamingos, Amora, caminhão e latido (Rua dos Vizinhos); cada piada guarda o seu id do `PropBus` na peça (`Peca.prop`).
- `client/world/oriental.ts` — `Lanterns`, `Gong`, `Bell`, `FireBreath`.
- `client/world/jardim/kit.ts` — `struck` (tambores).
- `client/world/halloween.ts` — `GraveGhost`, `Bell`, `Pumpkins`, `LampPosts`, `Cauldron`, `Scarecrows`, `TargetRow`, `GiantPumpkin`, `GrandfatherClock`, `GlowShrooms`, `KitchenCabinet`, `ScoobyBiscuit`, `GiantRat`, `Witch`.
- `server/session.ts` — mensagem `prop` e validação de coletáveis, carpas e rato.
- Visual e som: [[Visual Effects]], [[Animation]], [[SFX]], [[Spatial Audio]].
