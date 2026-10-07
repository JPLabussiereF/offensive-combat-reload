---
title: Unit Tests
type: system
status: documented
area: testing
source_paths:
  - client/tests/weapon.test.ts
  - server/tests/secondaries.test.ts
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
  - client/tests/arsenalTree.test.ts
  - client/tests/arsenalCanvasLayout.test.ts
  - client/tests/pauseMenu.test.ts
  - client/tests/arsenalKnifeStats.test.ts
  - client/ui/arsenalStats.ts
  - client/ui/pauseMenu.ts
  - client/ui/arsenalTree.ts
tags:
  - testes
  - unitarios
updated: 2026-10-07
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

- Um caso por idioma (pt-BR e en) — e mais um por idioma para as secundárias da PF-10: o nome do plano, o começo da descrição, o item do caixão (`zitem_`) e os degraus `ladder_garrucha`/`ladder_grampeador` —: toda arma e toda melhoria de `progression.json` tem nome e descrição (`arma_*`, `armaDesc_*`, `upg_<arma>_<id>`, `upgDesc_*`), todo efeito tem o seu rótulo (`fx_*`) e toda linha da árvore do Arsenal o seu (`treeRow_*`) em `client/ui/strings.ts`.
- **Textos do menu de pausa** (PF-11), 3 casos: em cada idioma, todo texto do menu (`pm*`, `keyGroup*`) existe e preenche os seus parâmetros (nenhum `{…}` sobrando); e nenhum ficou igual nos dois idiomas (nada sem tradução).

- **Passivas das facas** (2026-10-07): em cada idioma, toda faca tem passiva com nome e descrição preenchidos (sem `{…}` sobrando) e com os números (colher 50; frango 15 e 3; peixe 100 e `SCORE.backstab`); os textos `knifePassive`, `knifePassiveWhere` e os quatro rótulos das barras existem; nenhuma passiva se repete e pt-BR e en são diferentes.

## `client/tests/arsenalKnifeStats.test.ts` → [[Inventory UI]], [[Melee]]

As barras da faca (`client/ui/arsenalStats.ts`, puro): quatro barras na ordem, todas entre 0,06 e 1 em toda faca com toda combinação das três melhorias; nenhuma faca com barras iguais às de outra; o sabre e o macarrão sempre com os dois maiores alcances; a faca de cozinha ouvida a 34 m e as outras a 70 m, com a discrição bem acima e sem mudar com melhoria; cada melhoria sobe a sua barra (afiador: alcance e rapidez; tênis: investida; mão leve: rapidez) e não mexe nas outras; `weaponStatBars` dá linha de pente às armas de fogo, nenhuma à faca e nada à granada; as fichas do afiador, do tênis e da mão leve.

## `client/tests/arsenalCanvasLayout.test.ts` → [[Inventory UI]]

A geometria e a câmera do canvas do Arsenal da tela inicial (`client/ui/arsenalCanvasLayout.ts`, puro), 6 casos: quatro quadros um embaixo do outro, com 7, 7, 7 e 1 armas lado a lado no espaçamento do design e dentro do quadro; as melhorias da arma mostrada ficam em linhas por tipo, cada uma com rótulo (rifle: 5 miras e 3 melhorias; pistola: 1 mira e 3; faca: uma linha de 2; granada: 2 modos e 2 melhorias), empilhadas com espaço para o rótulo, um tronco por quadro, e outro rifle mostrado leva as mesmas melhorias para baixo dele (a linha mais longa ou o último rifle marcam o fim); as linhas laranja até a melhoria ligada e pontilhadas até a trancada, o tronco pontilhado quando nada embaixo dele pode ser usado, e a arma trancada tranca o ramo dela; o zoom fica entre 25% e 200% com o ponto sob o ponteiro parado; "Ver tudo" cabe na largura livre, a primeira vista enquadra tudo ou começa no canto a 72%, pular para um quadro fica entre 60% e 100%; o foco num nó fora da tela move a câmera só o necessário. O desenho em DOM (`ArsenalCanvas`) não roda aqui (sem navegador).

## `client/tests/arsenalTree.test.ts` → [[Inventory UI]]

