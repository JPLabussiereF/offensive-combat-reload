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
  - client/tests/zombieSpectate.test.ts
  - client/tests/spatial.test.ts
  - server/tests/appearance.test.ts
  - server/tsconfig.json
  - client/tests/arsenalText.test.ts
  - server/tests/arsenal.test.ts
  - shared/arsenal.ts
  - server/migrations/003_melhorias.sql
  - client/tests/offlineModes.test.ts
  - client/tests/stickerArt.test.ts
  - client/gameplay/progress.ts
  - client/zombies/local.ts
  - client/zombies/link.ts
  - server/tests/progression-modes.test.ts
  - client/tests/remoteImpact.test.ts
  - client/weapons/remoteImpact.ts
  - client/tests/oneHandGrip.test.ts
  - client/tests/viewmodelOneHand.test.ts
  - client/tests/mapConversion.test.ts
  - client/tests/mapData.test.ts
  - client/tests/budget.test.ts
  - client/tests/seeded.test.ts
  - client/tests/mapPose.test.ts
  - client/tests/editorHistory.test.ts
  - client/tests/editorRecovery.test.ts
  - client/tests/shadowMap.test.ts
  - client/tests/mapsScreen.test.ts
  - client/tests/mapGroups.test.ts
  - client/tests/editorGroups.test.ts
  - client/tests/editorLayout.test.ts
  - client/tests/editorBatches.test.ts
  - client/tests/editorCamera.test.ts
  - client/tests/editorTools.test.ts
  - client/tests/editorBoxSelect.test.ts
  - client/tests/editorClipboard.test.ts
  - client/tests/editorShortcuts.test.ts
  - client/tests/editorRect.test.ts
  - client/tests/editorThumbs.test.ts
  - client/tests/editorDrop.test.ts
  - client/tests/editorPlay.test.ts
  - client/tests/editorDefaults.test.ts
  - tools/snapshot-mapas.ts
  - tools/headless.ts
  - client/tests/arsenalTree.test.ts
  - client/tests/arsenalCanvasLayout.test.ts
  - client/tests/pauseMenu.test.ts
  - client/tests/damageNumbers.test.ts
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

29 casos em grupos:

- **Atribuir teclas:** tecla livre vai ao espaço escolhido sem alterar o original; tecla usada sai da outra ação e informa o espaço que ficou vazio; aceita botões laterais do mouse; recusa `Ctrl` e as teclas fixas, dizendo o motivo.
- **Roda do mouse:** vale em ações de um toque; recusada em ações de segurar e no chat; descartada ao carregar se salva numa ação de segurar; tem nome nos dois idiomas.
- **Esvaziar um espaço (×)** e **teclas proibidas** (`Ctrl` dos dois lados, `F3`, `F4`, `F6`).
- **Carregar o salvo:** sem nada volta o padrão (cópia); ação nova recebe o padrão; respeita espaço vazio de propósito; descarta lixo; tecla duplicada fica só na primeira.
- **Teclas do caixão no modo zumbi:** `Z` doa e `X` recusa por padrão, e um save antigo (sem essas ações) as ganha.
- **Tabela do Input** e **nome das teclas** (QWERTY, AZERTY via mapa do navegador, fallback do Firefox, código desconhecido).

## `client/tests/zombieSpectate.test.ts` → [[Zombie]]

5 casos: ninguém de pé, ninguém para assistir; começa pelo primeiro por id e fica nele sem tecla; F vai ao próximo e D ao anterior, dando a volta (com um só, fica nele); quem assistíamos morreu ou saiu, passa ao seguinte por id sem contar a tecla; a altura dos olhos em pé, agachado e caído (`pickSpectate`, `spectateEye`).

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

## `client/tests/damageNumbers.test.ts` → [[HUD]], [[Damage System]]

