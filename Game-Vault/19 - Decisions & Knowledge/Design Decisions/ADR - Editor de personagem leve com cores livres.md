---
title: ADR - Editor de personagem leve com cores livres
type: decision
status: documented
area: ui
source_paths:
  - client/ui/customize.ts
  - client/ui/customize/rules.ts
  - client/ui/customize/itemThumbs.ts
  - client/ui/customize/cardStore.ts
  - client/ui/customize/lineup.ts
  - client/ui/customize/lights.ts
  - client/ui/colorPicker.ts
  - client/ui/colorPickerRules.ts
  - client/ui/padNav.ts
  - client/ui/padNavRules.ts
  - client/ui/profile.ts
  - client/ui/home.ts
  - client/ui/management.ts
  - client/ui/galpao/galpao.ts
  - client/ui/galpao/scene.ts
  - client/character/character.ts
  - client/character/rig.ts
  - client/entities/avatar.ts
  - shared/color.ts
  - shared/appearance.ts
  - client/styles.css
  - client/tests/customizeCards.test.ts
  - client/tests/colorPicker.test.ts
  - server/tests/color.test.ts
  - server/tests/appearance.test.ts
tags:
  - game
  - decision
  - ui
  - character
  - performance
updated: 2026-10-08
---

# ADR - Editor de personagem leve com cores livres

> [!info] Origem
> Issue PF-33 ("Personalização de personagem leve e com seletor de cor próprio"). O plano aprovado está na página PF-33 PLANO do Confluence. Lá estão as decisões P1 a P8. Durante a implementação o dev respondeu mais cinco pontos (P9 a P13), listados no fim desta nota.

## Contexto

O editor de personagem (Perfil → Personalizar, [[Character Customization]]) mostrava cada opção como uma **miniatura do próprio personagem** vestindo a peça, nas cores atuais. Ela era renderizada por um `WebGLRenderer` só das miniaturas, com `toDataURL` e um cache em memória cuja chave era o visual inteiro. O palco grande redesenhava o tempo todo, girando sozinho. No galpão ([[ADR - Tela inicial em galpão 3D]]), a cena continuava desenhando por trás do editor.

## Problema

- Cada troca de cor remontava o personagem do palco e refazia **todos** os cartões da aba, até 91: cerca de 1,7 s de thread principal por troca no galpão, com dezenas de long tasks e quadros de 50–110 ms.
- Sair do editor com Esc (voltar ao galpão) não liberava as telas 3D do editor. Cada ida e volta deixava dois contextos WebGL vivos. Depois de 10 vezes, o navegador chegava ao limite (16), derrubava os mais antigos e chegou a derrubar o do galpão.
- As cores eram só as bolinhas da paleta, sem um jeito de escolher outra.

## Opções consideradas

- **Manter o personagem nos cartões e só otimizar o cache.** Descartada: cada cor nova continua sendo um visual novo, e o custo continua proporcional ao número de cartões.
- **Miniaturas geradas no build.** Descartada (fora do escopo): o editor de mapas já desenha no navegador uma vez por versão e se atualiza sozinho ([[ADR - Editor de mapas no jogo]]).
- **`<input type="color">` do navegador.** Descartada: não funciona com controle, a aparência muda de navegador para navegador e não mostra os limites do guia de arte.
- **Cartões só com a peça, desenhados uma vez por versão; palco por demanda; seletor próprio com limites** (escolhida).

## Decisão

