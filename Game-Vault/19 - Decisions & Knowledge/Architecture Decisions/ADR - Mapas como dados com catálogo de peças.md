---
title: ADR - Mapas como dados com catálogo de peças
type: decision
status: documented
area: architecture
source_paths:
  - shared/mapData.ts
  - shared/mapCatalog.ts
  - shared/data/mapas/rua.json
  - shared/data/mapas/jardim.json
  - shared/data/mapas/halloween.json
  - shared/data/mapas/cemiterio.json
  - client/world/mapLoader.ts
  - client/world/catalog/index.ts
  - client/world/catalog/types.ts
  - client/world/catalog/services.ts
  - client/world/budget.ts
  - client/world/pose.ts
  - client/world/catalog/posed.ts
  - client/world/conversao/recorder.ts
  - client/world/conversao/jardimSetores.ts
  - client/world/catalog/gardenPieces.ts
  - tools/snapshot-mapas.ts
  - tools/converter-mapas.ts
  - tools/headless.ts
  - client/tests/mapConversion.test.ts
  - client/tests/mapData.test.ts
  - client/tests/budget.test.ts
tags:
  - decision
  - adr
  - architecture
  - maps
  - editor
updated: 2026-10-06
---

# ADR - Mapas como dados com catálogo de peças

## Contexto

Até 2026-10-06 cada mapa oficial era uma função em código (`buildBlockoutMap`, `buildDragonGardenMap`, `buildHauntedTownMap`, `buildCemeteryMap`, cerca de 6,6 mil linhas e 1.100 chamadas diretas ao `MapBuilder` e aos kits). Só um programador mudava um mapa. A issue PF-6 pede um **editor de mapas no jogo**: admins e moderadores mantêm os oficiais, qualquer conta cria mapas da comunidade, tudo jogável online, com versões. Para isso o mapa precisa ser algo que o editor lê, altera, salva no servidor e outro cliente monta igual.

A PF-6 roda em quatro fases na mesma branch: 1) formato, catálogo, carregador e conversão dos 4 mapas (esta decisão); 2) banco, API de mapas e de gerenciamento, papéis, sessões sob demanda e protocolo; 3) o editor no jogo; 4) as telas Mapas e Gerenciamento.

## Problema

Como descrever um mapa em dados sem perder nada dos mapas atuais (colisão, piadas sincronizadas, luzes, salas do som, aleatoriedade com semente, navmesh do zumbi) e de um jeito que o editor consiga selecionar, mover e reconstruir uma parte do mapa sozinha?

## Opções consideradas

1. **Continuar com mapas em código.** Sem editor; descartada pela issue.
2. **Mapa inteiro como um `.glb` do Blender** (o caminho de `gltfMap.ts`). Bom para geometria, mas as piadas, a bruxa, o rato, os sinos e a aleatoriedade com semente ficariam fora do arquivo, e o editor no jogo teria de escrever glTF.
3. **Dados (JSON) com um catálogo de peças** em que cada peça é uma chamada aos construtores que já existem. Escolhida.

## Decisão

- Um mapa é um `MapData` (`shared/mapData.ts`, `MAP_FORMAT = 1`): ambiente (céu, célula de lote, sombra, `killY`, sons ambientes), uma lista **ordenada** de peças, arquivos (`.glb`), spawns, bonecos, `objetos` (coletáveis, bruxa, ratos, peixes: o que o servidor acompanha), dados de zumbi e serviços. `validateMapData` é pura e roda igual no cliente e no servidor. Detalhes em [[World Structure]].
- Cada **peça** (`Peca`) é um tipo do catálogo (`shared/mapCatalog.ts`: parâmetros com tipo, faixa e padrão, transformação `livre`/`linear`/`fixa`, limite por mapa, prefixo do `PropBus`) montado por **um adaptador** em `client/world/catalog/`, que chama os construtores de sempre. A peça guarda a sua **semente** (`Peca.semente`, ver [[ADR - Aleatoriedade com semente na construção dos mapas]]) e o seu **id do `PropBus`** (`Peca.prop`), explícitos: online todos montam e disparam o mesmo.
- O carregador (`client/world/mapLoader.ts`, `buildMapFromData`) tem dois modos: **jogo** (lotes estáticos por material e célula entre peças, como antes: [[ADR - Lotes estáticos por material e célula]]) e **editor** (cada peça no seu grupo, sem lotes entre peças, com os seus colisores).
- Os 4 oficiais vão no pacote do cliente (`shared/data/mapas/*.json`), para treino e bots funcionarem sem servidor.
- **Orçamento de desenho**: um mapa acima de **400 chamadas de desenho ou 750 mil triângulos** não salva (`MAP_BUDGET`). `client/world/budget.ts` mede sem GPU: a pior câmera de amostra (nos spawns e numa grade, 8 direções) mais a passada de sombra do sol. Ver [[Performance Rendering]].
- **Fidelidade da conversão**: antes de qualquer mudança, `tools/snapshot-mapas.ts` gravou um golden de cada mapa a partir do código original; os construtores foram trocados por gravações de peças (`client/world/conversao/`), o JSON foi gerado (`tools/converter-mapas.ts`) e os construtores antigos só foram apagados quando a montagem a partir do JSON bateu com o golden nos 4 mapas (`client/tests/mapConversion.test.ts`, tolerância 1e-6). O hash da navmesh do Cemitério não mudou.

## Decisões do dev sobre o editor (registradas na fase 1)