O modelo da árvore do Arsenal (`client/ui/arsenalTree.ts`, puro), 8 casos: as quatro linhas (Principal com os 7 rifles, Secundária com as 7 secundárias, Faca com as 7 facas, Granada) com as armas na ordem em que liberam e toda arma em uma linha; conta nova com os rifles e as facas antigos e as seis secundárias depois da pistola trancados, com os pontos que faltam de cada progressão (as secundárias pelos pontos de pistola, a furadeira mostrando a progressão da submetralhadora); com 7.500 pontos de pistola, só o Pistolão trancado (faltam 1.500), a furadeira equipada com o nível e as melhorias da submetralhadora e o revólver com os da pistola; com 13.200 pontos de rifle, seis rifles liberados e o Dourado a 2.800 pontos, e o equipado é o escolhido; toda arma com um nó por melhoria da sua progressão; a submetralhadora liberada e equipada; o nível máximo sem próximo nível; o estado de cada melhoria (ligada, desligada, trancada com os pontos que faltam, substituída pela opcional do grupo); um nó por melhoria em ordem de nível.

## `client/tests/weapon.test.ts` → [[Weapons]], [[Weapon Models]], [[SFX]]

A arma do cliente (`client/weapons/weapon.ts`, puro) com as secundárias da PF-10, 11 casos, num "banco de testes" que avança no passo fixo do jogo (`SIM.dt`):

- **Rajada do grampeador**: um clique segurado por 1,5 s dá exatamente 3 grampos, na cadência da rajada; um toque mais curto que um tick também dá os 3; clicando sem parar, as rajadas vêm em trincas com pelo menos 0,2 s entre uma e outra; com 2 grampos no pente saem 2; guardar a arma ou ficar com as mãos ocupadas (`holdFire`) corta a rajada; o gatilho dos bots (solto a cada outro tick) também dispara em trincas.
- **Bagos da garrucha**: um tiro, 8 bagos, todos dentro do cone de 4,5° (também andando e no ar); `pelletSpread` cobre o cone e não sai dele; dois tiros esvaziam o pente; as outras secundárias atiram uma bala só.
- **Cara e som próprios**: toda secundária tem o seu construtor em `GUN_MODELS` (todos diferentes), na mão da pistola (a submetralhadora curta), também com todas as melhorias da sua progressão; toda secundária tem a sua voz em `SHOT_VOICES`, diferente das outras e do rifle, e o pistolão é a mais grave; o `coiceVisual` do revólver, da garrucha e do pistolão (1,6, 2 e 2,5) e nenhum nas outras.

## `server/tests/secondaries.test.ts` → [[Weapons]], [[Anti Cheat]]

As secundárias da PF-10, 7 casos (6 puros e 1 online, ver [[Integration Tests]]):

- **Ficha**: os valores do plano em cada JSON e, no que a ficha não lista, os da pistola (multiplicadores fora a cabeça, recuperação, traçante, penetração — a garrucha sem nenhuma); a progressão de cada uma (a furadeira na da submetralhadora) e os pontos dos abates indo para ela.
- **Regra de equilíbrio (P10)**: o Rifle Padrão mata em 0,257 s até 30 m e 0,343 s a 40 m; com **qualquer combinação** das melhorias da progressão, nenhuma secundária nova mata mais rápido que ele a 15, 20, 25, 30, 35 e 40 m (TTK no peito sem recarga: o mais rápido possível, com a pausa da rajada e todos os bagos acertando); cada uma ganha de perto no seu nicho (a garrucha: um tiro com os 8 bagos no peito a 5 m, e 4 por bago a 15 m).
- **Tiro único na cabeça** só de perto: o revólver a 10 m sim e a 11 m não, o pistolão a 27 m sim e a 28 m não, nunca além (varrendo de 0 a 60 m), e nunca no grampeador, na furadeira e na garrucha; o silenciador de batata tira o do revólver.
- **Online**: com 7.000 pontos de pistola e o Gatilho desligado (300/min), o servidor aceita os 8 bagos de cada tiro — 56 acertos num segundo, 8× o limite de uma bala (7, que cortaria até um único disparo) — e recusa o acerto seguinte.

## `client/tests/pauseMenu.test.ts` → [[Menus]]

