---
title: Map Gags
type: mechanic
status: documented
area: gameplay
source_paths:
  - client/world/props.ts
  - client/world/blockoutMap.ts
  - client/world/hydrant.ts
  - client/world/dog.ts
  - client/world/hauntedTown.ts
  - client/world/halloween.ts
  - client/world/oriental.ts
  - client/world/jardim/frutas.ts
  - client/world/jardim/kit.ts
  - client/world/jardim/lago.ts
  - client/world/jardim/santuario.ts
  - client/world/jardim/lanternas.ts
  - client/world/jardim/guerreiros.ts
  - server/session.ts
tags:
  - game
  - gameplay
  - gags
  - props
updated: 2026-10-05
---

# Map Gags

Nome interno: "piadas ambientais" (design doc, seção 10), registradas no `PropBus`. Lista de objetos por mapa e seu posicionamento: [[Interactive Objects]] e as notas de cada mapa.

> [!info] Evidência
> Código confirmado: `client/world/props.ts` (`PropBus`), chamadas `props.register(...)` nos arquivos de mapa, retransmissão `prop` em `server/session.ts`.

## Objetivo

Recompensar a curiosidade e dar humor: quase tudo de destaque no cenário **reage a tiros (e muitas vezes à faca)**. A maioria é só cosmética; algumas dão vantagem real (abrir o armário do biscoito, tiro ao alvo, rato, carpa) ou são perigos (hidrante, Amora).

## Como funciona

1. Cada piada se registra no `PropBus` com um id (`"hidrante:1"`, `"gongo"`...) e recebe um handler que vira o `onShot` do colisor.
2. Um tiro (ou a faca, quando o objeto aceita `stab`) dispara o handler **localmente** e chama `onLocal(id)`.
3. Online, o cliente envia `prop {id}`; o servidor só valida o formato (`/^[a-z]{1,16}(:\d{1,3})?$/`) e limita a **uma a cada 150 ms por jogador**, e retransmite `prop {id, by}` para os outros, que executam a mesma piada (com a posição de quem disparou, quando conhecida — o fantasma se vira para o atirador).
4. O servidor **não conhece o estado** das piadas: elas são cosméticas e não são reenviadas a quem entra depois.
5. **Exceção (desde 2026-10-06):** as piadas que contam figurinha do álbum ([[Achievements]], página Mapas) estão em `PROPS` (`shared/maps.ts`) com a posição: caminhão (Rua), dragão, gongo, 4 tambores e o carrilhão (Jardim), sino da capela, buzina, fantasma, caldeirão e os 7 alvos (Vila). O servidor só aceita (e só repassa) um toque desses no mapa certo, de quem está vivo e a até `PROP_RANGE` (80 m) do objeto. As outras continuam só repassadas.

## Catálogo por mapa

### [[Map - Rua dos Vizinhos]]

| Id | Objeto | Reação |
|---|---|---|
| `caminhao` | caminhão de sorvete | toca o jingle |
| `hidrante:N` | hidrantes | jorra água por 3 s; **quem está em cima (raio 0,65 m) é lançado ~5 m para cima** (`launch`, 15 m/s) |
| `flamingo:N` | 4 flamingos de jardim | giram e guincham |
| — | **Amora** (Chow Chow, casinha) | não é piada de tiro: quem entra na faixa em frente à porta é **mordido e morre** (cooldown de 2 s por vítima; online relatado como `selfDamage` causa `dog`); os bots contornam a área |

### [[Map - Jardim do Dragão]]

| Id | Objeto | Reação |
|---|---|---|
| `lanterna:N` | lanternas de papel vermelhas | balançam forte |
| `gongo` | gongo do santuário | ressoa e balança |
| `sino:N`, `carrilhao:N` | sinos do santuário e carrilhão do mercado (5 notas: dó–sol) | tocam e balançam (no máx. a cada 0,12 s) |
| `tambor:N` | tambores (santuário, arena, sala de música) | tocam (no máx. a cada 0,11 s) |
| `dragao` | fonte do dragão (lago) | cospe fogo |
| `<prefixo>:N` | cerejas da árvore e frutas das bancas | cortadas ao meio por tiro ou faca; voltam em 40 s |
| — | carpas (koi) | não usam o PropBus: o servidor controla vida/ouro — ver [[Buffs & Debuffs]] |