Os números de dano flutuantes (`client/ui/damageNumbers.ts`), 12 casos: a **cor** de cada região (corpo amarelo, cabeça laranja, virilha vermelha; com a poção do crítico tudo laranja, menos a virilha) e que o laranja é o mesmo dano de cabeça da fórmula; **um número por alvo** em cada disparo (bagos somados, cor do acerto mais forte, lugar do primeiro bago, ponto copiado), com o pássaro limitado à vida do alvo em vez de 9999; a **animação** (nasce 1,45×, volta a 1× em 12% da vida, some nos últimos 40%, sobe 44 px); e a **camada** sobre um DOM falso (número arredondado com a classe da cor, nada para dano zero, projeção no centro da tela para um ponto à frente, some após 0,7 s, invisível atrás da câmera, no máximo 24 com o mais antigo saindo primeiro).

## `client/tests/spatial.test.ts` → [[Spatial Audio]]

- Parede abafa e baixa o som sem silenciar; papel quase não abafa.
- Sons distantes mais abafados e baixos.
- Ponto sob telhado com paredes é "fechado"; campo aberto não.
- Passos: andando, mais altos correndo, nenhum agachado.
- Pouso, início de deslize e de recarga geram um som cada.
- Renascer do outro lado do mapa não conta como passo.

Usa um `CastFn` falso para simular paredes, sem física real.

## `client/tests/remoteImpact.test.ts` → [[Decals]]

Onde o tiro de outro jogador bateu no mapa (`remoteImpact`), 6 casos num mundo Rapier real com o mesmo filtro (`WORLD_ONLY`) e a mesma consulta do `main.ts`:

- Tiro que terminou numa parede de concreto: ponto, normal e material.
- Tiro inclinado numa parede de madeira: ponto na face e material `wood`.
- Tiro para o céu: nada.
- Tiro que terminou num jogador encostado na parede (peito a 60 cm, cotovelo a 6 cm da parede): nada (a hitbox é ignorada e a janela vai só 5 cm além do ponto).
- Tiro que terminou a menos de 5 cm da parede ainda marca a parede.
- Tiro sem comprimento: nada.

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

## `client/tests/stickerArt.test.ts` → [[Achievements]], [[Asset Pipeline]]

- **Manifestos** (`shared/data/figurinhas/*.json`): leem, chaves em ordem com a linha `_doc`, cada id existe no álbum e está só no manifesto do seu domínio.
- **PNGs:** cada um existe, tem a assinatura PNG e o tamanho certo no cabeçalho (400 × 300 e 128 × 128), o hash dos bytes bate com o manifesto (`?v=`), fica abaixo de 150 KB (carta) e 30 KB (mini), e não sobra PNG sem dono.
- **No álbum:** secreta não colada nunca manda a URL da arte; uma página só usa arte quando todas as figurinhas dela têm; o selo usa a mini.
- **Estúdio:** o recorte (fechamento, buracos, peças) e o elenco (vizinhos simples, o sexo de cada visual, cabelo e barba no `dress`).
- Roda sem banco: `bun --config=<bunfig sem preload> test client/tests/stickerArt.test.ts`.

## `client/tests/offlineModes.test.ts` → [[Training]], [[Versus Bots]], [[Zombie]]

O que o jogo offline usa da progressão, sem navegador:

- **Treino e contra bots (`Progress`, `client/gameplay/progress.ts`)**: sem conta, Rifle Padrão, pistola e faca de cozinha sem melhorias, nada liga, as armas com trava ficam trancadas e nada é salvo; com conta, cada arma em cada nível dá o equipamento da conta (só o que o nível liberou, uma opcional por grupo; secundária trancada volta para a pistola), ligar/desligar cada opcional **e cada comum** muda as armas na mão (ligar a comum desliga a opcional do grupo), e as mudanças são salvas com `PATCH /api/perfil` (o `fetch` é trocado por um gravador; espera-se `settled()`); a submetralhadora libera com a pistola no nível 3 ou com pontos dela; os rifles e as facas antigos liberam com os pontos de rifle e de faca e entram no equipamento (`setPrimary`, `setKnife`); um salvamento que falha volta à escolha da conta e avisa (`onSaveError`); cliques rápidos mandam um salvamento por vez e só a última escolha que esperava; o `progresso` que chega do servidor é limpo contra os pontos novos.
- **Bots**: o sorteio da arma (`pickGun`, `client/ai/botGuns.ts`): rifle em 60% das vidas e, nas outras 40%, qualquer uma das 7 secundárias com a mesma chance (limites exatos e 70.000 sorteios com semente); toda arma que um bot sorteia (qualquer rifle ou secundária e qualquer faca, sem melhorias) e todo degrau da escada (como o bot e o jogador recebem) dão atributos válidos; o abate com a arma do degrau conta, a facada também (em todo degrau), e no último só a facada do sabre. A faca dos bots (`BotKnife`, `client/tests/botKnife.test.ts`, 5 casos): hesita antes do golpe e não golpeia sem poder; a espera recomeça quando o alvo sai do alcance ou da frente; um só golpe por aproximação, acertando ou errando (recuar menos de 5 m não devolve a chance); a chance volta depois de se afastar mais de `KNIFE_REARM`; a chance é por alvo e uma vida nova devolve todas.
- **Zumbi sozinho (`LocalZombies`, `client/zombies/local.ts`)** sobre a navmesh pré-gerada: começa com a pistola simples; dano no chefe da pistola, da faca e da granada pelas mesmas funções do servidor; o caixão entrega a arma (gancho `setLoadout` e evento `playerLoadout`) com as melhorias dela, e o dano é o dela × a raridade; uma rodada danificada (os dois defeitos) chega com o defeito no equipamento, o dano × 0,75 e menos pente e reserva (`zombieGunData`); erguer uma barricada sozinho custa o mesmo e dá as mesmas tábuas; sozinho, cair encerra a partida (`zend`).

Não rodam aqui (precisam do navegador): `BotManager` e `Bot` (malhas, física Rapier e placas de nome em canvas) e a escolha do equipamento inicial em `client/main.ts` (dentro da closure com DOM); o teste cobre as funções puras que eles chamam. Para rodar o jogo solo sem DOM, a interface `ZombieLink` foi para `client/zombies/link.ts` (antes em `client.ts`, que depende do navegador).

## `client/tests/oneHandGrip.test.ts` → [[Animation]], [[Character Customization]]

O personagem completo (`Character`, sem WebGL) e o `CharacterAnimator` com o modo PCD de uma mão: `LEFT_GRIP` é o espelho de `RIFLE_GRIP`; para `maoDir`, `bracoDir`, `maoEsq`, `bracoEsq` e sem PCD, o rifle aponta para a frente do peito no quadril e na mira (produto escalar > 0,95), segue a pose de corrida, fica do lado da mão que o segura, o braço direito fica pendurado sem o lado direito e a mão ou o coto esquerdo fica sob o guarda-mão nos outros casos; a recarga de uma mão deixa o rifle perto do peito enquanto a mão sai da empunhadura; a granada põe o rifle nas costas só com uma mão; a faca vai na esquerda sem a direita; e o esqueleto das hitboxes (o mesmo de `entities/rig.ts`) faz a mesma pose de uma mão que o personagem visível (mãos e antebraços a menos de 1 cm).

## `client/tests/viewmodelOneHand.test.ts` → [[Animation]]

O `Viewmodel` de verdade com um `document` mínimo (só o canvas do clarão do tiro): mirando, o ponto da mira fica no centro (x ≈ 0, y ≈ 0) com e sem a mão direita; sem a mão direita, a arma fica do lado esquerdo da tela. O arquivo carrega `viewmodel.ts` por caminho, porque a checagem de tipos do servidor (que cobre `client/tests`) não tem os tipos do DOM.

