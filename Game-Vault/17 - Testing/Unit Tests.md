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
  - client/tests/arsenalTree.test.ts
  - client/tests/arsenalCanvasLayout.test.ts
  - client/ui/arsenalTree.ts
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

- Um caso por idioma (pt-BR e en): toda arma e toda melhoria de `progression.json` tem nome e descrição (`arma_*`, `armaDesc_*`, `upg_<arma>_<id>`, `upgDesc_*`), todo efeito tem o seu rótulo (`fx_*`) e toda linha da árvore do Arsenal o seu (`treeRow_*`) em `client/ui/strings.ts`.

## `client/tests/arsenalCanvasLayout.test.ts` → [[Inventory UI]]

A geometria e a câmera do canvas do Arsenal da tela inicial (`client/ui/arsenalCanvasLayout.ts`, puro), 6 casos: quatro quadros um embaixo do outro, com 7, 2, 7 e 1 armas lado a lado no espaçamento do design e dentro do quadro; as melhorias da arma mostrada ficam em linhas por tipo, cada uma com rótulo (rifle: 5 miras e 3 melhorias; pistola: 1 mira e 3; faca: uma linha de 2; granada: 2 modos e 2 melhorias), empilhadas com espaço para o rótulo, um tronco por quadro, e outro rifle mostrado leva as mesmas melhorias para baixo dele (a linha mais longa ou o último rifle marcam o fim); as linhas laranja até a melhoria ligada e pontilhadas até a trancada, o tronco pontilhado quando nada embaixo dele pode ser usado, e a arma trancada tranca o ramo dela; o zoom fica entre 25% e 200% com o ponto sob o ponteiro parado; "Ver tudo" cabe na largura livre, a primeira vista enquadra tudo ou começa no canto a 72%, pular para um quadro fica entre 60% e 100%; o foco num nó fora da tela move a câmera só o necessário. O desenho em DOM (`ArsenalCanvas`) não roda aqui (sem navegador).

## `client/tests/arsenalTree.test.ts` → [[Inventory UI]]

O modelo da árvore do Arsenal (`client/ui/arsenalTree.ts`, puro), 7 casos: as quatro linhas (Principal com os 7 rifles, Secundária com 2, Faca com as 7 facas, Granada) com as armas na ordem em que liberam e toda arma em uma linha; conta nova com os rifles e as facas antigos e a submetralhadora trancados, com os pontos que faltam de cada progressão; com 13.200 pontos de rifle, seis rifles liberados e o Dourado a 2.800 pontos, e o equipado é o escolhido; toda arma com um nó por melhoria da sua progressão; a submetralhadora liberada e equipada; o nível máximo sem próximo nível; o estado de cada melhoria (ligada, desligada, trancada com os pontos que faltam, substituída pela opcional do grupo); um nó por melhoria em ordem de nível.

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

Testa `shared/progression.ts` e `shared/arsenal.ts` (puros), 31 casos:

- **Níveis:** cada nível depois do primeiro libera uma melhoria, com pontos crescentes; o nível vem dos pontos da arma; armas diferentes têm quantidades diferentes de melhorias.
- **Melhorias em efeito:** as comuns ligam sozinhas; as opcionais só quando ligadas e liberadas; uma opcional ligada substitui as comuns do seu grupo (a luneta tira o ponto vermelho); uma comum desligada sai das ativas (sem as miras, volta a de ferro).
- **Travas das armas:** sem pontos, só o Rifle Padrão, a pistola, a faca de cozinha e a granada estão liberados; a submetralhadora libera com 1.800 pontos de pistola (trancada com 1.799), ou com qualquer ponto dela; os rifles antigos liberam com os pontos de rifle (a Tia trancada com 2.499 e liberada com 2.500) e as facas com os de faca (o Sabre com 9.000); `pointsToUnlock`; com os pontos, `sanitizeChoice` devolve a pistola, o Rifle Padrão e a faca de cozinha no lugar das armas trancadas.
- **Escolha do Arsenal:** quem usava o Frango ou o Sabre como forma da faca fica com essa faca se os pontos a liberam; `sanitizeChoice` limpa o que veio do cliente (rifle, secundária e faca válidos, só opcionais conhecidas, uma por grupo, só comuns conhecidas em `desligadas`) e, com os pontos, descarta o que não foi liberado; `legacyChoice` dá às contas antigas a escolha mais parecida; `resolveLoadout`; as armas de cada espaço vêm dos dados, na ordem em que liberam (`PRIMARIES` com os 7 rifles, `SECONDARIES`, `KNIVES` com as 7 facas); `sanitizeLoadout` só aceita ids conhecidos.
- **Atributos:** sem melhorias, `gunStats` é o JSON; cada melhoria muda atributos de verdade; o silenciador abafa e cobra dano e alcance; o sabre tem mais alcance e golpes mais espaçados que a faca; a granada vira mina ou Dose Dupla e ganha cinto e pólvora; cada abate de tiro vai para a arma que atirou (`weaponOfKill`).
- **Rifles e facas antigos:** cada rifle tem a vantagem e o custo do plano em relação ao Padrão; as melhorias do rifle valem em todo rifle e não mudam a pintura; as facas trocam alcance por velocidade e todas matam com um golpe; as miras antigas são os níveis 7 a 9 do rifle, opcionais do grupo `mira`.
- **Migração 003:** lê `server/migrations/003_melhorias.sql` e confere que todo XP de destino é um limiar que existia nos níveis **da época** da migração (fixados no teste: os níveis de hoje mudaram com a PF-8) ([[Data Migrations]]).