As regras do menu de pausa (`client/ui/pauseMenu.ts`, puro; PF-11), 21 casos: os **8 casos de lugar × modo** de `pauseContext` (mata-mata online e contra bots, corrida armada online e contra bots, zumbi online com equipe, online sozinho e solo, campo de tiro: chip, cor, linha, aviso vermelho/verde, aba, só consulta, rótulo e texto da saída), a linha do zumbi antes da primeira onda (o título da contagem do HUD no lugar de "Onda 0/12") e alguns em inglês; a **pilha do Esc** (janela → aba → jogo, `backStep`); **quem está na frente** da corrida armada (degrau e abates no degrau; "Você está na frente"; nenhum sem outro jogador nem com o primeiro empatado com o segundo, como no começo da rodada; empate mais abaixo não importa) e a ordem do placar fora da corrida (pontos, abates, menos mortes); a linha **"Mais N melhorias a liberar"** (a próxima e os pontos que faltam, a forma de uma só, nenhuma linha com tudo liberado, inglês); o **nome do mapa na prévia glTF** ("Prévia: arquivo.glb"); e os **grupos da aba Teclas** (toda ação remapeável uma vez, em Movimento, Combate ou Outros). O desenho em DOM (`Screens`, `ArsenalPanel`, as abas) não roda aqui (sem navegador).

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

Testa `shared/progression.ts` e `shared/arsenal.ts` (puros), 33 casos:

- **Níveis:** cada nível depois do primeiro libera uma melhoria, com pontos crescentes; o nível vem dos pontos da arma; armas diferentes têm quantidades diferentes de melhorias.
- **Melhorias em efeito:** as comuns ligam sozinhas; as opcionais só quando ligadas e liberadas; uma opcional ligada substitui as comuns do seu grupo (a luneta tira o ponto vermelho); uma comum desligada sai das ativas (sem as miras, volta a de ferro).
- **Travas das armas:** sem pontos, só o Rifle Padrão, a pistola, a faca de cozinha e a granada estão liberados; a submetralhadora libera com 1.800 pontos de pistola (trancada com 1.799), ou com qualquer ponto dela; os rifles antigos liberam com os pontos de rifle (a Tia trancada com 2.499 e liberada com 2.500) e as facas com os de faca (o Sabre com 9.000); as secundárias da PF-10 com os de pistola (700, 1.800 a submetralhadora, 3.200, 5.200, 7.000, 9.000; a furadeira não libera com pontos de submetralhadora; com 5.200, faltam só a garrucha e o pistolão), e uma secundária trancada volta para a pistola e nunca entra na primária; `pointsToUnlock`; com os pontos, `sanitizeChoice` devolve a pistola, o Rifle Padrão e a faca de cozinha no lugar das armas trancadas.
- **Escolha do Arsenal:** quem usava o Frango ou o Sabre como forma da faca fica com essa faca se os pontos a liberam; `sanitizeChoice` limpa o que veio do cliente (rifle, secundária e faca válidos, só opcionais conhecidas, uma por grupo, só comuns conhecidas em `desligadas`) e, com os pontos, descarta o que não foi liberado; `legacyChoice` dá às contas antigas a escolha mais parecida; `resolveLoadout`; as armas de cada espaço vêm dos dados, na ordem em que liberam (`PRIMARIES` com os 7 rifles, `SECONDARIES` com as 7 secundárias e a progressão de cada uma, `KNIVES` com as 7 facas); `sanitizeLoadout` só aceita ids conhecidos.
- **Atributos:** sem melhorias, `gunStats` é o JSON; cada melhoria muda atributos de verdade; o silenciador abafa e cobra dano e alcance; o sabre tem mais alcance e golpes mais espaçados que a faca; a granada vira mina ou Dose Dupla e ganha cinto e pólvora; cada abate de tiro vai para a arma que atirou (`weaponOfKill`).
- **Rifles e facas antigos:** cada rifle tem a vantagem e o custo do plano em relação ao Padrão; as melhorias do rifle valem em todo rifle e não mudam a pintura; as facas trocam alcance por velocidade e todas matam com um golpe; as miras antigas são os níveis 7 a 9 do rifle, opcionais do grupo `mira`.
- **Árvore e passivas das facas** (2026-10-07, [[ADR - Passivas das facas e Mão Leve]]): o afiador dá intervalo ×0,8 e +0,2 m de alcance em toda faca; a mão leve encurta o golpe ×0,7 sem mudar o momento do acerto, e com todas as melhorias o acerto continua dentro do golpe; cada faca tem a sua passiva, todas diferentes, com os números dos JSONs; `knifePassive` devolve a passiva no mata-mata e no campo de tiro e null na corrida armada e no zumbi; a árvore da faca é afiador (2, 600), tênis (3, 2.800) e mão leve (4, 4.500).
- **Migração 003:** lê `server/migrations/003_melhorias.sql` e confere que todo XP de destino é um limiar que existia nos níveis **da época** da migração (fixados no teste: os níveis de hoje mudaram com a PF-8) ([[Data Migrations]]).

