---
title: Known Bottlenecks
type: problem
status: documented
area: performance
source_paths:
  - client/render/quality.ts
  - README.md
  - docs/DEPLOY.md
  - vite.config.ts
  - server/session.ts
  - server/app.ts
  - client/character/body.ts
  - client/world/halloween.ts
  - client/render/viewmodel.ts
  - client/render/viewmodelArms.ts
  - client/main.ts
  - client/render/effects.ts
  - client/ui/galpao/scene.ts
  - tools/orcamento.ts
  - client/ui/customize.ts
  - client/ui/customize/itemThumbs.ts
tags:
  - performance
  - gargalos
updated: 2026-10-08
---

# Known Bottlenecks

Gargalos e limitações de desempenho evidenciados no código ou na documentação do projeto. Nenhum tem métrica de produção (não há [[Monitoring]]).

| # | Gargalo | Evidência | Impacto | Mitigação atual |
| --- | --- | --- | --- | --- |
| 1 | **Renderização por software** (sem aceleração de hardware) | `client/render/quality.ts` (comentário "~5-10 FPS"), `README.md` ("Desempenho"), `docs/DEPLOY.md` | Jogo injogável (~10 FPS) | Detecção por nome do renderizador, preset `baixa`, aviso no menu e `⚠ SOFTWARE` no F3. Ver [[Problem - Renderização por software sem GPU]]. |
| 2 | **Bundle JavaScript único** de ~5 MB | `docs/DEPLOY.md`, `vite.config.ts` (`chunkSizeWarningLimit: 6000`) | Primeiro carregamento lento em redes fracas | gzip (~1,8 MB) e cache. Ver [[Problem - Bundle JavaScript único de ~5 MB]]. |
| 3 | **Snapshot completo para todos** (sem *interest culling*) e JSON texto | `server/session.ts` (cabeçalho "Not yet..."), `README.md` | Banda e CPU crescem com jogadores; hoje limitado a 10 por sala | Serialização única por sala. |
| 4 | **Uma única instância de servidor**; cada sala é um `setInterval` no mesmo processo | `server/app.ts`, `server/session.ts` | Escala limitada a um processo Bun | — Ver [[Problem - Estado das partidas só em memória de um processo]]. |
| 5 | **Sem compensação de lag**; movimento confiado ao cliente | `server/session.ts` (`LAG_SLACK = 4`), `README.md` | Com ping alto, acertos são aceitos com folga de 4 m | Validação de distância com folga. Ver [[Anti Cheat]], [[ADR - Movimento confiado ao cliente]]. |
| 6 | **Recompilação de shaders** ao ligar/desligar sombras | `client/render/quality.ts` (`applyShadows`) | Engasgo pontual quando a qualidade automática desliga sombras | Acontece no máximo poucas vezes (sombras não voltam no celular após falhar). |
| 7 | **Geometrias despejadas do cache de corpos não são liberadas** | `client/character/body.ts` | Memória depende do GC | Limite de 120 entradas. Ver [[Memory]]. |
| 8 | **Ordenação de todas as fontes de luz** a cada 0,2 s | `client/world/halloween.ts` (`LightPool.update`) | O(n log n) por escolha; n = velas/lampiões do mapa | Frequência reduzida (5×/s). |
| 9 | **Gravação de progresso em lote a cada 60 s** | `server/app.ts` (`FLUSH_EVERY_MS`) | Queda abrupta do processo (sem SIGTERM) perde até 60 s de progresso | Gravação também ao sair e no SIGTERM. Ver [[ADR - Progresso gravado em lotes por delta]]. |
| 10 | ~~**Shader dos braços recompilado a cada troca de arma**~~ (resolvido na PF-34) | `client/render/viewmodel.ts`, `client/render/viewmodelArms.ts` | Engasgo ao trocar muitas vezes entre o rifle e uma secundária de pistola (rodinha do mouse) | Material único dos braços, mão de apoio nas duas poses, aquecimento no começo da partida e limite de 150 ms na rodinha. Detalhes abaixo. |
| 11 | **Primeira explosão de granada da partida compila shaders na cena do mundo** | Medição da PF-34 (Chrome headless, RTX 3070 Ti): cerca de 0,5 s depois de soltar a primeira granada surgem 3 programas WebGL novos, usados pelas nuvens de fumaça (`MeshToonMaterial` transparente) e pelas bolas de fogo e anéis da onda de choque (`MeshBasicMaterial` transparente) da explosão (`Effects.explosion`, `client/render/effects.ts`), e um quadro de ~55 ms (antes da PF-34, ~69 ms) | Um tranco único por partida, na primeira explosão | Nenhuma. Fora do escopo da PF-34 (decisão do dev, P3): o aquecimento dela cobre só o viewmodel (trocar, esfaquear e arremessar), não os efeitos do mundo. Issue própria a abrir no Jira. |
| 12 | **Peso geométrico dos mapas no celular** (PF-35) | `tools/orcamento.ts`, `client/tests/polyBudget.test.ts` | Antes, o celular desenhava os mesmos objetos que o PC: Jardim do Dragão com 524 mil triângulos na pior câmera, 44 mil deles instâncias invisíveis | Cortes sem perda para todos e o detalhe Leve: Jardim 394 mil (Normal) / 312 mil (Leve). Ver [[ADR - Detalhe geométrico Normal e Leve]] e [[Performance Rendering]]. Restam: a Vila com 263 chamadas nos dois níveis (orçamento leve 250, dentro da folga de 5%; peças únicas com textura própria, P13) e o FPS num celular fraco ainda não medido (no PC rápido o FPS não muda de forma mensurável: o gargalo não são os triângulos). |
| 13 | **Quadro inteiro do galpão (tela inicial)** | `?bench=galpao` (`client/dev/bench.ts`) | Cada quadro desenha a cena de novo para a sombra do sol, para 2 holofotes com sombra e, a cada 3 quadros, para uma câmera de CCTV: 168–187 mil triângulos e 750–895 chamadas no build normal, 58–65 mil e 264–358 no build leve do celular (medido no Chrome com GPU, 1280×720) | Só informação (P14 da PF-35): o orçamento do galpão vale para a passada da câmera, 9,6–17,3 mil triângulos. |
| 14 | **Primeira abertura do editor de personagem depois de uma atualização** (PF-33) | Medido (Chrome com GPU, 1440×900): com o cache vazio, o preenchimento em segundo plano desenha ~300 cartões; enquanto isso aparecem algumas long tasks de 50–140 ms (montagem da geometria de cada peça pela primeira vez e compilação de shaders) | Nos primeiros segundos, raros engasgos de até ~140 ms; a aba Parte de cima fica pronta em ~2,3 s (os cartões em vista em 75–340 ms) | Fila em `requestIdleCallback`, um cartão por vez, os visíveis primeiro, parada durante o arraste de cor; depois tudo vem do IndexedDB ("oc-personagem"): aba do cache em ~100 ms, palco parado sem quadros, arraste com p95 de 7,1 ms e nenhuma long task. Antes da PF-33 cada troca de cor custava ~1,7 s de thread principal no galpão. Ver [[ADR - Editor de personagem leve com cores livres]]. |