## `server/tests/progression-modes.test.ts` → [[Weapons]], [[Progression]], [[Game Modes Index]]

A matriz progressão × modos (descrita em [[Integration Tests]]) também é, em parte, unitária: toda combinação de melhorias de toda arma de fogo (os sete rifles com as melhorias do rifle), de cada uma das sete facas e da granada dá atributos finitos e positivos, e todo equipamento que um modo entrega no meio da partida (degraus da escada, combinações de itens do caixão) é válido.

## Mapas como dados (PF-6) → [[World Structure]], [[ADR - Mapas como dados com catálogo de peças]]

Os mapas são montados **sem tela** no Bun (`tools/headless.ts`: canvas falso, `.glb` lidos de `public/` no disco, `Math.random` fixo durante a montagem; os módulos do cliente entram por caminho variável, para o typecheck do servidor não segui-los).

- `client/tests/mapConversion.test.ts`: cada um dos 4 mapas oficiais, montado a partir do JSON pelo carregador, é igual ao seu golden (`shared/data/mapas/<id>.golden.json`, gravado do código original antes da conversão), com tolerância de 1e-6: colisores (forma, posição, giro, tamanho, material, oclusor, `onShot`), ids do `PropBus`, vãos, salas, spawns, bonecos, `killY`, sombra, céu, luzes, lotes e objetos da cena (hash dos triângulos, independente da ordem). E o modo editor: uma peça por grupo, os colisores repartidos entre as peças, nenhum lote fora delas.
- `client/tests/mapData.test.ts`: `validateMapData` (os oficiais passam; mapas quebrados são recusados com o motivo: tipo desconhecido, parâmetro fora do esquema, id repetido, id do `PropBus` inválido ou repetido, limite por mapa, bruxa sem posição, coletável, rato e arquivo sem par, mapa zumbi sem dados), o esquema do catálogo, um adaptador para cada tipo, as superfícies iguais às do cliente, as peças da bruxa, do rato e do armário batendo com `objetos`, os dados de zumbi do cemitério iguais aos do modo, e o nome, o cartão e o `exclusivo` dos oficiais iguais a `OFFICIAL_INFO` (os seletores da tela inicial).
- `client/tests/roles.test.ts`: as regras de `shared/roles.ts` (agir sobre, punir, conceder, promover, rebaixar; o último admin fica; ninguém se pune).
- `client/tests/budget.test.ts`: contagem de chamadas e triângulos (câmera, sombra, grupos de material, instâncias) e os 4 oficiais dentro de 400 chamadas e 750 mil triângulos (o teste imprime os números).
- `client/tests/seeded.test.ts`: `seeded()` dá os mesmos números de antes e `seeded(r.state)` continua a sequência de `r`.
- `client/tests/mapPose.test.ts` (P32, [[ADR - Editor de mapas no jogo]]): a pose vira matriz e volta igual; `validateMapData` aceita a pose e recusa uma quebrada; peça sem pose (ou com pose nula) monta idêntica; uma parede girada em ângulo livre nos três eixos tem cada colisor no lugar da pose, os lotes levados, o vão com o centro certo e a porta continua passagem (raio pela porta não bate, a 2 m dela bate); uma sala girada acha o ponto dentro da caixa girada e não o canto da caixa alinhada em volta; `ROOM_` girado guarda o referencial (sem giro, a caixa de sempre); o biscoito de um armário girado fica onde o servidor espera; a luz de uma lanterna de papel girada sai de onde a pose a leva e o recorte de um lago girado vai com a pose (P42); no modo editor, tirar a peça leva colisores, sala e vão, e ela monta de novo igual.
- `client/tests/shadowMap.test.ts` (`client/render/shadows.ts`, PF-6 Revisions 01): o mapa de sombra do sol é pedido quando ainda não existe (o primeiro quadro, ou um laço que não o agenda, como era o do editor de mapas), um laço só de render fica com ele depois do primeiro quadro, e nada é forçado quando ele já existe, com as sombras desligadas ou sem sol que projete sombra ([[Problem - Editor sem mapa de sombra com aceleração de hardware]]).
- `client/tests/editorRecovery.test.ts` (`client/editor/recovery.ts`): o rascunho guardado (registro com data e versão de origem, ou um mapa antigo sem data) e quando ele é oferecido (mais novo que a versão atual; num mapa novo, sempre), a versão sobre a qual o rascunho recuperado salva (P40); "salvar como nova versão mesmo assim" com a versão do 409 (P39); o Play (antes o Testar) abre o zumbi num mapa exclusivo e o treino nos outros (P41).
- `client/tests/mapsScreen.test.ts` (`client/ui/mapsRules.ts`, `client/ui/managementRules.ts`): os botões de cada cartão da aba Mapas para o dono, outro jogador, admin, moderador e sem conta (oficial, comunidade, oculto); sem Excluir e Ocultar nos 4 oficiais originais (P44, P45); Contra bots e Campo de tiro só nos mapas abertos e o tipo de partida dos bots (P43); os modos de um mapa aberto e de um exclusivo do zumbi; o endereço da lista (busca por nome ou autor, ordem, página, ocultos só para a equipe); os mapas da tela inicial (oficiais do servidor, mapas das sessões, cartão pedido uma vez); o painel do Gerenciamento pelas permissões (moderador diante de jogador e de admin, a própria conta), a sanção (motivo e duração) e o progresso (só o que mudou, números válidos).
- `client/tests/editorHistory.test.ts` (cada tipo vira uma peça nova válida com os padrões do catálogo, P53): desfazer e refazer de peças adicionadas, mudadas, apagadas (várias de uma vez, no lugar certo da lista) e do resto do mapa; o que cada edição manda reconstruir; o limite do histórico; "não salvo"; as teclas (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z); o gizmo (peça livre continua com `p` e `yaw`, inclinada ganha pose e perde ao ficar em pé, peça linear ou fixa só muda a pose, a bruxa leva o seu lugar junto); cada tipo do catálogo vira uma peça nova válida; ids, ids de piada e de objetos sem repetir; rato e bruxa novos e apagados com os seus `objetos`; duplicar; marcadores (pôr, mover, girar, tirar; modelo do zumbi válido, brecha presa ao muro, canto leva as brechas); pontas e vãos de paredes e cercas.