## `client/tests/offlineModes.test.ts` → [[Training]], [[Versus Bots]], [[Zombie]]

O que o jogo offline usa da progressão, sem navegador:

- **Treino e contra bots (`Progress`, `client/gameplay/progress.ts`)**: sem conta, Rifle Padrão, pistola e faca de cozinha sem melhorias, nada liga, as armas com trava ficam trancadas e nada é salvo; com conta, cada arma em cada nível dá o equipamento da conta (só o que o nível liberou, uma opcional por grupo; secundária trancada volta para a pistola), ligar/desligar cada opcional **e cada comum** muda as armas na mão (ligar a comum desliga a opcional do grupo), e as mudanças são salvas com `PATCH /api/perfil` (o `fetch` é trocado por um gravador; espera-se `settled()`); a submetralhadora libera com a pistola no nível 3 ou com pontos dela; os rifles e as facas antigos liberam com os pontos de rifle e de faca e entram no equipamento (`setPrimary`, `setKnife`); um salvamento que falha volta à escolha da conta e avisa (`onSaveError`); cliques rápidos mandam um salvamento por vez e só a última escolha que esperava; o `progresso` que chega do servidor é limpo contra os pontos novos.
- **Bots**: o sorteio da arma (`pickGun`, `client/ai/botGuns.ts`): rifle em 60% das vidas e, nas outras 40%, qualquer uma das 7 secundárias com a mesma chance (limites exatos e 70.000 sorteios com semente); toda arma que um bot sorteia (qualquer rifle ou secundária e qualquer faca, sem melhorias) e todo degrau da escada (como o bot e o jogador recebem) dão atributos válidos; o abate com a arma do degrau conta, a facada também (em todo degrau), e no último só a facada do sabre. A faca dos bots (`BotKnife`, `client/tests/botKnife.test.ts`, 5 casos): hesita antes do golpe e não golpeia sem poder; a espera recomeça quando o alvo sai do alcance ou da frente; um só golpe por aproximação, acertando ou errando (recuar menos de 5 m não devolve a chance); a chance volta depois de se afastar mais de `KNIFE_REARM`; a chance é por alvo e uma vida nova devolve todas.
- **Zumbi sozinho (`LocalZombies`, `client/zombies/local.ts`)** sobre a navmesh pré-gerada: começa com o rifle simples; dano no chefe do rifle, da faca e da granada pelas mesmas funções do servidor; o caixão entrega a arma (gancho `setLoadout` e evento `playerLoadout`) com as melhorias dela, e o dano é o dela × a raridade; uma rodada danificada (os dois defeitos) chega com o defeito no equipamento, o dano × 0,75 e menos pente e reserva (`zombieGunData`); erguer uma barricada sozinho custa o mesmo e dá as mesmas tábuas; sozinho, cair encerra a partida (`zend`).

Não rodam aqui (precisam do navegador): `BotManager` e `Bot` (malhas, física Rapier e placas de nome em canvas) e a escolha do equipamento inicial em `client/main.ts` (dentro da closure com DOM); o teste cobre as funções puras que eles chamam. Para rodar o jogo solo sem DOM, a interface `ZombieLink` foi para `client/zombies/link.ts` (antes em `client.ts`, que depende do navegador).

## `server/tests/progression-modes.test.ts` → [[Weapons]], [[Progression]], [[Game Modes Index]]

A matriz progressão × modos (descrita em [[Integration Tests]]) também é, em parte, unitária: toda combinação de melhorias de toda arma de fogo (os sete rifles com as melhorias do rifle), de cada uma das sete facas e da granada dá atributos finitos e positivos, e todo equipamento que um modo entrega no meio da partida (degraus da escada, combinações de itens do caixão) é válido.

## Typecheck

`client/tests` é excluído do `tsconfig.json` do navegador e incluído no `server/tsconfig.json` (tipos do Bun), então é verificado por `bun run typecheck`.

## Código relacionado

- `client/tests/*.test.ts`, `server/tests/appearance.test.ts`, `server/tests/arsenal.test.ts`, `server/tests/progression-modes.test.ts`
- Módulos testados: `client/gameplay/aimAssist.ts`, `client/core/keybinds.ts`, `client/audio/spatial.ts`, `client/ui/strings.ts`, `client/gameplay/progress.ts`, `client/zombies/local.ts`, `shared/appearance.ts`, `shared/progression.ts`, `shared/arsenal.ts`, `shared/gunGame.ts`, `shared/zombies.ts`, `shared/zombieMatch.ts`