Paredes de papel são atravessadas pelas balas (95% do dano) — ver [[Weapons]].

### [[Map - Vila Assombrada]]

| Id | Objeto | Reação |
|---|---|---|
| `fantasma` | cova do cemitério | o fantasma sobe reclamando, virado para quem atirou; quanto mais acordado, mais rabugento |
| `sinocapela`, `sinoparque` | sinos | tocam; o da capela reclama "EU JÁ OUVI." após 5 toques em 8 s |
| `buzina` | carro na Estrada Maldita | buzina; após 6 buzinadas em 6 s um vizinho responde "CHEGA." |
| `abobora:N` | abóboras de Halloween | explodem em pedaços (tiro ou faca) e voltam depois |
| `poste:N` | postes | apagam por um tempo |
| `caldeirao` | caldeirão da bruxa | borbulha e muda de cor; a cada 5º tiro cospe um pato de borracha |
| `espantalho:N` | espantalhos | caem e levantam |
| `alvo:N` | 7 alvos da barraca de tiro | caem; **quem derruba o último ganha mira afiada por 60 s** (só no cliente de quem disparou) |
| `aboboragigante` | abóbora gigante da praça | gargalha e o rosto brilha |
| `relogio` | relógio de pêndulo da mansão | toca e adianta uma hora (a hora é guardada "para os segredos") |
| `cogumelo:N` | cogumelos | acendem por um tempo |
| `armario` | armário da cozinha | abre as portas (tiro ou faca) e libera o **Biscoito Scooby** — ver [[Pickups]] |
| `bruxa` | a bruxa | dá bronca em quem atira nela |
| — | rato gigante | alvo com contagem própria (14 tiros / facada = 4) e recompensa de humanidade — ver [[Buffs & Debuffs]] |

As cercas de ferro param jogadores e granadas mas deixam as balas passarem (`blocker`).

## Regras

- Tiros em objetos de piada contam como acerto em superfície (decal, som de impacto do material) além da reação.
- Peixes e frutas não param a bala; o que estiver atrás também é atingido.
- Piadas não dão pontos (exceto as recompensas citadas, que passam por outros sistemas).

## Dependências

[[Interactive Objects]], [[Weapons]], [[Melee]], [[Remote Calls]], [[Audio Events]], [[Visual Effects]], [[Animation]].

## Exceções

- Mapas glTF ([[Map - Arena Teste (glTF)]]) não têm piadas registradas no código (inferência: `gltfMap.ts` não chama `props.register`).
- Retransmissão é *fire-and-forget*: quem entra depois vê o estado padrão.

## Código relacionado

- `client/world/props.ts` — `PropBus.register`, `remote`, `onLocal`, `shooter`.
- `client/world/blockoutMap.ts`, `hydrant.ts`, `dog.ts` — Rua dos Vizinhos.
- `client/world/oriental.ts` (`Lanterns`, `Gong`, `Bell`), `client/world/jardim/*` (`struck`, `FruitTree`/frutas, fonte do dragão) — Jardim do Dragão.
- `client/world/halloween.ts` (`GraveGhost`, `Bell`, `Pumpkins`, `LampPosts`, `Cauldron`, `Scarecrows`, `TargetRow`, `GiantPumpkin`, `GrandfatherClock`, `GlowShrooms`, `KitchenCabinet`, `Witch`, `GiantRat`), `client/world/hauntedTown.ts` — Vila Assombrada.
- `client/main.ts` — `map.props.onLocal`, `map.props.shooter`, handler `prop`, `dogTick`.
- `server/session.ts` — case `prop`.

## Configurações relacionadas

Constantes locais de cada arquivo de mapa (ex.: `GUSH_TIME = 3`, `LAUNCH_SPEED = 15` em `hydrant.ts`; `REGROW = 40` em `frutas.ts`). Ver [[Constants Reference]].
