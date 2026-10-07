---
title: Unit Tests
type: system
status: documented
area: testing
source_paths:
  - client/tests/aimAssist.test.ts
  - client/tests/keybinds.test.ts
  - client/tests/spatial.test.ts
  - server/tests/appearance.test.ts
  - server/tsconfig.json
  - client/tests/arsenalText.test.ts
  - server/tests/arsenal.test.ts
  - shared/arsenal.ts
  - server/migrations/003_melhorias.sql
  - client/tests/offlineModes.test.ts
  - client/gameplay/progress.ts
  - client/zombies/local.ts
  - client/zombies/link.ts
  - server/tests/progression-modes.test.ts
  - client/tests/mapConversion.test.ts
  - client/tests/mapData.test.ts
  - client/tests/budget.test.ts
  - client/tests/seeded.test.ts
  - client/tests/mapPose.test.ts
  - client/tests/editorHistory.test.ts
  - tools/snapshot-mapas.ts
  - tools/headless.ts
tags:
  - testes
  - unitarios
updated: 2026-10-06
---

# Unit Tests

Testes de lógica pura, sem servidor nem banco (embora rodem no mesmo `bun test`, depois do preload que recria o banco de teste). Os módulos do cliente testados são escritos sem dependência de DOM/WebGL, o que permite rodá-los no Bun.

## `client/tests/aimAssist.test.ts` → [[Aim Assist]]

- Desacelera a mira sobre um inimigo à frente.
- Não faz nada com inimigo fora da mira ou morto.
- Acompanha um alvo que anda para o lado só enquanto o jogador mira.
- Nunca puxa a mira de longe até um inimigo.

## `client/tests/keybinds.test.ts` → [[Input & Controls]]

28 casos em grupos:

- **Atribuir teclas:** tecla livre vai ao espaço escolhido sem alterar o original; tecla usada sai da outra ação e informa o espaço que ficou vazio; aceita botões laterais do mouse; recusa `Ctrl` e as teclas fixas, dizendo o motivo.
- **Roda do mouse:** vale em ações de um toque; recusada em ações de segurar e no chat; descartada ao carregar se salva numa ação de segurar; tem nome nos dois idiomas.
- **Esvaziar um espaço (×)** e **teclas proibidas** (`Ctrl` dos dois lados, `F3`, `F4`, `F6`).
- **Carregar o salvo:** sem nada volta o padrão (cópia); ação nova recebe o padrão; respeita espaço vazio de propósito; descarta lixo; tecla duplicada fica só na primeira.
- **Tabela do Input** e **nome das teclas** (QWERTY, AZERTY via mapa do navegador, fallback do Firefox, código desconhecido).

## `client/tests/arsenalText.test.ts` → [[Inventory UI]]

- Um caso por idioma (pt-BR e en): toda arma e toda melhoria de `progression.json` tem nome e descrição (`arma_*`, `armaDesc_*`, `upg_<arma>_<id>`, `upgDesc_*`) e todo efeito tem o seu rótulo (`fx_*`) em `client/ui/strings.ts`.

## `client/tests/spatial.test.ts` → [[Spatial Audio]]

- Parede abafa e baixa o som sem silenciar; papel quase não abafa.
- Sons distantes mais abafados e baixos.
- Ponto sob telhado com paredes é "fechado"; campo aberto não.
- Passos: andando, mais altos correndo, nenhum agachado.
- Pouso, início de deslize e de recarga geram um som cada.
- Renascer do outro lado do mapa não conta como passo.

Usa um `CastFn` falso para simular paredes, sem física real.

## `server/tests/appearance.test.ts` — bloco "regras da aparência" → [[Character Customization]]

Testa funções de `shared/appearance.ts` (puras):

- Escolhas inválidas viram padrão; nada fora do catálogo é aceito.
- Conversão da aparência versão 1 e da versão 2 sem rosto.
- Item que ocupa vários slots remove o que estava neles.
- Acentos de cor só em peças pequenas.
- Altura e biotipo só visuais; sem mão recarrega 30% mais devagar, sem perna anda 25% mais devagar.
- Dano por zona da hitbox: cabeça 2,5×, pescoço 1,5×, mãos 0,5×, virilha mata (ver [[Damage System]]).
- Aparência aleatória dos bots sempre válida.

## `server/tests/arsenal.test.ts` → [[Weapons]], [[Progression]]

