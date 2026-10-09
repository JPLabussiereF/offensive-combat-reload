---
title: Performance Tests
type: system
status: partial
area: testing
source_paths:
  - client/dev/audit.ts
  - client/dev/characterLab.ts
  - tools/lab-personagens.html
  - client/main.ts
  - README.md
  - client/tests/viewmodelSwitch.test.ts
tags:
  - testes
  - performance
updated: 2026-10-08
---

# Performance Tests

## Testes automatizados de desempenho — não existem

Não existe no código atual (verificado em `server/tests/`, `client/tests/`, `package.json` e `.github/workflows/ci.yml`): não há benchmarks, testes de carga do servidor, orçamento de FPS/draw calls verificado em CI, nem testes de navegador headless.

## O que existe no lugar

### Auditoria automática de itens de personagem (`client/dev/audit.ts`)

Checklist do guia de estilo automatizado, aberto no laboratório de personagens: `tools/lab-personagens.html?audit=1[&category=<categoria>]` (via Vite em dev). Para cada item "pronto" do catálogo, em ambos os corpos e nos 3 LODs:

- **Orçamento de triângulos** por categoria no LOD0 (`BUDGETS`), ex.: `cabelo` 100–800, `camiseta` 200–900, `jaqueta` 300–1000, `calcado` 0–450; itens que ocupam mais slots ganham +300 por slot extra, e luvas completas recuperam ~130 por mão.
- **LOD2 mais pesado que LOD0** → problema.
- Geometria quebrada (NaN, >5% de triângulos degenerados), peças "fora do corpo" ou rígidas maiores que 1,2 m.
- Canais de cor fora do catálogo; entrada ausente no registro.

Saída: tabela HTML com problemas (vermelho) e notas (âmbar) e um resumo por categoria. Itens em GLB não são auditados. Ver [[Character Models]].

### Medição manual no jogo

- Overlay **F3** e `window.__oc.perf()` (dev) — ver [[Performance Overview]].
- O `README.md` cita uma varredura de 260 mil ticks de movimento (3.374 travas → 0); a ferramenta não está no repositório (`unknown`).
- O comentário de `client/main.ts` diz que `window.__oc` existe "para testes de fumaça automatizados", mas nenhum script desses testes está no repositório (`unknown`).
- **Troca de arma (PF-34):** medição feita com Chrome headless (playwright-core, GPU real) no campo de tiro: 50 trocas por `__oc.input.press('swapWeapon', …)`, maior `id` de `__oc.ctx.renderer.info.programs` antes e depois (programas WebGL novos) e p95/máximo dos intervalos de `requestAnimationFrame`, parado e trocando; controle com a submetralhadora de secundária (trocada por `__oc.guns.secundaria.setData`). O script ficou fora do repositório; o procedimento e os números estão em [[Known Bottlenecks]].

### Guarda estrutural sem navegador

`client/tests/viewmodelSwitch.test.ts` ([[Unit Tests]]) não mede tempo, mas garante a causa da PF-34: 50 trocas entre rifle, pistola, submetralhadora e revólver não criam nem descartam material ou geometria no viewmodel, então não há shader a recompilar numa troca.

## Sugestão de medição repetível (inferência)

Os pontos de medição já existentes (`__oc.perf()`, `renderer.info`, `map.stats`) permitiriam um teste em navegador headless que carregue cada mapa e registre `mapBuildMs`, draw calls e triângulos — não implementado.

## Código relacionado

- `client/dev/audit.ts`, `client/dev/characterLab.ts`, `tools/lab-personagens.html`
- `client/main.ts` (`__oc.perf`)

Ver também: [[Known Bottlenecks]], [[Testing Overview]].
