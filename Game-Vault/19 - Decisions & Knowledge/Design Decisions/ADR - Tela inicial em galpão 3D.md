---
title: ADR - Tela inicial em galpão 3D
type: decision
status: documented
area: ui
source_paths:
  - client/ui/galpao/heroCharacter.ts
  - client/ui/galpao/galpao.ts
  - client/ui/galpao/scene.ts
  - client/ui/galpao/arsenalBoard.ts
  - client/ui/galpao/galpaoRules.ts
  - client/ui/home.ts
  - client/main.ts
  - client/ui/strings.ts
  - client/styles.css
  - index.html
  - client/tests/galpaoRules.test.ts
  - client/ui/galpao/petStage.ts
  - client/ui/galpao/petBoard.ts
  - client/ui/pets.ts
tags:
  - game
  - decision
  - ui
  - menus
updated: 2026-10-08
---

# ADR - Tela inicial em galpão 3D

> [!info] Substitui em parte
> Muda a **apresentação** da tela inicial logada de [[Menus]] (cabeçalho com abas e cartão do personagem) e, só quando o galpão roda, a do Arsenal de [[ADR - Arsenal da tela inicial em canvas]]. Regras, dados, endpoints e salvamento das abas continuam os mesmos.
>
> Origem: design "Galpão Home" (Claude Design, arquivo `Galpao Home.dc.html` com `galpao/scene.js`), importado e implementado a pedido do dev em 08/10/2026.

## Contexto

A tela inicial logada era uma página rolável: cabeçalho com sete abas, cartão do personagem e o painel da aba. O design "Galpão Home" propõe a mesma tela como um galpão 3D: uma câmera cinematográfica sobre sete **estações**, cada uma um objeto que segura uma aba (a mesa tática com o Jogar, o quadro de cortiça com os Mapas, o painel perfurado com as armas, a revista do Álbum, o armário do Perfil, o quadro elétrico das Configurações e o monitor de segurança do Gerenciamento).

## Problema

Trocar a cara da tela inicial sem reescrever as abas (que já têm regras, testes e chamadas à API próprias) e sem deixar sem tela inicial quem não roda WebGL bem.

## Opções consideradas

- **Galpão como camada de apresentação sobre as abas existentes** (escolhida): os painéis `#tab-*` são **movidos** para dentro das superfícies 3D; `home.ts` continua dono de tudo.
- Reescrever cada aba no layout do protótipo, com os dados de exemplo dele. Descartada: duplicaria regras (sessões, mapas, moderação) e perderia funções que o protótipo não mostra (Versões, Ocultar, Excluir, editor de personagem…).
- Galpão sem volta (sem home clássica). Descartada: em renderização por software ([[Problem - Renderização por software sem GPU]]) a cena fica lenta, e sem WebGL não abre.
- Carregar o `three` da CDN como o protótipo. Descartada: o jogo já empacota o `three` 0.186.

## Decisão

