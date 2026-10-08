---
title: ADR - Detalhe geométrico Normal e Leve
type: decision
status: documented
area: rendering
source_paths:
  - client/core/settings.ts
  - client/ui/menu.ts
  - client/main.ts
  - client/world/mapBuilder.ts
  - client/world/mapLoader.ts
  - client/world/catalog/types.ts
  - client/world/simplify.ts
  - client/world/oriental.ts
  - client/world/halloween.ts
  - client/world/furniture.ts
  - client/world/jardim/luzes.ts
  - client/world/jardim/kit.ts
  - client/world/jardim/casa.ts
  - client/character/character.ts
  - client/render/effects.ts
  - client/render/packedInstances.ts
  - client/render/weaponModels.ts
  - client/world/budget.ts
  - client/editor/budgetBar.ts
  - client/tests/polyBudget.test.ts
  - tools/orcamento.ts
  - tools/prints-mapas.ts
tags:
  - adr
  - rendering
  - performance
  - gpu
updated: 2026-10-08
---

# ADR - Detalhe geométrico Normal e Leve

Extensão de [[ADR - Qualidade automática com resolução dinâmica]] (PF-35, "Menos polígonos para rodar em aparelhos fracos").

## Contexto

Os níveis de qualidade só mudam a resolução e as sombras: um celular fraco desenhava exatamente os mesmos objetos que um PC forte. Jardim do Dragão e Vila Assombrada pesavam muito mais que os outros mapas (pior câmera 524 mil e 386 mil triângulos), e boa parte do peso era invisível (instâncias em escala zero, tampas escondidas, segmentos demais).

## Problema

Cortar polígonos sem tirar nada que o jogador de PC perceba, dar um modo mais simples a quem joga no celular ou em PC fraco e não criar vantagem competitiva nem mudar a colisão.

## Opções consideradas

- Só cortes sem perda para todos: ganha ~25% no Jardim, mas o celular continua com o mesmo mapa.
- Trocar o detalhe sozinho pelo FPS no meio da partida: remontaria o mapa durante o jogo (fora do escopo).
- **Escolhida:** cortes sem perda para todos (T1–T9) e uma opção própria "Detalhe dos objetos: Normal / Leve" com cortes com alguma perda só no Leve (L1–L7), aprovados por print mapa a mapa.

## Decisão

1. **Cortes para todos (T):** pools instanciados desenham só as instâncias ativas (`PackedInstances`, `mesh.count`); lanternas do céu de 34 triângulos; veículos e carrinhos bate-bate com menos segmentos; grades sem tampas escondidas; anéis do bambu sem tampas; lanternas de papel e abóboras mais leves (mantendo os 8 gomos); armas em 3ª pessoa com modelo próprio (até 8 lados, esferas 6×4, anéis 4×12, sem letras de pixel e sem peças de menos de 1,5 cm, P11); LOD1 e LOD2 de verdade nos personagens (P10). Placas, quadros e inscrições: a moldura vai para o lote estático (P13).
2. **Opção "Detalhe dos objetos"** (`Settings.detalhe`, [[Settings]]): Leve por padrão no celular e com renderização por software, Normal nos demais; a escolha do jogador prevalece e vale no **próximo carregamento de mapa** (`objectDetail` lido ao montar o mapa em `client/main.ts`).
3. **Modo Leve (L):** folhagem com uma subdivisão e metade dos tufos pequenos, maiores (mesmo volume; a cerejeira mantém todos porque as cerejas penduram neles); árvores mortas 8×5 / 5×4 e gravetos sem sombra; 250 lanternas do céu; telhados curvos com metade dos segmentos; props esculpidos de uma lista fechada simplificados na carga com meshoptimizer (`client/world/simplify.ts`); livros como um bloco por fileira; personagens trocam de LOD a 10 e 25 m; explosões com icosaedro de detalhe 0 (P7).
4. **Colisão e navmesh sempre da malha cheia**, nos dois níveis (o teste compara os colisores). Folhagem que esconde jogador perde subdivisão, nunca volume.
5. **Servidor e editor de mapas sempre no Normal** (não passam `detalhe`). A barra de orçamento do editor monta também no Leve e só avisa (P9).
6. **Orçamentos** (`DETAIL_BUDGET` em `client/world/budget.ts` e `client/tests/polyBudget.test.ts`, com 5% de folga contra o orçamento e contra o medido, P12): ver a tabela em [[Performance Rendering]]. Valem só para mapas oficiais, personagens e armas; mapas da comunidade continuam só com `MAP_BUDGET`.

## Motivo

O grosso do ganho no PC vem de coisas invisíveis; o Leve dá controle a quem tem aparelho fraco sem remontar o mapa no meio da partida; aprovar a perda por print deixa o antes e depois registrado.

## Consequências

- Clientes Normal e Leve desenham mapas diferentes, mas colidem igual; fruta, lanternas e gags sincronizam por id como antes.
- As chamadas de desenho da Vila no Leve ficam acima do orçamento leve (271 contra 250: objetos únicos com textura própria; gravetos sem sombra viram um lote a mais por célula) e só travadas no medido (P13).
- No PC rápido o FPS não muda de forma mensurável (o gargalo não são triângulos); o ganho real precisa ser medido num celular fraco (risco 5 do plano).
- O galpão (tela inicial) é medido pela passada da câmera (P14); o quadro inteiro dele fica registrado como informação em [[Known Bottlenecks]].

## Código afetado

`client/core/settings.ts` (`detalhe`, `objectDetail`, `defaultDetail`), `client/world/mapBuilder.ts` (`ObjectDetail`, `seg`, `gather`/`releaseGathered`), `client/world/mapLoader.ts` (`LoadOptions.detalhe`, `sculpted`), `client/world/simplify.ts`, `client/render/packedInstances.ts`, `client/character/character.ts` (`setCharacterDetail`), `client/render/effects.ts`, `client/render/weaponModels.ts` (`farModel`), `client/editor/budgetBar.ts`, `tools/orcamento.ts`, `tools/prints-mapas.ts`, `client/dev/bench.ts`.
