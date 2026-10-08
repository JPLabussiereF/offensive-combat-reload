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
  - client/ui/customize.ts
  - client/ui/customize/itemThumbs.ts
  - client/ui/galpao/scene.ts
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
| 10 | **Primeira abertura do editor de personagem depois de uma atualização** (PF-33) | Medido (Chrome com GPU, 1440×900): com o cache vazio, o preenchimento em segundo plano desenha ~300 cartões; enquanto isso aparecem algumas long tasks de 50–140 ms (montagem da geometria de cada peça pela primeira vez e compilação de shaders) | Nos primeiros segundos, raros engasgos de até ~140 ms; a aba Parte de cima fica pronta em ~2,3 s (os cartões em vista em 75–340 ms) | Fila em `requestIdleCallback`, um cartão por vez, os visíveis primeiro, parada durante o arraste de cor; depois tudo vem do IndexedDB ("oc-personagem"): aba do cache em ~100 ms, palco parado sem quadros, arraste com p95 de 7,1 ms e nenhuma long task. Antes da PF-33 cada troca de cor custava ~1,7 s de thread principal no galpão. Ver [[ADR - Editor de personagem leve com cores livres]]. |

## Código relacionado

- `client/render/quality.ts`, `client/character/body.ts`, `client/world/halloween.ts`, `client/ui/customize/itemThumbs.ts`
- `server/session.ts`, `server/app.ts`
- `vite.config.ts`, `docs/DEPLOY.md`, `README.md`

Ver também: [[Performance Overview]], [[Technical Debt]], [[Troubleshooting]].