- **P31: setores do Jardim em peças individuais.** Na primeira conversão cada setor do [[Map - Jardim do Dragão]] (casa, anel, bonsai, lago, lanternas, guerreiros, bambu, santuário) virou uma peça só (o plano listava "setores do jardim" entre os adaptadores). O dev decidiu que eles devem ser convertidos chamada por chamada, como a Vila Assombrada, para o Jardim oficial ser editável no mesmo nível dos outros mapas. **Feito na fase 1:** `client/world/conversao/jardimSetores.ts` grava cada chamada dos antigos `buildCasa`, `buildRing`, `buildBonsai`, `buildLago`, `buildLanternas`, `buildGuerreiros`, `buildBambu` e `buildSantuario`; o catálogo ganhou as peças próprias dos setores (`client/world/catalog/gardenPieces.ts`: cerejeira do dragão com a cereja, fonte do dragão, sinos bianzhong, barracas do mercado, sinos, tambores, túmulos, estela, panda, portais, folhas de porta) e um `colisor` invisível; o `jardim.json` passou de 28 para 741 peças, igual ao golden, com o mesmo orçamento (310 chamadas, 704.428 triângulos). O tipo `setor` saiu do catálogo.
- **P32: o gizmo move e gira todas as peças, com giro livre** (qualquer ângulo), inclusive as de transformação `linear` e `fixa`. **Feito na fase 3** com uma **pose** por peça (`Peca.pose { p, r }`, opcional): a peça é montada no referencial dos seus parâmetros e a pose, uma transformação rígida, leva tudo o que ela faz (`client/world/pose.ts`): a geometria entra nos lotes já transformada (`MapBuilder.pose`), os colisores são movidos depois de criados (qualquer caminho, inclusive os que não passam pelo `MapBuilder`), a **sala** guarda a caixa no seu referencial com a matriz mundo→sala (`RoomVolume.local`, testada por `RoomVolumes.at`), o **vão** guarda a matriz da parede (`WallOpening.pose`), e os objetos, luzes, partículas, sons, piadas, coletáveis, poção, cachorro e acertos de tiro e faca atravessam o referencial em `client/world/catalog/posed.ts`. Caixas `ROOM_` giradas num `.glb` usam o mesmo referencial (`MapBuilder.orientedRoom`). Peça sem pose monta como antes (golden e navmesh iguais); peça `livre` só ganha pose quando inclinada. Ver [[ADR - Editor de mapas no jogo]].

## Motivo

Reaproveita todo o código de construção que já existe (os construtores viram adaptadores), mantém o jogo idêntico (golden), e dá ao editor a unidade de que ele precisa: uma peça que se seleciona, se edita por um formulário gerado pelo esquema e se reconstrói sozinha.

## Consequências

- O JSON é a fonte da verdade dos mapas; os scripts de conversão só documentam e reproduzem a conversão.
- A ordem das peças continua definindo os lotes e a ordem dos colisores, mas o golden e a navmesh não dependem dela (testado), e as sementes por peça tornam cada peça independente das outras.
- Um tipo de peça novo precisa do esquema em `shared/mapCatalog.ts` e do adaptador em `client/world/catalog/` (um teste confere que os dois casam).
- **Fase 2 (feita):** o servidor guarda cada versão salva do mapa no banco (`map_version`) e lê `objetos`, `zumbi` e a navmesh dela; `PICKUPS`, `WITCHES`, `RATS`, `FISH` e `MAPS` saíram de `shared/maps.ts`. Salvar monta o mapa numa thread (`server/mapWorker.ts`) e confere `MAP_BUDGET`. Ver [[ADR - Sessões sob demanda por versão do mapa]].
- **Fase 3 (feita):** o editor no jogo ([[ADR - Editor de mapas no jogo]]) usa o modo editor do carregador, reconstrói só a peça mexida (`MapBuild.remove` e `piece`) e grava a pose da P32.
- **Fase 4 (feita):** as lanternas de papel e os recortes de lago de uma peça com pose entram nas listas do mapa inteiro levados pela pose (P42: `Services.lanternSources`/`lanternSpots`, `holes` com a caixa do retângulo girado; `client/tests/mapPose.test.ts`); a tela inicial mostra o cartão (`cartao`) de cada mapa e as abas Mapas e Gerenciamento ([[Menus]]).
- Os dados de zumbi do Cemitério saíram de `shared/data/zumbi.json` e estão no campo `zumbi` de `cemiterio.json` (`ZOMBIE.mapas` continua igual).

## Código afetado

- `shared/mapData.ts`, `shared/mapCatalog.ts`, `shared/zombies.ts` (`checkZombieMap`), `shared/data/mapas/*.json`.
- `client/world/mapLoader.ts`, `client/world/catalog/*`, `client/world/gameMap.ts`, `client/world/budget.ts`, `client/world/oriental.ts` (`seeded().state`), `client/main.ts`.
- `client/world/conversao/*`, `tools/snapshot-mapas.ts`, `tools/converter-mapas.ts`, `tools/headless.ts`, `tools/bake-navmesh.ts`.
- Testes: `client/tests/mapConversion.test.ts`, `mapData.test.ts`, `budget.test.ts`, `seeded.test.ts` ([[Unit Tests]]).

Relacionado: [[World Structure]] · [[Maps Index]] · [[Asset Pipeline]] · [[Performance Rendering]] · [[ADR - Aleatoriedade com semente na construção dos mapas]] · [[ADR - Lotes estáticos por material e célula]]
