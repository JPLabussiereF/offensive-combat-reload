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
  - client/ui/galpao/scene.ts
  - tools/orcamento.ts
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
| 10 | **Peso geométrico dos mapas no celular** (PF-35) | `tools/orcamento.ts`, `client/tests/polyBudget.test.ts` | Antes, o celular desenhava os mesmos objetos que o PC: Jardim do Dragão com 524 mil triângulos na pior câmera, 44 mil deles instâncias invisíveis | Cortes sem perda para todos e o detalhe Leve: Jardim 394 mil (Normal) / 312 mil (Leve). Ver [[ADR - Detalhe geométrico Normal e Leve]] e [[Performance Rendering]]. Restam: a Vila no Leve com 271 chamadas (orçamento 250; peças únicas com textura própria, P13) e o FPS num celular fraco ainda não medido (no PC rápido o FPS não muda de forma mensurável: o gargalo não são os triângulos). |
| 11 | **Quadro inteiro do galpão (tela inicial)** | `?bench=galpao` (`client/dev/bench.ts`) | Cada quadro desenha a cena de novo para a sombra do sol, para 2 holofotes com sombra e, a cada 3 quadros, para uma câmera de CCTV: 168–187 mil triângulos e 750–895 chamadas no build normal, 58–65 mil e 264–358 no build leve do celular (medido no Chrome com GPU, 1280×720) | Só informação (P14 da PF-35): o orçamento do galpão vale para a passada da câmera, 9,6–17,3 mil triângulos. |

## Código relacionado

- `client/render/quality.ts`, `client/character/body.ts`, `client/world/halloween.ts`
- `server/session.ts`, `server/app.ts`
- `vite.config.ts`, `docs/DEPLOY.md`, `README.md`

Ver também: [[Performance Overview]], [[Technical Debt]], [[Troubleshooting]].