1. **Quem vê:** logado, com WebGL por GPU. Fica a home clássica com renderizador por software (`quality.software`, passado a `showHome`), quando a cena não sobe (erro ao criar o contexto) ou com `localStorage['oc.galpao'] = 'off'` (`galpaoWanted`). Deslogado, a landing de sempre.
2. **Cena** (`client/ui/galpao/scene.ts`, porte fiel do `scene.js` do design para TypeScript estrito): texturas procedurais em canvas, materiais PBR, sombras, cadeia de pós-processamento própria (bloom, ACES, vinheta, grão, aberração), câmera que voa em curva entre as poses e **superfícies DOM** presas nos objetos por homografia (`matrix3d`). Versão leve (texturas menores, sem MSAA, DPR menor) no toque e em janelas estreitas (`lightScene`).
3. **Navegação:** a visão geral mostra o menu (ENTRADA RÁPIDA e as estações 01–07; Gerenciamento só para a equipe). Numa estação, a barra de baixo tem **‹ GALPÃO (Esc)**, a dica da estação e **anterior/próxima (Q/E ou setas)**. Na visão geral, **1–7** vão às estações e **Enter** é a entrada rápida. As teclas são ignoradas em campos de texto, com modificadores e durante a captura de tecla das Configurações (`keyAction` em `galpaoRules.ts`).
4. **Abas nas estações:** escolher uma estação chama `showTab` da home (que carrega o perfil, os mapas…) enquanto a câmera voa; quando a home abre uma aba sozinha (um Voltar, um link do e-mail), o galpão vai à estação dela (`follow`). Os formulários de nome e o editor de personagem (`#tab-auth`) abrem no armário do Perfil. Voltar/Cancelar dos formulários levam à visão geral.
5. **Jogar:** a aba ganhou três colunas de cartões de papel na mesa (`.play-col`, sem efeito na home clássica), um cabeçalho e o **botão laranja** `#home-play-cta`: entrada rápida (Online), a partida contra bots ou o campo de tiro no mapa escolhido.
6. **Arsenal:** as armas pendem do painel perfurado, uma seção por espaço com os ids do catálogo (`PRIMARIES`, `SECONDARIES`, `KNIVES`, granada e a **mina** como peça da melhoria `granada.mina`). Cada arma tem uma etiqueta (nível, verde equipada, vermelha bloqueada, barra até o próximo nível ou até liberar; o nome aparece de perto, ao passar o mouse ou na selecionada) e o clique abre a **ficha** ao lado: Equipar, progresso, atributos, passiva da faca, descrição e **todas as melhorias da progressão com o interruptor**. Dados de `arsenalTree`, salvamento de `Progress` (mesmas regras do canvas). Arrastar move, a roda e a pinça dão zoom.
7. **Partida:** ao sair para uma partida (online, bots, campo de tiro), a porta de enrolar sobe, a luz entra e aparece **ENTRANDO NA PARTIDA** com o nome da sessão ou do modo e o mapa (no máximo 4 s se a aba estiver escondida); depois a home some e o jogo carrega como antes. O editor de mapas sai direto. Com `prefers-reduced-motion`, sem voo de abertura e sem a cinemática.
8. **Visual das abas:** as abas mantêm a marcação; o CSS do galpão (`#galpao .gp-surf …`) troca as variáveis (`--ink`, `--paper`, `--display`, `--body`) e os componentes comuns para papel e tinta (fontes Barlow, Barlow Condensed e JetBrains Mono), e painéis escuros nas Configurações e no Gerenciamento.

> [!info] Revisão (08/10/2026, pedido do dev)
> A splash ficou **só com o nome do jogo** (saíram a barra e os textos de carga; o HUD e a home clássica ficam escondidos por baixo, `z-index` do `#galpao` e `galpao-on` desde o começo da montagem). O **boneco de argila** da mesa deu lugar ao **personagem da conta** (`client/ui/galpao/heroCharacter.ts`: `Character` com a aparência do perfil, sem armas, posado nos ossos — tronco inclinado, IK de dois ossos nos braços até as mãos no tampo — e a cabeça olhando entre a câmera e a mesa a cada quadro), entregue à cena por `Galpao.setHero`. O boneco continua só como reserva se o personagem não puder ser montado.