## `client/tests/offlineModes.test.ts` → [[Training]], [[Versus Bots]], [[Zombie]]

O que o jogo offline usa da progressão, sem navegador:

- **Treino e contra bots (`Progress`, `client/gameplay/progress.ts`)**: sem conta, Rifle Padrão, pistola e faca de cozinha sem melhorias, nada liga, as armas com trava ficam trancadas e nada é salvo; com conta, cada arma em cada nível dá o equipamento da conta (só o que o nível liberou, uma opcional por grupo; secundária trancada volta para a pistola), ligar/desligar cada opcional **e cada comum** muda as armas na mão (ligar a comum desliga a opcional do grupo), e as mudanças são salvas com `PATCH /api/perfil` (o `fetch` é trocado por um gravador; espera-se `settled()`); a submetralhadora libera com a pistola no nível 3 ou com pontos dela; os rifles e as facas antigos liberam com os pontos de rifle e de faca e entram no equipamento (`setPrimary`, `setKnife`); um salvamento que falha volta à escolha da conta e avisa (`onSaveError`); cliques rápidos mandam um salvamento por vez e só a última escolha que esperava; o `progresso` que chega do servidor é limpo contra os pontos novos.
- **Bots**: toda arma que um bot sorteia (qualquer rifle ou secundária e qualquer faca, sem melhorias) e todo degrau da escada (como o bot e o jogador recebem) dão atributos válidos; o abate com a arma do degrau conta, e no último só a facada do sabre.
- **Zumbi sozinho (`LocalZombies`, `client/zombies/local.ts`)** sobre a navmesh pré-gerada: começa com o rifle simples; dano no chefe do rifle, da faca e da granada pelas mesmas funções do servidor; o caixão entrega a arma (gancho `setLoadout` e evento `playerLoadout`) com as melhorias dela, e o dano é o dela × a raridade; uma rodada danificada (os dois defeitos) chega com o defeito no equipamento, o dano × 0,75 e menos pente e reserva (`zombieGunData`); erguer uma barricada sozinho custa o mesmo e dá as mesmas tábuas; sozinho, cair encerra a partida (`zend`).

Não rodam aqui (precisam do navegador): `BotManager` e `Bot` (malhas, física Rapier e placas de nome em canvas) e a escolha do equipamento inicial em `client/main.ts` (dentro da closure com DOM); o teste cobre as funções puras que eles chamam. Para rodar o jogo solo sem DOM, a interface `ZombieLink` foi para `client/zombies/link.ts` (antes em `client.ts`, que depende do navegador).

## `server/tests/progression-modes.test.ts` → [[Weapons]], [[Progression]], [[Game Modes Index]]

A matriz progressão × modos (descrita em [[Integration Tests]]) também é, em parte, unitária: toda combinação de melhorias de toda arma de fogo (os sete rifles com as melhorias do rifle), de cada uma das sete facas e da granada dá atributos finitos e positivos, e todo equipamento que um modo entrega no meio da partida (degraus da escada, combinações de itens do caixão) é válido.

## Typecheck

`client/tests` é excluído do `tsconfig.json` do navegador e incluído no `server/tsconfig.json` (tipos do Bun), então é verificado por `bun run typecheck`.

## Código relacionado

- `client/tests/*.test.ts`, `server/tests/appearance.test.ts`, `server/tests/arsenal.test.ts`, `server/tests/progression-modes.test.ts`
- Módulos testados: `client/gameplay/aimAssist.ts`, `client/core/keybinds.ts`, `client/audio/spatial.ts`, `client/ui/strings.ts`, `client/gameplay/progress.ts`, `client/zombies/local.ts`, `shared/appearance.ts`, `shared/progression.ts`, `shared/arsenal.ts`, `shared/gunGame.ts`, `shared/zombies.ts`, `shared/zombieMatch.ts`