Testa `shared/progression.ts` e `shared/arsenal.ts` (puros), 18 casos:

- **Níveis:** cada nível depois do primeiro libera uma melhoria, com pontos crescentes; o nível vem dos pontos da arma; armas diferentes têm quantidades diferentes de melhorias.
- **Melhorias em efeito:** as comuns ligam sozinhas; as opcionais só quando ligadas e liberadas; uma opcional ligada substitui as comuns do seu grupo (a luneta tira o ponto vermelho).
- **Escolha do Arsenal:** `sanitizeChoice` limpa o que veio do cliente (secundária válida, só opcionais conhecidas, uma por grupo) e, com os níveis, descarta o que não foi liberado; `legacyChoice` dá às contas antigas a escolha mais parecida; `resolveLoadout`; as armas de cada espaço vêm dos dados (`PRIMARIES`/`SECONDARIES`); `sanitizeLoadout` só aceita ids conhecidos.
- **Atributos:** sem melhorias, `gunStats` é o JSON; cada melhoria muda atributos de verdade; o silenciador abafa e cobra dano e alcance; a faca vira sabre; a granada vira mina ou Dose Dupla e ganha cinto e pólvora; cada abate de tiro vai para a arma que atirou (`weaponOfKill`).
- **Migração 003:** lê `server/migrations/003_melhorias.sql` e confere que todo XP de destino é um limiar que existe nos níveis novos ([[Data Migrations]]).

## `client/tests/offlineModes.test.ts` → [[Training]], [[Versus Bots]], [[Zombie]]

O que o jogo offline usa da progressão, sem navegador:

- **Treino e contra bots (`Progress`, `client/gameplay/progress.ts`)**: sem conta, rifle e pistola sem melhorias, nenhuma opcional liga e a secundária escolhida vale só para a partida (nada é salvo); com conta, cada arma em cada nível dá o equipamento da conta (só o que o nível liberou, uma opcional por grupo), ligar/desligar cada opcional muda as armas na mão e a outra do grupo desliga, e cada mudança é salva com `PATCH /api/perfil` (o `fetch` é trocado por um gravador); o `progresso` que chega do servidor é limpo contra os níveis novos.
- **Bots**: toda arma que um bot sorteia (sem melhorias) e todo degrau da escada (como o bot e o jogador recebem) dão atributos válidos; o abate com a arma do degrau conta, e no último só a facada do sabre.
- **Zumbi sozinho (`LocalZombies`, `client/zombies/local.ts`)** sobre a navmesh pré-gerada: começa com o rifle simples; dano no chefe do rifle, da faca e da granada pelas mesmas funções do servidor; o caixão entrega a arma (gancho `setLoadout` e evento `playerLoadout`) com as melhorias dela, e o dano é o dela × a raridade; uma rodada danificada (os dois defeitos) chega com o defeito no equipamento, o dano × 0,75 e menos pente e reserva (`zombieGunData`); erguer uma barricada sozinho custa o mesmo e dá as mesmas tábuas; sozinho, cair encerra a partida (`zend`).

Não rodam aqui (precisam do navegador): `BotManager` e `Bot` (malhas, física Rapier e placas de nome em canvas) e a escolha do equipamento inicial em `client/main.ts` (dentro da closure com DOM); o teste cobre as funções puras que eles chamam. Para rodar o jogo solo sem DOM, a interface `ZombieLink` foi para `client/zombies/link.ts` (antes em `client.ts`, que depende do navegador).

## `server/tests/progression-modes.test.ts` → [[Weapons]], [[Progression]], [[Game Modes Index]]

A matriz progressão × modos (descrita em [[Integration Tests]]) também é, em parte, unitária: toda combinação de melhorias de toda arma de fogo, da faca e da granada dá atributos finitos e positivos, e todo equipamento que um modo entrega no meio da partida (degraus da escada, combinações de itens do caixão) é válido.

## Mapas como dados (PF-6) → [[World Structure]], [[ADR - Mapas como dados com catálogo de peças]]

Os mapas são montados **sem tela** no Bun (`tools/headless.ts`: canvas falso, `.glb` lidos de `public/` no disco, `Math.random` fixo durante a montagem; os módulos do cliente entram por caminho variável, para o typecheck do servidor não segui-los).