## PF-34: troca de arma recompilava o shader dos braços (resolvido)

- **Problema:** girar a rodinha do mouse rápido entre o rifle e uma secundária do tipo pistola derrubava o FPS. Com rifle e submetralhadora não acontecia.
- **Causa:** a mão de apoio muda de pose entre o guarda-mão (rifles e a empunhadura da submetralhadora) e o punho de pistola (as outras secundárias). A cada mudança, `setGun` refazia os quatro braços do viewmodel e descartava os materiais deles (`material.dispose()`); sem nenhum material usando o programa, o three.js apagava o programa WebGL e o quadro seguinte compilava e linkava um novo. O rebuild por mão de apoio entrou com as secundárias (commit `f44efe5`, 06/10/2026).
- **Solução:** um material de braço por `Viewmodel`, criado uma vez e compartilhado pelos quatro braços (cores atualizadas no lugar por `setBody`); o braço esquerdo montado nas duas poses e `setGun` só alterna a visibilidade; `buildArms` só em `setBody` e `retune`. No começo da partida, `prepare` monta as duas armas e `warmup` compila os shaders do viewmodel (armas, faca, granada) de uma vez; o viewmodel do espectador do modo zumbi faz o mesmo ao passar a assistir um colega. A rodinha troca de arma no máximo uma vez a cada 150 ms ([[Input & Controls]]). Ver [[Weapon Models]].
- **Métrica** (build de dev, campo de tiro, Chrome headless com GPU RTX 3070 Ti via ANGLE/D3D11, ~144 quadros/s; 50 trocas seguidas pelo botão virtual de troca, uma a cada 80 ms):

