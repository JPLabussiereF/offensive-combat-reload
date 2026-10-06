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

As conquistas são um **álbum de figurinhas**. Cada figurinha tem **um desenho** e até **quatro acabamentos**, um por meta do mesmo número: **Comum → Brilhante → Holográfica → Dourada**. A última meta é sempre a Dourada: com menos metas, os primeiros acabamentos são pulados (uma figurinha de meta única, como Fora do Mapa, já sai Dourada).

- Um **contador** (abates, opressões, reanimações...) continua contando depois da Dourada, e cada nova volta inteira na última meta aparece como **repetidas** (×2, ×3...).
- Um **recorde** (nível da conta, melhor onda, armas no máximo) termina na Dourada.

Proposta completa e fases na issue #25 do repositório. Este documento descreve o que existe hoje: a **fase 1** (figurinhas derivadas das estatísticas) e a **fase 2** (contadores próprios e o aviso no jogo). São 43 figurinhas em 8 páginas.

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
| Zumbi | Caça-Chefes | golpe final em **cada** chefe (vale o menos caçado) | recorde | 1 |
| Zumbi | Anjo da Guarda | reanimações | contador | 10 · 50 · 200 · 1000 |
| Zumbi | Apostador | giros no caixão | contador | 5 · 25 · 100 · 400 |
| Vexames | Saco de Pancada | mortes no versus | contador | 50 · 250 · 1000 · 5000 |
| Vexames | Beijando o Chão | quedas no zumbi | contador | 10 · 50 · 200 · 1000 |

## Fase 2: contadores próprios

Figurinhas com `fonte: "propria"`: o servidor conta no momento do evento (`stickerAdd` soma, `stickerMax` guarda o recorde) e grava em `achievement_progress` no flush ([[Save System]]). Coleções (`itens`) têm um contador por item (`id:item`) e vale o item menos juntado. Só online, só o que o servidor confere.

| Página | Figurinha | Como conta (servidor) | Tipo | Metas |
| --- | --- | --- | --- | --- |
| Opressão | Oprimido | a vítima de uma opressão completa (se ainda estiver na sala) | contador | 3 · 20 · 80 · 300 |
| Opressão | Troco | oprimir quem te oprimiu por último (`lastOppressor`) | contador | 1 · 5 · 20 · 80 |
| Opressão | Oportunista | oprimir um corpo que outro jogador fez (`Corpse.killer`) | contador | 1 · 10 · 25 · 50 |
| Opressão | Chutando Cachorro Morto | oprimir um corpo sem assassino (queda, vazio, Amora, a própria granada) | contador | 1 · 3 · 5 · 10 |
| Opressão | No Último Segundo | começar a dancinha com 1 s ou menos de janela no corpo (`dance.left`) | contador | 1 · 5 · 10 · 20 |
| Opressão | Davi contra Golias | oprimir alguém com 10 abates ou mais à sua frente na partida (`kills` da sessão) | contador | 1 · 2 · 3 |
| Opressão | Pé de Valsa | coleção: opressões em cada mapa versus (`rua`, `jardim`, `halloween`) | recorde | 1 · 3 · 5 · 10 |
| Opressão | Estraga-Prazer | matar alguém no meio da dancinha | contador | 1 · 10 · 25 · 50 |
| Sequências | Embalado | abates sem morrer (`streak`; recorde) | recorde | 3 · 5 · 10 · 15 |
| Sequências | Combo | abates seguidos com até 4 s entre eles (`combo`; recorde) | recorde | 2 · 3 · 4 · 5 |
| Sequências | Vingança | matar quem te matou por último (`lastKiller`) | contador | 5 · 25 · 100 · 400 |
| Sequências | Estraga-Sequência | matar quem estava com 5 abates ou mais sem morrer | contador | 1 · 5 · 10 · 15 |
| Cardápio | Scooby-Dooby-Doo! | comer o biscoito com 30 de vida ou menos e matar em até 10 s (uma vez por biscoito) | contador | 1 · 5 · 10 · 20 |
| Cardápio | Humanidade Restaurada | abates com a humanidade do rato | contador | 5 · 25 · 100 · 200 |
| Cardápio | Cereja do Bolo | abates com a vida extra da cereja | contador | 5 · 15 · 30 · 50 |
| Cardápio | Saúde! Hic! | abates sob a poção bêbado | contador | 1 · 5 · 15 · 30 |
| Cardápio | Provador da Bruxa | coleção: cada uma das 5 poções | recorde | 1 · 2 · 3 · 5 |
| Cardápio | Pescador | carpas acertadas a tiro ou faca ("pescar" no jogo é isso; comuns e douradas) | contador | 10 · 50 · 100 · 200 |
| Cardápio | Peixe de Ouro | carpas douradas acertadas | contador | 1 · 2 · 3 · 5 |
| Corrida Armada | Corredor | rodadas vencidas | contador | 1 · 5 · 20 · 50 |
| Corrida Armada | Volta Olímpica | vencer a rodada sem ter morrido nela | recorde | 1 |
| Corrida Armada | Esfaqueador | rebaixar alguém um degrau na faca | contador | 5 · 25 · 100 · 400 |
| Vexames | Gravidade 1 × 0 Você | morrer de queda | contador | 1 · 3 · 5 · 10 |
| Vexames | Fora do Mapa | cair no vazio | recorde | 1 |
| Vexames | Amora Mandou Lembranças | mordido pela Amora | contador | 1 · 3 · 5 · 10 |
| Vexames | Tiro no Pé | morrer com a própria granada | contador | 1 · 5 · 20 · 50 |

