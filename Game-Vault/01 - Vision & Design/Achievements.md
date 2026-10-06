---
title: Achievements
type: system
status: documented
area: design
source_paths:
  - shared/achievements.ts
  - shared/data/conquistas.json
  - client/ui/album.ts
  - client/ui/home.ts
  - client/styles.css
  - server/tests/album.test.ts
tags:
  - game
  - design
  - progression
  - achievements
updated: 2026-10-06
---

# Achievements (Álbum de figurinhas)

As conquistas são um **álbum de figurinhas**. Cada figurinha tem **um desenho** e **quatro acabamentos**, um por meta do mesmo número: **Comum → Brilhante → Holográfica → Dourada**.

- Um **contador** (abates, opressões, reanimações...) continua contando depois da Dourada, e cada nova volta inteira na última meta aparece como **repetidas** (×2, ×3...).
- Um **recorde** (nível da conta, melhor onda, armas no máximo) termina na Dourada.

Proposta completa e fases na issue #25 do repositório. Este documento descreve o que existe hoje, a **fase 1**.

## Fase 1: figurinhas derivadas

Todas as figurinhas da fase 1 saem de números que a conta **já guarda**: `player_stats`, `weapon_progress` e `zombie_stats` ([[Player Data]]).
- **Nada novo é gravado.** O álbum é calculado a partir do `GET /api/perfil` (`sourcesFromProfile`).
- **Retroativo:** contas antigas já abrem o álbum com o que conquistaram.
- **Só online:** como o resto do progresso, o modo offline não conta ([[Progression]]).

| Página | Figurinha | Fonte | Tipo | Metas |
| --- | --- | --- | --- | --- |
| Carreira | Endereço Fixo | nível da conta | recorde | 5 · 15 · 30 · 50 |
| Carreira | Bate-Ponto | tempo jogado online | contador | 1 h · 10 h · 50 h · 200 h |
| Carreira | Morador Assíduo | entradas em sala (`matches_played`) | contador | 10 · 50 · 200 · 1000 |
| Carreira | Oficina do Seu Zé | armas com todas as melhorias (`MAX_LEVELS`) | recorde | 1 · 2 · 3 · 5 |
| Jeitos de matar | Vizinho Perigoso | abates | contador | 50 · 250 · 1000 · 5000 |
| Jeitos de matar | Na Testa | tiros na cabeça | contador | 25 · 150 · 600 · 2500 |
| Jeitos de matar | No Pássaro! | abates na virilha | contador | 5 · 30 · 120 · 500 |
| Jeitos de matar | Facada | abates de faca | contador | 10 · 50 · 200 · 800 |
| Jeitos de matar | Pelas Costas | facadas pelas costas | contador | 5 · 25 · 100 · 400 |
| Jeitos de matar | Lançador | abates com granada | contador | 10 · 50 · 200 · 800 |
| Opressão | Opressor | opressões ([[Humiliation]]) | contador | 3 · 20 · 80 · 300 |
| Zumbi | Sobrevivente | vitórias | contador | 1 · 5 · 20 · 50 |
| Zumbi | Até Onde Der | melhor onda | recorde | 4 · 8 · 10 · 12 |
| Zumbi | Faxina | zumbis abatidos | contador | 100 · 500 · 2000 · 10000 |
| Zumbi | Caça-Chefes | golpe final em **cada** chefe (vale o menos caçado) | recorde | 1 · 5 · 20 · 50 |
| Zumbi | Anjo da Guarda | reanimações | contador | 10 · 50 · 200 · 1000 |
| Zumbi | Apostador | giros no caixão | contador | 5 · 25 · 100 · 400 |
| Vexames | Saco de Pancada | mortes no versus | contador | 50 · 250 · 1000 · 5000 |
| Vexames | Beijando o Chão | quedas no zumbi | contador | 10 · 50 · 200 · 1000 |

## Tela

- **Aba Álbum** na tela inicial logada ([[Menus]]):
  - cabeçalho com "X de N figurinhas · Y de 4N acabamentos";
  - páginas como botões, cada uma com o quanto já colou;
  - grade de cartões.
- **Cartão:**
  - desenho (ícone sobre a cor da página);
  - nome;
  - quatro bolinhas (acabamentos ganhos);
  - barra da meta anterior até a próxima;
  - o número ("812 / 1200", ou "Completa!").
- **Figurinha não colada:** borda tracejada, desenho apagado.
- **Clique no cartão:** detalhe com "como pegar" (com a próxima meta), as quatro metas com as ganhas marcadas e as repetidas.
- **Acabamentos, só CSS** (`client/styles.css`, bloco "Album"):
  - Brilhante: faixa de luz passando;
  - Holográfica: `conic-gradient` girando com `mix-blend-mode: color-dodge`, mais a faixa de luz;
  - Dourada: gradiente dourado no desenho e no cartão.
  
  Com `prefers-reduced-motion`, as animações param.

## Dados e código

- `shared/data/conquistas.json`:
  - **páginas:** id, ícone, cor, nome pt/en;
  - **figurinhas:** id, página, ícone, `tipo` (`contador` | `recorde`), `fonte`, 4 `metas`, `formato` opcional (`horas`), `nome` e `como` em pt/en, com `{meta}` para a próxima meta.
- `shared/achievements.ts`:
  - `tierOf`, `stickerState` (acabamento, repetidas, próxima meta), `album`, `albumCount` (por página ou total);
  - `sourcesFromProfile` (`ProfileResponse` → números do álbum);
  - `albumProblems` (validação dos dados, usada nos testes).
- `client/ui/album.ts`: `showAlbum` busca o perfil, monta as páginas e os cartões; a página aberta fica guardada enquanto a tela inicial está aberta.
- Testes: `server/tests/album.test.ts` (dados, acabamentos, repetidas, recordes, contagem e o mapeamento do perfil).

## Ainda não existe (fases seguintes da proposta)

- **Contadores próprios** (sequências, combos, buffs, corrida armada, mapas, opressões detalhadas): precisam de uma tabela própria e do servidor detectar o momento.
- **Aviso "Figurinha nova!"** no jogo.
- **Figurinha em destaque e título** no Perfil, no placar e na tela de morte.
- **Recompensas por página.**
- Figurinhas ocultas.

## Notas relacionadas

[[Progression]] · [[Player Data]] · [[Menus]] · [[Zombie]] · [[Humiliation]]