| Medida | Antes, rifle + pistola | Depois, rifle + pistola | Antes, rifle + SMG (controle) | Depois, rifle + SMG |
| --- | --- | --- | --- | --- |
| Programas WebGL novos (maior id de `renderer.info.programs`) | 50 (1 por troca) | 0 | 0 | 0 |
| Quadros acima de 10 ms durante as trocas | 9 a 12 | 0 | 0 | 0 |
| Tempo de quadro p95 / máximo, trocando (ms) | 7,1 / 14,0 | 7,1 / 8,8 | 7,0 / 7,1 | 7,1 / 7,3 |
| Tempo de quadro p95 / máximo, parado (ms) | 7,0 / 7,1 | 7,0 / 7,1 | 7,0 / 7,1 | 7,1 / 7,4 |

Primeira vez na partida: a primeira troca criava 2 programas (pior quadro 13,8 ms) e agora 0 (7,2 ms); a primeira facada já não criava nenhum; o arremesso da primeira granada não cria mais programa no viewmodel. A explosão dessa granada ainda compila os efeitos na cena do mundo (#11, fora do escopo).

> [!info]
> Inferência: numa GPU mais fraca cada compilação custa mais do que nesta máquina, então o engasgo relatado tende a ser maior que os 14 ms medidos aqui. Não foi medido em outra GPU.

- **Trade-off:** o começo da partida compila alguns shaders a mais (uma vez) e o braço esquerdo existe em duas cópias (com a mesma geometria em cache). O material é compartilhado: um braço com cor ou máscara própria precisaria de outro material.
- **Como medir de novo:** no build de dev, pelo `window.__oc` no campo de tiro com rifle e pistola: guardar o maior `id` de `__oc.ctx.renderer.info.programs`, trocar 50 vezes com `__oc.input.press('swapWeapon', true/false)` e comparar o maior `id` depois (deve ser igual); registrar os intervalos de `requestAnimationFrame` (p95 e máximo) parado e trocando. `renderer.info.programs.length` não serve, porque um programa é destruído e outro criado. Complemento: trace do Chrome procurando `linkProgram` no quadro seguinte à troca. Ver [[Performance Tests]]. Teste que guarda a regra: `client/tests/viewmodelSwitch.test.ts` ([[Unit Tests]]).

## Código relacionado

- `client/render/quality.ts`, `client/character/body.ts`, `client/world/halloween.ts`, `client/ui/customize/itemThumbs.ts`
- `client/render/viewmodel.ts`, `client/render/viewmodelArms.ts`, `client/main.ts` (PF-34)
- `client/render/effects.ts` (primeira explosão, #11)
- `server/session.ts`, `server/app.ts`
- `vite.config.ts`, `docs/DEPLOY.md`, `README.md`

Ver também: [[Performance Overview]], [[Technical Debt]], [[Troubleshooting]].