> [!info] Revisão (08/10/2026, PF-29: pets, com o parecer de câmera da PF-36)
> - **Estação nova, 07 · PETS** (`'pets'` em `STATION_ORDER`, antes do Gerenciamento): a **porta da frente** com um **quintal de verdade** do lado de fora (grama, muro baixo, casinha da Amora com a plaquinha, céu próprio em ~1,2; o céu das outras aberturas não muda), arandela e spot no capacho registrados em `keys` como `pets`, placa **SAÍDA → QUINTAL**, numeral 07 e **07 · PETS** no chão. **Pose de câmera fixa** (não enquadra uma superfície: posição 2,2; 1,3; 4,8, alvo −1; 0,8; 7,9, 40°, `filmOffset` 6, ~4,5 abaixo de 900 px; retrato: de mais longe e olhando para baixo, posição −1,1; 1,5; 3,8, alvo −1,2; −0,5; 7,6, 84°, sem `filmOffset`, com a ficha como folha no rodapé). Porta-coleiras com **etiquetas DOM** em até três alturas, sem sobreposição, e **ficha** no padrão do Arsenal (`petBoard.ts` no molde de `arsenalBoard.ts`); os pets ficam em `petStage.ts` (`Galpao.setPetStage`). **Escolher ≠ equipar** ("Levar este"); troca cruzando na porta em menos de 2 s, interrompível; o pet levado aparece na visão geral sem cruzar o menu, é clicável (`'pets'` nos objetos de clique) e corre na cinemática de lançamento, à frente da câmera, saindo pela porta antes do branco. O **Gerenciamento passa a 08**; as teclas 1 a 6 não mudam. Ver [[Pets]] e [[ADR - Pets companheiros com habilidade no zumbi]].
> - **Voo pela amplitude** (`flightDuration`): 1 s até 60° de giro, 1,2 s a 120°, 1,4 s a 180°; o horizonte inclina no máximo ~8° no caminho (o slerp entre poses retas podia rolar ~15° de Jogar até a porta); uma curva que passaria pela mesa do personagem ganha um ponto de passagem lateral; do Gerenciamento continua por `WAY.admin`.
> - **Movimento reduzido**: em vez do voo de 0,6 s, um **corte com mergulho no preto de ~0,2 s** (`postU.black`), em todas as estações (Perfil e Configurações também).

## Motivo

- É o design pedido, com os dados e as funções que o jogo tem.
- Mover os painéis em vez de reescrever mantém uma única fonte de regras: o que muda numa aba aparece nas duas apresentações.
- A home clássica continua como rede de segurança para máquinas sem GPU.

## Consequências

- A tela inicial logada usa **um contexto WebGL a mais** (o do galpão; o palco do personagem do cartão não é criado quando o galpão roda). O renderizador do jogo já existe por baixo, parado. A cena é descartada (`dispose`) ao sair da home.
- O carregamento da cena (texturas procedurais na thread principal) leva de 1 a 2 s numa GPU de mesa, com uma splash só com o nome do jogo. Ver [[Loading Performance]].
- Há duas apresentações do Arsenal da tela inicial: o painel perfurado (galpão) e o canvas (home clássica), com o mesmo modelo e o mesmo salvamento.
- Iniciar uma partida pela tela inicial leva ~2,7 s a mais por causa da cinemática.
- O cartão do personagem com os ícones equipados não aparece no galpão; o retrato continua no botão da conta, e o editor de personagem fica no Perfil.
- Os textos pintados nas texturas (placas do chão, seções do painel, capa da revista, avisos) vêm de `strings.ts` (pt-BR e en); os números das paredes e o rádio "88.7 MHZ" são decoração fixa.
- Com controle, o `PadNav` anda pelos botões do menu e das superfícies e ◯/B aperta o ‹ GALPÃO (`data-pad-back`); L1/R1 não trocam estações no galpão.

## Código afetado

- Novos: `client/ui/galpao/scene.ts` (cena, câmera, superfícies, entrada), `client/ui/galpao/galpao.ts` (`GalpaoHome`: HUD, menu, teclado, estações, lançamento), `client/ui/galpao/arsenalBoard.ts` (etiquetas e ficha do Arsenal), `client/ui/galpao/galpaoRules.ts` (regras puras), `client/tests/galpaoRules.test.ts`.
- Alterados: `client/ui/home.ts` (`showHome({ software })`, `startGalpao`/`stopGalpao`, `toStart`, `follow`, `launchText`, `quickJoin`, `#home-play-cta`), `client/main.ts`, `client/ui/strings.ts` (`gp*`), `client/styles.css` (seção "Galpão"), `index.html` (`#galpao`, colunas da aba Jogar, fontes do design).

Relacionado: [[Menus]] · [[Inventory UI]] · [[UI Overview]] · [[Rendering Overview]] · [[ADR - Arsenal da tela inicial em canvas]] · [[ADR - Conexão online aberta sob demanda na tela inicial]]