- `client/tests/mapConversion.test.ts`: cada um dos 4 mapas oficiais, montado a partir do JSON pelo carregador, é igual ao seu golden (`shared/data/mapas/<id>.golden.json`, gravado do código original antes da conversão), com tolerância de 1e-6: colisores (forma, posição, giro, tamanho, material, oclusor, `onShot`), ids do `PropBus`, vãos, salas, spawns, bonecos, `killY`, sombra, céu, luzes, lotes e objetos da cena (hash dos triângulos, independente da ordem). E o modo editor: uma peça por grupo, os colisores repartidos entre as peças, nenhum lote fora delas.
- `client/tests/mapData.test.ts`: `validateMapData` (os oficiais passam; mapas quebrados são recusados com o motivo: tipo desconhecido, parâmetro fora do esquema, id repetido, id do `PropBus` inválido ou repetido, limite por mapa, bruxa sem posição, coletável, rato e arquivo sem par, mapa zumbi sem dados), o esquema do catálogo, um adaptador para cada tipo, as superfícies iguais às do cliente, as peças da bruxa, do rato e do armário batendo com `objetos`, os dados de zumbi do cemitério iguais aos do modo, e o nome e o `exclusivo` dos oficiais iguais a `OFFICIAL_INFO` (os seletores da tela inicial).
- `client/tests/roles.test.ts`: as regras de `shared/roles.ts` (agir sobre, punir, conceder, promover, rebaixar; o último admin fica; ninguém se pune).
- `client/tests/budget.test.ts`: contagem de chamadas e triângulos (câmera, sombra, grupos de material, instâncias) e os 4 oficiais dentro de 400 chamadas e 750 mil triângulos (o teste imprime os números).
- `client/tests/seeded.test.ts`: `seeded()` dá os mesmos números de antes e `seeded(r.state)` continua a sequência de `r`.
- `client/tests/mapPose.test.ts` (P32, [[ADR - Editor de mapas no jogo]]): a pose vira matriz e volta igual; `validateMapData` aceita a pose e recusa uma quebrada; peça sem pose (ou com pose nula) monta idêntica; uma parede girada em ângulo livre nos três eixos tem cada colisor no lugar da pose, os lotes levados, o vão com o centro certo e a porta continua passagem (raio pela porta não bate, a 2 m dela bate); uma sala girada acha o ponto dentro da caixa girada e não o canto da caixa alinhada em volta; `ROOM_` girado guarda o referencial (sem giro, a caixa de sempre); o biscoito de um armário girado fica onde o servidor espera; no modo editor, tirar a peça leva colisores, sala e vão, e ela monta de novo igual.
- `client/tests/editorHistory.test.ts`: desfazer e refazer de peças adicionadas, mudadas, apagadas (várias de uma vez, no lugar certo da lista) e do resto do mapa; o que cada edição manda reconstruir; o limite do histórico; "não salvo"; as teclas (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z); o gizmo (peça livre continua com `p` e `yaw`, inclinada ganha pose e perde ao ficar em pé, peça linear ou fixa só muda a pose, a bruxa leva o seu lugar junto); cada tipo do catálogo vira uma peça nova válida; ids, ids de piada e de objetos sem repetir; rato e bruxa novos e apagados com os seus `objetos`; duplicar; marcadores (pôr, mover, girar, tirar; modelo do zumbi válido, brecha presa ao muro, canto leva as brechas); pontas e vãos de paredes e cercas.

O hash da navmesh do Cemitério (`server/tests/zombies.test.ts`) é refeito a partir do JSON e continua igual.

## Typecheck

`client/tests` é excluído do `tsconfig.json` do navegador e incluído no `server/tsconfig.json` (tipos do Bun), então é verificado por `bun run typecheck`.

## Código relacionado

- `client/tests/*.test.ts`, `server/tests/appearance.test.ts`, `server/tests/arsenal.test.ts`, `server/tests/progression-modes.test.ts`
- Módulos testados: `client/gameplay/aimAssist.ts`, `client/core/keybinds.ts`, `client/audio/spatial.ts`, `client/ui/strings.ts`, `client/gameplay/progress.ts`, `client/zombies/local.ts`, `shared/appearance.ts`, `shared/progression.ts`, `shared/arsenal.ts`, `shared/gunGame.ts`, `shared/zombies.ts`, `shared/zombieMatch.ts`