1. **Cartões só com a peça** (fora do Modo PCD), nas cores padrão do catálogo, iguais para todos (`client/ui/customize/rules.ts`). A peça é montada sozinha no esqueleto (`CharacterConfig.bodyless`), parada, enquadrada pela própria caixa, com o lado de dentro escurecido (uma camiseta oca não deixa ver através). Tatuagens e luvas aparecem num **manequim de argila**. Cabelo, barba, traços do rosto, brincos e piercings aparecem numa **cabeça de argila** (`Character.hideBody` esconde tudo abaixo do pescoço). "Nenhum" e "Descalço" viram ícone.
2. **Desenho e cache:** os cartões são desenhados num render target do renderer do palco, sem contexto próprio, em 2× e reduzidos para 144 px, e salvos em WebP. O cache fica no IndexedDB próprio **"oc-personagem"**, separado do do editor de mapas, porque o `prune` dele apaga chaves de fora. A chave é `item:<id>:<sexo>` (ou `rosto:<traço>.<valor>:<sexo>`) e a assinatura é o formato do desenho mais a versão do jogo. Uma fila em `requestIdleCallback` (a `ThumbQueue` do editor de mapas) desenha primeiro a peça vestida, depois os cartões visíveis (`IntersectionObserver`), o resto da aba e, em segundo plano, todo o catálogo. A fila para enquanto uma cor é arrastada.
3. **Cartão da peça vestida:** nas cores escolhidas, refeito quando a cor é confirmada, guardado só em memória. Penteado e barba vestidos seguem a cor do cabelo (P13).
4. **Modo PCD:** é a única aba com o personagem do jogador nos cartões. Ficam em memória, com a chave hash do visual sem PCD mais a perda, e só são refeitos se o visual mudou.
5. **Palco grande** (`Stage`): desenha só quando algo muda (arraste, troca, câmera deslizando, animação diferente de Parado). Durante o arraste só a cor muda, por uniform (`Character.setColor`), sem remontar o personagem. DPR no máximo 1,5, sem quadros quando está fora da tela ou com a aba escondida, e `skeleton.dispose()` no `Character.dispose`. O cartão da home clássica continua girando (P10).
6. **Ciclo de vida:** `showCustomizer` devolve `{ dispose }`. `profile.ts`, `home.ts` (troca de aba, o cartão do personagem, os formulários de `#tab-auth`) e `management.ts` chamam esse dispose antes de trocar o conteúdo. Só existe um editor por vez (`closeCustomizer`), e o dispose tira a marcação do editor da tela.
7. **Galpão congelado:** com o editor aberto, `GalpaoHome.pause(true)` para a cena no último quadro. Um resize redesenha esse quadro e reposiciona as superfícies. Quando a câmera vai sair da estação (`hooks.leaving`: Esc, ‹ GALPÃO, outra estação), a home fecha o editor e a cena volta a rodar.
8. **Altura e biotipo** numa **parede de reconhecimento** em SVG (`client/ui/customize/lineup.ts`). A régua vai de 1,40 a 2,00 m. As três silhuetas medem 1,73, 1,80 e 1,87 m, calculadas de `EFFECTS.heightScale × RIG_HEIGHT`. No biotipo, as larguras mudam na altura do jogador. A escolhida fica em laranja, com a placa do nome e da altura. Embaixo vem a nota "Só visual: hitbox e mira iguais para todos" ([[ADR - Altura e biotipo apenas visuais]]).
9. **Seletor de cor próprio** (`client/ui/colorPicker.ts`), só para roupas, acessórios e tático:
   - uma ficha por canal; tocar abre o seletor logo abaixo, um por vez (P11);
   - quadrado saturação × brilho, faixa de matiz e amostra antes/agora (tocar em "antes" desfaz);
   - paleta da casa em grupos, com o nome de cada cor;
   - "Combina": tom sobre tom ×0,72, cores já usadas e a vizinha de matiz dessaturada;
   - Recentes (10, em `localStorage` `oc.cores.recentes`) e o código hex;
   - entrada por Pointer Events com captura, `role="slider"` (setas, Shift ×10, Enter confirma, Esc desfaz, perder o foco confirma: P12) e controle pelo [[Input & Controls|PadNav]].

   Pele, cabelo e olhos continuam nas bolinhas da paleta, com o visual novo.
10. **Cores livres com limite** (`shared/color.ts`, `clampItemColor`):
    - Na cor principal de `tronco`, `sobreposicao` e `baixo`, a croma (máx − mín do RGB) fica até **0,55**. A mostarda, o tecido mais saturado da paleta, tem 0,54.
    - Em todo canal de peça, o brilho V fica em **≥ 0,12**. O preto da paleta tem 0,15.
    - Ajustar de novo não muda nada (idempotente).
    - `choice()` usa o limite no lugar do `snap` nas peças; pele, cabelo e olhos continuam no `snap`.
    - `allowedColors` passou a se chamar `suggestedColors` e é a paleta sugerida do seletor e dos bots.
    - No quadrado, a região proibida aparece hachurada e o cursor para na borda. Os avisos são "Tecido não fica neon nas peças grandes" e, no piso, "Preto puro não vale: o mais escuro é o preto da casa" (P9).
    - Sem migration: as cores salvas já são códigos e todas as da paleta continuam valendo ([[Validation]]).

## Motivo

- A figura de uma peça não depende do visual, então cada uma é desenhada uma vez por versão e por corpo, e não uma vez por cor escolhida.
- Liberar as telas 3D em todos os caminhos de saída corrige a perda de contexto do galpão.
- O seletor dá a liberdade de cor pedida sem estragar a leitura do personagem e sem camuflagem preta.

## Consequências

Medição no Chrome com GPU (headless, ANGLE d3d11, 1440×900, DPR 1), no mesmo roteiro antes e depois. O roteiro: abrir Parte de cima, 10 trocas de cor, 1 troca de peça, passar por todas as abas, 30 trocas no total e 10 vezes abrir o editor, Esc e voltar ao Perfil; depois recarregar e repetir "quente". Não foi medido num Android médio: só há o resultado do Chrome desktop.