Os eventos ficam em `server/session.ts` (`albumKill`, `albumHumiliation`, `onPickup`, `onPotion`, `onFish`, mortes sem assassino em `kill`) e em `server/modes.ts` (corrida armada). Sequência e combo são de jogador contra jogador; zerados na morte e na rodada nova. Algumas condições usam dados que o cliente informa (queda, vazio e Amora são `selfDamage`), como o resto do jogo ([[ADR - Movimento confiado ao cliente]]).

## Aviso no jogo

O `LiveAccount` guarda os totais e os contadores próprios da última gravação (`profile.totals`, `profile.album`); com o delta ainda não gravado, são os números ao vivo (`liveSources`, `liveOwn`). Uma vez por segundo, no `tick` da sessão, `stickerUps` compara o acabamento de cada figurinha com o que o jogador já sabe (`stickerTiers`, calculado no login) e manda `figurinha {id, nivel}` só ao dono. Vale para todas, derivadas e próprias, inclusive as do zumbi. O cliente mostra a faixa "🎯 Figurinha Brilhante: Na Testa!" (uma por vez, em fila) com o som de subir de nível. Repetidas não geram aviso.

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
- **Clique no cartão:** detalhe com "como pegar" (com a próxima meta), a barra com o número, o andamento de cada item numa coleção (cada poção, cada mapa), as metas com as ganhas marcadas e as repetidas.
- **Acabamentos, só CSS** (`client/styles.css`, bloco "Album"):
  - Brilhante: faixa de luz passando;
  - Holográfica: `conic-gradient` girando com `mix-blend-mode: color-dodge`, mais a faixa de luz;
  - Dourada: gradiente dourado no desenho e no cartão.
  
  Com `prefers-reduced-motion`, as animações param.

## Dados e código

- `shared/data/conquistas.json`:
  - **páginas:** id, ícone, cor, nome pt/en;
  - **figurinhas:** id, página, ícone, `tipo` (`contador` | `recorde`), `fonte` (um número da conta ou `propria`), `itens` opcional (coleção: `id` e `nome` pt/en de cada item), de 1 a 4 `metas` (a última é a Dourada), `formato` opcional (`horas`), `nome` e `como` em pt/en: `{meta}` é a próxima meta e `{um|vários}` escolhe a palavra pelo número (`{vez|vezes}`); com meta única o texto pode dispensar o número.
- `shared/achievements.ts`:
  - `tierOf`, `finishOf` (acabamento pelo número de metas alcançadas), `stickerState` (acabamento, repetidas, próxima meta), `album`, `albumCount` (por página ou total), `fillHow` (texto com meta e plural), `itemProgress` (andamento de cada item de coleção);
  - `sourcesFromProfile` / `sourcesFromTotals` (perfil ou totais → números do álbum), `tiersOf`, `stickerById`;
  - `albumProblems` (validação dos dados, usada nos testes).
- `client/ui/album.ts`: `showAlbum` busca o perfil (com `album`, os contadores próprios), monta as páginas e os cartões; a página aberta fica guardada enquanto a tela inicial está aberta. `stickerUpText` monta a faixa do aviso.
- Servidor: `server/progress.ts` (`stickerAdd`, `stickerMax`, `liveSources`, `liveOwn`, `settle`, `countEntry`, `stickerUps`), `server/accounts.ts` (`achievement_progress` no perfil, no login e no flush), migration `005_figurinhas.sql`.
- Testes: `server/tests/album.test.ts` (dados, acabamentos, repetidas, recordes, coleções, contagem e o mapeamento do perfil) e `server/tests/albumSession.test.ts` (eventos numa sessão de relógio falso; aviso, gravação e perfil no servidor real).

## Ainda não existe (fases seguintes da proposta)

- **Figurinha em destaque e título** no Perfil, no placar e na tela de morte.
- **Recompensas por página.**
- Figurinhas ocultas.
- Datas em que cada acabamento foi pego (só o número é guardado).

## Notas relacionadas

[[Progression]] · [[Player Data]] · [[Menus]] · [[Zombie]] · [[Humiliation]]