- `client/tests/mapGroups.test.ts` (grupos, PF-6 Revisions 01): `validateMapData` aceita peças em grupos e grupos em grupos com nome, e recusa pai inexistente, que não é grupo, a própria peça, ciclo, mais de 16 níveis e nome vazio; a pose do grupo compõe com a da peça (colisores e vão iguais aos da peça com a pose composta), grupos aninhados de fora para dentro, peça livre levada pelo grupo; grupo que não move nada deixa tudo igual a sem grupo, e no jogo um grupo não monta nada; no editor o grupo tem o seu grupo na cena e o filho vai para onde ele leva. No servidor, `server/tests/maps.test.ts` salva um mapa com grupo (os colisores contados pelo construtor batem com os do cliente) e recusa `pai` que não é grupo.
- `client/tests/editorGroups.test.ts` (`client/editor/groups.ts`): agrupar a seleção (o grupo no meio dela, no lugar da primeira peça, as peças sem sair do lugar; desfazer e refazer); mover e girar o grupo leva os filhos e o lugar da bruxa, numa edição que só nomeia o grupo; pôr dentro de um grupo girado, tirar e reordenar mantêm o lugar no mundo, e reordenar não remonta nada; um grupo não entra nele mesmo nem num de dentro; escalar o grupo espalha os filhos e aumenta o que tem `escala`; duplicar copia os filhos para o grupo novo e apagar leva os filhos; a lista nova vira um patch com só o que saiu de ordem.
- `client/tests/editorLayout.test.ts` (`client/editor/dockLayout.ts`, `client/editor/transformFields.ts`): o layout padrão do Unity; serializar e restaurar, e layout quebrado voltando ao padrão; aba no meio de uma pilha empilha, na borda divide, pilha vazia some, divisões do mesmo sentido se juntam; arrastar a borda (com mínimo); a zona sob o ponteiro; graus e radianos do Transform, o valor digitado mantido (200°), os campos em comum de uma seleção múltipla e a edição digitada ou arrastada.
- `client/tests/editorBatches.test.ts` (P46, `client/editor/batches.ts`): no Jardim, o editor com lotes desenha em chamadas próximas às do jogo (o teste imprime: jogo 233, editor sem lotes 1.682, com lotes 142, sem recorte); a peça selecionada sai do lote e volta; as cópias seguem a malha que se move e o raio da seleção acerta a malha da peça, nunca o lote; materiais iguais de peças diferentes dividem um lote e o material que muda sai dele; peça remontada ou apagada troca ou leva as cópias.
- `client/tests/editorCamera.test.ts` (`client/editor/cameraMath.ts`, etapa 3): frente, direita e cima batem com a câmera do three; olhar para um ponto; olhar em volta e voar; órbita em volta do pivô (a distância fica e ele continua no centro) e em volta do meio da seleção fora do centro (ele fica no mesmo lugar da tela), parando no topo; arrastar leva o ponto do pivô pixel por pixel; a roda aproxima do pivô no meio da tela, vai na direção do cursor fora dele e, na ortográfica, deixa parado o ponto sob o cursor; F põe a caixa inteira na tela; as vistas pelos eixos; a transição gira pelo lado curto.
- `client/tests/editorTools.test.ts` (`client/editor/tools.ts`): encaixe livre, com Ctrl, com o botão de grade e com passos escolhidos (vírgula aceita, faixas); as escolhas voltam do navegador e o que estiver quebrado volta ao padrão (Pivô, Global); Pivô e Centro (posição, giro e escala do gizmo); eixos Local e Global; girar com o Centro gira em volta do meio da seleção e com o Pivô em volta da ativa; escalar com o Centro espalha e aumenta o que tem escala.
- `client/tests/editorBoxSelect.test.ts` (`client/editor/boxSelect.ts`): o retângulo em pixels vira coordenadas da vista; polígono por dentro, por cima, cruzando e a lasca que só tem a caixa por perto; recorte no plano de perto; numa cena com caixotes, chão, uma peça atrás da câmera, uma oculta e uma malha instanciada: o que encosta entra (o chão também), atrás da câmera e oculto não, em perspectiva e na ortográfica de cima; Shift soma, Ctrl alterna.
- `client/tests/editorClipboard.test.ts` (`client/editor/clipboard.ts`): colar um grupo dá ids novos, os filhos penduram no grupo novo, tudo deslocado, e um desfazer tira tudo; a peça de dentro de um grupo volta para ele ou, com ele apagado, para o topo no mesmo lugar do mundo; a cópia não muda com edições depois; colar duas vezes não repete id nem id de piada, cada rato ganha o seu lugar, a bruxa (uma só) fica de fora; o ponto de colar.
- `client/tests/editorShortcuts.test.ts` (`client/editor/shortcuts.ts`): Q W E R T, F, F2, Delete, Backspace, Esc; Ctrl (ou Cmd) com Z, Y, Shift+Z, D, C, V, A, G e o que fica para o navegador; nada com um campo de texto em foco; as letras são da câmera com o botão direito; Shift e Alt não trocam ferramenta; o que conta como campo de texto.
- `client/tests/editorRect.test.ts` (`client/editor/rectTool.ts`): o retângulo na face mais virada para a câmera (também numa caixa girada); mover por dentro, livre e em passos; a borda estica só o seu lado, com tamanho mínimo; o canto escala por igual a partir do canto oposto (em décimos ao encaixar); esticar uma caixa girada muda tamanho e lugar com a face oposta parada; o colisor pela meia medida; o que não estica.
- `client/tests/editorThumbs.test.ts` (`client/editor/thumbCache.ts`, `client/editor/thumbQueue.ts`, etapa 4): a chave da miniatura (tipo, GLB pelo hash, marcador); a assinatura não depende da ordem das chaves e muda com a entrada do catálogo, os parâmetros da peça nova, a versão do jogo e o formato do desenho; a guardada com outra assinatura conta como ausente e é trocada; tipos que saíram do catálogo são esquecidos (GLB fica); a fila desenha uma de cada vez num momento livre, a mesma pedida duas vezes uma vez, a pasta na tela primeiro (e trocar de pasta baixa as outras), uma falha não para a fila, o pedido de novo depois de mudar o asset, e segura durante o Play.
- `client/tests/editorDrop.test.ts` (`client/editor/dropPiece.ts`): na Cena, o ponto na grade do passo de mover (a altura como está); a peça livre no ponto e a de pose com o meio da base nele, no fim da lista; a prévia fantasma; na Hierarchy, dentro do grupo da linha (ou dela mesma), na origem dele (um grupo girado dentro de outro), no fim dos filhos, e no topo abaixo das linhas; a peça de pose medida sozinha; o rato leva o lugar do servidor no ponto do mundo, a bruxa no limite não entra; o modelo GLB com o arquivo; e a peça com o lugar do rato numa edição só, desfeita e refeita de uma vez.
- `client/tests/editorPlay.test.ts` (`client/editor/playMode.ts`): os botões ▶ ❚❚ ■ em cada estado (editando → jogando → pausado → jogando → parado); jogando, sem atalhos, câmera nem edição; pausado, câmera, seleção e F, Esc, Ctrl+C, Ctrl+A (Ctrl+Z e Delete não); a sessão chama pausa, continuação e fim no jogo; o ■ devolve seleção e câmera de antes do ▶ e as edições tentadas no Play (painel, tecla, desfazer) não entram no documento; seis Play/Stop seguidos soltam cada jogo uma vez e as geometrias e texturas contadas voltam a zero; ■ durante o carregamento aborta e solta o jogo que fica pronto depois, ❚❚ durante o carregamento começa pausado; o jogo que não sobe volta a editar e o Sair do jogo é um ■; P52: o jogo começa direto só com o clique do ▶ ainda valendo (sem ele, ou sem a API, fica o cartão).
- `client/tests/editorDefaults.test.ts` (P53, `shared/mapCatalog.ts`, `client/editor/create.ts`): cada tipo do catálogo, montado sozinho só com os padrões (o carregador do jogo, sem tela), monta sem erro, é válido e desenha algo entre 9 cm e 20 m (sala, colisor, luz e brasas não desenham nada por natureza); o cilindro novo tem 1 m; os padrões de listas e de JSON montam e vêm copiados; arrastar do Project cria com os padrões.

O hash da navmesh do Cemitério (`server/tests/zombies.test.ts`) é refeito a partir do JSON e continua igual.

## Typecheck

`client/tests` é excluído do `tsconfig.json` do navegador e incluído no `server/tsconfig.json` (tipos do Bun), então é verificado por `bun run typecheck`.

## Código relacionado

- `client/tests/*.test.ts`, `server/tests/appearance.test.ts`, `server/tests/arsenal.test.ts`, `server/tests/progression-modes.test.ts`
- Módulos testados: `client/gameplay/aimAssist.ts`, `client/core/keybinds.ts`, `client/audio/spatial.ts`, `client/ui/strings.ts`, `client/gameplay/progress.ts`, `client/zombies/local.ts`, `client/zombies/spectate.ts`, `shared/appearance.ts`, `shared/progression.ts`, `shared/arsenal.ts`, `shared/gunGame.ts`, `shared/zombies.ts`, `shared/zombieMatch.ts`