| Métrica (galpão) | Antes | Depois |
|---|---|---|
| Contextos WebGL vivos com o editor aberto | 4 | 3 |
| Depois de 10× abrir, Esc e voltar | 16 (limite; 8 avisos "Too many active WebGL contexts") | 3 (0 avisos) |
| Quadros do galpão com o editor aberto (2 s) | 35 | 0 |
| Quadros do palco parado (3 s, cache quente) | 434 | 0 |
| 10 trocas por amostra: long tasks / TBT | 130 / 877 ms | 0 / 0 |
| 10 trocas por amostra: quadro p50 / p95 / máx | 48,6 / 62,5 / 111 ms | 6,9 / 7,0 / 13,9 ms |
| Thread principal por troca (amostra) | ~1730 ms | ~40–60 ms |
| 10 arrastes no seletor (quente): long tasks / p95 / máx | — | 0 / 7,1 / 13,9 ms |
| Aba Parte de cima, primeira vez (visíveis / todas) | 912 / 5585 ms | 74–339 / ~2300 ms |
| Mesma aba reaberta na página | 593 / 4300 ms | 48 / 76 ms |
| Mesma aba depois de recarregar | 926 / 6427 ms | 102 / 133 ms |
| Troca de peça: long tasks / cartões prontos | 37 / 2892 ms | 0–1 / 128–160 ms |
| Heap depois de 30 trocas | 48,7 MB | 46,2 MB |

O laboratório (`/tools/lab-personagens.html?editor=1`, sem galpão) mostrou o mesmo padrão. Contextos: 2 → 1. Por amostra, os quadros p95 foram de 48,6 para 7,1 ms, as long tasks de 17 para 0 e a thread principal de 1343 para 37 ms por troca. A aba vinda do cache passou de 953 para 103 ms.

- **Metas no desktop:** nenhuma long task por troca de cor; p95 ≤ 20 ms no arraste (medido 7,1 ms); aba do cache < 300 ms (medido ~100 ms). Todas atingidas.
- **Primeira abertura depois de uma atualização:** o preenchimento em segundo plano desenha ~300 cartões em momentos livres. Nos primeiros segundos aparecem algumas long tasks de 50–140 ms, porque a geometria de cada peça é montada pela primeira vez. Elas não vêm das trocas de cor. A fila para durante o arraste. Ver [[Known Bottlenecks]].
- **Aba PCD:** desenha 8 personagens inteiros sob demanda (~350–650 ms), mais devagar que antes (~210–330 ms), porque a fila é em momentos livres.
- Janela anônima sem IndexedDB: os cartões ficam só em memória enquanto a página está aberta.
- Cliente e servidor precisam subir juntos (mesma imagem): um servidor antigo trocaria uma cor livre pela da paleta ao salvar.
- Textos novos só em pt-BR e en. O espanhol e o alemão ficam para quem integrar depois da PF-30.
- Achados no caminho, no galpão: o `dt` do laço podia ficar negativo ao voltar da pausa ou da aba escondida, e `smoother(0,9999999999999987)` dá 1,0000000000000013. Nos dois casos a curva da câmera era lida fora de [0, 1] e dava o erro "reading 'x'". Corrigido com clamp (`client/ui/galpao/scene.ts`).

## Respostas do dev durante a implementação

| # | Pergunta | Resposta |
|---|---|---|
| P9 | Piso de brilho no quadrado | Faixa hachurada no pé e o aviso "Preto puro não vale: o mais escuro é o preto da casa" |
| P10 | Cartão do personagem da home clássica | Continua girando; ganha só DPR ≤ 1,5, pausa invisível e `skeleton.dispose` |
| P11 | Onde o seletor abre | Inline ao tocar na ficha, um por vez, começa fechado |
| P12 | Setas sem Enter e o foco sai | Confirma (Esc desfaz, Enter confirma) |
| P13 | Penteado e barba vestidos | Na cor do cabelo do jogador; os outros na cor padrão; barba "Nenhum" e marcas "Nenhuma" como ícone |

## Código afetado

- Novos: `client/ui/customize/` (`rules.ts`, `itemThumbs.ts`, `cardStore.ts`, `lineup.ts`, `lights.ts`), `client/ui/colorPicker.ts`, `client/ui/colorPickerRules.ts`, `client/ui/padNavRules.ts`, `shared/color.ts` e os testes `client/tests/customizeCards.test.ts`, `client/tests/colorPicker.test.ts`, `server/tests/color.test.ts`.
- Alterados: `client/ui/customize.ts` (editor, `Stage`, `renderPortrait` sem a classe `Thumbnails`), `client/ui/profile.ts`, `client/ui/home.ts`, `client/ui/management.ts`, `client/ui/padNav.ts`, `client/ui/galpao/galpao.ts`, `client/ui/galpao/scene.ts`, `client/character/character.ts` (`bodyless`, `hideBody`, `skeleton.dispose`), `client/character/rig.ts` (`RIG_HEIGHT`), `client/entities/avatar.ts` (`colorKey`, `itemColorKeys`), `shared/appearance.ts` (`choice`, `suggestedColors`, `DEFAULT_COLORS`), `client/styles.css` e `server/tests/appearance.test.ts`.

Relacionado: [[Character Customization]] · [[Menus]] · [[Material Palette]] · [[Validation]] · [[Known Bottlenecks]] · [[ADR - Tela inicial em galpão 3D]] · [[ADR - Altura e biotipo apenas visuais]]
